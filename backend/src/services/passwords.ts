import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/**
 * scrypt from Node's built-in crypto module — no bcrypt/argon2 dependency
 * needed. Stored as "saltHex:hashHex" in one column so verifyPassword never
 * needs a second lookup to know which salt was used.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(':');
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;

  // timingSafeEqual throws on length mismatch rather than returning false —
  // guard that first so a malformed stored hash can't crash the request.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
