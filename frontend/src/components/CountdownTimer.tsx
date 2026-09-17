import { useEffect, useState } from 'react';
import styles from './CountdownTimer.module.css';

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Ticks locally against a real endsAt timestamp from the server — never a
 * client-invented duration. Turns amber under 60s (docs/06-design-system.md
 * §5's "ending soon" warning state) and reads "Ended" once the deadline
 * passes, though the actual authority on whether bids are still accepted
 * is always the server (placeBid/the auction-end sweep), not this clock.
 */
export function CountdownTimer({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = new Date(endsAt).getTime() - now;
  const endingSoon = remainingMs > 0 && remainingMs < 60_000;
  const ended = remainingMs <= 0;

  return (
    <span
      className={[styles.timer, endingSoon ? styles.endingSoon : '', ended ? styles.ended : '']
        .filter(Boolean)
        .join(' ')}
    >
      {ended ? 'Ended' : formatRemaining(remainingMs)}
    </span>
  );
}
