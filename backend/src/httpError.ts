/**
 * A rejection the caller should show to the user as-is (wrong input, not
 * found, business rule violated, etc). The central error handler in
 * server.ts maps this to `res.status(status).json({ error: message })`;
 * anything that isn't an HttpError becomes a generic 500 with no internal
 * details leaked.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
