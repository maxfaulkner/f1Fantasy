// __tests__/unit/services/pricingEngine.test.js
// Prisma is auto-mocked via __mocks__/prisma.js + setup.js
const prisma = require('../../../prisma');
const { F1_POINTS, DEFAULT_DRIVER_SEED_PRICE } = require('../../../constants');
const {
  getExpectedPosition,
  calculatePerformanceDelta,
  calculateMarketPressure,
  updateDriverPrice,
} = require('../../../services/pricingEngine');

const mockDriver = {
  id: 'driver1',
  name: 'Test Driver',
  constructorId: 'ctor1',
  skillTier: 1.0,
};

describe('F1_POINTS table', () => {
  test('P1 scores 25 points', () => expect(F1_POINTS[1]).toBe(25));
  test('P2 scores 18 points', () => expect(F1_POINTS[2]).toBe(18));
  test('P10 scores 1 point', () => expect(F1_POINTS[10]).toBe(1));
  test('P11 is undefined (no points)', () => expect(F1_POINTS[11]).toBeUndefined());
});

describe('getExpectedPosition', () => {
  test('returns baseline 12 for first week with skillTier <= 1', async () => {
    prisma.raceResult.findMany.mockResolvedValue([]);
    const pos = await getExpectedPosition({ ...mockDriver, skillTier: 1.0 }, 'lg1', 1);
    expect(pos).toBe(12);
  });

  test('returns baseline 8 for first week with skillTier > 1', async () => {
    prisma.raceResult.findMany.mockResolvedValue([]);
    const pos = await getExpectedPosition({ ...mockDriver, skillTier: 1.2 }, 'lg1', 1);
    expect(pos).toBe(8);
  });

  test('calculates average from previous results', async () => {
    prisma.raceResult.findMany.mockResolvedValue([
      { finishingPosition: 2 },
      { finishingPosition: 4 },
    ]);
    // avg = 3, skillTier = 1.0 → adjusted = 3 / 1.0 = 3
    const pos = await getExpectedPosition({ ...mockDriver, skillTier: 1.0 }, 'lg1', 3);
    expect(pos).toBe(3);
  });

  test('adjusts position by skillTier', async () => {
    prisma.raceResult.findMany.mockResolvedValue([
      { finishingPosition: 10 },
      { finishingPosition: 10 },
    ]);
    // avg = 10, skillTier = 2.0 → adjusted = 10 / 2.0 = 5
    const pos = await getExpectedPosition({ ...mockDriver, skillTier: 2.0 }, 'lg1', 3);
    expect(pos).toBe(5);
  });
});

describe('calculatePerformanceDelta', () => {
  test('returns positive delta when driver beats expectation', async () => {
    prisma.raceResult.findMany.mockResolvedValue([{ finishingPosition: 10 }]);
    // expected ~10, finishes P5 → beat by 5 → normalizedDelta = (5-10)/5 = -1 → flipped = +1
    const delta = await calculatePerformanceDelta(
      { ...mockDriver, skillTier: 1.0 }, 5, 'lg1', 3
    );
    expect(delta).toBeGreaterThan(0);
  });

  test('returns negative delta when driver underperforms', async () => {
    prisma.raceResult.findMany.mockResolvedValue([{ finishingPosition: 3 }]);
    // expected ~3, finishes P10 → worse by 7 → capped at +1 → flipped = -1
    const delta = await calculatePerformanceDelta(
      { ...mockDriver, skillTier: 1.0 }, 10, 'lg1', 3
    );
    expect(delta).toBeLessThan(0);
  });

  test('delta is clamped to [-1, +1] range', async () => {
    prisma.raceResult.findMany.mockResolvedValue([{ finishingPosition: 1 }]);
    const delta = await calculatePerformanceDelta(
      { ...mockDriver, skillTier: 1.0 }, 20, 'lg1', 3
    );
    expect(delta).toBeGreaterThanOrEqual(-1);
    expect(delta).toBeLessThanOrEqual(1);
  });
});

describe('calculateMarketPressure', () => {
  test('returns 0 when no teams exist', async () => {
    prisma.userWeeklyTeamDriver.count.mockResolvedValue(0);
    prisma.userWeeklyTeam.count.mockResolvedValue(0);
    const pressure = await calculateMarketPressure('d1', 'lg1', 1);
    expect(pressure).toBe(0);
  });

  test('returns positive pressure when driver is widely selected', async () => {
    prisma.userWeeklyTeamDriver.count.mockResolvedValue(8); // 8/10 selected
    prisma.userWeeklyTeam.count.mockResolvedValue(10);
    const pressure = await calculateMarketPressure('d1', 'lg1', 1);
    // selectionRate = 0.8 → (0.8 - 0.5) * 2 = +0.6
    expect(pressure).toBeCloseTo(0.6, 5);
  });

  test('returns negative pressure when driver is rarely selected', async () => {
    prisma.userWeeklyTeamDriver.count.mockResolvedValue(1); // 1/10
    prisma.userWeeklyTeam.count.mockResolvedValue(10);
    const pressure = await calculateMarketPressure('d1', 'lg1', 1);
    // selectionRate = 0.1 → (0.1 - 0.5) * 2 = -0.8
    expect(pressure).toBeCloseTo(-0.8, 5);
  });

  test('returns 0 at exactly 50% selection rate', async () => {
    prisma.userWeeklyTeamDriver.count.mockResolvedValue(5);
    prisma.userWeeklyTeam.count.mockResolvedValue(10);
    const pressure = await calculateMarketPressure('d1', 'lg1', 1);
    expect(pressure).toBeCloseTo(0, 5);
  });
});

describe('updateDriverPrice', () => {
  test('seeds a $8M default price and does NOT throw when no price exists for any week', async () => {
    // Both findUnique (exact week) and findFirst (fallback) return null — driver has zero price records
    prisma.driverPrice.findUnique.mockResolvedValue(null);
    prisma.driverPrice.findFirst.mockResolvedValue(null);
    prisma.driverPrice.upsert.mockResolvedValue({ driverId: mockDriver.id, week: 2, price: DEFAULT_DRIVER_SEED_PRICE });
    prisma.raceResult.findMany.mockResolvedValue([]);
    prisma.userWeeklyTeamDriver.count.mockResolvedValue(0);
    prisma.userWeeklyTeam.count.mockResolvedValue(0);
    prisma.pricingAuditLog.create.mockResolvedValue({});

    // Must NOT throw — should use DEFAULT_DRIVER_SEED_PRICE and return a valid new price
    const newPrice = await updateDriverPrice(mockDriver, 5, 'lg1', 2);
    expect(typeof newPrice).toBe('number');
    expect(newPrice).toBeGreaterThanOrEqual(0.5);
    // Confirm upsert was called to seed the default
    expect(prisma.driverPrice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { driverId_week: { driverId: mockDriver.id, week: 2 } },
        create: expect.objectContaining({ price: DEFAULT_DRIVER_SEED_PRICE }),
      })
    );
  });

  test('falls back to previous-week price when current week price is missing (regression: week-2 import)', async () => {
    // Simulates importing week-2 results when only week-1 prices were seeded
    prisma.driverPrice.findUnique.mockResolvedValue(null); // no week-2 price
    prisma.driverPrice.findFirst.mockResolvedValue({ price: 8.5, week: 1 }); // week-1 fallback
    prisma.raceResult.findMany.mockResolvedValue([]);
    prisma.userWeeklyTeamDriver.count.mockResolvedValue(0);
    prisma.userWeeklyTeam.count.mockResolvedValue(0);
    prisma.pricingAuditLog.create.mockResolvedValue({});

    // Should NOT throw — uses week-1 price as base
    const newPrice = await updateDriverPrice(mockDriver, 5, 'lg1', 2);
    expect(typeof newPrice).toBe('number');
    expect(newPrice).toBeGreaterThanOrEqual(0.5);
    // Confirm findFirst was called as the fallback
    expect(prisma.driverPrice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ driverId: mockDriver.id }) })
    );
  });

  test('applies pricing formula and enforces $0.5M floor', async () => {
    prisma.driverPrice.findUnique.mockResolvedValue({ price: 5.0 });
    prisma.raceResult.findMany.mockResolvedValue([]); // first week → baseline
    prisma.userWeeklyTeamDriver.count.mockResolvedValue(0);
    prisma.userWeeklyTeam.count.mockResolvedValue(0);
    prisma.pricingAuditLog.create.mockResolvedValue({});

    const newPrice = await updateDriverPrice(mockDriver, 12, 'lg1', 1);
    // Result must be a positive number and at least $0.5M
    expect(typeof newPrice).toBe('number');
    expect(newPrice).toBeGreaterThanOrEqual(0.5);
  });

  test('price is at least the $0.5M floor even on catastrophic performance', async () => {
    // Give a very low starting price so the formula would push it below floor
    prisma.driverPrice.findUnique.mockResolvedValue({ price: 0.6 });
    prisma.raceResult.findMany.mockResolvedValue([{ finishingPosition: 1 }]);
    // Driver expected P1 but finishes P20 → very negative delta
    prisma.userWeeklyTeamDriver.count.mockResolvedValue(0);
    prisma.userWeeklyTeam.count.mockResolvedValue(0);
    prisma.pricingAuditLog.create.mockResolvedValue({});

    const newPrice = await updateDriverPrice(mockDriver, 20, 'lg1', 2);
    expect(newPrice).toBeGreaterThanOrEqual(0.5);
  });

  test('creates a pricingAuditLog entry', async () => {
    prisma.driverPrice.findUnique.mockResolvedValue({ price: 10.0 });
    prisma.raceResult.findMany.mockResolvedValue([]);
    prisma.userWeeklyTeamDriver.count.mockResolvedValue(5);
    prisma.userWeeklyTeam.count.mockResolvedValue(10);
    prisma.pricingAuditLog.create.mockResolvedValue({});

    await updateDriverPrice(mockDriver, 5, 'lg1', 1);
    expect(prisma.pricingAuditLog.create).toHaveBeenCalledTimes(1);
    const callArg = prisma.pricingAuditLog.create.mock.calls[0][0].data;
    expect(callArg.leagueId).toBe('lg1');
    expect(callArg.driverId).toBe('driver1');
    expect(callArg.oldPrice).toBe(10.0);
  });
});
