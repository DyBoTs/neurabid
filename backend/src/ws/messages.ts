import type { AuctionDTO } from '../services/getAuction.js';

/**
 * The full set of messages the server ever sends over a WebSocket. Kept in
 * one place so the wire contract is explicit and typed, not scattered as
 * ad-hoc object literals — see docs/05-realtime.md for the plain-English
 * meaning of each one.
 */

export interface SnapshotEvent {
  type: 'snapshot';
  auction: AuctionDTO;
}

/**
 * Sent to every subscriber of an auction the instant a bid on it commits —
 * never before. auctionId/bidId/amount/timestamp/currentHighest are all
 * required fields on this event by design, not incidental.
 */
export interface BidAcceptedEvent {
  type: 'bid_accepted';
  auctionId: string;
  bidId: string;
  amount: number;
  currentHighest: number;
  userId: string;
  timestamp: string;
}

export interface AuctionEndedEvent {
  type: 'auction_ended';
  auctionId: string;
  winningBidId: string | null;
  finalPrice: number;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
}

export type ServerEvent = SnapshotEvent | BidAcceptedEvent | AuctionEndedEvent | ErrorEvent;
