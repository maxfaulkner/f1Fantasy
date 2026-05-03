# F1 Fantasy League — Claude Code Guide

## What this app is
A Fantasy F1 league web app. Users pick 5 drivers + 1 constructor each race week within a $100M budget. Points are awarded based on real F1 race results. Prices update dynamically after each race based on performance and selection popularity. Leagues support classic, H2H, and draft formats.

## Stack
- **Backend:** Node.js + Express (CommonJS — use `require`, not `import`)
- **Frontend:** React 19 + Vite (ES modules — use `import`)
- **Database:** PostgreSQL via Prisma ORM
- **Schema:** `schema.prisma` at root (not in `prisma/` folder)
- **Migrations:** `migrations/` at root (not `prisma/migrations/`)

## Running locally

Both servers are managed by PM2:
```bash
cd f1FantasyApp_V1
pm2 start ecosystem.config.cjs   # start both servers
pm2 logs                          # view logs
pm2 reload f1-backend            # restart backend after changes
pm2 stop all                     # stop everything
```

Backend auto-restarts on file changes (PM2 watch mode).
Frontend uses Vite HMR — no restart needed for frontend changes.

- Backend: http://localhost:3000
- Frontend: http://localhost:5173

PostgreSQL must be running: `brew services start postgresql@15`

## Key environment variables (local: `.env`, production: Railway dashboard)
```
DATABASE_URL    # PostgreSQL connection string
JWT_SECRET      # Token signing secret
NODE_ENV        # development | production
PORT            # Injected by Railway in production
BASE_URL        # Full public URL (used in emails)
FRONTEND_URL    # Used for CORS
EMAIL_*         # Gmail SMTP config
```

## Database
```bash
# Apply migrations
npx prisma migrate deploy

# Sync schema without migration (dev only)
npx prisma db push --accept-data-loss

# Seed 2026 drivers, constructors, week-1 prices
node scripts/seedDatabase.js

# Seed production database
DATABASE_URL="<public_url>" node scripts/seedDatabase.js
```

The public Railway DB URL is available via: `railway variables` on the Postgres service.

## Deployment (Railway)
- **Repo:** `maxfaulkner/python`, branch `user/mafaulkner/f1FantasyApp`
- **Root directory on Railway:** `f1FantasyApp/f1FantasyApp_V1`
- **Build command:** `npm run build` (runs prisma generate + vite build)
- **Start command:** `npm start` (runs prisma migrate deploy + node server.js)
- **URL:** https://f1fantasyapp.up.railway.app
- Push to branch → Railway auto-deploys

## Key files
| File | Purpose |
|---|---|
| `server.js` | Startup shim: DB connection check, port binding, scheduler start |
| `app.js` | Express app factory: all routes, middleware, auth endpoints, static file serving in prod |
| `routes/api.js` | All 25+ API endpoints |
| `routes/chat.js` | League messaging |
| `routes/social.js` | Notifications, achievements, profiles |
| `jobs/weeklyRaceImportJob.js` | Race schedule, team locks, result imports, catch-up on login |
| `services/pricingEngine.js` | Dynamic driver/constructor pricing after each race |
| `services/f1DataService.js` | Ergast/Jolpica F1 API integration |
| `services/mailer.js` | Email (Gmail SMTP) |
| `schema.prisma` | 13-table database schema |
| `prisma.js` | Prisma client (query logging off in production) |
| `scripts/seedDatabase.js` | 2026 season data initialisation |
| `ecosystem.config.cjs` | PM2 config for local dev |
| `frontend/src/api.js` | API client (base URL is same-origin — Vite proxies in dev) |
| `frontend/vite.config.js` | Vite config with proxy for /api, /auth, /admin → :3000 |

## Architecture notes
- Frontend API calls use same-origin base URL (`''`). In dev, Vite proxies `/api`, `/auth`, `/admin` to Express on :3000. In production, Express serves the built frontend as static files.
- Prices endpoint falls back to most recent available week if the requested week has no data yet.
- `checkAndImportPastRounds()` fires non-blocking on every login (rate-limited to once per 5 min) to catch up on any missed race imports.
- Race results are fetched from the Jolpica proxy of the Ergast F1 API.
- Prisma schema is at the root, not in a `prisma/` subdirectory. The `binaryTargets` includes darwin-arm64 (local Mac) and linux targets (Railway).

## Common gotchas
- **node_modules was previously Windows-compiled** — if you see native module errors (bcrypt, prisma), run `npm install` fresh on Mac.
- **Schema vs migration drift** — the original migration was incomplete. A second migration (`20260328000000_sync_schema`) adds all missing columns/tables. Always run `prisma migrate deploy` not `db push` in production.
- **Railway DATABASE_URL** — internal URL (`postgres.railway.internal`) only works inside Railway's network. Use `DATABASE_PUBLIC_URL` from the Postgres service variables to connect from outside.
- **PM2 startup** — to survive Mac reboots, run the command output by `pm2 startup` with sudo once.

## Testing
```bash
# Backend
npm test

# Frontend
cd frontend && npm test
```
