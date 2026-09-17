import { Router } from 'express';
import { asyncHandler } from '../asyncHandler.js';
import { pool } from '../db.js';
import { ensureRedisConnected, redis } from '../redis.js';
import { getMetricsSnapshot } from '../metrics.js';
import { verifyCorrectness } from '../services/verifyCorrectness.js';
import { connectionCount } from '../ws/broadcaster.js';

export const adminRouter = Router();

interface HighestBidRow {
  id: string;
  title: string;
  current_price: string;
}

/**
 * One combined payload for the Admin Command Center (docs/07-admin-
 * dashboard.md) so a projector-facing dashboard can poll a single
 * endpoint instead of five. Every field is either a real, live
 * measurement or explicitly null/"not measured yet" — nothing here is a
 * hardcoded placeholder number.
 */
adminRouter.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    // --- System health ---
    let dbHealthy = false;
    try {
      await pool.query('SELECT 1');
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }

    let redisHealthy = false;
    try {
      await ensureRedisConnected();
      await redis.ping();
      redisHealthy = true;
    } catch {
      redisHealthy = false;
    }

    // --- Auction overview ---
    const { rows: countRows } = await pool.query<{ count: string }>(
      `SELECT count(*) FROM auctions WHERE status = 'active'`,
    );
    const activeAuctions = Number(countRows[0].count);

    const { rows: highestRows } = await pool.query<HighestBidRow>(
      `SELECT id, title, current_price FROM auctions
       WHERE status = 'active'
       ORDER BY current_price DESC
       LIMIT 1`,
    );
    const currentHighestBid = highestRows[0]
      ? {
          auctionId: highestRows[0].id,
          title: highestRows[0].title,
          amount: Number(highestRows[0].current_price),
        }
      : null;

    // --- Performance (real process-lifetime measurements, see metrics.ts) ---
    const metrics = getMetricsSnapshot();

    // --- Correctness (real, live re-verification, see verifyCorrectness.ts) ---
    const correctness = await verifyCorrectness();

    res.json({
      health: {
        api: 'ok', // if this response is being sent, the API is, definitionally, up
        db: dbHealthy ? 'ok' : 'error',
        redis: redisHealthy ? 'ok' : 'error',
        websocket: { status: 'ok', connections: connectionCount() },
      },
      auctionOverview: {
        activeAuctions,
        currentHighestBid,
      },
      performance: metrics,
      correctness: {
        // "verified"/"violations_found" only mean something once at least
        // one auction has bids to check — with zero, there's nothing to
        // have verified yet, so say that plainly instead of claiming
        // "verified" for an empty check.
        status:
          correctness.checkedAuctions === 0
            ? 'not_measured_yet'
            : correctness.violations.length === 0
              ? 'verified'
              : 'violations_found',
        checkedAuctions: correctness.checkedAuctions,
        violations: correctness.violations,
        checkedAt: correctness.checkedAt,
      },
    });
  }),
);
