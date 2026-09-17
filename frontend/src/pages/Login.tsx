import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/Input';
import { PasswordInput } from '../components/ui/PasswordInput';
import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../api/client';
import styles from './Login.module.css';

interface LoginPageProps {
  /**
   * "admin" only changes the page's copy and where a successful login
   * redirects to — it hits the exact same POST /api/auth/login endpoint as
   * a normal login (see api/auth.ts). Whether the account actually has
   * admin capabilities is decided entirely by the server, from the
   * account's real role column, never by which form was used to log in.
   */
  variant?: 'user' | 'admin';
}

/**
 * There's no separate register flow: logging in with a username that
 * doesn't exist yet creates it with the given password (see
 * backend/src/services/auth.ts) — real server-side get-or-create, not a
 * client-side illusion of two flows. A returning username must match its
 * original password.
 */
export function LoginPage({ variant = 'user' }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notAdminNotice, setNotAdminNotice] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotAdminNotice(false);
    try {
      const user = await login(username.trim(), password);
      if (variant === 'admin' && user.role !== 'admin') {
        setNotAdminNotice(true);
        return;
      }
      navigate(variant === 'admin' ? '/admin' : '/marketplace');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h1>{variant === 'admin' ? 'Admin Login' : 'Log in'}</h1>
      <Input
        label="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
        minLength={3}
        maxLength={30}
        autoComplete="username"
        disabled={submitting}
      />
      <PasswordInput
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        maxLength={200}
        disabled={submitting}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notAdminNotice && (
        <p className={styles.notice} role="alert">
          That account doesn't have admin access. You're logged in as {username.trim()}, but admin
          auction controls won't be available.
        </p>
      )}
      <Button type="submit" disabled={submitting || username.trim().length < 3 || password.length < 8}>
        {submitting ? 'Logging in…' : 'Continue'}
      </Button>
      <p className={styles.switch}>
        {variant === 'admin' ? (
          <Link to="/login">Not an admin? Log in here</Link>
        ) : (
          <Link to="/admin/login">Admin Login</Link>
        )}
      </p>
    </form>
  );
}
