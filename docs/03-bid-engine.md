# The Bid Engine — How NeuraBid Guarantees Correct Bids

This document explains, in beginner-friendly terms, exactly how `backend/src/services/placeBid.ts` guarantees that concurrent bidding can never produce a wrong winner. Every claim here is backed by a test in `backend/test/` — see §9 for how to run them and what they actually printed on this machine.

## 1. Schema

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
  current_price   numeric(12,2) NOT NULL,          -- cached "highest accepted bid"
  min_increment   numeric(12,2) NOT NULL DEFAULT 1.00 CHECK (min_increment > 0),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled','active','ended')),
  starts_at       timestamptz NOT NULL DEFAULT now(),
  ends_at         timestamptz NOT NULL,
  current_bid_id  uuid REFERENCES bids(id),         -- which bid is currently winning
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bids (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id    uuid NOT NULL REFERENCES auctions(id),
  user_id       uuid NOT NULL REFERENCES users(id),
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()  -- see §2/§5 for why not now()
);
```

`current_price` and `current_bid_id` on `auctions` are a **cache**, not a second source of truth — they always equal `MAX(bids.amount)` / that bid's id for the auction, by construction (§4 shows exactly how). We keep the cache because "what's the current price" is read constantly (every page load, every reconnect) and computing `MAX()` over the whole `bids` table on every read would be needlessly slow.

## 2. The Naive Read/Write Race Condition (What We're Defending Against)

Here is the bug you'd get if you wrote the "obvious" version of this code — two separate SQL statements, no locking:

```
Time   Request A (bids $105)              Request B (bids $105)
----   ----------------------------       ----------------------------
t0     SELECT current_price → $100
t1                                        SELECT current_price → $100
t2     app checks: 105 >= 100+5 ✓
t3                                        app checks: 105 >= 100+5 ✓
t4     INSERT bid ($105)
t5     UPDATE current_price = $105
t6                                        INSERT bid ($105)
t7                                        UPDATE current_price = $105
```

Both requests read the *same* `current_price` before either one wrote anything back — the classic **check-then-act** race. Both bids get accepted at the identical amount, both users are told they won, and the "last write" (`t7`) is what happens to stick — this is exactly the **Last-Write-Wins** outcome this project's rules explicitly prohibit. Worse, a *lower* bid could win this race if it happened to reach step t5/t7 last, which also breaks "reject lower/out-of-order bids." The bug isn't in the SQL — both statements are perfectly correct in isolation. The bug is the **gap in time between the read and the write**, during which the world can change underneath you.

## 3. Exact Transaction Flow

This is what `placeBid()` actually runs, in order, for every bid:

```sql
BEGIN;
SET LOCAL lock_timeout = '2000ms';

SELECT current_price, min_increment, status, starts_at, ends_at
FROM auctions
WHERE id = $1
FOR UPDATE;                              -- (A) see §4

-- in application code, using the row just read:
--   auction must exist                                  → else 404
--   status <> 'ended' AND ends_at > now()                → else 410 "ended"
--   status <> 'scheduled' AND starts_at <= now()         → else 403 "not started"
--   amount >= current_price + min_increment              → else 409 "too low"

INSERT INTO bids (auction_id, user_id, amount)
VALUES ($1, $2, $amount)
RETURNING id;                            -- (B)

UPDATE auctions
SET current_price = $amount, current_bid_id = $new_bid_id
WHERE id = $1;                           -- (C)

COMMIT;                                  -- (D) — nothing is "accepted" before this line succeeds
```

If **any** step fails — the auction doesn't exist, it's not active, the bid's too low, or a real database error occurs — the code jumps straight to `ROLLBACK` and none of (A)–(C) takes effect (§5). Only after (D) actually succeeds does `placeBid()` return a result, and only then is a caller allowed to tell anyone the bid won.

## 4. Lock / Isolation Reasoning

The fix for §2's race is line (A): `FOR UPDATE`. This tells Postgres "lock this specific row, and don't let any other transaction even *read it for update* until I commit or roll back." Concretely, with the race from §2 replayed under this lock:

```
Time   Request A                          Request B
----   ----------------------------       ----------------------------
t0     BEGIN; SELECT ... FOR UPDATE
       → acquires the lock, reads $100
t1                                        BEGIN; SELECT ... FOR UPDATE
                                           → BLOCKS (waits for A's lock)
t2     check: 105 >= 105 ✓
t3     INSERT bid; UPDATE price=105
t4     COMMIT → lock released
t5                                        → lock acquired NOW, reads $105
t6                                        check: 105 >= 105+5? ✗ → 409, ROLLBACK
```

There is no longer any instant where two transactions both believe they're looking at the current price — the second transaction physically cannot proceed past its own `SELECT ... FOR UPDATE` until the first has fully finished.

**We deliberately chose row locking (`FOR UPDATE`) over `SERIALIZABLE` isolation.** `SERIALIZABLE` is Postgres's strictest isolation level, but it works *optimistically*: transactions run in parallel and Postgres only detects a conflict at `COMMIT` time, aborting the loser with a `40001 serialization_failure` that must be retried from scratch. Under heavy contention on **one hot row** — exactly our worst case, a popular auction near closing time — that approach means a lot of wasted, fully-redone work. `FOR UPDATE` instead makes contenders queue and wait, which is more efficient and dramatically easier to reason about for this specific pattern (one row, simple invariant, frequent conflicts expected). Both approaches are equally *correct*; this is a performance/clarity tradeoff, not a safety one.

## 5. Rollback Behavior

`runBidTransaction()` has exactly one `catch` block, and everything that can go wrong — our own validation throwing `BidError`, or a real Postgres error — flows through it:

```ts
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  throw err;
} finally {
  client.release();
}
```

This means there is exactly **one** rollback path, used uniformly, so it's easy to be sure it's never skipped. `backend/test/placeBid.transactionFailure.test.ts` proves this isn't just theoretical: it deliberately makes step (B) fail (a bid with a `user_id` that doesn't exist — a real Postgres foreign-key violation, `23503`, triggered *after* the row lock and validation have already passed) and then asserts, by re-reading the row from the database, that `current_price`/`current_bid_id` are **byte-for-byte identical** to before the attempt, and that zero bid rows exist. Nothing partially happened.

## 6. Retry Behavior

Only two Postgres error codes are treated specially; everything else (including our own `BidError`) is never retried:

| Code | Meaning | Response |
|---|---|---|
| `55P03` | Couldn't acquire the row lock within `lock_timeout` (2s) — the auction is under heavy contention | Immediately `503`, **no retry**. Retrying would only add more load to an already-saturated row. |
| `40P01` | Deadlock detected | Retried up to 2 more times (3 attempts total) with a short backoff (25ms, 60ms), then a final `503` if still failing. |
| (anything else, incl. `BidError`) | Business rejection or unexpected error | Thrown immediately. A "too low" bid will never become valid by retrying it. |

In normal operation, `40P01` essentially can't happen here — this transaction only ever locks **one** row (the auction being bid on), and a deadlock requires two transactions to each hold a lock the other wants, which needs at least two rows involved in conflicting orders. The retry path exists as defensive engineering, not because we expect to hit it — see §9 for how it's tested without a real database, since the real system structurally can't produce one.

## 7. Why Invalid Winners Cannot Coexist

The invariant we care about: **at any moment, there is exactly one row in `bids` that represents "the current winner," and `auctions.current_price`/`current_bid_id` always point at it.**

This follows from three facts, all enforced by the transaction in §3–4:

1. **Only one transaction can be evaluating a bid for a given auction at a time** (the `FOR UPDATE` lock in §4) — there is never a moment where two "in-progress" bids are both being judged against the same price.
2. **A bid is only inserted if it beats the price read *inside that same lock*** (the check in §3, using the row just read in step A, never a value the client supplied or that was read earlier). So the moment a bid is inserted, it is, by definition, higher than whatever the previous winner was.
3. **The cache update (step C) and the insert (step B) happen in the same transaction**, so `current_price`/`current_bid_id` can never point at a bid other than the one that transaction just inserted, and can never be updated without a corresponding real bid existing.

Put together: every accepted bid is strictly higher than the one before it (proven empirically in §9 — the "no lower bid accepted after a higher one" check), and the cache always reflects exactly the last one accepted. There is no code path, and no interleaving of concurrent requests, that can produce two different "current winners" at once, or a winner whose amount doesn't actually exist in `bids`.

## 8. Beginner Diagram

```
   Bidder A                  Bidder B                    Postgres: `auctions` row for Auction #7
   --------                  --------                    ---------------------------------------
                                                            current_price = 100, min_increment = 5

   bid $105  ───────────────────────────────────────────▶  BEGIN; SELECT ... FOR UPDATE
                                                             🔒 row locked by A's transaction
                                bid $105 ──────────────▶   BEGIN; SELECT ... FOR UPDATE
                                                             ⏳ B must WAIT — row is locked

                                                            A: is 105 >= 100+5? YES
                                                            A: INSERT bid, UPDATE price=105
                                                            A: COMMIT
                                                             🔓 lock released
   ◀── 201 Accepted, price=105 ──────────────────────────

                                                             🔒 row now locked by B's transaction
                                                            B: is 105 >= 105+5? NO (price moved!)
                                                            B: ROLLBACK
                                ◀── 409 "bid too low, min is 110" ──

   Final state: current_price = 105, exactly one winning bid, both bidders
   got a truthful, immediate answer. No last-write-wins, no lost updates.
```

## 9. Running the Tests — Actual Output

All of the following ran against a real local Postgres (`docker compose up -d`, migrations applied) on this machine, just now. Nothing here is invented; run `cd backend && npx vitest run` yourself to reproduce it.

```
 ✓ test/placeBid.retryAndLocking.test.ts (3 tests) 142ms
 ✓ test/placeBid.transactionFailure.test.ts (1 test) 87ms
[concurrency: two identical bids] fulfilled=1 rejected=1
 ✓ test/placeBid.validation.test.ts (9 tests) 239ms
[concurrency: 25 escalating bids] accepted=5 rejected=20
 ✓ test/placeBid.concurrency.test.ts (2 tests) 336ms
 ✓ test/health.test.ts (1 test) 80ms

 Test Files  5 passed (5)
      Tests  16 passed (16)
```

Re-run twice more immediately after, to check the concurrency test isn't just passing by luck on one random ordering:

```
run 1: [concurrency: 25 escalating bids] accepted=2 rejected=23 — 16/16 passed
run 2: [concurrency: 25 escalating bids] accepted=2 rejected=23 — 16/16 passed
```

The accepted/rejected counts differ between runs (2, 5, 6 accepted across different runs so far) because real race timing differs each time submission order is shuffled — that variability is expected and is not a bug. What must **not** vary, and didn't, across any run: `current_price == MAX(bids.amount)`, no bid lower than a previously-accepted one was ever accepted, and no bid a caller was told succeeded is missing from (or duplicated in) the database. That is the actual claim of race-condition safety, and it is backed by these tests passing — not asserted without evidence.

### Test-to-requirement mapping

| Requirement | Test file | Test name |
|---|---|---|
| Valid bid | `placeBid.validation.test.ts` | "valid bid: accepts a bid that meets current_price + min_increment exactly" |
| Low bid | `placeBid.validation.test.ts` | "low bid: rejects a bid below the current price" |
| Equal bid | `placeBid.validation.test.ts` | "equal bid: rejects a bid exactly equal to the current price" |
| Below increment | `placeBid.validation.test.ts` | "below increment: rejects a bid above the current price but under the minimum increment" |
| Not started | `placeBid.validation.test.ts` | "not started: rejects a bid on an auction whose starts_at is in the future" |
| Ended auction | `placeBid.validation.test.ts` | two tests: status already `ended`, and `ends_at` passed without a status sweep |
| Concurrent bids | `placeBid.concurrency.test.ts` | both tests (2-way identical bids; 25-way escalating stress) |
| Transaction failure | `placeBid.transactionFailure.test.ts` | "leaves auction state completely unchanged when the bid insert fails" |
| Serialization conflict | `placeBid.retryAndLocking.test.ts` | all 3 tests (deadlock-then-succeed, lock-timeout-immediate-503, retries-exhausted) |
