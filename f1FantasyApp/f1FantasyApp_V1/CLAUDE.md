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

## Settled architectural decisions
These were debated and resolved — do not re-raise them in reviews.

- **JWT_SECRET lives in two places** (`app.js` login handler and `middleware/auth.js`) and that is intentional. Both evaluate `process.env.JWT_SECRET || 'dev-only-insecure-secret'` independently. Node's module cache means each file is evaluated once per process, so there is no runtime divergence risk. A single shared constant would require a new module just to hold one string — not worth it.
- **`weeklyRaceImportJob` is not imported in `app.js`** — it belongs in `server.js` only (startup concern, not app concern). Tests mock it via `__tests__/setup.js`.

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

## Test quality standards

**Backend** (`__tests__/integration/` — supertest + jest):
- Every new endpoint needs a 401 (no token) test before any other assertion.
- Assert on `res.body` fields, not just status codes, when the response carries meaningful data.
- Share fixture objects across tests in the same describe block rather than repeating inline objects.

**Frontend** (`frontend/src/__tests__/` — vitest + testing-library):
- Before writing a "does not render" test, read the component's render tree to identify every condition that can suppress it. Your fixture must pass all outer conditions and only fail the innermost one the test is named for.
- Wrong: testing that `SeasonPointsChart` handles empty rounds by setting `totalPoints: 0` — if the parent already gates the chart on `totalPoints > 0`, the chart never mounts and the test proves nothing about the chart itself.
- Right: `totalPoints: 150, roundPoints: {}` — outer gate passes, component mounts, the internal empty-rounds guard is what's actually tested.
- After writing a test, trace execution from the fixture through the component to the assertion and confirm the condition you intend to test is the one controlling the outcome.
- Mock the API layer (`vi.mock('../../api', ...)`), not the component under test.

## Code quality: what not to write

- No comments that restate what the code does. `// Fetch all data in bulk upfront` above a `Promise.all` is noise — delete it. If the comment would appear in a tutorial explaining how the code works, it does not belong in production code.
- No silent `try/catch` blocks that swallow errors. Either handle the error meaningfully or let it propagate.
- No single-use helper functions unless motivated by testability or the body is more than ~15 lines.
- No `console.log` or `console.error` left in production code.
