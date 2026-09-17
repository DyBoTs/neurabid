import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../api/client';
import styles from './Login.module.css';

/**
 * There's no separate register flow: logging in with a username that
 * doesn't exist yet creates it (see backend/src/routes/users.ts) — real
 * server-side get-or-create, not a client-side illusion of two flows.
 */
export function LoginPage() {
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim());
      navigate('/marketplace');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h1>Log in</h1>
      <Input
        label="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
        minLength={3}
        maxLength={30}
        disabled={submitting}
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={submitting || username.trim().length < 3}>
        {submitting ? 'Logging in…' : 'Continue'}
      </Button>
    </form>
  );
}
