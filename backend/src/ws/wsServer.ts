import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { registerConnection, subscribe, subscribeAdmin, unsubscribeAll } from './broadcaster.js';
import type { ServerEvent } from './messages.js';
import { getAuctionById } from '../services/getAuction.js';
import { isUuid } from '../validation.js';

/**
 * A client sends either {type:'subscribe', auctionId} (the normal Live
 * Auction page case) or {type:'subscribe_admin'} (the admin dashboard's
 * system-wide live bid stream — see docs/07-admin-dashboard.md). On a
 * normal subscribe, the server immediately replies with a full snapshot
 * of that auction's current state (docs/01-project-plan.md §10) — a
 * client that just reconnected after a drop must not sit there showing
 * stale data waiting for the next bid; it needs the current truth right
 * away.
 */
export function attachWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (socket: WebSocket) => {
    registerConnection(socket);

    socket.on('message', (raw: Buffer) => {
      handleMessage(socket, raw).catch((err: unknown) => {
        console.error('WebSocket message handling error:', err);
      });
    });

    socket.on('close', () => unsubscribeAll(socket));
  });

  return wss;
}

function send(socket: WebSocket, event: ServerEvent): void {
  socket.send(JSON.stringify(event));
}

function sendError(socket: WebSocket, message: string): void {
  send(socket, { type: 'error', message });
}

async function handleMessage(socket: WebSocket, raw: Buffer): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString());
  } catch {
    sendError(socket, 'Invalid JSON');
    return;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    sendError(socket, 'Expected a JSON object');
    return;
  }

  const { type, auctionId } = parsed as Record<string, unknown>;

  if (type === 'subscribe_admin') {
    subscribeAdmin(socket);
    return;
  }

  if (type !== 'subscribe') {
    sendError(socket, `Unknown message type: ${String(type)}`);
    return;
  }
  if (typeof auctionId !== 'string' || !isUuid(auctionId)) {
    sendError(socket, 'subscribe requires a valid auctionId');
    return;
  }

  const auction = await getAuctionById(auctionId);
  if (!auction) {
    sendError(socket, 'Auction not found');
    return;
  }

  subscribe(auctionId, socket);
  send(socket, { type: 'snapshot', auction });
}
