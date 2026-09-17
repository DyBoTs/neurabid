import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AboutModal } from './AboutModal';
import styles from './Layout.module.css';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [aboutOpen, setAboutOpen] = useState(false);

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
          {/* Creating an auction is an admin-only action (see
              backend/src/middleware/requireAdmin.ts, the actual security
              boundary) — hiding the link for everyone else is a UX
              nicety, not the enforcement. */}
          {user?.role === 'admin' && (
            <NavLink to="/create" className={({ isActive }) => (isActive ? styles.linkActive : styles.link)}>
              Create Auction
            </NavLink>
          )}
          {user && (
            <>
              <NavLink to="/my-bids" className={({ isActive }) => (isActive ? styles.linkActive : styles.link)}>
                My Bids
              </NavLink>
              <NavLink to="/admin" className={({ isActive }) => (isActive ? styles.linkActive : styles.link)}>
                Admin
              </NavLink>
            </>
          )}
          <button type="button" className={styles.link} onClick={() => setAboutOpen(true)}>
            About
          </button>
          {user ? (
            <div className={styles.account}>
              <span className={styles.user}>{user.username}</span>
              <button type="button" className={styles.logoutButton} onClick={logout}>
                Log out
              </button>
            </div>
          ) : (
            <div className={styles.account}>
              <NavLink to="/login" className={({ isActive }) => (isActive ? styles.linkActive : styles.link)}>
                Log in
              </NavLink>
              <NavLink to="/admin/login" className={styles.adminLoginLink}>
                Admin Login
              </NavLink>
            </div>
          )}
        </div>
      </nav>
      <main className={styles.main}>{children}</main>
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
