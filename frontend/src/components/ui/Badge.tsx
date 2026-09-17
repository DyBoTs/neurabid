import type { ReactNode } from 'react';
import styles from './Badge.module.css';
import { ClockIcon, DotIcon, StopIcon } from './icons';

type Tone = 'positive' | 'negative' | 'warning' | 'neutral';

interface BadgeProps {
  tone: Tone;
  icon?: ReactNode;
  children: ReactNode;
}

/** Never color-alone: every badge pairs a tone with an icon and a text label. */
export function Badge({ tone, icon, children }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[tone]].join(' ')}>
      {icon}
      {children}
    </span>
  );
}

type AuctionStatus = 'scheduled' | 'active' | 'ended';

const AUCTION_STATUS_CONFIG: Record<AuctionStatus, { tone: Tone; icon: ReactNode; label: string }> = {
  scheduled: { tone: 'neutral', icon: <ClockIcon />, label: 'Scheduled' },
  active: { tone: 'positive', icon: <DotIcon />, label: 'Active' },
  ended: { tone: 'negative', icon: <StopIcon />, label: 'Ended' },
};

export function AuctionStatusBadge({ status }: { status: string }) {
  const config = AUCTION_STATUS_CONFIG[status as AuctionStatus] ?? AUCTION_STATUS_CONFIG.scheduled;
  return (
    <Badge tone={config.tone} icon={config.icon}>
      {config.label}
    </Badge>
  );
}
