import { afterAll, describe, expect, it } from 'vitest';
import { BidError, placeBid } from '../src/services/placeBid.js';
import { pool } from '../src/db.js';
import { createTestAuction, createTestUser } from './helpers.js';

describe('placeBid validation (single-bidder cases)', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('rejects a bid below current_price + min_increment', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 10 });
    const userId = await createTestUser();

    await expect(placeBid(auctionId, userId, 105)).rejects.toMatchObject({
      status: 409,
    } satisfies Partial<BidError>);
  });

  it('accepts a bid that meets current_price + min_increment exactly', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 10 });
    const userId = await createTestUser();

    const result = await placeBid(auctionId, userId, 110);
    expect(result.amount).toBe(110);

    const { rows } = await pool.query('SELECT current_price FROM auctions WHERE id = $1', [
      auctionId,
    ]);
    expect(Number(rows[0].current_price)).toBe(110);
  });

  it('rejects a bid on an already-ended auction', async () => {
    const auctionId = await createTestAuction({
      startingPrice: 100,
      minIncrement: 10,
      status: 'ended',
    });
    const userId = await createTestUser();

    await expect(placeBid(auctionId, userId, 200)).rejects.toMatchObject({ status: 410 });
  });

  it('rejects a bid on an auction whose ends_at has already passed', async () => {
    const auctionId = await createTestAuction({
      startingPrice: 100,
      minIncrement: 10,
      endsInMs: -1000,
    });
    const userId = await createTestUser();

    await expect(placeBid(auctionId, userId, 200)).rejects.toMatchObject({ status: 410 });
  });

  it('rejects a bid on a nonexistent auction', async () => {
    const userId = await createTestUser();
    await expect(
      placeBid('00000000-0000-0000-0000-000000000000', userId, 200),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a non-positive bid amount', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 10 });
    const userId = await createTestUser();
    await expect(placeBid(auctionId, userId, 0)).rejects.toMatchObject({ status: 400 });
    await expect(placeBid(auctionId, userId, -5)).rejects.toMatchObject({ status: 400 });
  });
});
