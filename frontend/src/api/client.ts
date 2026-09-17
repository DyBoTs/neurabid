export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  userId?: string;
}

/**
 * A thin fetch wrapper: JSON in, JSON out, backend error messages surfaced
 * as ApiError rather than swallowed. Every backend rejection already comes
 * back as { error: string } (see backend/src/httpError.ts's central
 * handler), so this is the one place that shape gets translated.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.userId) headers['X-User-Id'] = options.userId;

  const res = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed with status ${res.status}`);
  }

  return data as T;
}
