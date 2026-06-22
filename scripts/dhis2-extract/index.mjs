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

  // --- primary fact ---
  const periods = expandPeriods(cfg.periods);
  const factResponses = [];
  for (const chunk of chunkPeriods(periods)) factResponses.push(...await client.analyticsChunked(cfg.dx, cfg.ouLevels, chunk));
  const factRows = factResponses.flatMap(analyticsToFactRows);
  writeFileSync(join(outDir, 'fact.csv'), toCsv(factRows, ['dx', 'ou', 'pe', 'periodType', 'value']));
  console.log(`fact.csv: ${factRows.length} rows`);

  // --- disaggregation cuts ---
  for (const d of cfg.disaggregations) {
    const dims = d.dims ?? (d.dim ? [d.dim] : []); // one group set, or several (cross-cut)
    const resps = [];
    for (const chunk of chunkPeriods(periods)) resps.push(...await client.analyticsChunked(d.dx, d.ouLevels, chunk, dims));
    const rows = resps.flatMap((r) => analyticsToDisaggRows(r, dims));
    const cols = dims.length <= 1
      ? ['dx', 'ou', 'pe', 'periodType', 'category_id', 'category_name', 'value']
      : ['dx', 'ou', 'pe', 'periodType', ...dims.flatMap((_, i) => [`cat${i + 1}_id`, `cat${i + 1}_name`]), 'value'];
    writeFileSync(join(outDir, `fact_${d.slug}.csv`), toCsv(rows, cols));
    console.log(`fact_${d.slug}.csv: ${rows.length} rows`);
  }

  // --- org units (hierarchy) + geometry ---
  // Hierarchy from /api/organisationUnits (complete — includes geometry-less units like the
  // national root); geometry from geoFeatures (only units with a boundary/point), merged by id.
  const orgUnits = await client.organisationUnits(cfg.ouLevels);
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
}

main().catch((e) => { console.error(e); process.exit(1); });
