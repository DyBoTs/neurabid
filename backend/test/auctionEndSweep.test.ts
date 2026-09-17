import { afterAll, describe, expect, it } from 'vitest';
import { sweepOnce } from '../src/services/auctionEndSweep.js';
import { pool } from '../src/db.js';
import { createTestAuction } from './helpers.js';

describe('auction end sweep', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('transitions an auction whose ends_at has passed from active to ended', async () => {
    const auctionId = await createTestAuction({
      startingPrice: 100,
      minIncrement: 5,
      status: 'active',
      endsInMs: -1000, // already past
    });

    const ended = await sweepOnce();
    expect(ended.map((row) => row.id)).toContain(auctionId);

    const { rows } = await pool.query('SELECT status FROM auctions WHERE id = $1', [auctionId]);
    expect(rows[0].status).toBe('ended');
  });

  it('does not touch an auction that is still active and within its window', async () => {
    const auctionId = await createTestAuction({
      startingPrice: 100,
      minIncrement: 5,
      status: 'active',
      endsInMs: 60_000,
    });

    const ended = await sweepOnce();
    expect(ended.map((row) => row.id)).not.toContain(auctionId);

    const { rows } = await pool.query('SELECT status FROM auctions WHERE id = $1', [auctionId]);
    expect(rows[0].status).toBe('active');
  });

  it('is idempotent: running it again does not re-report an already-ended auction', async () => {
    const auctionId = await createTestAuction({
      startingPrice: 100,
      minIncrement: 5,
      status: 'active',
      endsInMs: -1000,
    });

    const firstSweep = await sweepOnce();
    expect(firstSweep.map((row) => row.id)).toContain(auctionId);

    const secondSweep = await sweepOnce();
    expect(secondSweep.map((row) => row.id)).not.toContain(auctionId);
  });
});
