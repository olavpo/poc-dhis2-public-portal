/**
 * Idempotent build-time optimisations + branding applied to the installed Evidence template.
 * These are NOT environment workarounds — the build is stock prerendering. They are:
 *
 *   1. adapter-static `fallback: '200.html'` — a safety net so a route the prerender
 *      crawler didn't reach still resolves client-side instead of 404-ing.
 *   2. lazy DuckDB-WASM init — defer booting the ~6 MB (compressed) engine until the
 *      first client-side query, so baked pages that only read prerendered .arrow
 *      results never download it.
 *   3. layout + branding — full-width content, a DHIS2 logo in place of the Evidence
 *      wordmark, and the "Built with Evidence" footer hidden. The default layout is the
 *      stock `<EvidenceDefaultLayout>`; we only pass its existing props.
 *
 * Patches the installed template so they survive the .evidence/template sync.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TPL = resolve(here, '../node_modules/@evidence-dev/evidence/template');
const USQL = resolve(here, '../node_modules/@evidence-dev/universal-sql');

function patchAbs(absPath, from, to, label) {
  let src = readFileSync(absPath, 'utf8');
  if (src.includes(to)) {
    console.log(`  [skip] ${label} already patched`);
    return;
  }
  if (!src.includes(from)) {
    throw new Error(`Cannot patch ${label}: anchor not found in ${absPath}`);
  }
  writeFileSync(absPath, src.replace(from, to));
  console.log(`  [ok]   ${label}`);
}

function patch(file, from, to, label) {
  const path = resolve(TPL, file);
  let src = readFileSync(path, 'utf8');
  if (src.includes(to)) {
    console.log(`  [skip] ${label} already patched`);
    return;
  }
  if (!src.includes(from)) {
    throw new Error(`Cannot patch ${label}: anchor not found in ${file}`);
  }
  src = src.replace(from, to);
  writeFileSync(path, src);
  console.log(`  [ok]   ${label}`);
}

// The site is prerendered (stock Evidence): the aggregate tier is baked into pages
// at build time, the school tier is loaded client-side on demand (SchoolExplorer).
// This requires Node-side DuckDB-WASM to reach extensions.duckdb.org at build, and
// clients to reach it at runtime (one-time, cached). No ssr/prerender overrides.

// adapter-static fallback: a safety net so any route not reached by the prerender
// crawler still resolves (served client-side) rather than 404-ing.
patch(
  'svelte.config.js',
  "pages: process.env.EVIDENCE_BUILD_DIR ?? './build',\n\t\t\tstrict: false",
  "pages: process.env.EVIDENCE_BUILD_DIR ?? './build',\n\t\t\tstrict: false,\n\t\t\tfallback: '200.html'",
  'adapter fallback',
);

// Lazy DuckDB init: by default the layout boots the ~6 MB (compressed) DuckDB-WASM
// engine on every page at module load. Make it lazy — start only on first await —
// so prerendered/baked pages (which read baked .arrow results, never calling the
// client query()) don't download the engine at all. Pages that actually query
// client-side (school drill-down, reactive filters) trigger it on demand.
patch(
  'src/pages/+layout.js',
  'const database_initialization = profile(loadDB);',
  'let __dbInit;\nconst database_initialization = { then: (res, rej) => (__dbInit ??= profile(loadDB)).then(res, rej) };',
  'lazy duckdb init',
);

// Layout + branding: pass props to the stock <EvidenceDefaultLayout>. fullWidth makes the
// content use the available width (so a single element fills the row and the responsive
// grids spread out); the logo props swap the Evidence wordmark for the DHIS2 mark
// (light/dark variants from evidence/static); builtWithEvidence={false} hides the footer.
patch(
  'src/pages/+layout.svelte',
  '<EvidenceDefaultLayout {data}>',
  '<EvidenceDefaultLayout {data} fullWidth={true} builtWithEvidence={false} lightLogo={"/dhis2-logo.svg"} darkLogo={"/dhis2-logo-dark.svg"}>',
  'layout: full width + DHIS2 logo + no Evidence footer',
);

console.log('Evidence template patched (adapter fallback + lazy DuckDB init + DHIS2 branding).');
