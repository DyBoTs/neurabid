# Admin Command Center

This document explains the admin dashboard: what every number on it actually measures, where each one comes from, and — just as importantly — what it deliberately does *not* claim.

## 1. The rule this whole page follows

**Every value shown is either a real, live measurement or an explicit "Not measured yet."** Nothing is a hardcoded placeholder, and a genuine zero (e.g. "0 rejected bids" when the system really has rejected none) is never confused with "we haven't measured this." The two are visually and semantically different: a real `0` renders as a number; "unmeasured" renders as the literal text "Not measured yet," styled distinctly (see `Admin.module.css`'s `.statValueMuted`).

## 2. Where each section's data comes from

| Section | Data source | Real or derived? |
|---|---|---|
| **System Health** | `GET /api/admin/dashboard` → live `SELECT 1` against Postgres, a live `PING` against Redis, and the live count of currently-open WebSocket connections | Real, checked on every poll — not cached, not assumed |
| **Auction Overview** | A live `COUNT(*) WHERE status='active'` and a live `MAX(current_price)` query against the real `auctions` table | Real, queried fresh every poll |
| **Live Bid Stream** | A WebSocket subscription (`{type:'subscribe_admin'}`) that receives every `bid_accepted` event system-wide, the instant it's broadcast | Real-time, not polled — see §4 |
| **Performance** | `backend/src/metrics.ts`, an in-memory record of every real HTTP bid request's actual outcome and latency since this process started | Real, but process-lifetime only — see §5 |
| **Concurrency/Correctness** | `backend/src/services/verifyCorrectness.ts`, which re-derives correctness independently from the raw database, right now | Real, live re-verification — see §6 |

## 3. System Health

`GET /api/admin/dashboard` answers `api: 'ok'` unconditionally — if this response is being sent at all, the API is, by definition, up. `db` and `redis` are the result of an actual query/ping made at request time (the exact same checks `/health` already performs, reused here). `websocket.connections` is `backend/src/ws/broadcaster.ts`'s live count of every currently-open socket — incremented on `connection`, decremented on `close`, tracked in a `Set` so it can never double-count a reconnect.

**Judge question: "What happens if Postgres is actually down?"** The dashboard would show `db: ERROR` in red immediately on the next poll (every 3 seconds) — because the query genuinely fails, not because a flag was flipped.

## 4. Live Bid Stream — a second WebSocket channel, not five hundred subscriptions

The Live Auction page subscribes to *one* auction's room. The admin dashboard needs to see bids from *every* auction at once, which a per-auction room can't do without joining all of them individually (and missing any auction created after the dashboard connected). Instead, `broadcaster.ts` has a second, parallel channel: `subscribeAdmin(socket)` adds a socket to an `adminSockets` set, and every accepted bid is broadcast to *both* its auction's room (`broadcast()`) *and* the admin set (`broadcastAdmin()`) — from the same route handler, right after the same `placeBid()` call, so the same "never before commit" guarantee applies here as everywhere else in the system (see `docs/05-realtime.md`).

This was a deliberate, small addition to the existing broadcaster rather than a separate polling mechanism, because a load test is exactly the scenario where polling would visibly lag behind reality on the one screen meant to show it in real time.

## 5. Performance — what's actually measured, and its real limitation

`backend/src/metrics.ts` is instrumented around the real `POST /api/auctions/:id/bids` route handler — timing starts immediately before `placeBid()` is called and stops the moment it resolves or rejects, for *every* real HTTP request, whether accepted or rejected. From that:

- **Total / accepted / rejected bid counts** — exact, real counters.
- **Bids/sec** — the count of samples recorded in the last 10 real seconds, divided by 10. If it's been quiet, this can genuinely be `0.00/sec` (a real measurement), which is different from `null` (`"Not measured yet"`, meaning zero bids have *ever* been recorded this process).
- **Average / p95 / p99 latency** — computed from up to the last 2,000 real samples (a bounded ring buffer, so memory doesn't grow unbounded during a long-running load test).

**The honest limitation, stated plainly:** these numbers reset to "Not measured yet" on every server restart, because they live in process memory, not the database. For a hackathon-scope dashboard this is an accepted tradeoff (persisting a full metrics history is real infrastructure this project doesn't need) — but it means "restart the backend mid-demo" would visibly reset the Performance section, which is worth knowing before a live demo, not discovering during one.

**Judge question: "Is this p95 real, or an example number?"** It's computed from actual recorded request latencies on this exact process — run a real k6/concurrency load against a running server and watch the numbers move; nothing here is seeded or simulated.

## 6. Concurrency/Correctness — real re-verification, not a badge

`verifyCorrectness()` does not trust anything the application claimed earlier. For every auction that has at least one bid, it independently re-derives, straight from `bids` and `auctions`:

- every bid, in true commit order, is at least `min_increment` higher than the one before it (the same invariant `docs/04-concurrency-testing.md`'s tests check, run here against live data instead of a test fixture);
- no two bids for the same auction share an amount;
- `auctions.current_price` and `current_bid_id` actually match the highest real bid row.

If **zero** auctions have any bids yet, the status is `not_measured_yet` — deliberately distinct from `verified`, because "nothing to check yet" and "checked everything and it's correct" are different claims, and only one of them is actually true before any bidding has happened. If a violation is ever found, it's listed by auction id and exact message, not summarized away.

**Judge question: "Couldn't the app just lie about this being verified?"** No — this endpoint doesn't ask the application anything; it queries the raw tables itself and recomputes the invariants from scratch on every request. If a real bug ever let two bids tie, or let `current_price` drift from the real max, this would show `violations_found` with the specific broken auction, not "verified."

## 7. Projector readability decisions

- Numbers use `Fira Code` with `tabular-nums`, sized at `--text-xl` (28px) for stat values — legible from across a room, per `docs/06-design-system.md`.
- Health/status uses solid-fill badges (green/red), never a subtle color-only dot, so pass/fail reads instantly from a distance.
- The live bid stream's newest row gets the same brief highlight fade as the Live Auction page's bid history (`docs/06-design-system.md` §8) — a real-event-triggered cue, not a decorative loop, so an in-progress load test is visually obvious without anyone narrating it.
- The dashboard polls every 3 seconds for health/overview/performance/correctness (fast enough to feel live during a demo, slow enough not to hammer the database with `verifyCorrectness()`'s per-auction queries) while the bid stream itself is genuinely real-time over WebSocket.

## 8. Verification

Backend: `backend/test/routes.admin.test.ts` — real system health reporting, a real active-auction count and current-highest-bid query, the "never a hardcoded 0" contract on performance fields, real accepted/rejected counters incrementing after real HTTP bid attempts (not direct `placeBid()` calls, which would bypass the route-level instrumentation entirely — an earlier draft of this test called `placeBid()` directly and, correctly, failed to see any metrics change, which is what caught this distinction), and a real correctness re-verification after placing an actual bid.

```
$ cd backend && npx vitest run test/routes.admin.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
```
