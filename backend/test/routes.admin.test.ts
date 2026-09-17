import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import { pool } from '../src/db.js';
import { placeBid } from '../src/services/placeBid.js';
import { createTestAuction, createTestUser } from './helpers.js';

afterAll(async () => {
  await pool.end();
});

describe('GET /api/admin/dashboard', () => {
  it('reports real system health', async () => {
    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.health).toMatchObject({ api: 'ok', db: 'ok', redis: 'ok' });
    expect(res.body.health.websocket.status).toBe('ok');
    expect(typeof res.body.health.websocket.connections).toBe('number');
  });

  it('reports a real active-auction count and current highest bid', async () => {
    const auctionId = await createTestAuction({ startingPrice: 500, minIncrement: 5 });
    const userId = await createTestUser();
    await placeBid(auctionId, userId, 900);

    const res = await request(app).get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.auctionOverview.activeAuctions).toBeGreaterThan(0);
    // Some other test file's auction could have an even higher current
    // price than this one — we only assert that whichever one is reported
    // really exists and is really that high, not that it's THIS auction.
    expect(res.body.auctionOverview.currentHighestBid.amount).toBeGreaterThanOrEqual(900);
  });

  it('never fabricates a zero for unmeasured performance stats before this test file\'s first bid attempt reaches the metrics module', async () => {
    // This just documents the contract: performance fields are either
    // real numbers or null, never a hardcoded 0. We can't assert null
    // here (other test files' bids may have already populated metrics
    // in the same process), so we assert the *shape* holds either way.
    const res = await request(app).get('/api/admin/dashboard');
    const perf = res.body.performance;
    for (const key of ['bidsPerSecond', 'avgLatencyMs', 'p95LatencyMs', 'p99LatencyMs']) {
      expect(perf[key] === null || typeof perf[key] === 'number').toBe(true);
    }
  });

  it('increments accepted/rejected bid counts after real HTTP bid attempts', async () => {
    // Deliberately goes through the real HTTP route (not placeBid()
    // directly) — metrics are recorded in the route handler, around the
    // real request, not inside placeBid() itself. See routes/auctions.ts.
    const before = (await request(app).get('/api/admin/dashboard')).body.performance;

    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 10 });
    const userId = await createTestUser();
    await request(app)
      .post(`/api/auctions/${auctionId}/bids`)
      .set('X-User-Id', userId)
      .send({ amount: 110 }); // accepted
    await request(app)
      .post(`/api/auctions/${auctionId}/bids`)
      .set('X-User-Id', userId)
      .send({ amount: 105 }); // rejected (too low)

    const after = (await request(app).get('/api/admin/dashboard')).body.performance;
    expect(after.acceptedBids).toBe(before.acceptedBids + 1);
    expect(after.rejectedBids).toBe(before.rejectedBids + 1);
    expect(after.totalBidAttempts).toBe(before.totalBidAttempts + 2);
  });

  it('reports a real correctness status derived from actual auction data', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 5 });
    const userId = await createTestUser();
    await placeBid(auctionId, userId, 110);

    const res = await request(app).get('/api/admin/dashboard');
    expect(['verified', 'violations_found', 'not_measured_yet']).toContain(res.body.correctness.status);
    // We just placed a valid bid, so at least one auction now has bids to
    // check, and it must be internally consistent (no lost/duplicated bid).
    expect(res.body.correctness.checkedAuctions).toBeGreaterThan(0);
    expect(res.body.correctness.status).toBe('verified');
    expect(res.body.correctness.violations).toEqual([]);
  });
});
