import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../httpError.js';
import { getSessionUser, type AuthUser } from '../services/auth.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set only by requireAdmin, after a real session-token lookup — never trust req.header('x-user-id') for this. */
    authUser?: AuthUser;
  }
}

/**
 * The actual security boundary for create/edit/end-auction (see
 * routes/auctions.ts). Deliberately ignores X-User-Id entirely — that
 * header is client-supplied and never proves who's making the request (see
 * docs/02-local-setup.md's auth note). The only thing that can grant admin
 * capabilities is a session token this server issued after verifying a
 * password, looked up fresh against the sessions table on every request —
 * never a client-supplied role or id.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const token = req.header('x-session-token');
  if (!token) {
    next(new HttpError(401, 'Login required'));
    return;
  }

  getSessionUser(token)
    .then((user) => {
      if (!user) {
        next(new HttpError(401, 'Session expired or invalid — please log in again'));
        return;
      }
      if (user.role !== 'admin') {
        next(new HttpError(403, 'Admin access required'));
        return;
      }
      req.authUser = user;
      next();
    })
    .catch(next);
}
