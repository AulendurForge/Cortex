import { describe, it, expect } from 'vitest';
import { shortNum, fmtBps } from './helpers';

describe('system formatting', () => {
  it('shortNum', () => {
    expect(shortNum(null)).toBe('—');
    expect(shortNum(0)).toBe('0');
    expect(shortNum(0.32, 2)).toBe('0.32');
    expect(shortNum(12.6)).toBe('13');
    expect(shortNum(1500)).toBe('1.5k');
    expect(shortNum(2_400_000)).toBe('2.4M');
  });
  it('fmtBps uses bits per second with units', () => {
    expect(fmtBps(null)).toBe('—');
    expect(fmtBps(125)).toBe('1 kbit/s');
    expect(fmtBps(1_250_000)).toBe('10.0 Mbit/s');
  });
});
