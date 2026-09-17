import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { subscribe, unsubscribeAll } from './broadcaster.js';
import { getAuctionById } from '../services/getAuction.js';
import { isUuid } from '../validation.js';

/**
 * The only message a client sends is {type:'subscribe', auctionId}. On
 * subscribe, the server immediately replies with a full snapshot of that
 * auction's current state (see docs/01-project-plan.md §10) — a client
 * that just reconnected after a drop must not sit there showing stale
 * data waiting for the next bid; it needs the current truth right away.
 */
export function attachWebSocketServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (socket: WebSocket) => {
    socket.on('message', (raw: Buffer) => {
      handleMessage(socket, raw).catch((err: unknown) => {
        console.error('WebSocket message handling error:', err);
      });
    });

    socket.on('close', () => unsubscribeAll(socket));
  });

  return wss;
}

function sendError(socket: WebSocket, message: string): void {
  socket.send(JSON.stringify({ type: 'error', message }));
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
  socket.send(JSON.stringify({ type: 'snapshot', auction }));
}
