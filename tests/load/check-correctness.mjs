#!/usr/bin/env node
/**
 * The "database correctness checker" required after every significant
 * k6 run. It does not compute anything itself — it calls the real
 * GET /api/admin/dashboard endpoint, which re-derives correctness
 * directly from Postgres via backend/src/services/verifyCorrectness.ts
 * (see docs/07-admin-dashboard.md §6). This script's only job is to
 * fetch that real result and report it plainly, exiting non-zero if a
 * violation was actually found — never fabricating a "PASS".
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

const res = await fetch(`${BASE_URL}/api/admin/dashboard`);
if (!res.ok) {
  console.error(`Could not reach ${BASE_URL}/api/admin/dashboard (HTTP ${res.status})`);
  process.exit(1);
}

const data = await res.json();
const { correctness, auctionOverview, performance, health } = data;

console.log('--- Database correctness check (real, live re-verification) ---');
console.log(`Status:            ${correctness.status}`);
console.log(`Auctions checked:  ${correctness.checkedAuctions}`);
console.log(`Violations found:  ${correctness.violations.length}`);
if (correctness.violations.length > 0) {
  for (const v of correctness.violations) {
    console.log(`  - auction ${v.auctionId}: ${v.message}`);
  }
}
console.log('--- Supporting context ---');
console.log(`Active auctions:      ${auctionOverview.activeAuctions}`);
console.log(
  `Current highest bid:  ${auctionOverview.currentHighestBid ? '$' + auctionOverview.currentHighestBid.amount.toFixed(2) : 'none'}`,
);
console.log(
  `Total bid attempts:   ${performance.totalBidAttempts} (accepted ${performance.acceptedBids}, rejected ${performance.rejectedBids})`,
);
console.log(`DB health: ${health.db}   Redis health: ${health.redis}`);

if (correctness.status === 'violations_found') {
  console.error('\nFAILED: real correctness violations were found. Do not report this run as passing.');
  process.exit(1);
}

console.log(`\n${correctness.status === 'verified' ? 'PASSED' : 'OK'}: no correctness violations found.`);
