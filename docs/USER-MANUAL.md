# DNEMIS Education Statistics Portal — User Manual

A practical guide to building and maintaining the **static** public portal for Nigeria's
**Annual School Census (ASC)** — the Federal Ministry of Education's DNEMIS "Education
Statistics" site. It walks the whole pipeline — extract → source → pages → deploy — using the
real ASC instance, indicators, and org units.

The portal is built on a generic, domain-agnostic DHIS2 public-portal **foundation** (the
`master` branch): the same machinery can be pointed at any DHIS2 program. This manual covers
the **ASC deployment** on the `emis-pp` branch. To stand up a *different* portal, the same
steps apply — swap the extractor config, the source name, and the page template.

> New to the codebase? Skim `AGENTS.md` first (architecture + the gotchas list). This
> manual is the longer, task-oriented companion.

---

## 1. What you're building, and why it's static

The portal is a **prerendered static website** — HTML, CSS, JS, and data files — with **no
database and no application server**. It's built with [Evidence](https://evidence.dev)
(Markdown + SQL pages) over **DuckDB-WASM**, the SQL engine that runs *in the browser*.

That gives you a portal that:

- hosts anywhere static (object storage, a CDN, GitHub Pages, nginx);
- costs almost nothing to run and can't be "hacked" (there's no live backend);
- stays fast because most pages are precomputed.

### The one decision that matters: **baked vs. engine**

Evidence decides, per query, where it runs:

| | **Baked (build time)** | **Engine (in browser)** |
|---|---|---|
| Trigger | a query with **no** `${inputs.x}` / `${params.id}` | a query referencing `${inputs.x}` / `${params.id}`, or a custom component calling `query()` |
| Runs | once, during `npm run build` | on the visitor's machine, in DuckDB-WASM |
| Cost to visitor | just HTML + a small `.arrow` result | downloads the ~6 MB (compressed) engine on first such query |
| Use for | overviews, fixed reports, anything static | interactive filters, drill-downs, on-demand tiers |

**Rule of thumb:** bake everything you can; reach for the engine only when the page is
genuinely interactive or too numerous to bake. The ASC portal shows both: **Federal (`/asc`)
and every State (`/asc/state-<id>`) are fully baked** — even the Total/Public/Private toggle
is engine-free (see §5) — while **LGA pages (`/asc/lga/<id>`) are client-rendered** through a
single dynamic route (baking ~770 LGAs OOMs the compile; see `AGENTS.md`).

### Pipeline at a glance

```
DHIS2  ──(extract:asc)──►  tidy CSV + GeoJSON  ──(npm run sources)──►  Parquet + manifest
                                                                            │
                                       (pages:asc) generate one page per org unit from a template
                                                                            │
                                                       (npm run build) prerender to static
                                                                            │
                                          (npm run deploy) versioned dir + `current` symlink
                                                                            │
                                              (npm run serve) range-capable static server
```

`./scripts/release.sh` runs build → deploy → serve in one shot (with a 16 GB Node heap for
the prerender); `--sources` rebuilds the Parquet first.

---

## 2. Setup

```bash
npm install                      # root tooling (extractor deps, vitest)
npm --prefix evidence install    # Evidence + DuckDB connectors (one-time)
```

**Environment requirement:** `extensions.duckdb.org` must be reachable — DuckDB-WASM
autoloads its Parquet/httpfs extensions there (once, then cached). Needed at **build time**
always, and at **run time for LGA pages only** (they query in-browser; Federal/State are
baked). In the sandbox it's allowlisted.

For the live-extract step you also need network access to the DHIS2 instance and credentials
in env (never commit them) — a **personal access token is preferred**:

```bash
export D2_TOKEN="d2pat_xxxxxxxx"          # Profile → Personal access tokens, in DHIS2
# or, basic auth fallback:
# export DHIS2_USERNAME=...  DHIS2_PASSWORD=...
```

---

## 3. Step 1 — Extract data from DHIS2

The generic extractor lives in `scripts/dhis2-extract/`. It is **config-driven** and has no
portal-specific logic; `config/asc.yaml` is the ASC config. (Full details:
`scripts/dhis2-extract/README.md`.)

### Run it

```bash
D2_TOKEN="d2pat_xxxx" npm run extract:asc
# = node scripts/dhis2-extract/index.mjs \
#       --config scripts/dhis2-extract/config/asc.yaml --out evidence/sources/census
```

The token is sent as `Authorization: ApiToken <token>`. Override the instance per-run with
`D2_BASE_URL=...` (e.g. to point at a test mirror).

### The config

```yaml
baseUrl: https://trainingdb.dhis2nigeria.org.ng/dev   # auth comes from env
dx: [jwjKmtVK2wj, Dw7f4gs9RcS, ...]                   # indicator / data-element UIDs
ouLevels: [1, 2, 3]                                   # Federal / State / LGA
periods:
  list: ['2024']                                      # the ASC reference year
disaggregations:                                      # optional extra-dimension "cuts"
  - dim: gAmNV64G0pZ        # Ownership (Public/Private) org-unit group set
    slug: ownership
    dx: [jwjKmtVK2wj, Dw7f4gs9RcS, ...]
    ouLevels: [1, 2, 3]
  - dim: rtQk5MWCxyR        # School Type group set → fact_schooltype.csv
    slug: schooltype
    dx: [jwjKmtVK2wj, ...]
    ouLevels: [1, 2]
  - dims: [rtQk5MWCxyR, gAmNV64G0pZ]   # School Type × Ownership cross-cut → fact_typeown.csv
    slug: typeown
    dx: [jwjKmtVK2wj, ...]
    ouLevels: [1, 2]
```

It pulls a **superset** — every level plus the disaggregation cuts each view needs — so the
generated pages and the Total/Public/Private toggle have all the data they need without
recomputing anything client-side.

### What it writes (into `evidence/sources/census/`)

| File | Columns | Notes |
|---|---|---|
| `fact.csv` | `dx, ou, pe, periodType, value` | the analytics fact table (join hub) |
| `fact_<slug>.csv` | single `dim`: `…, category_id, category_name, value`; multi `dims`: `…, cat1_id, cat1_name, cat2_id, cat2_name, …, value` | one per disaggregation cut |
| `ou.csv` | `id, name, level, parent_id, parent_name, path, ty, lng, lat` | hierarchy + geometry |
| `dx.csv` | `id, name` | indicator names |
| `pe.csv` | `period, periodType, year, quarter, month, startDate` | parsed periods |
| `ou.geojson` | — | polygons + facility points (the page generator splits this per scope; see §5) |

**Two things the extractor gets right that are easy to get wrong** (see `AGENTS.md`):
hierarchy comes from `/api/organisationUnits` (geoFeatures drops geometry-less units like
the national root), and `fact.csv` carries `periodType` (queries must always filter it — even
though the ASC pull is yearly, the schema supports mixed granularities).

### ⚠️ Let DHIS2 aggregate indicators — don't re-aggregate after extraction

This is the single most important analytical caveat. A `dx` is **either**:

- a **data element** — a raw measured value (counts, e.g. "learner enrolment", "number of
  teachers"). These **aggregate freely**: you can `sum()` them across org units and across
  categories (subject to the element's own aggregation type). Summing enrolment across
  school-type categories, for instance, is legitimate.
- an **indicator** — a *calculated* rate/ratio/percentage (e.g. the **pupil-teacher ratio**,
  or a **reporting-completeness %**). A rate isn't additive: you can't `sum()` it across org
  units or categories, and an equal-weight `avg()` ignores the denominators behind each value.

**The rule is about *where* the aggregation happens.** DHIS2's analytics API returns every
value **already correctly aggregated for the exact `ou`/`pe` (and category) you request** —
the national ratio, a State's ratio, a school type's ratio. **Trust that, and request the
level/cut you want.** The extractor already pulls every org-unit level and the cuts each view
needs, so the correctly-aggregated values are all in the fact files; your page just selects
the right row.

What you must **not** do is recompute an indicator yourself *after* extraction:

- ❌ fetch State ratios and `avg()`/`sum()` them into a "national" number;
- ❌ sum a rate across the School-Type × Ownership cells to get the per-type rate — use the
  **marginal** `fact_schooltype` cut instead.

Both are wrong (one biased, one nonsensical). Instead query the level/cut DHIS2 supplied.

**Practical rules:**

- Identify each `dx`'s type up front — `/api/indicators` vs `/api/dataElements`, or the
  `dimensionItemType` field on a visualization's dimension items.
- Configure the extractor to pull indicators at **every level/cut you'll display**, then query
  the row you need. Don't derive a coarser figure from finer rows.
- Data elements (raw counts) *can* be `sum()`-ed post-extraction — that's fine.
- Need a rate at a level/cut you didn't extract? Pull its **numerator + denominator data
  elements** and compute `sum(num)/sum(den)` yourself — the only valid way to build a rate
  from parts.

### Server load & resilience

Requests are fully sequential (no parallel fan-out); deep-level (LGA) calls — especially with
a group-set cut — can 500 on individual indicators, and the extractor **bisects and skips**
the offending `dx` (logged `[skip]`) rather than aborting. Make sure analytics tables are
freshly generated before a pull. The transforms are unit-tested: `npm test`.

---

## 4. Step 2 — Define the data source

A datasource is a directory under `evidence/sources/` with a `connection.yaml`:

```yaml
# evidence/sources/census/connection.yaml
name: census
type: csv
```

> ⚠️ **Why `census`, not `asc`?** The source name becomes the DuckDB schema, and `asc.fact`
> fails to parse (`ASC` is a SQL keyword). The source is named **`census`**; URLs and
> filenames can still say "asc".

Then ingest to Parquet + a manifest:

```bash
npm run sources
```

This produces `census.fact`, `census.ou`, `census.dx`, `census.pe`, and the cut tables
`census.fact_ownership`, `census.fact_schooltype`, `census.fact_typeown` as queryable tables.
(A stray `ou.geojson` in the source dir is ignored by the CSV connector — that's expected;
the page generator turns it into static map assets instead.)

---

## 5. Step 3 — Pages (generated from a template)

Unlike a hand-built Evidence site, the ASC portal **generates** its pages: there are hundreds
of org units, all sharing one dashboard. `scripts/asc-pages/generate.mjs` walks `ou.csv` and
emits one page per org unit from the shared template in `scripts/asc-pages/template.mjs`:

- `evidence/pages/asc/index.md` — the **Federal** page (site root), baked.
- `evidence/pages/asc/state-<id>.md` — one **baked** page per State.
- `evidence/pages/asc/lga/[id].md` — a **single dynamic** route for all LGAs, plus
  `evidence/pages/asc/lga/+layout.js` setting `export const prerender = false`.
- Per-scope GeoJSON under `evidence/static/asc/` (Federal→its States, each State→its LGAs) and
  a single org-unit search index.

```bash
npm run pages:asc      # regenerate (also run automatically by `npm run build`)
```

**To change the dashboard, edit `template.mjs` once** — it applies to every org unit. Below
are the patterns the template uses; the same baked-vs-engine rules apply if you author a page
by hand.

### A baked query (no engine)

A query with no reactive input runs at build and is inlined into the page:

```sql
-- learners at this org unit, latest year
select sum(f.value) as learners
from census.fact f
where f.dx = 'jwjKmtVK2wj' and f.periodType = 'YEARLY'
  and f.ou = '<org-unit-id>'
  and f.pe = (select max(pe) from census.fact where periodType = 'YEARLY')
```

No `${inputs.x}` anywhere ⇒ this runs at build and the page ships as static HTML with the
engine **never downloaded**. This is how the Federal and State pages work.

### The Total / Public / Private toggle — **still engine-free**

The ownership toggle does **not** boot the engine. Instead the template bakes a *separate*
query per mode (`*_total`, `*_public`, `*_private`) and a tiny Svelte store
(`components/ownership.js`) picks which baked result to show. `OwnershipSelect.svelte` and
`CompareTable.svelte` read that store and swap between the already-baked results — no
`query()`, no `.wasm` fetched. Pass baked results to components as **props**.

> One subtlety: `<AreaMap>` *subscribes to and `.fetch()`es* its `data`, so it needs a real
> Evidence **query object**, not a filtered array — `OwnershipSelect` selects among three real
> baked query objects. (See the gotcha in `AGENTS.md`.) Verify a page stays baked with a
> network capture: it should fetch **0** `.wasm`.

### Descendant-or-self scoping

A page sums over an org unit *and its descendants* using the self-inclusive `ou.path`:

```sql
... from census.fact f join census.ou o on f.ou = o.id
where ('/' || o.path || '/') like '%/' || '<root-id>' || '/%'
```

### The LGA dynamic page (engine)

`asc/lga/[id].md` uses `${params.id}`, so its queries run **client-side** in the browser for
whichever LGA was requested. That's the one tier that loads the engine (one-time, cached). The
parent State is resolved with a subquery against `census.ou`, and the page reuses the same
chart/map sections as the baked pages.

### Layout, maps, big lists, custom components

These rules are unchanged from the foundation (all enforced in the template):

- **Use `<Grid>` for layout**, and keep ```` ```sql ```` blocks **above** the grid, never
  inside it (inside, each query block eats a cell and shoves charts into one column — the most
  common layout bug).
- **Maps:** per-scope GeoJSON is served from `evidence/static/asc/`. Choropleths use
  `<AreaMap>` (joins a geojson id ↔ a query column, colours by value, optional per-row `link`
  column for drill-down); facility points use `<PointMap>` with `lat`/`long` columns. Filter
  blank coordinates with `is not null` (empty CSV cells type as `DOUBLE` → `NULL`).
- **Big category lists** (e.g. all LGAs in a State) can't scroll inside an Evidence chart —
  render a raw `<ECharts>` with a fixed `height` + a `dataZoom` slider, wrapped in a `.svelte`
  component (never a raw `<div>` — mdsvex won't compile components inside a raw-HTML island).
  `ScrollX.svelte` makes the wide compare table scroll on mobile the same way.
- **Custom components that query** (`OrgUnitProfile.svelte`): query via
  **`$page.data.__db.query(sql)`** (it awaits table registration — the raw client-duckdb
  `query` gives "Timeout while initializing database"), and gate URL/engine access behind
  **`onMount`** (`$page.url.searchParams` throws during prerender).

---

## 6. Step 4 — Build, deploy, serve

```bash
./scripts/release.sh            # build → deploy → serve, one shot (16 GB Node heap)
./scripts/release.sh --sources  # also rebuild Parquet first (after re-extracting)
./scripts/release.sh --no-serve # stop after deploy
```

Or step by step:

```bash
npm run build     # patch template (idempotent) + pages:asc + prerender → evidence/build
npm run deploy    # copy to builds/<timestamp>/, precompress, flip the `current` symlink
npm run serve     # range-capable static server on $SANDBOX_HOST_PORT
```

- `npm run dev` gives a live-reload dev server and shows each query's state (handy for
  debugging "loading…" hangs).
- Builds take a few minutes and are memory-heavy — `release.sh` hands Node a 16 GB heap
  (override with `NODE_HEAP_MB=…`); an OOM shows as `Killed` / exit 137.
- Run builds in the background and poll the log (foreground `sleep` is blocked in the sandbox).
- **LGA pages must stay `prerender = false`** (the `lga/+layout.js`) — baking every LGA OOMs
  the compile.
- If a component edit "doesn't take", clear caches:
  `rm -rf evidence/.evidence/template/.svelte-kit evidence/node_modules/.vite` (and wipe
  `evidence/build` before a clean rebuild). `release.sh` pre-cleans these for you.

### Branding & layout

The coat-of-arms header, full-width layout, the **"Download PDF"** button, and the `@media
print` rules are written into the template's `+layout.svelte` by
`evidence/scripts/patch-evidence.mjs` (the template is regenerated each build, so branding
lives in the patch — a deterministic whole-file write — not the template). The crest is
`evidence/static/coat_of_arms.png`.

### Hosting

For production hosting (nginx/Apache config, `200.html` SPA fallback for the LGA route,
`application/wasm` MIME, precompressed assets), see **`docs/SERVER-ADMIN.md`**.

---

## 7. Maintaining the portal

Routine tasks:

- **Refresh the data:** re-run `extract:asc`, then `./scripts/release.sh --sources` and hand
  the new `evidence/build` (or a tarball of it) to whoever hosts it. Deploy is a folder swap.
- **Add/rename an indicator:** add its UID to `config/asc.yaml` (in the main `dx` and any cut
  that needs it), re-extract, then reference it in `template.mjs`.
- **Change the dashboard layout or a chart:** edit `scripts/asc-pages/template.mjs` once;
  `pages:asc` re-emits every org-unit page.
- **Add a disaggregation:** add a `dim:`/`dims:` entry to the config (see §3), re-extract, and
  surface the new `fact_<slug>` table in the template.

## 8. Building a *different* portal on this foundation

The extractor and pipeline are generic; only the config, source name, and page content
change:

1. **Find the UIDs you need.** Point the extractor at your instance. To mirror an existing
   DHIS2 dashboard, read its definition — `GET /api/dashboards/<uid>.json?fields=...` lists its
   visualizations/maps, and each `GET /api/visualizations/<uid>.json` gives the `dx`/`ou`/`pe`
   dimensions for your config.
2. **Write a config** under `scripts/dhis2-extract/config/` and an `extract:*` script in
   `package.json`.
3. **Create the source** (`evidence/sources/<name>/connection.yaml` — avoid SQL-keyword names).
4. **Author pages** under `evidence/pages/` (or write a generator like `scripts/asc-pages/` if
   you have many org units) — start baked, reach for the engine only where you need it.
5. **Build, deploy, serve.**

---

## 9. Reference

- `AGENTS.md` — architecture + the full gotchas list (read before authoring).
- `scripts/dhis2-extract/README.md` — extractor config schema, auth, outputs.
- `docs/INDICATOR-REFERENCE.md` — exactly which `dx` (indicator/data-element) UIDs feed each
  portal variable, and the formula where a value is computed.
- `docs/SERVER-ADMIN.md` — hosting the static site.
- The ASC implementation: `scripts/dhis2-extract/config/asc.yaml`,
  `scripts/asc-pages/{generate,template}.mjs`, `evidence/sources/census/`,
  `evidence/components/`.
- `docs/superpowers/specs/…` and `docs/superpowers/plans/…` — design specs and plans.
