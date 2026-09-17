import { afterAll, describe, expect, it } from 'vitest';
import { placeBid } from '../src/services/placeBid.js';
import { pool } from '../src/db.js';
import { createTestAuction, createTestUser } from './helpers.js';

/**
 * These tests prove the core hackathon claim: under concurrent bidding,
 * Postgres never loses, duplicates, or misorders a bid. They run against a
 * real local Postgres (via docker compose) — no mocking of the database,
 * because the whole point is to test real transactional behavior.
 */
describe('placeBid concurrency correctness', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('accepts exactly one of two identical simultaneous bids, rejects the other with 409', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 5 });
    const [userA, userB] = await Promise.all([createTestUser(), createTestUser()]);

    const results = await Promise.allSettled([
      placeBid(auctionId, userA, 105),
      placeBid(auctionId, userB, 105),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    console.log(
      `[concurrency: two identical bids] fulfilled=${fulfilled.length} rejected=${rejected.length}`,
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409 });

    const { rows } = await pool.query('SELECT current_price FROM auctions WHERE id = $1', [
      auctionId,
    ]);
    expect(Number(rows[0].current_price)).toBe(105);
  });

  it('under many concurrent escalating bids, the database ends up exactly consistent', async () => {
    const bidderCount = 25;
    const startingPrice = 100;
    const minIncrement = 5;
    const auctionId = await createTestAuction({ startingPrice, minIncrement });
    const userIds = await Promise.all(Array.from({ length: bidderCount }, () => createTestUser()));

    // Every bidder's target amount is fixed in advance (a real bidder doesn't
    // know what others will bid). Shuffle the submission order so it doesn't
    // match amount order — arrival order must not determine correctness.
    const amounts = Array.from({ length: bidderCount }, (_, i) => startingPrice + minIncrement * (i + 1));
    for (let i = amounts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [amounts[i], amounts[j]] = [amounts[j], amounts[i]];
    }

    const results = await Promise.allSettled(
      amounts.map((amount, i) => placeBid(auctionId, userIds[i], amount)),
    );

    const accepted = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof placeBid>>> =>
        r.status === 'fulfilled',
    );
    const rejected = results.filter((r) => r.status === 'rejected');

    console.log(
      `[concurrency: ${bidderCount} escalating bids] accepted=${accepted.length} rejected=${rejected.length}`,
    );

    // The single highest amount (starting + N*increment) is guaranteed to
    // win no matter what order requests are processed in: whenever it's
    // processed, no other bid could possibly have pushed the price above it.
    const maxAmount = startingPrice + minIncrement * bidderCount;

    const { rows: auctionRows } = await pool.query(
      'SELECT current_price, current_bid_id FROM auctions WHERE id = $1',
      [auctionId],
    );
    expect(Number(auctionRows[0].current_price)).toBe(maxAmount);

    const { rows: bidRows } = await pool.query<{ id: string; amount: string }>(
      'SELECT id, amount FROM bids WHERE auction_id = $1 ORDER BY created_at ASC',
      [auctionId],
    );

    // Data integrity: the auction's cached current_price/current_bid_id must
    // match the actual highest bid row in the database.
    expect(auctionRows[0].current_bid_id).toBe(bidRows[bidRows.length - 1].id);
    const dbAmounts = bidRows.map((b) => Number(b.amount));
    expect(Math.max(...dbAmounts)).toBe(Number(auctionRows[0].current_price));

    // No lower bid was ever accepted after a higher one was already
    // committed — amounts strictly increase in commit order.
    for (let i = 1; i < dbAmounts.length; i++) {
      expect(dbAmounts[i]).toBeGreaterThan(dbAmounts[i - 1]);
    }

    // Every bid a caller was told succeeded actually exists in the database
    // exactly once — no phantom acceptances, no duplicates.
    const acceptedBidIds = accepted.map((r) => r.value.bidId).sort();
    const dbBidIds = bidRows.map((b) => b.id).sort();
    expect(acceptedBidIds).toEqual(dbBidIds);

    expect(accepted.length + rejected.length).toBe(bidderCount);
    expect(accepted.length).toBeGreaterThan(0);
  });
});
