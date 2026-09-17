import { useEffect, useState } from 'react';
import { AuctionCard } from '../components/AuctionCard';
import { listAuctions } from '../api/auctions';
import { ApiError } from '../api/client';
import type { Auction } from '../api/types';
import styles from './Marketplace.module.css';

export function MarketplacePage() {
  const [auctions, setAuctions] = useState<Auction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAuctions()
      .then((data) => {
        if (!cancelled) setAuctions(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load auctions.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className={styles.centered} role="alert">
        {error}
      </p>
    );
  }

  if (!auctions) {
    return <p className={styles.centered}>Loading auctions…</p>;
  }

  if (auctions.length === 0) {
    return <p className={styles.centered}>No auctions yet — create one to get started.</p>;
  }

  return (
    <div className={styles.grid}>
      {auctions.map((auction) => (
        <AuctionCard key={auction.id} auction={auction} />
      ))}
    </div>
  );
}
