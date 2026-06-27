#!/usr/bin/env bash
#
# Daily data regeneration for the deployed portal.
#
#   extract:asc  → pull fresh analytics from DHIS2 into evidence/sources/census/
#   sources      → ingest to Parquet + manifest
#   build        → ROOT build (patch + pages:asc + evidence build); NOT `npm --prefix evidence`
#   deploy       → atomic builds/<ts> + flip the `current` symlink (scripts/deploy.sh)
#
# Data-only: it rebuilds from the CURRENTLY checked-out code — it does NOT `git pull`.
# Ship code changes manually (git pull && npm run build && npm run deploy). See docs/DEPLOYMENT.md.
#
# Split-box deploy: if the env file sets PORTAL_HOST, a 5th step pushes the freshly-deployed
# build to the remote serving box (scripts/push-remote.sh) and purges Cloudflare AFTER the
# remote flip. Unset → single-box (this machine serves `current` directly) and the push is
# skipped (deploy.sh's own Cloudflare purge then applies). See docs/DEPLOYMENT.md.
#
# `set -e` means a failed extract (expired token, DHIS2 unreachable) aborts BEFORE deploy,
# so the last good build keeps serving — the regen never publishes an empty/partial portal.
#
# Secrets come from an environment file outside the repo (default /etc/dnemis-portal.env,
# override with DNEMIS_ENV_FILE), which must set D2_TOKEN (and may set D2_BASE_URL). It may
# also set CF_ZONE_ID + CF_PURGE_TOKEN (a token with the Zone "Cache Purge" permission) — if
# present, deploy.sh purges the Cloudflare edge cache after flipping the symlink.
#
# Intended to run from cron, e.g.:
#   59 23 * * * /opt/poc-dhis2-public-portal/scripts/regenerate.sh >> /var/log/dnemis-regen.log 2>&1
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DNEMIS_ENV_FILE:-/etc/dnemis-portal.env}"
LOCK_FILE="${DNEMIS_LOCK_FILE:-/tmp/dnemis-regen.lock}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

# Single-instance: a long extract+build must not overlap the next cron tick.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "another regeneration is already running ($LOCK_FILE) — skipping this run"
  exit 0
fi

# Load secrets (D2_TOKEN, optional D2_BASE_URL). `set -a` exports everything the file sets.
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
else
  log "ERROR: env file not found: $ENV_FILE (must define D2_TOKEN)"; exit 1
fi
if [ -z "${D2_TOKEN:-}" ] && [ -z "${DHIS2_USERNAME:-}" ]; then
  log "ERROR: $ENV_FILE sets neither D2_TOKEN nor DHIS2_USERNAME/DHIS2_PASSWORD"; exit 1
fi

cd "$REPO"
log "regeneration start (repo=$REPO)"

log "1/5 extract:asc  — pulling data from DHIS2"; npm run extract:asc
log "2/5 sources      — ingesting to Parquet";    npm run sources
log "3/5 build        — patch + pages + prerender"; npm run build
log "4/5 deploy       — flipping current symlink"; npm run deploy

# Split-box: publish to the remote serving box when configured; otherwise this box serves
# `current` itself and there is nothing to push. push-remote.sh fails loud (set -e aborts the
# run) so a broken publish is visible in the log rather than silently leaving stale data live.
if [ -n "${PORTAL_HOST:-}" ]; then
  log "5/5 push-remote  — rsync + flip on $PORTAL_HOST"; npm run push
else
  log "5/5 push-remote  — skipped (PORTAL_HOST unset; single-box serve)"
fi

log "regeneration done"
