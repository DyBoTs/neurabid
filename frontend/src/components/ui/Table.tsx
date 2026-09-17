import type { ReactNode } from 'react';
import styles from './Table.module.css';

/**
 * A bounded, horizontally-scrolling wrapper so a dense table never breaks
 * the page layout on narrow viewports (docs/06-design-system.md §8),
 * rather than the table silently overflowing.
 */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>{children}</table>
    </div>
  );
}
