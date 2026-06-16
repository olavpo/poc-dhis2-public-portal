#!/usr/bin/env bash
#
# Atomic deploy: copy the Evidence build into a timestamped directory and flip
# the `current` symlink to it. nginx (here: serve.sh) serves `current/`. A failed
# build leaves the previous `current` untouched. Mirrors §5.6 of the architecture.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_SRC="$ROOT/evidence/build"
BUILDS_DIR="$ROOT/builds"
KEEP="${KEEP_BUILDS:-3}"

if [ ! -f "$BUILD_SRC/index.html" ] && [ ! -f "$BUILD_SRC/200.html" ]; then
  echo "No build found at $BUILD_SRC — run 'npm run build' first." >&2
  exit 1
fi

TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
DEST="$BUILDS_DIR/$TS"
mkdir -p "$BUILDS_DIR"
cp -r "$BUILD_SRC" "$DEST"

# Pre-compress text assets (gzip_static / brotli_static) so the immutable JS/CSS
# is compressed once here rather than per request.
node "$ROOT/scripts/precompress.mjs" "$DEST" || true

# Atomic flip: ln -sfn replaces the symlink in a single rename().
ln -sfn "$DEST" "$ROOT/current"
echo "Deployed build $TS → current/"

# Prune all but the newest $KEEP build directories.
# (portable — macOS ships bash 3.2, which has no `mapfile`)
OLD=()
while IFS= read -r d; do OLD+=("$d"); done < <(ls -1dt "$BUILDS_DIR"/*/ 2>/dev/null | tail -n +"$((KEEP + 1))")
if [ "${#OLD[@]}" -gt 0 ]; then
  rm -rf "${OLD[@]}"
  echo "Pruned ${#OLD[@]} old build(s); kept newest $KEEP."
fi
