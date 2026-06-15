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
   Primary and Public JSS, from the two screenshots), driven by the **real ASC indicator
   set** (`emis-public-portal-input/school_list_indicators_BY_LEVEL.metadata.json`).
3. A **Federal → State → LGA geographic drill-down**, where each org unit is its own
   prerendered, fully **baked** page (no client engine), scoped via a top-right navigator.

The portal is **domain content built on the foundation** — it does not change the generic
foundation contract (extractor, build/deploy/serve, patch optimisations).

## Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| 1 | Portal shape | **One-page ASC portal** — DNEMIS module links across the top, ASC dashboard below. Not a multi-module shell. |
| 2 | Data source | **Real metadata + indicators (already in the instance), synthetic geography + values.** The instance already holds the real ASC indicators, their data elements, and indicator types. We do **not** author indicator definitions — we reuse them; we only generate the org-unit hierarchy + geometry and dummy data values, then extract. Swap in real geography + values later. |
| 3 | Geography | **Realistic Nigeria-shaped hierarchy:** Nation › States › LGAs › Schools, with synthetic admin **polygons** (choropleths) **and** school **points**. |
| 4 | Interactivity | **Faithful, fully baked, 2024 only.** No live selector now; reserve a top-right slot for a future year/scope filter. |
| 5 | Drill-down | **Federal → State → LGA**, top-right scope navigator that **navigates between baked per-OU pages**; page body **compares sub-units** (children table + choropleth). |
| 6 | Metrics | **Use the real 67 ASC indicators** (`school_list_indicators_BY_LEVEL.metadata.json`, all present in the instance) — by education level **PREPRY/PRY/JSS/SSS/ANFE/GEN** (enrolment, by sex, female %, pupil-stream/pupil-teacher/pupil-toilet/pupil-computer ratios, special needs, orphans, dropout, teachers, classrooms, toilets, etc.). **All built immediately** (they already exist). Indicator types: `jEvXVGHRCsj` (Number, ×1, 48 inds) and `D0J1oRr1ESx` (Percentage, ×100, 19 inds). |
| 7 | Indicator rule | Extract each indicator/value **at every level it is displayed** (Nation/State/LGA), read as-is — **never re-aggregate after calculation** (foundation hard rule). |
| 8 | School type | **Public / Private / Total** via the existing **"Ownership" org-unit group set** (Public/Private groups). Generator assigns each synthetic school to a group; extractor pulls Ownership as a group-set disaggregation. |
| 9 | Visual style | **Apache Superset look** for the viz (Inter font, white chart cards, Big-Number tiles + trendline, ECharts gauge, Superset categorical palette, data table with in-cell bars), under the green DNEMIS portal chrome. |
| 10 | Example instance | **`agent-asc-ind`** (DHIS2 broker instance). Already holds the real ASC indicators (780 indicators incl. the 67), data elements (1023 incl. the 108 referenced), indicator types, and real 2023/2024 values — but **only on a 6-OU fixture, with no geometry and no real Nigeria hierarchy**. We add the hierarchy + geometry + dummy values on top, then extract. |

## Example instance (current state)

`http://dhis2-agent-asc-ind:8080` (reachable on dev-net, `admin`/`district`). It **already
contains the real ASC metadata**: the 67 by-level indicators from
`school_list_indicators_BY_LEVEL.metadata.json` (all resolve), the 108 data elements they
reference, the two indicator types, and real **2023 + 2024** values. What it lacks:

- A **real org-unit hierarchy** — only a 6-OU fixture: **ASC Nation** (L1) › **ASC District**
  (L2) › 4 schools (L3); the existing data hangs off those 4 schools.
- **Org-unit levels** (unnamed) and **geometry** (zero OUs have geometry).

So this is **not** a blank instance — the metadata + indicator definitions are real and we
reuse them as-is. We only need to add geography (hierarchy + levels + geometry) and generate
dummy values across the new schools. (The original `metadata.json` dashboard "ASC Shurajit"
references a *different, unused* indicator set — ignore it; the by-level indicators are the
live ones.)

## Architecture (all static — mirrors the foundation)

```
[0] scripts/asc-synth/        Node generator (NEW): adds the GEOGRAPHY to agent-asc-ind —
    (synthetic geo+data,       creates org-unit levels + Nigeria hierarchy + geometry, then
     one-off)                  generates dummy dataValueSets for the real 108 data elements
                               (correct category option combos) across the new schools for
                               2024 (+2023 for trendlines), and triggers analytics. Reuses the
                               instance's real indicators/DEs/types — authors NO metric defs.
                               Idempotent; re-runnable.
                                        │
[A] scripts/dhis2-extract/    config/asc.yaml (NEW): pull the 67 real indicators (+ count
    (generic, REUSED)          data elements) at levels 1–3 (Nation/State/LGA) × yearly 2024,
                               with disaggregation + geometry. Writes tidy CSVs + ou.geojson.
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
DHIS2** at each level (decision 7). The real indicator definitions already live there, so we
let DHIS2 own aggregation: add the org hierarchy, import dummy `dataValueSets` for the real
data elements, run analytics, and extract the already-correctly-aggregated indicator values.
This exercises the real foundation path end-to-end and proves the swap-in-real-data story.

## Synthetic geography & data

- **Hierarchy (exact, deterministic):** Nation (1) › **6 States** (2) › **4 LGAs** each (3)
  › **12 Schools** each (4) = 1 nation + 6 states + 24 LGAs + 288 schools. Bounded so per-OU
  pages prerender cheaply: **31 baked pages** (1 federal + 6 state + 24 LGA). School pages are
  out of scope — LGA is the deepest page; schools appear as the LGA page's child rows/points.
  (Counts are fixed, not approximate, so prerender-completeness is unambiguous.)
- **Geometry:** generated synthetically (no external boundary download): a tessellation of
  non-overlapping polygons over a Nigeria-like bounding box, partitioned Nation→State→LGA so
  child polygons nest in their parent; school **points** scattered within their LGA polygon.
  **Every level gets geometry, including the national root** (a country polygon) and every
  state — otherwise the extractor's geoFeatures merge silently drops geometry-less units and
  the Federal/State choropleths break (CLAUDE.md gotcha).
  Written as `ou.geojson` (polygons keyed by OU id; points via `lng`/`lat` in `ou.csv`).
  Real Nigeria admin GeoJSON can replace this later without page changes.
- **Metrics = the real metadata (reused, not authored).** The 67 indicators and their 108
  data elements already exist in the instance. The generator does **not** create or modify
  any data element or indicator. It queries each DE's **category combo → category option
  combos** (they vary widely: 22 are `default`, the rest real disaggregations — sex, age,
  class/sex, useable/not; several are deprecated "…DELETE" combos) so dummy values target
  valid `(dataElement, COC)` cells.
- **Dummy values:** for every one of the 108 real data elements, write a plausible value at
  each of the 288 **school** OUs (leaf level), for each of its category option combos, for
  period **2024** (and **2023** so Big-Number trendlines have history). DHIS2 aggregates the
  counts up the new hierarchy and computes the 67 indicators at every level. Values are
  **deterministic** (seeded from OU id + DE id — no `Math.random`) so re-imports are stable,
  and ranged sensibly per metric (enrolments in the thousands; ratios fall out of the real
  num/den).
- **Ownership (Public/Private/Total):** already modelled as the **org-unit group set
  "Ownership"** (groups Public / Private). The generator assigns each synthetic school to one
  group; the extractor pulls **Ownership as a group-set disaggregation** (the foundation
  already supports group-set disaggregations — cf. the ANC `disaggregations:` config). Total =
  no group filter; Public / Private = the two groups.

## Page architecture

- `evidence/pages/asc/index.md` — **Federal overview** (the approved layout): KPI Big-Number
  tiles + reporting-rate gauge; two maps (learners/teachers by location); the dashboard
  charts (learners by sex & school type, infrastructure %, etc.); **Compare sub-units**
  (states) choropleth + indicator table (tabs: Pre-Prim/Primary ↔ JSS), each state row
  linking to its page.
- One **generated `.md` per state** (e.g. `asc/state-<id>.md`) — **same shape**, scoped to
  the state; child table/choropleth = its LGAs, linking to LGA pages.
- One **generated `.md` per LGA** (e.g. `asc/lga-<id>.md`) — same shape, scoped to the LGA;
  children = its schools (table rows + map points; no per-school page).
- **Child scoping uses `parent = <currentOU>` (direct children only)** — not path matching —
  so the drill-down does not depend on the `ou.csv.path` convention. (The plan should still
  confirm whether `ou.csv.path` is self-inclusive or ancestor-only before using any path-based
  query, since the README and CLAUDE.md describe it differently.)
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

1. **Pipeline:** generator adds org-unit levels + Nigeria hierarchy + geometry to
   `agent-asc-ind`, then imports 2024 (+2023) dummy `dataValueSets` for the real 108 data
   elements across the 288 schools; run analytics; `asc.yaml` extract of the 67 indicators
   (+ count DEs) → CSVs + geojson; `npm run sources`. Verify: extracted CSVs contain
   Nation/State/LGA rows for every indicator; each ratio indicator value differs per level and
   is **not** a SQL re-aggregation.
2. **Federal page** baked with all KPIs, maps, the dashboard charts, and the compare-states
   table (both Pre-Prim/Primary and JSS tabs) — themed Superset.
3. **Drill-down**: generate state + LGA pages from the template; wire scope navigator,
   breadcrumb, child links, choropleth deep-links. Build (all links resolve).
4. **Deploy + serve**; visual check against the approved mockup.

## Non-goals (YAGNI)

- No live year/scope **selector** yet (engine deferred); only a reserved layout slot.
- No per-**school** pages (schools are leaf rows/points on the LGA page).
- No real Nigeria boundary data, no real ASC values (geometry + values synthetic until
  provided). Indicator/data-element **definitions are real** (reused from the instance).
- No authoring or editing of data elements / indicators / indicator types — reuse as-is.
- No changes to the generic foundation contract beyond adding the ASC source/pages/theme and
  the `asc.yaml` extractor config + the throwaway synthetic geo+data generator.

## Verification

- Extractor unit tests already cover the generic path; add a fixture for the ASC config shape.
- Build must complete with **no dangling internal links** (all state/LGA pages generated
  first).
- Indicator correctness (canonical test): in the extracted `fact.csv`, the **ASC-GEN
  Pupil-teacher ratio** at **Nation** ≠ the unweighted mean of the **State** rows — proving
  the value was aggregated by DHIS2 from numerator/denominator at each level, not re-averaged
  in SQL.
- Final: `npm run deploy && npm run serve`; the Federal page and a drilled-in LGA page render
  and match the approved Superset mockup; maps + deep-links work; no DuckDB-WASM engine
  downloaded on baked pages.
```
