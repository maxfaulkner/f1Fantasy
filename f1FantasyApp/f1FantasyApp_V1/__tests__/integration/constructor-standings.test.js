// __tests__/integration/constructor-standings.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const prisma = require('../../prisma');

jest.mock('../../services/f1DataService', () => ({
  fetchRaceResults: jest.fn(),
  fetchSprintResults: jest.fn(),
  fetchRaceResultsWithRetries: jest.fn(),
  mapF1DriverToLocal: jest.fn(),
  processRaceResults: jest.fn(),
  fetchConstructorStandings: jest.fn(),
}));
const f1DataService = require('../../services/f1DataService');

const SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';
function auth(userId = 'user1') {
  return { Authorization: `Bearer ${jwt.sign({ id: userId, email: 'test@example.com' }, SECRET)}` };
}

const leagueFixture = { id: 'lg1', season: 2026, startingRound: 1 };
const memberFixture = { id: 'mem1', userId: 'user1', leagueId: 'lg1', role: 'member' };
const constructorsFixture = [
  { id: 'ctor1', f1Id: 'mclaren', name: 'McLaren' },
  { id: 'ctor2', f1Id: 'ferrari', name: 'Ferrari' },
];
const wccFixture = [
  { position: 1, constructorId: 'mclaren', name: 'McLaren', points: 130, wins: 3 },
  { position: 2, constructorId: 'ferrari', name: 'Ferrari', points: 115, wins: 2 },
];

describe('GET /api/leagues/:leagueId/constructor-standings/:week', () => {
  test('401: requires authentication', async () => {
    const res = await request(app).get('/api/leagues/lg1/constructor-standings/1');
    expect(res.status).toBe(401);
  });

  test('403: non-member cannot access standings', async () => {
    prisma.leagueUser.findUnique.mockResolvedValue(null);
    prisma.league.findUnique.mockResolvedValue(leagueFixture);

    const res = await request(app)
      .get('/api/leagues/lg1/constructor-standings/1')
      .set(auth());
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Not a member');
  });

  test('404: unknown league returns 404', async () => {
    prisma.leagueUser.findUnique.mockResolvedValue(memberFixture);
    prisma.league.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/leagues/lg1/constructor-standings/1')
      .set(auth());
    expect(res.status).toBe(404);
  });

  describe('200: happy path', () => {
    beforeEach(() => {
      prisma.leagueUser.findUnique.mockResolvedValue(memberFixture);
      prisma.league.findUnique.mockResolvedValue(leagueFixture);
      f1DataService.fetchConstructorStandings.mockResolvedValue(wccFixture);
      prisma.constructor.findMany.mockResolvedValue(constructorsFixture);
      prisma.constructorRaceResult.findMany.mockResolvedValue([
        { constructorId: 'ctor1', totalPoints: 43 },
        { constructorId: 'ctor1', totalPoints: 37 },
        { constructorId: 'ctor2', totalPoints: 18 },
      ]);
      prisma.constructorPrice.findMany.mockResolvedValue([
        { constructorId: 'ctor1', price: 28.5 },
        { constructorId: 'ctor2', price: 22.0 },
      ]);
      prisma.leagueUser.count.mockResolvedValue(4);
      prisma.userWeeklyTeamConstructor.findMany.mockResolvedValue([
        { constructorId: 'ctor1' },
        { constructorId: 'ctor1' },
        { constructorId: 'ctor2' },
      ]);
    });

    test('200: returns constructors array with week and season', async () => {
      const res = await request(app)
        .get('/api/leagues/lg1/constructor-standings/3')
        .set(auth());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.constructors)).toBe(true);
      expect(res.body.week).toBe(3);
      expect(res.body.season).toBe(2026);
    });

    test('response shape: each constructor has required fields', async () => {
      const res = await request(app)
        .get('/api/leagues/lg1/constructor-standings/3')
        .set(auth());
      const ctor = res.body.constructors.find(c => c.f1Id === 'mclaren');
      expect(ctor).toBeDefined();
      expect(ctor).toHaveProperty('id');
      expect(ctor).toHaveProperty('f1Id', 'mclaren');
      expect(ctor).toHaveProperty('name', 'McLaren');
      expect(ctor).toHaveProperty('wccPosition', 1);
      expect(ctor).toHaveProperty('wccPoints', 130);
      expect(ctor).toHaveProperty('fantasyPoints');
      expect(ctor).toHaveProperty('price');
      expect(ctor).toHaveProperty('ownershipPct');
    });

    test('fantasy points accumulate across rounds up to and including the requested week', async () => {
      const res = await request(app)
        .get('/api/leagues/lg1/constructor-standings/3')
        .set(auth());
      const mclaren = res.body.constructors.find(c => c.f1Id === 'mclaren');
      expect(mclaren.fantasyPoints).toBe(80); // 43 + 37
    });

    test('ownership % = selections / member count rounded to whole number', async () => {
      const res = await request(app)
        .get('/api/leagues/lg1/constructor-standings/3')
        .set(auth());
      const mclaren = res.body.constructors.find(c => c.f1Id === 'mclaren');
      expect(mclaren.ownershipPct).toBe(50); // 2 out of 4 members
    });

    test('wccPosition is null when constructor not in Jolpica standings', async () => {
      f1DataService.fetchConstructorStandings.mockResolvedValue([]);
      const res = await request(app)
        .get('/api/leagues/lg1/constructor-standings/3')
        .set(auth());
      const ctor = res.body.constructors[0];
      expect(ctor.wccPosition).toBeNull();
      expect(ctor.wccPoints).toBeNull();
    });

    test('wccPosition and wccPoints are still null when Jolpica fetch throws', async () => {
      f1DataService.fetchConstructorStandings.mockRejectedValue(new Error('API down'));
      const res = await request(app)
        .get('/api/leagues/lg1/constructor-standings/3')
        .set(auth());
      expect(res.status).toBe(200);
      const ctor = res.body.constructors[0];
      expect(ctor.wccPosition).toBeNull();
      expect(ctor.wccPoints).toBeNull();
    });

    test('price falls back to most recent available week when requested week has no prices', async () => {
      prisma.constructorPrice.findMany.mockResolvedValueOnce([]); // no prices for week 5
      prisma.constructorPrice.findFirst.mockResolvedValue({ week: 3 });
      prisma.constructorPrice.findMany.mockResolvedValueOnce([
        { constructorId: 'ctor1', price: 27.0 },
      ]);

      const res = await request(app)
        .get('/api/leagues/lg1/constructor-standings/5')
        .set(auth());
      expect(res.status).toBe(200);
      const ctor = res.body.constructors.find(c => c.f1Id === 'mclaren');
      expect(ctor.price).toBe(27.0);
    });

    test('fantasyPoints is 0 for a constructor with no race results', async () => {
      prisma.constructorRaceResult.findMany.mockResolvedValue([]);
      const res = await request(app)
        .get('/api/leagues/lg1/constructor-standings/1')
        .set(auth());
      const ctor = res.body.constructors[0];
      expect(ctor.fantasyPoints).toBe(0);
    });
  });
});
