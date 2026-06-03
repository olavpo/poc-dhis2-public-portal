#!/usr/bin/env bash
#
# Serve the live build (the `current` symlink) as static files. Stands in for
# nginx in the POC. Uses a small Node server (scripts/serve.mjs) that supports
# HTTP Range requests (needed by DuckDB-WASM for ranged Parquet reads) and SPA
# fallback routing (the Evidence build is a client-rendered SPA).
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -e "$ROOT/current" ]; then
  echo "No current/ build to serve — run 'npm run deploy' first." >&2
  exit 1
fi

exec node "$ROOT/scripts/serve.mjs"
