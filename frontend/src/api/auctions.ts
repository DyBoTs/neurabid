import { apiRequest } from './client';
import type { Auction, AuctionBid, PlacedBid } from './types';

export function listAuctions(): Promise<Auction[]> {
  return apiRequest<Auction[]>('/api/auctions');
}

export function getAuction(id: string): Promise<Auction> {
  return apiRequest<Auction>(`/api/auctions/${id}`);
}

export function getAuctionBids(id: string): Promise<AuctionBid[]> {
  return apiRequest<AuctionBid[]>(`/api/auctions/${id}/bids`);
}

export interface CreateAuctionInput {
  title: string;
  description?: string;
  startingPrice: number;
  minIncrement: number;
  durationMinutes: number;
}

export function createAuction(input: CreateAuctionInput): Promise<Auction> {
  return apiRequest<Auction>('/api/auctions', { method: 'POST', body: input });
}

export function placeBid(auctionId: string, userId: string, amount: number): Promise<PlacedBid> {
  return apiRequest<PlacedBid>(`/api/auctions/${auctionId}/bids`, {
    method: 'POST',
    body: { amount },
    userId,
  });
}
