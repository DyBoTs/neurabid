import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import styles from './Landing.module.css';

/**
 * No fabricated stats or marketing copy here (per the project's anti-slop
 * rules) — every claim below is a real, verifiable property of the system
 * built in earlier phases (docs/03/04/05), not a placeholder.
 */
export function LandingPage() {
  return (
    <div className={styles.hero}>
      <h1>NeuraBid</h1>
      <p>
        A real-time auction platform where PostgreSQL — not the client, not a cache — decides whether a
        bid wins. Built to prove that under concurrent bidding, the highest valid bid always wins, exactly
        once, with no lost updates.
      </p>
      <div className={styles.actions}>
        <Link to="/marketplace">
          <Button>Browse Auctions</Button>
        </Link>
        <Link to="/create">
          <Button variant="secondary">Create an Auction</Button>
        </Link>
      </div>

      <div className={styles.facts}>
        <div className={styles.fact}>
          <h3>Locking, not luck</h3>
          <p>
            Every bid runs inside a database transaction that locks the auction row before validating it —
            see docs/03-bid-engine.md.
          </p>
        </div>
        <div className={styles.fact}>
          <h3>Live, not polled</h3>
          <p>
            Accepted bids broadcast over WebSocket the instant they commit — never before. See
            docs/05-realtime.md.
          </p>
        </div>
        <div className={styles.fact}>
          <h3>Tested under real load</h3>
          <p>
            Concurrency correctness is verified with automated tests that fire dozens of simultaneous bids
            and check the database directly — see docs/04-concurrency-testing.md.
          </p>
        </div>
      </div>
    </div>
  );
}
