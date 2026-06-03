# Evidence data sources

This foundation ships with **no datasources**. Add one per deployment:

- Create a subdirectory here (e.g. `evidence/sources/<name>/`).
- Add a `connection.yaml` (e.g. `type: csv` or `type: duckdb`) and the source files
  or queries. For DHIS2, point a DuckDB source at an analytics-API extract, or drop
  pre-extracted CSV/Parquet files.
- Run `npm run sources` to ingest them into the Evidence manifest.

See https://docs.evidence.dev/core-concepts/data-sources/ for connector options.
