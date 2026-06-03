# AGENTS.md — DHIS2 Public Portal (generic foundation)

Guidance for AI agents (and humans) working in this repo.

## What this is

A generic, reusable **static public-portal foundation** for DHIS2 analytics data,
built with [Evidence](https://evidence.dev) over DuckDB-WASM — no database, no app
server. This branch (`master`) is **infrastructure only**: the build/deploy/serve
pipeline and the two build-time Evidence optimisations, with **no dashboards and no
datasources**. Concrete portals are built on top of it.

> A full worked example — a public education-statistics portal for Nigeria's the prior example,
> with synthetic data, drill-down dashboards, and a minister's dashboard — lives on
> the **`the prior example`** branch. Use it as a reference for how to add sources, pages, and
> custom components on this foundation.

The reference architecture this implements is in
`docs/portal-architecture.md`.

## Pipeline & commands

```
evidence/sources/   →  Parquet + manifest in                       [npm run sources]
 (your datasources)    evidence/.evidence/template/static/data       (stock evidence sources)
        │
Evidence (vite)     →  prerendered static site in evidence/build   [npm run build]
        │
deploy.sh           →  builds/<ts>/ + atomic `current` symlink     [npm run deploy]
serve.sh / serve.mjs →  static server on $SANDBOX_HOST_PORT         [npm run serve]
```

- `npm run dev` — Evidence dev server (live reload).
- `npm run build` — patch the template (idempotent) then prerender.
- Browse a deploy at `http://localhost:$SANDBOX_HOST_PORT`.

## Layout

| Path | Responsibility |
|---|---|
| `evidence/sources/` | Datasource definitions (`connection.yaml` + files/queries). **Empty in this foundation — add yours.** |
| `evidence/pages/` | Dashboards (Markdown + SQL). `index.md` is a generic landing page. |
| `evidence/components/` | Custom Svelte components (none here; see a separate branch for examples). |
| `evidence/scripts/patch-evidence.mjs` | Idempotent build-time optimisations (adapter fallback + lazy DuckDB init). |
| `evidence/evidence.config.yaml` | Theme/appearance + datasource plugins (CSV + DuckDB). |
| `scripts/deploy.sh`, `scripts/serve.mjs` | Atomic versioned deploy + range-capable static server. |
| `scripts/precompress.mjs` | Writes `.br`/`.gz` for JS/CSS/HTML/**wasm** (run by `deploy.sh`). |
| `docs/` | Reference architecture + design/plan docs. |

## Baked vs. engine (the key decision when authoring pages)

Evidence decides per query, by whether the SQL references a reactive input:

- **Baked at build** — a query with no `${inputs.x}` is executed at build time and its
  result is written into the page HTML + a `.arrow` file. The client renders it
  **without downloading the DuckDB-WASM engine**. Use this for everything you can.
- **Client-side (engine)** — a query that references `${inputs.x}` (from a `<Dropdown>`
  etc.), a custom component calling `query()`, or data loaded on demand, runs in
  DuckDB-WASM in the browser. The engine (~6 MB compressed) loads lazily on the first
  such query (see the lazy-init patch), so only pages that need it pay for it.

Rule of thumb: prefer baked pages; reach for client-side only for interactive filters,
very large drill-down tiers loaded on demand, or genuinely dynamic views.

## Environment requirement (IMPORTANT)

**`extensions.duckdb.org` must be reachable** (allowlisted in the sandbox firewall).
DuckDB-WASM autoloads its Parquet/httpfs extensions from there — needed at **build
time** (`evidence sources` and the Node-side prerender read Parquet) and at **runtime**
(browser). One-time, cached. This is the only sandbox requirement; the build is
**stock `evidence sources` + stock prerendering**, no shims.

`patch-evidence.mjs` applies only two build-time *optimisations* (not workarounds):
an adapter-static `fallback: '200.html'` safety net, and **lazy DuckDB-WASM init** so
baked pages never download the engine. See that file's header.

## Conventions & gotchas

- **Custom HTML loops must live in a `.svelte` component**, not in markdown — mdsvex
  does not compile `{#each}`/`{expr}` inside raw-HTML islands.
- **Input-driven queries need an input to initialise** (e.g. a `<Dropdown>`); Evidence
  defers any query referencing `${inputs.x}` until `inputs.x` exists.
- **Assets are precompressed.** `scripts/precompress.mjs` (run by `deploy.sh`) writes
  `.br`/`.gz` for JS/CSS/HTML/**wasm**; `serve.mjs` serves them (nginx `brotli_static`
  parity). Without it the DuckDB-WASM engine ships ~33 MB uncompressed.
- Builds take a few minutes at scale; run them in the background and poll the log.

## Connecting DHIS2 data

Two common patterns:

1. **Pre-extracted files** — run an analytics-API extract that writes CSV/Parquet, drop
   them under a source dir, declare it in `connection.yaml`, `npm run sources`.
2. **DuckDB source** — use the `@evidence-dev/duckdb` connector to query an extract (or
   a file produced by one) directly.

The sandbox allowlists `dhis2.org`, and a sibling `dhis2` dev container is reachable by
name on `dev-net` (`http://dhis2:8080/api/...`) for live-extract experiments.
