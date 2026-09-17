import { createClient } from 'redis';
import { config } from './config.js';

export const redis = createClient({ url: config.redisUrl });

redis.on('error', (err) => {
  console.error('Redis client error:', err.message);
});

let connecting: Promise<void> | null = null;

export function ensureRedisConnected(): Promise<void> {
  if (redis.isOpen) return Promise.resolve();
  if (!connecting) connecting = redis.connect().then(() => undefined);
  return connecting;
}
