# DNEMIS ASC Public Portal — Server Administrator Guide

How to host the Annual School Census public portal. **You are serving a folder of static
files.** There is no application server, no database, and no connection to DHIS2 at runtime.
Any static web server (nginx, Apache, Caddy, a CDN/object store) can host it.

---

## 1. What you receive

A single directory of prerendered static files (delivered as `asc-portal-site.tar.gz`, or as
the `evidence/build/` output of a build). Its top level looks like:

```
index.html            ← Federal overview (site root)
asc/                  ← one folder per State and per LGA (drill-down pages)
_app/                 ← JavaScript, CSS, and the (lazily-loaded) DuckDB-WASM engine
data/  api/           ← the page data, prerendered as Arrow/Parquet (~1.5 MB total)
asc.geojson           ← map boundaries
200.html              ← SPA fallback page
*.br  *.gz            ← precompressed copies of every asset (serve these)
favicon.ico, icons…
```

Extract it to your web root, e.g. `/var/www/asc-portal`.

---

## 2. Requirements (all standard)

| Need | Why |
|---|---|
| Serve **precompressed `.gz`** (and `.br` if available) | Assets ship pre-Gzip'd **and** pre-Brotli'd. `gzip_static on;` alone is enough (e.g. the 33 MB DuckDB engine → 7.3 MB gzip / 5.6 MB brotli). Don't re-compress on the fly. |
| **SPA fallback to `/200.html`** (required) | Federal + State pages are pre-baked HTML, but **LGA pages (`/asc/lga/<id>`) are client-rendered on demand** — the server must serve `200.html` for those (and any deep link), or LGAs 404. `try_files … /200.html;` (see §3). |
| Correct **`application/wasm`** MIME for `.wasm` | The engine binary must load with the right type. LGA pages load the DuckDB-WASM engine (~6 MB, cached) and query the bundled Parquet in-browser; Federal/State don't. |
| **HTTP range requests** | Standard; on by default in nginx/Apache. Needed for the LGA Parquet reads. |
| Clients can reach **`extensions.duckdb.org`** | One-time, cached. DuckDB-WASM autoloads its Parquet/httpfs extensions there when an LGA page first runs a query. (Federal/State are baked, so they don't need it.) |
| Served at the **domain root** (`https://host/`) | Internal links and `/asc.geojson` are root-absolute. Hosting under a sub-path (`/portal/`) requires a rebuild with a configured base path — ask the dev team. |

No special runtime, no open ports beyond your web server, no outbound calls from the server.

---

## 3. nginx (recommended)

```nginx
server {
    listen 443 ssl http2;
    server_name asc.example.gov.ng;          # your hostname
    root /var/www/asc-portal;                 # where you extracted the tarball
    index index.html;

    # ssl_certificate ... ; ssl_certificate_key ... ;   # your TLS certs

    # Serve the precompressed copies that ship with the build.
    # The build ships BOTH .gz and .br for every asset, so gzip alone is fully sufficient:
    gzip_static on;          # serves the .gz copies (no on-the-fly compression needed)
    # brotli_static on;      # optional — only if your nginx has the ngx_brotli module

    # Correct MIME for the WASM engine
    types { application/wasm wasm; }
    default_type application/octet-stream;     # fine for .parquet/.arrow data files

    # Long-cache the fingerprinted assets (filenames change when content changes)
    location /_app/immutable/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Pages + SPA fallback
    location / {
        try_files $uri $uri/ $uri.html /200.html;
    }
}
```

> If your nginx wasn't built with the Brotli module, drop the `brotli_static on;` line —
> `gzip_static on;` alone is enough. Don't remove the `.br`/`.gz` files either way.

Reload: `nginx -t && systemctl reload nginx`.

### Apache equivalent (key bits)

```apache
# .htaccess in the web root (mod_headers, mod_mime, mod_rewrite)
AddType application/wasm .wasm
# Serve precompressed assets
RewriteEngine On
RewriteCond %{HTTP:Accept-Encoding} br
RewriteCond %{REQUEST_FILENAME}.br -f
RewriteRule ^(.*)$ $1.br [L]
RewriteRule \.js\.br$ - [T=application/javascript,E=no-gzip:1]
RewriteRule \.wasm\.br$ - [T=application/wasm,E=no-gzip:1]
Header set Content-Encoding br env=no-gzip
# SPA fallback
FallbackResource /200.html
```

---

## 4. Verify after deploying

```bash
curl -I https://asc.example.gov.ng/                       # 200, text/html
curl -I https://asc.example.gov.ng/asc.geojson            # 200
curl -s -H 'Accept-Encoding: gzip' -I "https://asc.example.gov.ng/_app/immutable/assets/<engine>.wasm" | grep -i content-encoding   # gzip
```

Then open the site: the green DNEMIS bar with module links, KPI cards, a State map, and a
State→LGA drill-down (the searchable State/LGA pickers, top right) should all work. Public
pages download **no** DuckDB engine — only a few hundred KB per page.

---

## 5. What it does NOT need

- **No database, no DHIS2 access, no Node.js, no open ports** beyond your web server, and
  **no outbound calls from the server itself**. It's files.
- **Federal + State pages need nothing external** — they are fully pre-computed and never
  start the in-browser query engine.
- The **only** external dependency at runtime is `extensions.duckdb.org`, and only for
  **LGA pages** (which query in-browser) — see §2. It loads once in the *visitor's* browser,
  is cached, and is never contacted by your server. If your audience can't reach it, LGA
  drill-downs won't load (Federal/State still work); ask the dev team for an LGA build that
  pre-bundles the extensions.

## 6. Two optional CDNs (cosmetic, loaded by the visitor's browser)

The page references Google Fonts (the *Inter* typeface) and Font Awesome (the nav-bar
icons) from public CDNs. They load in the **visitor's** browser, not from your server. If
your users may be offline or behind a strict firewall, self-host those two files; otherwise
nothing to do — the portal works without them (it just falls back to system fonts / hides
icon glyphs).

## 7. Updating the data later

Data refreshes are a **rebuild**, done by the dev team, not on the server: they regenerate
the static site and hand you a new directory. Deploy is then just "swap the folder":

```bash
tar xzf asc-portal-site-NEW.tar.gz -C /var/www/asc-portal-new
ln -sfn /var/www/asc-portal-new /var/www/asc-portal     # atomic switch if root is a symlink
```

Keep the previous folder to roll back instantly if needed.

---

**Summary:** extract the tarball to your web root, point a static web server at it with
gzip/brotli-static + a `200.html` fallback + `application/wasm` MIME, serve over HTTPS. Done.
