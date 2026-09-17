# Concurrency Testing — How We Proved NeuraBid Is Correct

This document explains, for beginners, how we tested that NeuraBid's bidding stays correct when many bids hit the same auction at once — and shows the real output from actually running those tests, repeatedly, on this machine.

The claim being tested is narrow and specific: **under any number of simultaneous bid attempts on the same auction, the database never accepts an invalid bid, never loses or duplicates an accepted one, and always ends up in a state that's fully explained by the bids that actually happened.** Nothing here tests UI, networking, or scale beyond a single Postgres instance — see `docs/01-project-plan.md` for where k6 load testing fits separately.

## 1. What "concurrent" actually means here

When we say bids are "simultaneous," we mean the test code calls `placeBid()` many times and does **not** wait for one to finish before starting the next — it fires them all via `Promise.allSettled([...])` and lets Node/Postgres handle whatever actually happens to run in parallel. This is a faithful simulation of "many browser tabs click Bid at the same instant": nobody controls which request's database transaction actually starts first, and the test doesn't pretend to know either.

## 2. The two test files

| File | What it covers |
|---|---|
| `backend/test/placeBid.concurrency.test.ts` | The original two proofs: two identical simultaneous bids, and a 25-bidder escalating stress case (from Phase 1). |
| `backend/test/concurrencyProof.test.ts` | The full scenario list requested for this phase (below), each ending with a call to the shared invariant checker. |

Both files run against a **real local Postgres** (via `docker compose up -d` + migrations) — nothing about the database is mocked. The one file that *does* mock the database, `placeBid.retryAndLocking.test.ts`, is deliberately separate — see §7.

## 3. Scenario-by-scenario

**Multiple valid increasing bids, submitted concurrently out of order.** 10 bidders each have a distinct, pre-decided target amount (100+5, 100+10, ... 100+50), submitted in shuffled order so arrival order doesn't match amount order. Proves the system doesn't depend on requests arriving "in the right order" — it re-checks the real price at lock time regardless.

**A lower bid attempted after a higher bid has already committed.** One bid for $150 is placed and *awaited* (so it's genuinely committed), then two more bids ($120 and $130 — both lower) are attempted concurrently with each other. Both must be rejected, because both are below the price that already, provably, exists in the database. This is the most direct test of "reject lower/out-of-order bids": it's not enough for the system to pick *a* winner among concurrent bids, it must never let a bid win that's lower than one that already won.

**Identical timing: many clients bidding the exact same amount at once.** 10 different users all bid exactly $105 on a $100 auction, all fired in the same instant. Exactly one can win — whichever gets the row lock first — and the rest must be rejected with a clear "too low" error (since once the first one commits, $105 is no longer above the new current price).

**Many clients racing: 50 concurrent distinct bidders.** The same idea as the first scenario, at 5x the scale, to check the guarantees hold as contention increases, not just at small N.

**Transaction conflict: a mix of guaranteed-invalid and valid bids.** Three bids ($95, $100, $105) are *structurally* invalid no matter what — they're below $110 (the starting $100 + $10 minimum increment) even if no other bid ever existed. Four more bids ($115–$160) legitimately compete. All seven are fired together. The three invalid ones must be rejected regardless of timing; this checks that "obviously bad" bids can't sneak through by getting lucky with lock ordering.

## 4. The database invariant checker

Every scenario above ends with:

```ts
await checkAuctionInvariants(auctionId);
```

`backend/test/invariants.ts` re-reads the auction and every one of its bids directly from Postgres — not from anything the test remembers submitting or any value `placeBid()` returned — and independently checks:

| Requirement | What the checker actually verifies |
|---|---|
| No invalid bid accepted | Every bid, in true commit order, is `>= previous_amount + min_increment` |
| Accepted bids valid according to serialized transactions | Same check as above — this *is* what "serialized" means: each bid was judged against the true, just-committed state, not a stale read |
| Final highest bid is consistent | `auctions.current_price` exactly equals the highest bid's amount |
| Auction state agrees with bids | `auctions.current_bid_id` points at a bid row that (a) exists, (b) has the highest amount, and (c) actually belongs to *this* auction (the database's foreign key alone doesn't guarantee that last part — it only guarantees the bid exists *somewhere*) |
| No impossible duplicate state | No two bids for the same auction share an amount |
| No bid accepted after close | Every bid's real insert timestamp (`clock_timestamp()`, see `docs/03-bid-engine.md` §2/§5) is before the auction's `ends_at` and at/after its `starts_at` |

Every check uses Vitest's `expect()` directly with a specific failure message, so if any invariant is ever violated, the test output names exactly which guarantee broke and on which bid — not a generic "assertion failed."

## 5. Actual output — 5 consecutive full runs

All of the following are unedited results from running `npx vitest run` in `backend/` on this machine, back to back, just now:

```
run 1: [increasing bids] accepted=1  [identical]=1  [25 escalating]=4   [many racing]=2  [mixed]=2   -> 33/33 passed
run 2: [increasing bids] accepted=3  [identical]=1  [25 escalating]=3   [many racing]=3  [mixed]=2   -> 33/33 passed
run 3: [increasing bids] accepted=2  [identical]=1  [25 escalating]=5   [many racing]=3  [mixed]=1   -> 33/33 passed
run 4: [increasing bids] accepted=2  [identical]=1  [25 escalating]=3   [many racing]=4  [mixed]=3   -> 33/33 passed
run 5: [increasing bids] accepted=4  [identical]=1  [25 escalating]=2   [many racing]=6  [mixed]=1   -> 33/33 passed
```

Two things to notice, both expected and both important:

1. **The accepted-bid counts genuinely differ between runs.** This is not noise to be explained away — it's direct evidence that real, uncontrolled race timing is happening (if the numbers were identical every time, that would actually suggest the "concurrent" calls were secretly running sequentially). The "identical timing" scenario correctly stays at exactly 1 accepted every single run, as it must.
2. **33/33 tests passed every single run**, meaning every invariant in §4 held under every one of those different, real timing outcomes. That combination — varying outcomes, constant correctness — is the actual evidence for the claim at the top of this document.

We were instructed to run this at least 3 times and stop to fix anything flaky. We ran it 5 times. Nothing was flaky.

## 6. Reproducing this yourself

```bash
docker compose up -d          # if not already running
npm run migrate               # if not already applied
cd backend
npx vitest run                # run once
npx vitest run test/concurrencyProof.test.ts   # just the new scenarios
```

Run it several times in a row — the accept/reject numbers should keep changing while the test count stays 33/33 passed. If you ever see a failure, **do not re-run it hoping it passes** — an intermittent failure here means a real correctness bug (or a real test bug), and per this project's own rules, it must be fixed, not retried away.

## 7. Why "retry behavior" isn't tested in this file

`backend/test/placeBid.retryAndLocking.test.ts` covers bounded retry on deadlock and immediate rejection on lock timeout — but it does so by **mocking** the Postgres driver, not by hitting a real database like every test in this document does. That's not a shortcut; it's the honest option. Our chosen locking strategy (`SELECT ... FOR UPDATE` on a single auction row — see `docs/03-bid-engine.md` §4) queues concurrent transactions instead of letting them race and abort, which means it structurally cannot produce a real Postgres deadlock (`40P01`) or serialization failure in this codebase: there's only ever one row lock involved, and a deadlock requires at least two. Writing an integration test that claimed to reproduce one against a real database would be asserting something false about the system. Testing the retry *logic itself* against simulated error codes is the correct way to verify that code path without making a claim the real system can't back up.

## 8. Beginner summary

Think of the auction row as a single microphone at a debate with 50 people who all want to speak at once. The lock (`FOR UPDATE`) is a strict rule: only one person holds the microphone at a time, and everyone else must wait their turn — they don't all shout over each other and hope the loudest one gets recorded. Whoever holds the microphone gets asked "is what you're about to say better than the last thing that was actually said?" — checked against what was *really* just said, not what they assumed before waiting. If yes, it's recorded and they hand off the microphone. If no, they're told "someone already said something better, sit down." No two people can ever be recorded as having said the same thing, nothing is ever recorded in the wrong order, and the final transcript (the database) always matches everything that was actually said into the microphone — regardless of how many people were shouting to go next.
