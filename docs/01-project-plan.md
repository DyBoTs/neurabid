# NeuraBid — Project Plan

Status of repo as of this doc: Phase 0 scaffolding exists (npm workspaces, Express backend with a `/health` endpoint, a dedicated Postgres role/database, a Vite+React frontend). **No auctions/bids schema, no bidding logic, no Redis, no WebSockets, no k6 tests exist yet.** This document is the plan for everything from here — nothing described below is built yet.

This doc is written for beginners. Every major decision explains **WHAT** it is, **WHY** we chose it, **HOW** it works, and **what a judge might ask** about it, so you can defend the design in a demo Q&A even if you didn't type every line yourself.

---

## 1. Product Overview

NeuraBid is a live auction site. A seller (or the system, pre-seeded for the demo) creates an auction with a starting price and an end time. Buyers see a live-updating price and place bids. The core promise we're demonstrating is:

> **Under any amount of concurrent bidding pressure, the database never loses, duplicates, or misorders a bid. Every accepted bid is strictly higher than the one before it, and every connected client sees the new price the instant it's really committed — not before, not a stale one.**

That correctness guarantee — not the visual polish — is what the hackathon is actually judging. The UI exists to *make that guarantee visible* (live price ticking up, rejected-bid toasts, a stress-test dashboard), not to distract from it.

## 2. Architecture

```
┌─────────────┐        HTTP (REST)         ┌──────────────────┐
│   Browser    │ ─────────────────────────▶ │   Express API     │
│ (React/Vite) │ ◀───────────────────────── │  (Node.js)        │
│              │        WebSocket           │                    │
│              │ ◀═══════════════════════▶  │  ws server         │
└─────────────┘   (live price updates)      └─────┬──────┬───────┘
                                                     │      │
                                        SQL (pg,     │      │ pub/sub
                                     transactions)    │      │ (broadcast fanout)
                                                     ▼      ▼
                                            ┌──────────────┐ ┌────────┐
                                            │ PostgreSQL   │ │ Redis  │
                                            │ (source of   │ │(cache +│
                                            │  truth)      │ │pub/sub)│
                                            └──────────────┘ └────────┘
```

- The **browser** never decides if a bid wins. It sends a bid request and *waits to be told* by the server.
- The **Express API** is the only thing allowed to talk to Postgres for writes. It runs each bid inside a single database transaction (details in §6–8).
- **Postgres** is the single source of truth. If Postgres says a bid is accepted, it's accepted. If the Node process crashed mid-request, nothing bad happened, because nothing is "accepted" until Postgres commits.
- **WebSockets** push price updates to browsers *after* a commit succeeds — never before (this is a hard constraint, not a suggestion).
- **Redis** is a supporting actor, never a decision-maker (see §9). It never determines whether a bid wins.

**Judge question: "What happens if your Node server crashes mid-bid?"**
Answer: nothing bad. The transaction either committed to Postgres (bid stands, and once the server restarts and reconnects, clients get the current state via a fresh REST fetch) or it didn't (bid never happened). There is no in-between state, because a database transaction is atomic — Postgres guarantees "all or nothing."

## 3. Directory Structure

```
neurabid/
├── docs/                     Planning + architecture docs (this file lives here)
├── backend/
│   ├── db/
│   │   ├── bootstrap_role.sql      one-time: create the app's DB role (already done)
│   │   └── migrations/             numbered .sql files: 001_users.sql, 002_auctions.sql, ...
│   ├── src/
│   │   ├── db.js                   Postgres connection pool (exists)
│   │   ├── redis.js                Redis client (new)
│   │   ├── server.js               Express app + HTTP server bootstrap (exists)
│   │   ├── routes/                 one file per resource: auctions.js, bids.js, users.js
│   │   ├── services/
│   │   │   └── placeBid.js         THE core transaction logic (§6–8) — small, isolated, heavily tested
│   │   ├── ws/
│   │   │   └── broadcaster.js      WebSocket room management + broadcast-after-commit
│   │   └── metrics.js              in-memory counters for observability (§15)
│   └── test/                       node --test unit + integration tests
├── frontend/
│   └── src/
│       ├── pages/                  AuctionList, AuctionDetail, StressDemo
│       ├── hooks/useAuctionSocket.js   WebSocket connect/reconnect hook
│       └── components/             small, reusable UI pieces
├── k6/
│   └── bid-stress.js               the load test script (§14)
└── package.json                    npm workspaces root
```

We keep `placeBid.js` as one small, isolated file on purpose: it's the single most important piece of code in the whole project, and a beginner (or a judge) should be able to open one ~80-line file and read the entire correctness story, instead of hunting through a big Express route file.

## 4. Technology Choices and Why

| Choice | What | Why | Alternative considered |
|---|---|---|---|
| Node.js + Express | HTTP API | Same language as the frontend, minimal boilerplate, huge beginner-friendly docs | Fastify (faster, but Express is more beginner-documented) |
| PostgreSQL | System of record | True ACID transactions, `SELECT ... FOR UPDATE` row locking, mature and battle-tested for exactly this class of problem (inventory/ticket/auction contention) | MySQL (also fine, team already provisioned Postgres and it's what the constraints reference) |
| `pg` (no ORM) | Raw parameterized SQL | The whole project hinges on precise transaction/locking behavior; an ORM hides exactly the SQL we need full control over | Prisma/Sequelize — faster to scaffold CRUD, but would obscure the locking logic that's the point of this project |
| `ws` (raw WebSocket) | Real-time push | Minimal dependency, forces us to understand connect/reconnect/broadcast explicitly (which is also a demo requirement: visible connection states) | socket.io — handles reconnection for you, but hides the mechanics we want to *show* judges we understand |
| Redis | Cache + pub/sub | Explained in full in §9 — narrow, optional-for-single-instance role, never authoritative | None — could skip Redis entirely for a single-process demo; kept as MVP-optional (§16) |
| React + Vite | Frontend | Fast dev server, huge ecosystem, team already has this scaffolded | Plain HTML/JS — simpler but more manual DOM wiring for live updates |
| k6 | Load testing | Purpose-built for exactly "N virtual users hitting an endpoint concurrently," scriptable in JS (same language as the rest of the stack), free and local | Apache Bench / autocannon — simpler but can't easily express "ramp up, hold, ramp down" load profiles or track custom pass/fail per request |

**Judge question: "Why not just use an ORM to move faster?"**
Answer: an ORM would let us write code faster, but this challenge is specifically about correct transaction/locking behavior. We chose to keep that layer thin and explicit so we can point at ~80 lines of code and explain exactly how correctness is enforced, rather than trusting a library's default behavior (which is often *not* safe for this use case out of the box).

## 5. PostgreSQL Schema

```sql
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text UNIQUE NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auctions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  description     text,
  starting_price  numeric(12,2) NOT NULL CHECK (starting_price > 0),
  current_price   numeric(12,2) NOT NULL,
  min_increment   numeric(12,2) NOT NULL DEFAULT 1.00 CHECK (min_increment > 0),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled','active','ended')),
  ends_at         timestamptz NOT NULL,
  current_bid_id  uuid REFERENCES bids(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bids (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id    uuid NOT NULL REFERENCES auctions(id),
  user_id       uuid NOT NULL REFERENCES users(id),
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bids_auction_amount ON bids (auction_id, amount DESC);
CREATE INDEX idx_bids_auction_created ON bids (auction_id, created_at DESC);
```

Notes for beginners:
- `numeric(12,2)` for money, never `float`/`double` — floating point rounding errors are unacceptable for prices.
- `CHECK` constraints are a second line of defense at the database level (e.g. `amount > 0`) — even if application code had a bug, Postgres itself refuses bad data. This is part of "Postgres is authoritative," not just the transaction logic.
- `auctions.current_price` is a **denormalized cache** of "the highest accepted bid" kept in sync inside the same transaction as the bid insert (§6). We keep it because reading "what's the current price" is a very hot, very frequent query (every page load, every reconnect) and we don't want to compute `MAX(amount)` over the whole `bids` table every time.
- `current_bid_id` lets us know *whose* bid is winning without a join on `MAX`.

**Judge question: "Why not just use `MAX(amount)` on the bids table instead of a denormalized `current_price` column?"**
Answer: We could — it'd be simpler and still correct, just slower under load (an extra aggregate query per read, and per bid-validation check). Denormalizing trades a small amount of complexity (keeping one column in sync, only ever inside the same transaction as the insert that justifies it) for much cheaper reads, which matters at our stated throughput target.

## 6. Bid Transaction Strategy

**WHAT:** Every bid is placed inside exactly one database transaction that (1) locks the auction row, (2) re-checks the price against that locked, guaranteed-fresh value, (3) inserts the bid, (4) updates the cached price, (5) commits — and only after that commit succeeds do we tell anyone the bid won.

```sql
BEGIN;

SELECT id, current_price, min_increment, status, ends_at
FROM auctions
WHERE id = $1
FOR UPDATE;                 -- locks this ONE auction row until COMMIT/ROLLBACK

-- application code checks, in JS, using the row just read:
--   status must be 'active' AND now() < ends_at
--   amount >= current_price + min_increment
-- if either check fails: ROLLBACK, return 409 "too low" or 410 "auction ended"

INSERT INTO bids (auction_id, user_id, amount)
VALUES ($1, $2, $amount)
RETURNING id;

UPDATE auctions
SET current_price = $amount, current_bid_id = $new_bid_id
WHERE id = $1;

COMMIT;
```

**WHY:** `FOR UPDATE` means: "give me this row, and don't let anyone else even *read it for update* until I'm done." Every concurrent bid attempt on the *same* auction queues up in Postgres, one at a time, in the order Postgres grants the lock. There's no window where two requests both read "current price = $100" and both think their $105 bid is valid — the second one to get the lock re-reads the *already-updated* price and correctly rejects itself if it's now too low.

**HOW this satisfies "reject lower/out-of-order bids":** The check happens *after* acquiring the lock, using the value read *at that moment*, not whatever the client thought the price was when it submitted. If two bids for $105 arrive "at the same time," whichever gets the lock first wins; the second one re-reads current_price = $105 and its own $105 bid now fails the `amount >= current_price + min_increment` check — rejected, correctly, regardless of which request's network packet arrived at the OS first.

**Judge question: "What stops two people from both winning at the same instant?"**
Answer: Postgres's row lock. Only one transaction can hold `FOR UPDATE` on that row at a time; the second transaction physically waits until the first commits or rolls back, then sees the *post-commit* price. There is no code path where two transactions both believe they're looking at the current price simultaneously.

## 7. Isolation / Locking Strategy

**WHAT:** We use Postgres's default isolation level (`READ COMMITTED`) plus explicit row locking via `SELECT ... FOR UPDATE`, rather than the stricter `SERIALIZABLE` isolation level.

**WHY (and why not SERIALIZABLE):** `SERIALIZABLE` is Postgres's strongest isolation level — it can catch subtler conflicts than row locking can, but it does so *optimistically*: transactions run in parallel and Postgres detects conflicts at `COMMIT` time, aborting one side with a `40001 serialization_failure` error, which the app must retry. Under **heavy contention on a single hot row** (exactly our worst case — a popular auction near closing time), `SERIALIZABLE` tends to abort a large fraction of transactions, and every abort is wasted work that has to be redone. `FOR UPDATE` instead makes losers *wait in a queue* rather than *do the work and then get thrown away* — for this specific access pattern (many writers, one hot row, no complex multi-row invariants), queueing is more efficient and much easier to reason about and explain.

**HOW:** `FOR UPDATE` is added directly to the `SELECT` inside the transaction (§6). No isolation level needs to be changed from Postgres's default.

**Judge question: "Isn't SERIALIZABLE the 'more correct' choice?"**
Answer: Both are fully correct for this problem — they solve the same race condition differently. `SERIALIZABLE` is the right default when you have complex, multi-row invariants and conflicts are rare. We have a simple, single-row invariant ("this bid must beat the current price") with conflicts that are *expected to be frequent* on popular items, which is exactly the case where explicit row locking outperforms optimistic concurrency control.

## 8. Serialization Failure / Lock Contention Strategy

Even with `FOR UPDATE`, two failure modes remain possible and must be handled explicitly — this is the literal "graceful degradation" requirement:

1. **Lock wait timeout (the common case under heavy load).** If a bid request has been waiting for the row lock too long, we don't want it to hang forever and exhaust server connections. We set a bounded wait:
   ```sql
   SET LOCAL lock_timeout = '2s';
   ```
   inside the transaction. If the lock isn't acquired within 2 seconds, Postgres raises error `55P03 (lock_not_available)`. The app catches exactly that error code and returns **HTTP 503 with a clear message** ("this auction is under heavy load, please retry"), never a silent failure, never a hang.

2. **Deadlock (rare, but must be handled).** A deadlock (`40P01`) can only happen if a transaction ever locks more than one row in an order that conflicts with another transaction. Our bid transaction touches exactly one auction row, so deadlocks shouldn't occur in normal bidding — but we still handle `40P01` the same way as a serialization failure, defensively.

3. **Bounded, safe retry.** For `40P01` (deadlock) specifically — never for `55P03` (lock timeout, which means "the system is already saturated, don't add more load") — we retry the whole transaction up to **3 times** with a short, randomized backoff (25ms, then 60ms, then 120ms). After 3 failures we give up and return a clear error. This bound exists so a pathological case can never turn into an infinite retry loop that makes contention worse.

```js
// pseudocode shape of services/placeBid.js
async function placeBid(auctionId, userId, amount) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await runBidTransaction(auctionId, userId, amount);
    } catch (err) {
      if (err.code === '55P03') throw new HttpError(503, 'System busy, please retry.');
      if (err.code === '40P01' && attempt < 3) { await sleep(backoff(attempt)); continue; }
      throw err; // includes our own validation errors (409 too low, 410 ended)
    }
  }
}
```

**Judge question: "What happens under extreme load — does the system fall over?"**
Answer: No — it degrades gracefully. Requests either succeed, get a clear "too low"/"ended" rejection, or (under real saturation) get a clear 503 telling the client to back off, within a bounded 2 seconds. Nothing hangs indefinitely, nothing silently retries forever, and Postgres itself is never at risk of running out of connections because every transaction has a hard time bound.

## 9. Redis Responsibilities

**WHAT Redis does in this system — and, just as importantly, what it never does.**

Redis is **never consulted to decide whether a bid is valid.** That decision is made exclusively inside the Postgres transaction in §6–8. Redis's jobs are purely supporting:

1. **Pub/sub fanout for WebSocket broadcasts.** After a bid transaction commits, the API publishes `{auctionId, price, bidId, username}` to a Redis channel (e.g. `auction:{id}`). Every backend process subscribes to that channel and forwards the message to its own connected WebSocket clients. On a single Node process this is technically unnecessary (we could just broadcast in-process), but it's the standard pattern that lets the same code work unchanged if we ever ran two Node instances behind a load balancer — which is realistic if we needed to handle more concurrent WebSocket connections than one process can hold.
2. **Read-through cache for hot GET endpoints.** `GET /api/auctions/:id` (fetched on every page load and reconnect) can be cached in Redis with a short TTL (e.g. 2 seconds) or actively invalidated whenever a bid commits. This takes read load off Postgres so its connections stay available for the write path that actually needs correctness guarantees.
3. **Optional: simple rate limiting.** A basic per-IP or per-user token bucket in Redis (`INCR` + `EXPIRE`) to reject obviously abusive request floods *before* they reach Postgres at all — a first line of defense that keeps the lock-timeout path in §8 as the last line of defense, not the only one.

**Judge question: "If Redis goes down, does the site break or lose bid correctness?"**
Answer: Bid correctness is unaffected — that guarantee lives entirely in Postgres. If Redis goes down, we'd lose the cache (falls back to hitting Postgres directly for reads — slower, not wrong) and cross-instance broadcast (in a single-instance demo, nothing changes; with multiple instances, clients on other instances would stop getting live updates until Redis recovers). This is why Redis is explicitly *not* on the critical path for correctness — only for scale and convenience.

## 10. WebSocket Event Flow

```
Client connects  →  ws.send({type:'subscribe', auctionId})
Server            →  adds socket to room `auction:{id}`
Server            →  ws.send({type:'snapshot', auction: {...current state...}})   // initial sync

... later, a bid commits in Postgres ...

Server (after COMMIT succeeds, never before)
                  →  publish to Redis channel `auction:{id}`
Every server instance subscribed to that channel
                  →  broadcasts to all sockets in room `auction:{id}`:
                     {type:'bid_accepted', auctionId, price, bidId, username, at}

... if auction's ends_at passes (checked by a periodic sweep) ...
Server            →  broadcasts {type:'auction_ended', auctionId, winningBidId}

Client disconnects (network drop, tab close, etc.)
                  →  server removes socket from room, cleans up
Client reconnect logic (frontend hook)
                  →  exponential backoff reconnect, re-subscribes, receives a fresh
                     'snapshot' so it can't be left showing stale data
```

**WHY snapshot-on-subscribe matters:** a client that connects (or reconnects after a drop) *after* several bids already happened must not sit there showing an old price waiting for the "next" event — it needs the current truth immediately. That's why every subscribe triggers an explicit REST-equivalent snapshot, not just a promise of future events.

**Judge question: "What does a user see if their WebSocket drops for 10 seconds during bidding?"**
Answer: The UI shows a visible "reconnecting" state (not a frozen, misleadingly-live-looking price). When the socket reconnects, it immediately re-subscribes and receives a fresh snapshot, so any bids that happened during the drop are reflected correctly rather than silently missed.

## 11. API Endpoints

| Method | Path | Purpose | Notes |
|---|---|---|---|
| POST | `/api/users` | Create/login by username (no password — see below) | Returns a session token for the demo |
| GET | `/api/auctions` | List auctions | Cached in Redis, short TTL |
| GET | `/api/auctions/:id` | Auction detail + current price | Cached, invalidated on bid |
| POST | `/api/auctions/:id/bids` | Place a bid — the core endpoint | Runs §6–8 logic; returns 201, 409 (too low), 410 (ended), or 503 (busy) |
| GET | `/health` | Liveness + DB connectivity check | Already exists from Phase 0 |
| GET | `/metrics` | Basic counters for observability (§15) | Plain JSON, not full Prometheus (MVP scope) |

Authentication is intentionally minimal for this hackathon: a username with no password, issued a random opaque token stored client-side and sent as a header. This is called out explicitly in the docs as a demo simplification, not a security feature — real auth is out of scope for a 12-hour correctness-focused project.

## 12. Frontend Pages

- **Landing / username entry** — pick a display name once, stored locally.
- **Auction list** — cards (used sparingly, only where it's the right pattern — a list of distinct items) showing title, current price, time remaining, live-updating via WebSocket.
- **Auction detail** — the main demo screen: current price large and legible from a distance (projector-readable), a live bid feed, the bid form, and a clearly visible connection-status indicator (connected / reconnecting / disconnected).
- **Stress-test dashboard** — a page that, while a k6 run is happening against a chosen auction, shows live accepted-vs-rejected bid counts and current price ticking up in real time. This page *is* the "live concurrent stress demonstration" requirement made visible.

All pages must explicitly handle: loading, empty (no auctions yet), error (request failed), disconnected/reconnecting (WebSocket state), and ended (auction closed, winner shown) — these are correctness-adjacent states, not decoration, and skipping them would misrepresent the system's real behavior to a viewer.

## 13. Testing Strategy

1. **Unit tests (`node --test`)** for pure logic: bid validation rules (amount vs. current price + increment, status/ends_at checks) — fast, no database needed.
2. **Integration test against a real local Postgres**: run `placeBid` end-to-end for a single bid, assert the row states are correct.
3. **Concurrency correctness test (the most important one)**: a script that fires many simultaneous bid requests at one auction and asserts, from the database afterward, that (a) exactly one bid is recorded as the winner, (b) `auctions.current_price` matches `MAX(bids.amount)` for that auction, (c) no bid lower than a previously-accepted bid was ever accepted. This is run and its **real, printed output** is what we report — never an invented number.
4. **Manual browser verification**: multiple tabs bidding on the same auction, watching live updates and rejection messages, for each frontend phase.

## 14. k6 Stress-Test Strategy

**WHAT:** A k6 script (`k6/bid-stress.js`) that ramps virtual users up, holds, then ramps down, all hitting `POST /api/auctions/:id/bids` for one target auction (to specifically prove hot-row correctness under contention) and, separately, a scenario spread across many auctions (to measure aggregate system throughput).

```js
export const options = {
  scenarios: {
    hot_row: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '20s', target: 200 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.5'],       // rejections are expected (only one bid can win at a time); crashes are not
    http_req_duration: ['p(95)<2000'],   // our lock_timeout bound from §8
  },
};
```

**WHY separate "hot row" vs "many auctions" scenarios:** these measure two different, both-true things. On one auction, correctness *requires* serialization, so throughput is capped by how fast Postgres can process one lock queue (expect maybe hundreds, not thousands, of accepted bids/sec on a laptop — and only one of them can ever be "the current price" at a time). Across many different auctions, each has its own independent row lock, so throughput scales roughly with hardware/connection pool size, and this is where a number closer to the "~5,000 req/sec" target is meaningfully measured — as *aggregate accepted-or-correctly-rejected requests per second across the system*, not as "one row accepting 5,000 winning bids per second," which isn't a coherent goal (only one bid can win per row at a time by definition).

**HOW we report results:** whatever k6 actually prints (requests/sec, p95 latency, error rate) after a real local run is what goes in the demo and docs. If the number is 800 req/sec, we say 800 req/sec and explain the hardware/DB pool constraints — we do not round up or invent a number to match the "~5,000" example figure.

**Judge question: "Did you hit 5,000 requests per second?"**
Honest answer, to be filled in with real measured numbers once we run it: state the actual measured aggregate throughput and p95 latency from the k6 run, and explain the hot-row-vs-many-auctions distinction above so the number is understood in context rather than compared apples-to-oranges against a single-row figure.

## 15. Observability Strategy

Kept intentionally lightweight for a 12-hour MVP — no Prometheus/Grafana stack (that would be over-engineering for this scope):

- **Structured console logs** for every bid attempt: outcome (accepted/rejected/busy), latency, auction id.
- **In-memory counters** (`backend/src/metrics.js`): total bids attempted, accepted, rejected-too-low, rejected-ended, busy (503), exposed as plain JSON at `GET /metrics`.
- **The stress-test dashboard (§12)** is effectively our live observability UI for the demo — it's more convincing to a judge than a metrics dashboard they don't know how to read.

If time allows post-MVP: a `/metrics` endpoint in Prometheus text format via `prom-client`, so it could be scraped by a real Grafana board — explicitly marked optional (§16).

## 16. MVP vs. Optional Features

**MVP (must exist for the demo to make its point):**
- Schema + `placeBid` transaction with `FOR UPDATE` locking and the §8 failure handling
- REST endpoints for auctions/bids/users
- WebSocket broadcast-after-commit with visible connection states
- The concurrency correctness test (§13.3) with real printed output
- A basic k6 script proving graceful degradation under load
- Auction list + detail pages with all required UI states

**Optional / cut first if behind schedule (in this order):**
1. Redis pub/sub for multi-instance broadcast (single-instance in-process broadcast works fine for a demo)
2. Redis read caching (Postgres can serve reads directly at demo scale)
3. Rate limiting layer
4. Stress-test dashboard as its own polished page (fall back to reading k6's own terminal output live during the demo)
5. `/metrics` in Prometheus format (JSON counters are enough)

Never cut: the transaction correctness logic itself, or the correctness test that proves it.

## 17. 12-Hour Implementation Sequence

| Phase | Time | Content |
|---|---|---|
| 0 (done) | 0.5h | Scaffolding, Postgres role, health check |
| 1 | 2h | Schema migrations + `placeBid` (§6–8) + concurrency correctness test, verified with real output |
| 2 | 1.5h | REST API around `placeBid`, error mapping to HTTP status codes |
| 3 | 1h | WebSocket broadcaster (in-process first; Redis pub/sub only if time allows) |
| 4 | 2.5h | Frontend: auction list/detail, bid form, live updates, connection states |
| 5 | 1h | k6 script + first real local load run, record actual numbers |
| 6 | 1.5h | UI/design pass using the installed design skills; stress-test dashboard |
| 7 | 1h | End-to-end verification: rerun concurrency test, rerun k6, lint/build both packages |
| 8 | 1h | Docs finalization + demo script/rehearsal |

~1h buffer distributed across phases, prioritized toward Phase 1 (the highest-risk phase) and Phase 7 (verification).

## 18. Biggest Technical Risks

1. **Hot-row contention degrading UX badly** — mitigated by the bounded `lock_timeout` + clear 503 (§8), tested directly by k6's hot-row scenario.
2. **Broadcasting before commit** (the single most important thing NOT to get wrong) — mitigated by keeping the broadcast call physically after the `COMMIT` line in code, and covered by the concurrency test checking no "phantom" price appears on a client that wasn't actually accepted in the DB.
3. **Running out of time before the correctness test is written** — mitigated by sequencing it in Phase 1, before any UI work, so even a worst-case time crunch leaves us with the one piece that actually proves the thesis.
4. **WebSocket reconnect edge cases** (client shows stale price after a drop) — mitigated by always sending a fresh snapshot on every (re)subscribe (§10).
5. **Windows-specific dev environment friction** (already hit once: `.env` path resolution) — mitigated by testing each phase's actual running behavior, not just "it compiled."

## 19. Fallback Plan If Something Fails

- **If Redis setup eats too much time or breaks:** cut it entirely (§16) — broadcast in-process, read from Postgres directly. Nothing about correctness depends on Redis.
- **If k6 can't be installed/run in the environment:** fall back to the Node-based concurrency test script from Phase 1 (§13.3) as the load/correctness demonstration; it already proves the same core claim (no lost/duplicated bids under concurrency), just without k6's throughput/latency reporting polish.
- **If the WebSocket layer has an unresolved bug near the deadline:** demo falls back to polling (`GET /api/auctions/:id` every second) — still shows live-ish updates and, crucially, still respects "never show a bid before commit," just with higher latency. This is a legitimate documented fallback, not a hack we hide.
- **If frontend polish isn't finished:** an ugly-but-functional UI showing correct real-time state honestly beats a beautiful UI faking it. Correctness and the k6/concurrency-test evidence are the deliverable of last resort.

## 20. Exact Hackathon Requirements That Must Be Visible in the Demo

Checklist to walk through live, each mapped to where it's proven:

- [ ] **Valid bid serialization under race conditions** → run the concurrency correctness test live, show its real printed output (§13.3)
- [ ] **Reject lower/out-of-order bids** → in the UI, fire two near-simultaneous bids from two tabs, show one accepted and one rejected with a clear message (§6)
- [ ] **Low-latency broadcast of updated prices** → both tabs' price updates visibly in real time after the accepted bid, not on refresh (§10)
- [ ] **Live concurrent stress demonstration** → run the k6 script live against a hot auction, show the dashboard/terminal ticking (§14)
- [ ] **Data integrity** → query the database live after the stress test, show `current_price = MAX(bids.amount)` holds exactly
- [ ] **Graceful degradation under database lock contention** → during the k6 run, show a deliberately-throttled scenario producing clear 503 "busy" responses instead of hangs or crashes (§8)
- [ ] **Target throughput context (~5,000 req/sec)** → show k6's actual measured output and explain the hot-row-vs-aggregate distinction honestly (§14)

Anything on this list we can't yet demonstrate honestly should be said out loud as "not yet verified" rather than implied — matching the project's own rule against fabricated results.
