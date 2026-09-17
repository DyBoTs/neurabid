import { pool } from '../db.js';
import { broadcast } from '../ws/broadcaster.js';

const SWEEP_INTERVAL_MS = 2000;

interface EndedAuctionRow {
  id: string;
  current_price: string;
  current_bid_id: string | null;
}

/**
 * Bids already correctly refuse themselves once ends_at passes (see
 * placeBid.ts) — this sweep exists only so an auction's `status` column
 * (and everyone watching it over the WebSocket) actually learns it ended,
 * instead of silently sitting there as "active" forever with nobody
 * bidding on it. A plain setInterval is enough here; no queue or cron
 * library needed for one lightweight periodic query.
 */
export function startAuctionEndSweep(): NodeJS.Timeout {
  return setInterval(() => {
    sweepOnce().catch((err: unknown) => {
      console.error('Auction-end sweep failed:', err);
    });
  }, SWEEP_INTERVAL_MS);
}

export async function sweepOnce(): Promise<EndedAuctionRow[]> {
  // The UPDATE ... WHERE status = 'active' clause means an auction only
  // ever appears in this result once — on the sweep tick where it actually
  // transitions — so this never re-broadcasts "ended" for the same auction
  // repeatedly.
  const { rows } = await pool.query<EndedAuctionRow>(
    `UPDATE auctions
     SET status = 'ended'
     WHERE status = 'active' AND ends_at <= now()
     RETURNING id, current_price, current_bid_id`,
  );

  for (const row of rows) {
    broadcast(row.id, {
      type: 'auction_ended',
      auctionId: row.id,
      winningBidId: row.current_bid_id,
      finalPrice: Number(row.current_price),
    });
  }

  return rows;
}
