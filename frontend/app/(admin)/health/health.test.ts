import { describe, it, expect } from 'vitest';
import { upstreamStatus } from './helpers';

describe('upstreamStatus', () => {
  it('treats an old OK probe as stale, not online', () => {
    expect(upstreamStatus({ ok: true, ts: 1000 }, 1010, 30)).toBe('online');
    expect(upstreamStatus({ ok: true, ts: 1000 }, 1100, 30)).toBe('stale');
    expect(upstreamStatus({ ok: false, ts: 1000 }, 1001, 30)).toBe('offline');
  });
});
