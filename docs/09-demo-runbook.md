# Hackathon Demo Runbook

Exact, click-by-click instructions for four demo segments. Every screenshot-able step below was actually clicked through on this machine while writing this doc — none of it is a plan for something untested.

*(Numbering note: shifted to `docs/09` to stay sequential after `docs/07-admin-dashboard.md` and `docs/08-load-testing.md`.)*

## 0. Before the demo starts (setup, once)

```bash
docker compose up -d
npm run migrate
npm run dev:backend      # terminal 1
npm run dev:frontend     # terminal 2
```

Open two things in your browser:
- **Tab 1**: `http://localhost:5173/admin` — this stays open and visible (ideally projected) for the whole demo. It's your live evidence for every claim you make.
- **Tab 2**: you'll navigate this one to the demo auction and back to Admin as needed.

Log in once (top-right "Log in") with any username — this is the account you'll bid from as "yourself" in Demo A.

## Demo A — Normal Bidding (real, single bidder — no simulation)

**What this proves:** a real person, placing a real bid, sees it accepted and reflected live.

1. On the **Admin** tab, in the **Demo Controls** section, click **Reset Demo Auction**.
   - *What just happened, for real:* the auction titled "NeuraBid Live Demo Auction" was reset to $100.00, zero bids, in Postgres — via a real `DELETE`/`UPDATE`, not a page refresh.
2. Click the **View demo auction** link that appears (or go to Marketplace → "NeuraBid Live Demo Auction").
3. Point out on screen, before doing anything: **Current highest bid $100.00**, the green **Live** connection indicator, the countdown timer ticking, "No bids yet — be the first."
4. In **Bid amount**, type `105` and click **Place Bid**.
5. Point out: the price flashes green and updates to **$105.00**, "Bid accepted: $105.00" appears, and a new row appears in **Live bid history** showing "You".
6. Switch back to the **Admin** tab (it's been polling in the background — no action needed) and point out: **Auction Overview → Current highest bid** is now $105.00, **Performance → Accepted** went up by 1, and the new bid appears in the **Live Bid Stream** table — all without you touching the Admin tab.

**Nothing in this segment is simulated** — say so explicitly if asked.

## Demo B — Simultaneous Bids (SIMULATED — clearly labeled in the UI)

**What this proves:** when multiple bids race for the same auction at the same instant, exactly one wins and the rest are correctly rejected — the core claim of the whole project.

1. On **Admin**, click **Reset Demo Auction** again (clean state, no leftover bids from Demo A).
2. Point out the **"SIMULATED / LOAD-GENERATED TRAFFIC ONLY BELOW THIS LINE"** label — say explicitly: *"Everything below this line uses bot accounts named `demo_bot_N`, not real people — but every one of these calls the real bidding endpoint, the real database transaction, the real WebSocket broadcast. Nothing about the result is faked."*
3. Set **Concurrent bots** to `5`.
4. Click **Simulate Concurrent Bids**.
5. Read the result out loud: *"Requested 5 concurrent bids at the same amount — 1 accepted, 4 rejected (only one can win a real race on one row)."*
6. Point at **Live Bid Stream**: exactly one new row appears, bidder `demo_bot_N` (truncated id) — not five.
7. (Optional, if asked "how do you know the other 4 didn't also get in somehow?") Open a terminal and run:
   ```bash
   node tests/load/check-correctness.mjs
   ```
   Point at `Violations found: 0`.

## Demo C — Stress Test (SIMULATED / LOAD-GENERATED — clearly labeled)

**What this proves:** the system holds up, correctly, under much heavier concurrent load than one human could generate by clicking.

**Primary path (reliable, no extra tooling — recommended for the actual demo):**

1. On **Admin**, click **Reset Demo Auction**.
2. Set **Concurrent bots** to `150` (the maximum this control allows).
3. Click **Simulate Concurrent Bids** and narrate while it runs: *"150 real bid attempts, fired concurrently, all targeting the same auction."*
4. Point at **Performance**: **Total bid attempts**, **Accepted**, **Rejected**, and the real **avg/p95/p99 latency** numbers that just appeared — say plainly that these are measured, not estimated (`backend/src/metrics.ts` times every real request).
5. Point at **Concurrency/Correctness**: still **VERIFIED**, **Auctions checked** count went up.

**Optional, more advanced path** (only if you have a second terminal free and want to show the actual k6 load-testing tool from `docs/08-load-testing.md`):

```bash
k6 run -e STAGE=2 tests/load/bidding.js    # 100 concurrent users, ~35s
```
This creates its *own* pool of auctions (not the demo auction) and reports real k6 metrics live in the terminal — narrate the req/sec and p95/p99 numbers as they print. This is heavier and takes longer than the primary path, so only use it if you have time and want to show the dedicated load-testing tool specifically, not the Admin page's quick simulator.

**Either way, say explicitly:** *"This traffic is machine-generated on demand to demonstrate concurrency at a scale no human clicking could reach live — the correctness guarantee it's testing is exactly the same one Demo A's single real bid relied on."*

## Demo D — Final Correctness Verification

**What this proves:** the "verified" claim isn't a static badge — it's re-derived from the live database on demand, and you can prove it in front of judges right now.

1. On **Admin**, point at **Concurrency/Correctness**: **STATUS: VERIFIED**, note the **Auctions checked** number (it includes every auction touched in Demos A–C).
2. Open a terminal and run:
   ```bash
   node tests/load/check-correctness.mjs
   ```
3. Read the output aloud — it independently re-queries Postgres and prints:
   - `Status: verified`
   - `Violations found: 0`
   - the real `Total bid attempts` / `accepted` / `rejected` split
4. Say explicitly: *"This isn't summarizing what the app told us happened — `verifyCorrectness()` re-reads every bid for every auction directly from Postgres and checks, right now, that every accepted bid was strictly higher than the one before it, no two bids share an amount, and the cached current price matches the real highest bid. If any of that were ever false, this would say `violations_found` and list exactly which auction and why — not a generic failure."*

## Resetting for a repeat run

The whole demo is reproducible from a clean state at any time:

```
Admin → Reset Demo Auction
```

This is the only step needed between full run-throughs — it doesn't touch user accounts, other auctions, or anything outside the one named demo auction, so you can repeat Demos A–D as many times as you want during Q&A without restarting anything.

## What to say if a judge asks "was any of that faked?"

- Demo A: no simulation at all — a real click, a real request, a real database row.
- Demo B and C: the *traffic* is bot-generated on demand (visually labeled in the UI, and every bot username starts with `demo_bot_`) — the *code path* is identical to Demo A's, all the way down to the same `placeBidAndAnnounce()` function, the same database transaction, the same WebSocket broadcast.
- Demo D: independently re-verified against the live database, not summarized from application state.
