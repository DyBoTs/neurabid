import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool } from './db.js';
import { ensureRedisConnected, redis } from './redis.js';
import { HttpError } from './httpError.js';
import { usersRouter } from './routes/users.js';
import { auctionsRouter } from './routes/auctions.js';
import { attachWebSocketServer } from './ws/wsServer.js';
import { startAuctionEndSweep } from './services/auctionEndSweep.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();
app.use(express.json());

// A plain manual-test page for verifying the WebSocket layer with real
// browsers (see docs/05-realtime.md) — NOT the product UI. Lives at
// /debug/realtime-test.html.
app.use('/debug', express.static(path.join(__dirname, '..', 'public')));

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

app.use('/api/users', usersRouter);
app.use('/api/auctions', auctionsRouter);

// Central error handler. Must be registered after all routes, and must
// declare all four parameters for Express to recognize it as an error
// handler (even though req/next go unused here).
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('Unexpected error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (process.env.VITEST !== 'true') {
  const httpServer = app.listen(config.port, () => {
    console.log(`neurabid backend listening on http://localhost:${config.port}`);
  });
  attachWebSocketServer(httpServer);
  startAuctionEndSweep();
}
