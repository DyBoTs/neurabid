import { expect } from 'vitest';
import { pool } from '../src/db.js';

interface AuctionInvariantRow {
  current_price: string;
  min_increment: string;
  current_bid_id: string | null;
  starting_price: string;
  starts_at: string;
  ends_at: string;
}

interface BidRow {
  id: string;
  amount: string;
  created_at: string;
  auction_id: string;
}

/**
 * Re-reads an auction and all of its bids straight from Postgres and
 * asserts every correctness guarantee the bid engine is supposed to
 * uphold. Call this after any test scenario that placed (or attempted)
 * bids against `auctionId` — see docs/04-concurrency-testing.md for the
 * plain-English meaning of each check. Every check uses `expect`
 * directly, so a violated invariant fails the calling test with a clear
 * message naming exactly which guarantee broke, not just "expected true,
 * got false".
 */
export async function checkAuctionInvariants(auctionId: string): Promise<void> {
  const { rows: auctionRows } = await pool.query<AuctionInvariantRow>(
    `SELECT current_price, min_increment, current_bid_id, starting_price, starts_at, ends_at
     FROM auctions WHERE id = $1`,
    [auctionId],
  );
  const auction = auctionRows[0];
  expect(auction, `auction ${auctionId} must exist`).toBeTruthy();

  const { rows: bids } = await pool.query<BidRow>(
    `SELECT id, amount, created_at, auction_id
     FROM bids
     WHERE auction_id = $1
     ORDER BY created_at ASC`,
    [auctionId],
  );

  const minIncrement = Number(auction.min_increment);
  const startingPrice = Number(auction.starting_price);
  const startsAtMs = new Date(auction.starts_at).getTime();
  const endsAtMs = new Date(auction.ends_at).getTime();

  // "No bid accepted after close" (and, symmetrically, none before open).
  // created_at uses clock_timestamp() (see migration 002), so it reflects
  // the real moment each INSERT ran — the true commit order.
  for (const bid of bids) {
    const createdMs = new Date(bid.created_at).getTime();
    expect(
      createdMs,
      `bid ${bid.id} was created before the auction opened (starts_at)`,
    ).toBeGreaterThanOrEqual(startsAtMs);
    expect(
      createdMs,
      `bid ${bid.id} was created at/after ends_at — a bid was accepted after close`,
    ).toBeLessThan(endsAtMs);
  }

  // "No invalid bid accepted" + "accepted bids are valid according to
  // serialized transactions": walking the bids in true commit order, each
  // one must be at least min_increment higher than the one before it —
  // exactly the rule placeBid() enforces at commit time, checked here
  // independently against the real database, not against application
  // return values.
  let previousAmount = startingPrice;
  for (const bid of bids) {
    const amount = Number(bid.amount);
    expect(
      amount,
      `bid ${bid.id} ($${amount}) is not >= previous ($${previousAmount}) + min_increment ($${minIncrement})`,
    ).toBeGreaterThanOrEqual(previousAmount + minIncrement);
    previousAmount = amount;
  }

  // "No impossible duplicate state": no two bids for this auction share an
  // amount. The strictly-increasing check above already implies this, but
  // it's asserted directly too rather than only by inference.
  const amounts = bids.map((b) => Number(b.amount));
  expect(new Set(amounts).size, 'two bids for this auction share the same amount').toBe(
    amounts.length,
  );

  // "Final highest bid is consistent" + "auction state agrees with bids":
  // the cached current_price/current_bid_id must agree exactly with the
  // real bid history, and current_bid_id must point at a bid that actually
  // belongs to this auction (the schema's FK only guarantees the bid
  // exists somewhere, not that it's this auction's bid).
  if (bids.length === 0) {
    expect(Number(auction.current_price), 'no bids yet, current_price should equal starting_price').toBe(
      startingPrice,
    );
    expect(auction.current_bid_id, 'no bids yet, current_bid_id should be null').toBeNull();
  } else {
    const highestBid = bids[bids.length - 1];
    expect(
      Number(auction.current_price),
      'current_price does not match the highest actual bid',
    ).toBe(Number(highestBid.amount));
    expect(auction.current_bid_id, 'current_bid_id does not point at the highest bid').toBe(
      highestBid.id,
    );
    expect(
      highestBid.auction_id,
      'current_bid_id points at a bid belonging to a DIFFERENT auction',
    ).toBe(auctionId);
  }
}
