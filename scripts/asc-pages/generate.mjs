// scripts/asc-pages/generate.mjs
// Writes one baked Evidence page per org unit in OUR synthetic subtree (rooted at ROOT),
// from the shared template: federal index.md + per-state + per-LGA pages. Skips the old
// fixture OUs (different root). Builds breadcrumb + cascading State/LGA nav selectors.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { page } from './template.mjs';

const ROOT = 'XCFhsuWEBdu'; // synthetic Nigeria (Federal) root — see scripts/asc-synth

// Tiny CSV reader — ou.csv has no embedded commas/quotes (ids, names, ints). No new dep.
function readCsv(path) {
  const [header, ...lines] = readFileSync(path, 'utf8').trim().split('\n');
  const cols = header.split(',');
  return lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v])));
}

const ou = readCsv('evidence/sources/census/ou.csv');
const byId = Object.fromEntries(ou.map((o) => [o.id, o]));

const inOurTree = (o) => { let c = o; while (c) { if (c.id === ROOT) return true; c = c.parent_id ? byId[c.parent_id] : null; } return false; };
const linkFor = (o) => (o.id === ROOT ? '/' : `/asc/${o.level === '2' ? 'state' : 'lga'}-${o.id}`);
const childrenOf = (id) => ou.filter((o) => o.parent_id === id).sort((a, b) => a.name.localeCompare(b.name));

const states = childrenOf(ROOT).map((s) => ({ name: s.name, link: linkFor(s) }));
const stateOptions = [{ name: 'Nigeria (all states)', link: '/' }, ...states];
const stateSelector = (currentName) => ({ label: 'State', currentName, disabled: false, options: stateOptions });
// LGA selector: disabled (empty) until a state is chosen; otherwise that state's LGAs.
const lgaSelector = (stateId, currentName) =>
  stateId
    ? { label: 'LGA', currentName, disabled: false, options: childrenOf(stateId).map((l) => ({ name: l.name, link: linkFor(l) })) }
    : { label: 'LGA', currentName: '', disabled: true, options: [] };

const crumbsOf = (o) => {
  const chain = []; let c = o;
  while (c) { chain.unshift(c); c = c.parent_id ? byId[c.parent_id] : null; }
  return chain.map((u, i) => ({ name: u.name, link: i === chain.length - 1 ? null : linkFor(u) }));
};

// Split the combined ou.geojson into per-scope boundary files so a page never downloads
// more geometry than it draws: the federal page loads only states; each state page loads
// only its own LGAs. (At real scale — 774 LGAs — this is the difference between a few KB
// per page and a multi-MB file on every page. See AGENTS.md / SERVER-ADMIN notes.)
const geo = JSON.parse(readFileSync('evidence/sources/census/ou.geojson', 'utf8'));
const feats = geo.features;
const fc = (features) => JSON.stringify({ type: 'FeatureCollection', features });
rmSync('evidence/static/asc', { recursive: true, force: true });
mkdirSync('evidence/static/asc', { recursive: true });
writeFileSync('evidence/static/asc/states.geojson', fc(feats.filter((f) => f.properties.level === 2)));
for (const st of childrenOf(ROOT)) {
  writeFileSync(`evidence/static/asc/lgas-${st.id}.geojson`,
    fc(feats.filter((f) => f.properties.level === 3 && f.properties.parent_id === st.id)));
}
console.log(`[asc-pages] wrote per-scope geojson: states + ${childrenOf(ROOT).length} state LGA files`);

rmSync('evidence/pages/asc', { recursive: true, force: true });
mkdirSync('evidence/pages/asc', { recursive: true });

let n = 0;
for (const o of ou) {
  if (!inOurTree(o)) continue;
  const crumbs = crumbsOf(o);
  if (o.level === '1') {
    const selectors = [stateSelector(''), lgaSelector(null, '')];
    writeFileSync('evidence/pages/index.md', page({ ou: o, crumbs, selectors, leaf: false, childLevel: 'State', childLinkPrefix: '/asc/state-', geoUrl: '/asc/states.geojson' }));
    n++;
  } else if (o.level === '2') {
    const selectors = [stateSelector(o.name), lgaSelector(o.id, '')];
    writeFileSync(`evidence/pages/asc/state-${o.id}.md`, page({ ou: o, crumbs, selectors, leaf: false, childLevel: 'LGA', childLinkPrefix: '/asc/lga-', geoUrl: `/asc/lgas-${o.id}.geojson` }));
    n++;
  } else if (o.level === '3') {
    const parent = byId[o.parent_id];
    const selectors = [stateSelector(parent.name), lgaSelector(parent.id, o.name)];
    writeFileSync(`evidence/pages/asc/lga-${o.id}.md`, page({ ou: o, crumbs, selectors, leaf: true }));
    n++;
  }
  // level 4 (schools) -> no page; invisible data leaves only
}
console.log(`[asc-pages] generated ${n} baked pages (federal + states + LGAs)`);
