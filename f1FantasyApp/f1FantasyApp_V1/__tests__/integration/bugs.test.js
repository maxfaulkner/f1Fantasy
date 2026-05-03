// __tests__/integration/bugs.test.js
// Regression tests for bugs found during manual user-flow exploration.
// Each describe block references the specific bug it guards against.

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const prisma = require('../../prisma');

const SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';
function auth(id = 'user1') {
  return { Authorization: `Bearer ${jwt.sign({ id, email: 't@t.com' }, SECRET)}` };
}

const VALID_DRIVERS = ['d1', 'd2', 'd3', 'd4', 'd5'];
const CONSTRUCTOR_ID = 'ctor1';

// ─── Bug: team submission crashes (500) when no constructor price exists for
// the exact week. The fix falls back to findFirst with week <= requested week.
describe('POST /api/leagues/:leagueId/team/:week — constructor price fallback', () => {
  beforeEach(() => {
    prisma.userWeeklyTeam.findUnique.mockResolvedValue(null); // not locked
    prisma.driverPrice.findMany.mockResolvedValue(
      VALID_DRIVERS.map(id => ({ driverId: id, price: 10 }))
    );
  });

  test('falls back to findFirst when exact-week constructor price is missing', async () => {
    // Simulate: no price for week 3 exactly, but price exists at week 1
    prisma.constructorPrice.findUnique.mockResolvedValue(null);
    prisma.constructorPrice.findFirst.mockResolvedValue({ constructorId: CONSTRUCTOR_ID, week: 1, price: 20 });

    const savedTeam = { id: 'team1', userId: 'user1', leagueId: 'lg1', week: 3, budgetUsed: 70, captainId: null, chipUsed: null };
    prisma.userWeeklyTeam.upsert.mockResolvedValue(savedTeam);
    prisma.userWeeklyTeamDriver.deleteMany.mockResolvedValue({});
    prisma.userWeeklyTeamConstructor.deleteMany.mockResolvedValue({});
    prisma.userWeeklyTeamDriver.create.mockResolvedValue({});
    prisma.userWeeklyTeamConstructor.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/leagues/lg1/team/3')
      .set(auth())
      .send({ drivers: VALID_DRIVERS, constructorId: CONSTRUCTOR_ID });

    // Must succeed (not crash with 500)
    expect(res.status).toBe(200);
    expect(prisma.constructorPrice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ constructorId: CONSTRUCTOR_ID }) })
    );
  });

  test('returns 400 (not 500) when no constructor price exists for any week', async () => {
    prisma.constructorPrice.findUnique.mockResolvedValue(null);
    prisma.constructorPrice.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/leagues/lg1/team/3')
      .set(auth())
      .send({ drivers: VALID_DRIVERS, constructorId: CONSTRUCTOR_ID });

    // Must be a clean 400, not an unhandled 500
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/price not found.*constructor/i);
  });
});

// ─── Bug: team submission crashes (500) when a selected driver has no price
// for the exact week. The fix falls back to findFirst for missing drivers.
describe('POST /api/leagues/:leagueId/team/:week — driver price fallback', () => {
  beforeEach(() => {
    prisma.userWeeklyTeam.findUnique.mockResolvedValue(null);
  });

  test('falls back to findFirst for a driver missing an exact-week price', async () => {
    // Only 4 drivers have a price for week 3; d5 must fall back
    prisma.driverPrice.findMany.mockResolvedValue(
      ['d1', 'd2', 'd3', 'd4'].map(id => ({ driverId: id, price: 10 }))
    );
    prisma.driverPrice.findFirst.mockResolvedValue({ driverId: 'd5', week: 1, price: 9 });
    prisma.constructorPrice.findUnique.mockResolvedValue({ constructorId: CONSTRUCTOR_ID, week: 3, price: 20 });

    const savedTeam = { id: 'team1', userId: 'user1', leagueId: 'lg1', week: 3, budgetUsed: 69, captainId: null, chipUsed: null };
    prisma.userWeeklyTeam.upsert.mockResolvedValue(savedTeam);
    prisma.userWeeklyTeamDriver.deleteMany.mockResolvedValue({});
    prisma.userWeeklyTeamConstructor.deleteMany.mockResolvedValue({});
    prisma.userWeeklyTeamDriver.create.mockResolvedValue({});
    prisma.userWeeklyTeamConstructor.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/leagues/lg1/team/3')
      .set(auth())
      .send({ drivers: VALID_DRIVERS, constructorId: CONSTRUCTOR_ID });

    expect(res.status).toBe(200);
    expect(prisma.driverPrice.findFirst).toHaveBeenCalled();
  });

  test('returns 400 (not 500) when a driver has no price for any week', async () => {
    // Only 4 driver prices exist; d5 has no price at all
    prisma.driverPrice.findMany.mockResolvedValue(
      ['d1', 'd2', 'd3', 'd4'].map(id => ({ driverId: id, price: 10 }))
    );
    prisma.driverPrice.findFirst.mockResolvedValue(null); // no fallback for d5
    prisma.constructorPrice.findUnique.mockResolvedValue({ price: 20 });

    const res = await request(app)
      .post('/api/leagues/lg1/team/3')
      .set(auth())
      .send({ drivers: VALID_DRIVERS, constructorId: CONSTRUCTOR_ID });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/price not found/i);
  });
});

// ─── Bug: POST /api/admin/races/:leagueId/:week had no authorization check.
// Any authenticated user could import race results for any league.
describe('POST /api/admin/races/:leagueId/:week — authorization', () => {
  test('401: requires authentication', async () => {
    const res = await request(app)
      .post('/api/admin/races/lg1/1')
      .send({ results: [] });
    expect(res.status).toBe(401);
  });

  test('403: rejects non-commissioner members', async () => {
    prisma.leagueUser.findUnique.mockResolvedValue({ userId: 'user1', leagueId: 'lg1', role: 'member' });

    const res = await request(app)
      .post('/api/admin/races/lg1/1')
      .set(auth())
      .send({ results: [{ driverId: 'd1', finishingPosition: 1 }] });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/commissioner/i);
  });

  test('403: rejects users who are not members of the league', async () => {
    prisma.leagueUser.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/admin/races/lg1/1')
      .set(auth())
      .send({ results: [{ driverId: 'd1', finishingPosition: 1 }] });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/commissioner/i);
  });
});

describe('GET /api/leagues/:leagueId/activity', () => {
  test('403: rejects requests from non-members', async () => {
    prisma.leagueUser.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/leagues/lg1/activity')
      .set(auth());

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not a member/i);
  });

  test('200: returns events array containing team, result, and member_joined events', async () => {
    prisma.leagueUser.findUnique.mockResolvedValue({ userId: 'user1', leagueId: 'lg1' });
    prisma.userWeeklyTeam.findMany.mockResolvedValue([{
      id: 'team1', week: 2, updatedAt: new Date('2026-04-01T12:00:00Z'),
      user: { id: 'user1', name: 'Alice' },
    }]);
    prisma.raceResult.findMany.mockResolvedValue([{
      week: 1, createdAt: new Date('2026-03-20T16:00:00Z'),
    }]);
    prisma.leagueMessage.findMany.mockResolvedValue([]);
    prisma.leagueUser.findMany.mockResolvedValue([{
      userId: 'user2',
      joinedAt: new Date('2026-03-10T10:00:00Z'),
      user: { id: 'user2', name: 'Bob' },
    }]);

    const res = await request(app)
      .get('/api/leagues/lg1/activity')
      .set(auth());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    const types = res.body.events.map(e => e.type);
    expect(types).toContain('team_submitted');
    expect(types).toContain('results_imported');
    expect(types).toContain('member_joined');
  });

  test('200: includes chat_message events when messages exist', async () => {
    prisma.leagueUser.findUnique.mockResolvedValue({ userId: 'user1', leagueId: 'lg1' });
    prisma.userWeeklyTeam.findMany.mockResolvedValue([]);
    prisma.raceResult.findMany.mockResolvedValue([]);
    prisma.leagueMessage.findMany.mockResolvedValue([{
      id: 'msg1',
      content: 'Great race everyone!',
      createdAt: new Date('2026-04-02T09:00:00Z'),
      user: { id: 'user1', name: 'Alice' },
    }]);
    prisma.leagueUser.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/leagues/lg1/activity')
      .set(auth());

    expect(res.status).toBe(200);
    const chatEvents = res.body.events.filter(e => e.type === 'chat_message');
    expect(chatEvents.length).toBeGreaterThan(0);
    expect(chatEvents[0].title).toContain('Alice');
    expect(chatEvents[0].userId).toBe('user1');
  });
});

// ─── Bug: GET /api/leagues/stats triple_captain chip was ignored —
// always applied 2× captain bonus regardless of chip used.
describe('GET /api/leagues/:leagueId/stats — triple_captain chip applied correctly', () => {
  beforeEach(() => {
    // Satisfy membership check
    prisma.leagueUser.findUnique.mockResolvedValue({ userId: 'user1', leagueId: 'lg1', role: 'member' });
  });

  test('applies 2× captain bonus without any chip', async () => {
    prisma.userWeeklyTeam.findMany.mockResolvedValue([{
      id: 'team1', userId: 'user1', leagueId: 'lg1', week: 1,
      captainId: 'd1', chipUsed: null,
      drivers: [
        { driverId: 'd1', driver: { id: 'd1', name: 'Driver 1', abbr: 'DRV' } },
      ],
      constructors: [],
    }]);
    // d1 scored 20 pts
    prisma.raceResult.findMany.mockResolvedValue([{ driverId: 'd1', points: 20 }]);
    prisma.constructorRaceResult.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/leagues/lg1/stats')
      .set(auth());

    expect(res.status).toBe(200);
    // 20 base + 20 captain bonus = 40 total
    expect(res.body.totalPoints).toBe(40);
    expect(res.body.rounds[0].captainBonus).toBe(20);
  });

  test('applies 3× captain bonus with triple_captain chip', async () => {
    prisma.userWeeklyTeam.findMany.mockResolvedValue([{
      id: 'team1', userId: 'user1', leagueId: 'lg1', week: 1,
      captainId: 'd1', chipUsed: 'triple_captain',
      drivers: [
        { driverId: 'd1', driver: { id: 'd1', name: 'Driver 1', abbr: 'DRV' } },
      ],
      constructors: [],
    }]);
    prisma.raceResult.findMany.mockResolvedValue([{ driverId: 'd1', points: 20 }]);
    prisma.constructorRaceResult.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/leagues/lg1/stats')
      .set(auth());

    expect(res.status).toBe(200);
    // 20 base + 40 captain bonus (2× extra for triple_captain) = 60 total
    expect(res.body.totalPoints).toBe(60);
    expect(res.body.rounds[0].captainBonus).toBe(40);
  });
});
