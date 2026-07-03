# Self-host Font Awesome icons

2026-07-02

## Context

The portal has been removing third-party runtime origins one at a time (see
`self-host-fonts-icons` memory / CHANGELOG "Unreleased"). Inter is now fully first-party
(Evidence bundles it). The last remaining third-party origin is `cdnjs.cloudflare.com`,
loading Font Awesome's `all.min.css` + `fa-solid-900.woff2` — non-blocking (`media="print"`
trick) but still an external DNS/TLS/RTT hop, which matters on unreliable Nigerian networks,
plus the full webfont weight for 9 glyphs.

Only **9** glyphs are used site-wide: `fa-users`, `fa-chalkboard-user`, `fa-school`,
`fa-toilet`, `fa-file-circle-check`, `fa-gauge-high`, `fa-house`, `fa-chevron-down`,
`fa-download`, across 5 files:
- `evidence/components/SupersetBigNumber.svelte` — dynamic `icon` prop (KPI tiles: users,
  chalkboard-user, school, toilet), driven by string keys from `scripts/asc-pages/template.mjs`
  (mdsvex can't pass functions through markdown array props, so this stays string-keyed).
- `evidence/components/ScopeNav.svelte` — static `fa-house` (breadcrumb home).
- `evidence/components/ControlBar.svelte` — static `fa-chevron-down` (school-year dropdown).
- `evidence/components/ReportStats.svelte` — static `fa-school`, `fa-file-circle-check`,
  `fa-gauge-high`.
- `evidence/scripts/patch-evidence.mjs`'s `LAYOUT` template (writes `+layout.svelte`) — static
  `fa-download` (Download-PDF button) + the `<svelte:head>` cdnjs `<link>`/`<noscript>`/
  preconnect block itself.

All 39 generated pages (`index.md`, 37 state pages, the LGA dynamic route) source their KPI
icon strings from `scripts/asc-pages/template.mjs`, not from hand-edited `.md` files — the
generated `.md` files are never edited directly.

## Approach

**Shared `Icon.svelte` component + `icons.js` data map**, not per-file inline SVG/duplicated
maps. `SupersetBigNumber.svelte` needs a lookup map regardless (its `icon` prop is a runtime
string), so a shared component avoids duplicating FA license boilerplate and path data across
5 files, and keeps a single place to add a 10th icon later.

Exact SVG path data (`viewBox` + `path d`) for the 9 glyphs was pulled from the official
`@fortawesome/fontawesome-free` npm package, **pinned to 6.4.2** — the same version currently
loaded from cdnjs — so rendering is pixel-identical, no visual regression. The package itself
is not added as a project dependency; only the extracted path data is committed.

### `evidence/components/icons.js`

Plain data module: `export const ICONS = { house: [viewBox, pathD], download: [...], ... }`
for the 9 glyphs, with the FA license header (CC BY 4.0 icons / MIT code — self-hosting is
explicitly permitted by the license).

### `evidence/components/Icon.svelte`

```svelte
<script>
  import { ICONS } from './icons.js';
  export let name;
</script>

<svg viewBox={ICONS[name][0]} width="1em" height="1em" fill="currentColor"
     style="vertical-align:-.125em" aria-hidden="true" focusable="false">
  <path d={ICONS[name][1]} />
</svg>
```

No `<style>` block — deliberately, to sidestep Svelte's cross-component CSS scoping.
`fill="currentColor"` and `1em` sizing are plain attributes, so they inherit `color` /
`font-size` from whatever ancestor element hosts `<Icon>`, mirroring how the FA glyph font
behaved (a font glyph colored/sized by CSS on its container). `vertical-align:-.125em` matches
Font Awesome's own SVG-mode output, for identical baseline alignment.

### Call-site changes

- `SupersetBigNumber.svelte`: `<i class={icon}>` → `<Icon name={icon} />`. The `icon` prop
  convention shrinks from `'fa-solid fa-users'` to `'users'`.
- `ScopeNav.svelte` / `ControlBar.svelte` / `ReportStats.svelte`: static `<i class="fa-solid
  fa-x">` → `<Icon name="x" />`.
- `patch-evidence.mjs`'s `LAYOUT` template: same swap for the Download-PDF button (needs
  `import Icon from '../components/Icon.svelte';` added to the layout's `<script>`), **and**
  delete the entire `<svelte:head>` cdnjs `<link>` + `<noscript>` + preconnect block and its
  explanatory comment.
- CSS: rules that styled the old `<i>` element directly (`.lab i`, `.yearbox i`) become
  `:global(svg)` variants — `Icon` is a child component, so its rendered `<svg>` isn't in the
  parent's own scope; `:global()` is already the established pattern in this codebase for
  cross-boundary styling (e.g. `:global(.dark) .kpi`). `ScopeNav`'s `.home` icon needs no CSS
  change — its color/size come from inherited cascade, not a rule targeting `i` directly.
- `scripts/asc-pages/template.mjs`: the two `kpis` array literals (in `page()` for
  federal/state, and `leafDynamicPage()` for LGA) change `icon:'fa-solid fa-users'` →
  `icon:'users'` etc. Regenerate all 39 pages via `npm run pages:asc`.

### Docs

- `docs/SERVER-ADMIN.md` §6 ("Two optional CDNs") is already stale — it still describes Google
  Fonts, which PR #9 already dropped. Rewrite it to state there are now **zero** third-party
  CDNs referenced by the page.
- `CHANGELOG.md`: add an entry under the Unreleased `Changed` section.

## Out of scope

Favicon / PWA icons (`icon.svg`, apple-touch-icon, manifest icons) — these are already baked
image assets generated at build time from an FA glyph, not a runtime dependency on cdnjs.
Unrelated to this change.

## Verification

- `npm run pages:asc` regenerates all 39 pages with the new `icon:'users'`-style keys.
- `npm run build` (or `release.sh`) succeeds.
- Visual check: KPI tiles, breadcrumb home, school-year dropdown chevron, reporting-strip
  icons, and the Download-PDF button render pixel-identical to the current site.
- Network capture on a built/served page shows **zero** requests to `cdnjs.cloudflare.com`.
