import type { ReactNode } from 'react';
import styles from './ConnectionStatus.module.css';
import { DotIcon, SlashedDotIcon, SpinnerIcon } from './icons';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

const CONFIG: Record<ConnectionState, { icon: ReactNode; text: string; className: string }> = {
  connecting: { icon: <DotIcon />, text: 'Connecting…', className: 'connecting' },
  connected: { icon: <DotIcon />, text: 'Live', className: 'connected' },
  reconnecting: {
    icon: <SpinnerIcon className={styles.spin} />,
    text: 'Reconnecting…',
    className: 'reconnecting',
  },
  disconnected: { icon: <SlashedDotIcon />, text: 'Disconnected', className: 'disconnected' },
};

/**
 * The most important non-price element on the Live Auction page (see
 * docs/06-design-system.md §12): a user must always be able to tell, at a
 * glance, whether what they're looking at is live. role="status" announces
 * one complete, atomic sentence per transition — never a bare state value.
 */
export function ConnectionStatus({ state }: { state: ConnectionState }) {
  const config = CONFIG[state];
  return (
    <span
      className={[styles.status, styles[config.className]].join(' ')}
      role="status"
      aria-live="polite"
    >
      {config.icon}
      {config.text}
    </span>
  );
}
