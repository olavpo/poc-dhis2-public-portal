// scripts/asc-pages/generate.mjs
// Writes one baked Evidence page per org unit (Federal=1 / State=2 / LGA=3) from the shared
// template: federal index.md + per-state + per-LGA pages. Also writes per-scope geojson and
// a single org-unit search index. Root is derived from the data.
//
// Optional preview cap (for a fast local build): ASC_MAX_STATES / ASC_MAX_LGAS limit how
// many states / LGAs-per-state get pages. Unset = full build (all states, all LGAs).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { page } from './template.mjs';

const MAX_STATES = Number(process.env.ASC_MAX_STATES) || Infinity;
const MAX_LGAS = Number(process.env.ASC_MAX_LGAS) || Infinity;

// Tiny CSV reader — ou.csv has no embedded commas/quotes (ids, names, ints). No new dep.
function readCsv(path) {
  const [header, ...lines] = readFileSync(path, 'utf8').trim().split('\n');
  const cols = header.split(',');
  return lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v])));
}

const ou = readCsv('evidence/sources/census/ou.csv');
const byId = Object.fromEntries(ou.map((o) => [o.id, o]));
const root = ou.find((o) => o.level === '1');           // the single Federal root, from the data
const ROOT = root.id;
const linkFor = (o) => (o.id === ROOT ? '/' : `/asc/${o.level === '2' ? 'state' : 'lga'}-${o.id}`);
const childrenOf = (id) => ou.filter((o) => o.parent_id === id).sort((a, b) => a.name.localeCompare(b.name));

const crumbsOf = (o) => {
  const chain = []; let c = o;
  while (c) { chain.unshift(c); c = c.parent_id ? byId[c.parent_id] : null; }
  return chain.map((u, i) => ({ name: u.name, link: i === chain.length - 1 ? null : linkFor(u) }));
};

// Which states/LGAs to generate (capped in preview mode).
const states = childrenOf(ROOT).slice(0, MAX_STATES);
const lgasByState = new Map(states.map((s) => [s.id, childrenOf(s.id).slice(0, MAX_LGAS)]));

// --- per-scope geojson (federal loads states; each state loads only its own LGAs) ---
const geo = JSON.parse(readFileSync('evidence/sources/census/ou.geojson', 'utf8'));
const feats = geo.features;
const fc = (features) => JSON.stringify({ type: 'FeatureCollection', features });
rmSync('evidence/static/asc', { recursive: true, force: true });
mkdirSync('evidence/static/asc', { recursive: true });
writeFileSync('evidence/static/asc/states.geojson', fc(feats.filter((f) => f.properties.level === 2)));
for (const st of states) {
  writeFileSync(`evidence/static/asc/lgas-${st.id}.geojson`,
    fc(feats.filter((f) => f.properties.level === 3 && f.properties.parent_id === st.id)));
}

// --- one org-unit search index (states + LGAs), fetched once by OrgSearch ---
const searchIndex = [];
for (const s of states) {
  searchIndex.push({ label: s.name, link: linkFor(s) });
  for (const l of lgasByState.get(s.id)) searchIndex.push({ label: `${s.name} › ${l.name}`, link: linkFor(l) });
}
writeFileSync('evidence/static/asc/search-index.json', JSON.stringify(searchIndex));
console.log(`[asc-pages] geojson: states + ${states.length} state files; search index: ${searchIndex.length} units`);

// --- pages ---
rmSync('evidence/pages/asc', { recursive: true, force: true });
mkdirSync('evidence/pages/asc', { recursive: true });

let n = 0;
// federal (the root IS federal, so no "unit vs federal" — Benchmark shows the Federal column only)
writeFileSync('evidence/pages/index.md', page({
  ou: root, crumbs: crumbsOf(root), leaf: false, childLevel: 'State',
  childLinkPrefix: '/asc/state-', geoUrl: '/asc/states.geojson', federalId: ROOT, unitLabel: '',
}));
n++;
for (const s of states) {
  writeFileSync(`evidence/pages/asc/state-${s.id}.md`, page({
    ou: s, crumbs: crumbsOf(s), leaf: false, childLevel: 'LGA',
    childLinkPrefix: '/asc/lga-', geoUrl: `/asc/lgas-${s.id}.geojson`, federalId: ROOT, unitLabel: s.name,
  }));
  n++;
  for (const l of lgasByState.get(s.id)) {
    writeFileSync(`evidence/pages/asc/lga-${l.id}.md`, page({
      ou: l, crumbs: crumbsOf(l), leaf: true, federalId: ROOT, unitLabel: l.name,
    }));
    n++;
  }
}
console.log(`[asc-pages] generated ${n} baked pages (federal + ${states.length} states + their LGAs)`);
