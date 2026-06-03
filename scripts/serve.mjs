/**
 * Minimal static file server for the deployed portal (the `current` symlink).
 * Stands in for nginx. Two things matter for this site:
 *   - HTTP Range support — DuckDB-WASM fetches Parquet with ranged requests.
 *   - SPA fallback — the Evidence build is a client-rendered SPA, so unknown
 *     routes (e.g. /states/NG-LA) must serve the fallback page, not 404.
 */
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'current');
const PORT = Number(process.env.SANDBOX_HOST_PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.parquet': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const FALLBACK = ['200.html', 'index.html'].map((f) => join(ROOT, f)).find((p) => existsSync(p));

async function resolveFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  // adapter-static serves the contents of `static/` at the web root, so the
  // manifest's `static/data/...` URLs live at `/data/...`. Alias them.
  if (rel.includes('/static/data/')) rel = rel.replace('/static/data/', '/data/');
  else if (rel.startsWith('static/data/')) rel = rel.replace('static/data/', 'data/');
  let p = normalize(join(ROOT, rel));
  if (!p.startsWith(ROOT)) return null; // path traversal guard
  try {
    const s = await stat(p);
    if (s.isDirectory()) p = join(p, 'index.html');
  } catch {
    // not found
  }
  if (existsSync(p)) return p;
  // SPA fallback for extensionless / route paths
  if (!extname(rel) && FALLBACK) return FALLBACK;
  return null;
}

const server = createServer(async (req, res) => {
  const file = await resolveFile(req.url || '/');
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }
  const type = TYPES[extname(file)] || 'application/octet-stream';
  const s = await stat(file);

  // Caching: fingerprinted assets are immutable; Parquet data gets a modest TTL
  // (daily refresh); HTML/manifest must always revalidate.
  const reqPath = (req.url || '').split('?')[0];
  const cache = reqPath.includes('/_app/immutable/')
    ? 'public, max-age=31536000, immutable'
    : reqPath.endsWith('.parquet')
      ? 'public, max-age=3600'
      : 'no-cache';

  // HEAD: headers only (DuckDB-WASM probes file size before doing ranged reads).
  // Sending a body here would force a full download instead of range requests.
  if (req.method === 'HEAD') {
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': s.size, 'cache-control': cache });
    res.end();
    return;
  }

  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : s.size - 1;
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end) || end >= s.size) end = s.size - 1;
    res.writeHead(206, {
      'content-type': type,
      'accept-ranges': 'bytes',
      'content-range': `bytes ${start}-${end}/${s.size}`,
      'content-length': end - start + 1,
      'cache-control': cache,
    });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }

  // Serve precompressed variants (brotli > gzip) when present and accepted — as
  // nginx brotli_static/gzip_static would. Falls back to on-the-fly gzip, else raw.
  // Parquet/wasm are already compressed and use range requests, so served as-is.
  const ext = extname(file);
  // .wasm is compressible too (the ~33 MB DuckDB engine); the browser decompresses
  // it transparently for instantiateStreaming. Served from precompressed .br/.gz.
  const gzippable = ['.js', '.mjs', '.css', '.html', '.json', '.svg', '.map', '.wasm'].includes(ext);
  const ae = req.headers['accept-encoding'] || '';
  if (gzippable && /\bbr\b/.test(ae) && existsSync(file + '.br')) {
    const b = await stat(file + '.br');
    res.writeHead(200, { 'content-type': type, 'content-encoding': 'br', vary: 'Accept-Encoding', 'content-length': b.size, 'cache-control': cache });
    createReadStream(file + '.br').pipe(res);
  } else if (gzippable && /\bgzip\b/.test(ae) && existsSync(file + '.gz')) {
    const g = await stat(file + '.gz');
    res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip', vary: 'Accept-Encoding', 'content-length': g.size, 'cache-control': cache });
    createReadStream(file + '.gz').pipe(res);
  } else if (gzippable && /\bgzip\b/.test(ae)) {
    res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip', vary: 'Accept-Encoding', 'cache-control': cache });
    createReadStream(file).pipe(createGzip()).pipe(res);
  } else {
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': s.size, 'cache-control': cache });
    createReadStream(file).pipe(res);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Serving ${ROOT} on http://localhost:${PORT}`);
});
