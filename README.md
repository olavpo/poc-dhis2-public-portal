# DHIS2 Public Portal — generic foundation

> ⚠️ **Proof of concept — not production-ready.** This is a demonstration / reference
> implementation to explore the approach. It has **not** been hardened, performance-tested
> at scale, accessibility-audited, or security-reviewed for production. Use it as a starting
> point and learning resource, not as-is in production.

A reusable, **static** public-portal foundation for DHIS2 analytics data, built with
[Evidence](https://evidence.dev) over DuckDB-WASM. No database, no app server — the
site is prerendered to static files and served by any static host.

`master` is the reusable, **domain-agnostic** foundation: the build/deploy/serve pipeline,
asset precompression, a range-capable static server (nginx stand-in), build-time Evidence
optimisations, and a generic, config-driven **DHIS2 extractor**. Point it at any DHIS2
program, indicators, and org-unit hierarchy to build your own portal.

It ships with **one worked example to copy from** — an **Antenatal Care** portal (`/anc`)
extracted from the **public DHIS2 Sierra Leone demo server** (`play.im.dhis2.org`),
replicating dashboard `nghVC4wtyzi`. The ANC content is purely illustrative; the project is
**not** ANC-specific — swap in your own config, sources, and pages. The example spans the
full **baked ↔ engine** spectrum:

- **`/anc`** — baked national overview; pure static HTML, no SQL engine downloaded.
- **`/anc/dashboard`** — the 11-item dashboard replica; a root-org-unit + reference-year
  selector re-computes every chart and map client-side in DuckDB-WASM.
- **`/anc/profile`** — on-demand org-unit profile drill-down (queried live in-browser,
  deep-linkable).

📖 **Want to build your own?** Read the **[User Manual](docs/USER-MANUAL.md)** — a
task-oriented walkthrough of the whole pipeline (extract → source → pages → deploy),
plus `AGENTS.md` for the architecture and the hard-won gotchas list.

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
   (`type: csv`, `type: duckdb`, …) and your files/queries. For DHIS2, use the bundled
   `scripts/dhis2-extract/` extractor, point a DuckDB source at an analytics-API extract,
   or drop pre-extracted CSV/Parquet files.
2. **Pages** — add Markdown + SQL under `evidence/pages/`. Queries with no reactive
   input are baked at build (no client engine); queries referencing `${inputs.x}` run
   client-side in DuckDB-WASM on demand.
3. `npm run sources && npm run build && npm run deploy`.

The **[User Manual](docs/USER-MANUAL.md)** walks through each step in detail, including
adapting the extractor to your own DHIS2 instance and replicating an existing dashboard.

## Environment requirement

The build is **stock Evidence** — stock `evidence sources` and stock prerendering, no
shims. The single requirement is that **`extensions.duckdb.org` is reachable** (DuckDB-WASM
autoloads its Parquet/httpfs extensions there at build and runtime, once, then caches).

`evidence/scripts/patch-evidence.mjs` applies idempotent build-time tweaks to the stock
template: an adapter fallback page, lazy DuckDB-WASM init (so baked pages never download
the engine), and the layout/branding (full-width, DHIS2 logo, no Evidence footer). See
`AGENTS.md` for the full guide and conventions, and `docs/USER-MANUAL.md` for the how-to.
