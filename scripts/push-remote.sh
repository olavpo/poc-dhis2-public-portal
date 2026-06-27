#!/usr/bin/env bash
#
# Publish the latest local build to a SEPARATE serving box (the small nginx Linode).
#
# Split-box deploy: the build runs on a big-RAM machine (the 16 GB-heap prerender), the
# Linode only serves static files. `npm run deploy` (scripts/deploy.sh) has already copied
# evidence/build → builds/<ts>, PRECOMPRESSED it (.gz/.br), and flipped the LOCAL `current`
# symlink. This script ships that already-precompressed release to the remote box and flips
# the REMOTE `current` symlink atomically — same versioned-release + atomic-flip pattern as
# deploy.sh, just over ssh. Rollback is `ln -sfn` to an older release (see DEPLOYMENT.md).
#
# It rsyncs builds/<ts> (NOT evidence/build) precisely because that directory carries the
# .gz/.br siblings nginx `gzip_static on` serves — rsyncing the raw build would ship the
# ~33 MB DuckDB-WASM engine (and the self-hosted duckdb-extensions/) uncompressed.
#
# Config (env; regenerate.sh sources these from /etc/dnemis-portal.env):
#   PORTAL_HOST     ssh destination — an alias in ~/.ssh/config is best for cron (REQUIRED)
#   PORTAL_BASE     remote app dir; releases live under it, `current` symlinks into it
#                   (default /opt/ascportal → releases/<ts>/ + current)
#   PORTAL_KEEP     remote releases to retain, newest-first (default 3, mirrors KEEP_BUILDS)
#   PORTAL_RELOAD   remote command run AFTER the flip (default: `true`, a no-op).
#                   A content update needs NO reload — nginx resolves the symlink per request,
#                   so the new release is live on the next request (deploy.sh never reloads
#                   either). Set this to e.g. `sudo systemctl reload nginx` ONLY if the serving
#                   box has `open_file_cache` on (then a flip can serve stale fds for up to
#                   open_file_cache_valid, ~60s, until it self-heals; a reload makes it instant).
#   CF_ZONE_ID      } if both set, purge the Cloudflare edge cache AFTER the remote flip (the
#   CF_PURGE_TOKEN  } serving box sits behind CF; same gating as deploy.sh). See note below.
#
# nginx then serves PORTAL_BASE/current at the /portal sub-path (basePath is baked into the
# build). See docs/DEPLOYMENT.md §2.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LINK="$ROOT/current"

PORTAL_BASE="${PORTAL_BASE:-/opt/ascportal}"
PORTAL_KEEP="${PORTAL_KEEP:-${KEEP_BUILDS:-3}}"
PORTAL_RELOAD="${PORTAL_RELOAD:-true}"   # no-op by default — a symlink flip needs no reload

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] push-remote: $*"; }
die() { echo "push-remote: ERROR: $*" >&2; exit 1; }

[ -n "${PORTAL_HOST:-}" ] || die "PORTAL_HOST is not set (ssh destination/alias for the serving box)."
[ -L "$LINK" ] || die "no 'current' symlink at $LINK — run 'npm run deploy' first."

SRC="$(readlink -f "$LINK")"            # …/builds/<ts>
REL="$(basename "$SRC")"
[ -f "$SRC/index.html" ] || [ -f "$SRC/200.html" ] || die "current build at $SRC looks empty."

REMOTE_REL="$PORTAL_BASE/releases/$REL"

log "publishing release $REL → $PORTAL_HOST:$REMOTE_REL"

# 1. Stage the new release alongside (not over) the live one — `current` keeps serving the
#    old build until the flip below, so the swap is seen by visitors as instantaneous.
ssh "$PORTAL_HOST" "mkdir -p '$REMOTE_REL'"
rsync -az --delete "$SRC/" "$PORTAL_HOST:$REMOTE_REL/"

# 2. Flip the remote symlink atomically (ln -sfn = single rename) — the new release is live on
#    the next request, no reload. Then prune old releases (the just-published one is newest so
#    always kept), and run PORTAL_RELOAD (a no-op unless overridden; see header).
ssh "$PORTAL_HOST" "
  set -euo pipefail
  ln -sfn '$REMOTE_REL' '$PORTAL_BASE/current'
  ls -1dt '$PORTAL_BASE/releases/'*/ 2>/dev/null | tail -n +$((PORTAL_KEEP + 1)) | xargs -r rm -rf
  $PORTAL_RELOAD
"

# 3. Purge Cloudflare AFTER the remote flip — only now is the new build live on the origin the
#    edge pulls from. deploy.sh also purges (after its LOCAL flip), but in split-box mode that
#    fired before this publish, so the edge may have repopulated stale; this is the purge that
#    counts (last purge wins). Same gating + non-fatal handling as deploy.sh. The CF API is
#    reachable from the build box, so we curl it here rather than over ssh.
if [ -n "${CF_ZONE_ID:-}" ] && [ -n "${CF_PURGE_TOKEN:-}" ]; then
  log "purging Cloudflare cache (zone $CF_ZONE_ID)…"
  PURGE_RESP="$(curl -s -X POST \
    "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
    -H "Authorization: Bearer $CF_PURGE_TOKEN" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' || true)"
  if printf '%s' "$PURGE_RESP" | grep -q '"success":true'; then
    log "Cloudflare cache purged."
  else
    log "WARNING: Cloudflare purge failed (build is live; edge serves stale until TTL). Response: ${PURGE_RESP:-<none>}"
  fi
fi

log "done — $PORTAL_HOST now serving release $REL (kept newest $PORTAL_KEEP)"
