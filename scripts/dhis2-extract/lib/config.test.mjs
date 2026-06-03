import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from './config.mjs';
const here = dirname(fileURLToPath(import.meta.url));

it('loads and normalises a minimal config', () => {
  const c = loadConfig(join(here, '__fixtures__/minimal.yaml'));
  expect(c.baseUrl).toBe('https://example.org/dhis');
  expect(c.dx).toEqual(['Uvn6LCg7dVU']);
  expect(c.ouLevels).toEqual([1, 2]);
  expect(c.disaggregations).toEqual([]);          // default
  expect(c.periods.types).toEqual(['yearly']);
});
it('throws on missing required keys', () => {
  expect(() => loadConfig(join(here, '__fixtures__/does-not-exist.yaml'))).toThrow();
});
