import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { app } from '../src/server.js';
import { pool } from '../src/db.js';

describe('POST /api/users', () => {
  afterAll(async () => {
    await pool.end();
  });

  it('creates a new user and returns its id', async () => {
    const username = `route_test_${randomUUID().slice(0, 8)}`;
    const res = await request(app).post('/api/users').send({ username });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe(username);
    expect(typeof res.body.id).toBe('string');
  });

  it('returns the same id when called again with the same username (get-or-create)', async () => {
    const username = `route_test_${randomUUID().slice(0, 8)}`;
    const first = await request(app).post('/api/users').send({ username });
    const second = await request(app).post('/api/users').send({ username });

    expect(second.body.id).toBe(first.body.id);
  });

  it('rejects an invalid username with a clear 400', async () => {
    const res = await request(app).post('/api/users').send({ username: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/3-30 characters/);
  });

  it('rejects a missing username', async () => {
    const res = await request(app).post('/api/users').send({});
    expect(res.status).toBe(400);
  });
});
