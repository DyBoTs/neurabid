import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import { pool } from '../src/db.js';
import { redis } from '../src/redis.js';

describe('GET /health', () => {
  it('returns ok with db and redis both connected (requires docker compose up)', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok', checks: { db: 'ok', redis: 'ok' } });
    expect(res.status).toBe(200);
  });

  afterAll(async () => {
    await pool.end();
    if (redis.isOpen) await redis.quit();
  });
});
