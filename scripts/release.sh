#!/usr/bin/env bash
#
# Build → deploy → serve, one shot. The prerender of the full org-unit tree (~812 pages,
# each with server-rendered ECharts) is memory-heavy, so we hand Node a 16 GB heap.
#
#   ./scripts/release.sh            # build, deploy, serve
#   ./scripts/release.sh --sources  # also rebuild DuckDB sources first (after re-extracting)
#   ./scripts/release.sh --no-serve  # build + deploy only
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Heap for the prerender (the only memory-heavy step). Override on big-RAM machines, e.g.
#   NODE_HEAP_MB=24576 ./scripts/release.sh --sources
export NODE_OPTIONS="--max-old-space-size=${NODE_HEAP_MB:-16384}"

WITH_SOURCES=0
SERVE=1
for arg in "$@"; do
  case "$arg" in
    --sources) WITH_SOURCES=1 ;;
    --no-serve) SERVE=0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if [ "$WITH_SOURCES" -eq 1 ]; then
  echo "==> sources (rebuild DuckDB parquet from CSVs)"
  npm run sources
fi

# Evidence's template populate (in `evidence build`) removes .evidence/template/src and can
# throw `ENOTEMPTY` on newer Node (rmSync recursive quirk, seen on Node ≥22/24). Pre-clean it
# with the shell (robust) so the populate re-copies fresh. The parquet under
# .evidence/template/static/data (written by `sources`) is preserved; only generated code is
# cleared. Also drop stale Vite cache + old build output.
echo "==> clean stale template/build caches"
rm -rf "$ROOT/evidence/.evidence/template/src" \
       "$ROOT/evidence/.evidence/template/.svelte-kit" \
       "$ROOT/evidence/node_modules/.vite" \
       "$ROOT/evidence/build" 2>/dev/null || true

echo "==> build (patch + generate pages + prerender) — NODE heap 16 GB"
npm run build

echo "==> deploy (atomic flip of current/)"
npm run deploy

if [ "$SERVE" -eq 1 ]; then
  echo "==> serve"
  npm run serve
else
  echo "Done (skipped serve). Run 'npm run serve' when ready."
fi
