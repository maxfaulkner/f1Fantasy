// __tests__/integration/profile.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const prisma = require('../../prisma');

const SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

function makeToken(id = 'user1', email = 'test@example.com') {
  return jwt.sign({ id, email }, SECRET, { expiresIn: '1h' });
}
const AUTH = (id = 'user1') => ({ Authorization: `Bearer ${makeToken(id)}` });

const BASE_USER = {
  id: 'user1',
  name: 'Test User',
  email: 'test@example.com',
  bio: null,
  avatarColor: '#e10600',
  createdAt: new Date('2026-01-01'),
  leagues: [
    { leagueId: 'lg1', league: { id: 'lg1', name: 'Main League', season: 2026 } },
  ],
  achievements: [],
};

const TEAM_WITH_RESULTS = {
  id: 'team1',
  userId: 'user1',
  leagueId: 'lg1',
  week: 1,
  captainId: 'd1',
  chipUsed: null,
  drivers: [
    { driverId: 'd1', driver: { id: 'd1', name: 'Max Verstappen' } },
    { driverId: 'd2', driver: { id: 'd2', name: 'Lewis Hamilton' } },
  ],
  constructors: [],
};

describe('GET /api/profile', () => {
  test('401: requires authentication', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(401);
  });

  test('200: returns profile with season stats', async () => {
    prisma.user.findUnique.mockResolvedValue(BASE_USER);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([TEAM_WITH_RESULTS]);
    prisma.raceResult.findMany.mockResolvedValue([
      { driverId: 'd1', points: 25 },
      { driverId: 'd2', points: 15 },
    ]);
    prisma.constructorRaceResult.findMany.mockResolvedValue([]);
    prisma.chip.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Test User');
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.totalPoints).toBe(65); // 15 + 25 (base) + 25 (captain bonus = 2x)
    expect(res.body.stats.roundsPlayed).toBe(1);
    expect(res.body.stats.bestRoundPoints).toBe(65);
    expect(res.body.stats.worstRoundPoints).toBe(65);
    expect(res.body.stats.activeSeason).toBe(2026);
    expect(res.body.stats.seasons).toEqual([2026]);
  });

  test('200: computes favourite driver from most-picked selection', async () => {
    const team2 = { ...TEAM_WITH_RESULTS, id: 'team2', week: 2 };
    prisma.user.findUnique.mockResolvedValue(BASE_USER);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([TEAM_WITH_RESULTS, team2]);
    prisma.raceResult.findMany.mockResolvedValue([
      { driverId: 'd1', points: 20 },
      { driverId: 'd2', points: 10 },
    ]);
    prisma.constructorRaceResult.findMany.mockResolvedValue([]);
    prisma.chip.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile').set(AUTH());

    expect(res.status).toBe(200);
    // Both d1 and d2 appear in both rounds (2 picks each), d1 is captain so it appears first
    expect(res.body.stats.favouriteDriver).toBeDefined();
    expect(res.body.stats.favouriteDriver.pickCount).toBe(2);
  });

  test('200: includes chips used in stats', async () => {
    prisma.user.findUnique.mockResolvedValue(BASE_USER);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([TEAM_WITH_RESULTS]);
    prisma.raceResult.findMany.mockResolvedValue([{ driverId: 'd1', points: 25 }]);
    prisma.constructorRaceResult.findMany.mockResolvedValue([]);
    prisma.chip.findMany.mockResolvedValue([
      { id: 'chip1', userId: 'user1', leagueId: 'lg1', type: 'wildcard', usedWeek: 3 },
    ]);

    const res = await request(app).get('/api/profile').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.stats.chipsUsed).toHaveLength(1);
    expect(res.body.stats.chipsUsed[0].type).toBe('wildcard');
    expect(res.body.stats.chipsUsed[0].week).toBe(3);
    expect(res.body.stats.chipsUsed[0].leagueName).toBe('Main League');
  });

  test('200: filters stats to requested season', async () => {
    const userWithTwoSeasons = {
      ...BASE_USER,
      leagues: [
        { leagueId: 'lg1', league: { id: 'lg1', name: 'League 2026', season: 2026 } },
        { leagueId: 'lg2', league: { id: 'lg2', name: 'League 2025', season: 2025 } },
      ],
    };
    prisma.user.findUnique.mockResolvedValue(userWithTwoSeasons);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([]);
    prisma.chip.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile?season=2025').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.stats.activeSeason).toBe(2025);
    expect(res.body.stats.seasons).toEqual([2026, 2025]);
  });

  test('200: defaults to most recent season when no season param', async () => {
    const userWithTwoSeasons = {
      ...BASE_USER,
      leagues: [
        { leagueId: 'lg1', league: { id: 'lg1', name: 'League 2026', season: 2026 } },
        { leagueId: 'lg2', league: { id: 'lg2', name: 'League 2025', season: 2025 } },
      ],
    };
    prisma.user.findUnique.mockResolvedValue(userWithTwoSeasons);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([]);
    prisma.chip.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.stats.activeSeason).toBe(2026);
  });

  test('200: worst round tracks the minimum scored round', async () => {
    const team2 = { ...TEAM_WITH_RESULTS, id: 'team2', week: 2, captainId: null };
    prisma.user.findUnique.mockResolvedValue(BASE_USER);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([TEAM_WITH_RESULTS, team2]);
    // Week 1: 25+25(captain)+15 = 65; Week 2: 5+3 = 8
    prisma.raceResult.findMany
      .mockResolvedValueOnce([{ driverId: 'd1', points: 25 }, { driverId: 'd2', points: 15 }])
      .mockResolvedValueOnce([{ driverId: 'd1', points: 5 }, { driverId: 'd2', points: 3 }]);
    prisma.constructorRaceResult.findMany.mockResolvedValue([]);
    prisma.chip.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.stats.worstRoundPoints).toBe(8);
    expect(res.body.stats.bestRoundPoints).toBe(65);
  });

  test('200: returns zero stats when user has no leagues', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...BASE_USER, leagues: [] });

    const res = await request(app).get('/api/profile').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.stats.totalPoints).toBe(0);
    expect(res.body.stats.roundsPlayed).toBe(0);
    expect(res.body.stats.favouriteDriver).toBeNull();
    expect(res.body.stats.chipsUsed).toEqual([]);
  });
});

describe('GET /api/profile/:userId', () => {
  test('401: requires authentication', async () => {
    const res = await request(app).get('/api/profile/user2');
    expect(res.status).toBe(401);
  });

  test('404: returns error for unknown user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/profile/nobody').set(AUTH());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user not found/i);
  });

  test('200: returns public profile with season stats', async () => {
    const publicUser = {
      id: 'user2',
      name: 'Other User',
      bio: null,
      avatarColor: '#3671C6',
      createdAt: new Date('2026-02-01'),
      achievements: [],
      leagues: [
        { leagueId: 'lg1', league: { id: 'lg1', name: 'Main League', season: 2026 } },
      ],
    };
    prisma.user.findUnique.mockResolvedValue(publicUser);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([
      { ...TEAM_WITH_RESULTS, userId: 'user2' },
    ]);
    prisma.raceResult.findMany.mockResolvedValue([{ driverId: 'd1', points: 30 }]);
    prisma.constructorRaceResult.findMany.mockResolvedValue([]);
    prisma.chip.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile/user2').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Other User');
    expect(res.body.email).toBeUndefined();
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.activeSeason).toBe(2026);
    expect(res.body.stats.seasons).toEqual([2026]);
  });

  test('200: public profile does not expose email', async () => {
    const publicUser = {
      id: 'user2', name: 'Other User', bio: null, avatarColor: '#3671C6',
      createdAt: new Date('2026-02-01'), achievements: [],
      leagues: [{ leagueId: 'lg1', league: { id: 'lg1', name: 'Main League', season: 2026 } }],
    };
    prisma.user.findUnique.mockResolvedValue(publicUser);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([]);
    prisma.chip.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile/user2').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.email).toBeUndefined();
  });
});
