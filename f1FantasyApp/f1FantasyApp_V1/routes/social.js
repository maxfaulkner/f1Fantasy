// routes/social.js — Notifications, Achievements, User Profile
const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');
const { sendPushToUsers } = require('../services/pushNotificationService');

router.use(authMiddleware);

// ============ NOTIFICATIONS ============

/**
 * GET /api/notifications
 * Get current user's notifications
 */
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unreadCount = notifications.filter(n => !n.read).length;
    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/notifications/read
 * Mark all notifications as read
 */
router.put('/notifications/read', async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true },
    });
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a single notification as read
 */
router.put('/notifications/:id/read', async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { read: true },
    });
    res.json({ message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/notifications/:id
 */
router.delete('/notifications/:id', async (req, res) => {
  try {
    await prisma.notification.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    });
    res.json({ message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ACHIEVEMENTS ============

/**
 * GET /api/achievements
 * Get achievements for current user
 */
router.get('/achievements', async (req, res) => {
  try {
    const achievements = await prisma.achievement.findMany({
      where: { userId: req.user.id },
      orderBy: { unlockedAt: 'desc' },
    });
    res.json(achievements);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PROFILE ============

async function computeSeasonStats(userId, leagues, season) {
  const availableSeasons = [...new Set(leagues.map(l => l.league.season))].sort((a, b) => a - b);
  const currentSeason = season ? parseInt(season, 10) : (availableSeasons.length > 0 ? Math.max(...availableSeasons) : null);
  const seasonLeagueIds = currentSeason !== null
    ? leagues.filter(l => l.league.season === currentSeason).map(l => l.leagueId)
    : leagues.map(l => l.leagueId);

  const allTeams = await prisma.userWeeklyTeam.findMany({
    where: { userId, leagueId: { in: seasonLeagueIds } },
    include: {
      drivers: { include: { driver: true } },
      constructors: { include: { constructor: true } },
    },
  });

  let totalPoints = 0;
  let roundsPlayed = 0;
  let bestRoundPoints = 0;
  let worstRoundPoints = null;
  const driverCount = {};

  if (allTeams.length > 0) {
    const teamLeagueIds = allTeams.map(t => t.leagueId);
    const teamWeeks = allTeams.map(t => t.week);

    const [allResults, allConResults] = await Promise.all([
      prisma.raceResult.findMany({
        where: { leagueId: { in: teamLeagueIds }, week: { in: teamWeeks } },
      }),
      prisma.constructorRaceResult.findMany({
        where: { leagueId: { in: teamLeagueIds }, week: { in: teamWeeks } },
      }),
    ]);

    const resultsByLeagueWeek = new Map();
    for (const r of allResults) {
      const key = `${r.leagueId}:${r.week}`;
      if (!resultsByLeagueWeek.has(key)) resultsByLeagueWeek.set(key, []);
      resultsByLeagueWeek.get(key).push(r);
    }

    const conResultsByKey = new Map();
    for (const r of allConResults) {
      const key = `${r.leagueId}:${r.week}:${r.constructorId}`;
      if (!conResultsByKey.has(key)) conResultsByKey.set(key, []);
      conResultsByKey.get(key).push(r);
    }

    for (const team of allTeams) {
      const driverIds = team.drivers.map(d => d.driverId);
      const weekResults = resultsByLeagueWeek.get(`${team.leagueId}:${team.week}`) || [];
      const results = weekResults.filter(r => driverIds.includes(r.driverId));
      const conKey = team.constructors[0]
        ? `${team.leagueId}:${team.week}:${team.constructors[0].constructorId}`
        : null;
      const conResults = conKey ? (conResultsByKey.get(conKey) || []) : [];

      let roundPts = results.reduce((s, r) => s + r.points, 0);
      if (team.captainId) {
        const captainResult = results.find(r => r.driverId === team.captainId);
        if (captainResult) {
          const extraMultiplier = team.chipUsed === 'triple_captain' ? 2 : 1;
          roundPts += captainResult.points * extraMultiplier;
        }
      }
      if (team.chipUsed === 'no_negative') roundPts = Math.max(0, roundPts);
      roundPts += conResults.reduce((s, r) => s + r.totalPoints, 0);

      if (results.length > 0 || conResults.length > 0) {
        roundsPlayed++;
        totalPoints += roundPts;
        if (roundPts > bestRoundPoints) bestRoundPoints = roundPts;
        if (worstRoundPoints === null || roundPts < worstRoundPoints) worstRoundPoints = roundPts;
        for (const d of team.drivers) {
          if (!driverCount[d.driverId]) driverCount[d.driverId] = { name: d.driver.name, count: 0 };
          driverCount[d.driverId].count++;
        }
      }
    }
  }

  const avgPoints = roundsPlayed > 0 ? parseFloat((totalPoints / roundsPlayed).toFixed(1)) : 0;

  const sortedDrivers = Object.values(driverCount).sort((a, b) => b.count - a.count);
  const favouriteDriver = sortedDrivers.length > 0
    ? { name: sortedDrivers[0].name, rounds: sortedDrivers[0].count }
    : null;

  const chips = await prisma.chip.findMany({
    where: { userId, leagueId: { in: seasonLeagueIds }, usedWeek: { not: null } },
    orderBy: { usedWeek: 'asc' },
  });

  const leagueNameMap = {};
  for (const lu of leagues) {
    if (seasonLeagueIds.includes(lu.leagueId)) leagueNameMap[lu.leagueId] = lu.league.name;
  }

  const chipsTimeline = chips.map(c => ({
    type: c.type,
    week: c.usedWeek,
    leagueName: leagueNameMap[c.leagueId] || c.leagueId,
  }));

  return {
    totalPoints,
    roundsPlayed,
    bestRoundPoints,
    worstRoundPoints: worstRoundPoints ?? 0,
    avgPoints,
    favouriteDriver,
    chipsTimeline,
    seasons: availableSeasons,
    currentSeason,
    leagueCount: seasonLeagueIds.length,
  };
}

/**
 * GET /api/profile
 * Get current user's full profile with stats
 */
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const { season } = req.query;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        bio: true,
        avatarColor: true,
        createdAt: true,
        leagues: {
          include: {
            league: { select: { id: true, name: true, season: true } },
          },
        },
        achievements: true,
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const seasonStats = await computeSeasonStats(userId, user.leagues, season);

    res.json({
      ...user,
      stats: {
        ...seasonStats,
        achievementCount: user.achievements.length,
      },
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/profile/push-token
 * Save or clear the APNs device push token for the current user
 */
router.put('/profile/push-token', async (req, res) => {
  try {
    const { pushToken } = req.body;
    await prisma.user.update({
      where: { id: req.user.id },
      data: { pushToken: pushToken ?? null },
    });
    res.json({ message: 'Push token updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/profile
 * Update profile (name, bio, avatarColor)
 */
router.put('/profile', async (req, res) => {
  try {
    const { name, bio, avatarColor } = req.body;
    const data = {};
    if (name) data.name = name;
    if (bio !== undefined) data.bio = bio;
    if (avatarColor) data.avatarColor = avatarColor;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: { id: true, name: true, email: true, bio: true, avatarColor: true },
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/profile/:userId
 * Public profile for any user (includes same season stats)
 */
router.get('/profile/:userId', async (req, res) => {
  try {
    const { season } = req.query;
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: {
        id: true,
        name: true,
        bio: true,
        avatarColor: true,
        createdAt: true,
        achievements: true,
        leagues: {
          include: { league: { select: { id: true, name: true, season: true } } },
        },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const seasonStats = await computeSeasonStats(req.params.userId, user.leagues, season);

    res.json({
      ...user,
      stats: {
        ...seasonStats,
        achievementCount: user.achievements.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ LEAGUE STATS ============

/**
 * GET /api/leagues/:leagueId/stats
 * Detailed per-user stats for a league (points per round, captain hits, etc.)
 */
router.get('/leagues/:leagueId/stats', async (req, res) => {
  try {
    const { leagueId } = req.params;
    const userId = req.user.id;

    // Verify member
    const membership = await prisma.leagueUser.findUnique({
      where: { userId_leagueId: { userId, leagueId } },
    });
    if (!membership) return res.status(403).json({ error: 'Not a member' });

    const teams = await prisma.userWeeklyTeam.findMany({
      where: { userId, leagueId },
      orderBy: { week: 'asc' },
      include: {
        drivers: { include: { driver: { select: { id: true, name: true, abbr: true } } } },
        constructors: { include: { constructor: { select: { id: true, name: true } } } },
      },
    });

    const roundData = [];
    let cumulative = 0;

    for (const team of teams) {
      const driverIds = team.drivers.map(d => d.driverId);
      const results = await prisma.raceResult.findMany({
        where: { week: team.week, driverId: { in: driverIds } },
      });
      const conResult = team.constructors[0] ? await prisma.constructorRaceResult.findFirst({
        where: { week: team.week, constructorId: team.constructors[0].constructorId },
      }) : null;

      let points = results.reduce((s, r) => s + r.points, 0);
      let captainBonus = 0;
      if (team.captainId) {
        const capResult = results.find(r => r.driverId === team.captainId);
        if (capResult) {
          // triple_captain chip gives 3× (add 2 extra); regular captain gives 2× (add 1 extra)
          const extraMultiplier = team.chipUsed === 'triple_captain' ? 2 : 1;
          captainBonus = capResult.points * extraMultiplier;
        }
      }
      if (team.chipUsed === 'no_negative') points = Math.max(0, points);
      points += captainBonus;
      points += conResult?.totalPoints || 0;

      cumulative += points;

      const captainDriver = team.drivers.find(d => d.driverId === team.captainId);

      roundData.push({
        week: team.week,
        points,
        cumulative,
        captainId: team.captainId,
        captainName: captainDriver?.driver.name || null,
        captainBonus,
        chipUsed: team.chipUsed,
        driverCount: driverIds.length,
        budgetUsed: team.budgetUsed,
        drivers: team.drivers.map(d => ({
          id: d.driverId,
          name: d.driver.name,
          abbr: d.driver.abbr,
          isCaptain: d.driverId === team.captainId,
          points: results.find(r => r.driverId === d.driverId)?.points || 0,
        })),
        constructor: team.constructors[0] ? {
          name: team.constructors[0].constructor.name,
          points: conResult?.totalPoints || 0,
        } : null,
      });
    }

    // Overall stats
    const totalPoints = cumulative;
    const bestRound = roundData.reduce((best, r) => r.points > (best?.points || 0) ? r : best, null);
    const worstRound = roundData.filter(r => r.points >= 0).reduce((worst, r) => r.points < (worst?.points ?? Infinity) ? r : worst, null);
    const avgPoints = roundData.length > 0 ? Math.round(totalPoints / roundData.length) : 0;

    // If no rounds played, check whether results exist at all so the UI can show the right message
    let resultsExist = false;
    if (roundData.length === 0) {
      const anyResult = await prisma.raceResult.findFirst({ select: { id: true } });
      resultsExist = !!anyResult;
    }

    res.json({
      leagueId,
      userId,
      totalPoints,
      roundsPlayed: roundData.length,
      avgPoints,
      bestRound,
      worstRound,
      rounds: roundData,
      resultsExist,
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
