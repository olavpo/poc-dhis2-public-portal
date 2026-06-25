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
# `set -e` means a failed extract (expired token, DHIS2 unreachable) aborts BEFORE deploy,
# so the last good build keeps serving — the regen never publishes an empty/partial portal.
#
# Secrets come from an environment file outside the repo (default /etc/dnemis-portal.env,
# override with DNEMIS_ENV_FILE), which must set D2_TOKEN (and may set D2_BASE_URL).
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

log "1/4 extract:asc  — pulling data from DHIS2"; npm run extract:asc
log "2/4 sources      — ingesting to Parquet";    npm run sources
log "3/4 build        — patch + pages + prerender"; npm run build
log "4/4 deploy       — flipping current symlink"; npm run deploy

log "regeneration done"
