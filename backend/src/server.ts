import express from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { ensureRedisConnected, redis } from './redis.js';

export const app = express();
app.use(express.json());

app.get('/health', async (_req, res) => {
  const checks: Record<string, 'ok' | 'error'> = { db: 'error', redis: 'error' };
  let dbError: string | undefined;
  let redisError: string | undefined;

  try {
    await pool.query('SELECT 1');
    checks.db = 'ok';
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  try {
    await ensureRedisConnected();
    await redis.ping();
    checks.redis = 'ok';
  } catch (err) {
    redisError = err instanceof Error ? err.message : String(err);
  }

  const allOk = Object.values(checks).every((status) => status === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    checks,
    ...(dbError ? { dbError } : {}),
    ...(redisError ? { redisError } : {}),
  });
});

if (process.env.VITEST !== 'true') {
  app.listen(config.port, () => {
    console.log(`neurabid backend listening on http://localhost:${config.port}`);
  });
}
