import { Router } from 'express';
import { asyncHandler } from '../asyncHandler.js';
import { HttpError } from '../httpError.js';
import { isUuid } from '../validation.js';
import { getAuctionById, listAuctions } from '../services/getAuction.js';
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
