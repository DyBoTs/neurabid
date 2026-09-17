# Load Testing — How to Run It

## Prerequisites

- The backend running (`docker compose up -d && npm run migrate && npm run dev:backend`).
- k6 installed. This repo doesn't assume a system install — if you don't have `k6` on your `PATH`, download the portable binary:
  ```bash
  curl -L -o k6.zip https://github.com/grafana/k6/releases/download/v0.54.0/k6-v0.54.0-windows-amd64.zip
  # unzip it, then use the extracted k6.exe path in the commands below
  ```
  (Linux/macOS: grab the matching release asset from the same page instead.)

## Running one stage

```bash
k6 run -e STAGE=1 tests/load/bidding.js   # small correctness run
k6 run -e STAGE=2 tests/load/bidding.js   # 100 concurrent users
k6 run -e STAGE=3 tests/load/bidding.js   # 500 concurrent users
k6 run -e STAGE=4 tests/load/bidding.js   # 1000 concurrent users
k6 run -e STAGE=5 tests/load/bidding.js   # attempt ~5000 req/sec
```

After **every** stage, run the real database correctness checker before trusting the numbers:

```bash
node tests/load/check-correctness.mjs
```

This calls the real `GET /api/admin/dashboard` endpoint, which re-derives correctness directly from Postgres (see `docs/07-admin-dashboard.md` §6) — it is not a summary of what k6 thinks happened.

## Running all 5 stages with correctness checks between each

```bash
tests/load/run-all.sh /path/to/k6.exe
```

This runs stage 1 → checks correctness → stage 2 → checks → … → stage 5 → checks, and stops immediately if any correctness check actually fails. Raw k6 output and summaries are saved to `tests/load/results/` (gitignored — machine-specific run artifacts, not source).

## What this actually tests, and its one big caveat

Every stage creates its own pool of real auctions and real users via the real REST API in `setup()` — nothing is seeded directly into the database. Every VU repeatedly bids a randomly-increasing amount on a randomly-chosen auction from that pool, so both genuine acceptances and genuine rejections happen (see the amount formula's comment in `bidding.js`).

**The one thing to know before reading the results:** `backend/src/db.ts` caps the Postgres connection pool at `max: 20`. That's a deliberate, small, hackathon-scope setting, not a bug — but it means this specific deployment's throughput ceiling is expected to plateau well under 5,000 req/sec, with latency rising instead of the system falling over. `docs/08-load-testing.md` shows exactly where that happened, with real numbers from an actual run on this machine.

## Full documentation

See `docs/08-load-testing.md` for what k6/VU/req-sec/p95/p99 mean, the full test design rationale, and the actual results from running all 5 stages once, end to end, on this machine.
