// scripts/asc-pages/generate.mjs
// Writes one baked Evidence page per org unit in OUR synthetic subtree (rooted at ROOT),
// from the shared template: federal index.md + per-state + per-LGA pages. Skips the old
// fixture OUs (different root) so no stray pages are produced.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { page } from './template.mjs';

const ROOT = 'XCFhsuWEBdu'; // synthetic Nigeria (Federal) root — see scripts/asc-synth

// Tiny CSV reader — ou.csv has no embedded commas/quotes (ids, names, ints). No new dep.
function readCsv(path) {
  const [header, ...lines] = readFileSync(path, 'utf8').trim().split('\n');
  const cols = header.split(',');
  return lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v])));
}

const ou = readCsv('evidence/sources/asc/ou.csv');
const byId = Object.fromEntries(ou.map((o) => [o.id, o]));

// Only OUs in our subtree (walk parent_id up to ROOT).
const inOurTree = (o) => {
  let c = o;
  while (c) { if (c.id === ROOT) return true; c = c.parent_id ? byId[c.parent_id] : null; }
  return false;
};

const linkFor = (o) => (o.level === '1' ? '/' : `/asc/${o.level === '2' ? 'state' : 'lga'}-${o.id}`);

const ancestorsOf = (o) => {
  const chain = [];
  let c = o;
  while (c) { chain.unshift(c); c = c.parent_id ? byId[c.parent_id] : null; }
  return chain.map((u, i) => ({ name: u.name, link: i === chain.length - 1 ? null : linkFor(u) }));
};

rmSync('evidence/pages/asc', { recursive: true, force: true });
mkdirSync('evidence/pages/asc', { recursive: true });

let n = 0;
for (const o of ou) {
  if (!inOurTree(o)) continue;
  const ancestors = ancestorsOf(o);
  if (o.level === '1') {
    writeFileSync('evidence/pages/index.md', page({ ou: o, ancestors, leaf: false, childLevel: 'State', childLinkPrefix: '/asc/state-' }));
    n++;
  } else if (o.level === '2') {
    writeFileSync(`evidence/pages/asc/state-${o.id}.md`, page({ ou: o, ancestors, leaf: false, childLevel: 'LGA', childLinkPrefix: '/asc/lga-' }));
    n++;
  } else if (o.level === '3') {
    writeFileSync(`evidence/pages/asc/lga-${o.id}.md`, page({ ou: o, ancestors, leaf: true }));
    n++;
  }
  // level 4 (schools) -> no page; invisible data leaves only
}
console.log(`[asc-pages] generated ${n} baked pages (federal + states + LGAs)`);
