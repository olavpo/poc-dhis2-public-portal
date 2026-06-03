# DHIS2 analytics extractor

A generic, config-driven Node CLI that pulls a *superset* analytics extract from a
DHIS2 instance and writes tidy CSVs + GeoJSON into an Evidence CSV source. It has no
TypeScript build step — plain ES modules (`.mjs`), Node ≥18 (global `fetch`).

The extractor is an **author-time pre-step**, not a build shim: you run it once (when
you want fresh data), it materialises files on disk, and the rest of the pipeline
(`npm run sources` → `npm run build`) is stock Evidence.

## Usage

```bash
DHIS2_USERNAME=admin DHIS2_PASSWORD=district \
  node scripts/dhis2-extract/index.mjs --config <path/to/config.yaml> --out <output/dir>
```

- `--config` — path to a YAML config (see schema below). Required.
- `--out` — directory to write the CSV/GeoJSON outputs into (default `data/anc`).
- Authentication is read from the environment (`DHIS2_USERNAME`, `DHIS2_PASSWORD`) and
  is **never** placed in the config or committed.

The worked example config is `config/anc.yaml` (Sierra Leone Antenatal Care). It is
wired to the `extract:anc` npm script, which also copies the GeoJSON into
`evidence/static/`:

```bash
DHIS2_USERNAME=admin DHIS2_PASSWORD=district npm run extract:anc
```

## Config schema (`config/anc.yaml`)

```yaml
baseUrl: https://play.im.dhis2.org/stable-2-43-0   # required — trailing slash trimmed
dx: [Uvn6LCg7dVU, ...]                              # required — indicator/data dx UIDs
ouLevels: [1, 2, 3, 4]                              # required — org-unit levels to pull
periods:                                            # required — either a range...
  range: '2021..2025'
  types: [monthly, quarterly, yearly]
  # ...or an explicit list:
  # list: ['2024', '2024Q1']
disaggregations:                                    # optional (default [])
  - dim: J5jldMd8OHv         # ORG_UNIT_GROUP_SET (or other) dimension id
    slug: facility_type      # → output file fact_<slug>.csv
    dx: [hfdmMSPBgLG, ...]   # subset of dx to disaggregate
    ouLevels: [1, 2]         # levels for this cut (default [1])
```

## Outputs (written to `--out`)

| File | Columns |
|---|---|
| `fact.csv` | `dx, ou, pe, periodType, value` |
| `fact_<slug>.csv` (one per disaggregation) | `dx, ou, pe, periodType, category_id, category_name, value` |
| `ou.csv` | `id, name, level, parent_id, parent_name, path, ty, lng, lat` |
| `ou.geojson` | GeoJSON `FeatureCollection` (point facilities + polygon areas); properties `id, name, level, parent_id` |
| `dx.csv` | `id, name` (resolved indicator names from analytics metaData) |
| `pe.csv` | `period, periodType, year, quarter, month, startDate` |

Notes:
- `periodType` is derived from each period id (`MONTHLY` / `QUARTERLY` / `YEARLY`).
- `ou.csv` `path` is the ancestor path (self excluded), `ty` is 1=point/facility,
  2=polygon/area; `lng`/`lat` are populated only for points.
- The Evidence CSV connector ignores `ou.geojson`; it is served from `evidence/static/`
  (the `extract:anc` script copies it to `evidence/static/anc.geojson`).

## How it works

Periods are expanded (`lib/periods.mjs`) and fetched in count-bounded chunks
(`lib/dhis2.mjs` `chunkPeriods`, default 24) to keep analytics URLs/responses sane.
Pure transforms (`lib/facts.mjs`, `lib/orgunits.mjs`, `lib/csv.mjs`) turn the analytics
and geoFeatures responses into the tidy rows above; they are unit-tested with Vitest
(colocated `*.test.mjs`).
