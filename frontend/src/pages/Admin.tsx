import { useEffect, useState } from 'react';
import { Badge } from '../components/ui/Badge';
import { ConnectionStatus } from '../components/ui/ConnectionStatus';
import { Table } from '../components/ui/Table';
import tableStyles from '../components/ui/Table.module.css';
import { useAdminBidStream } from '../hooks/useAdminBidStream';
import { DemoControls } from '../components/DemoControls';
import { AuctionManagement } from '../components/AuctionManagement';
import { useAuth } from '../hooks/useAuth';
import { getAdminDashboard } from '../api/admin';
import type { AdminDashboard } from '../api/types';
import styles from './Admin.module.css';

const POLL_INTERVAL_MS = 3000;

function Stat({ label, value }: { label: string; value: string }) {
  const notMeasured = value === 'Not measured yet';
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={notMeasured ? styles.statValueMuted : styles.statValue}>{value}</span>
    </div>
  );
}

function formatMs(value: number | null): string {
  return value === null ? 'Not measured yet' : `${value.toFixed(1)}ms`;
}

function formatRate(value: number | null): string {
  return value === null ? 'Not measured yet' : `${value.toFixed(2)}/sec`;
}

function HealthBadge({ status }: { status: 'ok' | 'error' }) {
  return status === 'ok' ? (
    <Badge tone="positive">OK</Badge>
  ) : (
    <Badge tone="negative">ERROR</Badge>
  );
}

/**
 * The main presentation screen (docs/07-admin-dashboard.md). Every number
 * here is either a real, live measurement (polled from the database and
 * from this process's own real request history) or explicitly "Not
 * measured yet" — never a fabricated zero. The live bid stream section is
 * WebSocket-driven, not polled, so it's genuinely real-time during a load
 * test, matching the rest of the dashboard's polling cadence for
 * everything else.
 */
export function AdminPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { connectionState: streamConnectionState, entries: liveBids } = useAdminBidStream();

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await getAdminDashboard();
        if (cancelled) return;
        setDashboard(data);
        setLastUpdated(new Date());
        setError(null);
      } catch {
        if (!cancelled) setError('Could not reach the admin dashboard endpoint.');
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (error && !dashboard) {
    return (
      <p role="alert">
        {error}
      </p>
    );
  }

  if (!dashboard) {
    return <p>Loading dashboard…</p>;
  }

  const { health, auctionOverview, performance, correctness } = dashboard;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1>NEURABID — ADMIN COMMAND CENTER</h1>
        {lastUpdated && (
          <span className={styles.updatedAt}>Updated {lastUpdated.toLocaleTimeString()}</span>
        )}
      </div>

      {user?.role === 'admin' && (
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Auction Management</div>
          <AuctionManagement />
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionTitle}>Demo Controls</div>
        <DemoControls />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>System Health</div>
        <div className={styles.healthGrid}>
          <div className={styles.healthItem}>
            <span>API</span>
            <HealthBadge status={health.api} />
          </div>
          <div className={styles.healthItem}>
            <span>PostgreSQL</span>
            <HealthBadge status={health.db} />
          </div>
          <div className={styles.healthItem}>
            <span>Redis</span>
            <HealthBadge status={health.redis} />
          </div>
          <div className={styles.healthItem}>
            <span>WebSocket ({health.websocket.connections} connected)</span>
            <HealthBadge status={health.websocket.status} />
          </div>
        </div>
      </section>

      <div className={styles.sectionGrid}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Auction Overview</div>
          <div className={styles.statGrid}>
            <Stat label="Active auctions" value={String(auctionOverview.activeAuctions)} />
            <Stat
              label="Current highest bid"
              value={
                auctionOverview.currentHighestBid
                  ? `$${auctionOverview.currentHighestBid.amount.toFixed(2)}`
                  : 'Not measured yet'
              }
            />
          </div>
          {auctionOverview.currentHighestBid && (
            <p className={styles.updatedAt}>{auctionOverview.currentHighestBid.title}</p>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Concurrency / Correctness</div>
          <div className={styles.statGrid}>
            <Stat
              label="Status"
              value={
                correctness.status === 'verified'
                  ? 'VERIFIED'
                  : correctness.status === 'violations_found'
                    ? 'VIOLATIONS FOUND'
                    : 'Not measured yet'
              }
            />
            <Stat label="Auctions checked" value={String(correctness.checkedAuctions)} />
          </div>
          {correctness.violations.length > 0 && (
            <ul className={styles.violationList}>
              {correctness.violations.map((v, i) => (
                <li key={i}>
                  Auction {v.auctionId.slice(0, 8)}: {v.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Performance</div>
          <div className={styles.statGrid}>
            <Stat label="Total bid attempts" value={String(performance.totalBidAttempts)} />
            <Stat label="Accepted" value={String(performance.acceptedBids)} />
            <Stat label="Rejected" value={String(performance.rejectedBids)} />
            <Stat label="Bids/sec" value={formatRate(performance.bidsPerSecond)} />
            <Stat label="Avg latency" value={formatMs(performance.avgLatencyMs)} />
            <Stat label="p95 latency" value={formatMs(performance.p95LatencyMs)} />
            <Stat label="p99 latency" value={formatMs(performance.p99LatencyMs)} />
          </div>
        </section>

        <section className={[styles.section, styles.streamSection].join(' ')}>
          <div className={styles.streamHeader}>
            <div className={styles.sectionTitle}>Live Bid Stream</div>
            <ConnectionStatus state={streamConnectionState} />
          </div>
          {liveBids.length === 0 ? (
            <p className={styles.empty}>No bids observed yet this session.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Auction</th>
                  <th>Bidder</th>
                  <th>Amount</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {liveBids.map((entry, i) => (
                  <tr key={entry.key} className={i === 0 ? tableStyles.newRow : undefined}>
                    <td>{entry.auctionId.slice(0, 8)}</td>
                    <td>{entry.userId.slice(0, 8)}</td>
                    <td className={tableStyles.numeric}>${entry.amount.toFixed(2)}</td>
                    <td className={tableStyles.numeric}>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </div>
  );
}
