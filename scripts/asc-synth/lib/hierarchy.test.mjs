// scripts/asc-synth/lib/hierarchy.test.mjs
import { describe, it, expect } from 'vitest';
import { uid, buildHierarchy } from './hierarchy.mjs';

describe('uid', () => {
  it('produces a valid 11-char DHIS2 uid, stable per key', () => {
    const a = uid('state-1');
    expect(a).toMatch(/^[A-Za-z][A-Za-z0-9]{10}$/);
    expect(a).toBe(uid('state-1'));
  });
  it('is collision-free across the generated set', () => {
    const { units } = buildHierarchy();
    const ids = units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildHierarchy', () => {
  const { units, root } = buildHierarchy();
  it('has the fixed shape 1+6+24+288 = 319', () => {
    expect(units.length).toBe(319);
    const byLevel = (l) => units.filter((u) => u.level === l).length;
    expect(byLevel(1)).toBe(1);
    expect(byLevel(2)).toBe(6);
    expect(byLevel(3)).toBe(24);
    expect(byLevel(4)).toBe(288);
  });
  it('roots at a single level-1 nation with no parent', () => {
    expect(root.level).toBe(1);
    expect(root.parent).toBeNull();
  });
  it('every non-root has a parent that exists and is one level up', () => {
    const byId = Object.fromEntries(units.map((u) => [u.id, u]));
    for (const u of units) {
      if (u.level === 1) continue;
      expect(byId[u.parent]).toBeTruthy();
      expect(byId[u.parent].level).toBe(u.level - 1);
    }
  });
  it('assigns every school to exactly one ownership group (Public|Private)', () => {
    const schools = units.filter((u) => u.level === 4);
    expect(schools.every((s) => s.ownership === 'Public' || s.ownership === 'Private')).toBe(true);
    expect(schools.some((s) => s.ownership === 'Public')).toBe(true);
    expect(schools.some((s) => s.ownership === 'Private')).toBe(true);
  });
});
