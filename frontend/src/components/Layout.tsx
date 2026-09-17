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
          <NavLink to="/admin" className={({ isActive }) => (isActive ? styles.linkActive : styles.link)}>
            Admin
          </NavLink>
          {user && (
            <NavLink to="/my-bids" className={({ isActive }) => (isActive ? styles.linkActive : styles.link)}>
              My Bids
            </NavLink>
          )}
          {user ? (
            <>
              <span className={styles.user}>{user.username}</span>
              <button type="button" className={styles.link} onClick={logout}>
                Log out
              </button>
            </>
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
