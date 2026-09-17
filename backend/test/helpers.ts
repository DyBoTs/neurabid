import { randomUUID } from 'node:crypto';
import { pool } from '../src/db.js';

export async function createTestUser(): Promise<string> {
  const username = `test_${randomUUID()}`;
  const {
    rows: [user],
  } = await pool.query<{ id: string }>('INSERT INTO users (username) VALUES ($1) RETURNING id', [
    username,
  ]);
  return user.id;
}

export async function createTestAuction(opts: {
  startingPrice: number;
  minIncrement?: number;
  status?: 'scheduled' | 'active' | 'ended';
  endsInMs?: number;
}): Promise<string> {
  const minIncrement = opts.minIncrement ?? 1;
  const status = opts.status ?? 'active';
  const endsInMs = opts.endsInMs ?? 60_000;
  const {
    rows: [auction],
  } = await pool.query<{ id: string }>(
    `INSERT INTO auctions (title, starting_price, current_price, min_increment, status, ends_at)
     VALUES ('Test auction', $1, $1, $2, $3, now() + make_interval(secs => $4))
     RETURNING id`,
    [opts.startingPrice, minIncrement, status, endsInMs / 1000],
  );
  return auction.id;
}
