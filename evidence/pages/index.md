---
title: DHIS2 Public Portal
---

A generic, static **public-portal foundation** for DHIS2 analytics data, built with
[Evidence](https://evidence.dev) and DuckDB-WASM. It is **domain-agnostic**: point it at
any DHIS2 program, indicators, and org-unit hierarchy and build your own portal.

> The portal linked below is **just one example** — an Antenatal Care dashboard built from
> the **public DHIS2 Sierra Leone demo** server (`play.im.dhis2.org`). It demonstrates the
> foundation; it is **not** what the project is for. Swap in your own data sources and pages.

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

## Example portal: Antenatal Care (Sierra Leone demo data)

One worked example built on this foundation, extracted from the public DHIS2 Sierra Leone
demo server — purely illustrative of what you can build:

- **[National overview](/anc)** — baked; renders with no SQL engine downloaded.
- **[ANC dashboard](/anc/dashboard)** — the full DHIS2 dashboard replica; pick a root org
  unit and reference year and every chart/map recomputes in your browser.
- **[Org-unit profile](/anc/profile)** — drill into any district or chiefdom on demand.

## Add your own portal

1. Add a datasource under `evidence/sources/` — for DHIS2, use the bundled extractor
   (`scripts/dhis2-extract/`), point a DuckDB source at an analytics-API extract, or drop
   pre-extracted files.
2. Add Markdown+SQL pages under `evidence/pages/`.
3. `npm run sources && npm run build && npm run deploy`.

See `AGENTS.md` for the full pipeline, conventions, and the one environment requirement.
