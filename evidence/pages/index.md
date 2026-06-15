---
title: DHIS2 Public Portal
---

A generic, static **public-portal foundation** for DHIS2 analytics data, built with
[Evidence](https://evidence.dev) and DuckDB-WASM — no database, no app server. It is
**domain-agnostic**: point it at any DHIS2 program, indicators, and org-unit hierarchy and
build your own portal.

> This is a **fresh, from-scratch portal**. There are no pages yet — add a datasource and
> some pages, then `npm run sources && npm run build && npm run deploy`.

## How it works

- **Sources** (`evidence/sources/`) declare where data comes from (CSV/Parquet files,
  or a DuckDB query over a live extract). `npm run sources` ingests them to Parquet +
  a manifest.
- **Pages** (`evidence/pages/`) are Markdown + SQL. A query with no reactive input is
  **baked** into the page at build (no SQL engine shipped to the client); a query that
  references an `${inputs.x}` filter runs **client-side** in DuckDB-WASM on demand.
- **Build** prerenders the site to static files; **deploy** flips an atomic `current`
  symlink; **serve** is a range-capable static server that serves the precompressed
  `.br`/`.gz` assets.

## Add your portal

1. Add a datasource under `evidence/sources/` — for DHIS2, use the bundled extractor
   (`scripts/dhis2-extract/`; see `config/anc.yaml` for a worked-example config to copy),
   point a DuckDB source at an analytics-API extract, or drop pre-extracted files.
2. Add Markdown + SQL pages under `evidence/pages/`.
3. `npm run sources && npm run build && npm run deploy`.

See `AGENTS.md` for the full pipeline and conventions, and
`docs/EXAMPLES-anc-reference.md` for a worked cookbook of page patterns (baked overview,
interactive dashboard, deep-linkable profile component).
