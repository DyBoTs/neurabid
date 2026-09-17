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

  it('connection: a client can open a WebSocket connection to the server', async () => {
    const ws = await connect();
    expect(ws.readyState).toBe(ws.OPEN);
    ws.close();
  });

  it('subscription: sends a full snapshot immediately on subscribe', async () => {
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

  it('accepted event: broadcasts bid_accepted with all required fields, only after the HTTP request has actually completed', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 5 });
    const userId = await createTestUser();
    const beforeRequest = Date.now();
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
    // Every field required by the spec: auction ID, bid ID, amount,
    // timestamp, current highest.
    expect(bidMessage).toMatchObject({
      type: 'bid_accepted',
      auctionId,
      bidId: bidResult.bidId,
      amount: 110,
      currentHighest: 110,
      userId,
    });
    expect(typeof bidMessage.timestamp).toBe('string');
    expect(new Date(bidMessage.timestamp as string).getTime()).toBeGreaterThanOrEqual(beforeRequest);

    ws.close();
  });

  it('rejection: does not broadcast a rejected (too-low) bid attempt to subscribers', async () => {
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

  it('reconnect: a client can close its connection and open a brand new one without any special handshake', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 5 });

    const firstConnection = await connect();
    const firstSnapshot = nextMessage(firstConnection);
    firstConnection.send(JSON.stringify({ type: 'subscribe', auctionId }));
    expect((await firstSnapshot).type).toBe('snapshot');

    // Simulate a dropped connection: close it, then open an entirely new
    // socket — there is no session/token to carry over. The server treats
    // it exactly like any other fresh connection.
    firstConnection.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const secondConnection = await connect();
    const secondSnapshot = nextMessage(secondConnection);
    secondConnection.send(JSON.stringify({ type: 'subscribe', auctionId }));
    const message = await secondSnapshot;

    expect(message.type).toBe('snapshot');
    expect((message.auction as { id: string }).id).toBe(auctionId);

    secondConnection.close();
  });

  it('state resync: reconnecting after missing a bid gets the TRUE current state, not stale or replayed data', async () => {
    const auctionId = await createTestAuction({ startingPrice: 100, minIncrement: 5 });
    const userId = await createTestUser();

    const firstConnection = await connect();
    const firstSnapshot = nextMessage(firstConnection);
    firstConnection.send(JSON.stringify({ type: 'subscribe', auctionId }));
    const initialSnapshot = await firstSnapshot;
    expect((initialSnapshot.auction as { currentPrice: number }).currentPrice).toBe(100);

    // The client "goes offline" — connection closes before the bid below
    // is placed, so it cannot possibly have received a bid_accepted event
    // for it.
    firstConnection.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const res = await fetch(`http://localhost:${port}/api/auctions/${auctionId}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({ amount: 130 }),
    });
    expect(res.status).toBe(201);
    const bidResult = (await res.json()) as { bidId: string };

    // Reconnect: a brand new socket, re-subscribing exactly as it would
    // after any other reconnect. It must NOT show the stale $100 it saw
    // before disconnecting — the resync must reflect what actually
    // happened while it was gone, straight from the database.
    const secondConnection = await connect();
    const resyncPromise = nextMessage(secondConnection);
    secondConnection.send(JSON.stringify({ type: 'subscribe', auctionId }));
    const resync = await resyncPromise;

    expect(resync.type).toBe('snapshot');
    const auction = resync.auction as { currentPrice: number; currentBidId: string };
    expect(auction.currentPrice).toBe(130);
    expect(auction.currentBidId).toBe(bidResult.bidId);

    secondConnection.close();
  });
});
