// __tests__/integration/optimal-team.test.js
// Tests for GET /api/leagues/:leagueId/optimal-team/:week

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const prisma = require('../../prisma');

const SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';
function auth() {
  return { Authorization: `Bearer ${jwt.sign({ id: 'user1', email: 't@t.com' }, SECRET)}` };
}

// Six drivers with prices that fit inside $100M with various point totals,
// plus two constructors. Optimal 5-driver pick = d1+d2+d3+d4+d5 (ignoring d6
// which has fewer points despite being cheaper).
const DRIVERS = [
  { id: 'd1', name: 'Driver One',   abbr: 'D1', points: 25, price: 15.0 },
  { id: 'd2', name: 'Driver Two',   abbr: 'D2', points: 20, price: 14.0 },
  { id: 'd3', name: 'Driver Three', abbr: 'D3', points: 18, price: 13.0 },
  { id: 'd4', name: 'Driver Four',  abbr: 'D4', points: 15, price: 12.0 },
  { id: 'd5', name: 'Driver Five',  abbr: 'D5', points: 12, price: 11.0 },
  { id: 'd6', name: 'Driver Six',   abbr: 'D6', points:  5, price:  5.0 },
];
const CONSTRUCTORS = [
  { id: 'c1', name: 'Alpha Team', points: 30, price: 30.0 },
  { id: 'c2', name: 'Beta Team',  points: 10, price:  5.0 },
];

function mockDriverResults() {
  return DRIVERS.map(d => ({
    driverId: d.id,
    points: d.points,
    driver: { id: d.id, name: d.name, abbr: d.abbr },
  }));
}

function mockConstructorResults() {
  return CONSTRUCTORS.map(c => ({
    constructorId: c.id,
    totalPoints: c.points,
    constructor: { id: c.id, name: c.name },
  }));
}

function mockDriverPrices() {
  return DRIVERS.map(d => ({ driverId: d.id, week: 1, price: d.price }));
}

function mockConstructorPrices() {
  return CONSTRUCTORS.map(c => ({ constructorId: c.id, week: 1, price: c.price }));
}

describe('GET /api/leagues/:leagueId/optimal-team/:week', () => {
  test('401: requires authentication', async () => {
    const res = await request(app).get('/api/leagues/lg1/optimal-team/1');
    expect(res.status).toBe(401);
  });

  test('403: non-member cannot access another league', async () => {
    prisma.leagueUser.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/leagues/lg1/optimal-team/1')
      .set(auth());
    expect(res.status).toBe(403);
  });

  test('400: returns 400 for non-numeric week', async () => {
    prisma.leagueUser.findUnique.mockResolvedValue({ id: 'lu1' });

    const res = await request(app)
      .get('/api/leagues/lg1/optimal-team/abc')
      .set(auth());
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid week/i);
  });

  test('404: returns 404 when no race results for week', async () => {
    prisma.leagueUser.findUnique.mockResolvedValue({ id: 'lu1' });
    prisma.raceResult.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/leagues/lg1/optimal-team/1')
      .set(auth());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no race results/i);
  });

  test('404: returns 404 when no valid team fits within budget', async () => {
    // Budget so tight ($10M) that no 5-driver + constructor combo fits
    prisma.leagueUser.findUnique.mockResolvedValue({ id: 'lu1' });
    prisma.raceResult.findFirst.mockResolvedValue({ id: 'rr1' });
    prisma.league.findUnique.mockResolvedValue({ budget: 10 });
    prisma.raceResult.findMany.mockResolvedValue(mockDriverResults());
    prisma.constructorRaceResult.findMany.mockResolvedValue(mockConstructorResults());
    prisma.driverPrice.findMany.mockResolvedValue(mockDriverPrices());
    prisma.constructorPrice.findMany.mockResolvedValue(mockConstructorPrices());
    prisma.driverPrice.findFirst.mockResolvedValue(null);
    prisma.constructorPrice.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/leagues/lg1/optimal-team/1')
      .set(auth());
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no valid team/i);
  });

  test('200: returns optimal team within budget', async () => {
    prisma.leagueUser.findUnique.mockResolvedValue({ id: 'lu1' });
    prisma.raceResult.findFirst.mockResolvedValue({ id: 'rr1' });
    prisma.league.findUnique.mockResolvedValue({ budget: 100 });
    prisma.raceResult.findMany.mockResolvedValue(mockDriverResults());
    prisma.constructorRaceResult.findMany.mockResolvedValue(mockConstructorResults());
    prisma.driverPrice.findMany.mockResolvedValue(mockDriverPrices());
    prisma.constructorPrice.findMany.mockResolvedValue(mockConstructorPrices());

    const res = await request(app)
      .get('/api/leagues/lg1/optimal-team/1')
      .set(auth());

    expect(res.status).toBe(200);
    expect(res.body.week).toBe(1);
    // Optimal 5 drivers: d1(25)+d2(20)+d3(18)+d4(15)+d5(12) = 90 pts, cost = 65
    // Best constructor within remaining 35M: c1 costs 30 (30 pts) → total = 120
    expect(res.body.totalPoints).toBe(120);
    expect(res.body.drivers).toHaveLength(5);
    expect(res.body.constructor).toBeDefined();
    expect(res.body.constructor.name).toBe('Alpha Team');
    const driverIds = res.body.drivers.map(d => d.id);
    expect(driverIds).toContain('d1');
    expect(driverIds).toContain('d2');
    expect(driverIds).toContain('d3');
    expect(driverIds).toContain('d4');
    expect(driverIds).toContain('d5');
    expect(driverIds).not.toContain('d6');
  });

  test('200: respects league budget cap — falls back to cheaper constructor', async () => {
    // Budget only $80M: d1+d2+d3+d4+d5 = $65M, c1 = $30M → $95M > $80M
    // So picks c2 ($5M, 10pts) → total = 90 + 10 = 100
    prisma.leagueUser.findUnique.mockResolvedValue({ id: 'lu1' });
    prisma.raceResult.findFirst.mockResolvedValue({ id: 'rr1' });
    prisma.league.findUnique.mockResolvedValue({ budget: 80 });
    prisma.raceResult.findMany.mockResolvedValue(mockDriverResults());
    prisma.constructorRaceResult.findMany.mockResolvedValue(mockConstructorResults());
    prisma.driverPrice.findMany.mockResolvedValue(mockDriverPrices());
    prisma.constructorPrice.findMany.mockResolvedValue(mockConstructorPrices());

    const res = await request(app)
      .get('/api/leagues/lg1/optimal-team/1')
      .set(auth());

    expect(res.status).toBe(200);
    // With budget=80: best 5 drivers still d1-d5 (65), only c2 (5) fits
    expect(res.body.totalPoints).toBe(100);
    expect(res.body.constructor.name).toBe('Beta Team');
  });

  test('200: response includes driver price and points fields', async () => {
    prisma.leagueUser.findUnique.mockResolvedValue({ id: 'lu1' });
    prisma.raceResult.findFirst.mockResolvedValue({ id: 'rr1' });
    prisma.league.findUnique.mockResolvedValue({ budget: 100 });
    prisma.raceResult.findMany.mockResolvedValue(mockDriverResults());
    prisma.constructorRaceResult.findMany.mockResolvedValue(mockConstructorResults());
    prisma.driverPrice.findMany.mockResolvedValue(mockDriverPrices());
    prisma.constructorPrice.findMany.mockResolvedValue(mockConstructorPrices());

    const res = await request(app)
      .get('/api/leagues/lg1/optimal-team/1')
      .set(auth());

    expect(res.status).toBe(200);
    const driver = res.body.drivers[0];
    expect(driver).toHaveProperty('id');
    expect(driver).toHaveProperty('name');
    expect(driver).toHaveProperty('points');
    expect(driver).toHaveProperty('price');
    expect(res.body.constructor).toHaveProperty('id');
    expect(res.body.constructor).toHaveProperty('name');
    expect(res.body.constructor).toHaveProperty('points');
    expect(res.body.constructor).toHaveProperty('price');
    expect(res.body).toHaveProperty('budget');
  });
});
