import { Router } from 'express';
import { asyncHandler } from '../asyncHandler.js';
import { HttpError } from '../httpError.js';
import { isUuid } from '../validation.js';
import { pool } from '../db.js';

export const usersRouter = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

/**
 * Minimal, intentionally-not-real auth for the demo: pick a username, no
 * password. Calling this twice with the same username returns the same
 * user id rather than erroring, so refreshing the page doesn't break
 * "logging in" as someone you already used. The user's own id is what
 * gets sent as the X-User-Id header on later requests (see auctions.ts) —
 * there's no separate session token. This is a documented simplification,
 * not a security feature (see docs/02-local-setup.md).
 */
usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    if (!USERNAME_RE.test(username)) {
      throw new HttpError(
        400,
        'Username must be 3-30 characters: letters, numbers, and underscores only',
      );
    }

    const {
      rows: [user],
    } = await pool.query<{ id: string; username: string }>(
      `INSERT INTO users (username) VALUES ($1)
       ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
       RETURNING id, username`,
      [username],
    );

    res.status(200).json(user);
  }),
);

interface UserBidRow {
  bid_id: string;
  auction_id: string;
  auction_title: string;
  amount: string;
  created_at: string;
  is_winning: boolean;
}

/** A user's own bid history across every auction, most recent first. */
usersRouter.get(
  '/:id/bids',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isUuid(id)) throw new HttpError(400, 'Invalid user id');

    const { rows } = await pool.query<UserBidRow>(
      `SELECT
         b.id AS bid_id,
         b.auction_id,
         a.title AS auction_title,
         b.amount,
         b.created_at,
         (a.current_bid_id = b.id) AS is_winning
       FROM bids b
       JOIN auctions a ON a.id = b.auction_id
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC`,
      [id],
    );

    res.json(
      rows.map((row) => ({
        bidId: row.bid_id,
        auctionId: row.auction_id,
        auctionTitle: row.auction_title,
        amount: Number(row.amount),
        createdAt: row.created_at,
        isWinning: row.is_winning,
      })),
    );
  }),
);
