import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuctionStatusBadge } from './ui/Badge';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { Table } from './ui/Table';
import tableStyles from './ui/Table.module.css';
import { useAuth } from '../hooks/useAuth';
import { listAuctions, updateAuction, endAuction } from '../api/auctions';
import { ApiError } from '../api/client';
import type { Auction } from '../api/types';
import styles from './AuctionManagement.module.css';

interface EditState {
  title: string;
  description: string;
  durationMinutes: string;
}

/**
 * Only ever rendered when the logged-in user's role is 'admin' (see
 * pages/Admin.tsx) — but that check is a UX nicety, not the real boundary.
 * Every request this component makes still goes through requireAdmin on
 * the server (backend/src/middleware/requireAdmin.ts) with the real
 * session token, so it stays safe even if someone bypassed the UI check
 * entirely.
 */
export function AuctionManagement() {
  const { sessionToken } = useAuth();
  const [auctions, setAuctions] = useState<Auction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({ title: '', description: '', durationMinutes: '' });
  const [pendingStopId, setPendingStopId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function refresh() {
    try {
      setAuctions(await listAuctions());
      setError(null);
    } catch {
      setError('Could not load auctions.');
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function startEdit(auction: Auction) {
    setActionError(null);
    setEditingId(auction.id);
    setEdit({ title: auction.title, description: auction.description ?? '', durationMinutes: '' });
  }

  async function saveEdit(auctionId: string) {
    if (!sessionToken) return;
    setBusy(true);
    setActionError(null);
    try {
      await updateAuction(
        auctionId,
        {
          title: edit.title,
          description: edit.description,
          durationMinutes: edit.durationMinutes ? Number(edit.durationMinutes) : undefined,
        },
        sessionToken,
      );
      setEditingId(null);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not update the auction.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmStop() {
    if (!sessionToken || !pendingStopId) return;
    setBusy(true);
    setActionError(null);
    try {
      await endAuction(pendingStopId, sessionToken);
      setPendingStopId(null);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not stop the auction.');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <p role="alert" className={styles.error}>
        {error}
      </p>
    );
  }

  if (!auctions) {
    return <p>Loading auctions…</p>;
  }

  const stoppingAuction = auctions.find((a) => a.id === pendingStopId);

  return (
    <div>
      {actionError && (
        <p role="alert" className={styles.error}>
          {actionError}
        </p>
      )}
      <Table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th>Current price</th>
            <th>Ends</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {auctions.map((auction) => (
            <Fragment key={auction.id}>
              <tr>
                <td>
                  <Link to={`/auctions/${auction.id}`}>{auction.title}</Link>
                </td>
                <td>
                  <AuctionStatusBadge status={auction.status} />
                </td>
                <td className={tableStyles.numeric}>${auction.currentPrice.toFixed(2)}</td>
                <td className={tableStyles.numeric}>{new Date(auction.endsAt).toLocaleString()}</td>
                <td>
                  <div className={styles.rowActions}>
                    <Button variant="secondary" onClick={() => startEdit(auction)} disabled={busy}>
                      Edit
                    </Button>
                    {auction.status === 'active' && (
                      <Button
                        variant="destructive"
                        onClick={() => setPendingStopId(auction.id)}
                        disabled={busy}
                      >
                        Stop
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
              {editingId === auction.id && (
                <tr>
                  <td colSpan={5}>
                    <div className={styles.editForm}>
                      <Input
                        label="Title"
                        value={edit.title}
                        onChange={(e) => setEdit((s) => ({ ...s, title: e.target.value }))}
                        minLength={3}
                        maxLength={200}
                      />
                      <Input
                        label="Description"
                        value={edit.description}
                        onChange={(e) => setEdit((s) => ({ ...s, description: e.target.value }))}
                      />
                      <Input
                        label="New duration from now (minutes, optional)"
                        type="number"
                        min="1"
                        max="10080"
                        mono
                        value={edit.durationMinutes}
                        onChange={(e) => setEdit((s) => ({ ...s, durationMinutes: e.target.value }))}
                      />
                      <div className={styles.rowActions}>
                        <Button onClick={() => saveEdit(auction.id)} disabled={busy}>
                          {busy ? 'Saving…' : 'Save'}
                        </Button>
                        <Button variant="secondary" onClick={() => setEditingId(null)} disabled={busy}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </Table>

      <Modal open={pendingStopId !== null} onClose={() => setPendingStopId(null)} title="Stop this auction?">
        <p className={styles.confirmText}>
          Stop <strong>{stoppingAuction?.title}</strong> right now at its current price of $
          {stoppingAuction?.currentPrice.toFixed(2)}? This ends bidding immediately and cannot be undone.
        </p>
        <div className={styles.rowActions}>
          <Button variant="destructive" onClick={confirmStop} disabled={busy}>
            {busy ? 'Stopping…' : 'Stop Auction'}
          </Button>
          <Button variant="secondary" onClick={() => setPendingStopId(null)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
