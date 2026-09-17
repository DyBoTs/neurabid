-- Adds real password authentication and a user role, plus server-side
-- sessions for the new admin-gated auction-management endpoints. Existing
-- passwordless identities (demo bots, load-test users) keep working:
-- password_hash stays NULL for them, which simply means they can never
-- authenticate through POST /api/auth/login (they were never meant to).

ALTER TABLE users
  ADD COLUMN password_hash text,
  ADD COLUMN role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
