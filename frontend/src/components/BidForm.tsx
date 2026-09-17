import { useState, type FormEvent } from 'react';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { placeBid } from '../api/auctions';
import { ApiError } from '../api/client';
import type { Auction } from '../api/types';
import styles from './BidForm.module.css';

interface BidFormProps {
  auction: Auction;
  userId: string | null;
}

type Feedback = { kind: 'success'; message: string } | { kind: 'rejected'; message: string } | null;

/**
 * Client-side validation here is a UX hint only — disabling an obviously
 * invalid submit and showing the minimum live — never the actual accept/
 * reject decision. That decision always comes back from the server (see
 * docs/03-bid-engine.md); this form shows exactly what the server said,
 * including its exact rejection message, never a generic one.
 */
export function BidForm({ auction, userId }: BidFormProps) {
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const minValid = auction.currentPrice + auction.minIncrement;

  if (auction.status !== 'active') {
    return <p className={styles.hint}>This auction is not accepting bids ({auction.status}).</p>;
  }

  if (!userId) {
    return <p className={styles.hint}>Log in to place a bid.</p>;
  }

  const numericAmount = Number(amount);
  const looksTooLow = amount !== '' && Number.isFinite(numericAmount) && numericAmount < minValid;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);

    if (!userId) return;
    setSubmitting(true);
    try {
      const result = await placeBid(auction.id, userId, numericAmount);
      setFeedback({ kind: 'success', message: `Bid accepted: $${result.amount.toFixed(2)}` });
      setAmount('');
      // No manual refresh needed: the caller is subscribed to this
      // auction's WebSocket feed, so the just-placed bid arrives back as
      // a normal bid_accepted event and updates the shared price/history
      // state on its own.
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not reach the server. Try again.';
      setFeedback({ kind: 'rejected', message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.row}>
        <Input
          label={`Bid amount (min $${minValid.toFixed(2)})`}
          type="number"
          step="0.01"
          mono
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={looksTooLow ? `Must be at least $${minValid.toFixed(2)}` : undefined}
          disabled={submitting}
          required
        />
        <Button type="submit" disabled={submitting || amount === ''}>
          {submitting ? 'Placing…' : 'Place Bid'}
        </Button>
      </div>
      {feedback && (
        <div
          className={[styles.feedback, feedback.kind === 'success' ? styles.success : styles.rejected].join(
            ' ',
          )}
          role="status"
        >
          {feedback.message}
        </div>
      )}
    </form>
  );
}
