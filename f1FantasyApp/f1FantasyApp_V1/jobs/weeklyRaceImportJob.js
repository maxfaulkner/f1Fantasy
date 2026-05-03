// jobs/weeklyRaceImportJob.js
const schedule = require('node-schedule');
const fetch = require('node-fetch');
const prisma = require('../prisma');
const f1DataService = require('../services/f1DataService');
const pricingEngine = require('../services/pricingEngine');
const mailer = require('../services/mailer');
const { DEFAULT_BUDGET } = require('../constants');

const JOLPICA_API = 'https://api.jolpi.ca/ergast/f1';

// In-memory schedule cache — populated on startup
let cachedRaces = [];

/**
 * Returns true if qualifying has started but the race hasn't finished yet for this round.
 * Lazily fetches the schedule if the cache is empty (e.g. startup fetch failed).
 */
async function isRoundLocked(round) {
  if (cachedRaces.length === 0) {
    try {
      cachedRaces = await fetchRaceSchedule(new Date().getFullYear());
    } catch {
      return false;
    }
  }
  const race = cachedRaces.find(r => parseInt(r.round) === round);
  if (!race || !race.Qualifying) return false;
  const now = new Date();
  const qualiTime = new Date(`${race.Qualifying.date}T${race.Qualifying.time}`);
  const raceEnd = new Date(`${race.date}T${race.time || '14:00:00Z'}`);
  raceEnd.setTime(raceEnd.getTime() + 2 * 60 * 60 * 1000);
  return qualiTime <= now && raceEnd > now;
}

async function fetchRaceSchedule(season) {
  const res = await fetch(`${JOLPICA_API}/${season}.json`);
  if (!res.ok) throw new Error(`Failed to fetch schedule: ${res.status}`);
  const data = await res.json();
  return data.MRData.RaceTable.Races;
}

/**
 * Schedule team locks and result imports for every race this season.
 * Called once at server startup.
 */
async function startWeeklyRaceImportJob() {
  const season = new Date().getFullYear();
  const now = new Date();

  let races;
  try {
    races = await fetchRaceSchedule(season);
    cachedRaces = races;
    console.log(`Fetched ${races.length}-race schedule for ${season}`);
  } catch (err) {
    console.error('Could not fetch F1 schedule:', err.message);
    return;
  }

  for (const race of races) {
    const round = parseInt(race.round);

    // Team lock: at qualifying start
    if (race.Qualifying) {
      const qualiStart = new Date(`${race.Qualifying.date}T${race.Qualifying.time}`);
      const lockTime = qualiStart;

      if (lockTime > now) {
        schedule.scheduleJob(`lock-r${round}`, lockTime, async () => {
          console.log(`Locking teams for round ${round}...`);
          await lockTeamsForRound(round).catch(err =>
            console.error(`Round ${round} team lock failed:`, err.message)
          );
        });
        console.log(`  Round ${round}: lock at ${lockTime.toUTCString()}`);
      } else {
        // Qualifying already passed — lock teams now in case server was restarted mid-weekend
        const thisRaceEnd = new Date(new Date(`${race.date}T${race.time || '14:00:00Z'}`).getTime() + 2 * 60 * 60 * 1000);
        if (thisRaceEnd > now) {
          console.log(`  Round ${round}: qualifying already passed, locking teams now`);
          lockTeamsForRound(round).catch(err =>
            console.error(`  Round ${round} catch-up lock failed:`, err.message)
          );
        }
      }
    }

    // Result import: 2 hours after race start, with retries
    const raceStart = new Date(`${race.date}T${race.time || '14:00:00Z'}`);
    const importTime = new Date(raceStart.getTime() + 2 * 60 * 60 * 1000); // +2 hours

    if (importTime > now) {
      schedule.scheduleJob(`import-r${round}`, importTime, async () => {
        console.log(`\n=== Auto-importing results for round ${round} ===`);
        await importRaceResults(season, round);
      });
      console.log(`  Round ${round}: import at ${importTime.toUTCString()}`);
    } else {
      // Race already happened — check if results are missing and import now
      const existingResults = await prisma.raceResult.count({ where: { week: round } });
      if (existingResults === 0) {
        console.log(`  Round ${round}: past race with no results — attempting import now`);
        importRaceResults(season, round).catch(err =>
          console.error(`  Round ${round} catch-up import failed:`, err.message)
        );
      }
    }
  }
}

/**
 * Lock all teams across all leagues for a given round
 */
async function lockTeamsForRound(round) {
  const result = await prisma.userWeeklyTeam.updateMany({
    where: { week: round },
    data: { locked: true },
  });
  console.log(`Locked ${result.count} teams for round ${round}`);
}

/**
 * Fetch race results from API and process for all leagues
 */
async function importRaceResults(season, round) {
  const leagues = await prisma.league.findMany();
  if (leagues.length === 0) {
    console.log('No leagues to update');
    return;
  }

  // Fetch results once (same for all leagues)
  const adminEmail = leagues[0].adminEmail;
  const results = await f1DataService.fetchRaceResultsWithRetries(season, round, adminEmail);

  if (!results) {
    console.log(`Round ${round}: all retries exhausted, admin notified`);
    return;
  }

  for (const league of leagues) {
    // Skip if this round is before the league's starting round
    if (round < league.startingRound) continue;

    // Skip if already imported
    const existing = await prisma.raceResult.count({
      where: { leagueId: league.id, week: round },
    });
    if (existing > 0) {
      console.log(`Round ${round} already imported for league ${league.name}`);
      continue;
    }

    console.log(`Processing round ${round} for league: ${league.name}`);
    const { savedResults, failedResults } = await f1DataService.processRaceResults(
      league.id, round, season, results
    );

    if (failedResults.length > 0) {
      console.warn(`  ${failedResults.length} drivers not matched:`, failedResults.map(f => f.driverName));
    }

    // Update prices for next week
    await pricingEngine.processPricingAfterRace(league.id, round);

    // Unlock teams for next round
    await prisma.userWeeklyTeam.updateMany({
      where: { leagueId: league.id, week: round + 1 },
      data: { locked: false },
    });

    // Notify members to pick next week's team
    const members = await prisma.leagueUser.findMany({
      where: { leagueId: league.id },
      include: { user: true },
    });
    for (const m of members) {
      await mailer.sendTeamPickReminder(m.user.email, {
        leagueName: league.name,
        week: round + 1,
        budget: DEFAULT_BUDGET,
      }).catch(() => {}); // don't fail the import if email fails
    }

    console.log(`  Round ${round} done: ${savedResults.length} results saved`);
  }
}

/**
 * Manual trigger: import a specific round right now (for testing or recovery)
 */
async function triggerRaceImportNow(season, round) {
  console.log(`Manual trigger: round ${round}, season ${season}`);
  await importRaceResults(season, round);
}

let lastCatchUpCheck = 0;

/**
 * Check all past rounds and import any that are missing results.
 * Called non-blocking after login. Rate-limited to once per 5 minutes.
 */
async function checkAndImportPastRounds() {
  if (Date.now() - lastCatchUpCheck < 5 * 60 * 1000) return;
  lastCatchUpCheck = Date.now();

  const now = new Date();
  const season = now.getFullYear();

  for (const race of cachedRaces) {
    const raceEnd = new Date(
      new Date(`${race.date}T${race.time || '14:00:00Z'}`).getTime() + 3 * 60 * 60 * 1000
    );
    if (raceEnd < now) {
      await importRaceResults(season, parseInt(race.round));
    }
  }
}

module.exports = {
  startWeeklyRaceImportJob,
  triggerRaceImportNow,
  checkAndImportPastRounds,
  isRoundLocked,
};
