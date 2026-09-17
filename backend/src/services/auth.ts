import { pool } from '../db.js';
import { HttpError } from '../httpError.js';
import { hashPassword, verifyPassword } from './passwords.js';

export type Role = 'user' | 'admin';

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
}

interface UserRow {
  id: string;
  username: string;
  role: Role;
  password_hash: string | null;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — a dev/demo-scoped lifetime, not a production policy.

/**
 * There is no separate "sign up" step (matching this project's existing
 * "pick a username" spirit — see docs/02-local-setup.md): the first time a
 * username is used, it's claimed with whatever password is given; every
 * time after that, the password must match. This is a deliberate,
 * documented simplification for this project's scope, not how a real
 * multi-tenant product would register accounts — a real product would
 * require an explicit signup step so usernames can't be silently claimed.
 */
export async function loginOrRegister(username: string, password: string): Promise<AuthUser> {
  const { rows } = await pool.query<UserRow>(
    'SELECT id, username, role, password_hash FROM users WHERE username = $1',
    [username],
  );
  const existing = rows[0];

  if (!existing) {
    const passwordHash = await hashPassword(password);
    const { rows: created } = await pool.query<UserRow>(
      `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'user')
       RETURNING id, username, role, password_hash`,
      [username, passwordHash],
    );
    const user = created[0];
    return { id: user.id, username: user.username, role: user.role };
  }

  // A user created without a password (a demo bot, or a load-test identity
  // created via POST /api/users) can never log in through this endpoint —
  // there's no password to check it against. This is intentional: those
  // identities are for placing bids under an id, not for authenticating.
  if (!existing.password_hash || !(await verifyPassword(password, existing.password_hash))) {
    throw new HttpError(401, 'Invalid username or password');
  }

  return { id: existing.id, username: existing.username, role: existing.role };
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO sessions (user_id, expires_at) VALUES ($1, $2) RETURNING id',
    [userId, expiresAt],
  );
  return { token: rows[0].id, expiresAt };
}

/** Returns null for a missing, expired, or otherwise invalid token — callers treat that as "not logged in", never as an error. */
export async function getSessionUser(token: string): Promise<AuthUser | null> {
  const { rows } = await pool.query<UserRow>(
    `SELECT u.id, u.username, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.expires_at > now()`,
    [token],
  );
  const user = rows[0];
  return user ? { id: user.id, username: user.username, role: user.role } : null;
}

export async function deleteSession(token: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE id = $1', [token]);
}
