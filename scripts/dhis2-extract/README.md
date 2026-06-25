# DHIS2 analytics extractor

A generic, config-driven Node CLI that pulls a *superset* analytics extract from a
DHIS2 instance and writes tidy CSVs + GeoJSON into an Evidence CSV source. It has no
TypeScript build step — plain ES modules (`.mjs`), Node ≥18 (global `fetch`).

The extractor is an **author-time pre-step**, not a build shim: you run it once (when
you want fresh data), it materialises files on disk, and the rest of the pipeline
(`npm run sources` → `npm run build`) is stock Evidence.

The worked example on this branch is the **Nigeria Annual School Census** (`config/asc.yaml`),
wired to the `extract:asc` npm script. It pulls Education indicators for org-unit levels
1–3 (Federal / State / LGA) plus Ownership (Public/Private) and School-Type disaggregations
(including a School-Type × Ownership cross-cut), into `evidence/sources/census/`.

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

Tuning env vars (all optional — defaults suit a large but healthy instance):

| Env | Default | Effect |
|---|---|---|
| `DX_CHUNK` | `10` | dx UIDs per analytics request |
| `OU_CHUNK` | `25` | org units per analytics request (requests are batched by explicit OU id) |
| `HTTP_RETRIES` | `4` | retries on a transient error before giving up |
| `HTTP_RETRY_BASE_MS` | `1000` | base backoff (exponential: 1s, 2s, 4s, … capped 15s + jitter) |
| `EXTRACT_FAIL_ON_SKIP` | _unset_ | if set, exit non-zero when any dx×level cut was skipped |
| `D2_BASE_URL` | config `baseUrl` | override the target instance per run |

On a **struggling server, lower `OU_CHUNK` and/or `DX_CHUNK`** — smaller requests are far less
likely to time out (see *Resilience & server load*).

## Config schema (`config/asc.yaml`)

```yaml
baseUrl: http://dhis2-agent-emis-ng:8080            # required — trailing slash trimmed
dx: [jwjKmtVK2wj, Dw7f4gs9RcS, ...]                 # required — indicator/data dx UIDs
ouLevels: [1, 2, 3]                                 # required — org-unit levels to pull
periods:                                            # required — either an explicit list...
  list: ['2024']
  # ...or a range:
  # range: '2021..2025'
  # types: [monthly, quarterly, yearly]
disaggregations:                                    # optional (default [])
  - dim: gAmNV64G0pZ         # ORG_UNIT_GROUP_SET (or other) dimension id (e.g. Ownership)
    slug: ownership          # → output file fact_<slug>.csv
    dx: [jwjKmtVK2wj, ...]   # subset of dx to disaggregate
    ouLevels: [1, 2, 3]      # levels for this cut (default [1])
  - dims: [rtQk5MWCxyR, gAmNV64G0pZ]   # cross-cut TWO+ group sets (e.g. School Type × Ownership)
    slug: typeown            # → fact_typeown.csv with cat1_* / cat2_* columns (one pair per dim)
    dx: [jwjKmtVK2wj, ...]
    ouLevels: [1, 2]
```

Use `dim:` for a single dimension (output has `category_id` / `category_name`); use
`dims: [a, b, …]` to cross-cut several at once (output has `cat1_id`/`cat1_name`,
`cat2_id`/`cat2_name`, … one pair per dimension, in order). A marginal single-dimension cut
(`dim:`) is **not** the same as a sum over a cross-cut — extract whichever a view needs
directly (rates can't be summed across a dimension).

## Outputs (written to `--out`)

| File | Columns |
|---|---|
| `fact.csv` | `dx, ou, pe, periodType, value` |
| `fact_<slug>.csv` (one per disaggregation) | single `dim`: `dx, ou, pe, periodType, category_id, category_name, value`; multi `dims`: `…, cat1_id, cat1_name, cat2_id, cat2_name, …, value` |
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

Tuned for large / busy instances (a national hierarchy with hundreds of LGAs is on the high
end of what DHIS2 40 is tested with, and a single whole-level request can overwhelm it):

- Requests are **fully sequential** (one in flight at a time) — no parallel fan-out.
- Each analytics request is small and bounded on **both axes**: at most `DX_CHUNK` dx and
  `OU_CHUNK` org units. Org units are requested as **explicit ids** (batched), not as a whole
  `ou:LEVEL-n` — so asking for level 3 doesn't pull every LGA in the country in one call. (The
  org-unit hierarchy is fetched first to drive this.)
- **Transient errors retry with exponential backoff** (`502`/`503`/`504` and network drops,
  `HTTP_RETRIES`× with `HTTP_RETRY_BASE_MS` backoff). If a group still fails after retries, the
  server is treated as unavailable and the **whole group is skipped at once** (logged `[skip]`)
  — bisecting a gateway error would just hammer a struggling server.
- **Structural errors bisect** — a `500`/`409` (e.g. an indicator genuinely undefined at a
  deeper level, like the MD school-count indicators at LGA) is isolated by halving the dx-group
  down to the single offending dx, which is skipped; the rest still contribute rows.
- A **skip summary** prints at the end: any skipped dx×level cut means that data is *missing*
  from the CSVs and the portal will show gaps there. 502/504 skips mean re-run when the instance
  is healthy (and/or lower `OU_CHUNK`/`DX_CHUNK`); set `EXTRACT_FAIL_ON_SKIP=1` to make an
  incomplete extract exit non-zero. Make sure analytics tables are freshly generated first.

## How it works

Periods are expanded (`lib/periods.mjs`) and fetched in count-bounded chunks
(`lib/dhis2.mjs` `chunkPeriods`, default 24). Pure transforms (`lib/facts.mjs`,
`lib/orgunits.mjs`, `lib/csv.mjs`) turn the analytics and geoFeatures responses into the tidy
rows above; they are unit-tested with Vitest (colocated `*.test.mjs`).
