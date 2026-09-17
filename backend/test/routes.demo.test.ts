import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import { pool } from '../src/db.js';

afterAll(async () => {
  await pool.end();
});

describe('POST /api/admin/demo/reset', () => {
  it('creates the demo auction on first call, with the known starting values', async () => {
    const res = await request(app).post('/api/admin/demo/reset');
    expect(res.status).toBe(200);
    expect(res.body.auction).toMatchObject({
      title: 'NeuraBid Live Demo Auction',
      startingPrice: 100,
      currentPrice: 100,
      minIncrement: 5,
      status: 'active',
      currentBidId: null,
    });
  });

  it('GET /api/admin/demo/auction returns the same auction', async () => {
    const res = await request(app).get('/api/admin/demo/auction');
    expect(res.status).toBe(200);
    expect(res.body.auction.title).toBe('NeuraBid Live Demo Auction');
  });

  it('resetting again after bids exist clears them and restores the starting price', async () => {
    const auctionId = (await request(app).get('/api/admin/demo/auction')).body.auction.id;
    const userRes = await request(app).post('/api/users').send({ username: 'demo_reset_tester' });
    await request(app)
      .post(`/api/auctions/${auctionId}/bids`)
      .set('X-User-Id', userRes.body.id)
      .send({ amount: 500 });

    const beforeReset = await request(app).get('/api/admin/demo/auction');
    expect(beforeReset.body.auction.currentPrice).toBe(500);

    const resetRes = await request(app).post('/api/admin/demo/reset');
    expect(resetRes.body.auction.currentPrice).toBe(100);
    expect(resetRes.body.auction.currentBidId).toBeNull();

    const bidsRes = await request(app).get(`/api/auctions/${auctionId}/bids`);
    expect(bidsRes.body).toEqual([]);
  });
});

describe('POST /api/admin/demo/simulate', () => {
  it('rejects an out-of-range or non-integer count', async () => {
    await request(app).post('/api/admin/demo/reset');
    expect((await request(app).post('/api/admin/demo/simulate').send({ count: 0 })).status).toBe(400);
    expect((await request(app).post('/api/admin/demo/simulate').send({ count: 201 })).status).toBe(400);
    expect((await request(app).post('/api/admin/demo/simulate').send({ count: 2.5 })).status).toBe(400);
  });

  it('fires N genuinely concurrent bids at the same target amount and reports real accept/reject counts', async () => {
    await request(app).post('/api/admin/demo/reset');

    const res = await request(app).post('/api/admin/demo/simulate').send({ count: 10 });
    expect(res.status).toBe(200);
    expect(res.body.requested).toBe(10);
    expect(res.body.accepted).toBe(1); // all 10 bots target the same amount — only one can win
    expect(res.body.rejected).toBe(9);
    expect(res.body.results).toHaveLength(10);

    const acceptedUsernamesUsed = res.body.results.every((r: { userId: string }) =>
      typeof r.userId === 'string',
    );
    expect(acceptedUsernamesUsed).toBe(true);
  });

  it('the simulated bid is visible via the normal bid history endpoint, using a demo_bot_ username', async () => {
    await request(app).post('/api/admin/demo/reset');
    const auctionId = (await request(app).get('/api/admin/demo/auction')).body.auction.id;

    await request(app).post('/api/admin/demo/simulate').send({ count: 3 });

    const bidsRes = await request(app).get(`/api/auctions/${auctionId}/bids`);
    expect(bidsRes.body).toHaveLength(1);
    expect(bidsRes.body[0].username).toMatch(/^demo_bot_/);
  });
});
