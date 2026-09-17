import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import { pool } from '../src/db.js';
import { placeBid } from '../src/services/placeBid.js';
import { createTestAuction, createTestUser } from './helpers.js';

afterAll(async () => {
  await pool.end();
});

describe('GET /api/auctions/:id/bids', () => {
  it('returns an empty array for an auction with no bids', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 5 });
    const res = await request(app).get(`/api/auctions/${auctionId}/bids`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('lists bids most recent first, with username joined in', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 5 });
    const userId = await createTestUser();
    const bid = await placeBid(auctionId, userId, 110);

    const res = await request(app).get(`/api/auctions/${auctionId}/bids`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ bidId: bid.bidId, amount: 110, userId });
    expect(typeof res.body[0].username).toBe('string');
  });
});

describe('GET /api/auctions', () => {
  it('lists auctions as an array of serialized objects', async () => {
    await createTestAuction({ startingPrice: 50, minIncrement: 5 });
    const res = await request(app).get('/api/auctions');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      currentPrice: expect.any(Number),
      status: expect.any(String),
    });
  });
});

describe('POST /api/auctions', () => {
  it('creates a new active auction with the given values', async () => {
    const res = await request(app).post('/api/auctions').send({
      title: 'Test Vintage Camera',
      description: 'Works great',
      startingPrice: 25,
      minIncrement: 5,
      durationMinutes: 30,
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Test Vintage Camera',
      startingPrice: 25,
      currentPrice: 25,
      minIncrement: 5,
      status: 'active',
    });

    const getRes = await request(app).get(`/api/auctions/${res.body.id}`);
    expect(getRes.status).toBe(200);
  });

  it('rejects a title that is too short', async () => {
    const res = await request(app).post('/api/auctions').send({
      title: 'ab',
      startingPrice: 25,
      minIncrement: 5,
      durationMinutes: 30,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-positive starting price', async () => {
    const res = await request(app).post('/api/auctions').send({
      title: 'Valid Title',
      startingPrice: 0,
      minIncrement: 5,
      durationMinutes: 30,
    });
    expect(res.status).toBe(400);
  });

  it('rejects an unreasonable duration', async () => {
    const res = await request(app).post('/api/auctions').send({
      title: 'Valid Title',
      startingPrice: 25,
      minIncrement: 5,
      durationMinutes: 999_999,
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auctions/:id', () => {
  it('returns 400 for a malformed id', async () => {
    const res = await request(app).get('/api/auctions/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('returns 404 for a well-formed but nonexistent id', async () => {
    const res = await request(app).get('/api/auctions/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('returns the auction for a real id', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 5 });
    const res = await request(app).get(`/api/auctions/${auctionId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(auctionId);
    expect(res.body.currentPrice).toBe(100);
  });
});

describe('POST /api/auctions/:id/bids', () => {
  it('rejects a bid with no X-User-Id header', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 5 });
    const res = await request(app).post(`/api/auctions/${auctionId}/bids`).send({ amount: 110 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/X-User-Id/);
  });

  it('places a valid bid end-to-end and reflects it on a follow-up GET', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 5 });
    const userId = await createTestUser();

    const bidRes = await request(app)
      .post(`/api/auctions/${auctionId}/bids`)
      .set('X-User-Id', userId)
      .send({ amount: 105 });

    expect(bidRes.status).toBe(201);
    expect(bidRes.body).toMatchObject({ auctionId, amount: 105 });

    const getRes = await request(app).get(`/api/auctions/${auctionId}`);
    expect(getRes.body.currentPrice).toBe(105);
    expect(getRes.body.currentBidId).toBe(bidRes.body.bidId);
  });

  it('rejects a bid below the minimum increment with 409 and does not change the price', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 10 });
    const userId = await createTestUser();

    const res = await request(app)
      .post(`/api/auctions/${auctionId}/bids`)
      .set('X-User-Id', userId)
      .send({ amount: 105 });

    expect(res.status).toBe(409);

    const getRes = await request(app).get(`/api/auctions/${auctionId}`);
    expect(getRes.body.currentPrice).toBe(100);
  });

  it('rejects a bid on an ended auction with 410', async () => {
    const auctionId = await createTestAuction({
      startingPrice: 100,
      minIncrement: 10,
      status: 'ended',
    });
    const userId = await createTestUser();

    const res = await request(app)
      .post(`/api/auctions/${auctionId}/bids`)
      .set('X-User-Id', userId)
      .send({ amount: 200 });

    expect(res.status).toBe(410);
  });
});
