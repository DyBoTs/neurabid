import { Table } from './ui/Table';
import tableStyles from './ui/Table.module.css';

export interface BidHistoryRow {
  bidId: string;
  displayName: string;
  amount: number;
  createdAt: string;
  isLive?: boolean;
}

/**
 * Renders whatever rows it's given — the caller (LiveAuction page) is
 * responsible for merging the REST-fetched history with live WebSocket
 * events into one ordered list. New live rows get a brief highlight via
 * `isLive` (docs/06-design-system.md §8) — a real-event-triggered
 * animation, not a decorative one, and it only plays once per row because
 * React only mounts that row once.
 */
export function BidHistoryTable({ rows }: { rows: BidHistoryRow[] }) {
  if (rows.length === 0) {
    return <p>No bids yet — be the first.</p>;
  }

  return (
    <Table>
      <thead>
        <tr>
          <th>Bidder</th>
          <th>Amount</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.bidId} className={row.isLive ? tableStyles.newRow : undefined}>
            <td>{row.displayName}</td>
            <td className={tableStyles.numeric}>${row.amount.toFixed(2)}</td>
            <td className={tableStyles.numeric}>{new Date(row.createdAt).toLocaleTimeString()}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
