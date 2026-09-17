import type { WebSocket } from 'ws';

/**
 * A "room" per auction id — the set of sockets currently subscribed to
 * that auction's updates. Deliberately in-process (a plain Map), not
 * Redis pub/sub: with a single backend process, that's all that's needed.
 * If this were ever split across multiple Node instances, broadcast()
 * would need to publish to a shared Redis channel instead so every
 * instance's sockets get the message — see docs/01-project-plan.md §9.
 */
const rooms = new Map<string, Set<WebSocket>>();

export function subscribe(auctionId: string, socket: WebSocket): void {
  let room = rooms.get(auctionId);
  if (!room) {
    room = new Set();
    rooms.set(auctionId, room);
  }
  room.add(socket);
}

/** Called when a socket disconnects — removes it from every room it was in. */
export function unsubscribeAll(socket: WebSocket): void {
  for (const [auctionId, room] of rooms) {
    room.delete(socket);
    if (room.size === 0) {
      rooms.delete(auctionId);
    }
  }
}

/**
 * Sends `message` to every socket currently subscribed to `auctionId`.
 * Callers must only invoke this AFTER the thing being announced has
 * actually happened (e.g. after placeBid()'s promise has resolved, which
 * only occurs post-COMMIT) — this function has no way to enforce that
 * itself, so it never should be called speculatively.
 */
export function broadcast(auctionId: string, message: unknown): void {
  const room = rooms.get(auctionId);
  if (!room || room.size === 0) return;

  const payload = JSON.stringify(message);
  for (const socket of room) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

/** Test-only escape hatch to inspect room state without a real socket. */
export function roomSize(auctionId: string): number {
  return rooms.get(auctionId)?.size ?? 0;
}
