/**
 * In-memory, process-lifetime metrics for the admin dashboard. Nothing
 * here is estimated or hardcoded — every number is derived from real bid
 * attempts that actually happened since this process started. If the
 * process restarts, history resets; that's an accepted, documented
 * limitation for a hackathon-scope dashboard, not a hidden gap (see
 * docs/07-admin-dashboard.md).
 */

interface LatencySample {
  ms: number;
  at: number;
}

const MAX_SAMPLES = 2000;
const RATE_WINDOW_MS = 10_000;

const samples: LatencySample[] = [];
let acceptedBids = 0;
let rejectedBids = 0;

export function recordBidAttempt(outcome: 'accepted' | 'rejected', durationMs: number): void {
  if (outcome === 'accepted') acceptedBids += 1;
  else rejectedBids += 1;

  samples.push({ ms: durationMs, at: Date.now() });
  if (samples.length > MAX_SAMPLES) samples.shift();
}

function percentile(sortedMs: number[], p: number): number {
  const index = Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length));
  return sortedMs[index];
}

export interface MetricsSnapshot {
  totalBidAttempts: number;
  acceptedBids: number;
  rejectedBids: number;
  /** null means "no bids recorded yet" — never fabricated as 0. */
  bidsPerSecond: number | null;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
}

export function getMetricsSnapshot(): MetricsSnapshot {
  if (samples.length === 0) {
    return {
      totalBidAttempts: 0,
      acceptedBids: 0,
      rejectedBids: 0,
      bidsPerSecond: null,
      avgLatencyMs: null,
      p95LatencyMs: null,
      p99LatencyMs: null,
    };
  }

  const now = Date.now();
  const recentCount = samples.filter((s) => now - s.at <= RATE_WINDOW_MS).length;
  const sortedMs = samples.map((s) => s.ms).sort((a, b) => a - b);
  const avg = sortedMs.reduce((sum, ms) => sum + ms, 0) / sortedMs.length;

  return {
    totalBidAttempts: acceptedBids + rejectedBids,
    acceptedBids,
    rejectedBids,
    bidsPerSecond: recentCount / (RATE_WINDOW_MS / 1000),
    avgLatencyMs: avg,
    p95LatencyMs: percentile(sortedMs, 95),
    p99LatencyMs: percentile(sortedMs, 99),
  };
}
