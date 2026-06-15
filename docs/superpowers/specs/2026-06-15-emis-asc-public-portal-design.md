# DNEMIS — Annual School Census (ASC) Public Portal — Design

**Date:** 2026-06-15
**Status:** Design (pending spec review + user sign-off)
**Branch:** `emis-pp`

## Goal

Build a **public, static EMIS portal** on the existing Evidence/DuckDB-WASM foundation that
reproduces Nigeria's DNEMIS **Annual School Census (ASC)** dashboard, with:

1. The **DNEMIS module navigation** (6 links from `emis.education.gov.ng`) as a prominent
   top bar — ASC is the active module; the other five link out.
2. The **ASC dashboard content** (from the supplied `metadata.json`: 1 dashboard, 12
   visualizations, 2 maps) plus two **LGA-level indicator tables** (Public Pre-Primary/
   Primary and Public JSS, from the two screenshots).
3. A **Federal → State → LGA geographic drill-down**, where each org unit is its own
   prerendered, fully **baked** page (no client engine), scoped via a top-right navigator.

The portal is **domain content built on the foundation** — it does not change the generic
foundation contract (extractor, build/deploy/serve, patch optimisations).

## Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| 1 | Portal shape | **One-page ASC portal** — DNEMIS module links across the top, ASC dashboard below. Not a multi-module shell. |
| 2 | Data source | **Synthetic now, real later.** Generate plausible ASC data; swap in real data once available. |
| 3 | Geography | **Realistic Nigeria-shaped hierarchy:** Nation › States › LGAs › Schools, with synthetic admin **polygons** (choropleths) **and** school **points**. |
| 4 | Interactivity | **Faithful, fully baked, 2024 only.** No live selector now; reserve a top-right slot for a future year/scope filter. |
| 5 | Drill-down | **Federal → State → LGA**, top-right scope navigator that **navigates between baked per-OU pages**; page body **compares sub-units** (children table + choropleth). |
| 6 | Metrics | **Mix of raw-count data elements and DHIS2 indicators** (matching the source metadata: several tiles reference `DATA_ELEMENT` directly, others `INDICATOR`). Ratios/percentages are indicators. **Build the full set immediately** — all count data elements **and all indicators** the portal displays, each as a proper numerator/denominator DHIS2 indicator. (Definitions are authored synthetically since the real indicator formulas aren't supplied yet; they are replaced when real metadata arrives.) |
| 7 | Indicator rule | Extract each indicator/value **at every level it is displayed** (Nation/State/LGA), read as-is — **never re-aggregate after calculation** (foundation hard rule). |
| 8 | School type | Disaggregate by **Public / Private / Total**. |
| 9 | Visual style | **Apache Superset look** for the viz (Inter font, white chart cards, Big-Number tiles + trendline, ECharts gauge, Superset categorical palette, data table with in-cell bars), under the green DNEMIS portal chrome. |
| 10 | Example instance | **`agent-asc-ind`** (DHIS2 broker instance). Currently near-empty (6 OUs, no geometry, indicators unresolved) — we populate it with synthetic metadata + data, then extract via the foundation pipeline. |

## Example instance (current state)

`http://dhis2-agent-asc-ind:8080` (reachable on dev-net, `admin`/`district`). Today it holds
only a 3-level test fixture: **ASC Nation** (L1) › **ASC District** (L2) › 4 schools (L3),
no org-unit levels, no geometry, none of the dashboard's referenced indicators. We treat it
as a blank instance to load synthetic metadata + data into.

## Architecture (all static — mirrors the foundation)

```
[0] scripts/asc-synth/        Node generator (NEW): builds synthetic DHIS2 metadata
    (synthetic data, one-off)  (Nigeria hierarchy + geometry, all data elements + indicators,
                               school-type disagg, 2024 data values) and IMPORTS it into
                               agent-asc-ind via the DHIS2 metadata + dataValueSets API,
                               then triggers analytics. Idempotent; re-runnable.
                                        │
[A] scripts/dhis2-extract/    config/asc.yaml (NEW): pull indicators + data elements at
    (generic, REUSED)          levels 1–3 (Nation/State/LGA) × yearly 2024, school-type
                               disagg, geometry. Writes tidy CSVs + ou.geojson.
                                        │  npm run sources
[B] evidence/sources/asc/     connection.yaml (csv) ─────────────► parquet + manifest
    + evidence/static/asc.geojson
                                        │  npm run build
[C] evidence/pages/asc/       baked pages: Federal overview + one page per State + one per
                               LGA (same shape). DNEMIS nav + Superset theme.
```

No database, no app server, no client engine (everything baked). The synthetic generator
[0] is a throwaway dev convenience; when real data arrives, only [0] is replaced — [A]–[C]
are unchanged.

### Why a generator that imports into the instance (not direct synthetic CSVs)

The user wants `agent-asc-ind` as the example instance and wants indicators computed **by
DHIS2** at each level (decision 7). So we let DHIS2 own aggregation: import data elements +
the indicator definitions + dummy `dataValueSets`, run analytics, and extract the
already-correctly-aggregated values. This exercises the real foundation path end-to-end and
proves the swap-in-real-data story.

## Synthetic geography & data

- **Hierarchy (exact, deterministic):** Nation (1) › **6 States** (2) › **4 LGAs** each (3)
  › **12 Schools** each (4) = 1 nation + 6 states + 24 LGAs + 288 schools. Bounded so per-OU
  pages prerender cheaply: **31 baked pages** (1 federal + 6 state + 24 LGA). School pages are
  out of scope — LGA is the deepest page; schools appear as the LGA page's child rows/points.
  (Counts are fixed, not approximate, so prerender-completeness is unambiguous.)
- **Geometry:** generated synthetically (no external boundary download): a tessellation of
  non-overlapping polygons over a Nigeria-like bounding box, partitioned Nation→State→LGA so
  child polygons nest in their parent; school **points** scattered within their LGA polygon.
  Written as `ou.geojson` (polygons keyed by OU id; points via `lng`/`lat` in `ou.csv`).
  Real Nigeria admin GeoJSON can replace this later without page changes.
- **Data elements (raw counts, 2024 yearly), reported per school, disaggregated by a
  school-type category `{Public, Private}`** and modelled per **education level** where the
  ASC tables split them (`Pre-Primary`, `Primary`, `JSS`). Counts roll up additively via
  DHIS2:
  - Schools reported · Schools expected (for reporting rate)
  - Enrolment — Pre-Primary, Primary, JSS (also split by **sex** for the "learners by sex" tile)
  - Teachers — Pre-Prim/Primary, JSS
  - Usable classrooms — Pre-Prim/Primary, JSS · Total classrooms (for usable-infrastructure %)
  - Usable toilets — Pre-Prim/Primary, JSS · Total toilets
  - Special-needs learners; school-classification category (for "schools by classification %")
- **Indicators (ALL built now)** — each a proper DHIS2 indicator (numerator/denominator,
  factor as noted) so DHIS2 computes the correct value at **every** level (Nation/State/LGA):
  | Indicator | Numerator ÷ Denominator | Factor | Source tile |
  |---|---|---|---|
  | Pupil–Teacher Ratio (Pre-Prim/Primary) | enrolment(pre-prim+primary) ÷ teachers(pre-prim/primary) | 1 | Table 1.1 |
  | Pupil–Teacher Ratio (JSS) | enrolment(JSS) ÷ teachers(JSS) | 1 | Table 1.2 |
  | Pupil–Classroom Ratio (Pre-Prim/Primary) | enrolment(pre-prim+primary) ÷ usable classrooms | 1 | Table 1.1 / "Learners per classroom" |
  | Pupil–Classroom Ratio (JSS) | enrolment(JSS) ÷ usable classrooms(JSS) | 1 | Table 1.2 |
  | Pupil–Toilet Ratio (Pre-Prim/Primary) | enrolment(pre-prim+primary) ÷ usable toilets | 1 | Table 1.1 |
  | Pupil–Toilet Ratio (JSS) | enrolment(JSS) ÷ usable toilets(JSS) | 1 | Table 1.2 |
  | Reporting Rate (%) | schools reported ÷ schools expected | 100 | Gauge + "Reporting Rate" |
  | Usable Infrastructure (%) | usable classrooms+toilets ÷ total classrooms+toilets | 100 | "Usable infrastructure (%)" |

  "Schools by classification (%)" is a **category breakdown** of the school-count data
  element (not a ratio indicator); "Total Schools / Total learners / Total teachers" remain
  raw counts. This indicator list is **authored synthetically now** and is the same set the
  portal renders; real definitions replace them later 1-for-1.
- **Values:** plausible ranges, varied per OU and school type, deterministic (seeded — no
  `Math.random`; values derived from OU id/level) so re-imports are stable.

## Page architecture

- `evidence/pages/asc/index.md` — **Federal overview** (the approved layout): KPI Big-Number
  tiles + reporting-rate gauge; two maps (learners/teachers by location); the dashboard
  charts (learners by sex & school type, infrastructure %, etc.); **Compare sub-units**
  (states) choropleth + indicator table (tabs: Pre-Prim/Primary ↔ JSS), each state row
  linking to its page.
- `evidence/pages/asc/[state].md` (or generated per-state files) — **same shape**, scoped to
  the state; child table/choropleth = its LGAs, linking to LGA pages.
- `evidence/pages/asc/[lga].md` — same shape, scoped to the LGA; children = its schools
  (shown as the table rows + map points; no per-school page).
- **Scope navigator + breadcrumb** (top-right / under title) = links between these baked
  pages. **Reserved (disabled) year/scope filter** slot for the future engine-driven version.
- **Generation of per-OU pages:** authored as a small set of Evidence **templated pages**
  driven by the OU list (a build-time generator script writes one `.md` per state/LGA from a
  shared template, OR a single dynamic page prerendered per-OU via SvelteKit entries). Chosen
  approach: **generator script** writing `.md` files from a template (simplest, stays within
  stock Evidence prerender; no custom routing). All cross-links exist before build (foundation
  gotcha: prerender fails on dangling internal links).

## Theming (Superset look)

- **Approach:** extend `evidence/scripts/patch-evidence.mjs` + `evidence.config.yaml` theme +
  a portal CSS/Svelte layer. Inter font; Superset categorical palette as the Evidence series
  colors; chart cards, Big-Number tiles, gauge, and the in-cell-bar data table built as small
  **Svelte components** (`components/`) or themed Evidence components (Evidence renders via
  ECharts, so gauge/bar/table map closely).
- **DNEMIS chrome:** the green header + 6 module nav buttons live in the layout (patched into
  the stock `EvidenceDefaultLayout`, where the foundation already injects branding), with the
  ASC module active and the other five as external links.

## Phasing (incremental, verifiable)

1. **Pipeline:** generator creates the Nigeria hierarchy + geometry + **all** count data
   elements + **all** indicators (table above) + 2024 dummy values; import into
   `agent-asc-ind`; run analytics; `asc.yaml` extract → CSVs + geojson; `npm run sources`.
   Verify: extracted CSVs contain Nation/State/LGA rows for every data element and indicator;
   each ratio indicator value differs per level and is **not** a SQL re-aggregation.
2. **Federal page** baked with all KPIs, maps, the dashboard charts, and the compare-states
   table (both Pre-Prim/Primary and JSS tabs) — themed Superset.
3. **Drill-down**: generate state + LGA pages from the template; wire scope navigator,
   breadcrumb, child links, choropleth deep-links. Build (all links resolve).
4. **Deploy + serve**; visual check against the approved mockup.

## Non-goals (YAGNI)

- No live year/scope **selector** yet (engine deferred); only a reserved layout slot.
- No per-**school** pages (schools are leaf rows/points on the LGA page).
- No real Nigeria boundary data, no real ASC values (synthetic until provided).
- No changes to the generic foundation contract beyond adding the ASC source/pages/theme and
  the `asc.yaml` extractor config + the throwaway synthetic generator.
- **Real** indicator formulas — the full indicator set is built now, but with **synthetic
  definitions** (the real numerator/denominator expressions aren't supplied yet); they are
  swapped in 1-for-1 when provided.

## Verification

- Extractor unit tests already cover the generic path; add a fixture for the ASC config shape.
- Build must complete with **no dangling internal links** (all state/LGA pages generated
  first).
- Indicator correctness (canonical test): in the extracted `fact.csv`, the Pupil–Teacher
  Ratio **Nation** row ≠ the unweighted mean of the **State** rows — proving the value was
  aggregated by DHIS2 from numerator/denominator at each level, not re-averaged in SQL.
- Final: `npm run deploy && npm run serve`; the Federal page and a drilled-in LGA page render
  and match the approved Superset mockup; maps + deep-links work; no DuckDB-WASM engine
  downloaded on baked pages.
```
