# Generic DHIS2 Extractor + Sierra Leone ANC Reference Portal — Design

**Date:** 2026-06-03
**Status:** Design (approved scoping; pending spec review + user sign-off)

## Goal

Evolve `master` from "infrastructure only" into a **reference implementation**: add
(1) a generic, reusable DHIS2 analytics extractor and (2) a worked Sierra Leone portal
that replicates the DHIS2 **Antenatal Care** dashboard (`nghVC4wtyzi`) on the Evidence
foundation, demonstrating the full **baked ↔ engine** spectrum.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| "Live" drill-down semantics | **Local parquet via DuckDB-WASM** — recompute in-browser, fully static/offline; no DHIS2 dependency at view time. |
| Extractor driver | **Config file (superset)** — generic, no dashboard hardcoding; pulls a superset so root OU + period stay freely changeable. |
| Maps | **Included** — extract org-unit geometry, render choropleth + facility points. |
| ANC replica fidelity | **Full 11-item replica**, laid out to mirror the DHIS2 grid. |
| Placement | **All on `master`** — reframe README/AGENTS as "foundation + generic DHIS2 reference example"; the infra-only contract is retired. |

## Source instance (reference data)

`https://play.im.dhis2.org/stable-2-43-0` (DHIS2 2.43.0, Sierra Leone demo). Auth via
env (`DHIS2_BASE_URL`, `DHIS2_USERNAME`, `DHIS2_PASSWORD`) — credentials never committed.
Org hierarchy: National (1) → District (2) → Chiefdom (3) → Facility (4); 1,332 units.

## Architecture (3 layers, all static)

```
[A] scripts/dhis2-extract/   reads config.yaml, talks to DHIS2 /api,
    (generic, reusable)       writes tidy CSV + GeoJSON ──────────┐
                                                                  ▼
[B] evidence/sources/anc/    connection.yaml (csv) ─npm run sources─► parquet + manifest
    + evidence/static/anc.geojson                                 ▼
[C] evidence/pages/anc/      3 pages spanning baked ↔ engine
```

No database, no app server. The extractor runs at author time (or in CI) against a DHIS2
instance; the built portal serves only static files.

## [A] Generic extractor — `scripts/dhis2-extract/`

A reusable Node CLI with **zero ANC hardcoding**. ANC is one shipped config.

**Input** — a YAML config:
```yaml
baseUrl: https://play.im.dhis2.org/stable-2-43-0   # auth from env
outDir: data/anc
dx: [Uvn6LCg7dVU, OdiHJayrsKo, sB79w2hiLp8, fbfJHSPpUQD, cYeuwXTCPkU,
     Jtf34kNZhzP, hfdmMSPBgLG, c8fABiNpT0B, Tt5TAvdfdVK]
ouLevels: [1, 2, 3, 4]
periods:                       # concrete list OR range×granularity, expanded locally
  range: 2021..2025
  types: [monthly, quarterly, yearly]
disaggregations:               # optional extra-dimension "cuts" → separate fact tables
  - dim: J5jldMd8OHv           # Facility Type (ORG_UNIT_GROUP_SET) — items 7 & 8
    slug: facility_type
    dx: [hfdmMSPBgLG, Jtf34kNZhzP]
  - dim: fMZEcRHuamy           # Fixed vs Outreach — item 9
    slug: fixed_outreach
    dx: [fbfJHSPpUQD, cYeuwXTCPkU, Jtf34kNZhzP, hfdmMSPBgLG]
```

**The 9 dx IDs (complete — covers all 11 items, incl. both maps):**

| UID | Name | Used by items |
|---|---|---|
| `Uvn6LCg7dVU` | ANC 1 Coverage | 2, 4, 5 |
| `OdiHJayrsKo` | ANC 2 Coverage | 2 |
| `sB79w2hiLp8` | ANC 3 Coverage | 3 |
| `fbfJHSPpUQD` | ANC 1st visit | 6, 9 |
| `cYeuwXTCPkU` | ANC 2nd visit | 9 |
| `Jtf34kNZhzP` | ANC 3rd visit | 8, 9 |
| `hfdmMSPBgLG` | ANC 4th or more visits | 7, 9 |
| `c8fABiNpT0B` | ANC IPT 2 Coverage | 10 (map) |
| `Tt5TAvdfdVK` | ANC LLITN coverage | 11 (map) |

**Outputs** (CSV + GeoJSON under `outDir`):
- `fact.csv` — `(dx, ou, pe, periodType, value)`. Built from chunked
  `GET /api/analytics.json` (`paging=false`; chunk by period-type / level to stay under
  URL & row caps). **`periodType` is a required column** — see "Period model" below.
- `fact_<slug>.csv` — one per disaggregation:
  `(dx, ou, pe, periodType, category_id, category_name, value)`. The category UID is
  resolved to a human label (`category_name`) from the analytics `metaData.items` so
  chart legends need no further lookup. Keeps the primary star schema clean; isolates
  extra-dimension complexity. Filename uses the config `slug` (e.g. `fact_facility_type.csv`).
- `ou.csv` — from `GET /api/geoFeatures.json?ou=ou:LEVEL-n` per level. Exact field map:

  | ou.csv column | geoFeatures field | example |
  |---|---|---|
  | `id` | `id` | `YuQRtpLP10I` |
  | `name` | `na` | `Badjia` |
  | `level` | `le` | `3` |
  | `parent_id` | `pi` | `O6uvpzGd5pu` |
  | `parent_name` | `pn` | `Bo` |
  | `path` | `pg` (ancestor path, self excluded) | `ImspTQPwCqd/O6uvpzGd5pu` |
  | `ty` | `ty` (1=point/facility, 2=polygon/area) | `2` |

  (Geometry `co` is **not** in `ou.csv`; it goes to `ou.geojson`.)
- `ou.geojson` — FeatureCollection: polygons (areas) + points (facilities), built from
  the same geoFeatures call (`co` → geometry, `id`/`na`/`le` → properties).
- `dx.csv` — `(id, name)` from analytics `metaData.items` (covers both indicators and
  data elements uniformly; no separate metadata calls needed).
- `pe.csv` — `(period, periodType, year, quarter, month, startDate)` parsed locally.

### Period model (load-bearing — drives 10 of 11 items)

`fact.csv` contains **monthly, quarterly, and yearly** rows simultaneously (analytics
returns each granularity independently). Therefore **every fact query MUST filter
`periodType`** (e.g. `WHERE periodType = 'MONTHLY'`) — otherwise a month, its quarter,
and its year all match and values triple-count. `pe.csv` carries `periodType` plus parsed
`year`/`quarter`/`month`/`startDate` so relative windows resolve in SQL:

- **Reference period** = a selected anchor (default: latest year with data). Items
  expressing relative ranges resolve against it over the `pe` table:
  - `THIS_YEAR` → `periodType='YEARLY' AND year = :refYear`
  - `MONTHS_THIS_YEAR` → `periodType='MONTHLY' AND year = :refYear` (12 month buckets)
  - `LAST_12_MONTHS` → `periodType='MONTHLY'` ordered by `startDate`, last 12 ≤ ref
  - `LAST_4_QUARTERS` → `periodType='QUARTERLY'` ordered by `startDate`, last 4 ≤ ref
- **Root OU** re-scopes "districts/chiefdoms/facilities" items to descendants of the
  selected root via `ou.path LIKE :rootPath || '%'` filtered by target `level`.

**Generality:** any portal points the CLI at its own config; the ANC config
(`scripts/dhis2-extract/config/anc.yaml`) is the worked example.

## [B] Source

`evidence/sources/anc/` (`connection.yaml`, `type: csv`) stages `fact*.csv`, `ou.csv`,
`dx.csv`, `pe.csv` → parquet + manifest via `npm run sources`. The extractor's
`ou.geojson` is copied to `evidence/static/anc.geojson` (the served filename the map
components reference as `/anc.geojson`); thematic values are joined in via SQL on `ou`
in the page query.

`fact.csv` is the join hub: `fact ⋈ ou (ou=id)`, `fact ⋈ dx (dx=id)`, `fact ⋈ pe
(pe=period)` — **always with a `periodType` filter** (see Period model). Drill-down =
filtering `ou` by `level` and `path`; period change = re-anchoring the reference period.

## [C] Three pages — spanning the spectrum

| Page | Mechanism | Demonstrates |
|---|---|---|
| **`/anc`** National overview | **Baked** (no `${inputs}`) — KPI tiles (ANC1/2/3 coverage), coverage-by-district column, national trend line. Root = Sierra Leone, latest year. | Cheap default: static HTML, **no engine downloaded**. |
| **`/anc/dashboard`** ANC replica | **Engine** — root-OU `<Dropdown>` + reference-period selector drive all **11 items**. | `${inputs.x}` → client-side DuckDB-WASM; changeable root OU + period. |
| **`/anc/profile`** Org-unit profile | **Engine, on-demand** — single parametric page; an OU `<Dropdown>` (or `?ou=` deep link) selects the unit; all indicators, trend, rank vs siblings computed in-browser. | The "live" drill-down (local-parquet flavor). Linked from the replica's charts/maps. |

**Profile routing:** a **single** client-rendered page driven by an OU input — *not*
1,332 prerendered `[ou]` pages. Deep links (`/anc/profile?ou=<id>`) resolve client-side
via the existing `fallback: '200.html'` adapter patch, so no per-OU build cost and links
still work under the static deploy.

### The 11 replica items (`nghVC4wtyzi`) → Evidence components

| # | Type | Title | dx (UID) | OU scope | Period · cut |
|---|---|---|---|---|---|
| 1 | Text | ANC Overview (intro) | — | — | — |
| 2 | Column | Coverage by quarter & district | `Uvn6LCg7dVU`,`OdiHJayrsKo` | districts | LAST_4_QUARTERS |
| 3 | Column | ANC 3 coverage by district | `sB79w2hiLp8` | LEVEL-2 | LAST_12_MONTHS |
| 4 | YoY line | ANC 1 coverage year over year | `Uvn6LCg7dVU` | root | MONTHS_THIS_YEAR (× years) |
| 5 | Column | ANC 1 coverage chiefdoms | `Uvn6LCg7dVU` | LEVEL-3 | THIS_YEAR |
| 6 | Line | ANC 1st visits cumulative | `fbfJHSPpUQD` | districts | LAST_12_MONTHS |
| 7 | Pie | 4+ visits by Facility Type | `hfdmMSPBgLG` | root | THIS_YEAR · `fact_facility_type` |
| 8 | Stacked col | ANC 3rd visits by facility type (100%) | `Jtf34kNZhzP` | root | LAST_12_MONTHS · `fact_facility_type` |
| 9 | Stacked col | Fixed vs Outreach | `fbfJHSPpUQD`,`cYeuwXTCPkU`,`Jtf34kNZhzP`,`hfdmMSPBgLG` | root | THIS_YEAR · `fact_fixed_outreach` |
| 10 | Map (choropleth) | IPT 2 Coverage this year | `c8fABiNpT0B` | LEVEL-3 | THIS_YEAR |
| 11 | Map (2 layers) | LLITN district & facility | `Tt5TAvdfdVK` | LEVEL-2 + LEVEL-4 | THIS_YEAR |

Relative periods (`LAST_12_MONTHS`, `MONTHS_THIS_YEAR`, …) are resolved against the
selected reference period at query time over the materialized `pe` range. The selected
root OU re-scopes the "districts/chiefdoms/facilities" items to that root's descendants.

### Components & layout
- Charts: Evidence `BarChart` / `LineChart` (+ `series`/`type=stacked100`) / `ECharts`
  for the pie. YoY = a line per year over month-of-year.
- Maps: Evidence `AreaMap` (choropleth, polygons) + `PointMap` (facility points),
  `geoJsonUrl` → `/anc.geojson`, value-joined per query.
- Layout mirrors the DHIS2 12-col grid using Evidence `<Grid>`/column blocks
  (approximate — Evidence isn't pixel-free-form).

## Build & data volume

Upper bound ~9 dx × ~1,332 OU × ~85 periods ≈ 1M fact rows (the 85 = 60 months + 20
quarters + 5 years across 2021–2025; this is exactly why `periodType` is a column).
Actual is well under that — analytics is **sparse** (no rows for null dx/ou/pe combos,
and coverage indicators are often null at facility level). Result is a few MB ZSTD
parquet; comfortable for DuckDB-WASM. Pipeline unchanged: `extract → npm run sources →
npm run build → deploy → serve`. Extraction is a separate author-time step (needs the
DHIS2 instance reachable); the build itself stays stock and offline-capable.

`scripts/precompress.mjs` currently compresses `.json` but **not** `.geojson` — its `EXT`
set must gain `.geojson` so `ou.geojson` (largest at level 4) ships `.br`/`.gz`.

## Docs to update
- `README.md`, `AGENTS.md`, `evidence/pages/index.md` — reframe to "foundation + generic
  DHIS2 reference example". Specifically, the now-false claims to revise: AGENTS.md
  "infrastructure only … no dashboards and no datasources" and the "Empty in this
  foundation — add yours" sources-layout row. The "stock `evidence sources` + stock
  prerendering, no shims" claim **stays true** — the extractor is an author-time step
  that produces CSVs *before* the stock build; it is not a build shim.
- `.gitignore` — keep `data/` ignored (regenerated by the extractor); ensure
  `evidence/sources/anc/*.parquet` stays ignored.

## Out of scope (this iteration)
- Live DHIS2 API calls from the browser (chosen against — local-parquet drill-down).
- Authentication / non-public data.
- Pixel-perfect DHIS2 layout parity.

## Risks / open points for the plan
- **Analytics chunking:** large requests may hit URL/row limits — chunk by period-type
  and/or level; verify totals match a spot-check `analytics` call.
- **GeoJSON size at level 4** (~1,300 facility points + chiefdom/district polygons) —
  add `.geojson` to `precompress.mjs` (committed above); consider coordinate-precision
  trimming if the polygon set is heavy.
- **YoY & 100%-stacked** semantics in Evidence: `BarChart type=stacked100` exists; YoY
  is a `LineChart` with one series per year over month-of-year — confirm against the
  installed `@evidence-dev/core-components` version during the plan.
- **Evidence map components**: confirm `AreaMap`/`PointMap` API (`geoJsonUrl`, value
  join key) in the installed version before committing the map tasks.
