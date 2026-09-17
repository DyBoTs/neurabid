import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { broadcast, roomSize, subscribe, unsubscribeAll } from '../src/ws/broadcaster.js';
import type { BidAcceptedEvent } from '../src/ws/messages.js';

function fakeSocket(readyState: number = 1 /* OPEN */) {
  return {
    readyState,
    OPEN: 1,
    send: vi.fn(),
  } as unknown as WebSocket;
}

function sampleBidAcceptedEvent(overrides: Partial<BidAcceptedEvent> = {}): BidAcceptedEvent {
  return {
    type: 'bid_accepted',
    auctionId: 'auction-1',
    bidId: 'bid-1',
    amount: 105,
    currentHighest: 105,
    userId: 'user-1',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('broadcaster (room management)', () => {
  it('delivers a broadcast to every socket subscribed to that auction', () => {
    const auctionId = `test-${Math.random()}`;
    const a = fakeSocket();
    const b = fakeSocket();
    subscribe(auctionId, a);
    subscribe(auctionId, b);

    const event = sampleBidAcceptedEvent({ auctionId });
    broadcast(auctionId, event);

    expect(a.send).toHaveBeenCalledWith(JSON.stringify(event));
    expect(b.send).toHaveBeenCalledWith(JSON.stringify(event));
  });

  it('never delivers to sockets subscribed to a different auction', () => {
    const auctionA = `test-${Math.random()}`;
    const auctionB = `test-${Math.random()}`;
    const socketA = fakeSocket();
    const socketB = fakeSocket();
    subscribe(auctionA, socketA);
    subscribe(auctionB, socketB);

    broadcast(auctionA, sampleBidAcceptedEvent({ auctionId: auctionA }));

    expect(socketA.send).toHaveBeenCalledTimes(1);
    expect(socketB.send).not.toHaveBeenCalled();
  });

  it('skips a socket that is no longer open', () => {
    const auctionId = `test-${Math.random()}`;
    const closedSocket = fakeSocket(3 /* CLOSED, not OPEN(1) */);
    subscribe(auctionId, closedSocket);

    broadcast(auctionId, sampleBidAcceptedEvent({ auctionId }));

    expect(closedSocket.send).not.toHaveBeenCalled();
  });

  it('removes a socket from all rooms on unsubscribeAll, and stops delivering to it', () => {
    const auctionId = `test-${Math.random()}`;
    const socket = fakeSocket();
    subscribe(auctionId, socket);
    expect(roomSize(auctionId)).toBe(1);

    unsubscribeAll(socket);
    expect(roomSize(auctionId)).toBe(0);

    broadcast(auctionId, sampleBidAcceptedEvent({ auctionId }));
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('does nothing (and does not throw) when broadcasting to an auction with no subscribers', () => {
    const auctionId = `nobody-subscribed-${Math.random()}`;
    expect(() => broadcast(auctionId, sampleBidAcceptedEvent({ auctionId }))).not.toThrow();
  });
});
