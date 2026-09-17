import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ConnectionStatus } from '../components/ui/ConnectionStatus';
import { AuctionStatusBadge } from '../components/ui/Badge';
import { PriceDisplay } from '../components/ui/PriceDisplay';
import { Sparkline } from '../components/ui/Sparkline';
import { CountdownTimer } from '../components/CountdownTimer';
import { BidForm } from '../components/BidForm';
import { BidHistoryTable, type BidHistoryRow } from '../components/BidHistoryTable';
import { useAuctionSocket } from '../hooks/useAuctionSocket';
import { useAuth } from '../hooks/useAuth';
import { getAuction, getAuctionBids } from '../api/auctions';
import { ApiError } from '../api/client';
import type { Auction, AuctionBid } from '../api/types';
import styles from './LiveAuction.module.css';

export function LiveAuctionPage() {
  const { id } = useParams<{ id: string }>();
  const auctionId = id ?? '';
  const { user } = useAuth();

  const { connectionState, auction: liveAuction, liveBids, auctionEnded } = useAuctionSocket(auctionId);

  const [initialAuction, setInitialAuction] = useState<Auction | null>(null);
  const [initialBids, setInitialBids] = useState<AuctionBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Resetting to a fresh loading state when auctionId changes happens
  // during render (React's "adjusting state on prop change" pattern), not
  // inside the effect below — the effect's setState calls inside
  // then/catch/finally are the unavoidable, correct kind: they synchronize
  // with a genuine external system (the network), which is exactly what
  // useEffect is for.
  const [trackedAuctionId, setTrackedAuctionId] = useState(auctionId);
  if (trackedAuctionId !== auctionId) {
    setTrackedAuctionId(auctionId);
    setLoading(true);
    setLoadError(null);
    setInitialAuction(null);
    setInitialBids([]);
  }

  useEffect(() => {
    let cancelled = false;

    Promise.all([getAuction(auctionId), getAuctionBids(auctionId)])
      .then(([auctionData, bids]) => {
        if (cancelled) return;
        setInitialAuction(auctionData);
        setInitialBids(bids);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'Could not load this auction.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [auctionId]);

  // The WebSocket snapshot is authoritative and fresher once it arrives;
  // the REST fetch just gets something on screen before the socket
  // connects. Never the other way around — see docs/05-realtime.md.
  const auction = liveAuction ?? initialAuction;

  if (loading && !auction) {
    return <p className={styles.centered}>Loading auction…</p>;
  }

  if (loadError && !auction) {
    return (
      <p className={styles.centered} role="alert">
        {loadError}
      </p>
    );
  }

  if (!auction) {
    return (
      <p className={styles.centered} role="alert">
        Auction not found.
      </p>
    );
  }

  // Bid history rows: the REST fetch is a one-time snapshot taken at page
  // load; everything that's arrived live since then is prepended ahead of
  // it. There is a narrow theoretical race (a bid committing between the
  // REST fetch and the WebSocket subscribe ack) that could be missing from
  // this specific table, though the price/state above is always correct
  // either way since that comes from the authoritative snapshot, not this
  // list. Acceptable for this scope; a production version would re-fetch
  // history on every fresh snapshot instead.
  const rows: BidHistoryRow[] = [
    ...liveBids.map((bid) => ({
      bidId: bid.bidId,
      displayName: user && bid.userId === user.id ? 'You' : `bidder ${bid.userId.slice(0, 8)}`,
      amount: bid.amount,
      createdAt: bid.timestamp,
      isLive: true,
    })),
    ...initialBids.map((bid) => ({
      bidId: bid.bidId,
      displayName: user && bid.userId === user.id ? 'You' : bid.username,
      amount: bid.amount,
      createdAt: bid.createdAt,
    })),
  ];

  const priceHistory = [...initialBids]
    .reverse()
    .map((b) => b.amount)
    .concat(liveBids.map((b) => b.amount).reverse());

  const minNextBid = auction.currentPrice + auction.minIncrement;

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h1>{auction.title}</h1>
          {auction.description && <p className={styles.label}>{auction.description}</p>}
        </div>
        <ConnectionStatus state={connectionState} />
      </div>

      {auctionEnded && (
        <div className={styles.endedBanner} role="status">
          Auction ended — final price ${auctionEnded.finalPrice.toFixed(2)}
          {auctionEnded.winningBidId ? ' (a winning bid was recorded)' : ' (no bids were placed)'}
        </div>
      )}

      <div className={styles.layout}>
        <div>
          <div className={styles.priceBlock}>
            <div className={styles.priceRow}>
              <div>
                <div className={styles.label}>Current highest bid</div>
                <PriceDisplay amount={auction.currentPrice} size="large" />
              </div>
              <AuctionStatusBadge status={auction.status} />
            </div>
            {/* The "useful visual" for this page is real data — a price
                trend sparkline — rather than a decorative stock photo,
                per docs/06-design-system.md §10. */}
            <Sparkline values={priceHistory.length >= 2 ? priceHistory : [auction.startingPrice, auction.currentPrice]} />
            <div className={styles.metaRow}>
              <span>Minimum next bid: ${minNextBid.toFixed(2)}</span>
              {auction.status === 'active' && <CountdownTimer endsAt={auction.endsAt} />}
            </div>
          </div>

          <div className={styles.section}>
            <h2>Place a bid</h2>
            <BidForm auction={auction} userId={user?.id ?? null} />
          </div>
        </div>

        <div className={styles.section}>
          <h2>Live bid history</h2>
          <BidHistoryTable rows={rows} />
        </div>
      </div>
    </div>
  );
}
