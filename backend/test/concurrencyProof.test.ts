import { afterAll, describe, expect, it } from 'vitest';
import { placeBid } from '../src/services/placeBid.js';
import { pool } from '../src/db.js';
import { createTestAuction, createTestUser } from './helpers.js';
import { checkAuctionInvariants } from './invariants.js';

/**
 * This file exists to answer one question with evidence, not assertion:
 * "is NeuraBid actually correct when many bids hit the same auction at
 * once?" Every scenario here fires real, concurrent placeBid() calls
 * against a real local Postgres, then calls checkAuctionInvariants() to
 * independently re-derive the truth from the database and check it against
 * every guarantee the bid engine claims to uphold. See
 * docs/04-concurrency-testing.md for what each invariant means and why.
 *
 * "Retry behavior" (bounded retry on deadlock, immediate rejection on lock
 * timeout) is deliberately NOT re-tested here — it's covered by
 * placeBid.retryAndLocking.test.ts, which mocks the Postgres driver on
 * purpose because this design's single-row locking structurally cannot
 * produce a real deadlock/serialization failure to test against honestly.
 * See docs/04-concurrency-testing.md §7.
 */
describe('Concurrency proof suite', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('multiple valid increasing bids, submitted concurrently out of order, resolve correctly', async () => {
    const startingPrice = 100;
    const minIncrement = 5;
    const bidderCount = 10;
    const auctionId = await createTestAuction({ startingPrice, minIncrement });
    const userIds = await Promise.all(Array.from({ length: bidderCount }, () => createTestUser()));

    const amounts = Array.from({ length: bidderCount }, (_, i) => startingPrice + minIncrement * (i + 1));
    shuffle(amounts);

    const results = await Promise.allSettled(
      amounts.map((amount, i) => placeBid(auctionId, userIds[i], amount)),
    );
    const accepted = results.filter((r) => r.status === 'fulfilled');
    console.log(
      `[increasing bids] ${bidderCount} bidders -> accepted=${accepted.length} rejected=${bidderCount - accepted.length}`,
    );

    expect(accepted.length).toBeGreaterThan(0);
    await checkAuctionInvariants(auctionId);

    const maxAmount = startingPrice + minIncrement * bidderCount;
    const { rows } = await pool.query('SELECT current_price FROM auctions WHERE id = $1', [
      auctionId,
    ]);
    expect(Number(rows[0].current_price)).toBe(maxAmount);
  });

  it('a lower bid attempted after a higher bid has already committed is rejected', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 5 });
    const [winner, loserA, loserB] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ]);

    // First, a higher bid actually commits (awaited — this establishes a
    // real "higher bid happened" fact, not just an intention).
    await placeBid(auctionId, winner, 150);

    // Now two lower bids are attempted concurrently. Neither can win no
    // matter how they're interleaved with each other, because both are
    // below the price the first bid already committed.
    const results = await Promise.allSettled([
      placeBid(auctionId, loserA, 120),
      placeBid(auctionId, loserB, 130),
    ]);

    for (const r of results) {
      expect(r.status).toBe('rejected');
      if (r.status === 'rejected') {
        expect(r.reason).toMatchObject({ status: 409 });
      }
    }

    await checkAuctionInvariants(auctionId);
    const { rows } = await pool.query('SELECT current_price FROM auctions WHERE id = $1', [
      auctionId,
    ]);
    expect(Number(rows[0].current_price)).toBe(150);
  });

  it('identical timing: many clients bidding the exact same amount at once — exactly one wins', async () => {
    const clientCount = 10;
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 5 });
    const userIds = await Promise.all(Array.from({ length: clientCount }, () => createTestUser()));

    const results = await Promise.allSettled(userIds.map((userId) => placeBid(auctionId, userId, 105)));
    const accepted = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    console.log(`[identical timing] ${clientCount} identical bids -> accepted=${accepted.length} rejected=${rejected.length}`);

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(clientCount - 1);
    for (const r of rejected) {
      if (r.status === 'rejected') expect(r.reason).toMatchObject({ status: 409 });
    }

    await checkAuctionInvariants(auctionId);
  });

  it('many clients racing: 50 concurrent distinct bidders resolve to a fully consistent final state', async () => {
    const bidderCount = 50;
    const startingPrice = 100;
    const minIncrement = 2;
    const auctionId = await createTestAuction({ startingPrice, minIncrement });
    const userIds = await Promise.all(Array.from({ length: bidderCount }, () => createTestUser()));

    const amounts = Array.from({ length: bidderCount }, (_, i) => startingPrice + minIncrement * (i + 1));
    shuffle(amounts);

    const results = await Promise.allSettled(
      amounts.map((amount, i) => placeBid(auctionId, userIds[i], amount)),
    );
    const accepted = results.filter((r) => r.status === 'fulfilled');
    console.log(
      `[many clients racing] ${bidderCount} bidders -> accepted=${accepted.length} rejected=${bidderCount - accepted.length}`,
    );

    expect(accepted.length + (results.length - accepted.length)).toBe(bidderCount);
    await checkAuctionInvariants(auctionId);

    const maxAmount = startingPrice + minIncrement * bidderCount;
    const { rows } = await pool.query('SELECT current_price FROM auctions WHERE id = $1', [
      auctionId,
    ]);
    expect(Number(rows[0].current_price)).toBe(maxAmount);
  });

  it('transaction conflict: a mix of guaranteed-invalid and valid bids under concurrency is resolved correctly', async () => {
    const startingPrice = 100;
    const minIncrement = 10;
    const auctionId = await createTestAuction({ startingPrice, minIncrement });

    // These are below current_price + min_increment (110) no matter what
    // else happens — they must ALWAYS be rejected, regardless of timing.
    const guaranteedInvalid = [95, 100, 105];
    // These are valid, escalating targets that legitimately compete.
    const valid = [115, 130, 145, 160];

    const allAmounts = [...guaranteedInvalid, ...valid];
    shuffle(allAmounts);
    const userIds = await Promise.all(allAmounts.map(() => createTestUser()));

    const results = await Promise.allSettled(
      allAmounts.map((amount, i) => placeBid(auctionId, userIds[i], amount)),
    );

    for (let i = 0; i < allAmounts.length; i++) {
      if (guaranteedInvalid.includes(allAmounts[i])) {
        expect(results[i].status, `amount ${allAmounts[i]} should always be rejected`).toBe(
          'rejected',
        );
      }
    }

    const accepted = results.filter((r) => r.status === 'fulfilled');
    console.log(
      `[transaction conflict] ${allAmounts.length} mixed bids -> accepted=${accepted.length} rejected=${results.length - accepted.length}`,
    );

    await checkAuctionInvariants(auctionId);
  });
});

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
