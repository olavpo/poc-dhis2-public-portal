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

// DNEMIS module nav: a prominent green header with the six emis.education.gov.ng module
// links (ASC active, the rest external) injected at the top of the content slot on every
// page. Static markup — no props, no engine.
const DNEMIS_NAV = `<div slot="content">
		<div class="dnemis-header">
			<div class="dnemis-brand"><span class="crest">🇳🇬</span><div><div class="dt">DNEMIS</div><div class="ds">Enhancing Education for a Brighter Future</div></div></div>
			<nav class="dnemis-nav">
				<a class="mod active" href="/">📊 Annual School Census</a>
				<a class="mod" href="https://nlin.education.gov.ng/dhis" target="_blank" rel="noopener">🎓 Learner Registry</a>
				<a class="mod" href="https://sites.google.com/view/nemisknowledgebase/" target="_blank" rel="noopener">📚 Knowledge Base</a>
				<a class="mod" href="https://asc.education.gov.ng" target="_blank" rel="noopener">🛡️ Safe Schools</a>
				<a class="mod" href="https://collect.ncaoosce.gov.ng" target="_blank" rel="noopener">🛡️ NCAOOSCE</a>
				<a class="mod" href="https://nimebss.vercel.app" target="_blank" rel="noopener">🛡️ School Grading</a>
			</nav>
		</div>
		<slot />
	</div>`;
patch(
  'src/pages/+layout.svelte',
  '<slot slot="content" />',
  DNEMIS_NAV,
  'DNEMIS module nav',
);

// Inter font (global) + the DNEMIS header styles. Appended after the layout markup.
const DNEMIS_STYLE = `</EvidenceDefaultLayout>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
</svelte:head>

<style>
	:global(body) { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
	.dnemis-header { background: linear-gradient(135deg, #0a3d2c, #0e5638); color: #fff; padding: 16px 20px; border-radius: 10px; margin: 0 0 18px; }
	.dnemis-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
	.crest { font-size: 22px; width: 42px; height: 42px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #2fae6e, #0a3d2c); display: flex; align-items: center; justify-content: center; border: 2px solid rgba(255,255,255,.35); }
	.dt { font-weight: 800; font-size: 20px; letter-spacing: .5px; }
	.ds { font-size: 11px; opacity: .82; font-weight: 300; }
	.dnemis-nav { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
	.mod { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); border-radius: 8px; padding: 10px 8px; text-align: center; font-size: 12px; font-weight: 500; color: #fff; text-decoration: none; line-height: 1.3; transition: background .15s; }
	.mod.active { background: #1a9c5b; border-color: #1a9c5b; font-weight: 700; }
	.mod:hover { background: rgba(255,255,255,.18); }
	@media (max-width: 700px) { .dnemis-nav { grid-template-columns: repeat(2, 1fr); } }
</style>`;
patch(
  'src/pages/+layout.svelte',
  '</EvidenceDefaultLayout>',
  DNEMIS_STYLE,
  'DNEMIS header styles + Inter font',
);

console.log('Evidence template patched (adapter fallback + lazy DuckDB init + DHIS2 branding + DNEMIS nav).');
