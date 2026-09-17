import type { PoolClient } from 'pg';
import { pool } from '../db.js';

/**
 * A bid rejection the caller should show to the user as-is (wrong amount, auction
 * over, etc). Never retried — retrying wouldn't change the outcome.
 */
export class BidError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface PlacedBid {
  bidId: string;
  auctionId: string;
  amount: number;
}

interface AuctionRow {
  current_price: string;
  min_increment: string;
  status: string;
  starts_at: string;
  ends_at: string;
}

const MAX_ATTEMPTS = 3;
const DEADLOCK_BACKOFF_MS = [25, 60, 120];

/**
 * Places a bid on an auction. See docs/01-project-plan.md §6-8 for the full
 * design rationale. In short:
 *   1. Lock the auction row (FOR UPDATE) so concurrent bids on the same
 *      auction queue instead of racing.
 *   2. Re-check the bid against the price/status read under that lock,
 *      never against whatever the client thought the price was.
 *   3. Insert the bid and update the cached current_price in the same
 *      transaction, then commit.
 * A caller must never treat a bid as accepted until this function resolves.
 */
export async function placeBid(
  auctionId: string,
  userId: string,
  amount: number,
): Promise<PlacedBid> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new BidError(400, 'Bid amount must be a positive number');
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await runBidTransaction(auctionId, userId, amount);
    } catch (err) {
      if (err instanceof BidError) throw err;

      const code = (err as { code?: string } | null)?.code;

      // Lock could not be acquired within lock_timeout: the system is
      // already saturated for this auction. Do not retry — that would only
      // add more load to an already-contended row.
      if (code === '55P03') {
        throw new BidError(503, 'This auction is under heavy load. Please try again shortly.');
      }

      // Foreign key violation: the auction or user id doesn't exist.
      if (code === '23503') {
        throw new BidError(400, 'Unknown auction or user');
      }

      // Deadlock: shouldn't normally happen (this transaction only ever
      // locks one auction row), but is retried a bounded number of times
      // defensively.
      if (code === '40P01' && attempt < MAX_ATTEMPTS) {
        await sleep(DEADLOCK_BACKOFF_MS[attempt - 1]);
        continue;
      }

      throw err;
    }
  }

  // Unreachable in practice (the loop above always returns or throws), but
  // keeps the function's return type honest without a non-null assertion.
  throw new BidError(503, 'This auction is under heavy load. Please try again shortly.');
}

async function runBidTransaction(
  auctionId: string,
  userId: string,
  amount: number,
): Promise<PlacedBid> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '2000ms'");

    const auction = await lockAuction(client, auctionId);
    if (!auction) {
      throw new BidError(404, 'Auction not found');
    }

    const now = Date.now();

    // Checked in this order deliberately: an auction that's already over
    // gets "ended" even if, say, its status was never swept to 'ended' —
    // ends_at is the real deadline, status is a secondary signal.
    if (auction.status === 'ended' || new Date(auction.ends_at).getTime() <= now) {
      throw new BidError(410, 'This auction has ended');
    }
    if (auction.status === 'scheduled' || new Date(auction.starts_at).getTime() > now) {
      throw new BidError(403, 'This auction has not started yet');
    }

    const currentPrice = Number(auction.current_price);
    const minIncrement = Number(auction.min_increment);
    const minValidAmount = currentPrice + minIncrement;
    if (amount < minValidAmount) {
      throw new BidError(
        409,
        `Bid too low: minimum next bid is ${minValidAmount.toFixed(2)}`,
      );
    }

    const {
      rows: [bid],
    } = await client.query<{ id: string }>(
      `INSERT INTO bids (auction_id, user_id, amount) VALUES ($1, $2, $3) RETURNING id`,
      [auctionId, userId, amount],
    );

    await client.query(
      `UPDATE auctions SET current_price = $1, current_bid_id = $2 WHERE id = $3`,
      [amount, bid.id, auctionId],
    );

    await client.query('COMMIT');
    return { bidId: bid.id, auctionId, amount };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function lockAuction(client: PoolClient, auctionId: string): Promise<AuctionRow | null> {
  const { rows } = await client.query<AuctionRow>(
    `SELECT current_price, min_increment, status, starts_at, ends_at
     FROM auctions
     WHERE id = $1
     FOR UPDATE`,
    [auctionId],
  );
  return rows[0] ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
