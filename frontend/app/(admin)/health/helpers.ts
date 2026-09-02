/** An upstream counts as online only while its last probe is both OK and recent. */
export function upstreamStatus(h: { ok: boolean; ts: number }, now: number, ttlSec: number): 'online' | 'stale' | 'offline' {
  if (!h.ok) return 'offline';
  return now - h.ts > ttlSec ? 'stale' : 'online';
}
