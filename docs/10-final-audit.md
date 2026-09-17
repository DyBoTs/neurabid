# Final Judge + Engineering Audit

This is Phase 12: a final pass acting as a strict hackathon judge, a distributed-systems
engineer, a security reviewer, and a UX reviewer at once. Every check below was actually
run on this machine while writing this document — nothing here is estimated or assumed
from earlier phases without being re-verified now. Where a claim rests on evidence from
an earlier phase (e.g. Phase 8's full 5-stage load test), that's stated explicitly rather
than silently re-presented as new.

**Scope note on security**: Phase 10 (a dedicated Security + Reliability Audit) was
explicitly skipped mid-project at the user's request. Requirement 10 below is therefore a
plain, honest sanity check — parameterized queries, secret handling, and known gaps — not
the deeper audit Phase 10 would have been. Gaps found are listed candidly rather than
hidden.

## The 12 requirements

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Last-Write-Wins is not used | **PASS** | `backend/src/services/placeBid.ts` locks the auction row with `SELECT ... FOR UPDATE` and re-checks the bid against the price read *under that lock* — never against a value the client sent or cached. There is no code path that writes a bid based on "whichever request arrived last." |
| 2 | A lower bid is rejected once a higher one has committed | **PASS** | Same function, lines 112-120: `minValidAmount = currentPrice + minIncrement`, computed from the row locked in step 1, rejects with `409` if the new bid doesn't clear it. Proven under real concurrency, not just single-threaded logic, by `test/placeBid.concurrency.test.ts` and `test/concurrencyProof.test.ts` — re-run just now: 25 escalating concurrent bids → 4 accepted / 21 rejected, 50 concurrent distinct bidders → 3 accepted / 47 rejected, always monotonically increasing, 0 violations. |
| 3 | Bids are rejected after an auction closes | **PASS** | `placeBid.ts` lines 105-107: checked against `ends_at` directly (not only the `status` column, in case the sweep job hasn't run yet) → `410 Gone`. Covered by `test/placeBid.validation.test.ts` and `test/routes.auctions.test.ts`. |
| 4 | A bid is never broadcast as accepted before its transaction commits | **PASS** | `backend/src/services/placeBidAndAnnounce.ts` calls `await placeBid(...)` — which only returns after `COMMIT` succeeds — and broadcasts only after that `await` resolves; on any thrown error it records a rejection and never broadcasts. Directly tested: `test/ws.integration.test.ts`'s *"broadcasts bid_accepted ... only after the HTTP request has actually completed"* and *"does not broadcast a rejected (too-low) bid attempt"*, both passing. |
| 5 | Reconnect works correctly | **PASS** | `frontend/src/hooks/useAuctionSocket.ts`: on any socket close, reconnects with capped exponential backoff and re-sends the same `subscribe` message, and the server always answers with a fresh authoritative `snapshot` rather than replaying missed events. Tested server-side by `test/ws.integration.test.ts`'s *"reconnect: a client can close its connection and open a brand new one"* and *"state resync: reconnecting after missing a bid gets the TRUE current state, not stale or replayed data"*. `ConnectionStatus.test.tsx` (4 tests) confirms the UI renders all four states distinctly. |
| 6 | Database ends up in a consistent state | **PASS** | `backend/src/services/verifyCorrectness.ts`, invoked live just now via `node tests/load/check-correctness.mjs`: `Status: verified`, `Violations found: 0`, after a fresh reseed and a real 18-second k6 run (1,218 real HTTP bid attempts). Re-derives correctness directly from Postgres on every call — it does not trust cached application state. |
| 7 | Retries are bounded and safe | **PASS** | `placeBid.ts`: `MAX_ATTEMPTS = 3`, only retries on Postgres deadlock (`40P01`) with a fixed backoff table (`[25, 60, 120]` ms); a lock-acquisition timeout (`55P03`) is never retried and immediately returns `503`; a business rejection (`BidError`, e.g. "bid too low") is never retried at all, since retrying it can't change the outcome. Covered by `test/placeBid.retryAndLocking.test.ts`. |
| 8 | Metrics are genuine, not fabricated | **PASS** | Just re-ran a real k6 load stage against the live server: avg 6.06ms, p95 11.62ms, p99 16.21ms, 0.00% HTTP failures, 272 accepted / 946 rejected — printed directly from k6's own output, not hand-written. `backend/src/metrics.ts` times every real request; the Admin dashboard's `performance` block reflects that same live counter. Phase 8's full 5-stage run (100/500/1000 VUs, and an honestly-reported ~828-936 req/s instead of the requested 5,000/s) is documented, not re-claimed here as new. |
| 9 | Demo reset is reliable | **PASS** | `resetDemoAuction()` targets the demo auction by its fixed title, clears `current_bid_id` before deleting bids (the ordering bug from Phase 9, now fixed and regression-tested), and never touches any other auction or user. `test/routes.demo.test.ts` (6 tests) passing, including a repeat-reset case. |
| 10 | No obvious security issues | **PASS, with disclosed gaps** | Every SQL query in the codebase is parameterized (`$1`, `$2`, ...) — no string-built SQL was found anywhere. `.env` files are gitignored; no secret is committed. Auth is a documented, intentional simplification (`backend/src/routes/users.ts`'s own comment: *"intentionally-not-real auth ... this is a documented simplification, not a security feature"*) — pick a username, no password, identity carried as a plain `X-User-Id` header. That's correct for a hackathon demo and would need real sessions/tokens before handling real users. Two gaps found and left as-is (in scope): **no rate limiting** on any endpoint, and **no CORS headers** on the backend (works today only because Vite's dev proxy keeps frontend↔backend same-origin; a split-origin production deploy would need explicit CORS config). Both are named explicitly rather than silently omitted. |
| 11 | No obvious UX issues | **PASS** | Phase 11's audit (`docs/`, see `ARCHITECTURE.md`'s Phase 11 section) found and fixed two real layout bugs (a card-grid height break on long titles, a missing `flex-wrap` on the bid form) and confirmed keyboard focus, Enter-to-submit, loading/empty/error states, and the connection indicator were already correct. `unslop-ui`'s scanner returned 0 findings. |
| 12 | The system is explainable to a beginner | **PASS** | Every non-obvious decision has a short comment explaining *why*, not *what* (e.g. `placeBid.ts`'s lock-ordering comment, `useAuctionSocket.ts`'s reconnect-is-not-a-special-case comment). `docs/01` through `docs/09` each explain one phase's architecture in plain language, and this document explains the other side: what was actually verified and how. |

## Test evidence (all re-run just now, this session)

```
backend:  14 test files, 68 tests passed
frontend:  4 test files, 20 tests passed
lint:     clean (backend: eslint; frontend: oxlint — one pre-existing,
          unrelated fast-refresh warning in useAuth.tsx)
typecheck: clean (backend + frontend)
k6 Stage 1 (5 VUs, 18s): 1,218 real bid attempts, 0.00% HTTP failures,
          avg 6.06ms / p95 11.62ms / p99 16.21ms
check-correctness.mjs (after the k6 run): verified, 0 violations
```

## Known limitations (stated plainly, not hidden)

- **The backend test suite has no isolated test database** — it runs against the same
  Postgres/Redis the dev server uses (`backend/.env` is the only config, for both). This
  means running `npm test` during or right before a live demo can leave behind test data
  (e.g. `routes.demo.test.ts` resets/rebuilds the actual demo auction as a side effect).
  **Practical fix for demo day: always run `npm run seed --workspace=backend` immediately
  before presenting, after any test run** — this was discovered directly in this audit
  when a post-test dashboard check showed unexpected demo-auction state.
- **Throughput plateaus around ~830-940 req/sec**, not the ~5,000 req/sec Phase 8 aimed
  for, because of `backend/src/db.ts`'s deliberate `pool.max: 20` — a conscious
  hackathon-scope tradeoff (`docs/08-load-testing.md` has the full data), not a bug.
- **No rate limiting, no CORS headers** on the backend (see requirement 10 above).
  Acceptable for a local/demo deployment; would need addressing before any real
  multi-origin or public-internet deployment.
- **Auth is username-only, no passwords, no sessions** — by design, documented in the
  code itself, appropriate for this project's scope.

## Exact demo commands

Full click-by-click detail is in `docs/09-demo-runbook.md`; the essentials:

```bash
docker compose up -d
npm run migrate
npm run seed --workspace=backend     # clean, known state — run this right before presenting
npm run dev:backend                  # terminal 1
npm run dev:frontend                 # terminal 2
```

Then in the browser: `http://localhost:5173` → Admin tab open and visible → follow Demos
A (real single bid), B (5 simulated concurrent bidders, 1 wins), C (150-bidder stress
test via the Admin page's simulator), D (live correctness re-verification), exactly as
written in `docs/09-demo-runbook.md`.

To show the independent correctness check from a terminal at any point:

```bash
node tests/load/check-correctness.mjs
```

## 3-minute presentation flow

1. **(30s) The claim.** "NeuraBid is a real-time bidding platform where Postgres, not the
   client and not 'last write wins', decides who actually won a bid — even when hundreds
   of bids race for the same item at the same instant." Show the Admin dashboard, point
   at **Status: VERIFIED**.
2. **(45s) Demo A — one real bid.** Reset the demo auction, place one real bid as
   yourself, show it land instantly on both the auction page and the Admin dashboard via
   the live WebSocket connection (point at the green **Live** indicator).
3. **(60s) Demo B — the actual claim, proven.** Reset again, fire 5 simulated concurrent
   bids at the identical amount from the Admin page. Read the result aloud: "1 accepted,
   4 rejected — because only one bid can actually win a race for one database row." Point
   at the Live Bid Stream: exactly one new row.
4. **(30s) Demo C — scale.** Fire 150 concurrent simulated bids. Point at the real
   avg/p95/p99 latency numbers that appear, and that correctness is still VERIFIED.
5. **(15s) Close.** Run `node tests/load/check-correctness.mjs` live in a terminal, read
   `Violations found: 0` aloud. "This isn't a badge — it re-derives correctness from the
   live database every time you ask it to."

## 10 judge questions and honest answers

**1. "What actually stops two people from winning the same bid at the same instant?"**
A single Postgres row lock (`SELECT ... FOR UPDATE`) on the auction being bid on. The
second transaction physically cannot read the row until the first one commits or rolls
back, so it always sees the *updated* price and correctly rejects if it's now too low.
No in-memory lock, no external lock service — the database itself is the single source
of truth.

**2. "Why not just use `SERIALIZABLE` isolation instead of row locks?"**
Row locking (`FOR UPDATE`) gives the same correctness guarantee for this specific
access pattern — one row, read-then-write — with predictable, bounded contention
instead of `SERIALIZABLE`'s unpredictable abort-and-retry storm under load. It's a
narrower tool chosen deliberately for a narrower job.

**3. "What happens if the database connection pool is exhausted?"**
Requests queue instead of erroring, up to `pool.max: 20`. Under very heavy load this
shows up as rising latency (documented in `docs/08-load-testing.md` — p95 rose from
66ms at 100 VUs to 1.73s trying to reach 5,000 req/sec), not incorrect data. It's a
throughput ceiling, not a correctness risk — the load test proved 0 violations even
saturated.

**4. "What if two people click 'bid' at literally the same millisecond?"**
Exactly what Demo B shows: both requests arrive, one acquires the row lock first
(Postgres decides the order, not the app), it commits, the second sees the new price
under its own lock and is correctly rejected. This is proven, not assumed — the
`concurrencyProof.test.ts` suite fires up to 50 simultaneous bidders per test.

**5. "Could a bid ever be shown to users as accepted, then later turn out to be
invalid?"**
No — the broadcast only fires after `placeBid()`'s transaction has already committed
(`placeBidAndAnnounce.ts`). There is no "optimistic" UI state for bid acceptance; the
server is asked first, always.

**6. "What happens if a client disconnects mid-bid?"**
The HTTP request either completes or it doesn't — there's no partial state, because
it's one atomic database transaction. If the client's WebSocket drops (unrelated to
the HTTP bid request), `useAuctionSocket` reconnects with backoff and gets a fresh,
authoritative snapshot — it never assumes or replays what it missed.

**7. "Is this secure enough to put on the real internet today?"**
No, and that's deliberate for a hackathon's scope — auth is a documented "pick a
username" simplification, and there's no rate limiting or CORS configuration yet
(see the audit's requirement 10). All SQL is parameterized and secrets aren't
committed, so the *data layer* is sound; the *access layer* would need real
authentication before a public launch.

**8. "How do you know your load test numbers aren't made up?"**
They're k6's own console output, re-run live for this very audit: 0.00% HTTP
failures, real percentile latencies, and a correctness check immediately afterward
confirming 0 violations across the resulting bid data. The full 5-stage run's honest
result — plateauing around 900 req/sec instead of the 5,000 target — is written down
with the actual bottleneck named (`pool.max: 20`), not hidden.

**9. "What's the single most fragile part of this system?"**
The connection pool size (`pool.max: 20`) is the deliberate throughput ceiling — raising
it is the known next step for higher scale. Separately, running the test suite against
the same database the demo uses means a demo operator must reseed right before
presenting; that's now written down explicitly as a limitation in this document so it's
never a surprise on stage.

**10. "If you had one more day, what would you build next?"**
Real authentication (passwords or an OAuth provider) and rate limiting on the bid
endpoint — the two disclosed gaps in requirement 10 — followed by raising the
connection pool size and re-running the Stage 5 load test to see how much of the
828-936 req/s ceiling was actually the pool versus something else.
