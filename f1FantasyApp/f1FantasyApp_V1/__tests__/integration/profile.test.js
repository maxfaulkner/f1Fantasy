// __tests__/integration/profile.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const prisma = require('../../prisma');

const SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

function makeToken(payload = { id: 'user1', email: 'test@example.com' }) {
  return jwt.sign(payload, SECRET, { expiresIn: '1h' });
}

const AUTH = () => ({ Authorization: `Bearer ${makeToken()}` });

const BASE_USER = {
  id: 'user1',
  name: 'Alice',
  email: 'alice@example.com',
  bio: 'F1 fan',
  avatarColor: '#e10600',
  createdAt: new Date('2025-01-01'),
  leagues: [
    { leagueId: 'lg1', league: { id: 'lg1', name: 'Test League', season: 2026 } },
  ],
  achievements: [],
};

const BASE_TEAM = {
  id: 'team1',
  userId: 'user1',
  leagueId: 'lg1',
  week: 1,
  captainId: 'd1',
  chipUsed: null,
  budgetUsed: 95.5,
  drivers: [
    { driverId: 'd1', driver: { id: 'd1', name: 'Max Verstappen' } },
    { driverId: 'd2', driver: { id: 'd2', name: 'Lewis Hamilton' } },
  ],
  constructors: [
    { constructorId: 'c1', constructor: { id: 'c1', name: 'Red Bull' } },
  ],
};

describe('GET /api/profile', () => {
  test('401: requires authentication', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(401);
  });

  test('200: returns profile with new season stats fields', async () => {
    prisma.user.findUnique.mockResolvedValue(BASE_USER);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([BASE_TEAM]);
    prisma.raceResult.findMany.mockResolvedValue([
      { driverId: 'd1', points: 25 },
      { driverId: 'd2', points: 18 },
    ]);
    prisma.constructorRaceResult.findMany.mockResolvedValue([
      { totalPoints: 43 },
    ]);

    const res = await request(app).get('/api/profile').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.totalPoints).toBe(25 + 25 + 18 + 43); // captain 2×: 25 extra, d2: 18, constructor: 43
    expect(res.body.stats.roundsPlayed).toBe(1);
    expect(res.body.stats.bestRoundPoints).toBe(res.body.stats.totalPoints);
    expect(res.body.stats.worstRoundPoints).toBe(res.body.stats.totalPoints);
    expect(res.body.stats.bestRoundWeek).toBe(1);
    expect(res.body.stats.worstRoundWeek).toBe(1);
    expect(res.body.stats.favouriteDriver).toEqual({ name: 'Max Verstappen', count: 1 });
    expect(res.body.stats.chipsUsed).toEqual([]);
    expect(res.body.availableSeasons).toEqual([2026]);
    expect(res.body.currentSeason).toBe(2026);
  });

  test('200: includes chip in chipsUsed when chipUsed is set', async () => {
    prisma.user.findUnique.mockResolvedValue(BASE_USER);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([
      { ...BASE_TEAM, chipUsed: 'wildcard' },
    ]);
    prisma.raceResult.findMany.mockResolvedValue([{ driverId: 'd1', points: 10 }]);
    prisma.constructorRaceResult.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.stats.chipsUsed).toEqual([{ week: 1, chip: 'wildcard' }]);
  });

  test('200: worstRoundPoints is 0 with no rounds played', async () => {
    prisma.user.findUnique.mockResolvedValue(BASE_USER);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.stats.roundsPlayed).toBe(0);
    expect(res.body.stats.worstRoundPoints).toBe(0);
    expect(res.body.stats.favouriteDriver).toBeNull();
  });

  test('200: ?season= param filters stats to specified season', async () => {
    const userWithTwoSeasons = {
      ...BASE_USER,
      leagues: [
        { leagueId: 'lg1', league: { id: 'lg1', name: 'League 2026', season: 2026 } },
        { leagueId: 'lg2', league: { id: 'lg2', name: 'League 2025', season: 2025 } },
      ],
    };
    prisma.user.findUnique.mockResolvedValue(userWithTwoSeasons);
    // Only return team for lg2 (season 2025) when that season is queried
    prisma.userWeeklyTeam.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile?season=2025').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.currentSeason).toBe(2025);
    expect(res.body.availableSeasons).toEqual([2026, 2025]);
    expect(res.body.stats.roundsPlayed).toBe(0);
  });
});

describe('GET /api/profile/:userId', () => {
  test('401: requires authentication', async () => {
    const res = await request(app).get('/api/profile/user2');
    expect(res.status).toBe(401);
  });

  test('404: returns 404 for unknown user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/profile/unknown').set(AUTH());
    expect(res.status).toBe(404);
  });

  test('200: returns public profile with season stats', async () => {
    const publicUser = {
      id: 'user2',
      name: 'Bob',
      bio: null,
      avatarColor: '#3671C6',
      createdAt: new Date('2025-03-01'),
      achievements: [],
      leagues: [
        { leagueId: 'lg1', league: { id: 'lg1', name: 'Test League', season: 2026 } },
      ],
    };
    prisma.user.findUnique.mockResolvedValue(publicUser);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile/user2').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Bob');
    expect(res.body.email).toBeUndefined();
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.roundsPlayed).toBe(0);
    expect(res.body.availableSeasons).toEqual([2026]);
    expect(res.body.currentSeason).toBe(2026);
  });
});
