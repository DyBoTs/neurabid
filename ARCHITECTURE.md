# Architecture Notes

This file explains the *why* behind the structure, growing one phase at a time. If you're new to the codebase, read this alongside the code it references.

## Phase 0 — Scaffolding

**Monorepo via npm workspaces.** One root `package.json` lists `backend` and `frontend` as workspaces. This means `npm install` at the root installs both packages' dependencies in one shared `node_modules`, and `npm run dev:backend` / `npm run dev:frontend` (defined at the root) delegate into each workspace. We didn't reach for a heavier tool (Turborepo, Nx, Lerna) — with two packages and no shared build pipeline, npm workspaces alone is enough, and it's one less thing to learn.

**Why a dedicated Postgres role instead of using `postgres` directly.** `backend/db/bootstrap_role.sql` creates a `neurabid_app` role and the app connects as that role, not as the `postgres` superuser. This is standard practice: the application should hold only the privileges it needs (read/write on its own database), so a bug or injected query in app code can't touch other databases or run admin commands. The bootstrap script is run once, manually, by a superuser — it's not something the app runs itself.

**Why no ORM.** `backend/src/db.js` uses `pg` (node-postgres) directly with a connection `Pool`, no Prisma/Sequelize/Knex. The entire point of this project is to reason precisely about *transactions and isolation levels* when placing bids (coming in Phase 1). An ORM would hide exactly the SQL behavior we need to see and control. Writing raw, parameterized SQL keeps that logic visible and teachable.

**Why `.env` is split from `.env.example`.** `backend/.env` holds real local credentials and is git-ignored. `.env.example` (tracked in git) documents which variables are needed, with placeholder values, so anyone cloning the repo knows what to set up without ever seeing a real credential.

**Health check.** `GET /health` on the backend runs `SELECT 1` against the database and reports whether the DB is reachable. This isn't a feature of the product — it's a fast way to confirm "backend process is up AND can talk to Postgres" in one request, which we'll keep using to sanity-check each phase.

**What's deliberately not here yet:** no `auctions`/`bids`/`users` tables, no bid-placement logic, no WebSocket server, no real frontend UI. Those are Phase 1 onward.

> **Superseded in the Foundation phase below:** the native-Postgres bootstrap approach described above (`backend/db/bootstrap_role.sql`, plain `.js` source files) was replaced by Docker Compose and TypeScript. The reasoning above about *why a dedicated role* and *why no ORM* still holds — only the mechanism changed.

## Foundation Phase — Docker, migrations, seed data, TypeScript, tests

**Docker Compose runs Postgres + Redis, not the Node apps.** `docker-compose.yml` only containerizes the two stateful services. The backend and frontend still run directly via `npm run dev:*` on the host. This keeps the dev loop fast (no image rebuild to see a code change) while still giving everyone identical, disposable database/cache instances — containerizing the Node apps themselves would add rebuild latency for no correctness benefit at this stage.

**Postgres is on host port 5433, not 5432.** The machine already had a native Postgres service running on 5432 from Phase 0. Rather than stop or reconfigure that existing service, the container publishes on 5433 instead (see `docker-compose.yml`'s `PG_HOST_PORT`). The app's `backend/.env` points at 5433. This is purely a local port-mapping detail — nothing about the schema or app code cares which port Postgres is reachable on.

**The Docker Postgres role is created automatically, not via a bootstrap script.** Docker Compose sets `POSTGRES_USER=neurabid_app` directly as environment variables on the `postgres` image, which creates that role and database on first container start — no separate `CREATE ROLE` step needed. This replaces the manual `bootstrap_role.sql` step from Phase 0 with something reproducible for anyone running `docker compose up`.

**Migrations are plain numbered `.sql` files, applied by a ~40-line script (`backend/src/db/migrate.ts`), not a migration framework.** The runner tracks which files it's already applied in a `schema_migrations` table and only runs new ones, each inside its own transaction (so a failing migration doesn't leave the schema half-changed). This is the same "no unnecessary infrastructure, keep SQL visible" philosophy as "no ORM" — a beginner can read the entire migration mechanism in one small file.

Note on the schema itself: `auctions.current_bid_id` and `bids.auction_id` reference each other (an auction points at its winning bid; a bid points at its auction). Postgres can't create both foreign keys in one `CREATE TABLE` statement since each table must exist before the other can reference it — so the migration creates `auctions` first (with `current_bid_id` as a plain, unconstrained `uuid` column), then `bids`, then adds the foreign key constraint onto `auctions` afterward with `ALTER TABLE`.

**Seeding is destructive by design.** `npm run seed` truncates `users`/`auctions`/`bids` and inserts fresh demo rows every time, rather than trying to be idempotent with `ON CONFLICT`. For local demo data this is simpler and more predictable than merge logic — you always know exactly what's in the database after seeding.

**TypeScript, not JavaScript, from this phase on.** `backend/tsconfig.json` type-checks `src` and `test` together (so test files get the same safety net); `backend/tsconfig.build.json` extends it but only compiles `src` to `dist/` for `npm run build` — tests should never end up in a production build. The frontend uses Vite's own `react-ts` template structure (`tsconfig.app.json` / `tsconfig.node.json`), which ships with `noEmit: true` since Vite (not `tsc`) does the actual JS output — `tsc -b` is used purely as a type-checker.

**Redis is wired up but does nothing yet.** `backend/src/redis.ts` exports a client and a small `ensureRedisConnected()` helper; `/health` pings it. Per the project plan (`docs/01-project-plan.md` §9), Redis will later support WebSocket broadcast fanout and read caching — never bid-acceptance decisions. Right now its only job is to prove the connection works.

**One test runner (Vitest) for both workspaces.** Rather than learning `node --test` for the backend and something else for the frontend, both use Vitest — for the backend, `vitest run` with `supertest` calling the Express `app` object in-process (no real port bound); for the frontend, `vitest run` with Testing Library and a `jsdom` environment. The backend's `server.ts` guards its own `app.listen(...)` behind `if (process.env.VITEST !== 'true')` specifically so tests can import `app` without accidentally starting a second real server on the same port.
