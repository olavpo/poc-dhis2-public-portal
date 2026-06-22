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

// Layout + branding + DNEMIS header. The layout is fully under our control, so instead of
// fragile anchor patches (which break the moment the injected markup changes) we WRITE the
// whole +layout.svelte deterministically — idempotent regardless of its prior state:
//   • <EvidenceDefaultLayout> props: full width, no Evidence header/sidebar/TOC/footer (the
//     DNEMIS green bar is the only chrome).
//   • DNEMIS header: coat of arms + full title "Digital National Education Management
//     Information System (DNEMIS)" + a Print button (Evidence's built-in export-beforeprint/
//     window.print()/export-afterprint, so charts/maps render correctly for paper).
//   • Inter + Font Awesome, h1.title hidden, and an @media print rule that drops the print
//     button and the interactive control bar.
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
			<div><div class="dt">Education Statistics</div><div class="ds">Nigeria Federal Ministry of Education | Digital National Education Management Information System</div></div>
			<button class="printbtn" type="button" title="Download this page as PDF"
				on:click={() => { window.dispatchEvent(new Event('export-beforeprint')); setTimeout(() => window.print(), 0); setTimeout(() => window.dispatchEvent(new Event('export-afterprint')), 0); }}>
				<i class="fa-solid fa-download"></i><span>Download PDF</span>
			</button>
		</div>
		<slot />
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
