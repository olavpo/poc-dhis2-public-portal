// scripts/asc-synth/lib/geometry.test.mjs
import { describe, it, expect } from 'vitest';
import { buildHierarchy } from './hierarchy.mjs';
import { assignGeometry } from './geometry.mjs';

const { units } = buildHierarchy();
const geo = assignGeometry(units);

describe('assignGeometry', () => {
  it('gives every unit at levels 1-3 a Polygon', () => {
    for (const u of units.filter((u) => u.level <= 3)) {
      const g = geo[u.id];
      expect(g).toBeTruthy();
      expect(g.type).toBe('Polygon');
      expect(g.coordinates[0].length).toBeGreaterThanOrEqual(5); // closed ring
    }
  });
  it('assigns NO geometry to schools (level 4 are invisible data leaves)', () => {
    for (const u of units.filter((u) => u.level === 4)) expect(geo[u.id]).toBeUndefined();
  });
  it('includes the national root (level 1) geometry', () => {
    const root = units.find((u) => u.level === 1);
    expect(geo[root.id].type).toBe('Polygon');
  });
  it('is deterministic', () => {
    const geo2 = assignGeometry(units);
    expect(JSON.stringify(geo2)).toBe(JSON.stringify(geo));
  });
});
