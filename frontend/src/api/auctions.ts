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

export function createAuction(input: CreateAuctionInput, sessionToken: string): Promise<Auction> {
  return apiRequest<Auction>('/api/auctions', { method: 'POST', body: input, sessionToken });
}

export interface UpdateAuctionInput {
  title?: string;
  description?: string;
  durationMinutes?: number;
}

/** Never accepts price fields — see backend/src/services/getAuction.ts's UpdateAuctionInput comment for why. */
export function updateAuction(
  auctionId: string,
  input: UpdateAuctionInput,
  sessionToken: string,
): Promise<Auction> {
  return apiRequest<Auction>(`/api/auctions/${auctionId}`, { method: 'PATCH', body: input, sessionToken });
}

export function endAuction(auctionId: string, sessionToken: string): Promise<Auction> {
  return apiRequest<Auction>(`/api/auctions/${auctionId}/end`, { method: 'POST', sessionToken });
}

export function placeBid(auctionId: string, userId: string, amount: number): Promise<PlacedBid> {
  return apiRequest<PlacedBid>(`/api/auctions/${auctionId}/bids`, {
    method: 'POST',
    body: { amount },
    userId,
  });
}
