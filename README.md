# DNEMIS — Education Statistics Public Portal (Nigeria ASC)

> ⚠️ **Proof of concept — not production-ready.** A demonstration / reference implementation
> to explore the approach. It has **not** been hardened, performance-tested at scale,
> accessibility-audited, or security-reviewed for production. Use it as a starting point and
> learning resource, not as-is in production.

The **static public portal** for Nigeria's **Annual School Census (ASC)** — the "Education
Statistics" site of the Federal Ministry of Education's **Digital National Education
Management Information System (DNEMIS)**. Built with [Evidence](https://evidence.dev) over
DuckDB-WASM: no database, no app server, **no live DHIS2 at runtime** — the site is
prerendered to static files and served by any static host.

It is built on a reusable, domain-agnostic **DHIS2 public-portal foundation** (the `master`
branch): the build/deploy/serve pipeline, asset precompression, a range-capable static server
(nginx stand-in), build-time Evidence optimisations, a config-driven **DHIS2 extractor**, and
a **page generator** that emits one page per org unit. This branch (`emis-pp`) wires all of
that to the real Nigeria EMIS instance.

The portal covers org-unit levels **Federal / State / LGA**, reference year **2024**, with
**Ownership (Public/Private)** and **School Type** breakdowns, and spans the full
**baked ↔ engine** spectrum:

- **`/asc`** (Federal, site root) and **`/asc/state-<id>`** — fully **baked** static HTML; a
  Total/Public/Private toggle drives every KPI, chart, map and the "Indicators by …" compare
  table client-side over already-baked data, with **no SQL engine downloaded**.
- **`/asc/lga/<id>`** — **client-rendered on demand** via one dynamic route; the page boots
  DuckDB-WASM in the browser and queries the bundled Parquet (one-time, cached).

📖 See **[`AGENTS.md`](AGENTS.md)** for the architecture, the build pipeline and the hard-won
gotchas; **[`docs/SERVER-ADMIN.md`](docs/SERVER-ADMIN.md)** for hosting; and
**[`docs/USER-MANUAL.md`](docs/USER-MANUAL.md)** for a task-oriented walkthrough.

## Build & run

```bash
npm install                       # root tooling
npm --prefix evidence install     # Evidence + DuckDB (one-time)

# Refresh the data from the live instance (token preferred; or DHIS2_USERNAME/PASSWORD):
D2_TOKEN="d2pat_xxxx" npm run extract:asc

# One-shot build → deploy → serve (16 GB heap; --sources also rebuilds parquet first):
./scripts/release.sh --sources
# then browse http://localhost:$SANDBOX_HOST_PORT
```

Or step by step:

```bash
npm run dev                       # live-reload dev server
# full static pipeline:
npm run sources                   # ingest evidence/sources/census → Parquet + manifest
npm run build                     # patch + generate pages (pages:asc) + prerender → evidence/build
npm run deploy                    # versioned dir + flip `current` symlink
npm run serve                     # serve on http://localhost:$SANDBOX_HOST_PORT
```

## Pipeline

```
DHIS2 instance      ──►  extract:asc       ──►  evidence/sources/census/*.csv + ou.geojson
        │
evidence/sources/   ──►  npm run sources   ──►  Parquet + manifest (stock evidence sources)
        │
scripts/asc-pages/  ──►  pages:asc         ──►  evidence/pages/asc/** (run by `build`)
        │
Evidence (Vite)     ──►  npm run build     ──►  prerendered static site in evidence/build
        │
scripts/deploy.sh   ──►  builds/<timestamp>/ + atomic `current` symlink flip
scripts/serve.sh    ──►  serves current/ on $SANDBOX_HOST_PORT (nginx stand-in)
```

## Where things live

- **`scripts/dhis2-extract/`** — generic, config-driven DHIS2 analytics extractor;
  `config/asc.yaml` is the ASC config. See its `README.md`.
- **`scripts/asc-pages/`** — page generator (`generate.mjs` + `template.mjs`): the entire
  dashboard is authored once in the template and emitted per org unit.
- **`evidence/sources/census/`** — the ASC CSV datasource (generated; gitignored).
- **`evidence/components/`** — custom Svelte components (ownership toggle, compare table,
  benchmark, KPI/reporting tiles, org-unit profile).
- **`evidence/scripts/patch-evidence.mjs`** — build-time template patches + DNEMIS branding
  (coat-of-arms header, "Download PDF", print CSS).
- **`docs/`** — server-admin guide, user manual, plans/specs.

## Environment requirement

The build is **stock Evidence** — no shims. The one requirement is that
**`extensions.duckdb.org` is reachable**: at **build time** always (DuckDB-WASM autoloads its
Parquet/httpfs extensions there), and at **runtime for LGA pages only** (they query
in-browser). Federal/State pages are baked and need it at build time only.
