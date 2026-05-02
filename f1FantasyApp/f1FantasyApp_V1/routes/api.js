// routes/api.js
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');
const prisma = require('../prisma');
const f1DataService = require('../services/f1DataService');
const pricingEngine = require('../services/pricingEngine');
const authMiddleware = require('../middleware/auth');
const { isRoundLocked } = require('../jobs/weeklyRaceImportJob');
const { checkAchievementsAfterRace } = require('../services/achievementService');
const { sendPushToUsers } = require('../services/pushNotificationService');

// Notify all members of a league that results were imported
async function notifyResultsImported(leagueId, round, leagueName, eventLabel) {
  try {
    const members = await prisma.leagueUser.findMany({
      where: { leagueId },
      select: { userId: true },
    });
    await prisma.notification.createMany({
      data: members.map(m => ({
        userId: m.userId,
        type: 'result_imported',
        title: `Results imported — ${leagueName}`,
        body: `${eventLabel} results are now available. Check the leaderboard!`,
        data: { leagueId, round },
      })),
      skipDuplicates: true,
    });

    // Send APNs push notifications to all league members with a push token
    const userIds = members.map(m => m.userId);
    await sendPushToUsers(userIds, {
      title: `Results imported — ${leagueName}`,
      body: `${eventLabel} results are now available. Check the leaderboard!`,
      data: { leagueId, round, type: 'result_imported' },
    }, prisma);
  } catch (e) {
    console.error('Notify results error:', e);
  }
}

// Generate or update H2H matchups for a league after results import
async function generateH2HMatchups(leagueId, week) {
  try {
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league || league.leagueType !== 'h2h') return;

    // Get all users in the league
    const members = await prisma.leagueUser.findMany({
      where: { leagueId },
      select: { userId: true },
    });
    if (members.length < 2) return;

    // Calculate round scores for all users
    const roundScores = [];
    for (const m of members) {
      const team = await prisma.userWeeklyTeam.findUnique({
        where: { userId_leagueId_week: { userId: m.userId, leagueId, week } },
        include: { drivers: true, constructors: true },
      });
      if (!team) { roundScores.push({ userId: m.userId, points: 0 }); continue; }
      let pts = 0;
      for (const td of team.drivers) {
        const rs = await prisma.raceResult.findMany({ where: { driverId: td.driverId, leagueId, week } });
        for (const r of rs) {
          let p = r.points;
          if (team.chipUsed === 'no_negative' && p < 0) p = 0;
          if (team.captainId === td.driverId) p *= team.chipUsed === 'triple_captain' ? 3 : 2;
          pts += p;
        }
      }
      const ctor = team.constructors[0];
      if (ctor) {
        const cr = await prisma.constructorRaceResult.findFirst({ where: { constructorId: ctor.constructorId, leagueId, week } });
        if (cr) pts += cr.totalPoints;
      }
      roundScores.push({ userId: m.userId, points: pts });
    }

    // Check if matchups already exist for this week
    const existing = await prisma.h2HMatchup.findMany({ where: { leagueId, week } });

    if (existing.length === 0) {
      // Pair users randomly (shuffle then pair consecutive)
      const shuffled = [...roundScores].sort(() => Math.random() - 0.5);
      const pairs = [];
      for (let i = 0; i < shuffled.length - 1; i += 2) {
        pairs.push([shuffled[i], shuffled[i + 1]]);
      }

      for (const [u1, u2] of pairs) {
        const winner = u1.points > u2.points ? u1.userId : u2.points > u1.points ? u2.userId : 'draw';
        await prisma.h2HMatchup.create({
          data: {
            leagueId, week,
            user1Id: u1.userId, user2Id: u2.userId,
            user1Points: u1.points, user2Points: u2.points,
            winnerId: winner,
          },
        });
      }
    } else {
      // Update existing matchups with actual scores
      const scoreMap = Object.fromEntries(roundScores.map(s => [s.userId, s.points]));
      for (const m of existing) {
        const u1pts = scoreMap[m.user1Id] ?? 0;
        const u2pts = scoreMap[m.user2Id] ?? 0;
        const winner = u1pts > u2pts ? m.user1Id : u2pts > u1pts ? m.user2Id : 'draw';
        await prisma.h2HMatchup.update({
          where: { id: m.id },
          data: { user1Points: u1pts, user2Points: u2pts, winnerId: winner },
        });
      }
    }

    console.log(`✓ H2H matchups generated/updated for league ${league.name} Round ${week}`);
  } catch (e) {
    console.error('H2H matchup generation error:', e);
  }
}

/**
 * Update the cached totalPoints and totalWins on LeagueUser for every member
 * of a league. Called after race results are imported so league-list ranks stay fresh.
 */
async function updateLeagueUserCache(leagueId) {
  try {
    const leagueUsers = await prisma.leagueUser.findMany({
      where: { leagueId },
      include: {
        user: {
          include: {
            weeklyTeams: {
              where: { leagueId },
              include: { drivers: true, constructors: true },
            },
          },
        },
      },
    });

    for (const lu of leagueUsers) {
      let totalPoints = 0;
      let totalWins = 0;
      for (const team of lu.user.weeklyTeams) {
        for (const td of team.drivers) {
          const results = await prisma.raceResult.findMany({
            where: { driverId: td.driverId, leagueId, week: team.week },
          });
          for (const r of results) {
            let pts = r.points;
            if (team.chipUsed === 'no_negative' && pts < 0) pts = 0;
            if (team.captainId === td.driverId) pts *= team.chipUsed === 'triple_captain' ? 3 : 2;
            totalPoints += pts;
            if (r.finishingPosition === 1) totalWins++;
          }
        }
        const ctor = team.constructors[0];
        if (ctor) {
          const cr = await prisma.constructorRaceResult.findFirst({
            where: { constructorId: ctor.constructorId, leagueId, week: team.week },
          });
          if (cr) totalPoints += cr.totalPoints;
        }
      }
      await prisma.leagueUser.update({
        where: { userId_leagueId: { userId: lu.userId, leagueId } },
        data: { totalPoints, totalWins },
      });
    }
  } catch (e) {
    console.error('updateLeagueUserCache error:', e);
  }
}

const checkResultsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Too many requests, please wait a minute before checking again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============ LEAGUE MANAGEMENT ============

/**
 * POST /api/leagues
 * Create a new league (creator is automatically joined as member)
 * Body: { name, season, startingRound, adminEmail }
 */
router.post('/leagues', authMiddleware, async (req, res) => {
  try {
    const { name, season, startingRound, adminEmail, description, leagueType, isPublic, maxPlayers } = req.body;
    const userId = req.user.id;

    if (!name || !season || !startingRound) {
      return res.status(400).json({ error: 'name, season, and startingRound are required' });
    }

    // Generate unique invite code
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const league = await prisma.league.create({
      data: {
        name,
        season: parseInt(season),
        startingRound: parseInt(startingRound),
        adminEmail: adminEmail || req.user.email,
        description: description || null,
        leagueType: leagueType || 'classic',
        isPublic: isPublic || false,
        maxPlayers: maxPlayers || 20,
        inviteCode,
        users: {
          create: { userId, role: 'commissioner' },
        },
      },
      include: { users: true },
    });

    // Give creator their 4 chips
    await prisma.chip.createMany({
      data: [
        { userId, leagueId: league.id, type: 'wildcard' },
        { userId, leagueId: league.id, type: 'triple_captain' },
        { userId, leagueId: league.id, type: 'no_negative' },
        { userId, leagueId: league.id, type: 'bench_boost' },
      ],
    });

    res.status(201).json(league);
  } catch (error) {
    console.error('Error creating league:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/leagues
 * List all leagues the authenticated user belongs to
 */
router.get('/leagues', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const leagueUsers = await prisma.leagueUser.findMany({
      where: { userId },
      include: {
        league: {
          include: {
            _count: { select: { users: true } },
          },
        },
      },
    });

    // For each league, compute rank from cached totalPoints across all members
    const leagueIds = leagueUsers.map(lu => lu.leagueId);
    const allMembers = await prisma.leagueUser.findMany({
      where: { leagueId: { in: leagueIds } },
      select: { leagueId: true, userId: true, totalPoints: true, totalWins: true },
    });

    // Build rank map: leagueId -> userId -> rank
    const rankMap = {};
    for (const leagueId of leagueIds) {
      const members = allMembers
        .filter(m => m.leagueId === leagueId)
        .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0) || (b.totalWins || 0) - (a.totalWins || 0));
      rankMap[leagueId] = {};
      members.forEach((m, i) => { rankMap[leagueId][m.userId] = i + 1; });
    }

    // Enrich each league with the user's role and cached stats
    res.json(leagueUsers.map(lu => ({
      ...lu.league,
      memberCount: lu.league._count.users,
      myRole: lu.role,
      myTeamName: lu.teamName,
      myTotalPoints: lu.totalPoints,
      myTotalWins: lu.totalWins,
      myRank: lu.totalPoints > 0 ? (rankMap[lu.leagueId]?.[userId] ?? null) : null,
    })));
  } catch (error) {
    console.error('Error listing leagues:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/leagues/:leagueId
 * Get a single league's details and members
 */
/**
 * GET /api/leagues/public
 * Browse public leagues
 */
router.get('/leagues/public', authMiddleware, async (req, res) => {
  try {
    const leagues = await prisma.league.findMany({
      where: { isPublic: true },
      include: {
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(leagues.map(l => ({
      ...l,
      memberCount: l._count.users,
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/leagues/:leagueId', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        users: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    if (!league) {
      return res.status(404).json({ error: 'League not found' });
    }

    res.json(league);
  } catch (error) {
    console.error('Error fetching league:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/leagues/:leagueId/join
 * Join an existing league
 */
router.post('/leagues/:leagueId/join', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const userId = req.user.id;

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) {
      return res.status(404).json({ error: 'League not found' });
    }

    const existing = await prisma.leagueUser.findUnique({
      where: { userId_leagueId: { userId, leagueId } },
    });
    if (existing) {
      return res.status(400).json({ error: 'Already a member of this league' });
    }

    await prisma.leagueUser.create({ data: { userId, leagueId } });

    // Give new member their 4 chips
    await prisma.chip.createMany({
      data: [
        { userId, leagueId, type: 'wildcard' },
        { userId, leagueId, type: 'triple_captain' },
        { userId, leagueId, type: 'no_negative' },
        { userId, leagueId, type: 'bench_boost' },
      ],
      skipDuplicates: true,
    });

    res.json({ message: 'Joined league successfully', leagueId, leagueName: league.name });
  } catch (error) {
    console.error('Error joining league:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/leagues/join-code/:code
 * Join a league via invite code
 */
router.post('/leagues/join-code/:code', authMiddleware, async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.user.id;

    const league = await prisma.league.findUnique({ where: { inviteCode: code.toUpperCase() } });
    if (!league) return res.status(404).json({ error: 'Invalid invite code' });

    const memberCount = await prisma.leagueUser.count({ where: { leagueId: league.id } });
    if (memberCount >= league.maxPlayers) {
      return res.status(400).json({ error: 'League is full' });
    }

    const existing = await prisma.leagueUser.findUnique({
      where: { userId_leagueId: { userId, leagueId: league.id } },
    });
    if (existing) return res.status(400).json({ error: 'Already a member' });

    await prisma.leagueUser.create({ data: { userId, leagueId: league.id } });
    await prisma.chip.createMany({
      data: [
        { userId, leagueId: league.id, type: 'wildcard' },
        { userId, leagueId: league.id, type: 'triple_captain' },
        { userId, leagueId: league.id, type: 'no_negative' },
        { userId, leagueId: league.id, type: 'bench_boost' },
      ],
      skipDuplicates: true,
    });

    res.json({ message: 'Joined league successfully', leagueId: league.id, leagueName: league.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ TEAM SELECTION ============

/**
 * GET /api/leagues/:leagueId/team/:week
 * Get current team for user in a specific week
 */
router.get(
  '/leagues/:leagueId/team/:week',
  authMiddleware,
  async (req, res) => {
    try {
      const { leagueId, week } = req.params;
      const userId = req.user.id;

      const weekNum = parseInt(week);
      const team = await prisma.userWeeklyTeam.findUnique({
        where: {
          userId_leagueId_week: {
            userId,
            leagueId,
            week: weekNum,
          },
        },
        include: {
          drivers: {
            include: {
              driver: { include: { constructor: true } },
            },
          },
          constructors: {
            include: {
              constructor: true,
            },
          },
        },
      });

      if (!team) {
        return res.status(404).json({ error: 'Team not found' });
      }

      // Attach race results per driver for points breakdown
      const enrichedDrivers = await Promise.all(team.drivers.map(async td => {
        const results = await prisma.raceResult.findMany({
          where: { driverId: td.driverId, leagueId, week: weekNum },
        });
        let roundPoints = results.reduce((sum, r) => sum + r.points, 0);
        let isCaptain = team.captainId === td.driverId;
        if (isCaptain) roundPoints *= team.chipUsed === 'triple_captain' ? 3 : 2;
        if (team.chipUsed === 'no_negative' && roundPoints < 0) roundPoints = 0;
        return { ...td, roundPoints, results };
      }));

      const constructorResult = team.constructors[0] ? await prisma.constructorRaceResult.findMany({
        where: { constructorId: team.constructors[0].constructorId, leagueId, week: weekNum },
      }) : [];
      const constructorRoundPoints = constructorResult.reduce((sum, r) => sum + r.totalPoints, 0);
      const enrichedConstructors = team.constructors.map((c, i) => ({
        ...c, roundPoints: i === 0 ? constructorRoundPoints : 0,
      }));

      const totalRoundPoints = enrichedDrivers.reduce((s, d) => s + d.roundPoints, 0) + constructorRoundPoints;

      res.json({ ...team, drivers: enrichedDrivers, constructors: enrichedConstructors, totalRoundPoints });
    } catch (error) {
      console.error('Error fetching team:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/leagues/:leagueId/team/:week
 * Submit team for a week (5 drivers + 1 constructor)
 * Body: { drivers: [driverId], constructorId }
 */
router.post(
  '/leagues/:leagueId/team/:week',
  authMiddleware,
  async (req, res) => {
    try {
      const { leagueId, week } = req.params;
      const { drivers, constructorId, captainId, chipUsed } = req.body;
      const userId = req.user.id;
      const weekNum = parseInt(week);

      // Validation
      if (!drivers || drivers.length !== 5) {
        return res.status(400).json({ error: 'Must select exactly 5 drivers' });
      }
      if (!constructorId) {
        return res.status(400).json({ error: 'Must select 1 constructor' });
      }
      // Captain must be one of the selected drivers
      if (captainId && !drivers.includes(captainId)) {
        return res.status(400).json({ error: 'Captain must be one of your selected drivers' });
      }

      // Check if team is locked
      const existingTeam = await prisma.userWeeklyTeam.findUnique({
        where: {
          userId_leagueId_week: {
            userId,
            leagueId,
            week: weekNum,
          },
        },
      });

      if (existingTeam?.locked) {
        return res.status(400).json({ error: 'Team is locked for this week' });
      }

      // Get current prices — fall back to most recent available week if exact week is missing
      const exactDriverPrices = await prisma.driverPrice.findMany({
        where: { driverId: { in: drivers }, week: weekNum },
      });
      const missingDriverIds = drivers.filter(id => !exactDriverPrices.find(p => p.driverId === id));
      const fallbackDriverPrices = await Promise.all(
        missingDriverIds.map(id =>
          prisma.driverPrice.findFirst({
            where: { driverId: id, week: { lte: weekNum } },
            orderBy: { week: 'desc' },
          })
        )
      );
      const driverPrices = [...exactDriverPrices, ...fallbackDriverPrices.filter(Boolean)];

      if (driverPrices.length < drivers.length) {
        return res.status(400).json({ error: 'Price not found for one or more selected drivers' });
      }

      let constructorPrice = await prisma.constructorPrice.findUnique({
        where: { constructorId_week: { constructorId, week: weekNum } },
      });
      if (!constructorPrice) {
        constructorPrice = await prisma.constructorPrice.findFirst({
          where: { constructorId, week: { lte: weekNum } },
          orderBy: { week: 'desc' },
        });
      }
      if (!constructorPrice) {
        return res.status(400).json({ error: 'Price not found for selected constructor' });
      }

      // Calculate total cost
      const leagueForBudget = await prisma.league.findUnique({ where: { id: leagueId }, select: { budget: true } });
      const budget = leagueForBudget?.budget ?? 100; // millions
      const driverCost = driverPrices.reduce((sum, p) => sum + p.price, 0);
      const totalCost = driverCost + constructorPrice.price;

      if (totalCost > budget) {
        return res.status(400).json({
          error: `Team costs ${totalCost.toFixed(2)}M but budget is ${budget}M`,
          budgetUsed: totalCost,
        });
      }

      // Handle chip validation
      if (chipUsed) {
        const chip = await prisma.chip.findUnique({
          where: { userId_leagueId_type: { userId, leagueId, type: chipUsed } },
        });
        if (!chip || chip.usedWeek !== null) {
          return res.status(400).json({ error: `Chip '${chipUsed}' already used or not available` });
        }
        // Mark chip as used
        await prisma.chip.update({
          where: { id: chip.id },
          data: { usedWeek: weekNum },
        });
      }

      // Upsert team + selections atomically
      const team = await prisma.$transaction(async (tx) => {
        const t = await tx.userWeeklyTeam.upsert({
          where: {
            userId_leagueId_week: { userId, leagueId, week: weekNum },
          },
          create: {
            userId,
            leagueId,
            week: weekNum,
            budgetUsed: totalCost,
            captainId: captainId || null,
            chipUsed: chipUsed || null,
          },
          update: {
            budgetUsed: totalCost,
            captainId: captainId || null,
            chipUsed: chipUsed || null,
          },
        });

        // Replace driver selections
        await tx.userWeeklyTeamDriver.deleteMany({ where: { teamId: t.id } });
        await tx.userWeeklyTeamDriver.createMany({
          data: drivers.map(driverId => ({
            teamId: t.id,
            driverId,
            pricePaidPerPoint: driverPrices.find(p => p.driverId === driverId)?.price ?? 0,
          })),
        });

        // Replace constructor selection
        await tx.userWeeklyTeamConstructor.deleteMany({ where: { teamId: t.id } });
        await tx.userWeeklyTeamConstructor.create({
          data: {
            teamId: t.id,
            constructorId,
            pricePaidPerPoint: constructorPrice.price,
          },
        });

        return t;
      });

      res.json({
        message: 'Team submitted successfully',
        team: {
          id: team.id,
          week: weekNum,
          budgetUsed: totalCost,
          budgetRemaining: budget - totalCost,
        },
      });
    } catch (error) {
      console.error('Error submitting team:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * GET /api/leagues/:leagueId/team/:week/:userId
 * View any player's team for a given week
 */
router.get('/leagues/:leagueId/team/:week/:userId', authMiddleware, async (req, res) => {
  try {
    const { leagueId, week, userId } = req.params;

    const team = await prisma.userWeeklyTeam.findUnique({
      where: { userId_leagueId_week: { userId, leagueId, week: parseInt(week) } },
      include: {
        user: { select: { name: true } },
        drivers: { include: { driver: { include: { constructor: true } } } },
        constructors: { include: { constructor: true } },
      },
    });

    if (!team) return res.status(404).json({ error: 'No team found for this player' });

    // Enrich with round points (same logic as the self-team endpoint)
    const weekNum = parseInt(week);
    const enrichedDrivers = await Promise.all(team.drivers.map(async td => {
      const results = await prisma.raceResult.findMany({
        where: { driverId: td.driverId, leagueId, week: weekNum },
      });
      let roundPoints = results.reduce((sum, r) => sum + r.points, 0);
      if (team.captainId === td.driverId) roundPoints *= team.chipUsed === 'triple_captain' ? 3 : 2;
      if (team.chipUsed === 'no_negative' && roundPoints < 0) roundPoints = 0;
      return { ...td, roundPoints };
    }));

    const constructorResult = team.constructors[0] ? await prisma.constructorRaceResult.findMany({
      where: { constructorId: team.constructors[0].constructorId, leagueId, week: weekNum },
    }) : [];
    const constructorRoundPoints = constructorResult.reduce((sum, r) => sum + r.totalPoints, 0);
    const enrichedConstructors = team.constructors.map((c, i) => ({
      ...c, roundPoints: i === 0 ? constructorRoundPoints : 0,
    }));

    const totalRoundPoints = enrichedDrivers.reduce((s, d) => s + d.roundPoints, 0) + constructorRoundPoints;

    res.json({ ...team, drivers: enrichedDrivers, constructors: enrichedConstructors, totalRoundPoints });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PRICING ============

/**
 * GET /api/leagues/:leagueId/prices/:week
 * Get all driver and constructor prices for a week
 */
router.get('/leagues/:leagueId/prices/:week', authMiddleware, async (req, res) => {
  try {
    const { leagueId, week } = req.params;
    const weekNum = parseInt(week);
    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { budget: true } });

    let drivers = await prisma.driverPrice.findMany({
      where: { week: weekNum },
      include: { driver: { include: { constructor: true } } },
    });

    // Fall back to most recent available week if no prices exist for requested week
    if (drivers.length === 0) {
      const latest = await prisma.driverPrice.findFirst({
        where: { week: { lte: weekNum } },
        orderBy: { week: 'desc' },
        select: { week: true },
      });
      if (latest) {
        drivers = await prisma.driverPrice.findMany({
          where: { week: latest.week },
          include: { driver: { include: { constructor: true } } },
        });
      }
    }

    let constructors = await prisma.constructorPrice.findMany({
      where: { week: weekNum },
      include: { constructor: { include: { drivers: true } } },
    });

    if (constructors.length === 0) {
      const latest = await prisma.constructorPrice.findFirst({
        where: { week: { lte: weekNum } },
        orderBy: { week: 'desc' },
        select: { week: true },
      });
      if (latest) {
        constructors = await prisma.constructorPrice.findMany({
          where: { week: latest.week },
          include: { constructor: { include: { drivers: true } } },
        });
      }
    }

    res.json({
      week: weekNum,
      drivers,
      constructors,
      totalBudget: league?.budget ?? 100,
      locked: await isRoundLocked(weekNum),
    });
  } catch (error) {
    console.error('Error fetching prices:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ DRIVER FORM & PRICE HISTORY ============

/**
 * GET /api/leagues/:leagueId/driver-form/:week
 * Returns last 3 finishing positions and price history for all drivers (for the team picker)
 */
router.get('/leagues/:leagueId/driver-form/:week', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const weekNum = parseInt(req.params.week);

    // Last 3 race results per driver
    const results = await prisma.raceResult.findMany({
      where: { leagueId, week: { lt: weekNum } },
      orderBy: { week: 'desc' },
    });

    // Group by driverId, keep last 3 per driver
    const formMap = {};
    for (const r of results) {
      if (!formMap[r.driverId]) formMap[r.driverId] = [];
      if (formMap[r.driverId].length < 3) {
        formMap[r.driverId].push({ week: r.week, position: r.finishingPosition, points: r.points });
      }
    }

    // Price history for all drivers (up to current week)
    const prices = await prisma.driverPrice.findMany({
      where: { week: { lte: weekNum } },
      orderBy: { week: 'asc' },
    });
    const priceMap = {};
    for (const p of prices) {
      if (!priceMap[p.driverId]) priceMap[p.driverId] = [];
      priceMap[p.driverId].push({ week: p.week, price: p.price });
    }

    res.json({ form: formMap, prices: priceMap });
  } catch (error) {
    console.error('Error fetching driver form:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ LEADERBOARD ============

/**
 * GET /api/leagues/:leagueId/leaderboard
 * Get season leaderboard with points and tie-breaker
 */
router.get('/leagues/:leagueId/leaderboard', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;

    // 1. Fetch league for startingRound, then all users with team selections
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { startingRound: true },
    });
    const startingRound = league?.startingRound ?? 1;

    const leagueUsers = await prisma.leagueUser.findMany({
      where: { leagueId },
      include: {
        user: {
          include: {
            weeklyTeams: {
              where: { leagueId, week: { gte: startingRound } },
              include: { drivers: true, constructors: true },
            },
          },
        },
      },
    });

    // 2. Batch fetch ALL driver race results and constructor results for this league
    const [allDriverResults, allCtorResults, latestWeekRow] = await Promise.all([
      prisma.raceResult.findMany({ where: { leagueId } }),
      prisma.constructorRaceResult.findMany({ where: { leagueId } }),
      prisma.raceResult.findFirst({ where: { leagueId }, orderBy: { week: 'desc' }, select: { week: true } }),
    ]);

    // Build fast lookup maps
    const driverResultMap = {};
    for (const r of allDriverResults) {
      const key = `${r.driverId}:${r.week}`;
      if (!driverResultMap[key]) driverResultMap[key] = [];
      driverResultMap[key].push(r);
    }
    const ctorResultMap = {};
    for (const r of allCtorResults) {
      ctorResultMap[`${r.constructorId}:${r.week}`] = r;
    }

    const latestWeek = latestWeekRow?.week ?? null;

    // 3. Compute standings in memory (no extra DB queries)
    const standings = [];
    for (const lu of leagueUsers) {
      let totalPoints = 0;
      let totalWins = 0;
      const roundPoints = {};

      for (const team of lu.user.weeklyTeams) {
        let weekPoints = 0;

        for (const td of team.drivers) {
          const results = driverResultMap[`${td.driverId}:${team.week}`] ?? [];
          for (const r of results) {
            let pts = r.points;
            if (team.chipUsed === 'no_negative' && pts < 0) pts = 0;
            if (team.captainId === td.driverId) {
              pts *= team.chipUsed === 'triple_captain' ? 3 : 2;
            }
            weekPoints += pts;
            if (r.finishingPosition === 1) totalWins++;
          }
        }

        const ctor = team.constructors[0];
        if (ctor) {
          const cr = ctorResultMap[`${ctor.constructorId}:${team.week}`];
          if (cr) weekPoints += cr.totalPoints;
        }

        totalPoints += weekPoints;
        roundPoints[team.week] = weekPoints;
      }

      standings.push({
        userId: lu.userId,
        userName: lu.user.name,
        email: lu.user.email,
        teamName: lu.teamName,
        avatarColor: lu.user.avatarColor,
        totalPoints,
        totalWins,
        roundPoints,
      });
    }

    standings.sort((a, b) => b.totalPoints !== a.totalPoints
      ? b.totalPoints - a.totalPoints
      : b.totalWins - a.totalWins);
    standings.forEach((u, i) => { u.rank = i + 1; });

    // 4. Compute previous-round ranks in memory (reuse already-fetched data)
    if (latestWeek) {
      const prevTotals = {};
      for (const lu of leagueUsers) {
        let pts = 0; let wins = 0;
        for (const team of lu.user.weeklyTeams) {
          if (team.week >= latestWeek) continue;
          for (const td of team.drivers) {
            for (const r of (driverResultMap[`${td.driverId}:${team.week}`] ?? [])) {
              let p = r.points;
              if (team.chipUsed === 'no_negative' && p < 0) p = 0;
              if (team.captainId === td.driverId) p *= team.chipUsed === 'triple_captain' ? 3 : 2;
              pts += p;
              if (r.finishingPosition === 1) wins++;
            }
          }
          const ctor = team.constructors[0];
          if (ctor) {
            const cr = ctorResultMap[`${ctor.constructorId}:${team.week}`];
            if (cr) pts += cr.totalPoints;
          }
        }
        prevTotals[lu.userId] = { pts, wins };
      }
      const prevRanked = Object.entries(prevTotals)
        .sort(([, a], [, b]) => b.pts !== a.pts ? b.pts - a.pts : b.wins - a.wins)
        .map(([userId], i) => ({ userId, rank: i + 1 }));
      const prevRankMap = Object.fromEntries(prevRanked.map(r => [r.userId, r.rank]));
      for (const s of standings) {
        const prev = prevRankMap[s.userId];
        s.rankDelta = prev != null ? prev - s.rank : 0;
      }
    } else {
      standings.forEach(s => { s.rankDelta = 0; });
    }

    res.json({ standings, latestRound: latestWeek });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ CHIPS ============

/**
 * GET /api/leagues/:leagueId/chips
 * Get available chips for current user in a league
 */
router.get('/leagues/:leagueId/chips', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const userId = req.user.id;

    const chips = await prisma.chip.findMany({
      where: { userId, leagueId },
    });

    res.json(chips);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/leagues/:leagueId/transfers
 * Get transfer history for current user
 */
router.get('/leagues/:leagueId/transfers', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const userId = req.user.id;

    const transfers = await prisma.transfer.findMany({
      where: { userId, leagueId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(transfers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/leagues/:leagueId/leaderboard/weekly/:week
 * Get per-round leaderboard rankings
 */
router.get('/leagues/:leagueId/leaderboard/weekly/:week', authMiddleware, async (req, res) => {
  try {
    const { leagueId, week } = req.params;
    const weekNum = parseInt(week);

    const [teams, allDriverResults, allCtorResults] = await Promise.all([
      prisma.userWeeklyTeam.findMany({
        where: { leagueId, week: weekNum },
        include: {
          user: { select: { id: true, name: true, avatarColor: true } },
          drivers: true,
          constructors: true,
        },
      }),
      prisma.raceResult.findMany({ where: { leagueId, week: weekNum } }),
      prisma.constructorRaceResult.findMany({ where: { leagueId, week: weekNum } }),
    ]);

    // Build maps for O(1) lookup
    const driverResultMap = {};
    for (const r of allDriverResults) {
      if (!driverResultMap[r.driverId]) driverResultMap[r.driverId] = [];
      driverResultMap[r.driverId].push(r);
    }
    const ctorResultMap = {};
    for (const r of allCtorResults) ctorResultMap[r.constructorId] = r;

    const weekStandings = teams.map(team => {
      let pts = 0;
      for (const td of team.drivers) {
        for (const r of (driverResultMap[td.driverId] ?? [])) {
          let p = r.points;
          if (team.chipUsed === 'no_negative' && p < 0) p = 0;
          if (team.captainId === td.driverId) p *= team.chipUsed === 'triple_captain' ? 3 : 2;
          pts += p;
        }
      }
      const ctor = team.constructors[0];
      if (ctor) {
        const cr = ctorResultMap[ctor.constructorId];
        if (cr) pts += cr.totalPoints;
      }
      return {
        userId: team.userId,
        userName: team.user.name,
        avatarColor: team.user.avatarColor,
        points: pts,
        captainId: team.captainId,
        chipUsed: team.chipUsed,
      };
    });

    weekStandings.sort((a, b) => b.points - a.points);
    weekStandings.forEach((s, i) => { s.rank = i + 1; });

    res.json({ week: weekNum, standings: weekStandings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/leagues/:leagueId/members
 * Get all members with their team names
 */
router.get('/leagues/:leagueId/members', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const members = await prisma.leagueUser.findMany({
      where: { leagueId },
      include: {
        user: { select: { id: true, name: true, avatarColor: true, bio: true } },
      },
    });
    res.json(members.map(m => ({
      userId: m.userId,
      name: m.user.name,
      teamName: m.teamName,
      role: m.role,
      avatarColor: m.user.avatarColor,
      bio: m.user.bio,
      joinedAt: m.joinedAt,
      totalPoints: m.totalPoints,
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/leagues/:leagueId/team-name
 * Update user's team name in a league
 */
router.put('/leagues/:leagueId/team-name', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { teamName } = req.body;
    const userId = req.user.id;

    await prisma.leagueUser.update({
      where: { userId_leagueId: { userId, leagueId } },
      data: { teamName },
    });

    res.json({ message: 'Team name updated', teamName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ADMIN: MANUAL RACE ENTRY ============

/**
 * POST /api/admin/races/:leagueId/:week
 * Admin submits race results manually
 * Body: { results: [{ driverId, finishingPosition }] }
 */
router.post('/admin/races/:leagueId/:week', authMiddleware, async (req, res) => {
  try {
    const { leagueId, week } = req.params;
    const { results } = req.body;
    const weekNum = parseInt(week);
    const userId = req.user.id;

    // Verify user is commissioner of this league
    const member = await prisma.leagueUser.findUnique({
      where: { userId_leagueId: { userId, leagueId } },
    });
    if (!member || member.role !== 'commissioner') {
      return res.status(403).json({ error: 'Commissioner only' });
    }

    // Validate each result
    for (const result of results) {
      if (!result.driverId || result.finishingPosition === undefined) {
        return res.status(400).json({
          error: 'Each result must have driverId and finishingPosition',
        });
      }
    }

    // Delete any existing results for this week (to allow re-entry)
    await prisma.raceResult.deleteMany({
      where: { leagueId, week: weekNum },
    });
    await prisma.constructorRaceResult.deleteMany({
      where: { leagueId, week: weekNum },
    });

    // Process results
    const { savedResults, failedResults } =
      await f1DataService.processRaceResults(
        leagueId,
        weekNum,
        new Date().getFullYear(),
        results
      );

    // Update pricing
    await pricingEngine.processPricingAfterRace(leagueId, weekNum);

    // Check achievements (non-blocking)
    checkAchievementsAfterRace(leagueId, weekNum).catch(e => console.error('Achievement check failed:', e));

    // Generate H2H matchups if this is an H2H league
    generateH2HMatchups(leagueId, weekNum).catch(e => console.error('H2H matchup error:', e));

    // Unlock teams for next week
    await prisma.userWeeklyTeam.updateMany({
      where: {
        leagueId,
        week: weekNum + 1,
      },
      data: {
        locked: false,
      },
    });

    // Update cached points/wins so league-list rank badge stays accurate (non-blocking)
    updateLeagueUserCache(leagueId).catch(e => console.error('Cache update error:', e));

    res.json({
      message: 'Race results processed',
      savedCount: savedResults.length,
      failedCount: failedResults.length,
      failures: failedResults,
    });
  } catch (error) {
    console.error('Error processing race results:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ DRAFT BOARD ============

// In-memory draft state (persists during server lifetime; use DB for production scale)
const draftStates = {};

/**
 * GET /api/leagues/:leagueId/draft
 */
router.get('/leagues/:leagueId/draft', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const userId = req.user.id;
    const member = await prisma.leagueUser.findUnique({
      where: { userId_leagueId: { userId, leagueId } },
    });
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const state = draftStates[leagueId];
    if (!state) return res.json({ started: false, picks: [] });

    res.json(state);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/leagues/:leagueId/draft/start
 * Commissioner starts the draft
 */
router.post('/leagues/:leagueId/draft/start', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const userId = req.user.id;
    const member = await prisma.leagueUser.findUnique({
      where: { userId_leagueId: { userId, leagueId } },
    });
    if (!member || member.role !== 'commissioner') return res.status(403).json({ error: 'Commissioner only' });

    const members = await prisma.leagueUser.findMany({
      where: { leagueId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    // Shuffle members for random draft order
    const shuffled = [...members].sort(() => Math.random() - 0.5);

    draftStates[leagueId] = {
      started: true,
      picks: [],
      order: shuffled.map(m => ({ userId: m.userId, name: m.user.name })),
      startedAt: new Date().toISOString(),
    };

    res.json({ message: 'Draft started', state: draftStates[leagueId] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/leagues/:leagueId/draft/pick
 * Submit a draft pick
 */
router.post('/leagues/:leagueId/draft/pick', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const userId = req.user.id;
    const { type, itemId, itemName } = req.body;

    const state = draftStates[leagueId];
    if (!state?.started) return res.status(400).json({ error: 'Draft not started' });

    const n = state.order.length;
    const PICKS_PER_PLAYER = 6;
    const totalPicks = n * PICKS_PER_PLAYER;

    // Calculate snake order
    function getSnakeOrder(numPlayers, total) {
      const order = [];
      let round = 0;
      while (order.length < total) {
        const fwd = round % 2 === 0;
        for (let i = 0; i < numPlayers && order.length < total; i++) {
          order.push(fwd ? i : numPlayers - 1 - i);
        }
        round++;
      }
      return order;
    }
    const snakeOrder = getSnakeOrder(n, totalPicks);
    const currentPickIdx = state.picks.length;

    if (currentPickIdx >= totalPicks) return res.status(400).json({ error: 'Draft complete' });

    const expectedPlayerIdx = snakeOrder[currentPickIdx];
    const expectedUserId = state.order[expectedPlayerIdx]?.userId;

    if (userId !== expectedUserId) return res.status(403).json({ error: 'Not your turn' });

    // Validate not already picked
    const alreadyPicked = state.picks.some(p => p.itemId === itemId && p.type === type);
    if (alreadyPicked) return res.status(400).json({ error: 'Already picked' });

    const round = Math.floor(currentPickIdx / n) + 1;
    state.picks.push({
      userId, type, itemId, itemName,
      round, pick: currentPickIdx + 1,
      pickedAt: new Date().toISOString(),
    });

    res.json({ message: 'Pick recorded', state });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ H2H MATCHUPS ============

/**
 * GET /api/leagues/:leagueId/h2h
 * Get all H2H matchups for a league + per-user season records
 */
router.get('/leagues/:leagueId/h2h', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const userId = req.user.id;

    // Verify membership
    const member = await prisma.leagueUser.findUnique({
      where: { userId_leagueId: { userId, leagueId } },
    });
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const matchups = await prisma.h2HMatchup.findMany({
      where: { leagueId },
      orderBy: [{ week: 'desc' }, { createdAt: 'asc' }],
    });

    // Attach user info
    const userIds = [...new Set(matchups.flatMap(m => [m.user1Id, m.user2Id]))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatarColor: true },
    });
    const luMap = await prisma.leagueUser.findMany({
      where: { leagueId, userId: { in: userIds } },
      select: { userId: true, teamName: true },
    });
    const userMap = {};
    users.forEach(u => { userMap[u.id] = { ...u }; });
    luMap.forEach(lu => { if (userMap[lu.userId]) userMap[lu.userId].teamName = lu.teamName; });

    const enriched = matchups.map(m => ({
      ...m,
      user1: userMap[m.user1Id],
      user2: userMap[m.user2Id],
    }));

    // Build season records
    const records = {};
    for (const m of matchups) {
      for (const uid of [m.user1Id, m.user2Id]) {
        if (!records[uid]) records[uid] = { userId: uid, name: userMap[uid]?.name, avatarColor: userMap[uid]?.avatarColor, wins: 0, losses: 0, draws: 0, played: 0, pts: 0 };
      }
      if (m.winnerId) {
        records[m.user1Id].played++;
        records[m.user2Id].played++;
        records[m.user1Id].pts += m.user1Points;
        records[m.user2Id].pts += m.user2Points;
        if (m.winnerId === 'draw') {
          records[m.user1Id].draws++;
          records[m.user2Id].draws++;
        } else if (m.winnerId === m.user1Id) {
          records[m.user1Id].wins++;
          records[m.user2Id].losses++;
        } else {
          records[m.user2Id].wins++;
          records[m.user1Id].losses++;
        }
      }
    }

    res.json({ matchups: enriched, records });
  } catch (error) {
    console.error('H2H error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ LEAGUE SETTINGS ============

/**
 * PUT /api/leagues/:leagueId/settings
 * Update league settings (commissioner only)
 */
router.put('/leagues/:leagueId/settings', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const userId = req.user.id;
    const { name, description, isPublic, maxPlayers, transfersPerRound, budget } = req.body;

    // Verify commissioner
    const member = await prisma.leagueUser.findUnique({
      where: { userId_leagueId: { userId, leagueId } },
    });
    if (!member || member.role !== 'commissioner') {
      return res.status(403).json({ error: 'Commissioner only' });
    }

    const updated = await prisma.league.update({
      where: { id: leagueId },
      data: {
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(isPublic !== undefined && { isPublic }),
        ...(maxPlayers && { maxPlayers: parseInt(maxPlayers) }),
        ...(transfersPerRound !== undefined && { transfersPerRound: parseInt(transfersPerRound) }),
        ...(budget && { budget: parseFloat(budget) }),
      },
    });

    res.json({ message: 'Settings updated', league: updated });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ MANUAL RESULT CHECK ============

/**
 * POST /api/admin/check-results
 * Check Jolpica for the most recent completed race and import if not already in DB
 */
router.post('/admin/check-results', checkResultsLimiter, authMiddleware, async (_req, res) => {
  try {
    const season = new Date().getFullYear();
    const now = new Date();

    // Fetch the F1 schedule to find the latest completed race
    const scheduleRes = await fetch(`https://api.jolpi.ca/ergast/f1/${season}.json`);
    const scheduleData = await scheduleRes.json();
    const races = scheduleData.MRData.RaceTable.Races;

    // Find completed main races (race start time in the past)
    const completedRaces = races.filter(r => new Date(`${r.date}T${r.time || '14:00:00Z'}`) < now);

    // Also find sprint-only events: sprint finished but main race hasn't started yet
    const sprintCompleted = races.filter(r => {
      if (!r.Sprint) return false;
      const sprintTime = new Date(`${r.Sprint.date}T${r.Sprint.time || '14:00:00Z'}`);
      const raceTime = new Date(`${r.date}T${r.time || '14:00:00Z'}`);
      return sprintTime < now && raceTime >= now;
    });

    // Determine the most recent completed event and whether it's a sprint
    let latest = null;
    let isSprintImport = false;

    if (completedRaces.length > 0 && sprintCompleted.length > 0) {
      const lastRace = completedRaces[completedRaces.length - 1];
      const lastSprint = sprintCompleted[sprintCompleted.length - 1];
      const lastRaceTime = new Date(`${lastRace.date}T${lastRace.time || '14:00:00Z'}`);
      const lastSprintTime = new Date(`${lastSprint.Sprint.date}T${lastSprint.Sprint.time || '14:00:00Z'}`);
      if (lastSprintTime > lastRaceTime) {
        latest = lastSprint;
        isSprintImport = true;
      } else {
        latest = lastRace;
      }
    } else if (sprintCompleted.length > 0) {
      latest = sprintCompleted[sprintCompleted.length - 1];
      isSprintImport = true;
    } else if (completedRaces.length > 0) {
      latest = completedRaces[completedRaces.length - 1];
    } else {
      return res.json({ status: 'no_race', message: 'No completed races yet this season.' });
    }

    const round = parseInt(latest.round);

    // Try to fetch results from Jolpica first (before checking leagues)
    let results;
    try {
      results = isSprintImport
        ? await f1DataService.fetchSprintResults(season, round)
        : await f1DataService.fetchRaceResults(season, round);
    } catch {
      const eventLabel = isSprintImport ? 'Sprint results' : 'Results';
      return res.json({ status: 'not_available', message: `${eventLabel} for round ${round} (${latest.raceName}) not available yet. Try again later.`, round });
    }

    // If this is a main race on a sprint weekend, also fetch sprint results to combine points
    let sprintResults = null;
    if (!isSprintImport && latest.Sprint) {
      try {
        sprintResults = await f1DataService.fetchSprintResults(season, round);
      } catch {
        // Sprint fetch failed — import race-only
      }
    }

    const eventLabel = isSprintImport ? `Sprint — Round ${round} (${latest.raceName})` : `Round ${round} (${latest.raceName})`;

    // Process per-league
    const leagues = await prisma.league.findMany();
    let totalSaved = 0;
    let skipped = 0;
    for (const league of leagues) {
      if (round < league.startingRound) continue;
      const existing = await prisma.raceResult.count({ where: { leagueId: league.id, week: round } });

      if (existing > 0) {
        // Main race on a sprint weekend: wipe sprint-only data and re-import with combined points
        if (!isSprintImport && latest.Sprint) {
          await prisma.raceResult.deleteMany({ where: { leagueId: league.id, week: round } });
          await prisma.constructorRaceResult.deleteMany({ where: { leagueId: league.id, week: round } });
        } else {
          skipped++;
          continue;
        }
      }

      const { savedResults } = await f1DataService.processRaceResults(
        league.id, round, season, results, { isSprint: isSprintImport, sprintResults }
      );
      await pricingEngine.processPricingAfterRace(league.id, round);
      // Check achievements and send rank notifications (non-blocking)
      checkAchievementsAfterRace(league.id, round).catch(e => console.error('Achievement check failed:', e));
      generateH2HMatchups(league.id, round).catch(e => console.error('H2H matchup error:', e));
      notifyResultsImported(league.id, round, league.name, eventLabel).catch(() => {});
      updateLeagueUserCache(league.id).catch(e => console.error('Cache update error:', e));
      await prisma.userWeeklyTeam.updateMany({
        where: { leagueId: league.id, week: round + 1 },
        data: { locked: false },
      });
      totalSaved += savedResults.length;
    }

    if (totalSaved === 0 && skipped > 0) {
      return res.json({ status: 'already_imported', message: `${eventLabel} already imported for all leagues.`, round });
    }

    res.json({ status: 'imported', message: `${eventLabel} imported — ${totalSaved} results saved across ${leagues.length - skipped} league(s).`, round });
  } catch (error) {
    console.error('Error checking results:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ RACE RESULTS (PUBLIC) ============

/**
 * GET /api/results/latest
 * Returns the most recent round that has results, plus the results themselves.
 */
router.get('/results/latest', authMiddleware, async (req, res) => {
  try {
    const latest = await prisma.raceResult.findFirst({
      orderBy: { week: 'desc' },
      select: { week: true },
    });
    if (!latest) return res.json({ week: null, drivers: [], constructors: [] });
    req.params = { ...req.params, week: String(latest.week) };
    return fetchResultsForWeek(latest.week, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/results/:week
 * Returns finishing positions and fantasy points for all drivers/constructors in a given week.
 * Results are league-agnostic (same across leagues — picked from the first league found).
 */
router.get('/results/:week', authMiddleware, async (req, res) => {
  try {
    const weekNum = parseInt(req.params.week);
    await fetchResultsForWeek(weekNum, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function fetchResultsForWeek(weekNum, res) {
  // Pick any league that has results for this week (results are identical across leagues)
  const anyResult = await prisma.raceResult.findFirst({ where: { week: weekNum }, select: { leagueId: true } });
  if (!anyResult) return res.json({ week: weekNum, drivers: [], constructors: [] });

  const leagueId = anyResult.leagueId;

  const [driverResults, constructorResults] = await Promise.all([
    prisma.raceResult.findMany({
      where: { leagueId, week: weekNum },
      include: { driver: { include: { constructor: true } } },
      orderBy: { finishingPosition: 'asc' },
    }),
    prisma.constructorRaceResult.findMany({
      where: { leagueId, week: weekNum },
      include: { constructor: true },
      orderBy: { totalPoints: 'desc' },
    }),
  ]);

  res.json({
    week: weekNum,
    drivers: driverResults.map(r => ({
      position: r.finishingPosition,
      gridPosition: r.gridPosition,
      points: r.points,
      isSprint: r.isSprint,
      driver: r.driver,
    })),
    constructors: constructorResults.map(r => ({
      points: r.totalPoints,
      constructor: r.constructor,
    })),
  });
}

// GET /api/leagues/:leagueId/activity
// Returns a chronological feed of recent league events
router.get('/leagues/:leagueId/activity', authMiddleware, async (req, res) => {
  const { leagueId } = req.params;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  const member = await prisma.leagueMember.findUnique({
    where: { leagueId_userId: { leagueId, userId: req.user.id } },
  });
  if (!member) return res.status(403).json({ error: 'Not a member of this league' });

  // Gather events from multiple sources in parallel
  const [recentTeams, recentResults, recentMessages, members] = await Promise.all([
    // Recent team submissions
    prisma.weeklyTeam.findMany({
      where: { leagueId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, name: true } } },
    }),
    // Rounds with results available
    prisma.raceResult.findMany({
      where: { leagueId },
      distinct: ['week'],
      orderBy: { week: 'desc' },
      take: 5,
      select: { week: true, createdAt: true },
    }),
    // Recent chat messages
    prisma.leagueMessage.findMany({
      where: { leagueId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { user: { select: { id: true, name: true } } },
    }),
    // League members (for join events)
    prisma.leagueMember.findMany({
      where: { leagueId },
      orderBy: { joinedAt: 'desc' },
      take: 5,
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const events = [];

  for (const team of recentTeams) {
    events.push({
      id: `team-${team.id}`,
      type: 'team_submitted',
      title: `${team.user.name} submitted their Round ${team.week} team`,
      userId: team.user.id,
      userName: team.user.name,
      week: team.week,
      timestamp: team.updatedAt.toISOString(),
    });
  }

  for (const result of recentResults) {
    events.push({
      id: `result-${leagueId}-${result.week}`,
      type: 'results_imported',
      title: `Round ${result.week} results are in`,
      week: result.week,
      timestamp: result.createdAt.toISOString(),
    });
  }

  for (const msg of recentMessages) {
    events.push({
      id: `msg-${msg.id}`,
      type: 'chat_message',
      title: `${msg.user.name}: ${msg.content.length > 60 ? msg.content.slice(0, 57) + '…' : msg.content}`,
      userId: msg.user.id,
      userName: msg.user.name,
      timestamp: msg.createdAt.toISOString(),
    });
  }

  for (const m of members) {
    events.push({
      id: `join-${m.userId}`,
      type: 'member_joined',
      title: `${m.user.name} joined the league`,
      userId: m.user.id,
      userName: m.user.name,
      timestamp: m.joinedAt.toISOString(),
    });
  }

  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ events: events.slice(0, limit) });
});

// ============ OPTIMAL TEAM (HINDSIGHT) ============

/**
 * GET /api/leagues/:leagueId/optimal-team/:week
 * Returns the 5-driver + 1-constructor team that maximises fantasy points
 * for the given week within the league budget. 404 if results not yet imported.
 */
router.get('/leagues/:leagueId/optimal-team/:week', authMiddleware, async (req, res) => {
  try {
    const { leagueId, week } = req.params;
    const weekNum = parseInt(week);

    const resultsExist = await prisma.raceResult.findFirst({
      where: { leagueId, week: weekNum },
      select: { id: true },
    });
    if (!resultsExist) {
      return res.status(404).json({ error: 'No race results for this week' });
    }

    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { budget: true } });
    const budget = league?.budget ?? 100;

    const [driverResults, constructorResults] = await Promise.all([
      prisma.raceResult.findMany({
        where: { leagueId, week: weekNum },
        include: { driver: { select: { id: true, name: true, abbr: true } } },
      }),
      prisma.constructorRaceResult.findMany({
        where: { leagueId, week: weekNum },
        include: { constructor: { select: { id: true, name: true } } },
      }),
    ]);

    // Fetch driver prices with fallback to most recent available week
    const driverIds = driverResults.map(r => r.driverId);
    let driverPrices = await prisma.driverPrice.findMany({
      where: { driverId: { in: driverIds }, week: weekNum },
    });
    const pricedDriverIds = new Set(driverPrices.map(p => p.driverId));
    const missingDriverIds = driverIds.filter(id => !pricedDriverIds.has(id));
    if (missingDriverIds.length > 0) {
      const fallbacks = await Promise.all(
        missingDriverIds.map(id => prisma.driverPrice.findFirst({
          where: { driverId: id, week: { lte: weekNum } },
          orderBy: { week: 'desc' },
        }))
      );
      driverPrices = [...driverPrices, ...fallbacks.filter(Boolean)];
    }

    // Fetch constructor prices with fallback
    const constructorIds = constructorResults.map(r => r.constructorId);
    let constructorPrices = await prisma.constructorPrice.findMany({
      where: { constructorId: { in: constructorIds }, week: weekNum },
    });
    const pricedCtorIds = new Set(constructorPrices.map(p => p.constructorId));
    const missingCtorIds = constructorIds.filter(id => !pricedCtorIds.has(id));
    if (missingCtorIds.length > 0) {
      const fallbacks = await Promise.all(
        missingCtorIds.map(id => prisma.constructorPrice.findFirst({
          where: { constructorId: id, week: { lte: weekNum } },
          orderBy: { week: 'desc' },
        }))
      );
      constructorPrices = [...constructorPrices, ...fallbacks.filter(Boolean)];
    }

    const driverPriceMap = Object.fromEntries(driverPrices.map(p => [p.driverId, p.price]));
    const ctorPriceMap = Object.fromEntries(constructorPrices.map(p => [p.constructorId, p.price]));

    const drivers = driverResults
      .filter(r => driverPriceMap[r.driverId] !== undefined)
      .map(r => ({
        id: r.driverId,
        name: r.driver.name,
        abbr: r.driver.abbr,
        points: r.points,
        price: driverPriceMap[r.driverId],
      }));

    const constructors = constructorResults
      .filter(r => ctorPriceMap[r.constructorId] !== undefined)
      .map(r => ({
        id: r.constructorId,
        name: r.constructor.name,
        points: r.totalPoints,
        price: ctorPriceMap[r.constructorId],
      }));

    // Enumerate all C(n,5) driver combinations to find the highest-scoring
    // team within budget. With ~20 drivers this is at most 15,504 combinations.
    let bestTotal = -Infinity;
    let bestDrivers = [];
    let bestConstructor = null;

    function choose5(start, current, currentCost, currentPoints) {
      if (current.length === 5) {
        for (const ctor of constructors) {
          if (currentCost + ctor.price <= budget) {
            const total = currentPoints + ctor.points;
            if (total > bestTotal) {
              bestTotal = total;
              bestDrivers = [...current];
              bestConstructor = ctor;
            }
          }
        }
        return;
      }
      const remaining = 5 - current.length;
      for (let i = start; i <= drivers.length - remaining; i++) {
        const d = drivers[i];
        choose5(i + 1, [...current, d], currentCost + d.price, currentPoints + d.points);
      }
    }
    choose5(0, [], 0, 0);

    if (!bestConstructor) {
      return res.status(404).json({ error: 'No valid team found within budget' });
    }

    res.json({
      week: weekNum,
      totalPoints: bestTotal,
      budget,
      drivers: bestDrivers,
      constructor: bestConstructor,
    });
  } catch (error) {
    console.error('Optimal team error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
