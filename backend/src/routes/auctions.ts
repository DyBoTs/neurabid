import { Router } from 'express';
import { asyncHandler } from '../asyncHandler.js';
import { HttpError } from '../httpError.js';
import { isUuid } from '../validation.js';
import { pool } from '../db.js';
import { createAuction, getAuctionById, listAuctions } from '../services/getAuction.js';
import { placeBid } from '../services/placeBid.js';
import { broadcast } from '../ws/broadcaster.js';

export const auctionsRouter = Router();

auctionsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await listAuctions());
  }),
);

auctionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, 'Invalid auction id');

    const auction = await getAuctionById(id);
    if (!auction) throw new HttpError(404, 'Auction not found');

    res.json(auction);
  }),
);

interface AuctionBidRow {
  id: string;
  user_id: string;
  username: string;
  amount: string;
  created_at: string;
}

/**
 * Full bid history for one auction, most recent first — what the Live
 * Auction page loads on first render (and on reconnect); after that, new
 * bids arrive live over the WebSocket (see backend/src/ws/).
 */
auctionsRouter.get(
  '/:id/bids',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, 'Invalid auction id');

    const { rows } = await pool.query<AuctionBidRow>(
      `SELECT b.id, b.user_id, u.username, b.amount, b.created_at
       FROM bids b
       JOIN users u ON u.id = b.user_id
       WHERE b.auction_id = $1
       ORDER BY b.created_at DESC`,
      [id],
    );

    res.json(
      rows.map((row) => ({
        bidId: row.id,
        userId: row.user_id,
        username: row.username,
        amount: Number(row.amount),
        createdAt: row.created_at,
      })),
    );
  }),
);

/**
 * Creates a new auction, starting immediately. Server-side validation only
 * — never trust the client to have checked these (same principle as bid
 * validation in placeBid.ts).
 */
auctionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (title.length < 3 || title.length > 200) {
      throw new HttpError(400, 'Title must be 3-200 characters');
    }

    const description =
      typeof req.body?.description === 'string' && req.body.description.trim()
        ? req.body.description.trim()
        : null;

    const startingPrice = Number(req.body?.startingPrice);
    if (!Number.isFinite(startingPrice) || startingPrice <= 0) {
      throw new HttpError(400, 'Starting price must be a positive number');
    }

    const minIncrement = Number(req.body?.minIncrement);
    if (!Number.isFinite(minIncrement) || minIncrement <= 0) {
      throw new HttpError(400, 'Minimum increment must be a positive number');
    }

    const durationMinutes = Number(req.body?.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 10_080) {
      throw new HttpError(400, 'Duration must be between 1 minute and 7 days');
    }

    const auction = await createAuction({
      title,
      description,
      startingPrice,
      minIncrement,
      durationMinutes,
    });

    res.status(201).json(auction);
  }),
);

/**
 * The one endpoint the whole project exists to get right. All the actual
 * correctness logic (locking, validation, retries) lives in placeBid() —
 * see backend/src/services/placeBid.ts and docs/03-bid-engine.md. This
 * route is deliberately thin: parse/validate the HTTP-level inputs, call
 * placeBid(), and translate the result. It never decides whether a bid
 * wins, and it never responds — or broadcasts over WebSocket — before
 * placeBid()'s promise resolves, which only happens after the database
 * transaction has actually committed.
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

    // Only reachable once placeBid()'s promise has resolved — i.e. only
    // after COMMIT. Never move this above the placeBid() call.
    broadcast(auctionId, {
      type: 'bid_accepted',
      auctionId,
      bidId: result.bidId,
      amount: result.amount,
      currentHighest: result.amount,
      userId,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json(result);
  }),
);
