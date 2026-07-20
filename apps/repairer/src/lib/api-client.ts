import { fetchAuthSession } from 'aws-amplify/auth';

const BASE_URL = import.meta.env['VITE_API_URL'] ?? '';

async function getToken(): Promise<string | undefined> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString();
  } catch {
    return undefined;
  }
}

/** An API error carrying the server's error code so callers can branch on it. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    // Errors are shaped { success: false, error: { code, message } } — the
    // message is nested, not top-level. Non-JSON bodies (gateway faults) fall
    // back to the status line.
    const err = await res.json().catch(() => null);
    throw new ApiError(
      err?.error?.message ?? res.statusText ?? `Request failed: ${res.status}`,
      err?.error?.code ?? 'UNKNOWN',
      res.status,
    );
  }

  // API wraps payloads as { success, data }; callers expect the unwrapped data.
  const json = await res.json();
  return json.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
