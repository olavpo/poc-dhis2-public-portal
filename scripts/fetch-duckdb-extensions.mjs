/**
 * Mirror the DuckDB-WASM autoloaded extensions into the static build so they are served
 * from OUR origin (cacheable by Cloudflare/OpenResty) instead of the third-party
 * extensions.duckdb.org at runtime.
 *
 * Why: LGA pages call read_parquet() in the browser, which makes DuckDB-WASM lazily autoload
 * `parquet.duckdb_extension.wasm` from its compiled-in repository (extensions.duckdb.org).
 * That host isn't ours, so Cloudflare returns cf-cache-status: DYNAMIC (no edge cache) and it
 * stays a third-party runtime dependency. Here we download the extension(s) for the EXACT
 * DuckDB version our engine reports and drop them under evidence/static/duckdb-extensions/,
 * matching the path layout the engine appends: `<repo>/<version>/wasm_eh/<name>.duckdb_extension.wasm`.
 * browser.js is then patched (in patch-evidence.mjs) to SET custom_extension_repository at our
 * origin, gated on VITE_DUCKDB_EXT_REPO — so the redirect only activates when these files exist.
 *
 * Version is read from the engine (SELECT version()) — NOT hardcoded — so it auto-tracks
 * @duckdb/duckdb-wasm upgrades. Idempotent: existing files are skipped unless --force.
 *
 * Reversible: delete this file + its static output + the build wiring; the engine falls back
 * to extensions.duckdb.org as before.
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
// @duckdb/duckdb-wasm lives in evidence/node_modules (the Evidence app), not the repo root —
// resolve it from there.
const evidenceRequire = createRequire(resolve(here, '../evidence/package.json'));
const nbPath = evidenceRequire.resolve('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs');
const DIST = dirname(nbPath); // the package's dist/ dir (holds the .wasm + worker bundles)
const nbUrl = pathToFileURL(nbPath).href;
const nb = await import(nbUrl);
const { createDuckDB, NODE_RUNTIME, VoidLogger } = nb.createDuckDB ? nb : nb.default;
const OUT_ROOT = resolve(here, '../evidence/static/duckdb-extensions');

// Extensions the browser engine autoloads for this portal. read_parquet() pulls `parquet`.
// Add more here (e.g. 'httpfs') if a network trace shows the engine requesting them.
const EXTENSIONS = (process.env.DUCKDB_EXT_LIST || 'parquet').split(',').map((s) => s.trim()).filter(Boolean);
const PLATFORM = 'wasm_eh'; // the eh (exception-handling) build is what we ship (duckdb-eh.wasm)
const REPO = process.env.DUCKDB_EXT_SOURCE || 'https://extensions.duckdb.org';
const FORCE = process.argv.includes('--force');

async function duckdbVersion() {
  const BUNDLES = {
    eh: {
      mainModule: resolve(DIST, './duckdb-eh.wasm'),
      mainWorker: resolve(DIST, './duckdb-node-eh.worker.cjs'),
    },
    mvp: {
      mainModule: resolve(DIST, './duckdb-mvp.wasm'),
      mainWorker: resolve(DIST, './duckdb-node-mvp.worker.cjs'),
    },
  };
  const db = await createDuckDB(BUNDLES, new VoidLogger(), NODE_RUNTIME);
  await db.instantiate();
  db.open({});
  const conn = db.connect();
  const v = conn.query('select version() as v').getChildAt(0).get(0); // e.g. 'v1.4.3'
  conn.close();
  await db.terminate?.();
  if (!/^v\d+\.\d+\.\d+/.test(v)) throw new Error(`Unexpected version() result: ${JSON.stringify(v)}`);
  return v;
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`GET ${url} → suspiciously small (${buf.length} bytes)`);
  writeFileSync(dest, buf);
  return buf.length;
}

const version = await duckdbVersion();
console.log(`[duckdb-ext] engine version ${version}; mirroring [${EXTENSIONS.join(', ')}] (${PLATFORM})`);
const outDir = resolve(OUT_ROOT, version, PLATFORM);
mkdirSync(outDir, { recursive: true });

for (const name of EXTENSIONS) {
  const file = `${name}.duckdb_extension.wasm`;
  const dest = resolve(outDir, file);
  if (existsSync(dest) && !FORCE) {
    console.log(`  [skip] ${version}/${PLATFORM}/${file} (${statSync(dest).size} bytes)`);
    continue;
  }
  const url = `${REPO}/${version}/${PLATFORM}/${file}`;
  const bytes = await download(url, dest);
  console.log(`  [ok]   ${version}/${PLATFORM}/${file} (${bytes} bytes) ← ${url}`);
}
console.log(`[duckdb-ext] done → evidence/static/duckdb-extensions/${version}/${PLATFORM}/`);
