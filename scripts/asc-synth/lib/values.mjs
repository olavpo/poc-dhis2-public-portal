// scripts/asc-synth/lib/values.mjs
import { ranged } from './hash.mjs';

// Target per-SCHOOL TOTAL for a metric (the sum across the data element's category option
// combos). Chosen so derived indicators land in believable ranges — e.g. enrolment ~150-420
// and teachers ~20-55 per school give a pupil-teacher ratio around 25-45.
function targetBand(name) {
  const n = name.toLowerCase();
  // ~46 enrolment DEs sum into the GEN enrolment indicator, so keep each DE small:
  // ~30 each × 46 ≈ 1,350 learners/school, giving a believable pupil-teacher ratio ~30.
  if (n.includes('enrol')) return [15, 45];
  if (n.includes('teacher') || n.includes('staff')) return [20, 55];
  if (n.includes('classroom') || n.includes('toilet') || n.includes('computer') || n.includes('room')) return [4, 25];
  if (n.includes('special') || n.includes('orphan') || n.includes('dropout') || n.includes('boarding')) return [2, 40];
  return [10, 120]; // default
}

// Deterministic dummy value for one (ou, dataElement, categoryOptionCombo, period) cell.
// cocCount spreads the school total across the DE's COCs so aggregates stay realistic.
export function valueFor(ou, de, coc, period, cocCount = 1) {
  const [lo, hi] = targetBand(de.name || '');
  const cells = Math.max(1, cocCount);
  const cellLo = Math.max(0, Math.floor(lo / cells));
  const cellHi = Math.max(1, Math.ceil(hi / cells));
  return ranged(`${ou.id}|${de.id}|${coc}|${period}`, cellLo, cellHi);
}
