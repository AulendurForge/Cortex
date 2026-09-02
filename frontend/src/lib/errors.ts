/**
 * One error shape for everything the gateway returns. `apiFetch` throws `ApiError`, so callers
 * can `instanceof` it, and every page renders `errMsg(e)` instead of guessing the shape.
 */
export class ApiError extends Error {
  code: number;
  request_id?: string;
  constructor(code: number, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.request_id = requestId;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError || (typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'number' && typeof (e as { message?: unknown }).message === 'string');
}

/** Human-readable message for any thrown value, with the gateway request id when present. */
export function errMsg(e: unknown, withRequestId = false): string {
  if (isApiError(e)) {
    const rid = withRequestId && e.request_id ? ` (request ${e.request_id})` : '';
    return `${e.message || `HTTP ${e.code}`}${rid}`;
  }
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === 'string') return e;
  return 'request failed';
}

/** Dispatched by apiFetch on a 401 so the session provider can flip to "anonymous". */
export const UNAUTHENTICATED_EVENT = 'cortex:unauthenticated';
