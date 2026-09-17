import { useEffect, useRef, useState } from 'react';
import { WS_URL } from '../config';
import type { Auction, ServerEvent } from '../api/types';
import type { ConnectionState } from '../components/ui/ConnectionStatus';

export interface LiveBidEvent {
  bidId: string;
  amount: number;
  currentHighest: number;
  userId: string;
  timestamp: string;
}

interface AuctionEndedInfo {
  winningBidId: string | null;
  finalPrice: number;
}

interface UseAuctionSocketResult {
  connectionState: ConnectionState;
  /** The authoritative auction snapshot — always from the server, never guessed. */
  auction: Auction | null;
  /** Bids observed live since this hook mounted, most recent first. */
  liveBids: LiveBidEvent[];
  auctionEnded: AuctionEndedInfo | null;
}

const MAX_RECONNECT_DELAY_MS = 5000;

/**
 * Subscribes to one auction's live updates. Reconnect is not a special
 * case (docs/05-realtime.md §5): on any close, this opens a brand-new
 * WebSocket and sends the same `subscribe` message it would on first
 * load. The server always answers with a fresh `snapshot`, which is what
 * makes the resync authoritative — this hook never tries to guess or
 * replay what it might have missed while disconnected.
 */
export function useAuctionSocket(auctionId: string): UseAuctionSocketResult {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [auction, setAuction] = useState<Auction | null>(null);
  const [liveBids, setLiveBids] = useState<LiveBidEvent[]>([]);
  const [auctionEnded, setAuctionEnded] = useState<AuctionEndedInfo | null>(null);
  const reconnectAttempt = useRef(0);

  // Resetting per-auction state when auctionId changes is "adjusting state
  // when a prop changes" (React's documented pattern) — done directly
  // during render, not in the effect below, so the effect's only job is
  // the actual external-system work (opening/closing the socket).
  const [trackedAuctionId, setTrackedAuctionId] = useState(auctionId);
  if (trackedAuctionId !== auctionId) {
    setTrackedAuctionId(auctionId);
    setAuction(null);
    setLiveBids([]);
    setAuctionEnded(null);
    setConnectionState('connecting');
  }

  useEffect(() => {
    let socket: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    // A ref mutation (unlike setState) is safe here — this runs after
    // render, as part of the effect, not during it.
    reconnectAttempt.current = 0;

    function connect() {
      setConnectionState(reconnectAttempt.current > 0 ? 'reconnecting' : 'connecting');
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        reconnectAttempt.current = 0;
        setConnectionState('connected');
        socket.send(JSON.stringify({ type: 'subscribe', auctionId }));
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        const message = JSON.parse(event.data) as ServerEvent;

        if (message.type === 'snapshot') {
          setAuction(message.auction);
          if (message.auction.status === 'ended') {
            setAuctionEnded({
              winningBidId: message.auction.currentBidId,
              finalPrice: message.auction.currentPrice,
            });
          }
        } else if (message.type === 'bid_accepted') {
          setAuction((prev) =>
            prev ? { ...prev, currentPrice: message.currentHighest, currentBidId: message.bidId } : prev,
          );
          setLiveBids((prev) => [
            {
              bidId: message.bidId,
              amount: message.amount,
              currentHighest: message.currentHighest,
              userId: message.userId,
              timestamp: message.timestamp,
            },
            ...prev,
          ]);
        } else if (message.type === 'auction_ended') {
          setAuctionEnded({ winningBidId: message.winningBidId, finalPrice: message.finalPrice });
          setAuction((prev) =>
            prev ? { ...prev, status: 'ended', currentPrice: message.finalPrice } : prev,
          );
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        // This hook always retries with capped backoff — it never gives up
        // — so "disconnected" (a terminal state) never applies here; every
        // drop immediately becomes "reconnecting". ConnectionStatus still
        // supports a true "disconnected" state for a future manual
        // disconnect action, just not one this hook produces itself.
        setConnectionState('reconnecting');
        reconnectAttempt.current += 1;
        const delay = Math.min(MAX_RECONNECT_DELAY_MS, 500 * 2 ** reconnectAttempt.current);
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [auctionId]);

  return { connectionState, auction, liveBids, auctionEnded };
}
