// scripts/asc-synth/lib/hierarchy.mjs
import { ranged } from './hash.mjs';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ALNUM = ALPHA + '0123456789';

// FNV-1a with an avalanche finalizer — plain FNV-1a has weak avalanche on the
// near-identical short keys we generate ("school-0-2-6" vs "school-1-0-1"), which
// collides; the finalizer + two seeds give ~64 bits and collision-free uids across
// the 319-unit set (verified).
function mix(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}

// Deterministic, collision-free DHIS2 uid (11 chars, leading letter) from a key string.
export function uid(key) {
  const a = mix(key, 0x811c9dc5), b = mix(key, 0x9e3779b1);
  const chars = [ALPHA[a % ALPHA.length]];
  let lo = a, hi = b;
  for (let i = 0; i < 10; i++) {
    const t = (Math.imul(lo, 0x2c1b3c6d) ^ hi) >>> 0;
    chars.push(ALNUM[t % ALNUM.length]);
    hi = lo; lo = (t ^ (t >>> 13)) >>> 0;
  }
  return chars.join('');
}

// Plausible Nigerian state / LGA names (illustrative, synthetic).
const STATES = ['Kano', 'Lagos', 'Kaduna', 'Rivers', 'Oyo', 'Borno'];

export function buildHierarchy() {
  const N_STATES = 6, N_LGAS = 4, N_SCHOOLS = 12;
  const units = [];
  const root = { id: uid('nation'), name: 'Nigeria (Federal)', level: 1, parent: null, ownership: null };
  units.push(root);
  for (let s = 0; s < N_STATES; s++) {
    const stName = STATES[s];
    const st = { id: uid(`state-${s}`), name: `${stName} State`, level: 2, parent: root.id, ownership: null };
    units.push(st);
    for (let l = 0; l < N_LGAS; l++) {
      const lga = { id: uid(`lga-${s}-${l}`), name: `${stName} LGA ${l + 1}`, level: 3, parent: st.id, ownership: null };
      units.push(lga);
      for (let sc = 0; sc < N_SCHOOLS; sc++) {
        const key = `school-${s}-${l}-${sc}`;
        units.push({
          id: uid(key),
          name: `${stName} School ${l + 1}-${sc + 1}`,
          level: 4,
          parent: lga.id,
          // ~70% public, deterministic
          ownership: ranged(key + ':own', 0, 9) < 7 ? 'Public' : 'Private',
        });
      }
    }
  }
  return { units, root };
}
