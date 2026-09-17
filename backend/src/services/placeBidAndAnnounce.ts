import { placeBid, type PlacedBid } from './placeBid.js';
import { broadcast, broadcastAdmin } from '../ws/broadcaster.js';
import { recordBidAttempt } from '../metrics.js';

/**
 * The one place that wraps placeBid() with the two things every caller
 * needs identically: real latency/outcome recording for the admin
 * dashboard (metrics.ts) and broadcasting the result — only after
 * placeBid()'s promise has actually resolved, i.e. only after COMMIT —
 * to both the auction's room and the admin live stream. Used by the real
 * HTTP bid route (routes/auctions.ts) and by the demo simulator
 * (services/demo.ts) so a simulated bid is indistinguishable from a real
 * one on every dashboard/live view except its demo_bot_ username.
 */
export async function placeBidAndAnnounce(
  auctionId: string,
  userId: string,
  amount: number,
): Promise<PlacedBid> {
  const startedAt = performance.now();
  let result: PlacedBid;
  try {
    result = await placeBid(auctionId, userId, amount);
  } catch (err) {
    recordBidAttempt('rejected', performance.now() - startedAt);
    throw err;
  }
  recordBidAttempt('accepted', performance.now() - startedAt);

  const event = {
    type: 'bid_accepted' as const,
    auctionId,
    bidId: result.bidId,
    amount: result.amount,
    currentHighest: result.amount,
    userId,
    timestamp: new Date().toISOString(),
  };
  broadcast(auctionId, event);
  broadcastAdmin(event);

  return result;
}
