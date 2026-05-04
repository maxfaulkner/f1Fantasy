const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const prisma = require('../../prisma');

const SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

function makeToken(payload = { id: 'user1', email: 'test@example.com' }) {
  return jwt.sign(payload, SECRET, { expiresIn: '1h' });
}

const AUTH = () => ({ Authorization: `Bearer ${makeToken()}` });

const baseUser = {
  id: 'user1',
  name: 'Alice',
  email: 'alice@example.com',
  bio: 'F1 fan',
  avatarColor: '#e10600',
  createdAt: new Date('2026-01-01'),
  leagues: [
    { leagueId: 'lg1', league: { id: 'lg1', name: 'Main League', season: 2026 } },
  ],
  achievements: [],
};

// captain is driver1 (no chip): driver points: d1=25, d2=10
// roundPts = 25+10=35, captainBonus = 25*1 = 25, total = 60, + con 30 = 90
const baseTeam = {
  id: 'team1',
  userId: 'user1',
  leagueId: 'lg1',
  week: 1,
  budgetUsed: 98,
  captainId: 'driver1',
  chipUsed: null,
  drivers: [
    { driverId: 'driver1', driver: { id: 'driver1', name: 'Verstappen' } },
    { driverId: 'driver2', driver: { id: 'driver2', name: 'Hamilton' } },
  ],
  constructors: [
    { constructorId: 'con1', constructor: { id: 'con1', name: 'Red Bull' } },
  ],
};

describe('GET /api/profile', () => {
  test('401: requires authentication', async () => {
    const res = await request(app).get('/api/profile');
    expect(res.status).toBe(401);
  });

  test('200: returns profile with extended season stats', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([baseTeam]);
    prisma.raceResult.findMany.mockResolvedValue([
      { driverId: 'driver1', points: 25 },
      { driverId: 'driver2', points: 10 },
    ]);
    prisma.constructorRaceResult.findMany.mockResolvedValue([{ totalPoints: 30 }]);
    prisma.chip.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Alice');
    expect(res.body.stats.totalPoints).toBe(90);
    expect(res.body.stats.roundsPlayed).toBe(1);
    expect(res.body.stats.bestRoundPoints).toBe(90);
    expect(res.body.stats.worstRoundPoints).toBe(90);
    expect(res.body.stats.avgPoints).toBe(90);
    expect(res.body.stats.seasons).toEqual([2026]);
    expect(res.body.stats.currentSeason).toBe(2026);
    expect(res.body.stats.chipsTimeline).toEqual([]);
  });

  test('200: computes favourite driver as most-selected across teams', async () => {
    // team1: driver1 + driver2, team2: driver1 only
    const team2 = {
      ...baseTeam,
      id: 'team2',
      week: 2,
      drivers: [{ driverId: 'driver1', driver: { id: 'driver1', name: 'Verstappen' } }],
    };

    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([baseTeam, team2]);
    prisma.raceResult.findMany
      .mockResolvedValueOnce([{ driverId: 'driver1', points: 20 }, { driverId: 'driver2', points: 10 }])
      .mockResolvedValueOnce([{ driverId: 'driver1', points: 15 }]);
    prisma.constructorRaceResult.findMany
      .mockResolvedValueOnce([{ totalPoints: 20 }])
      .mockResolvedValueOnce([{ totalPoints: 15 }]);
    prisma.chip.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile').set(AUTH());

    expect(res.status).toBe(200);
    // driver1 appears in both teams (count=2), driver2 only in team1 (count=1)
    expect(res.body.stats.favouriteDriver).toMatchObject({ name: 'Verstappen', rounds: 2 });
  });

  test('200: includes chips timeline for used chips', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([baseTeam]);
    prisma.raceResult.findMany.mockResolvedValue([{ driverId: 'driver1', points: 20 }]);
    prisma.constructorRaceResult.findMany.mockResolvedValue([]);
    prisma.chip.findMany.mockResolvedValue([
      { id: 'chip1', type: 'wildcard', usedWeek: 1, leagueId: 'lg1' },
    ]);

    const res = await request(app).get('/api/profile').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.stats.chipsTimeline).toHaveLength(1);
    expect(res.body.stats.chipsTimeline[0]).toMatchObject({
      type: 'wildcard',
      week: 1,
      leagueName: 'Main League',
    });
  });

  test('200: worstRoundPoints is the lowest scoring round', async () => {
    const team2 = { ...baseTeam, id: 'team2', week: 2 };

    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([baseTeam, team2]);
    // round1: captain (driver1) gets 50 pts → 50 + 50 bonus = 100
    prisma.raceResult.findMany
      .mockResolvedValueOnce([{ driverId: 'driver1', points: 50 }])
      .mockResolvedValueOnce([{ driverId: 'driver1', points: 5 }]);
    prisma.constructorRaceResult.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.chip.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.stats.bestRoundPoints).toBe(100);
    expect(res.body.stats.worstRoundPoints).toBe(10);
  });

  test('200: filters stats to the requested season', async () => {
    const userWithTwoSeasons = {
      ...baseUser,
      leagues: [
        { leagueId: 'lg1', league: { id: 'lg1', name: 'Main League', season: 2026 } },
        { leagueId: 'lg2', league: { id: 'lg2', name: 'Old League', season: 2025 } },
      ],
    };
    const oldTeam = { ...baseTeam, id: 'old1', leagueId: 'lg2', week: 5 };

    prisma.user.findUnique.mockResolvedValue(userWithTwoSeasons);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([oldTeam]);
    prisma.raceResult.findMany.mockResolvedValue([{ driverId: 'driver1', points: 12 }]);
    prisma.constructorRaceResult.findMany.mockResolvedValue([]);
    prisma.chip.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile?season=2025').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.stats.currentSeason).toBe(2025);
    expect(res.body.stats.seasons).toEqual([2025, 2026]);
    // driver1 (12pts) + captain bonus (12pts) = 24 total
    expect(res.body.stats.totalPoints).toBe(24);
    expect(res.body.stats.roundsPlayed).toBe(1);
    // user is in 2 leagues total but only 1 belongs to the 2025 season
    expect(res.body.stats.leagueCount).toBe(1);
  });

  test('404: user not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/profile').set(AUTH());
    expect(res.status).toBe(404);
  });
});

describe('GET /api/profile/:userId', () => {
  test('401: requires authentication', async () => {
    const res = await request(app).get('/api/profile/user2');
    expect(res.status).toBe(401);
  });

  test('200: returns public profile with season stats (no email field)', async () => {
    const publicUser = {
      id: 'user2',
      name: 'Bob',
      bio: 'Race fan',
      avatarColor: '#3671C6',
      createdAt: new Date('2026-02-01'),
      achievements: [],
      leagues: [
        { leagueId: 'lg1', league: { id: 'lg1', name: 'Main League', season: 2026 } },
      ],
    };
    const bobTeam = { ...baseTeam, id: 'bob1', userId: 'user2' };

    prisma.user.findUnique.mockResolvedValue(publicUser);
    prisma.userWeeklyTeam.findMany.mockResolvedValue([bobTeam]);
    prisma.raceResult.findMany.mockResolvedValue([{ driverId: 'driver1', points: 18 }]);
    prisma.constructorRaceResult.findMany.mockResolvedValue([{ totalPoints: 10 }]);
    prisma.chip.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/profile/user2').set(AUTH());

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Bob');
    expect(res.body.email).toBeUndefined();
    expect(res.body.stats.seasons).toEqual([2026]);
    expect(res.body.stats.currentSeason).toBe(2026);
    expect(res.body.stats.worstRoundPoints).toBeDefined();
    expect(res.body.stats.favouriteDriver).toMatchObject({ name: 'Verstappen' });
    expect(res.body.stats.chipsTimeline).toEqual([]);
  });

  test('404: user not found', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/profile/nobody').set(AUTH());
    expect(res.status).toBe(404);
  });
});
