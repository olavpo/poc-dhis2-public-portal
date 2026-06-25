#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { expandPeriods, parsePeriod } from './lib/periods.mjs';
import { makeClient, chunkPeriods } from './lib/dhis2.mjs';
import { analyticsToFactRows, analyticsToDisaggRows, dxRowsFromMeta } from './lib/facts.mjs';
import { buildOuRows, geoFeaturesToGeoJSON } from './lib/orgunits.mjs';
import { toCsv } from './lib/csv.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const cfg = loadConfig(arg('config'));
  const outDir = arg('out', 'data/out');
  // Auth from env: a personal access token (preferred) OR basic username/password.
  const { D2_TOKEN: token, DHIS2_USERNAME: username, DHIS2_PASSWORD: password } = process.env;
  if (!token && !(username && password)) {
    throw new Error('Set D2_TOKEN (a DHIS2 personal access token) or DHIS2_USERNAME + DHIS2_PASSWORD in env');
  }
  const baseUrl = process.env.D2_BASE_URL || cfg.baseUrl; // env override (e.g. test vs prod)
  const client = makeClient({ baseUrl, token, username, password });
  mkdirSync(outDir, { recursive: true });

  // --- org units (hierarchy) first ---
  // Hierarchy from /api/organisationUnits (complete — includes geometry-less units like the
  // national root). Fetched up front so analytics requests can be chunked by explicit org-unit
  // id (OU_CHUNK at a time) instead of asking for a whole level at once — far gentler on a large
  // / busy instance, where one `ou:LEVEL-3` covering hundreds of LGAs times out (502/504).
  const orgUnits = await client.organisationUnits(cfg.ouLevels);
  const ouIdsByLevel = {};
  for (const o of orgUnits) (ouIdsByLevel[o.level] ??= []).push(o.id);
  console.log(`org units: ${orgUnits.length} (${cfg.ouLevels.map((l) => `L${l}:${(ouIdsByLevel[l] || []).length}`).join(' ')})`);

  // --- primary fact ---
  const periods = expandPeriods(cfg.periods);
  const factResponses = [];
  for (const chunk of chunkPeriods(periods)) factResponses.push(...await client.analyticsChunked(cfg.dx, cfg.ouLevels, chunk, undefined, { ouIdsByLevel }));
  const factRows = factResponses.flatMap(analyticsToFactRows);
  writeFileSync(join(outDir, 'fact.csv'), toCsv(factRows, ['dx', 'ou', 'pe', 'periodType', 'value']));
  console.log(`fact.csv: ${factRows.length} rows`);

  // --- disaggregation cuts ---
  for (const d of cfg.disaggregations) {
    const dims = d.dims ?? (d.dim ? [d.dim] : []); // one group set, or several (cross-cut)
    const resps = [];
    for (const chunk of chunkPeriods(periods)) resps.push(...await client.analyticsChunked(d.dx, d.ouLevels, chunk, dims, { ouIdsByLevel, label: d.slug }));
    const rows = resps.flatMap((r) => analyticsToDisaggRows(r, dims));
    const cols = dims.length <= 1
      ? ['dx', 'ou', 'pe', 'periodType', 'category_id', 'category_name', 'value']
      : ['dx', 'ou', 'pe', 'periodType', ...dims.flatMap((_, i) => [`cat${i + 1}_id`, `cat${i + 1}_name`]), 'value'];
    writeFileSync(join(outDir, `fact_${d.slug}.csv`), toCsv(rows, cols));
    console.log(`fact_${d.slug}.csv: ${rows.length} rows`);
  }

  // --- geometry, merged onto the hierarchy by id ---
  // geometry from geoFeatures (only units with a boundary/point), merged by id.
  const features = [];
  for (const level of cfg.ouLevels) features.push(...(await client.geoFeatures(level)));
  const ouRows = buildOuRows(orgUnits, features);
  writeFileSync(join(outDir, 'ou.csv'),
    toCsv(ouRows, ['id', 'name', 'level', 'parent_id', 'parent_name', 'path', 'ty', 'lng', 'lat']));
  writeFileSync(join(outDir, 'ou.geojson'), JSON.stringify(geoFeaturesToGeoJSON(features)));
  console.log(`ou.csv: ${ouRows.length} rows (${features.length} with geometry); ou.geojson written`);

  // --- dimensions ---
  writeFileSync(join(outDir, 'dx.csv'), toCsv(dxRowsFromMeta(factResponses, cfg.dx), ['id', 'name']));
  writeFileSync(join(outDir, 'pe.csv'),
    toCsv(periods.map(parsePeriod), ['period', 'periodType', 'year', 'quarter', 'month', 'startDate']));
  console.log('dx.csv, pe.csv written');

  // --- skip summary ---
  // A skipped dx×level cut means that data is MISSING from the extract (the portal will show
  // gaps there). Surface it loudly — distinct from the routine, expected skips (e.g. the MD
  // school-count indicators are genuinely undefined at LGA level and 500 there by design).
  const skips = client.getSkips();
  if (skips.length) {
    const uniq = [...new Set(skips.map((s) => `${s.label || 'fact'} · LEVEL-${s.level} · ${s.dx}`))];
    console.warn(`\n[warn] INCOMPLETE EXTRACT — ${uniq.length} dx×level cut(s) skipped after retries.`);
    console.warn('       These are missing from the CSVs; the portal will show gaps for them.');
    console.warn('       If they are 502/504 (gateway), the instance was overloaded — re-run when');
    console.warn('       healthy, and/or lower OU_CHUNK / DX_CHUNK. Sample:');
    for (const u of uniq.slice(0, 15)) console.warn(`         - ${u}`);
    if (uniq.length > 15) console.warn(`         … and ${uniq.length - 15} more.`);
    if (process.env.EXTRACT_FAIL_ON_SKIP) process.exit(2);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
