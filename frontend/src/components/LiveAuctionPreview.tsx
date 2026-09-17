import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './ui/Button';
import { ConnectionStatus } from './ui/ConnectionStatus';
import { PriceDisplay } from './ui/PriceDisplay';
import { CountdownTimer } from './CountdownTimer';
import { BidHistoryTable, type BidHistoryRow } from './BidHistoryTable';
import { useAuctionSocket } from '../hooks/useAuctionSocket';
import { useAuth } from '../hooks/useAuth';
import { listAuctions, getAuctionBids } from '../api/auctions';
import type { Auction, AuctionBid } from '../api/types';
import styles from './LiveAuctionPreview.module.css';

/**
 * The hero's right-side panel is not a mockup: it's the same PriceDisplay,
 * CountdownTimer, ConnectionStatus, and BidHistoryTable components the real
 * auction page uses, pointed at whichever real auction is currently most
 * active. Nothing shown here is a fabricated number — if no auction is
 * live, this says so instead of inventing one (docs/06-design-system.md's
 * anti-slop rule applies to marketing surfaces too).
 */
export function LiveAuctionPreview() {
  const [auctions, setAuctions] = useState<Auction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAuctions()
      .then((data) => {
        if (!cancelled) setAuctions(data);
      })
      .catch(() => {
        if (!cancelled) setError('Live preview is unavailable right now.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className={styles.panel}>
        <p className={styles.status} role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!auctions) {
    return (
      <div className={styles.panel}>
        <p className={styles.status}>Loading live auction…</p>
      </div>
    );
  }

  const featured = auctions
    .filter((a) => a.status === 'active')
    .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())[0];

  if (!featured) {
    return (
      <div className={styles.panel}>
        <p className={styles.status}>No live auctions right now — check the marketplace for what's next.</p>
        <Link to="/marketplace">
          <Button variant="secondary">Browse Marketplace</Button>
        </Link>
      </div>
    );
  }

  return <PreviewPanel initial={featured} />;
}

function PreviewPanel({ initial }: { initial: Auction }) {
  const { user } = useAuth();
  const { connectionState, auction: liveAuction, liveBids } = useAuctionSocket(initial.id);
  const [initialBids, setInitialBids] = useState<AuctionBid[]>([]);

  useEffect(() => {
    let cancelled = false;
    getAuctionBids(initial.id)
      .then((bids) => {
        if (!cancelled) setInitialBids(bids);
      })
      .catch(() => {
        /* the panel still works with zero prior bids shown */
      });
    return () => {
      cancelled = true;
    };
  }, [initial.id]);

  const auction = liveAuction ?? initial;
  const minNextBid = auction.currentPrice + auction.minIncrement;

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
  ].slice(0, 3);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.eyebrow}>Live Auction Preview</span>
        <ConnectionStatus state={connectionState} />
      </div>

      <h3 className={styles.title}>{auction.title}</h3>

      <div className={styles.priceRow}>
        <div>
          <div className={styles.label}>Current bid</div>
          <PriceDisplay amount={auction.currentPrice} size="large" />
        </div>
        <div className={styles.timeBlock}>
          <div className={styles.label}>Time left</div>
          {auction.status === 'active' ? <CountdownTimer endsAt={auction.endsAt} /> : <span>Ended</span>}
        </div>
      </div>

      <div className={styles.nextBid}>Next bid: ${minNextBid.toFixed(2)}</div>

      <Link to={`/auctions/${auction.id}`} className={styles.ctaLink}>
        <Button className={styles.ctaButton}>Place a Bid</Button>
      </Link>

      <div className={styles.activity}>
        <div className={styles.label}>Live activity</div>
        <BidHistoryTable rows={rows} />
      </div>
    </div>
  );
}
