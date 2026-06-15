// scripts/asc-synth/lib/values.test.mjs
import { describe, it, expect } from 'vitest';
import { valueFor } from './values.mjs';

const school = { id: 'SchoolAAA01', level: 4 };
describe('valueFor', () => {
  it('is deterministic per (ou,de,coc,period)', () => {
    const a = valueFor(school, { id: 'd1', name: 'ASC-PRY Enrolment' }, 'cocX', '2024');
    const b = valueFor(school, { id: 'd1', name: 'ASC-PRY Enrolment' }, 'cocX', '2024');
    expect(a).toBe(b);
  });
  it('scales enrolment larger than teacher counts', () => {
    const enrol = valueFor(school, { id: 'd1', name: 'ASC-PRY Enrolment' }, 'c', '2024');
    const teach = valueFor(school, { id: 'd2', name: 'ASC-GEN Teachers' }, 'c', '2024');
    expect(enrol).toBeGreaterThan(teach);
  });
  it('varies by period (2024 != 2023)', () => {
    const y24 = valueFor(school, { id: 'd1', name: 'ASC-PRY Enrolment' }, 'c', '2024');
    const y23 = valueFor(school, { id: 'd1', name: 'ASC-PRY Enrolment' }, 'c', '2023');
    expect(y24).not.toBe(y23);
  });
  it('returns a non-negative integer', () => {
    const v = valueFor(school, { id: 'd1', name: 'ASC-PRY Enrolment' }, 'c', '2024');
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
  });
});
