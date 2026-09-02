import { describe, it, expect } from 'vitest';
import { localInputToIso } from './helpers';

describe('localInputToIso', () => {
  it('converts a datetime-local value to an ISO UTC instant', () => {
    const iso = localInputToIso('2026-09-02T10:30');
    expect(iso).toMatch(/Z$/);
    expect(new Date(iso!).getTime()).toBe(new Date('2026-09-02T10:30').getTime());
  });
  it('returns null for empty or invalid input', () => {
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso(null)).toBeNull();
    expect(localInputToIso('nope')).toBeNull();
  });
});
