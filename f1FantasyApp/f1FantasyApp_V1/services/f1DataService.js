// services/f1DataService.js
const fetch = require('node-fetch');
const prisma = require('../prisma');
const mailer = require('./mailer');
const { F1_POINTS, SPRINT_POINTS } = require('../constants');

const ERGAST_API = 'https://api.jolpi.ca/ergast/f1'; // Jolpica (Ergast replacement, same URL structure)

/**
 * Fetch race results from Ergast API
 * Returns: { driverId, finishingPosition, points }
 */
async function fetchRaceResults(season, round) {
  try {
    const url = `${ERGAST_API}/${season}/${round}/results.json`;
    console.log(`Fetching F1 data from: ${url}`);

    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    if (!data.MRData.RaceTable.Races || data.MRData.RaceTable.Races.length === 0) {
      throw new Error('No race data found');
    }

    const race = data.MRData.RaceTable.Races[0];
    const results = [];

    for (const result of race.Results) {
      results.push({
        f1Id: result.Driver.driverId,
        finishingPosition: parseInt(result.position),
        points: parseInt(result.points),
        driverName: `${result.Driver.givenName} ${result.Driver.familyName}`,
      });
    }

    return results;
  } catch (error) {
    console.error('Error fetching from Ergast API:', error.message);
    throw error;
  }
}

/**
 * Fetch sprint race results from Ergast API
 * Returns: { driverId, finishingPosition, points }
 */
async function fetchSprintResults(season, round) {
  try {
    const url = `${ERGAST_API}/${season}/${round}/sprint.json`;
    console.log(`Fetching sprint data from: ${url}`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const data = await response.json();
    if (!data.MRData.RaceTable.Races || data.MRData.RaceTable.Races.length === 0) {
      throw new Error('No sprint data found');
    }

    const race = data.MRData.RaceTable.Races[0];
    if (!race.SprintResults || race.SprintResults.length === 0) {
      throw new Error('No sprint results found');
    }

    const results = [];
    for (const result of race.SprintResults) {
      results.push({
        f1Id: result.Driver.driverId,
        finishingPosition: parseInt(result.position),
        points: parseInt(result.points),
        driverName: `${result.Driver.givenName} ${result.Driver.familyName}`,
      });
    }

    return results;
  } catch (error) {
    console.error('Error fetching sprint results:', error.message);
    throw error;
  }
}

/**
 * Retry logic: Try up to 5 times with staggered timing
 * Retries at: 0, +9min, +20min, +34min, +51min
 */
async function fetchRaceResultsWithRetries(season, round, adminEmail) {
  const retrySchedule = [0, 9, 20, 34, 51]; // minutes
  let lastError;

  for (let i = 0; i < retrySchedule.length; i++) {
    const delayMinutes = retrySchedule[i];

    if (i > 0) {
      const delayMs = delayMinutes * 60 * 1000;
      console.log(`Retry ${i}: Waiting ${delayMinutes} minutes before next attempt...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    try {
      console.log(`Attempt ${i + 1} to fetch race results...`);
      const results = await fetchRaceResults(season, round);
      console.log(`✓ Successfully fetched race results after ${i + 1} attempt(s)`);
      return results;
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${i + 1} failed:`, error.message);
    }
  }

  // All retries exhausted
  console.error('All retry attempts failed. Notifying admin...');
  await mailer.sendAdminNotification(adminEmail, {
    subject: 'Fantasy F1: Manual Race Entry Required',
    round,
    season,
    error: lastError.message,
  });

  return null; // Signal to use manual entry
}

/**
 * Map F1 API driver ID to our database driver
 */
async function mapF1DriverToLocal(f1Id, season, round) {
  // First try direct match
  let driver = await prisma.driver.findUnique({
    where: { f1Id },
  });

  if (!driver) {
    // If not found, you might want to log this and fetch from API to create new driver
    console.warn(`Driver with F1 ID ${f1Id} not found in database`);
    return null;
  }

  return driver;
}

/**
 * Process race results: validate and save to database
 * Calculates F1 points (25 for 1st, 18 for 2nd, etc.)
 * @param {Array} results - race results from fetchRaceResults / fetchSprintResults
 * @param {object} opts
 * @param {boolean} opts.isSprint - use sprint points scale (8/7/6/5/4/3/2/1)
 * @param {Array}  opts.sprintResults - if provided, add sprint bonus on top of race points
 */
async function processRaceResults(leagueId, raceWeek, season, results, { isSprint = false, sprintResults = null } = {}) {
  console.log(`Processing ${results.length} ${isSprint ? 'sprint' : 'race'} results for league ${leagueId}, week ${raceWeek}`);

  const pointsTable = isSprint ? SPRINT_POINTS : F1_POINTS;

  // Build sprint bonus map (extra points to add when processing a main race on a sprint weekend)
  const sprintBonus = {};
  if (sprintResults) {
    for (const s of sprintResults) {
      sprintBonus[s.f1Id] = SPRINT_POINTS[s.finishingPosition] || 0;
    }
  }

  const savedResults = [];
  const failedResults = [];

  for (const result of results) {
    try {
      const driver = await mapF1DriverToLocal(result.f1Id);

      if (!driver) {
        failedResults.push({
          f1Id: result.f1Id,
          driverName: result.driverName,
          reason: 'Driver not found in database',
        });
        continue;
      }

      const basePoints = pointsTable[result.finishingPosition] || 0;
      const points = basePoints + (sprintBonus[result.f1Id] || 0);

      const saved = await prisma.raceResult.create({
        data: {
          leagueId,
          week: raceWeek,
          driverId: driver.id,
          finishingPosition: result.finishingPosition,
          points,
        },
      });

      savedResults.push(saved);
    } catch (error) {
      failedResults.push({
        f1Id: result.f1Id,
        driverName: result.driverName,
        reason: error.message,
      });
    }
  }

  // Calculate constructor points (sum of both drivers)
  const constructors = await prisma.constructor.findMany({
    include: { drivers: true },
  });

  for (const constructor of constructors) {
    const driverResults = savedResults.filter(r =>
      constructor.drivers.some(d => d.id === r.driverId)
    );

    if (driverResults.length > 0) {
      const totalPoints = driverResults.reduce((sum, r) => sum + r.points, 0);

      await prisma.constructorRaceResult.create({
        data: {
          leagueId,
          week: raceWeek,
          constructorId: constructor.id,
          totalPoints,
        },
      });
    }
  }

  console.log(`Saved ${savedResults.length} results, ${failedResults.length} failed`);

  return { savedResults, failedResults };
}

/**
 * Fetch real-world WCC constructor standings from Jolpica
 * Returns: [{ position, constructorId, name, points, wins }]
 */
async function fetchConstructorStandings(season) {
  try {
    const url = `${ERGAST_API}/${season}/constructorStandings.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const data = await response.json();
    const lists = data?.MRData?.StandingsTable?.StandingsLists;
    if (!lists || lists.length === 0) return [];

    return lists[0].ConstructorStandings.map(s => ({
      position: parseInt(s.position),
      constructorId: s.Constructor.constructorId,
      name: s.Constructor.name,
      points: parseFloat(s.points),
      wins: parseInt(s.wins),
    }));
  } catch (error) {
    console.error('Error fetching constructor standings:', error.message);
    throw error;
  }
}

module.exports = {
  fetchRaceResults,
  fetchSprintResults,
  fetchRaceResultsWithRetries,
  mapF1DriverToLocal,
  processRaceResults,
  fetchConstructorStandings,
};
