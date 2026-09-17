import { afterAll, describe, expect, it } from 'vitest';
import { placeBid } from '../src/services/placeBid.js';
import { pool } from '../src/db.js';
import { createTestAuction, createTestUser } from './helpers.js';

describe('placeBid validation (single-bidder cases)', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('valid bid: accepts a bid that meets current_price + min_increment exactly', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 10 });
    const userId = await createTestUser();

    const result = await placeBid(auctionId, userId, 110);
    expect(result.amount).toBe(110);

    const { rows } = await pool.query('SELECT current_price FROM auctions WHERE id = $1', [
      auctionId,
    ]);
    expect(Number(rows[0].current_price)).toBe(110);
  });

  it('low bid: rejects a bid below the current price', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 10 });
    const userId = await createTestUser();

    await expect(placeBid(auctionId, userId, 90)).rejects.toMatchObject({ status: 409 });
  });

  it('equal bid: rejects a bid exactly equal to the current price', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 10 });
    const userId = await createTestUser();

    await expect(placeBid(auctionId, userId, 100)).rejects.toMatchObject({ status: 409 });
  });

  it('below increment: rejects a bid above the current price but under the minimum increment', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 10 });
    const userId = await createTestUser();

    // 105 > current price (100) but < required minimum (110)
    await expect(placeBid(auctionId, userId, 105)).rejects.toMatchObject({ status: 409 });
  });

  it('not started: rejects a bid on an auction whose starts_at is in the future', async () => {
    const auctionId = await createTestAuction({
      startingPrice: 100,
      minIncrement: 10,
      status: 'scheduled',
      startsInMs: 60_000,
      endsInMs: 120_000,
    });
    const userId = await createTestUser();

    await expect(placeBid(auctionId, userId, 200)).rejects.toMatchObject({ status: 403 });
  });

  it('ended auction: rejects a bid whose status is already ended', async () => {
    const auctionId = await createTestAuction({
      startingPrice: 100,
      minIncrement: 10,
      status: 'ended',
    });
    const userId = await createTestUser();

    await expect(placeBid(auctionId, userId, 200)).rejects.toMatchObject({ status: 410 });
  });

  it('ended auction: rejects a bid whose ends_at has already passed, even if status was never swept', async () => {
    const auctionId = await createTestAuction({
      startingPrice: 100,
      minIncrement: 10,
      status: 'active',
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
