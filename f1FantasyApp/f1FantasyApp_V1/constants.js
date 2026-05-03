const F1_POINTS = {
  1: 25, 2: 18, 3: 15, 4: 12, 5: 10,
  6: 8,  7: 6,  8: 4,  9: 2,  10: 1,
};

const SPRINT_POINTS = { 1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1 };

const CHIP_TYPES = ['wildcard', 'triple_captain', 'no_negative', 'bench_boost'];

const DEFAULT_BUDGET = 100; // millions

// Pricing formula: new_price = old_price * (1 + perf * PERF_WEIGHT + market * MARKET_WEIGHT)
const PRICING_PERF_WEIGHT = 0.15;
const PRICING_MARKET_WEIGHT = 0.08;
const MIN_DRIVER_PRICE = 0.5;

const DEFAULT_DRIVER_SEED_PRICE = 8.0;

module.exports = {
  F1_POINTS,
  SPRINT_POINTS,
  CHIP_TYPES,
  DEFAULT_BUDGET,
  PRICING_PERF_WEIGHT,
  PRICING_MARKET_WEIGHT,
  MIN_DRIVER_PRICE,
  DEFAULT_DRIVER_SEED_PRICE,
};
