# NeuraBid

A real-time auction/bidding platform built to demonstrate **correct bid concurrency**: PostgreSQL is the authority on whether a bid is accepted, never the client and never a "last write wins" race. See `docs/01-project-plan.md` for the full architecture and `docs/02-local-setup.md` for a detailed setup walkthrough (this README is the quick version).

## Stack

- **Backend**: Node.js, Express, TypeScript, `pg` (raw SQL, no ORM), `redis` client, `ws` for WebSockets (not wired up yet)
- **Frontend**: React + Vite, TypeScript
- **Database**: PostgreSQL (via Docker)
- **Cache/pub-sub**: Redis (via Docker) — supporting role only, never authoritative for bid correctness
- **Testing**: Vitest (both backend and frontend), supertest, Testing Library
- **Linting/formatting**: ESLint (backend), oxlint (frontend), Prettier (whole repo)

## Quick start

```bash
npm install                       # installs both backend and frontend
docker compose up -d              # start Postgres + Redis
npm run migrate                   # create tables
npm run seed                      # load demo data
npm run dev:backend               # terminal 1 — http://localhost:4000/health
npm run dev:frontend              # terminal 2 — prints its own localhost URL
```

Full explanation of every dependency, all environment variables, and common errors/fixes: **`docs/02-local-setup.md`**.

## Project scripts

| Command | Does |
|---|---|
| `npm run docker:up` / `docker:down` | Start/stop Postgres + Redis |
| `npm run migrate` | Apply database migrations |
| `npm run seed` | Load demo data (destructive — replaces existing rows) |
| `npm run dev:backend` / `dev:frontend` | Start each app in dev mode |
| `npm run lint` | Lint both workspaces |
| `npm run typecheck` | Type-check both workspaces |
| `npm run test` | Run both test suites |
| `npm run format` | Apply Prettier formatting repo-wide |

## Project structure

```
backend/     Express API, TypeScript, raw SQL against Postgres, Redis client, migrations/seed
frontend/    React + Vite client, TypeScript
docs/        Architecture plan and setup guide
docker-compose.yml   Local Postgres + Redis
```

## Status

This is the project **foundation**: Docker/Postgres/Redis, migrations, seed data, health checks, TypeScript, linting, and test setup are in place. The auction/bidding UI and the core bid-placement transaction logic are not built yet — see `docs/01-project-plan.md` for what's next.

See `ARCHITECTURE.md` for the reasoning behind Phase 0's decisions, and `docs/01-project-plan.md` for the full concurrency/Redis/WebSocket design.
