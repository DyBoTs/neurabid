import { afterAll, describe, expect, it } from 'vitest';
import { placeBid } from '../src/services/placeBid.js';
import { pool } from '../src/db.js';
import { createTestAuction } from './helpers.js';

/**
 * Proves atomic persistence: if any step of the bid transaction fails, NONE
 * of it takes effect. current_price/current_bid_id must be exactly what they
 * were before the failed attempt — never partially updated.
 */
describe('placeBid transaction failure (atomicity / rollback)', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('leaves auction state completely unchanged when the bid insert fails', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 10 });
    const nonexistentUserId = '11111111-1111-1111-1111-111111111111';

    const before = await pool.query(
      'SELECT current_price, current_bid_id FROM auctions WHERE id = $1',
      [auctionId],
    );

    // This bid amount is otherwise perfectly valid (>= current_price +
    // min_increment) — the only thing wrong is the user doesn't exist, which
    // fails the bids.user_id foreign key inside the transaction, after the
    // row lock and validation checks have already passed.
    await expect(placeBid(auctionId, nonexistentUserId, 110)).rejects.toMatchObject({
      status: 400,
    });

    const after = await pool.query(
      'SELECT current_price, current_bid_id FROM auctions WHERE id = $1',
      [auctionId],
    );
    expect(after.rows[0]).toEqual(before.rows[0]);

    const { rows: bidRows } = await pool.query('SELECT id FROM bids WHERE auction_id = $1', [
      auctionId,
    ]);
    expect(bidRows).toHaveLength(0);
  });
});
