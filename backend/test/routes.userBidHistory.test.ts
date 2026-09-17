import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import { pool } from '../src/db.js';
import { placeBid } from '../src/services/placeBid.js';
import { createTestAuction, createTestUser } from './helpers.js';

afterAll(async () => {
  await pool.end();
});

describe('GET /api/users/:id/bids', () => {
  it('returns 400 for a malformed user id', async () => {
    const res = await request(app).get('/api/users/not-a-uuid/bids');
    expect(res.status).toBe(400);
  });

  it('returns an empty array for a user with no bids', async () => {
    const userId = await createTestUser();
    const res = await request(app).get(`/api/users/${userId}/bids`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('lists a user\'s bids across auctions, marking the winning one', async () => {
    const userId = await createTestUser();
    const otherUser = await createTestUser();
    const auctionA = await createTestAuction({ startingPrice: 100, minIncrement: 5 });
    const auctionB = await createTestAuction({ startingPrice: 50, minIncrement: 5 });

    const bidA = await placeBid(auctionA, userId, 110);
    await placeBid(auctionB, userId, 60);
    await placeBid(auctionB, otherUser, 70); // outbids the user on auction B

    const res = await request(app).get(`/api/users/${userId}/bids`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const forAuctionA = res.body.find((b: { auctionId: string }) => b.auctionId === auctionA);
    expect(forAuctionA).toMatchObject({ bidId: bidA.bidId, amount: 110, isWinning: true });

    const forAuctionB = res.body.find((b: { auctionId: string }) => b.auctionId === auctionB);
    expect(forAuctionB).toMatchObject({ amount: 60, isWinning: false });
  });
});
