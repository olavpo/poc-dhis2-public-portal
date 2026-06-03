---
title: DHIS2 Public Portal
---

A generic, static **public-portal foundation** for DHIS2 analytics data, built with
[Evidence](https://evidence.dev) and DuckDB-WASM.

This branch (`master`) is the reusable **infrastructure only** — the build pipeline,
the static-serving stack (precompression + range-capable server, an nginx stand-in),
and the two build-time Evidence optimisations. It ships with **no dashboards and no
data sources**: those are added per deployment.

## How it works

- **Sources** (`evidence/sources/`) declare where data comes from (CSV/Parquet files,
  or a DuckDB query over a live extract). `npm run sources` ingests them to Parquet +
  a manifest.
- **Pages** (`evidence/pages/`) are Markdown + SQL. A query with no reactive input is
  **baked** into the page at build (no SQL engine shipped to the client); a query that
  references an `${inputs.x}` filter runs **client-side** in DuckDB-WASM on demand.
- **Build** prerenders the site to static files; **deploy** flips an atomic `current`
  symlink; **serve** is a range-capable static server (nginx stand-in) that serves the
  precompressed `.br`/`.gz` assets.

## Add your portal

1. Add a datasource under `evidence/sources/` (see the Evidence docs) — for DHIS2,
   point a DuckDB source at an analytics-API extract, or drop pre-extracted files.
2. Add Markdown+SQL pages under `evidence/pages/`.
3. `npm run sources && npm run build && npm run deploy`.

See `AGENTS.md` for the full pipeline, conventions, and the one environment requirement.
