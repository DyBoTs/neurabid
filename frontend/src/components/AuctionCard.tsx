import { Link } from 'react-router-dom';
import { AuctionStatusBadge } from './ui/Badge';
import { PriceDisplay } from './ui/PriceDisplay';
import { CountdownTimer } from './CountdownTimer';
import type { Auction } from '../api/types';
import styles from './AuctionCard.module.css';

export function AuctionCard({ auction }: { auction: Auction }) {
  return (
    <Link to={`/auctions/${auction.id}`} className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>{auction.title}</span>
        <AuctionStatusBadge status={auction.status} />
      </div>
      <div className={styles.priceRow}>
        <span>
          Current: <PriceDisplay amount={auction.currentPrice} />
        </span>
        {auction.status === 'active' && <CountdownTimer endsAt={auction.endsAt} />}
      </div>
    </Link>
  );
}
