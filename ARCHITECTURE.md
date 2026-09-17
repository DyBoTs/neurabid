# Architecture Notes

This file explains the *why* behind the structure, growing one phase at a time. If you're new to the codebase, read this alongside the code it references.

## Phase 0 — Scaffolding

**Monorepo via npm workspaces.** One root `package.json` lists `backend` and `frontend` as workspaces. This means `npm install` at the root installs both packages' dependencies in one shared `node_modules`, and `npm run dev:backend` / `npm run dev:frontend` (defined at the root) delegate into each workspace. We didn't reach for a heavier tool (Turborepo, Nx, Lerna) — with two packages and no shared build pipeline, npm workspaces alone is enough, and it's one less thing to learn.

**Why a dedicated Postgres role instead of using `postgres` directly.** `backend/db/bootstrap_role.sql` creates a `neurabid_app` role and the app connects as that role, not as the `postgres` superuser. This is standard practice: the application should hold only the privileges it needs (read/write on its own database), so a bug or injected query in app code can't touch other databases or run admin commands. The bootstrap script is run once, manually, by a superuser — it's not something the app runs itself.

**Why no ORM.** `backend/src/db.js` uses `pg` (node-postgres) directly with a connection `Pool`, no Prisma/Sequelize/Knex. The entire point of this project is to reason precisely about *transactions and isolation levels* when placing bids (coming in Phase 1). An ORM would hide exactly the SQL behavior we need to see and control. Writing raw, parameterized SQL keeps that logic visible and teachable.

**Why `.env` is split from `.env.example`.** `backend/.env` holds real local credentials and is git-ignored. `.env.example` (tracked in git) documents which variables are needed, with placeholder values, so anyone cloning the repo knows what to set up without ever seeing a real credential.

**Health check.** `GET /health` on the backend runs `SELECT 1` against the database and reports whether the DB is reachable. This isn't a feature of the product — it's a fast way to confirm "backend process is up AND can talk to Postgres" in one request, which we'll keep using to sanity-check each phase.

**What's deliberately not here yet:** no `auctions`/`bids`/`users` tables, no bid-placement logic, no WebSocket server, no real frontend UI. Those are Phase 1 onward.
