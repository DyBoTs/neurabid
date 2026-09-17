import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { getDemoAuction, resetDemoAuction, simulateConcurrentBids } from '../api/demo';
import { ApiError } from '../api/client';
import type { Auction, SimulationResult } from '../api/types';
import styles from './DemoControls.module.css';

/**
 * Every action here triggers a REAL reset (real DELETE/UPDATE) or REAL
 * concurrent placeBid() calls (via the shared placeBidAndAnnounce() —
 * see backend/src/services/demo.ts) — nothing is mocked. The
 * SIMULATED label exists because the *traffic* is bot-generated on
 * demand rather than from real bidders, not because the result is fake.
 * See docs/09-demo-runbook.md.
 */
export function DemoControls() {
  const [auction, setAuction] = useState<Auction | null>(null);
  const [count, setCount] = useState('5');
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDemoAuction()
      .then(({ auction: existing }) => setAuction(existing))
      .catch(() => {
        /* no demo auction yet — the Reset button will create one */
      });
  }, []);

  async function handleReset() {
    setBusy(true);
    setError(null);
    setLastResult(null);
    try {
      const { auction: resetAuction } = await resetDemoAuction();
      setAuction(resetAuction);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reset the demo auction.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSimulate() {
    if (!auction) return;
    setBusy(true);
    setError(null);
    try {
      const result = await simulateConcurrentBids(Number(count));
      setLastResult(result);
      const { auction: refreshed } = await getDemoAuction();
      setAuction(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not run the simulation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className={styles.simulatedLabel}>Simulated / load-generated traffic only below this line</p>

      <div className={styles.row}>
        <Button onClick={handleReset} disabled={busy} variant="secondary">
          Reset Demo Auction
        </Button>

        <Input
          label="Concurrent bots"
          type="number"
          min="1"
          max="200"
          className={styles.countInput}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          disabled={busy}
        />
        <Button onClick={handleSimulate} disabled={busy || !auction}>
          {busy ? 'Running…' : 'Simulate Concurrent Bids'}
        </Button>
      </div>

      {error && (
        <p className={styles.feedback} role="alert">
          {error}
        </p>
      )}

      {auction && (
        <Link className={styles.auctionLink} to={`/auctions/${auction.id}`}>
          View demo auction: {auction.title} (currently ${auction.currentPrice.toFixed(2)})
        </Link>
      )}

      {lastResult && (
        <div className={styles.feedback} role="status">
          Requested {lastResult.requested} concurrent bids at the same amount — {lastResult.accepted}{' '}
          accepted, {lastResult.rejected} rejected (only one can win a real race on one row).
        </div>
      )}
    </div>
  );
}
