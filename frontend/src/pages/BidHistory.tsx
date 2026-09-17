import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Table } from '../components/ui/Table';
import tableStyles from '../components/ui/Table.module.css';
import { useAuth } from '../hooks/useAuth';
import { getUserBids } from '../api/users';
import { ApiError } from '../api/client';
import type { UserBid } from '../api/types';

export function BidHistoryPage() {
  const { user } = useAuth();
  const [bids, setBids] = useState<UserBid[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getUserBids(user.id)
      .then((data) => {
        if (!cancelled) setBids(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not load your bid history.');
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    return <p>Log in to see your bid history.</p>;
  }

  if (error) {
    return (
      <p role="alert">
        {error}
      </p>
    );
  }

  if (!bids) {
    return <p>Loading your bids…</p>;
  }

  if (bids.length === 0) {
    return <p>You haven't placed any bids yet.</p>;
  }

  return (
    <div>
      <h1>My bids</h1>
      <Table>
        <thead>
          <tr>
            <th>Auction</th>
            <th>Amount</th>
            <th>Placed</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {bids.map((bid) => (
            <tr key={bid.bidId}>
              <td>
                <Link to={`/auctions/${bid.auctionId}`}>{bid.auctionTitle}</Link>
              </td>
              <td className={tableStyles.numeric}>${bid.amount.toFixed(2)}</td>
              <td className={tableStyles.numeric}>{new Date(bid.createdAt).toLocaleString()}</td>
              <td>{bid.isWinning ? 'Winning' : 'Outbid'}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
