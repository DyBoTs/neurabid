import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { broadcast, roomSize, subscribe, unsubscribeAll } from '../src/ws/broadcaster.js';

function fakeSocket(readyState: number = 1 /* OPEN */) {
  return {
    readyState,
    OPEN: 1,
    send: vi.fn(),
  } as unknown as WebSocket;
}

describe('broadcaster (room management)', () => {
  it('delivers a broadcast to every socket subscribed to that auction', () => {
    const auctionId = `test-${Math.random()}`;
    const a = fakeSocket();
    const b = fakeSocket();
    subscribe(auctionId, a);
    subscribe(auctionId, b);

    broadcast(auctionId, { type: 'bid_accepted', amount: 105 });

    expect(a.send).toHaveBeenCalledWith(JSON.stringify({ type: 'bid_accepted', amount: 105 }));
    expect(b.send).toHaveBeenCalledWith(JSON.stringify({ type: 'bid_accepted', amount: 105 }));
  });

  it('never delivers to sockets subscribed to a different auction', () => {
    const auctionA = `test-${Math.random()}`;
    const auctionB = `test-${Math.random()}`;
    const socketA = fakeSocket();
    const socketB = fakeSocket();
    subscribe(auctionA, socketA);
    subscribe(auctionB, socketB);

    broadcast(auctionA, { type: 'bid_accepted' });

    expect(socketA.send).toHaveBeenCalledTimes(1);
    expect(socketB.send).not.toHaveBeenCalled();
  });

  it('skips a socket that is no longer open', () => {
    const auctionId = `test-${Math.random()}`;
    const closedSocket = fakeSocket(3 /* CLOSED, not OPEN(1) */);
    subscribe(auctionId, closedSocket);

    broadcast(auctionId, { type: 'bid_accepted' });

    expect(closedSocket.send).not.toHaveBeenCalled();
  });

  it('removes a socket from all rooms on unsubscribeAll, and stops delivering to it', () => {
    const auctionId = `test-${Math.random()}`;
    const socket = fakeSocket();
    subscribe(auctionId, socket);
    expect(roomSize(auctionId)).toBe(1);

    unsubscribeAll(socket);
    expect(roomSize(auctionId)).toBe(0);

    broadcast(auctionId, { type: 'bid_accepted' });
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('does nothing (and does not throw) when broadcasting to an auction with no subscribers', () => {
    expect(() => broadcast(`nobody-subscribed-${Math.random()}`, { type: 'bid_accepted' })).not.toThrow();
  });
});
