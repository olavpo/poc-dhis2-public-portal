import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export function loadConfig(path) {
  const raw = parse(readFileSync(path, 'utf8'));
  for (const key of ['baseUrl', 'dx', 'ouLevels', 'periods'])
    if (raw[key] == null) throw new Error(`config: missing required key "${key}"`);
  return {
    baseUrl: raw.baseUrl.replace(/\/$/, ''),
    dx: raw.dx,
    ouLevels: raw.ouLevels,
    periods: raw.periods,
    disaggregations: (raw.disaggregations ?? []).map((d) => ({
      dim: d.dim, slug: d.slug, dx: d.dx, ouLevels: d.ouLevels ?? [1],
    })),
  };
}
