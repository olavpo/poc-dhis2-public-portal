// scripts/asc-pages/generate.mjs
// Writes one baked Evidence page per org unit (Federal=1 / State=2 / LGA=3) from the shared
// template: federal index.md + per-state + per-LGA pages. Also writes per-scope geojson and
// a single org-unit search index. Root is derived from the data.
//
// Optional preview cap (for a fast local build): ASC_MAX_STATES / ASC_MAX_LGAS limit how
// many states / LGAs-per-state get pages. Unset = full build (all states, all LGAs).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { page, leafDynamicPage } from './template.mjs';

const MAX_STATES = Number(process.env.ASC_MAX_STATES) || Infinity;
const MAX_LGAS = Number(process.env.ASC_MAX_LGAS) || Infinity;

// Tiny CSV reader — ou.csv has no embedded commas/quotes (ids, names, ints). No new dep.
function readCsv(path) {
  const [header, ...lines] = readFileSync(path, 'utf8').trim().split('\n');
  const cols = header.split(',');
  return lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v])));
}

// OU names carry a 2-letter lowercase prefix ("fg Nigeria", "ke Zuru LGA"); strip it for
// display. Done once here so titles, breadcrumbs, the search index and the unit label are
// all clean; map tooltips / compare tables strip the same prefix in SQL (template.mjs).
const clean = (s) => (s || '').replace(/^[a-z]{2} /, '');

const ou = readCsv('evidence/sources/census/ou.csv');
ou.forEach((o) => { o.name = clean(o.name); o.parent_name = clean(o.parent_name); });
const byId = Object.fromEntries(ou.map((o) => [o.id, o]));
const root = ou.find((o) => o.level === '1');           // the single Federal root, from the data
const ROOT = root.id;

// Base path (Evidence deployment.basePath) baked into every emitted link, geojson URL and
// search-index entry. Needed because AreaMap (geoJsonUrl/link) and our custom <a> components
// (ScopeNav, CompareTable, OrgSearch) consume these URLs RAW — Evidence does not run them
// through addBasePath. Single source of truth: evidence.config.yaml. Empty ⇒ served at root.
const BASE = (readFileSync('evidence/evidence.config.yaml', 'utf8')
  .match(/^\s*basePath:\s*["']?(\/[^"'\s]*?)\/?["']?\s*$/m)?.[1]) || '';

// Federal → '<base>/'; State → '<base>/asc/state-<id>' (prerendered/baked); LGA →
// '<base>/asc/lga/<id>' (a subdir so a single +layout.js can mark the whole LGA tree
// prerender:false → those 774 pages are served via the SPA fallback and rendered on-demand,
// keeping the baked build to ~38 pages).
const linkFor = (o) => (o.id === ROOT ? `${BASE}/` : o.level === '2' ? `${BASE}/asc/state-${o.id}` : `${BASE}/asc/lga/${o.id}`);
const childrenOf = (id) => ou.filter((o) => o.parent_id === id).sort((a, b) => a.name.localeCompare(b.name));

// Absolute origin for canonical URLs, the sitemap and JSON-LD (override per-deploy with
// ASC_ORIGIN). linkFor already includes the basePath, so canonFor is origin + linkFor.
const ORIGIN = (process.env.ASC_ORIGIN || 'https://emis.education.gov.ng').replace(/\/+$/, '');
// Trailing slash to match the served URL / the layout's $page.url.pathname canonical (SvelteKit
// serves each baked page as <dir>/index.html → the canonical form ends in '/'). Keeps the sitemap
// <loc> byte-identical to the <link rel="canonical"> on the page.
const canonFor = (o) => ORIGIN + linkFor(o).replace(/\/?$/, '/');

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
mkdirSync('evidence/pages/asc/lga', { recursive: true });
// LGA leaf pages are NOT prerendered — this layout marks the whole /asc/lga/* subtree
// prerender:false, so SvelteKit bakes only Federal + States (~38 pages, avoids the 16 GB OOM)
// and serves LGAs via the adapter-static fallback (rendered client-side on demand). Evidence
// copies non-.md files from pages/ as-is, so this lands at src/pages/asc/lga/+layout.js.
writeFileSync('evidence/pages/asc/lga/+layout.js',
  '// Auto-generated by scripts/asc-pages/generate.mjs — keep LGA pages out of the prerender.\n' +
  'export const prerender = false;\n');

let n = 0;
// federal (the root IS federal, so no "unit vs federal" — Benchmark shows the Federal column only)
writeFileSync('evidence/pages/index.md', page({
  ou: root, crumbs: crumbsOf(root), childLevel: 'State',
  childLinkPrefix: `${BASE}/asc/state-`, geoUrl: `${BASE}/asc/states.geojson`, federalId: ROOT, unitLabel: '',
}));
n++;
for (const s of states) {
  writeFileSync(`evidence/pages/asc/state-${s.id}.md`, page({
    ou: s, crumbs: crumbsOf(s), childLevel: 'LGA',
    childLinkPrefix: `${BASE}/asc/lga/`, geoUrl: `${BASE}/asc/lgas-${s.id}.geojson`, federalId: ROOT, unitLabel: s.name,
  }));
  n++;
}

// SEO: sitemap.xml + robots.txt (static → copied to the build root, served under the basePath).
// Only the baked pages go in the sitemap — Federal + every State. LGA pages are the single
// prerender:false SPA route, so they're intentionally excluded (not reliably indexable).
const today = new Date().toISOString().slice(0, 10);
const sitemapUrls = [root, ...states].map((o) => {
  const priority = o.id === ROOT ? '1.0' : '0.8';
  return `  <url>\n    <loc>${canonFor(o)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}).join('\n');
writeFileSync('evidence/static/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls}\n</urlset>\n`);
writeFileSync('evidence/static/robots.txt',
  `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}${BASE}/sitemap.xml\n`);
console.log(`[asc-pages] sitemap: ${1 + states.length} baked URLs · robots.txt (origin ${ORIGIN})`);
// All LGAs share ONE dynamic, client-rendered route (/asc/lga/[id]) — see leafDynamicPage.
writeFileSync('evidence/pages/asc/lga/[id].md', leafDynamicPage(ROOT, BASE));
console.log(`[asc-pages] generated ${n} baked pages (federal + ${states.length} states) + 1 dynamic LGA route`);
