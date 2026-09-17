import { useId, useState, type InputHTMLAttributes } from 'react';
import styles from './Input.module.css';
import passwordStyles from './PasswordInput.module.css';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
}

/**
 * A plain text toggle ("Show"/"Hide"), not an eye icon — this project keeps
 * icons to a small, meaningful set (see ui/icons.tsx's own comment), and a
 * label reads unambiguously without relying on an icon's shape being
 * understood. The value itself is never logged or sent anywhere except the
 * one POST /api/auth/login call that owns this field.
 */
export function PasswordInput({ label, error, id, className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <div className={passwordStyles.wrapper}>
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          autoComplete="current-password"
          className={[styles.input, passwordStyles.input, error ? styles.invalid : '', className]
            .filter(Boolean)
            .join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          {...props}
        />
        <button
          type="button"
          className={passwordStyles.toggle}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
