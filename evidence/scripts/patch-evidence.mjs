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
  '<EvidenceDefaultLayout {data} fullWidth={true} hideHeader={true} hideSidebar={true} hideTOC={true} hideBreadcrumbs={true} builtWithEvidence={false}>',
  'layout: full width + no Evidence header/sidebar/TOC (DNEMIS bar is the chrome)',
);

// DNEMIS header: a slim green title bar (crest + "Education Statistics") injected at the top
// of the content slot on every page. No module-link buttons. Static markup — no props.
const DNEMIS_NAV = `<div slot="content">
		<div class="dnemis-header">
			<span class="crest"><i class="fa-solid fa-landmark"></i></span>
			<div><div class="dt">Education Statistics</div><div class="ds">DNEMIS · Federal Ministry of Education, Nigeria</div></div>
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
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" />
</svelte:head>

<style>
	:global(body) { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
	/* Hide Evidence's auto page-title H1 — the portal title lives in the green header and the
	   current org unit is shown by the breadcrumb, so the frontmatter title (browser tab only)
	   shouldn't repeat as a heading. */
	:global(h1.title) { display: none; }
	.dnemis-header { background: linear-gradient(135deg, #0a3d2c, #0e5638); color: #fff; padding: 10px 16px; border-radius: 10px; margin: 0 0 16px; display: flex; align-items: center; gap: 12px; }
	.crest { font-size: 18px; width: 36px; height: 36px; flex: none; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #2fae6e, #0a3d2c); display: flex; align-items: center; justify-content: center; border: 2px solid rgba(255,255,255,.35); }
	.dt { font-weight: 800; font-size: 18px; letter-spacing: .4px; line-height: 1.1; }
	.ds { font-size: 11px; opacity: .82; font-weight: 300; }
</style>`;
patch(
  'src/pages/+layout.svelte',
  '</EvidenceDefaultLayout>',
  DNEMIS_STYLE,
  'DNEMIS header styles + Inter font',
);

console.log('Evidence template patched (adapter fallback + lazy DuckDB init + DHIS2 branding + DNEMIS nav).');
