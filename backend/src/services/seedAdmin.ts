import { pool } from '../db.js';
import { config } from '../config.js';
import { hashPassword } from './passwords.js';

/**
 * Idempotent: safe to run on every startup. If ADMIN_USERNAME/ADMIN_PASSWORD
 * aren't set (see .env.example), this does nothing — there's no admin
 * account until one is created or promoted by hand. The password is only
 * ever read from the environment, hashed immediately, and never logged.
 */
export async function seedAdminFromEnv(): Promise<void> {
  const { adminUsername, adminPassword } = config;
  if (!adminUsername || !adminPassword) return;

  const passwordHash = await hashPassword(adminPassword);
  await pool.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'`,
    [adminUsername, passwordHash],
  );
  console.log(`Dev admin account ready: ${adminUsername}`);
}
