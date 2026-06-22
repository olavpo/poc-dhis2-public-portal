# DHIS2 analytics extractor

A generic, config-driven Node CLI that pulls a *superset* analytics extract from a
DHIS2 instance and writes tidy CSVs + GeoJSON into an Evidence CSV source. It has no
TypeScript build step — plain ES modules (`.mjs`), Node ≥18 (global `fetch`).

The extractor is an **author-time pre-step**, not a build shim: you run it once (when
you want fresh data), it materialises files on disk, and the rest of the pipeline
(`npm run sources` → `npm run build`) is stock Evidence.

The worked example on this branch is the **Nigeria Annual School Census** (`config/asc.yaml`),
wired to the `extract:asc` npm script. It pulls Education indicators for org-unit levels
1–3 (Federal / State / LGA) plus an Ownership (Public/Private) disaggregation, into
`evidence/sources/census/`.

## Authentication

Credentials come from the environment and are **never** placed in the config or committed.
A **personal access token is preferred** (create one in DHIS2 under *Profile → Personal access
tokens*); basic username/password still works as a fallback.

```bash
# token (preferred)
D2_TOKEN="d2pat_xxxxxxxx" npm run extract:asc

# or basic auth
DHIS2_USERNAME=admin DHIS2_PASSWORD=district npm run extract:asc
```

The token is sent as `Authorization: ApiToken <token>`; user/pwd as HTTP Basic.

## Usage (generic)

```bash
D2_TOKEN="d2pat_xxxx" \
  node scripts/dhis2-extract/index.mjs --config <path/to/config.yaml> --out <output/dir>
```

- `--config` — path to a YAML config (see schema below). Required.
- `--out` — directory to write the CSV/GeoJSON outputs into (default `data/out`).

## Config schema (`config/asc.yaml`)

```yaml
baseUrl: http://dhis2-agent-emis-ng:8080            # required — trailing slash trimmed
dx: [jwjKmtVK2wj, Dw7f4gs9RcS, ...]                 # required — indicator/data dx UIDs
ouLevels: [1, 2, 3]                                 # required — org-unit levels to pull
periods:                                            # required — either an explicit list...
  list: ['2025']
  # ...or a range:
  # range: '2021..2025'
  # types: [monthly, quarterly, yearly]
disaggregations:                                    # optional (default [])
  - dim: gAmNV64G0pZ         # ORG_UNIT_GROUP_SET (or other) dimension id (e.g. Ownership)
    slug: ownership          # → output file fact_<slug>.csv
    dx: [jwjKmtVK2wj, ...]   # subset of dx to disaggregate
    ouLevels: [1, 2, 3]      # levels for this cut (default [1])
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
- The Evidence CSV connector ignores `ou.geojson`. The ASC page generator
  (`scripts/asc-pages/generate.mjs`) reads `evidence/sources/census/ou.geojson` and writes
  per-scope files into `evidence/static/asc/`. If your portal needs a single static GeoJSON
  instead, copy `ou.geojson` into `evidence/static/` from your `extract:*` npm script.

## Resilience & server load

- Requests are **fully sequential** (one in flight at a time) — no parallel fan-out.
- `analyticsChunked` splits the pull into one call per ou-level × dx-group (`DX_CHUNK`, default
  20) to stay under DHIS2's analytics cell cap.
- On a failed chunk (e.g. an indicator that 500s at a deeper level) it **bisects and retries**,
  skipping only the offending dx (logged as `[skip]`) rather than aborting the whole run.
- The heaviest calls are deep-level (LGA) queries, especially when an org-unit-group-set
  disaggregation is added — lower `DX_CHUNK` or restrict that cut's `ouLevels` if the server is
  sensitive. Make sure analytics tables are freshly generated first.

## How it works

Periods are expanded (`lib/periods.mjs`) and fetched in count-bounded chunks
(`lib/dhis2.mjs` `chunkPeriods`, default 24). Pure transforms (`lib/facts.mjs`,
`lib/orgunits.mjs`, `lib/csv.mjs`) turn the analytics and geoFeatures responses into the tidy
rows above; they are unit-tested with Vitest (colocated `*.test.mjs`).
