# DHIS2 Public Portal — generic foundation

A reusable, **static** public-portal foundation for DHIS2 analytics data, built with
[Evidence](https://evidence.dev) over DuckDB-WASM. No database, no app server — the
site is prerendered to static files and served by any static host.

This branch (`master`) provides the build/deploy/serve pipeline, asset precompression, a
range-capable static server (nginx stand-in), and two build-time Evidence optimisations —
**plus a self-contained Sierra Leone reference example**: a generic DHIS2 extractor and a
worked **Antenatal Care** portal (`/anc`) replicating DHIS2 dashboard `nghVC4wtyzi`.

The example spans the full **baked ↔ engine** spectrum:

- **`/anc`** — baked national overview; pure static HTML, no SQL engine downloaded.
- **`/anc/dashboard`** — the 11-item ANC replica; a root-org-unit + reference-year selector
  re-computes every chart and map client-side in DuckDB-WASM.
- **`/anc/profile`** — on-demand org-unit profile drill-down (queried live in-browser,
  deep-linkable).

> **Another worked example:** the **`the prior example`** branch is a complete public
> education-statistics portal (another portal) — national → state → LGA → school
> drill-down and a minister's dashboard.

## ANC reference example

```bash
# 1. Extract from a live DHIS2 instance (public demo: admin/district).
DHIS2_USERNAME=admin DHIS2_PASSWORD=district npm run extract:anc
# 2. Ingest → parquet, build, deploy, serve.
npm run sources && npm run build && npm run deploy && npm run serve
```

The extractor (`scripts/dhis2-extract/`) is generic and config-driven — point
`config/anc.yaml` (or your own) at any DHIS2 instance. See its `README.md`.

## Pipeline

```
evidence/sources/   ──►  npm run sources  ──►  Parquet + manifest (stock evidence sources)
 (your datasources)
        │
Evidence (Vite)     ──►  npm run build    ──►  prerendered static site in evidence/build
        │
scripts/deploy.sh   ──►  builds/<timestamp>/ + atomic `current` symlink flip
scripts/serve.sh    ──►  serves current/ on $SANDBOX_HOST_PORT (nginx stand-in)
```

## Quick start

```bash
npm install                       # root tooling
npm --prefix evidence install     # Evidence + DuckDB (one-time)

npm run dev                       # live-reload dev server
# or the full static pipeline:
npm run sources                   # ingest datasources → Parquet + manifest
npm run build                     # prerender → evidence/build
npm run deploy                    # versioned dir + flip `current` symlink
npm run serve                     # serve on http://localhost:$SANDBOX_HOST_PORT
```

## Add your portal

1. **Datasource** — create `evidence/sources/<name>/` with a `connection.yaml`
   (`type: csv`, `type: duckdb`, …) and your files/queries. For DHIS2, point a DuckDB
   source at an analytics-API extract, or drop pre-extracted CSV/Parquet files.
2. **Pages** — add Markdown + SQL under `evidence/pages/`. Queries with no reactive
   input are baked at build (no client engine); queries referencing `${inputs.x}` run
   client-side in DuckDB-WASM on demand.
3. `npm run sources && npm run build && npm run deploy`.

## Environment requirement

The build is **stock Evidence** — stock `evidence sources` and stock prerendering, no
shims. The single requirement is that **`extensions.duckdb.org` is reachable** (DuckDB-WASM
autoloads its Parquet/httpfs extensions there at build and runtime, once, then caches).

`evidence/scripts/patch-evidence.mjs` applies only two build-time *optimisations*: an
adapter fallback page and lazy DuckDB-WASM init (so baked pages never download the
engine). See `AGENTS.md` for the full guide and conventions.
