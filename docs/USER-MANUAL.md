# Building a DHIS2 Public Portal — User Manual

A practical guide to building a fast, **static** public portal over DHIS2 analytics data
using this foundation. It walks through the whole pipeline — extract → source → pages →
deploy — and shows how to adapt it to your own instance and dashboards.

The foundation is **domain-agnostic**. Examples throughout use the bundled **Antenatal
Care** portal (`/anc`), but that is only a demonstration — extracted from the *public DHIS2
Sierra Leone demo server* (`play.im.dhis2.org`) and replicating its `nghVC4wtyzi` dashboard.
Nothing here is ANC- or Sierra-Leone-specific; you point the same machinery at your own
program, indicators, and org units.

> New to the codebase? Skim `AGENTS.md` first (architecture + the gotchas list). This
> manual is the longer, task-oriented companion.

---

## 1. What you're building, and why it's static

A DHIS2 public portal here is a **prerendered static website** — HTML, CSS, JS, and data
files — with **no database and no application server**. It's built with
[Evidence](https://evidence.dev) (Markdown + SQL pages) over **DuckDB-WASM**, the SQL
engine that runs *in the browser*.

That gives you a portal that:

- hosts anywhere static (object storage, a CDN, GitHub Pages, nginx);
- costs almost nothing to run and can't be "hacked" (there's no live backend);
- stays fast because most pages are precomputed.

### The one decision that matters: **baked vs. engine**

Evidence decides, per query, where it runs:

| | **Baked (build time)** | **Engine (in browser)** |
|---|---|---|
| Trigger | a query with **no** `${inputs.x}` | a query referencing `${inputs.x}`, or a custom component calling `query()` |
| Runs | once, during `npm run build` | on the visitor's machine, in DuckDB-WASM |
| Cost to visitor | just HTML + a small `.arrow` result | downloads the ~6 MB (compressed) engine on first such query |
| Use for | overviews, fixed reports, anything static | interactive filters, drill-downs, "pick an org unit / year" |

**Rule of thumb:** bake everything you can; reach for the engine only when the page is
genuinely interactive. The ANC example shows both: `/anc` is fully baked (no engine
downloaded), while `/anc/dashboard` and `/anc/profile` are engine-driven.

### Pipeline at a glance

```
DHIS2  ──(extractor)──►  tidy CSV + GeoJSON  ──(npm run sources)──►  Parquet + manifest
                                                                            │
                                                       (npm run build) prerender to static
                                                                            │
                                          (npm run deploy) versioned dir + `current` symlink
                                                                            │
                                              (npm run serve) range-capable static server
```

---

## 2. Setup

```bash
npm install                      # root tooling (extractor deps, vitest)
npm --prefix evidence install    # Evidence + DuckDB connectors (one-time)
```

**Environment requirement:** `extensions.duckdb.org` must be reachable (DuckDB-WASM
autoloads its Parquet/httpfs extensions there — once, then cached) at both build and run
time. In the sandbox it's allowlisted.

For the live-extract step you also need network access to your DHIS2 instance and
credentials in env (never commit them):

```bash
export DHIS2_USERNAME=admin
export DHIS2_PASSWORD=district     # the public demo's credentials
```

---

## 3. Step 1 — Extract data from DHIS2

The generic extractor lives in `scripts/dhis2-extract/`. It is **config-driven** and has
no portal-specific logic; `config/anc.yaml` is the worked example.

### Run it

```bash
npm run extract:anc
# = node scripts/dhis2-extract/index.mjs --config scripts/dhis2-extract/config/anc.yaml \
#       --out evidence/sources/anc  (then copies ou.geojson → evidence/static/anc.geojson)
```

### The config

```yaml
baseUrl: https://play.im.dhis2.org/stable-2-43-0   # auth comes from env
dx: [Uvn6LCg7dVU, OdiHJayrsKo, ...]                # indicator / data-element UIDs
ouLevels: [1, 2, 3, 4]                             # org-unit levels to pull
periods:
  range: '2025..2026'                              # the demo's populated window
  types: [monthly, quarterly, yearly]
disaggregations:                                   # optional extra-dimension "cuts"
  - dim: J5jldMd8OHv        # an ORG_UNIT_GROUP_SET (e.g. Facility Type)
    slug: facility_type
    dx: [hfdmMSPBgLG, Jtf34kNZhzP]
    ouLevels: [1, 2]
```

It pulls a **superset** — all org-unit levels and a multi-granularity period range — so the
portal's "root org unit" and "reference year" selectors have data to filter client-side.

### What it writes (into `evidence/sources/anc/`)

| File | Columns | Notes |
|---|---|---|
| `fact.csv` | `dx, ou, pe, periodType, value` | the analytics fact table (join hub) |
| `fact_<slug>.csv` | `… , category_id, category_name, value` | one per disaggregation cut |
| `ou.csv` | `id, name, level, parent_id, parent_name, path, ty, lng, lat` | hierarchy + geometry |
| `dx.csv` | `id, name` | indicator names |
| `pe.csv` | `period, periodType, year, quarter, month, startDate` | parsed periods |
| `ou.geojson` | — | polygons + facility points for maps (copied to `evidence/static/anc.geojson`) |

**Two things the extractor gets right that are easy to get wrong** (see `AGENTS.md`):
hierarchy comes from `/api/organisationUnits` (geoFeatures drops geometry-less units like
the national root), and `fact.csv` carries `periodType` because it mixes monthly/quarterly/
yearly rows (queries must always filter it).

### ⚠️ Let DHIS2 aggregate indicators — don't re-aggregate after extraction

This is the single most important analytical caveat. A `dx` is **either**:

- a **data element** — a raw measured value (counts, e.g. "ANC 1st visit"). These
  **aggregate freely**: you can `sum()` them across org units and across periods (subject
  to the element's own aggregation type). The visit-count charts in the example legitimately
  sum across facility-type categories.
- an **indicator** — a *calculated* rate/ratio/percentage (e.g. "ANC 1 Coverage" =
  visits ÷ target × 100). A rate isn't additive: you can't `sum()` it across periods or org
  units, and an equal-weight `avg()` ignores the denominators behind each value.

**The rule is about *where* the aggregation happens.** DHIS2's analytics API returns every
value **already correctly aggregated for the exact `ou`/`pe` you request** — national
coverage, a quarter's coverage, the annual figure. **Trust that, and request the level you
want.** The extractor already pulls every org-unit level and every granularity
(monthly/quarterly/yearly), so the correctly-aggregated values are all sitting in
`fact.csv`; your page just selects the right row.

What you must **not** do is recompute an indicator yourself *after* extraction:

- ❌ fetch monthly coverages and `avg()`/`sum()` them into a quarter or year;
- ❌ fetch district coverages and average them into a "national" number.

Both are wrong (one nonsensical, one biased). Instead query the quarter/year/national value
that DHIS2 supplied. The example does exactly this — its coverage charts each read a single
DHIS2 `ou`/`pe` cell (the latest quarter, or the reference year), never an SQL average.

**Practical rules:**

- Identify each `dx`'s type up front — `/api/indicators` vs `/api/dataElements`, or the
  `dimensionItemType` field on a visualization's dimension items.
- Configure the extractor to pull indicators at **every level/granularity you'll display**,
  then query the row you need. Don't derive a coarser figure from finer rows.
- Data elements (raw counts) *can* be `sum()`-ed post-extraction — that's fine.
- Need a rate at a level you didn't extract? Pull its **numerator + denominator data
  elements** and compute `sum(num)/sum(den)` yourself — the only valid way to build a rate
  from parts.

### Pure-function tests

The extractor's transforms (period parsing, org-unit rows, fact/disagg rows, CSV) are
unit-tested: `npm test`.

---

## 4. Step 2 — Define the data source

A datasource is a directory under `evidence/sources/` with a `connection.yaml`. For
CSV/Parquet files:

```yaml
# evidence/sources/anc/connection.yaml
name: anc
type: csv
```

Then ingest to Parquet + a manifest:

```bash
npm run sources
```

This produces `anc.fact`, `anc.ou`, `anc.dx`, `anc.pe`, etc. as queryable tables. (A stray
`ou.geojson` in the source dir is ignored by the CSV connector — that's expected; it's
served as a static asset instead.)

You can also point the `@evidence-dev/duckdb` connector directly at an extract.

---

## 5. Step 3 — Author pages

Pages are Markdown files in `evidence/pages/`. Mix prose, ```` ```sql ```` query blocks,
and Evidence components.

### A baked page (no engine)

```markdown
---
title: Antenatal Care — Sierra Leone
---

```sql national_coverage
select d.name as indicator, f.value
from anc.fact f join anc.dx d on f.dx = d.id
where f.ou = 'ImspTQPwCqd' and f.periodType = 'YEARLY'
  and f.pe = (select max(pe) from anc.fact where periodType='YEARLY')
  and f.dx in ('Uvn6LCg7dVU','OdiHJayrsKo','sB79w2hiLp8')
```

<BigValue data={national_coverage.filter(r => r.indicator === 'ANC 1 Coverage')} value=value />
<BarChart data={coverage_by_district} x=district y=value swapXY=true />
```

No `${inputs.x}` anywhere ⇒ these run at build and the page ships as static HTML with the
engine **never downloaded**. This is `evidence/pages/anc/index.md`.

### An interactive (engine) page

Add inputs; queries that reference them run client-side:

```markdown
```sql year_options
select distinct substr(pe,1,4) as yr from anc.fact where periodType='YEARLY' order by yr desc
```
<Dropdown data={year_options} name=refyear value=yr title="Reference year" defaultValue="2026" />

```sql coverage
select o.name as district, f.value
from anc.fact f join anc.ou o on f.ou = o.id
where f.dx='sB79w2hiLp8' and f.periodType='YEARLY' and f.pe = '${inputs.refyear.value}'
  and o.level = 2
order by f.value desc
```
<BarChart data={coverage} x=district y=value swapXY=true />
```

This is `evidence/pages/anc/dashboard.md`, which reproduces a real DHIS2 dashboard with a
**root-org-unit** + **reference-year** selector driving every chart and map.

### Layout

Use the `<Grid>` component, **not** raw `<div>`s:

```markdown
<Grid cols=2>
  <BarChart ... />
  <LineChart ... chartAreaHeight={363} />   <!-- match a neighbour's height -->
</Grid>
```

> ⚠️ **Keep ```` ```sql ```` blocks above the `<Grid>`, never inside it.** Inside a grid each
> query block eats a cell and shoves your charts into one column. (This is the single most
> common layout bug — see the gotcha in `AGENTS.md`.)

### Maps

`ou.geojson` is served at `/anc.geojson`. Choropleths use `<AreaMap>` (joins geojson
`geoId` ↔ a query `areaCol`, colours by `value`); facility points use `<PointMap>` with
`lat`/`long`/`value` columns from the query:

```markdown
<AreaMap data={ipt2_map} geoJsonUrl="/anc.geojson" geoId="id" areaCol="id" value="value"
  link="profile_url" />                       <!-- link is a COLUMN name (a per-row href) -->
<PointMap data={facilities} lat="lat" long="lng" value="value" pointName="name" />
```

### Big category lists → scrollable chart

Evidence charts can't scroll internally, so a chart with hundreds of categories stretches
the page. Render it as a raw `<ECharts>` with a fixed `height` and a `dataZoom` slider on
the category axis (see the chiefdom chart in `dashboard.md`).

### Custom components & deep links

When Markdown can't express something — reading a `?param=` from the URL, a bespoke layout
— write a Svelte component in `evidence/components/`. `OrgUnitProfile.svelte` is the only
one here: it powers the map-click **deep link** to an org-unit profile. Two rules for
custom components that query:

1. Query via **`$page.data.__db.query(sql)`** (it awaits table registration), not the raw
   client-duckdb `query` — otherwise you get "Timeout while initializing database" on pages
   with no other queries.
2. Gate URL/engine access behind **`onMount`** — `$page.url.searchParams` throws during
   prerender.

---

## 6. Step 4 — Build, deploy, serve

```bash
npm run build     # patch template (idempotent) + prerender → evidence/build
npm run deploy    # copy to builds/<timestamp>/, precompress, flip the `current` symlink
npm run serve     # range-capable static server on $SANDBOX_HOST_PORT
```

- `npm run dev` gives a live-reload dev server and shows each query's state (handy for
  debugging "loading…" hangs).
- Builds take a few minutes — run in the background and poll the log.
- **Author all cross-linked pages before building** (prerender 404s on a link to a page
  that doesn't exist yet).

### Branding & layout

The header logo, full-width layout, and footer are set by patching the stock
`<EvidenceDefaultLayout>` props in `evidence/scripts/patch-evidence.mjs` (the template is
regenerated each build, so changes live in the patch, not the template). Drop your own
`evidence/static/logo*.svg` and adjust the patch.

---

## 7. Adapting this to your DHIS2 + dashboard

1. **Find the UIDs you need.** Point the extractor at your instance. To mirror an existing
   DHIS2 dashboard, read its definition — `GET /api/dashboards/<uid>.json?fields=...` lists
   its visualizations/maps, and each `GET /api/visualizations/<uid>.json` gives the `dx`/`ou`/`pe`
   dimensions to put in your config. (That's exactly how the ANC config was built.)
2. **Write a config** under `scripts/dhis2-extract/config/` and an `extract:*` script in
   `package.json`.
3. **Create the source** (`evidence/sources/<name>/connection.yaml`).
4. **Author pages** under `evidence/pages/` — start baked, add inputs where you want
   interactivity.
5. **Build, deploy, serve.**

The extractor and the whole pipeline are generic; only the config, source name, and page
content change.

---

## 8. Reference

- `AGENTS.md` — architecture + the full gotchas list (read before authoring).
- `docs/superpowers/specs/…` and `docs/superpowers/plans/…` — the design spec and
  implementation plan for the ANC example.
- The ANC example itself: `scripts/dhis2-extract/config/anc.yaml`,
  `evidence/sources/anc/`, `evidence/pages/anc/`, `evidence/components/OrgUnitProfile.svelte`.
