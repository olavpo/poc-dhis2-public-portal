# ASC Portal — KPI & Charts Refinement — Design

**Date:** 2026-06-16
**Status:** Design (pending spec review + user sign-off)
**Branch:** `emis-pp`
**Refines:** the built ASC portal (`docs/superpowers/specs/2026-06-15-emis-asc-public-portal-design.md`)

## Goal

Polish the ASC portal's **KPI cards and charts**: remove emoji, align the chart palette with
the Nigeria-green chrome, rework the KPI cards, add the dashboard's missing charts, keep the
map (at half-width), and make every page a **suitable responsive layout** for mobile. No
change to the data pipeline, the baked/no-engine guarantee, or the no-data-below-LGA rule.

## Decisions (locked in brainstorming)

| # | Decision |
|---|---|
| 1 | **No emoji anywhere.** Replace the KPI-card emoji and the DNEMIS header crest emoji (🇳🇬) with **Font Awesome** icons (already loaded). |
| 2 | **Nigeria-green chart palette** replaces the Superset cyan. Categorical: `#1a9c5b` (green, primary), `#f4a261` (amber), `#2a6f97` (blue), `#e76f51` (terra), `#8a5a83` (plum), `#e9c46a` (gold). Choropleth sequential: `#e6f4ec → #0a3d2c`. |
| 3 | **Reworked KPI cards:** left green accent bar, a Font Awesome icon, label, big value. **No delta/target chips** (no historical/target data available now). Keep the **Total / Public / Private** ownership toggle (green active). |
| 4 | **Add charts** (all from already-extracted indicators, baked): (a) **Enrolment by education level** (bar: Pre-Primary/Primary/JSS/SSS/ANFE); (b) **Learners by sex & level** (grouped bar: girls/boys per level); (c) **Public vs Private enrolment** (donut, from the Ownership cut). |
| 5 | **Keep the map at half-width.** The children pupil-teacher-ratio choropleth moves from full-width into the half-width charts grid, with a green sequential legend. (Leaf LGA pages have no children → no choropleth.) |
| 6 | **Responsive, mobile-suitable:** at **≤820 px** KPI cards go 4→2 and the charts grid 2→1 (follow `KpiRow`'s existing 800–820 px precedent); nav 6→2; very small phones (~≤480 px) may drop KPI cards to 1 col. Wide tables scroll horizontally. Only requirement is a usable layout at phone widths. |
| 7 | **Restyle existing visuals** (compare table + map) to the green palette. |

## Scope of change (files)

Pure presentation layer — no extractor/generator/data changes (the needed indicators are
already in `fact.csv` / `fact_ownership.csv`).

- `evidence/evidence.config.yaml` — swap `colorPalettes.default` + `colorScales.default` to the green sets.
- `evidence/scripts/patch-evidence.mjs` — crest emoji → Font Awesome icon; ensure the nav/header CSS stays.
- `evidence/components/SupersetBigNumber.svelte` (rename concept: a KPI tile) — add an `icon` prop (FA class), left-accent styling, drop the sparkline path entirely.
- `evidence/components/KpiRow.svelte` — pass an `icon` per KPI (string FA class, like `fmt`).
- New `evidence/components/` charts where Evidence's built-ins don't fit:
  - **Enrolment by level** and **Learners by sex** → Evidence built-in `<BarChart>` (baked) — no new component, just markup + queries.
  - **Public vs Private donut** → Evidence `<ECharts>` pie config. **Gotcha:** like ```` ```sql ```` blocks, a raw `<ECharts>` island must NOT sit inside a `<Grid>` cell — wrap it in a tiny `OwnershipDonut.svelte` component so it lands cleanly as a grid cell. Chosen: **`OwnershipDonut.svelte`** (presentational, baked data prop).
- `scripts/asc-pages/template.mjs` — add the chart queries + markup; arrange map + charts in a responsive 2-col grid (Evidence `<Grid cols=2>`); pass `icon` in the KPI config.
- Responsive CSS lives in the component `<style>` blocks + the layout (already has nav breakpoints); ensure the compare table wraps in a horizontal-scroll container (per CLAUDE.md, charts/tables can't scroll internally — use a `.svelte` scroll wrapper, not a raw-HTML `<div>` around an Evidence component).

## Chart data (baked queries, literal OU id — no `${inputs}`)

| Chart | Source | Query shape |
|---|---|---|
| Enrolment by level | `census.fact` | the 5 per-level enrolment dx for `ou`, `pe=2024` → bar (reuses the leaf `edu_breakdown`). |
| Learners by sex & level | `census.fact` | per-level **boys** + **girls** enrolment dx for `ou` → grouped bar (series = sex). |
| Public vs Private | `census.fact_ownership` | GEN enrolment for `ou`, two category rows → donut. |
| Map (branch pages only) | `census.fact` + `asc.geojson` | children PTR (existing `children_map`), half-width `<AreaMap>`. |

Per-level **boys/girls** enrolment indicator ids exist in the 67-indicator set (e.g. PREPRY
boys `L7wp6IPJGhV` / girls `NnvopxD62MT`, … ANFE boys `kxJmBoDtD9t` / girls `VzPMQzTjenn`)
and are already in `fact.csv` — no re-extract.

## Page layout (after refinement)

- **Federal / State pages:** DNEMIS nav → breadcrumb + scope selectors → **KPI row** (ownership
  toggle) → **charts grid** (`<Grid cols=2>`, responsive to 1 col): half-width **map** +
  **enrolment-by-level** + **sex-by-level** + **public/private donut** → **compare table**
  (5 level tabs, green) below.
- **LGA leaf pages:** same minus the children map (no children) — KPI row + enrolment-by-level
  + sex-by-level + donut + the education-level breakdown table.

## Non-goals

- No new data, indicators, or re-extraction; no engine (everything still baked).
- No delta/trend or target lines (no data); the removed sparkline is not replaced.
- No special-needs/dropout charts for now (data exists; can add later if wanted — kept lean).
- No change to nav links, drill-down navigation, or the no-data-below-LGA rule.

## Verification

- Visual parity with the approved `refine-v2` mockup (green palette, FA icons, half-width map,
  charts present); **no emoji** in the built HTML/JS.
- Responsive: at ~375 px width the KPI cards are ≤2 across, charts single-column, nav ≤2
  across, the compare table scrolls horizontally without breaking layout.
- Still fully baked: a page load fetches **0** DuckDB-WASM/engine requests (re-run the network
  check).
- `npm test` green; build + deploy succeed.
