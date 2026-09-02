import { describe, it, expect } from 'vitest';
import { bucketFor } from './helpers';

describe('bucketFor', () => {
  it('keeps charts readable across windows', () => {
    expect(bucketFor(1)).toBe('minute');
    expect(bucketFor(6)).toBe('minute');
    expect(bucketFor(24)).toBe('hour');
    expect(bucketFor(48)).toBe('hour');
    expect(bucketFor(168)).toBe('day');
    expect(bucketFor(720)).toBe('day');
  });
});
