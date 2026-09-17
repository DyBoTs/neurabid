import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import { createAuction } from '../api/auctions';
import { ApiError } from '../api/client';
import styles from './CreateAuction.module.css';

export function CreateAuctionPage() {
  const { user, sessionToken } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [minIncrement, setMinIncrement] = useState('1');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The frontend check below is a UX nicety only — the real boundary is
  // requireAdmin on the server (backend/src/middleware/requireAdmin.ts),
  // which rejects this same request regardless of what this page shows.
  if (!user || user.role !== 'admin' || !sessionToken) {
    return <p>Only admin accounts can create auctions. Log in as an admin to continue.</p>;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!sessionToken) return;
    setSubmitting(true);
    setError(null);
    try {
      const auction = await createAuction(
        {
          title,
          description: description || undefined,
          startingPrice: Number(startingPrice),
          minIncrement: Number(minIncrement),
          durationMinutes: Number(durationMinutes),
        },
        sessionToken,
      );
      navigate(`/auctions/${auction.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the auction.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h1>Create an auction</h1>
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
      <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <Input
        label="Starting price ($)"
        type="number"
        step="0.01"
        min="0.01"
        mono
        value={startingPrice}
        onChange={(e) => setStartingPrice(e.target.value)}
        required
      />
      <Input
        label="Minimum bid increment ($)"
        type="number"
        step="0.01"
        min="0.01"
        mono
        value={minIncrement}
        onChange={(e) => setMinIncrement(e.target.value)}
        required
      />
      <Input
        label="Duration (minutes)"
        type="number"
        min="1"
        max="10080"
        mono
        value={durationMinutes}
        onChange={(e) => setDurationMinutes(e.target.value)}
        required
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create Auction'}
      </Button>
    </form>
  );
}
