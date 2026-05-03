// server.js — production entry point: connects DB, starts scheduler
require('dotenv').config();
const prisma = require('./prisma');
const app = require('./app');
const raceImportJob = require('./jobs/weeklyRaceImportJob');

const PORT = process.env.PORT || 3000;

async function main() {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET environment variable is not set in production');
    process.exit(1);
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✓ Database connected');

    app.listen(PORT, () => {
      console.log(`\n🚀 Fantasy F1 League Server`);
      console.log(`📍 Running on http://localhost:${PORT}`);
      console.log(`🏁 API: http://localhost:${PORT}/api`);
    });

    console.log('\n⏰ Initializing scheduled jobs...');
    await raceImportJob.startWeeklyRaceImportJob();

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n\n👋 Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

main();
