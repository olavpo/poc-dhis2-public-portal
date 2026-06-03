/**
 * Pre-compress text assets to .gz and .br next to the originals (à la nginx
 * gzip_static / brotli_static). serve.mjs serves the precompressed variant when
 * the client accepts it — so the big, immutable JS/CSS is compressed once at deploy,
 * not per request. Parquet/wasm are already compressed and are skipped.
 *
 *   node scripts/precompress.mjs <dir>
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';

const dir = process.argv[2];
if (!dir) { console.error('usage: precompress.mjs <dir>'); process.exit(1); }

// .wasm included: the DuckDB engine wasm is ~33 MB and ships uncompressed otherwise
// (the single largest asset). It compresses ~4x and the browser decompresses it
// transparently for WebAssembly.instantiateStreaming.
const EXT = new Set(['.js', '.mjs', '.css', '.html', '.json', '.svg', '.map', '.wasm']);
const MIN = 1024; // don't bother with tiny files
let n = 0, raw = 0, gz = 0, br = 0;

function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!EXT.has(extname(e.name))) continue;
    const buf = readFileSync(p);
    if (buf.length < MIN) continue;
    // brotli q11 is slow on big files; scale quality down past a few MB.
    const q = buf.length > 4 * 1024 * 1024 ? 9 : 11;
    const g = gzipSync(buf, { level: 9 });
    const b = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: q } });
    writeFileSync(p + '.gz', g);
    writeFileSync(p + '.br', b);
    n++; raw += buf.length; gz += g.length; br += b.length;
  }
}
walk(dir);
const mb = (x) => (x / 1048576).toFixed(2) + 'MB';
console.log(`Precompressed ${n} files: raw ${mb(raw)} → gzip ${mb(gz)} / brotli ${mb(br)}`);
