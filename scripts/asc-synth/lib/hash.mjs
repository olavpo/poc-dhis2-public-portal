// scripts/asc-synth/lib/hash.mjs
// Deterministic FNV-1a 32-bit hash — no Math.random, stable across runs.
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Map a seed string deterministically into an integer in [min, max].
export function ranged(seed, min, max) {
  const span = max - min + 1;
  return min + (hash32(seed) % span);
}
