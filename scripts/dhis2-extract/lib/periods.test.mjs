import { describe, it, expect } from 'vitest';
import { expandPeriods, parsePeriod } from './periods.mjs';

describe('expandPeriods', () => {
  it('expands a year range across monthly/quarterly/yearly', () => {
    const p = expandPeriods({ range: '2021..2022', types: ['monthly', 'quarterly', 'yearly'] });
    expect(p).toContain('202101');
    expect(p).toContain('202212');
    expect(p).toContain('2021Q1');
    expect(p).toContain('2022Q4');
    expect(p).toContain('2021');
    expect(p).toContain('2022');
    expect(p.filter(x => /^\d{6}$/.test(x))).toHaveLength(24);   // 2 years × 12 months
    expect(p.filter(x => /Q/.test(x))).toHaveLength(8);          // 2 × 4 quarters
    expect(p.filter(x => /^\d{4}$/.test(x))).toHaveLength(2);    // 2 years
  });
  it('accepts an explicit list', () => {
    expect(expandPeriods({ list: ['2024', '2024Q1'] })).toEqual(['2024', '2024Q1']);
  });
});

describe('parsePeriod', () => {
  it('parses monthly', () => {
    expect(parsePeriod('202503')).toEqual(
      { period: '202503', periodType: 'MONTHLY', year: 2025, quarter: 1, month: 3, startDate: '2025-03-01' });
  });
  it('parses quarterly', () => {
    expect(parsePeriod('2025Q2')).toEqual(
      { period: '2025Q2', periodType: 'QUARTERLY', year: 2025, quarter: 2, month: null, startDate: '2025-04-01' });
  });
  it('parses yearly', () => {
    expect(parsePeriod('2025')).toEqual(
      { period: '2025', periodType: 'YEARLY', year: 2025, quarter: null, month: null, startDate: '2025-01-01' });
  });
});
