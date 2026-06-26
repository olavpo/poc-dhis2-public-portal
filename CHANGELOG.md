# Changelog

All notable changes to the DNEMIS Education Statistics public portal (Nigeria Annual School
Census) are documented here. This project adheres to [Semantic Versioning](https://semver.org).

## [0.3.0] — 2026-06-26

### Added
- **School-year box** in the control bar ("2024/2025"), styled like the search and ownership
  controls — a placeholder for a future year selector.

### Changed
- **Header** subtitle now reads "Digital **Nigeria** Education Management Information System"
  (was "National").
- **Page layout reordered:** the reporting strip now sits **above** the KPI tiles, and the
  control bar (search · school year · ownership) sits at the very top.
- **Reporting strip relabelled** to **Total schools** · **Schools reported** · **Reporting rate**.
- **KPI row: the Schools tile is replaced by Toilets** — the useable-toilets count, with a
  "Useable" subtitle (KPI tiles now support an optional subtitle). Unlike the MD school count,
  toilets are available at LGA level too. Schools still feed the schools chart and benchmark.
- **"Key indicators" table** uses a slightly larger font.
- **All app icons are education-themed** — the Font Awesome `fa-school` glyph (white) on a
  forest-green tile: the favicon, `icon.svg`, the iOS apple-touch-icon and the PWA manifest icons
  (192/512). Evidence's default icons are fully replaced everywhere in the build, not just the
  browser-tab favicon.

- **Map: +/- zoom buttons and drag-to-pan** on the choropleth. Scroll-wheel / pinch /
  double-click zoom stay disabled, so the map never hijacks page scroll.

### Fixed
- **Local serving under a basePath.** `serve.mjs` now serves the build under the configured
  `basePath` (`/portal`) and redirects `/` → `/portal/`. Previously it served at the root, so a
  `/portal` build loaded with no CSS/JS (every `/portal/_app/…` asset 404'd). Mirrors the
  production nginx setup.

## [0.2.0] — 2026-06-26

### Added
- **Sub-path hosting.** The portal can be served under a configurable base path — currently set
  to **`/portal`** (`deployment.basePath` in `evidence.config.yaml`) — with every link, asset and
  GeoJSON URL prefixed automatically. To host at the domain root instead, clear `basePath`.
- **Deployment runbook + daily regeneration script** (`docs/DEPLOYMENT.md`, `scripts/regenerate.sh`)
  for the git-based `/portal` setup.

### Changed
- **Sex series relabelled Male / Female** (was Boys / Girls) in the "Learners by sex & level"
  chart, with Male shown first. Only the portal's displayed terminology changed; the underlying
  DHIS2 indicator names ("… boys" / "… girls") are untouched.
- **Favicon** replaced Evidence's default with a DHIS2 mark (`evidence/static/dhis2-favicon.svg`).

### Fixed
- **LGA pages no longer crash** with "Unexpected token '<'". The SPA fallback (`200.html`) served
  for the `prerender:false` LGA route returned HTML where a prerendered-query manifest was
  expected; the loader now tolerates a non-JSON body and runs the page's queries live in
  DuckDB-WASM.

## [0.1.0] — 2026-06-24

First tagged release of the portal: a fully static [Evidence](https://evidence.dev) +
DuckDB-WASM site over the Annual School Census — baked Federal and State pages with an
engine-free Total/Public/Private toggle, client-rendered LGA pages, and a config-driven DHIS2
extractor. Highlights of this release:

### Maps
- **Click-only choropleth.** The children map is now navigation-only — panning and every zoom
  path (scroll/smooth-wheel, double-click, box, pinch, keyboard) are disabled. Clicking a region
  still drills down (Federal → State → LGA) and tooltips still work; the view stays fitted to the
  data bounds.

### Data & reliability
- **Reference period set to 2024** across the extractor config and the page template.
- **Hardened DHIS2 extractor** for large / busy instances (a national hierarchy of ~770 LGAs is
  at the high end of what DHIS2 40 is tested with):
  - Analytics requests are chunked on **both axes** — by `dx` group *and* by explicit org-unit id
    (`OU_CHUNK` at a time), so a level no longer pulls every org unit in one call.
  - **Transient gateway errors (502/503/504, network drops) retry with exponential backoff**
    before being skipped, instead of being silently dropped.
  - Transient failures skip the whole group; **structural `500`/`409` still bisect** to isolate
    the single genuinely-undefined indicator.
  - A **loud end-of-run skip summary** flags any missing `dx`×level cut; `EXTRACT_FAIL_ON_SKIP=1`
    exits non-zero on an incomplete extract.
  - New tunables: `DX_CHUNK`, `OU_CHUNK`, `HTTP_RETRIES`, `HTTP_RETRY_BASE_MS`.
  - *Fixes* the previously half-empty extracts (Federal-only data; blank maps, donuts, and
    ownership toggle) caused by the server returning gateway errors under load.

### Documentation
- **Added `docs/INDICATOR-REFERENCE.md`** — maps every portal variable (KPI tiles, reporting &
  completeness, the "Key indicators" benchmark, charts, and the "Indicators by …" compare table)
  to the exact DHIS2 indicator / data-element UID(s) and the formula behind each computed value.

[0.3.0]: https://github.com/olavpo/poc-dhis2-public-portal/tree/emis-pp
[0.2.0]: https://github.com/olavpo/poc-dhis2-public-portal/tree/emis-pp
[0.1.0]: https://github.com/olavpo/poc-dhis2-public-portal/tree/emis-pp
