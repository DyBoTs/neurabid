import type { WebSocket } from 'ws';
import type { ServerEvent } from './messages.js';

/**
 * A "room" per auction id — the set of sockets currently subscribed to
 * that auction's updates. Deliberately in-process (a plain Map), not
 * Redis pub/sub: with a single backend process, that's all that's needed.
 * If this were ever split across multiple Node instances, broadcast()
 * would need to publish to a shared Redis channel instead so every
 * instance's sockets get the message — see docs/01-project-plan.md §9.
 */
const rooms = new Map<string, Set<WebSocket>>();

/**
 * The admin dashboard's live bid stream watches every auction at once,
 * not one — a separate set, not a room keyed by auction id, since it has
 * no single auctionId of its own.
 */
const adminSockets = new Set<WebSocket>();

/** Every currently-open connection, subscribed or not — the source of
 * truth for the admin dashboard's WebSocket health indicator. */
const allConnections = new Set<WebSocket>();

export function registerConnection(socket: WebSocket): void {
  allConnections.add(socket);
}

export function subscribe(auctionId: string, socket: WebSocket): void {
  let room = rooms.get(auctionId);
  if (!room) {
    room = new Set();
    rooms.set(auctionId, room);
  }
  room.add(socket);
}

export function subscribeAdmin(socket: WebSocket): void {
  adminSockets.add(socket);
}

/** Called when a socket disconnects — removes it from every room (and the admin set) it was in. */
export function unsubscribeAll(socket: WebSocket): void {
  for (const [auctionId, room] of rooms) {
    room.delete(socket);
    if (room.size === 0) {
      rooms.delete(auctionId);
    }
  }
  adminSockets.delete(socket);
  allConnections.delete(socket);
}

/**
 * Sends `message` to every socket currently subscribed to `auctionId`.
 * Callers must only invoke this AFTER the thing being announced has
 * actually happened (e.g. after placeBid()'s promise has resolved, which
 * only occurs post-COMMIT) — this function has no way to enforce that
 * itself, so it never should be called speculatively.
 */
export function broadcast(auctionId: string, message: ServerEvent): void {
  const room = rooms.get(auctionId);
  if (!room || room.size === 0) return;

  const payload = JSON.stringify(message);
  for (const socket of room) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

/** Same delivery rule as broadcast(): only ever call this after a commit. */
export function broadcastAdmin(message: ServerEvent): void {
  if (adminSockets.size === 0) return;
  const payload = JSON.stringify(message);
  for (const socket of adminSockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

/** Test-only escape hatch to inspect room state without a real socket. */
export function roomSize(auctionId: string): number {
  return rooms.get(auctionId)?.size ?? 0;
}

/** Real, live count of currently-connected sockets — used by the admin
 * dashboard's WebSocket health indicator (see docs/07-admin-dashboard.md). */
export function connectionCount(): number {
  return allConnections.size;
}
