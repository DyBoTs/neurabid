# Real-Time Bidding — WebSockets, Not Socket.IO

This document explains how a bid placed by one browser shows up, live, in every other browser watching that auction — and why the design is built the way it is.

## 1. Why raw WebSockets (`ws`), not Socket.IO

We chose the plain `ws` library over Socket.IO, and haven't revisited that since Phase 0. Reasons, restated here because this task specifically asked to justify the real-time transport choice:

- **Socket.IO adds a protocol on top of WebSocket** (framing, automatic fallback to HTTP long-polling, acknowledgements, rooms as a first-class API) that we don't need — we have exactly one message type going each direction (`subscribe` in, a handful of event types out).
- **Transparency.** With raw `ws`, every message that crosses the wire is exactly the JSON we wrote, with nothing hidden behind a client library's abstractions — useful for a project whose whole point is to be explainable in a demo Q&A.
- **No new dependency, no framework switch mid-project.** `ws` has been in `package.json` since Phase 0 and every earlier phase's tests already depend on its exact API. Switching now would be pure churn with no correctness benefit — the requirements below (subscribe, commit-then-broadcast, reconnect, resync) are transport-agnostic; nothing about them needs Socket.IO's extra machinery.

## 2. Redis Pub/Sub: not used, and why

The project plan (`docs/01-project-plan.md` §9) always scoped Redis pub/sub as a way to fan a broadcast out to **multiple backend processes** — if NeuraBid ever ran more than one Node instance behind a load balancer, each instance would hold its own subset of WebSocket connections, and only the instance that handled a given HTTP bid request would know to broadcast it, unless every instance subscribed to a shared Redis channel and re-broadcast to its own local sockets.

We run exactly **one** backend process. `backend/src/ws/broadcaster.ts` is a plain in-process `Map<auctionId, Set<WebSocket>>` — the same process that commits the bid also holds every relevant socket, so there is no cross-process fan-out problem to solve. Adding Redis pub/sub here would be infrastructure with no job to do, which the project's own rules explicitly warn against ("do not overengineer" / "do not add unnecessary infrastructure").

**When this would need to change:** the moment there's more than one backend instance, `broadcast()` would need to publish to a Redis channel instead of iterating a local `Map`, and every instance would subscribe to that channel and forward to its own local sockets. The function signature (`broadcast(auctionId, event)`) was deliberately kept as the single choke point precisely so that swap, if it's ever needed, touches one file.

## 3. The exact flow: HTTP request → transaction → commit → event → WebSocket → clients

```
Browser A                Express route              placeBid()              Postgres           broadcaster        Browser A & B
(POST bid)          (routes/auctions.ts)      (services/placeBid.ts)                          (ws/broadcaster.ts)   (subscribed)
    |                        |                          |                       |                    |                  |
    |--- POST /bids -------->|                          |                       |                    |                  |
    |                        |--- placeBid(...) ------->|                       |                    |                  |
    |                        |                          |--- BEGIN ------------>|                    |                  |
    |                        |                          |--- SELECT FOR UPDATE->|                    |                  |
    |                        |                          |<-- current price -----|                    |                  |
    |                        |                          |   (validate amount)   |                    |                  |
    |                        |                          |--- INSERT bid ------->|                    |                  |
    |                        |                          |--- UPDATE auctions -->|                    |                  |
    |                        |                          |--- COMMIT ----------->|                    |                  |
    |                        |                          |<== promise resolves ==|                    |                  |
    |                        |<== result (bidId, ...) ==|                       |                    |                  |
    |                        |--- broadcast(auctionId, bid_accepted event) --------------------------->|                  |
    |                        |                                                                        |--- send() ------>|
    |<-- 201 {bidId,...} ----|                                                                                            |--- send() ------>|
```

The critical property: the `broadcast(...)` call in `routes/auctions.ts` is written on the line **immediately after** `await placeBid(...)` returns — and `placeBid()`'s promise cannot resolve until its `COMMIT` has actually succeeded (see `docs/03-bid-engine.md` §3). There is no code path where a client sees `bid_accepted` for a bid that isn't already, provably, sitting in the database. `backend/test/ws.integration.test.ts`'s rejection test proves the negative case directly: a bid that gets rejected produces **zero** WebSocket messages, not a "bid_rejected" event or anything else — rejections are only ever visible in the HTTP response to the bidder who made them.

## 4. Message contract (`backend/src/ws/messages.ts`)

| Message | Direction | Fields |
|---|---|---|
| `subscribe` | client → server | `auctionId` |
| `snapshot` | server → client | `auction` (the full current auction state — same shape as `GET /api/auctions/:id`) |
| `bid_accepted` | server → subscribers | `auctionId`, `bidId`, `amount`, `currentHighest`, `userId`, `timestamp` |
| `auction_ended` | server → subscribers | `auctionId`, `winningBidId`, `finalPrice` |
| `error` | server → client | `message` |

`bid_accepted` carries both `amount` (this specific bid's value) and `currentHighest` (the auction's new current price) as separate, explicit fields — for the bid that just won, they're always equal, but keeping them as distinct named fields means a client never has to infer "is this bid now the highest?" from context; the server states it directly.

## 5. Reconnect and authoritative resync

There is no session, token, or server-side memory tied to a WebSocket connection beyond "which auctions is this specific socket subscribed to" (and that's forgotten the instant the socket closes — see `unsubscribeAll()`). This is deliberate: **reconnecting is not a special operation**. A client that drops and comes back simply opens a brand-new WebSocket connection and sends the same `subscribe` message it would send on first load. The server has no idea, and doesn't need to know, whether this is a "first connect" or a "reconnect."

What makes this safe is that **every subscribe — first time or the hundredth reconnect — gets answered with a fresh `snapshot` pulled from the database at that exact moment**, via the same `getAuctionById()` the REST API uses. A client is never expected to "catch up" by replaying missed events; it's simply told the truth as it currently stands. This is why `backend/test/ws.integration.test.ts`'s resync test disconnects a client, has a bid happen while it's gone, then reconnects and asserts the new snapshot shows the post-bid price — not the stale pre-disconnect price, and not some attempt to replay the specific bid event it missed. The database is the only thing a reconnecting client ever has to trust.

## 6. Tests

| Requirement | Test |
|---|---|
| Connection | `ws.integration.test.ts` → "connection: a client can open a WebSocket connection to the server" |
| Subscription | `ws.integration.test.ts` → "subscription: sends a full snapshot immediately on subscribe" |
| Accepted event (all required fields) | `ws.integration.test.ts` → "accepted event: broadcasts bid_accepted with all required fields, only after the HTTP request has actually completed" |
| Rejection never appears as an accepted live event | `ws.integration.test.ts` → "rejection: does not broadcast a rejected (too-low) bid attempt to subscribers" |
| Reconnect | `ws.integration.test.ts` → "reconnect: a client can close its connection and open a brand new one without any special handshake" |
| State resync | `ws.integration.test.ts` → "state resync: reconnecting after missing a bid gets the TRUE current state, not stale or replayed data" |
| Room/broadcast mechanics in isolation | `broadcaster.test.ts` (5 tests, mocked sockets — fast, no server needed) |
| Auction-ended broadcast | `auctionEndSweep.test.ts` |

All of these run against a real bound TCP port with a real `ws` client (not simulated) — see the file's header comment for why that's necessary for WebSocket tests specifically, unlike the HTTP route tests which can use supertest in-process.

```
$ cd backend && npx vitest run
 Test Files  11 passed (11)
      Tests  48 passed (48)
```

## 7. Manual test: two browser windows

A plain debug page exists at **`http://localhost:4000/debug/realtime-test.html`** specifically for this — it is explicitly not the product UI (that's Phase 4), just a functional harness for watching the WebSocket layer work with real browsers. To reproduce:

1. `docker compose up -d && npm run migrate && npm run seed && npm run dev:backend`
2. Open `http://localhost:4000/debug/realtime-test.html` in **two** browser windows (or tabs).
3. In both, click "Create / use this user" (use different usernames), and pick the same auction from the dropdown in both.
4. In window A, place a bid. **Window B's price updates live, with no manual refresh**, because it received the `bid_accepted` broadcast.
5. In window A, attempt a bid below the new minimum — it's rejected in window A's own response, and window B sees nothing happen (proving rejections don't leak as live events).
6. To see reconnect + resync: close window B's browser tab, place another bid from window A, then reopen the debug page in a new tab and re-subscribe to the same auction — it immediately shows the post-bid price, not the state from before it was closed.

**This was actually performed** (two real Chrome tabs, driven directly, not simulated) while writing this phase. Real results:

- Window A (`alice_debug`) and window B (`bob_debug`) both subscribed to "Vintage Synthesizer" (starting at $100). Both showed `currentPrice: 100` from their own independent `snapshot` messages.
- Window A bid $120 → accepted (`201`, `bidId: ca2391fb-...`). **Window B's price changed to 120 with zero interaction on window B** — its event log shows the exact `bid_accepted` message (`{"type":"bid_accepted","auctionId":"ad3e4c3b-...","bidId":"ca2391fb-...","amount":120,"currentHighest":120,"userId":"1357566a-...","timestamp":"2026-09-17T17:10:12.800Z"}`) arriving unprompted.
- Window A then bid $121 (below the new $125 minimum) → rejected (`409`, `"Bid too low: minimum next bid is 125.00"`). Window B's event log has **no new entry at all** for this — confirmed by scrolling to the bottom of its log, which still ended at the $120 `bid_accepted` message.
- Window B's tab was then closed entirely (simulating a dropped connection). Window A placed a **third** bid, $150 → accepted (`bidId: f4b7a92c-...`), with window B not present to receive anything.
- A **brand-new** tab (no relation to window B's old connection — new subscribe, first message ever sent) was opened and subscribed to the same auction. It immediately received a `snapshot` with `currentPrice: 150` and `currentBidId: "f4b7a92c-..."` — the exact bid that happened while it was "offline" — proving the resync reflects true current state from the database, not a stale cache and not a replayed event log.

This matches every claim in §3 and §5 of this document with real, observed evidence rather than an untested description of expected behavior.
