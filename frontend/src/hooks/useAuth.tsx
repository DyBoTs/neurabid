import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { loginOrRegister } from '../api/users';
import type { User } from '../api/types';

const STORAGE_KEY = 'neurabid.user';

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  user: User | null;
  login: (username: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * NeuraBid's "auth" is intentionally minimal (see docs/02-local-setup.md):
 * pick a username, no password. The user's own id doubles as the
 * credential sent as X-User-Id on bid requests — there's no server
 * session, so "logged in" just means "we remember this id locally."
 *
 * This lives in a single Context provider (mounted once in App.tsx), not
 * as independent useState in every component that calls useAuth() — every
 * consumer must see the same login, immediately, or the nav bar and the
 * page that just logged in disagree with each other.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredUser());

  const login = useCallback(async (username: string) => {
    const loggedInUser = await loginOrRegister(username);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
