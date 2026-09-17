import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { PoolClient } from 'pg';
import { placeBid } from '../src/services/placeBid.js';
import { pool } from '../src/db.js';

/**
 * Our chosen design (SELECT ... FOR UPDATE on a single auction row — see
 * docs/03-bid-engine.md §4) structurally avoids real Postgres deadlocks and
 * serialization_failure errors: there's only ever one row lock involved, so
 * there's no lock-ordering cycle for Postgres to detect. That's a deliberate
 * property of the design, not an accident — but it means we can't honestly
 * write an integration test that reproduces a *real* 40P01/55P03 error
 * against a real database; nothing in the real system can trigger one.
 *
 * So this file tests the retry/error-mapping logic itself, directly: it
 * mocks the database driver to simulate exactly the error codes Postgres
 * *could* send in principle, and verifies placeBid reacts to each one
 * correctly. This proves the retry code is correct without claiming
 * something false about when it fires in practice.
 */
vi.mock('../src/db.js', () => ({ pool: { connect: vi.fn() } }));

// pg's Pool.connect() is overloaded (a promise-returning form and a
// callback form that returns void); TypeScript's overload resolution for
// generic helpers like vi.mocked() picks the callback overload, which isn't
// the one we're using. Cast explicitly to the signature we actually mock.
const connect = pool.connect as unknown as Mock<() => Promise<PoolClient>>;

function pgError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

function fakeClient(handleQuery: (sql: string) => Promise<unknown>) {
  const query = vi.fn(async (sql: string) => handleQuery(sql));
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  return { client, query, release };
}

const ACTIVE_AUCTION_ROW = {
  current_price: '100.00',
  min_increment: '5.00',
  status: 'active',
  starts_at: new Date(Date.now() - 60_000).toISOString(),
  ends_at: new Date(Date.now() + 60_000).toISOString(),
};

function successfulQueryHandler(sql: string): Promise<unknown> {
  if (sql.startsWith('BEGIN')) return Promise.resolve({});
  if (sql.includes('lock_timeout')) return Promise.resolve({});
  if (sql.includes('FOR UPDATE')) return Promise.resolve({ rows: [ACTIVE_AUCTION_ROW] });
  if (sql.startsWith('INSERT INTO bids')) return Promise.resolve({ rows: [{ id: 'mock-bid-1' }] });
  if (sql.startsWith('UPDATE auctions')) return Promise.resolve({});
  if (sql.startsWith('COMMIT')) return Promise.resolve({});
  return Promise.reject(new Error(`unexpected query: ${sql}`));
}

function failingQueryHandler(code: string, message: string) {
  return (sql: string): Promise<unknown> => {
    if (sql.startsWith('BEGIN')) return Promise.resolve({});
    if (sql.includes('lock_timeout')) return Promise.resolve({});
    if (sql.includes('FOR UPDATE')) return Promise.reject(pgError(code, message));
    if (sql.startsWith('ROLLBACK')) return Promise.resolve({});
    return Promise.reject(new Error(`unexpected query: ${sql}`));
  };
}

describe('placeBid retry and locking behavior (mocked Postgres driver)', () => {
  afterEach(() => {
    connect.mockReset();
  });

  it('serialization conflict: retries once on deadlock (40P01) and then succeeds', async () => {
    const { client: client1, query: query1, release: release1 } = fakeClient(
      failingQueryHandler('40P01', 'deadlock detected'),
    );
    const { client: client2, release: release2 } = fakeClient(successfulQueryHandler);

    connect.mockResolvedValueOnce(client1).mockResolvedValueOnce(client2);

    const result = await placeBid('auction-1', 'user-1', 110);

    expect(result).toEqual({ bidId: 'mock-bid-1', auctionId: 'auction-1', amount: 110 });
    expect(connect).toHaveBeenCalledTimes(2);
    expect(query1).toHaveBeenCalledWith('ROLLBACK');
    expect(release1).toHaveBeenCalled();
    expect(release2).toHaveBeenCalled();
  });

  it('lock timeout (55P03) fails immediately as a 503, with no retry', async () => {
    const { client } = fakeClient(failingQueryHandler('55P03', 'lock timeout'));
    connect.mockResolvedValueOnce(client);

    await expect(placeBid('auction-1', 'user-1', 110)).rejects.toMatchObject({ status: 503 });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('gives up after exhausting retries on repeated deadlocks', async () => {
    const attempt = () => fakeClient(failingQueryHandler('40P01', 'deadlock detected')).client;
    connect.mockResolvedValueOnce(attempt()).mockResolvedValueOnce(attempt()).mockResolvedValueOnce(attempt());

    await expect(placeBid('auction-1', 'user-1', 110)).rejects.toMatchObject({ code: '40P01' });
    expect(connect).toHaveBeenCalledTimes(3);
  });
});
