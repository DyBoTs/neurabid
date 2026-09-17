# Neurabid

A real-time auction/bidding platform built to demonstrate **correct bid concurrency**: PostgreSQL is the authority on whether a bid is accepted, never the client and never a "last write wins" race.

## Stack

- **Backend**: Node.js, Express, `pg` (raw SQL, no ORM), `ws` for WebSockets
- **Frontend**: React + Vite
- **Database**: PostgreSQL

## Local setup

1. Install PostgreSQL and make sure it's running.
2. As a superuser, run the bootstrap script once to create the app role:
   ```
   psql -U postgres -f backend/db/bootstrap_role.sql
   psql -U postgres -c "CREATE DATABASE neurabid OWNER neurabid_app;"
   ```
   (Change the password in `backend/db/bootstrap_role.sql` for anything beyond local dev.)
3. Copy `.env.example` to `backend/.env` and fill in your DB credentials.
4. From the repo root: `npm install`
5. Run the backend: `npm run dev:backend` (health check at `http://localhost:4000/health`)
6. Run the frontend: `npm run dev:frontend`

## Project structure

```
backend/     Express API + WebSocket server, raw SQL against Postgres
frontend/    React + Vite client
```

See `ARCHITECTURE.md` (added in a later phase) for how bid concurrency and real-time updates work.
