import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  postgres: {
    host: required('PGHOST'),
    port: Number(required('PGPORT')),
    user: required('PGUSER'),
    password: required('PGPASSWORD'),
    database: required('PGDATABASE'),
  },
  redisUrl: required('REDIS_URL'),
  // Optional — see .env.example. Used only to seed a dev admin account on
  // startup (services/seedAdmin.ts); never read anywhere else, and never
  // sent to the frontend.
  adminUsername: process.env.ADMIN_USERNAME,
  adminPassword: process.env.ADMIN_PASSWORD,
};
