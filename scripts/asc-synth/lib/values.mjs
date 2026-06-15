// scripts/asc-synth/lib/values.mjs
import { ranged } from './hash.mjs';

// Infer a plausible magnitude band from the data element name.
function band(name) {
  const n = name.toLowerCase();
  if (n.includes('enrol')) return [120, 900];
  if (n.includes('teacher') || n.includes('staff')) return [6, 60];
  if (n.includes('classroom') || n.includes('toilet') || n.includes('computer') || n.includes('room')) return [2, 40];
  if (n.includes('special') || n.includes('orphan') || n.includes('dropout') || n.includes('boarding')) return [0, 30];
  return [10, 200]; // default
}

export function valueFor(ou, de, coc, period) {
  const [min, max] = band(de.name || '');
  return ranged(`${ou.id}|${de.id}|${coc}|${period}`, min, max);
}
