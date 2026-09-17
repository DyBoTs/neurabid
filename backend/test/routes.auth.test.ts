import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import { pool } from '../src/db.js';

afterAll(async () => {
  await pool.end();
});

// The real USERNAME_RE (routes/auth.ts) only allows letters/digits/underscore
// — unlike the raw-SQL test helpers elsewhere, usernames here go through
// that actual HTTP validation, so a raw UUID's hyphens would be rejected.
function validUsername(prefix: string): string {
  // USERNAME_RE (routes/auth.ts) caps usernames at 30 characters, so the
  // unique suffix is truncated to fit every prefix used below.
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

describe('POST /api/auth/login', () => {
  it('rejects a password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: validUsername('test'), password: 'short' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid username shape', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'a', password: 'longenoughpassword' });
    expect(res.status).toBe(400);
  });

  it('claims a new username on first use and returns a session token', async () => {
    const username = validUsername('test');
    const res = await request(app).post('/api/auth/login').send({ username, password: 'correct-horse-1' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username, role: 'user' });
    expect(typeof res.body.sessionToken).toBe('string');
  });

  it('logs back in with the same password on a later attempt', async () => {
    const username = validUsername('test');
    await request(app).post('/api/auth/login').send({ username, password: 'correct-horse-1' });

    const res = await request(app).post('/api/auth/login').send({ username, password: 'correct-horse-1' });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(username);
  });

  it('rejects a returning username with the wrong password', async () => {
    const username = validUsername('test');
    await request(app).post('/api/auth/login').send({ username, password: 'correct-horse-1' });

    const res = await request(app).post('/api/auth/login').send({ username, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('rejects login for a passwordless identity (e.g. a demo bot created via POST /api/users)', async () => {
    const username = validUsername('test_bot');
    await pool.query('INSERT INTO users (username) VALUES ($1)', [username]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username, password: 'anything-at-all' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('invalidates the session so it can no longer authorize admin routes', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (username, password_hash, role) VALUES ($1, 'x', 'admin') RETURNING id`,
      [validUsername('test_admin')],
    );
    const { createSession } = await import('../src/services/auth.js');
    const session = await createSession(rows[0].id);

    const logoutRes = await request(app).post('/api/auth/logout').set('X-Session-Token', session.token);
    expect(logoutRes.status).toBe(204);

    const createRes = await request(app)
      .post('/api/auctions')
      .set('X-Session-Token', session.token)
      .send({ title: 'Should not work', startingPrice: 10, minIncrement: 1, durationMinutes: 10 });
    expect(createRes.status).toBe(401);
  });

  it('succeeds even with no session token (idempotent no-op)', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
  });
});
