import { useEffect, useState } from 'react';
import styles from './PriceDisplay.module.css';

interface PriceDisplayProps {
  amount: number;
  size?: 'large' | 'base';
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Flashes green briefly on a genuine value change — never on first render,
 * never on a re-render with the same value, and never as a decorative
 * loop. See docs/06-design-system.md §9. Respects prefers-reduced-motion
 * by skipping the flash entirely, not just speeding up the transition.
 *
 * The "did the prop change" check happens directly during render (React's
 * documented "adjusting state when a prop changes" pattern), not inside an
 * effect — only the "turn the flash off after 400ms" part needs an effect,
 * since that's the part actually synchronizing with a real timer.
 */
export function PriceDisplay({ amount, size = 'base' }: PriceDisplayProps) {
  const [previousAmount, setPreviousAmount] = useState(amount);
  const [flashing, setFlashing] = useState(false);

  if (amount !== previousAmount) {
    setPreviousAmount(amount);
    if (!prefersReducedMotion()) {
      setFlashing(true);
    }
  }

  useEffect(() => {
    if (!flashing) return;
    const timer = setTimeout(() => setFlashing(false), 400);
    return () => clearTimeout(timer);
  }, [flashing]);

  const classes = [styles.price, size === 'large' ? styles.large : '', flashing ? styles.flash : '']
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} data-testid="price-display">
      ${amount.toFixed(2)}
    </span>
  );
}
