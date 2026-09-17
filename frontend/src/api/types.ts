/** Mirrors backend/src/services/getAuction.ts's AuctionDTO exactly. */
export interface Auction {
  id: string;
  title: string;
  description: string | null;
  startingPrice: number;
  currentPrice: number;
  minIncrement: number;
  status: 'scheduled' | 'active' | 'ended';
  startsAt: string;
  endsAt: string;
  currentBidId: string | null;
}

export type Role = 'user' | 'admin';

export interface User {
  id: string;
  username: string;
  role: Role;
}

export interface PlacedBid {
  bidId: string;
  auctionId: string;
  amount: number;
}

export interface AuctionBid {
  bidId: string;
  userId: string;
  username: string;
  amount: number;
  createdAt: string;
}

export interface UserBid {
  bidId: string;
  auctionId: string;
  auctionTitle: string;
  amount: number;
  createdAt: string;
  isWinning: boolean;
}

/** Mirrors GET /api/admin/dashboard's response shape exactly. */
export interface AdminDashboard {
  health: {
    api: 'ok';
    db: 'ok' | 'error';
    redis: 'ok' | 'error';
    websocket: { status: 'ok'; connections: number };
  };
  auctionOverview: {
    activeAuctions: number;
    currentHighestBid: { auctionId: string; title: string; amount: number } | null;
  };
  performance: {
    totalBidAttempts: number;
    acceptedBids: number;
    rejectedBids: number;
    bidsPerSecond: number | null;
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
    p99LatencyMs: number | null;
  };
  correctness: {
    status: 'verified' | 'violations_found' | 'not_measured_yet';
    checkedAuctions: number;
    violations: { auctionId: string; message: string }[];
    checkedAt: string;
  };
}

export interface SimulationResult {
  requested: number;
  accepted: number;
  rejected: number;
  results: { userId: string; status: 'accepted' | 'rejected'; amount: number; message?: string }[];
}

/** Mirrors backend/src/ws/messages.ts's ServerEvent union exactly. */
export type ServerEvent =
  | { type: 'snapshot'; auction: Auction }
  | {
      type: 'bid_accepted';
      auctionId: string;
      bidId: string;
      amount: number;
      currentHighest: number;
      userId: string;
      timestamp: string;
    }
  | { type: 'auction_ended'; auctionId: string; winningBidId: string | null; finalPrice: number }
  | { type: 'error'; message: string };
