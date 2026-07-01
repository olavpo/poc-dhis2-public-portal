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
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TPL = resolve(here, '../node_modules/@evidence-dev/evidence/template');
const USQL = resolve(here, '../node_modules/@evidence-dev/universal-sql');
const STATIC = resolve(here, '../static');

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

// DHIS2 favicon: replace Evidence's default favicon.ico + icon.svg with the DHIS2 mark
// (evidence/static/dhis2-favicon.svg). %sveltekit.assets% keeps the href correct under a
// basePath. apple-touch-icon / manifest are left as Evidence's.
patch(
  'src/app.html',
  '\t\t<link rel="icon" href="%sveltekit.assets%/favicon.ico" sizes="32x32" />\n\t\t<link rel="icon" href="%sveltekit.assets%/icon.svg" type="image/svg+xml" />',
  '\t\t<link rel="icon" type="image/svg+xml" href="%sveltekit.assets%/dhis2-favicon.svg" />',
  'dhis2 favicon',
);

// Overwrite EVERY default Evidence icon shipped by the template (favicon.ico, the auto-discovered
// icon.svg, the iOS apple-touch-icon and the PWA manifest icons) with the project's DHIS2
// school-glyph versions from evidence/static/. Project static is also merged into the build,
// but copying into the template static here guarantees it regardless of static-merge precedence —
// so no Evidence-branded icon survives anywhere in the build, not just the <link>-referenced one.
for (const f of ['favicon.ico', 'icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
  try {
    copyFileSync(resolve(STATIC, f), resolve(TPL, 'static', f));
    console.log(`  [ok]   icon ${f} (DHIS2 school glyph)`);
  } catch (e) {
    console.warn(`  [warn] icon ${f} not copied: ${e.message}`);
  }
}

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

// Tolerate the adapter-static `fallback: '200.html'` in getPrerenderedQueries. For a
// prerender:false route (the LGA subtree, /asc/lga/[id]), its `all-queries.json` does not
// exist, so the fallback serves the SPA shell — HTML with status 200. Stock code only guards
// `!res.ok`, then does `res.json()`, which throws on the HTML ("Unexpected token '<'") and
// surfaces as "Error in client-side routing". Treat a non-JSON body as "no prerendered
// queries" so the page runs its queries live in DuckDB-WASM instead of crashing.
patch(
  'src/pages/+layout.js',
  'const sql_cache_with_hashed_query_strings = await res.json();',
  'let sql_cache_with_hashed_query_strings;\n\ttry {\n\t\tsql_cache_with_hashed_query_strings = await res.json();\n\t} catch {\n\t\treturn {}; // SPA fallback (200.html) served instead of a prerendered-query manifest\n\t}',
  'getPrerenderedQueries tolerates SPA fallback',
);

// Map interaction. Evidence's Leaflet maps (the children choropleth) get the **+/- zoom control**
// and **drag-to-pan**, but the gesture-zoom handlers (scroll/smooth-wheel, double-click, box,
// pinch, keyboard) stay off so the map never hijacks page scroll. Per-area `click` handlers live
// on the layers, so drill-down + tooltips still work.
//
// The installed file may be in one of two states — fresh stock, or an earlier "click-only" build
// (where `dragging` was disabled) — so `mapOpt` re-reads each time and is a silent no-op when its
// anchor is absent (a sibling line handles that state), converging both to the same end result
// without noisy warnings.
const EVIDENCE_MAP = resolve(here, '../node_modules/@evidence-dev/core-components/dist/unsorted/viz/map/EvidenceMap.js');
function mapOpt(from, to, label) {
  let src;
  try { src = readFileSync(EVIDENCE_MAP, 'utf8'); }
  catch (e) { console.warn(`  [warn] ${label}: ${e.message}`); return; }
  if (src.includes(to)) { console.log(`  [skip] ${label} already patched`); return; }
  if (!src.includes(from)) return; // not applicable in this state — a sibling line covers it
  writeFileSync(EVIDENCE_MAP, src.replace(from, to));
  console.log(`  [ok]   ${label}`);
}
mapOpt('zoomControl: false,', 'zoomControl: true, // DNEMIS: +/- zoom buttons', 'map: +/- zoom control');
// fresh stock → drag-pan + zoom buttons; no wheel/pinch/double-click/box/keyboard gesture zoom
mapOpt(
  'scrollWheelZoom: false, // disable original zoom function',
  'scrollWheelZoom: false, dragging: true, doubleClickZoom: false, boxZoom: false, touchZoom: false, keyboard: false, // DNEMIS: drag-pan + zoom buttons only',
  'map: gesture config (drag-pan, no wheel/pinch zoom)',
);
// migrate an earlier click-only build (drag-pan was disabled) to drag-pan
mapOpt('dragging: false,', 'dragging: true,', 'map: enable drag-pan');
mapOpt('smoothWheelZoom: true, // enable smooth zoom', 'smoothWheelZoom: false, // DNEMIS: no scroll-wheel zoom', 'map: disable smooth-wheel zoom');

// Self-hosted DuckDB extensions: when the browser engine first calls read_parquet() (LGA pages)
// it autoloads `parquet.duckdb_extension.wasm` from its compiled-in repository
// (extensions.duckdb.org) — a third-party host we don't control, so Cloudflare returns
// cf-cache-status: DYNAMIC and it stays a runtime dependency. `scripts/fetch-duckdb-extensions.mjs`
// mirrors that extension into evidence/static/duckdb-extensions/<version>/wasm_eh/; here we point
// the engine at it. Gated on VITE_DUCKDB_EXT_REPO (set by `npm run build` only after the mirror
// step) so the redirect activates only when the files exist — otherwise the engine falls back to
// its default repository, unchanged (e.g. `npm run dev`). The repo value is origin-relative
// (`/portal/duckdb-extensions`) resolved against location.origin at runtime; the engine appends
// `/<version>/wasm_eh/<name>.duckdb_extension.wasm` itself, matching the mirrored layout.
patchAbs(
  resolve(USQL, 'src/client-duckdb/browser.js'),
  "\t\tawait connection.query('SET old_implicit_casting = true;');\n\n\t\tresolveInit();",
  "\t\tawait connection.query('SET old_implicit_casting = true;');\n\n" +
    "\t\t// DNEMIS: redirect extension autoload to our own origin (cacheable) — see patch-evidence.mjs.\n" +
    "\t\tif (import.meta.env.VITE_DUCKDB_EXT_REPO) {\n" +
    "\t\t\tconst __r = import.meta.env.VITE_DUCKDB_EXT_REPO;\n" +
    "\t\t\tconst __repo = __r.startsWith('http') ? __r : new URL(__r, location.origin).href;\n" +
    "\t\t\tfor (const __s of ['custom_extension_repository', 'autoinstall_extension_repository']) {\n" +
    "\t\t\t\ttry { await connection.query(`SET ${__s}='${__repo}';`); } catch (e) { /* setting absent on this version */ }\n" +
    "\t\t\t}\n" +
    "\t\t}\n\n" +
    "\t\tresolveInit();",
  'duckdb self-hosted extension repository',
);

// Drop the ~3,200-icon Simple Icons brand-logo set from the app bundle. Two of Evidence's
// source-config components — NewSourceForm.svelte and SourceConfigRow.svelte — do
// `import * as simpleIcons from '@steeze-ui/simple-icons'`. That namespace import defeats
// tree-shaking, so the ENTIRE brand-logo set (~4.9 MB on disk, ~1.9 MB gzip) lands in the
// app-level vendor chunk that every page statically imports (incl. the baked Federal/State
// pages). Those source-config components are Evidence's interactive "add a data source"
// authoring UI — never reachable in this prerendered public portal — and they only use the
// set via dynamic `simpleIcons[name]` lookup + `name in simpleIcons`, both of which a `{}`
// stub satisfies (missing icon → `<Icon src={undefined}>`, harmless, and never rendered here).
// Replacing the two namespace imports lets Rollup drop the whole set; Header.svelte's *named*
// simple-icon imports remain and tree-shake to just the handful it actually references.
const CORE = resolve(here, '../node_modules/@evidence-dev/core-components/dist');
for (const f of ['organisms/source-config/NewSourceForm.svelte', 'organisms/source-config/SourceConfigRow.svelte']) {
  patchAbs(
    resolve(CORE, f),
    "import * as simpleIcons from '@steeze-ui/simple-icons';",
    "const simpleIcons = {}; // DNEMIS: stub — brand-logo set never rendered on the static portal (see patch-evidence.mjs)",
    `drop simple-icons namespace import (${f.split('/').pop()})`,
  );
}

// Layout + branding + DNEMIS header. The layout is fully under our control, so instead of
// fragile anchor patches (which break the moment the injected markup changes) we WRITE the
// whole +layout.svelte deterministically — idempotent regardless of its prior state:
//   • <EvidenceDefaultLayout> props: full width, no Evidence header/sidebar/TOC/footer (the
//     DNEMIS green bar is the only chrome).
//   • DNEMIS header: coat of arms + full title "Digital Nigeria Education Management
//     Information System (DNEMIS)" + a Print button (Evidence's built-in export-beforeprint/
//     window.print()/export-afterprint, so charts/maps render correctly for paper).
//   • Inter + Font Awesome, h1.title hidden, and an @media print rule that drops the print
//     button and the interactive control bar.
//   • A discrete build-timestamp footer ("Generated <date>, <time> UTC") baked in at build
//     time (no client/engine cost). Because this stamp changes every build, the layout is
//     rewritten on every run — the [skip] "already current" branch below intentionally never
//     fires for the layout. That is expected, not a stale-cache symptom.
//
// Build timestamp, formatted in UTC so it is correct regardless of the build machine's clock.
const buildStamp = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', dateStyle: 'long', timeStyle: 'short',
}).format(new Date()).replace(' at ', ', ') + ' UTC';
const LAYOUT = `<script>
	import '@evidence-dev/tailwind/fonts.css';
	import '../app.css';
	import { EvidenceDefaultLayout } from '@evidence-dev/core-components';
	import { base } from '$app/paths';
	export let data;
</script>

<EvidenceDefaultLayout {data} fullWidth={true} hideHeader={true} hideSidebar={true} hideTOC={true} hideBreadcrumbs={true} builtWithEvidence={false}>
	<div slot="content">
		<div class="dnemis-header">
			<span class="crest"><img src="{base}/coat_of_arms.png" alt="Nigerian Coat of Arms" /></span>
			<div><div class="dt">Education Statistics</div><div class="ds">Nigeria Federal Ministry of Education | Digital Nigeria Education Management Information System</div></div>
			<button class="printbtn" type="button" title="Download this page as PDF"
				on:click={() => { window.dispatchEvent(new Event('export-beforeprint')); setTimeout(() => window.print(), 0); setTimeout(() => window.dispatchEvent(new Event('export-afterprint')), 0); }}>
				<i class="fa-solid fa-download"></i><span>Download PDF</span>
			</button>
		</div>
		<slot />
		<footer class="dnemis-footer">Generated ${buildStamp}</footer>
	</div>
</EvidenceDefaultLayout>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" />
</svelte:head>

<style>
	:global(body) { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
	/* Hide Evidence's auto page-title H1 — the portal title lives in the green header and the
	   current org unit is shown by the breadcrumb. */
	:global(h1.title) { display: none; }
	.dnemis-header { background: linear-gradient(135deg, #0a3d2c, #0e5638); color: #fff; padding: 10px 16px; border-radius: 10px; margin: 0 0 16px; display: flex; align-items: center; gap: 12px; }
	.crest { width: 44px; height: 44px; flex: none; border-radius: 8px; background: #fff; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.5); padding: 3px; }
	.crest img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
	.dt { font-weight: 800; font-size: 19px; letter-spacing: .3px; line-height: 1.1; }
	.ds { font-size: 11px; opacity: .82; font-weight: 300; margin-top: 2px; }
	.printbtn { margin-left: auto; flex: none; display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px; border: 1px solid rgba(255,255,255,.4); border-radius: 8px; background: rgba(255,255,255,.12); color: #fff; font-size: 12.5px; font-weight: 600; cursor: pointer; }
	.printbtn:hover { background: rgba(255,255,255,.22); }
	.dnemis-footer { margin: 28px 0 8px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 11.5px; color: #94a3b8; font-weight: 400; }
	@media (max-width: 560px) { .dt { font-size: 14px; } .printbtn span { display: none; } }
	@media print {
		.printbtn { display: none !important; }
		:global(.controlbar) { display: none !important; }
		.dnemis-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
		/* Don't split a chart / KPI card / table / donut across a page boundary, and keep a
		   heading with the block that follows it. */
		:global(canvas), :global(.kpi), :global(.cell), :global(.block),
		:global([class*='chart']) { break-inside: avoid; }
		/* tables must flow across pages (thead repeats) — don't avoid-break them, or a long
		   table jumps to the next page leaving a blank gap under its heading. */
		:global(h1), :global(h2), :global(h3) { break-after: avoid; }
		:global(thead) { display: table-header-group; }
	}
</style>
`;
const layoutPath = resolve(TPL, 'src/pages/+layout.svelte');
if (readFileSync(layoutPath, 'utf8') === LAYOUT) {
  console.log('  [skip] layout (DNEMIS header) already current');
} else {
  writeFileSync(layoutPath, LAYOUT);
  console.log('  [ok]   layout (DNEMIS header: arms + full title + print button) written');
}

console.log('Evidence template patched (adapter fallback + lazy DuckDB init + DNEMIS branding).');
