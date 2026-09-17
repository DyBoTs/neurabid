import { useEffect, useState } from 'react';
import { WS_URL } from '../config';
import type { ServerEvent } from '../api/types';
import type { ConnectionState } from '../components/ui/ConnectionStatus';

export interface StreamEntry {
  key: string;
  auctionId: string;
  bidId: string;
  amount: number;
  userId: string;
  timestamp: string;
}

const MAX_ENTRIES = 50;

/**
 * The admin dashboard's live bid stream: one socket subscribed to every
 * auction's bid_accepted events at once (via {type:'subscribe_admin'}, a
 * separate channel from per-auction rooms — see
 * backend/src/ws/broadcaster.ts and docs/07-admin-dashboard.md), not five
 * or fifty separate per-auction subscriptions.
 */
export function useAdminBidStream(): { connectionState: ConnectionState; entries: StreamEntry[] } {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [entries, setEntries] = useState<StreamEntry[]>([]);

  useEffect(() => {
    let socket: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let reconnectAttempt = 0;

    function connect() {
      setConnectionState(reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        reconnectAttempt = 0;
        setConnectionState('connected');
        socket.send(JSON.stringify({ type: 'subscribe_admin' }));
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        const message = JSON.parse(event.data) as ServerEvent;
        if (message.type !== 'bid_accepted') return;

        setEntries((prev) =>
          [
            {
              key: message.bidId,
              auctionId: message.auctionId,
              bidId: message.bidId,
              amount: message.amount,
              userId: message.userId,
              timestamp: message.timestamp,
            },
            ...prev,
          ].slice(0, MAX_ENTRIES),
        );
      };

      socket.onclose = () => {
        if (cancelled) return;
        setConnectionState('reconnecting');
        reconnectAttempt += 1;
        const delay = Math.min(5000, 500 * 2 ** reconnectAttempt);
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => socket.close();
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return { connectionState, entries };
}
