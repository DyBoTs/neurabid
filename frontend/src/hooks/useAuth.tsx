import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { login as loginRequest, logout as logoutRequest } from '../api/auth';
import type { User } from '../api/types';

const STORAGE_KEY = 'neurabid.auth';

interface StoredAuth {
  user: User;
  sessionToken: string;
}

function readStoredAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  user: User | null;
  /** Only ever sent as the X-Session-Token header — never the password itself (see api/auth.ts). */
  sessionToken: string | null;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Real password authentication (see backend/src/services/auth.ts): the
 * server verifies the password and hands back a session token, which is
 * what every admin-gated request actually presents — this hook just holds
 * onto it. The password itself is never stored here, never round-trips
 * back from the server, and never touches localStorage; only the opaque
 * session token does, which is exactly what a browser would otherwise keep
 * in a cookie for the same purpose.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => readStoredAuth());

  const login = useCallback(async (username: string, password: string) => {
    const result = await loginRequest(username, password);
    const next: StoredAuth = { user: result.user, sessionToken: result.sessionToken };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setAuth(next);
    return result.user;
  }, []);

  const logout = useCallback(() => {
    const token = auth?.sessionToken;
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
    if (token) {
      // Best-effort — the frontend has already forgotten the session either
      // way, so a failed request here (e.g. offline) doesn't need handling.
      logoutRequest(token).catch(() => {});
    }
  }, [auth]);

  return (
    <AuthContext.Provider
      value={{ user: auth?.user ?? null, sessionToken: auth?.sessionToken ?? null, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
