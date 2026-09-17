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

export interface User {
  id: string;
  username: string;
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
