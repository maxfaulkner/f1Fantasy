require('dotenv').config();
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const chatRoutes = require('./routes/chat');
const socialRoutes = require('./routes/social');
const authMiddleware = require('./middleware/auth');
const raceImportJob = require('./jobs/weeklyRaceImportJob');
const rateLimit = require('express-rate-limit');

const app = express();

// ============ MIDDLEWARE ============

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());

// Skip rate limiting in test environment
if (process.env.NODE_ENV !== 'test') {
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.' },
  });
  app.use('/api', globalLimiter);

  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please wait.' },
  });
  app.use('/auth', authLimiter);
}

// ============ ROUTES ============

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', apiRoutes);
app.use('/api', socialRoutes);
app.use('/api/leagues/:leagueId/chat', chatRoutes);

// ============ AUTH ROUTES ============

app.post('/auth/register', async (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const bcrypt = require('bcrypt');
    const prisma = require('./prisma');
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, name, password: hashedPassword },
    });
    res.status(201).json({
      message: 'User created successfully',
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }
    const prisma = require('./prisma');
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const bcrypt = require('bcrypt');
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: user.id, email: user.email },
      authMiddleware.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });

    raceImportJob.checkAndImportPastRounds().catch(err =>
      console.error('Catch-up import check failed:', err.message)
    );
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/admin/races/:leagueId/:week', authMiddleware, async (req, res) => {
  try {
    const { leagueId, week } = req.params;
    const weekNum = parseInt(week, 10);
    if (isNaN(weekNum)) {
      return res.status(400).json({ error: 'Invalid week parameter' });
    }
    const prisma = require('./prisma');
    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) return res.status(404).json({ error: 'League not found' });
    const drivers = await prisma.driver.findMany({ include: { constructor: true } });
    const existingCount = await prisma.raceResult.count({
      where: { leagueId, week: weekNum },
    });
    res.json({
      week: weekNum,
      league: { id: league.id, name: league.name },
      resultsExist: existingCount > 0,
      existingCount,
      drivers: drivers.map(d => ({
        id: d.id, f1Id: d.f1Id, name: d.name, constructor: d.constructor.name,
      })),
    });
  } catch (error) {
    console.error('Admin race form error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ STATIC FILES (production) ============

if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  app.use(express.static(path.join(__dirname, 'frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
  });
}

// ============ ERROR HANDLING ============

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
