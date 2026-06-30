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

# Content-hashed assets: filename changes on every code change → cache forever, safely.
location ^~ /portal/_app/immutable/ {
    alias /opt/poc-dhis2-public-portal/current/_app/immutable/;
    gzip_static on;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

# Self-hosted DuckDB-WASM extensions: version-pinned path → immutable, cache forever.
# NO SPA fallback — a missing extension must 404, never return the HTML shell (§2.1).
location ^~ /portal/duckdb-extensions/ {
    alias /opt/poc-dhis2-public-portal/current/duckdb-extensions/;
    types { application/wasm wasm; }   # safe here (wasm-only location); or map wasm in mime.types globally
    gzip_static on;                    # serves the precompressed .gz (precompress.mjs writes it)
    add_header Cache-Control "public, max-age=31536000, immutable";
}

# HTML + data (asc.geojson, data/+api/ Arrow/Parquet): stable URLs that change on redeploy →
# store but ALWAYS revalidate. Cheap 304s, and a deploy is visible on the next request even if
# a cache purge misfires (see the caching note below).
location ^~ /portal/ {
    alias /opt/poc-dhis2-public-portal/current/;     # the deploy symlink
    try_files $uri $uri/ /portal/200.html;           # SPA fallback (LGA pages need it)
    gzip_static on;                                   # serve the precompressed .gz copies
    add_header Cache-Control "public, no-cache";      # revalidate (see note); replaces `expires 2h`
}
```

Reload: `nginx -t && systemctl reload openresty`.

**Caching (two tiers, purge-independent).** Content-hashed assets under `_app/immutable/`
get a 1-year `immutable` lifetime — their filename changes when their content does, so they're
safe to cache forever (this is what skips re-downloading the ~6 MB DuckDB-WASM engine on repeat
visits). **Everything else — HTML, the prerendered `data/`+`api/` Arrow/Parquet, `asc.geojson` —
is served `no-cache`.** `no-cache` does *not* mean "don't cache": the edge and the browser still
**store** the response, but they **revalidate** it against the origin on every request (a tiny
conditional `GET` → `304 Not Modified` when unchanged, so almost no bytes move). The payoff is
that a deploy is visible on the **next request**, with no dependence on a cache purge firing
against the right zone.

> We learned this the hard way: a purge aimed at the **wrong Cloudflare zone** returns
> `success:true` but evicts nothing, so the edge served a stale page for the full 2h TTL
> (see §6). Under `no-cache` that failure mode can't strand a multi-hour stale copy — the
> worst case is one extra revalidation. Purge-on-deploy (§2.2) still helps by pre-warming the
> edge with the new build, but **correctness no longer depends on it.**

> **Don't add a `types { … }` block to an HTML-serving location** (the main `/portal/` block).
> In nginx a `types` block *replaces* the inherited `mime.types` for that context, so `.html`
> loses `text/html` and the browser **downloads** `index.html` instead of rendering it. The
> bundled `mime.types` already maps `wasm` and `webmanifest`; `.parquet`/`.arrow` are fine as
> `application/octet-stream`. (A `types { … }` inside the wasm-only `duckdb-extensions/`
> location is harmless — nothing HTML is served there.)

### 2.1 Self-hosted DuckDB extension

LGA pages load the DuckDB-WASM **parquet extension** from this origin (not the third-party
`extensions.duckdb.org`) — the build mirrors it to `current/duckdb-extensions/<ver>/wasm_eh/`
and `patch-evidence.mjs` points the engine there. The `duckdb-extensions/` `location` block in
§2 serves it like the immutable assets (version-pinned path → cache forever) but **without** the
SPA fallback, so a missing file `404`s instead of returning the HTML shell (which DuckDB can't
parse as WASM). `mime.types` already maps `.wasm` → `application/wasm`; the inline
`types { application/wasm wasm; }` in that block is just a belt-and-suspenders fallback, safe
there because the location serves only `.wasm` (the rule against `types { … }` in §2 applies to
HTML-serving locations).

### 2.2 Edge caching with Cloudflare (optional — for geographic reach)

To serve users far from the origin (e.g. Nigeria → a Europe box) from the nearest Cloudflare
PoP instead of round-tripping, two things are needed beyond proxied (orange-cloud) DNS:

1. **A Cache Rule** — Cloudflare does **not** cache HTML (or `.parquet`) by default, only
   static assets. Dashboard → **Caching → Cache Rules → Create rule**:
   - **When incoming requests match**: `URI Full` · `wildcard` · `https://<host>/portal/*`
   - **Then**: *Eligible for cache*; **Edge TTL** → "Use cache-control header if present"
     (respects the origin: 1y on `_app/immutable` + `duckdb-extensions`; HTML/parquet are
     `no-cache`, so the edge revalidates them against the origin each request — see §2's note).
   - Leave **Browser Cache TTL** on *Respect Existing Headers* (Caching → Configuration) so CF
     doesn't override the origin's `no-cache`/`immutable` with a blanket TTL of its own.

   This flips HTML, parquet (incl. range requests), and the extension to `cf-cache-status: HIT`.
2. **Purge on deploy** — HTML/parquet have a short edge TTL, so after a redeploy a stale page
   shell can reference `_app/immutable` chunk hashes the new build deleted. `deploy.sh` purges
   the whole zone after flipping `current`, **if** `CF_ZONE_ID` + `CF_PURGE_TOKEN` are set in the
   env file (§4.1); otherwise it skips. Verify with
   `curl -sI https://<host>/portal/ | grep -i cf-cache-status` → `HIT` on the second hit.

### 2.3 Customer domain via Cloudflare for SaaS (custom hostname) — the TXT you must not forget

The portal answers on two hostnames off **one Cloudflare zone we control, `d2portal.net`**:

- **`emis-ng.d2portal.net`** — an ordinary proxied (orange-cloud) record in that zone.
- **`emis.education.gov.ng`** — the **customer's** public hostname, served through the same
  zone as a **Cloudflare for SaaS _custom hostname_**: an external domain we do **not** own,
  attached to our zone. (This is why a single `purge_everything` clears both — same edge.)

**We don't control `education.gov.ng`.** Its DNS is delegated to a third party
(**galaxybackbone.com**), so every record there must be *requested* from them, lands slowly,
and contains only exactly what you spelled out.

A custom hostname needs **two** records on the customer side, and **both must be requested
together, upfront**:

| Record | Purpose | Name → value |
|---|---|---|
| **CNAME** | Routes the hostname's traffic to Cloudflare | `emis.education.gov.ng` → *(the SaaS fallback-origin / CNAME target Cloudflare shows)* |
| **TXT (DCV)** | Lets Cloudflare **issue the TLS certificate** (Domain Control Validation / hostname pre-validation) | `_cf-custom-hostname.emis.education.gov.ng` → *(token from the dashboard)* |

Read the exact target and TXT token from the dashboard: **`d2portal.net` zone → SSL/TLS →
Custom Hostnames → `emis.education.gov.ng`** shows the CNAME target, the validation TXT
record(s), and the live status.

> **What bit us (2026-06).** The **CNAME was added without the TXT.** The instant it
> propagated, `emis.education.gov.ng` resolved to Cloudflare — but with **no validated
> certificate**, so every HTTPS request failed and the hostname was effectively **dead** until
> the TXT was added and the cert issued. Recovering meant chasing the third party to add the
> TXT mid-incident. The TXT requirement was missed at design time; it should have been part of
> the DNS request from day one.

**Rules so it never recurs:**

- **Use TXT-based (DCV) pre-validation, not HTTP validation.** HTTP validation can only
  succeed *after* traffic already points at Cloudflare — the same chicken-and-egg that caused
  the outage. TXT validation lets the certificate issue **before** the CNAME flips.
- **Order: TXT first → confirm the custom hostname is `Active` (cert issued) → *then* add the
  CNAME.** Never flip the CNAME while the hostname is still `Pending`.
- **Hand the DNS operator everything at once** — exact name/type/value for *both* records —
  and flag the **TXT as mandatory, not optional**. Assume any record you didn't explicitly
  request does not exist.

**Verify:** custom-hostname status `Active`; `dig +short emis.education.gov.ng` shows the
CNAME and `dig +short TXT _cf-custom-hostname.emis.education.gov.ng` returns the token; and
`curl -sI https://emis.education.gov.ng/portal/` returns `200` over a valid certificate (no
TLS error).

### 2.4 Splitting build and serve across two boxes

§2–§2.3 assume one box builds *and* serves. But the prerender hands Node a **16 GB heap**
([`scripts/release.sh`](../scripts/release.sh)), which a small serving Linode can't supply, so you
can split the roles:

- **Build host** (lots of RAM): the git checkout, Node, `extract → sources → build → deploy`.
  `deploy.sh` copies `evidence/build → builds/<ts>`, **precompresses** it, and flips the *local*
  `current`.
- **Serving box** (small Linode): nginx + static files only. No Node, no DHIS2 access.

[`scripts/push-remote.sh`](../scripts/push-remote.sh) (`npm run push`) bridges them: it rsyncs the
already-precompressed `builds/<ts>` to the serving box under `releases/<ts>/`, flips the **remote**
`current` symlink atomically, prunes old releases, and (if `CF_ZONE_ID`/`CF_PURGE_TOKEN` are set)
**purges Cloudflare after the remote flip**. That post-flip purge matters: `deploy.sh` already
purged after its *local* flip, but in split-box mode that fired before this push made the build
live on the origin the edge pulls from — so push-remote's purge is the one that counts (last purge
wins). It ships `builds/<ts>` (not `evidence/build`) so the `.gz`/`.br` siblings **and the
self-hosted `duckdb-extensions/`** (§2.1) travel with it.

**Serving box layout** — apps under `/opt`, release history kept out of the served tree:

```
/opt/ascportal/
├── releases/<ts>/   ← each rsync'd build (precompressed); newest PORTAL_KEEP kept
└── current → releases/<ts>   ← atomic flip target; nginx serves this
```

The nginx config is exactly §2/§2.1/§2.2, but every `alias` points at the serving box's own
`/opt/ascportal/current/` (it has no repo). No web-server reload and **no sudo** for the deploy
user — a content update is a symlink flip nginx resolves per request (just like `deploy.sh`, which
never reloads). *Only* if the box has `open_file_cache` on (off by default) would a flip serve
stale fds for ~60s before self-healing; set `PORTAL_RELOAD='sudo systemctl reload nginx'` (+ that
one NOPASSWD sudo) to make the cutover instant. Most boxes don't need it.

**Configure from the build host.** Use a key-based ssh alias in the build user's `~/.ssh/config`
(a dedicated, passphrase-less deploy key — cron can't unlock a passphrase; the **private** key
stays on the build host, only its `.pub` goes in the serving box's `~/.ssh/authorized_keys`):

```sshconfig
Host ascportal                 # ← becomes PORTAL_HOST
    HostName 203.0.113.10
    User deploy
    IdentityFile ~/.ssh/ascportal_deploy
    IdentitiesOnly yes
```

Then add to the build host's env file (alongside `D2_TOKEN`, §4.1):

```bash
PORTAL_HOST=ascportal
PORTAL_BASE=/opt/ascportal              # default; releases/<ts>/ + current live here
# PORTAL_KEEP=3                          # remote releases to retain (default 3)
# PORTAL_RELOAD='sudo systemctl reload nginx'   # only if open_file_cache is on; default is a no-op
```

Publish a code change: `git pull && npm run build && npm run deploy && npm run push` (load the env
file first so `PORTAL_HOST` is set). The nightly job does it automatically — `regenerate.sh` runs
`push` as its 5th step when `PORTAL_HOST` is set (§4). **Rollback** is instant:

```bash
ssh ascportal "ln -sfn /opt/ascportal/releases/<older-ts> /opt/ascportal/current"
```

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
[`scripts/regenerate.sh`](../scripts/regenerate.sh): `extract:asc → sources → build → deploy`
(→ `push` to the serving box when `PORTAL_HOST` is set, §2.4), guarded by `flock` (no overlapping
runs) and `set -e` (a failed extract aborts **before** deploy, so the last good build keeps serving).

### 4.1 Secret (the DHIS2 token)

The extract authenticates with a DHIS2 **personal access token**. Store it in a root-owned env
file *outside* the repo:

```bash
sudo install -m 600 /dev/null /etc/dnemis-portal.env
sudo tee /etc/dnemis-portal.env >/dev/null <<'EOF'
D2_TOKEN=d2pat_replace_me
# D2_BASE_URL=https://trainingdb.dhis2nigeria.org.ng   # optional: overrides baseUrl in asc.yaml
# CF_ZONE_ID=...            # optional: Cloudflare zone (Overview → API) — enables cache purge on deploy
# CF_PURGE_TOKEN=...        # optional: API token with the Zone "Cache Purge" permission (see §2.2)
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
| Deploy succeeded but the live page still shows the **old** "Generated …" footer (even in incognito) | The Cloudflare **edge** is serving a stale copy the purge never evicted — almost always a **wrong `CF_ZONE_ID`/token**: the purge `success:true`s against a zone that doesn't front these hosts. Diagnose it below; fix the zone ID in `/etc/dnemis-portal.env`. The `no-cache` HTML policy (§2) prevents this from persisting past one request. |

**Diagnosing a stale edge** (incognito rules out *browser* cache, not the shared edge). Localise
the stale copy before changing anything:

```bash
# 1. Is the edge serving a pre-purge object? A HIT whose `age` (seconds) is OLDER than your
#    last purge means the purge never evicted it.
curl -sI https://<host>/portal/ | grep -iE 'cf-cache-status|age:'

# 2. Read THROUGH the edge to the origin: `?cb=` changes the cache key → forces a MISS.
#    If this shows the new build while the plain URL shows the old one, the origin + deploy
#    are fine and the edge/purge is the only problem.
curl -s "https://<host>/portal/?cb=$RANDOM" | grep -oiE 'Generated[^<]*UTC'

# 3. Confirm the configured zone actually fronts this host (read-only; no purge):
set -a; . /etc/dnemis-portal.env; set +a
curl -s -H "Authorization: Bearer $CF_PURGE_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID" | jq '.success, .result.name'
#  → if .result.name isn't the domain you serve, that's the bug. Find the right id with:
#    curl -s -H "Authorization: Bearer $CF_PURGE_TOKEN" \
#      "https://api.cloudflare.com/client/v4/zones?name=<your-domain>" | jq -r '.result[].id'
```

After fixing the zone ID, a manual `purge_everything` (§2.2's API call) clears the stuck object
immediately; verify with step 1 — `cf-cache-status` should flip to `MISS` and the footer update.
