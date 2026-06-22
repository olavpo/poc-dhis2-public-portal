# DNEMIS Portal — Deployment & Operations (git-based, under `/portal`)

How the live portal is hosted on the proxy box: built **from the git checkout** and served
as static files by OpenResty under the `/portal` sub-path, with a once-a-day data refresh.

> This is the operations runbook for the team that runs the server. For handing the build to
> a third party as a tarball to host at a domain root, see [`SERVER-ADMIN.md`](SERVER-ADMIN.md).

The deployment is: **a git checkout that builds a folder of static files, atomically published
via a `current` symlink that OpenResty serves.** No app server, no database, no runtime calls
to DHIS2. DHIS2 is contacted only at build time, by the daily extract.

---

## 1. Prerequisites

| Need | Notes |
|---|---|
| **Node.js ≥ 18 (use 20 LTS)** | The build is SvelteKit/Evidence. Node 12/14/16 fail with `SyntaxError: Unexpected token '?'` during `npm install`. Install from NodeSource; remove the distro `nodejs`/`libnode-dev` first if they conflict. |
| Repo at `/opt/poc-dhis2-public-portal` | On the `emis-pp` branch (or a deployment branch off it). |
| `npm --prefix evidence install` run once | Installs Evidence + the DuckDB/CSV connectors. |
| Clients can reach `extensions.duckdb.org` | One-time, cached. DuckDB-WASM autoloads Parquet/httpfs extensions there when an LGA page first runs a query. |

---

## 2. Serving under `/portal` (OpenResty)

The build is produced with `deployment.basePath: /portal` (in `evidence/evidence.config.yaml`),
so every link/asset/data URL is already prefixed with `/portal`. OpenResty just serves the
`current/` directory at that path. Add to the relevant `server { }` block:

```nginx
# Redirect the bare path to the trailing-slash form.
location = /portal { return 301 /portal/; }

location /portal/ {
    alias /opt/poc-dhis2-public-portal/current/;     # the deploy symlink
    try_files $uri $uri/ /portal/200.html;           # SPA fallback (LGA pages need it)
    gzip_static on;                                   # serve the precompressed .gz copies
    expires 2h;                                       # see caching note below
}
```

Reload: `nginx -t && systemctl reload openresty`.

**Caching (dead-simple).** `expires 2h` caches everything for two hours, then revalidates
cheaply against the existing `etag`/`last-modified` (a tiny `304` when unchanged). Data is
regenerated nightly and code ships ad-hoc during the day, so a couple of hours is a safe
balance. *(Optional optimisation: the `_app/immutable/` assets are content-hashed, so they can
be cached forever — add a `location ^~ /portal/_app/immutable/ { alias …/current/_app/immutable/; gzip_static on; add_header Cache-Control "public, max-age=31536000, immutable"; }` ahead of the `/portal/` block. Skips re-downloading the ~6 MB DuckDB-WASM engine on repeat visits. Not required.)*

> **Do NOT add a `types { … }` block** to add a WASM/JSON MIME type. In nginx a `types` block
> *replaces* the inherited `mime.types` for that context, so `.html` loses `text/html` and the
> browser **downloads** `index.html` instead of rendering it. The bundled `mime.types` already
> maps `wasm` and `webmanifest`; `.parquet`/`.arrow` are fine as `application/octet-stream`.

---

## 3. Building & deploying code changes (manual)

Code changes are deployed by hand (the daily job below is **data-only** and never `git pull`s):

```bash
cd /opt/poc-dhis2-public-portal
git pull
npm run build      # ROOT build — see warning
npm run deploy     # copies evidence/build → builds/<ts>, flips `current`
```

> **Always use the root `npm run build`** — it runs `patch && pages:asc && evidence build`.
> `npm --prefix evidence run build` runs *only* `evidence build`, skipping the layout patch
> (crest/header, the SPA-fallback fix) and the page regeneration (the `/portal` prefix). That
> is the cause of the "`/coat_of_arms.png` does not begin with base" build error.

`deploy.sh` is atomic: a failed build leaves the old `current` serving, and it keeps the newest
`KEEP_BUILDS` (default 3) builds under `builds/`, pruning older ones.

---

## 4. Daily data regeneration

Once a day the portal re-extracts data from DHIS2 and republishes. The pipeline lives in
[`scripts/regenerate.sh`](../scripts/regenerate.sh): `extract:asc → sources → build → deploy`,
guarded by `flock` (no overlapping runs) and `set -e` (a failed extract aborts **before**
deploy, so the last good build keeps serving).

### 4.1 Secret (the DHIS2 token)

The extract authenticates with a DHIS2 **personal access token**. Store it in a root-owned env
file *outside* the repo:

```bash
sudo install -m 600 /dev/null /etc/dnemis-portal.env
sudo tee /etc/dnemis-portal.env >/dev/null <<'EOF'
D2_TOKEN=d2pat_replace_me
# D2_BASE_URL=https://trainingdb.dhis2nigeria.org.ng   # optional: overrides baseUrl in asc.yaml
EOF
sudo chmod 600 /etc/dnemis-portal.env      # root-only; the file is never committed
```

(The script also accepts `DHIS2_USERNAME`/`DHIS2_PASSWORD` instead of `D2_TOKEN`; the token is
preferred. Override the env-file path with `DNEMIS_ENV_FILE` if needed.)

### 4.2 Schedule (cron, 23:59)

```bash
sudo crontab -e
# add:
59 23 * * * /opt/poc-dhis2-public-portal/scripts/regenerate.sh >> /var/log/dnemis-regen.log 2>&1
```

Check it ran: `tail -f /var/log/dnemis-regen.log`. Run it on demand any time with the same
command (it logs each step with a UTC timestamp).

> **Timezone:** cron uses the server's local time. Confirm with `date` / `timedatectl`; adjust
> the `59 23` if you want 23:59 Nigeria time and the box is on UTC.

---

## 5. Changing the sub-path

The base path has a single source of truth: `deployment.basePath` in
`evidence/evidence.config.yaml`. `scripts/asc-pages/generate.mjs` reads it and bakes it into the
generated page links/geojson/search URLs. To serve elsewhere: edit `basePath` (e.g. remove it to
serve at a host root), update the OpenResty `location`/`alias`, then `npm run build && npm run deploy`.

---

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `npm install` → `SyntaxError: Unexpected token '?'` | Node too old (<18). Install Node 20 LTS (NodeSource); remove conflicting distro `libnode-dev`. |
| Build fails: `… /coat_of_arms.png does not begin with base` | You ran `npm --prefix evidence run build`, which skips the `patch` step. Use the **root** `npm run build`. |
| Browser **downloads** `index.html` instead of rendering | A `types { }` block in the nginx config clobbered `mime.types`. Remove it (see §2). |
| Code/data change not visible | You built but didn't publish. Run `npm run deploy` (it flips the `current` symlink); hard-refresh. |
| LGA page: console "Error in client-side routing / Unexpected token '<'" | Stale build serving — `npm run deploy`, then hard-refresh. The `getPrerenderedQueries` SPA-fallback patch (in `patch-evidence.mjs`) handles the non-prerendered LGA route; it only applies via the root `npm run build`. |
| Daily regen didn't run | `tail /var/log/dnemis-regen.log`; check the token in `/etc/dnemis-portal.env` and the cron timezone (§4.2). A failed extract logs the error and leaves the previous build serving. |
| LGA pages 404 / maps blank | The `try_files … /portal/200.html` SPA fallback is missing, or `extensions.duckdb.org` is unreachable from clients. |
