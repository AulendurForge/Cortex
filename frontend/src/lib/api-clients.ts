/**
 * The one HTTP client for the gateway. Adds credentials and a request id, normalises errors to
 * `ApiError`, and announces 401s so the session provider can send the user to sign in.
 */
import { ApiError, UNAUTHENTICATED_EVENT } from './errors';

export type { ApiError } from './errors';

declare global {
  interface Window {
    __CORTEX_CONFIG__?: { gatewayUrl?: string };
  }
}

/**
 * Gateway base URL, in order of precedence:
 * 1. runtime config injected by the server (`/runtime-config.js`, env CORTEX_GATEWAY_URL):
 *    a full URL, or "/" meaning "same origin" (the reverse-proxy layout in production);
 * 2. NEXT_PUBLIC_GATEWAY_URL baked in at build time;
 * 3. the browser's hostname on port 8084 (the dev/LAN layout);
 * 4. localhost:8084 during SSR.
 */
export function getGatewayBaseUrl(): string {
  const runtime = typeof window !== 'undefined' ? window.__CORTEX_CONFIG__?.gatewayUrl?.trim() : '';
  if (runtime) {
    if (runtime === '/' || runtime === 'same-origin') return typeof window !== 'undefined' ? window.location.origin : '';
    return runtime.replace(/\/$/, '');
  }
  const fromEnv = process.env.NEXT_PUBLIC_GATEWAY_URL;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim().replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location) {
    const proto = window.location.protocol || 'http:';
    const host = window.location.hostname || 'localhost';
    return `${proto}//${host}:8084`;
  }
  return 'http://localhost:8084';
}

/** RFC 4122 v4 id, with fallbacks for environments without Web Crypto. */
export function safeUuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  try {
    if (c?.randomUUID) return c.randomUUID();
    if (c?.getRandomValues) {
      const arr = new Uint8Array(16);
      c.getRandomValues(arr);
      arr[6] = ((arr[6] ?? 0) & 0x0f) | 0x40;
      arr[8] = ((arr[8] ?? 0) & 0x3f) | 0x80;
      const h = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}`;
    }
  } catch { /* fall through */ }
  const rnd = Math.random().toString(16).slice(2);
  const t = Date.now().toString(16);
  return `${t}-${rnd}-${t}`.slice(0, 36);
}

type ErrorBody = { error?: { code?: unknown; message?: unknown; request_id?: unknown } | string; detail?: unknown; message?: unknown; request_id?: unknown };

function toApiError(status: number, body: ErrorBody | null, headerRid: string | undefined): ApiError {
  const env = body?.error;
  let message: string | undefined;
  let code: number | undefined;
  if (env && typeof env === 'object') {
    if (typeof env.message === 'string') message = env.message;
    if (typeof env.code === 'number') code = env.code;
    else if (typeof env.code === 'string' && /^\d+$/.test(env.code)) code = Number(env.code);
  } else if (typeof env === 'string') {
    message = env;
  }
  if (!message && typeof body?.detail === 'string') message = body.detail;
  if (!message && typeof body?.message === 'string') message = body.message;
  const rid = (typeof body?.request_id === 'string' && body.request_id) || (env && typeof env === 'object' && typeof env.request_id === 'string' ? env.request_id : undefined) || headerRid;
  return new ApiError(code ?? status, message ?? `HTTP ${status}`, rid);
}

export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}, baseUrl = getGatewayBaseUrl()): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  const headers = new Headers(options.headers || {});
  if (options.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('x-request-id', safeUuid());
  const resp = await fetch(url, { ...options, headers, credentials: 'include' });
  if (!resp.ok) {
    let body: ErrorBody | null = null;
    try { body = (await resp.json()) as ErrorBody; } catch { /* not JSON */ }
    const err = toApiError(resp.status, body, resp.headers.get('x-request-id') ?? undefined);
    if (resp.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
      window.dispatchEvent(new CustomEvent(UNAUTHENTICATED_EVENT, { detail: { path } }));
    }
    throw err;
  }
  if (resp.status === 204) return undefined as T;
  const ct = resp.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) return (await resp.json()) as T;
  return (await resp.text()) as unknown as T;
}

export default apiFetch;
