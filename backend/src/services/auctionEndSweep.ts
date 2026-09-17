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

/**
 * The admin "Stop Auction" action (see routes/auctions.ts). Shares the
 * sweep's exact ending logic — same status transition, same broadcast — so
 * a manually-stopped auction is indistinguishable from one that ended on
 * schedule to anyone watching it. Setting ends_at = now() alongside status
 * matters: placeBid.ts's own end-check reads ends_at, not just status, so
 * this closes both doors in the same instant, before this function even
 * returns.
 */
export async function endAuctionNow(auctionId: string): Promise<EndedAuctionRow | null> {
  const { rows } = await pool.query<EndedAuctionRow>(
    `UPDATE auctions
     SET status = 'ended', ends_at = now()
     WHERE id = $1 AND status = 'active'
     RETURNING id, current_price, current_bid_id`,
    [auctionId],
  );

  const row = rows[0];
  if (!row) return null;

  broadcast(row.id, {
    type: 'auction_ended',
    auctionId: row.id,
    winningBidId: row.current_bid_id,
    finalPrice: Number(row.current_price),
  });

  return row;
}
