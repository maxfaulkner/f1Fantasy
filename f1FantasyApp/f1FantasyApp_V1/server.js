// server.js — production entry point: connects DB, starts scheduler, serves static files
require('dotenv').config();
const path = require('path');
const prisma = require('./prisma');
const app = require('./app');
const raceImportJob = require('./jobs/weeklyRaceImportJob');

const PORT = process.env.PORT || 3000;

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const express = require('express');
  app.use(express.static(path.join(__dirname, 'frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
  });
}

async function main() {
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
