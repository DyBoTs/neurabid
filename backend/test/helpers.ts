import { randomUUID } from 'node:crypto';
import { pool } from '../src/db.js';
import { createSession } from '../src/services/auth.js';
import { hashPassword } from '../src/services/passwords.js';

export async function createTestUser(): Promise<string> {
  const username = `test_${randomUUID()}`;
  const {
    rows: [user],
  } = await pool.query<{ id: string }>('INSERT INTO users (username) VALUES ($1) RETURNING id', [
    username,
  ]);
  return user.id;
}

/** A real admin user + a real server-issued session token — for exercising requireAdmin-gated routes in tests. */
export async function createTestAdminSession(): Promise<{ userId: string; sessionToken: string }> {
  const username = `test_admin_${randomUUID()}`;
  const passwordHash = await hashPassword('irrelevant-test-password');
  const {
    rows: [user],
  } = await pool.query<{ id: string }>(
    `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin') RETURNING id`,
    [username, passwordHash],
  );
  const session = await createSession(user.id);
  return { userId: user.id, sessionToken: session.token };
}

export async function createTestAuction(opts: {
  startingPrice: number;
  minIncrement?: number;
  status?: 'scheduled' | 'active' | 'ended';
  startsInMs?: number;
  endsInMs?: number;
}): Promise<string> {
  const minIncrement = opts.minIncrement ?? 1;
  const status = opts.status ?? 'active';
  const startsInMs = opts.startsInMs ?? -60_000; // started a minute ago, by default
  const endsInMs = opts.endsInMs ?? 60_000; // ends a minute from now, by default
  const {
    rows: [auction],
  } = await pool.query<{ id: string }>(
    `INSERT INTO auctions (title, starting_price, current_price, min_increment, status, starts_at, ends_at)
     VALUES (
       'Test auction', $1, $1, $2, $3,
       now() + make_interval(secs => $4),
       now() + make_interval(secs => $5)
     )
     RETURNING id`,
    [opts.startingPrice, minIncrement, status, startsInMs / 1000, endsInMs / 1000],
  );
  return auction.id;
}
