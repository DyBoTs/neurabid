import { apiRequest } from './client';
import type { Auction, SimulationResult } from './types';

export function getDemoAuction(): Promise<{ auction: Auction | null }> {
  return apiRequest<{ auction: Auction | null }>('/api/admin/demo/auction');
}

export function resetDemoAuction(): Promise<{ auction: Auction }> {
  return apiRequest<{ auction: Auction }>('/api/admin/demo/reset', { method: 'POST' });
}

export function simulateConcurrentBids(count: number): Promise<SimulationResult> {
  return apiRequest<SimulationResult>('/api/admin/demo/simulate', {
    method: 'POST',
    body: { count },
  });
}
