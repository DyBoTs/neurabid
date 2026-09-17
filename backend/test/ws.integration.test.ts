import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { app } from '../src/server.js';
import { attachWebSocketServer } from '../src/ws/wsServer.js';
import { pool } from '../src/db.js';
import { createTestAuction, createTestUser } from './helpers.js';

/**
 * Unlike the other test files, this one needs a real bound TCP port — a
 * WebSocket connection can't be simulated in-process the way supertest
 * simulates HTTP requests. server.ts's app.listen() is skipped under
 * VITEST (see the guard at the bottom of server.ts), so this test wraps
 * the same `app` in its own throwaway http.Server on an OS-assigned free
 * port (`listen(0)`), exactly mirroring what happens in real runtime.
 */
describe('WebSocket integration (real server, real socket)', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer(app);
    attachWebSocketServer(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await pool.end();
  });

  function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      ws.once('message', (data: Buffer) => resolve(JSON.parse(data.toString())));
    });
  }

  async function connect(): Promise<WebSocket> {
    const ws = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    return ws;
  }

  it('sends a full snapshot immediately on subscribe', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 5 });
    const ws = await connect();

    const messagePromise = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'subscribe', auctionId }));
    const message = await messagePromise;

    expect(message.type).toBe('snapshot');
    expect((message.auction as { id: string; currentPrice: number }).id).toBe(auctionId);
    expect((message.auction as { id: string; currentPrice: number }).currentPrice).toBe(100);

    ws.close();
  });

  it('rejects an invalid subscribe message with a clear error, not a crash', async () => {
    const ws = await connect();

    const messagePromise = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'subscribe', auctionId: 'not-a-uuid' }));
    const message = await messagePromise;

    expect(message.type).toBe('error');
    ws.close();
  });

  it('broadcasts bid_accepted to a subscribed client, and only after the HTTP request has actually completed', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 5 });
    const userId = await createTestUser();
    const ws = await connect();

    const snapshotPromise = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'subscribe', auctionId }));
    expect((await snapshotPromise).type).toBe('snapshot');

    const bidMessagePromise = nextMessage(ws);

    // This is the real HTTP endpoint, on the real server this test spun
    // up — not a call to placeBid() directly. The `await` here only
    // resolves once the response has been sent, which server.ts's route
    // only does after placeBid()'s promise (i.e. the COMMIT) resolved.
    const res = await fetch(`http://localhost:${port}/api/auctions/${auctionId}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({ amount: 110 }),
    });
    expect(res.status).toBe(201);
    const bidResult = (await res.json()) as { bidId: string };

    const bidMessage = await bidMessagePromise;
    expect(bidMessage).toMatchObject({
      type: 'bid_accepted',
      auctionId,
      bidId: bidResult.bidId,
      amount: 110,
      userId,
    });

    ws.close();
  });

  it('does not broadcast a rejected (too-low) bid attempt to subscribers', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 10 });
    const userId = await createTestUser();
    const ws = await connect();

    const snapshotPromise = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'subscribe', auctionId }));
    await snapshotPromise;

    let receivedUnexpectedMessage = false;
    ws.on('message', () => {
      receivedUnexpectedMessage = true;
    });

    const res = await fetch(`http://localhost:${port}/api/auctions/${auctionId}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({ amount: 105 }), // below current_price + min_increment
    });
    expect(res.status).toBe(409);

    // Give any (incorrect) broadcast a moment to arrive before asserting
    // it never did.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(receivedUnexpectedMessage).toBe(false);

    ws.close();
  });
});
