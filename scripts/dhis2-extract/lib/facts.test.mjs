import { describe, it, expect } from 'vitest';
import { analyticsToFactRows, analyticsToDisaggRows, dxRowsFromMeta } from './facts.mjs';

const resp = {
  headers: [{ name: 'dx' }, { name: 'ou' }, { name: 'pe' }, { name: 'value' }],
  rows: [['Uvn6LCg7dVU', 'O6uvpzGd5pu', '2025Q2', '144.77'],
         ['Uvn6LCg7dVU', 'O6uvpzGd5pu', '202503', '48.1']],
  metaData: { items: { Uvn6LCg7dVU: { name: 'ANC 1 Coverage' }, O6uvpzGd5pu: { name: 'Bo' } } },
};
const disagg = {
  headers: [{ name: 'dx' }, { name: 'J5jldMd8OHv' }, { name: 'ou' }, { name: 'pe' }, { name: 'value' }],
  rows: [['hfdmMSPBgLG', 'uYxK4wmcPqA', 'ImspTQPwCqd', '2025', '12.3']],
  metaData: { items: { hfdmMSPBgLG: { name: 'ANC 4th or more visits' }, uYxK4wmcPqA: { name: 'CHP' } } },
};

it('builds fact rows with derived periodType and numeric value', () => {
  expect(analyticsToFactRows(resp)).toEqual([
    { dx: 'Uvn6LCg7dVU', ou: 'O6uvpzGd5pu', pe: '2025Q2', periodType: 'QUARTERLY', value: 144.77 },
    { dx: 'Uvn6LCg7dVU', ou: 'O6uvpzGd5pu', pe: '202503', periodType: 'MONTHLY', value: 48.1 },
  ]);
});
it('builds disaggregation rows with category id + resolved name', () => {
  expect(analyticsToDisaggRows(disagg, 'J5jldMd8OHv')).toEqual([
    { dx: 'hfdmMSPBgLG', ou: 'ImspTQPwCqd', pe: '2025', periodType: 'YEARLY',
      category_id: 'uYxK4wmcPqA', category_name: 'CHP', value: 12.3 },
  ]);
});
it('collects unique dx rows from metaData across responses (dx ids only)', () => {
  expect(dxRowsFromMeta([resp], ['Uvn6LCg7dVU'])).toEqual([{ id: 'Uvn6LCg7dVU', name: 'ANC 1 Coverage' }]);
});
