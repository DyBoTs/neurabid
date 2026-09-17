import { apiRequest } from './client';
import type { User } from './types';

export interface LoginResult {
  user: User;
  sessionToken: string;
}

/**
 * The one real login call — used by both the "Log in" and "Admin Login"
 * pages (they're the same form with different copy; see pages/Login.tsx).
 * Whether the returned user is an admin depends only on their row's role
 * in the database, never on which page called this.
 */
export function login(username: string, password: string): Promise<LoginResult> {
  return apiRequest<LoginResult>('/api/auth/login', { method: 'POST', body: { username, password } });
}

export function logout(sessionToken: string): Promise<void> {
  return apiRequest<void>('/api/auth/logout', { method: 'POST', sessionToken });
}
