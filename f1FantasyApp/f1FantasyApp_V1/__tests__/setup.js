// __tests__/setup.js  — runs before every test file
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';

// Suppress console.error / console.log noise during tests.
// Remove these lines if you want to see full server output while debugging.
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

// Auto-mock prisma everywhere (resolves __mocks__/prisma.js)
jest.mock('../prisma');

// Prevent the background race-import job from firing during tests
jest.mock('../jobs/weeklyRaceImportJob', () => ({
  checkAndImportPastRounds: jest.fn().mockResolvedValue(undefined),
  startWeeklyRaceImportJob: jest.fn().mockResolvedValue(undefined),
  isRoundLocked: jest.fn().mockResolvedValue(false),
}));

// clearMocks: true in jest.config.js clears mock.calls/instances between tests.
// Require prisma so the mock module is loaded (needed for integration tests).
require('../prisma');
