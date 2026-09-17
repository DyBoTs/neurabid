/**
 * REST calls go through relative /api paths, proxied to the backend by
 * Vite's dev server (see vite.config.ts) — same pattern as the existing
 * /health check. WebSocket connections can't go through that proxy as
 * simply (the backend's WS server listens on every path, not a prefixed
 * one), so the frontend connects to the backend's port directly, reusing
 * whatever hostname the page itself was loaded from (works for localhost
 * and for reaching the dev server from another machine on the LAN).
 */
export const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  (import.meta.env.DEV ? `ws://${window.location.hostname}:4000` : '');
