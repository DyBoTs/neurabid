import { pool } from '../db.js';

export interface CorrectnessViolation {
  auctionId: string;
  message: string;
}

export interface CorrectnessReport {
  checkedAuctions: number;
  violations: CorrectnessViolation[];
  checkedAt: string;
}

interface AuctionRow {
  id: string;
  current_price: string;
  min_increment: string;
  current_bid_id: string | null;
  starting_price: string;
}

interface BidRow {
  id: string;
  amount: string;
}

/**
 * Re-derives correctness independently from the raw database, for every
 * auction that has at least one bid, right now — this is what the Admin
 * Command Center's correctness status is actually based on (see
 * docs/07-admin-dashboard.md), not a hardcoded "verified" badge. It's the
 * same class of invariant backend/test/invariants.ts checks in tests,
 * reimplemented here as a plain function that returns a report instead of
 * throwing (a test failure and a runtime status page have different jobs:
 * one should stop a test suite, the other should keep serving a dashboard
 * and just report what it found).
 */
export async function verifyCorrectness(): Promise<CorrectnessReport> {
  const { rows: auctions } = await pool.query<AuctionRow>(
    `SELECT id, current_price, min_increment, current_bid_id, starting_price FROM auctions`,
  );

  const violations: CorrectnessViolation[] = [];
  let checkedAuctions = 0;

  for (const auction of auctions) {
    const { rows: bids } = await pool.query<BidRow>(
      `SELECT id, amount FROM bids WHERE auction_id = $1 ORDER BY created_at ASC`,
      [auction.id],
    );
    if (bids.length === 0) continue;
    checkedAuctions += 1;

    const minIncrement = Number(auction.min_increment);
    let previousAmount = Number(auction.starting_price);
    const amounts: number[] = [];

    for (const bid of bids) {
      const amount = Number(bid.amount);
      amounts.push(amount);
      if (amount < previousAmount + minIncrement) {
        violations.push({
          auctionId: auction.id,
          message: `bid ${bid.id} ($${amount}) is below previous ($${previousAmount}) + min_increment ($${minIncrement})`,
        });
      }
      previousAmount = amount;
    }

    if (new Set(amounts).size !== amounts.length) {
      violations.push({ auctionId: auction.id, message: 'two bids for this auction share an amount' });
    }

    const highestBid = bids[bids.length - 1];
    if (Number(auction.current_price) !== Number(highestBid.amount)) {
      violations.push({
        auctionId: auction.id,
        message: 'current_price does not match the highest actual bid',
      });
    }
    if (auction.current_bid_id !== highestBid.id) {
      violations.push({
        auctionId: auction.id,
        message: 'current_bid_id does not point at the highest bid',
      });
    }
  }

  return { checkedAuctions, violations, checkedAt: new Date().toISOString() };
}
