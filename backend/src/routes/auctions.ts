import { Router } from 'express';
import { asyncHandler } from '../asyncHandler.js';
import { HttpError } from '../httpError.js';
import { isUuid } from '../validation.js';
import { pool } from '../db.js';
import { placeBid } from '../services/placeBid.js';

export const auctionsRouter = Router();

interface AuctionRow {
  id: string;
  title: string;
  description: string | null;
  starting_price: string;
  current_price: string;
  min_increment: string;
  status: string;
  starts_at: string;
  ends_at: string;
  current_bid_id: string | null;
}

function serializeAuction(row: AuctionRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startingPrice: Number(row.starting_price),
    currentPrice: Number(row.current_price),
    minIncrement: Number(row.min_increment),
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    currentBidId: row.current_bid_id,
  };
}

auctionsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query<AuctionRow>(
      `SELECT * FROM auctions ORDER BY (status = 'active') DESC, ends_at ASC`,
    );
    res.json(rows.map(serializeAuction));
  }),
);

auctionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, 'Invalid auction id');

    const { rows } = await pool.query<AuctionRow>('SELECT * FROM auctions WHERE id = $1', [id]);
    if (!rows[0]) throw new HttpError(404, 'Auction not found');

    res.json(serializeAuction(rows[0]));
  }),
);

/**
 * The one endpoint the whole project exists to get right. All the actual
 * correctness logic (locking, validation, retries) lives in placeBid() —
 * see backend/src/services/placeBid.ts and docs/03-bid-engine.md. This
 * route is deliberately thin: parse/validate the HTTP-level inputs, call
 * placeBid(), and translate the result. It never decides whether a bid
 * wins, and it never responds before placeBid()'s promise resolves — which
 * only happens after the database transaction has actually committed.
 */
auctionsRouter.post(
  '/:id/bids',
  asyncHandler(async (req, res) => {
    const { id: auctionId } = req.params;
    if (!isUuid(auctionId)) throw new HttpError(400, 'Invalid auction id');

    const userId = req.header('x-user-id');
    if (!userId || !isUuid(userId)) {
      throw new HttpError(
        400,
        'Missing or invalid X-User-Id header. Create a user via POST /api/users first.',
      );
    }

    const amount = Number(req.body?.amount);
    const result = await placeBid(auctionId, userId, amount);

    res.status(201).json(result);
  }),
);
