import { Router } from 'express';
import { asyncHandler } from '../asyncHandler.js';
import { HttpError } from '../httpError.js';
import { createSession, deleteSession, loginOrRegister } from '../services/auth.js';

export const authRouter = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

/**
 * The one real login endpoint (see services/auth.ts for the "first use
 * claims the username" behavior). Used by both the normal "Log in" flow and
 * the "Admin Login" entry point — they hit the exact same code path, so an
 * account only ever gets admin capabilities because its row's `role`
 * column really is 'admin' in the database, never because of which link
 * the visitor clicked. The session token this returns is what every
 * admin-gated endpoint actually checks (see middleware/requireAdmin.ts) —
 * the X-User-Id header used elsewhere in the app is never trusted for
 * authorization decisions.
 */
authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    if (!USERNAME_RE.test(username)) {
      throw new HttpError(400, 'Username must be 3-30 characters: letters, numbers, and underscores only');
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length < 8 || password.length > 200) {
      throw new HttpError(400, 'Password must be at least 8 characters');
    }

    const user = await loginOrRegister(username, password);
    const session = await createSession(user.id);

    res.status(200).json({ user, sessionToken: session.token });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.header('x-session-token');
    if (token) await deleteSession(token);
    res.status(204).end();
  }),
);
