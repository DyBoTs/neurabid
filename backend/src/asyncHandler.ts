import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 doesn't automatically catch rejected promises from async route
 * handlers — an unhandled rejection would just hang the request. Wrapping a
 * handler with this forwards any thrown/rejected error to next(), so it
 * reaches the central error handler in server.ts.
 */
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req, res, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
