import { apiRequest } from './client';
import type { User, UserBid } from './types';

export function loginOrRegister(username: string): Promise<User> {
  return apiRequest<User>('/api/users', { method: 'POST', body: { username } });
}

export function getUserBids(userId: string): Promise<UserBid[]> {
  return apiRequest<UserBid[]>(`/api/users/${userId}/bids`);
}
