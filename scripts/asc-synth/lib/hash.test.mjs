// scripts/asc-synth/lib/hash.test.mjs
import { describe, it, expect } from 'vitest';
import { hash32, ranged } from './hash.mjs';

describe('hash32', () => {
  it('is deterministic for the same input', () => {
    expect(hash32('abc')).toBe(hash32('abc'));
  });
  it('differs for different input', () => {
    expect(hash32('abc')).not.toBe(hash32('abd'));
  });
  it('returns a non-negative 32-bit integer', () => {
    const h = hash32('anything');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe('ranged', () => {
  it('maps a seed into [min,max] deterministically', () => {
    const v = ranged('seed-x', 100, 200);
    expect(v).toBe(ranged('seed-x', 100, 200));
    expect(v).toBeGreaterThanOrEqual(100);
    expect(v).toBeLessThanOrEqual(200);
  });
  it('spreads across the range for different seeds', () => {
    const vals = Array.from({ length: 50 }, (_, i) => ranged('s' + i, 0, 1000));
    const uniq = new Set(vals);
    expect(uniq.size).toBeGreaterThan(20);
  });
});
