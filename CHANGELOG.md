# Changelog

All notable changes to the DNEMIS Education Statistics public portal (Nigeria Annual School
Census) are documented here. This project adheres to [Semantic Versioning](https://semver.org).

## [0.1.0] — 2026-06-24

First tagged release of the portal: a fully static [Evidence](https://evidence.dev) +
DuckDB-WASM site over the Annual School Census — baked Federal and State pages with an
engine-free Total/Public/Private toggle, client-rendered LGA pages, and a config-driven DHIS2
extractor. Highlights of this release:

### Maps
- **Click-only choropleth.** The children map is now navigation-only — panning and every zoom
  path (scroll/smooth-wheel, double-click, box, pinch, keyboard) are disabled. Clicking a region
  still drills down (Federal → State → LGA) and tooltips still work; the view stays fitted to the
  data bounds.

### Data & reliability
- **Reference period set to 2024** across the extractor config and the page template.
- **Hardened DHIS2 extractor** for large / busy instances (a national hierarchy of ~770 LGAs is
  at the high end of what DHIS2 40 is tested with):
  - Analytics requests are chunked on **both axes** — by `dx` group *and* by explicit org-unit id
    (`OU_CHUNK` at a time), so a level no longer pulls every org unit in one call.
  - **Transient gateway errors (502/503/504, network drops) retry with exponential backoff**
    before being skipped, instead of being silently dropped.
  - Transient failures skip the whole group; **structural `500`/`409` still bisect** to isolate
    the single genuinely-undefined indicator.
  - A **loud end-of-run skip summary** flags any missing `dx`×level cut; `EXTRACT_FAIL_ON_SKIP=1`
    exits non-zero on an incomplete extract.
  - New tunables: `DX_CHUNK`, `OU_CHUNK`, `HTTP_RETRIES`, `HTTP_RETRY_BASE_MS`.
  - *Fixes* the previously half-empty extracts (Federal-only data; blank maps, donuts, and
    ownership toggle) caused by the server returning gateway errors under load.

### Documentation
- **Added `docs/INDICATOR-REFERENCE.md`** — maps every portal variable (KPI tiles, reporting &
  completeness, the "Key indicators" benchmark, charts, and the "Indicators by …" compare table)
  to the exact DHIS2 indicator / data-element UID(s) and the formula behind each computed value.

[0.1.0]: https://github.com/olavpo/poc-dhis2-public-portal/tree/emis-pp
