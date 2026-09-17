# Local Setup Guide

This explains everything needed to run NeuraBid locally: what each dependency is for, how to start it, and how to fix the errors you're most likely to hit. It documents the **foundation** built in this phase — Docker, database, migrations, seed data, health checks, TypeScript, linting, and tests. No auction/bidding UI exists yet; that's a later phase.

## What's in this stack, and why

| Dependency | Role | Why it's here |
|---|---|---|
| **Docker + Docker Compose** | Runs PostgreSQL and Redis as containers | Gives everyone the exact same database/cache versions without installing them natively — one `docker compose up` instead of per-OS install instructions |
| **PostgreSQL 16** (container) | System of record for users/auctions/bids | Authoritative for bid correctness (see `docs/01-project-plan.md`) |
| **Redis 7** (container) | Supporting cache/pub-sub layer | Never decides bid validity — only caching and future cross-instance broadcast (see plan doc §9) |
| **Node.js + Express** | Backend HTTP API | Already chosen in Phase 0 |
| **TypeScript** | Type safety for backend and frontend | Catches whole classes of bugs (wrong field names, wrong types passed to SQL params) before you even run the code |
| **`pg`** | Postgres driver | Raw SQL, no ORM — see plan doc §4 for why |
| **`redis` (npm package)** | Redis client | Official Node client for Redis |
| **`tsx`** | Runs TypeScript directly in dev | No manual compile step while developing the backend |
| **Vite + React** | Frontend | Already chosen in Phase 0; now using the TypeScript template |
| **ESLint** (backend) / **oxlint** (frontend) | Linting | Catches likely bugs and style issues; oxlint is what the Vite TS template ships with (fast, Rust-based) |
| **Prettier** | Formatting | One consistent code style across the whole repo, enforced automatically instead of debated |
| **Vitest** | Test runner (both backend and frontend) | One test runner to learn instead of two; integrates natively with Vite's config for the frontend |
| **supertest** | HTTP assertions in backend tests | Lets a test call the Express app in-process without actually binding a port |
| **@testing-library/react** | Frontend component tests | Tests what a user sees/does, not component internals |

## Directory structure (as of this phase)

```
neurabid/
├── docker-compose.yml         Postgres + Redis containers
├── .env                       Docker Compose credentials/ports (gitignored)
├── .env.example               Template for the above (committed)
├── docs/                      This file and the project plan
├── backend/
│   ├── .env                   Backend's own connection settings (gitignored)
│   ├── .env.example
│   ├── src/
│   │   ├── config.ts          Loads + validates env vars, fails fast if one is missing
│   │   ├── db.ts              Postgres connection pool
│   │   ├── redis.ts           Redis client
│   │   ├── server.ts          Express app + /health endpoint
│   │   └── db/
│   │       ├── migrate.ts     Migration runner
│   │       ├── seed.ts        Demo data
│   │       └── migrations/    Numbered .sql files, applied in order
│   ├── test/health.test.ts    Backend test
│   ├── tsconfig.json          Type-checking config (includes src + test)
│   └── tsconfig.build.json    Compile-to-JS config (src only, used by `npm run build`)
└── frontend/
    ├── src/App.tsx            Placeholder page that checks backend health
    ├── src/App.test.tsx       Frontend test
    └── src/test/setup.ts      Test environment setup (jest-dom matchers)
```

## Environment variables

Two separate `.env` setups exist on purpose — they configure two different programs (Docker Compose vs. the Node backend), and keeping them separate avoids one program silently reading the other's file.

**Root `.env`** (copy from `.env.example`) — read only by `docker-compose.yml`:
```
PGUSER=neurabid_app
PGPASSWORD=neurabid_local_dev_pw
PGDATABASE=neurabid
PG_HOST_PORT=5433      # host port Postgres is published on
REDIS_HOST_PORT=6379
```

**`backend/.env`** (copy from `backend/.env.example`) — read only by the Node backend:
```
PGHOST=localhost
PGPORT=5433             # must match PG_HOST_PORT above
PGUSER=neurabid_app     # must match root .env
PGPASSWORD=neurabid_local_dev_pw
PGDATABASE=neurabid
REDIS_URL=redis://localhost:6379
PORT=4000
NODE_ENV=development
```

**Why Postgres is on host port 5433, not 5432:** many dev machines already have a native PostgreSQL install listening on 5432 (ours does, from an earlier phase). Rather than touch that existing service, the container publishes on 5433 instead. If your machine has nothing on 5432, you can change both `.env` files to use 5432 instead — it makes no functional difference.

`backend/src/config.ts` reads these and throws a clear error immediately on startup if any required variable is missing, rather than letting the app run with `undefined` values and fail confusingly later.

## Starting everything, in order

```bash
# 1. Start Postgres + Redis containers
docker compose up -d

# 2. Apply database migrations (creates users/auctions/bids tables)
npm run migrate

# 3. Load demo data (3 users, 3 auctions in different states)
npm run seed

# 4. Start the backend (in one terminal)
npm run dev:backend

# 5. Start the frontend (in another terminal)
npm run dev:frontend
```

Then open the frontend (Vite will print a `localhost` URL, typically `http://localhost:5173`) — it fetches `/health` from the backend on load and shows the result.

## Docker commands

| Command | What it does |
|---|---|
| `docker compose up -d` | Start Postgres + Redis in the background |
| `docker compose down` | Stop and remove the containers (data persists in a Docker volume) |
| `docker compose down -v` | Stop containers **and delete their data volumes** — use this to fully reset the database |
| `docker compose logs -f` | Follow container logs (useful if a container won't become healthy) |
| `docker compose ps` | Show container status (look for `healthy`) |

## Migration and seed commands

| Command | What it does |
|---|---|
| `npm run migrate` | Applies any `.sql` files in `backend/src/db/migrations/` not yet recorded in the `schema_migrations` table |
| `npm run seed` | **Destructively** replaces all rows in `users`/`auctions`/`bids` with fresh demo data — safe to re-run any time during development |

To add a new migration later: add a new file named `002_something.sql` (numbers must sort correctly) to `backend/src/db/migrations/`, then run `npm run migrate` again — it only applies what hasn't run yet.

## Backend and frontend commands

Run from the repo root (they delegate into the right workspace):

| Command | What it does |
|---|---|
| `npm run dev:backend` | Start the backend with auto-restart on file changes |
| `npm run dev:frontend` | Start the Vite dev server |
| `npm run build:backend` | Compile backend TypeScript to `backend/dist/` |
| `npm run build:frontend` | Production frontend build |
| `npm run lint` | Lint both backend (ESLint) and frontend (oxlint) |
| `npm run typecheck` | Type-check both backend and frontend, no output emitted |
| `npm run test` | Run both backend (Vitest + supertest) and frontend (Vitest + Testing Library) test suites |
| `npm run format` / `npm run format:check` | Apply / verify Prettier formatting across the repo |

## Common errors and fixes

**`Missing required environment variable: PGHOST` (or similar) on backend startup**
`backend/.env` doesn't exist or is missing a value. Copy `backend/.env.example` to `backend/.env` and fill it in.

**`ECONNREFUSED` connecting to Postgres/Redis, or `/health` returns `"db": "error"` / `"redis": "error"`**
The containers aren't running or aren't ready yet. Run `docker compose ps` — both should say `healthy`. If they just started, wait a few seconds; Postgres in particular takes a moment to accept connections on first boot.

**`docker compose up` fails with a port-already-in-use error**
Something else on your machine is already using 5433 or 6379. Change `PG_HOST_PORT` / `REDIS_HOST_PORT` in the root `.env` (and the matching value in `backend/.env`) to a free port.

**Docker Desktop shows a spinning/loading icon for several minutes with no error**
This is normal on the first launch after install or a reboot — it's initializing its Linux VM. Give it a few minutes; if it's still not ready after ~5 minutes, check the Docker Desktop window itself for a hidden prompt (WSL update, permissions, restart required) that needs a manual click.

**`relation "auctions" does not exist"` (or similar) when the backend queries the database**
Migrations haven't been run against this database yet. Run `npm run migrate`.

**Backend test (`health.test.ts`) fails**
This test requires the containers to be running (it hits the real `/health` logic against real Postgres/Redis). Run `docker compose up -d` first.

**`EADDRINUSE` when starting the backend**
Something (often a previous, still-running `node` process from an earlier session) is already listening on port 4000. Find and stop it, or change `PORT` in `backend/.env`.

## Known dev-dependency advisories

`npm audit` reports a few moderate/high advisories in Vitest's own dependency chain (`@vitest/mocker`, `esbuild`) that affect the **local development server only** (a website could, in theory, make requests to your dev server while it's running) — they do not affect anything that ships to production, since nothing here is deployed with these dev tools. Fixing them requires upgrading to Vitest 5, a breaking change we're deferring past the hackathon deadline; noting it here rather than silently ignoring it.
