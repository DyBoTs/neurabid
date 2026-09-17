import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import styles from './Layout.module.css';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <NavLink to="/" className={styles.brand}>
          NeuraBid
        </NavLink>
        <div className={styles.links}>
          <NavLink to="/marketplace" className={({ isActive }) => (isActive ? styles.linkActive : styles.link)}>
            Marketplace
          </NavLink>
          <NavLink to="/create" className={({ isActive }) => (isActive ? styles.linkActive : styles.link)}>
            Create Auction
          </NavLink>
          {user && (
            <>
              <NavLink to="/my-bids" className={({ isActive }) => (isActive ? styles.linkActive : styles.link)}>
                My Bids
              </NavLink>
              {/* "Authorized" here just means "logged in" — this app has no
                  role system (see docs/02-local-setup.md's auth note). This
                  only keeps the link off the nav for a first-time visitor,
                  it isn't an access-control boundary. */}
              <NavLink to="/admin" className={({ isActive }) => (isActive ? styles.linkActive : styles.link)}>
                Admin
              </NavLink>
            </>
          )}
          {user ? (
            <div className={styles.account}>
              <span className={styles.user}>{user.username}</span>
              <button type="button" className={styles.logoutButton} onClick={logout}>
                Log out
              </button>
            </div>
          ) : (
            <NavLink to="/login" className={({ isActive }) => (isActive ? styles.linkActive : styles.link)}>
              Log in
            </NavLink>
          )}
        </div>
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
