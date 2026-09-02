/** Shared number/date formatting. Keep every page on these instead of local copies. */

/** Decimal units (1 GB = 1e9 bytes), matching the sizes the gateway logs. */
export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${Math.round(n)} B`;
}

/** Binary units from megabytes (GPU/host memory is reported in MiB). */
export function formatGiB(mb: number | null | undefined, digits = 1): string {
  if (mb == null || !Number.isFinite(mb)) return '—';
  return `${(mb / 1024).toFixed(digits)} GiB`;
}

/** 1234567 -> "1.2M", 1234 -> "1.2k", 12.6 -> "13", 0.5 -> "0.50"; null -> "—". */
export function shortNum(n?: number | null, digits = 1): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(digits)}k`;
  if (Math.abs(n) >= 10) return n.toFixed(0);
  return n.toFixed(n === 0 ? 0 : 2);
}

/** Bytes per second as a network rate in bits. */
export function fmtBps(bps?: number | null): string {
  if (bps === undefined || bps === null) return '—';
  const bits = bps * 8;
  if (bits >= 1e9) return `${(bits / 1e9).toFixed(2)} Gbit/s`;
  if (bits >= 1e6) return `${(bits / 1e6).toFixed(1)} Mbit/s`;
  if (bits >= 1e3) return `${(bits / 1e3).toFixed(0)} kbit/s`;
  return `${bits.toFixed(0)} bit/s`;
}

/** Accepts ISO strings or epoch seconds/milliseconds. */
export function toMillis(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function relativeTime(v: string | number | null | undefined, now: number = Date.now()): string {
  const t = toMillis(v);
  if (t == null) return '—';
  const diff = Math.round((now - t) / 1000);
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? 'ago' : 'from now';
  if (abs < 45) return 'just now';
  if (abs < 3600) return `${Math.round(abs / 60)} min ${suffix}`;
  if (abs < 86400) return `${Math.round(abs / 3600)} h ${suffix}`;
  if (abs < 30 * 86400) {
    const d = Math.round(abs / 86400);
    return `${d} day${d === 1 ? '' : 's'} ${suffix}`;
  }
  return new Date(t).toLocaleDateString();
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Local date + time, short. */
export function formatDateTime(v: string | number | null | undefined): string {
  const t = toMillis(v);
  if (t == null) return '—';
  return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
