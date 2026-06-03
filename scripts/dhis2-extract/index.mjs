#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { expandPeriods, parsePeriod } from './lib/periods.mjs';
import { makeClient, chunkPeriods } from './lib/dhis2.mjs';
import { analyticsToFactRows, analyticsToDisaggRows, dxRowsFromMeta } from './lib/facts.mjs';
import { geoFeatureToOuRow, geoFeaturesToGeoJSON } from './lib/orgunits.mjs';
import { toCsv } from './lib/csv.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const cfg = loadConfig(arg('config'));
  const outDir = arg('out', 'data/anc');
  const { DHIS2_USERNAME: username, DHIS2_PASSWORD: password } = process.env;
  if (!username || !password) throw new Error('Set DHIS2_USERNAME and DHIS2_PASSWORD in env');
  const client = makeClient({ baseUrl: cfg.baseUrl, username, password });
  mkdirSync(outDir, { recursive: true });

  // --- primary fact ---
  const periods = expandPeriods(cfg.periods);
  const factResponses = [];
  for (const chunk of chunkPeriods(periods)) factResponses.push(await client.analytics(cfg.dx, cfg.ouLevels, chunk));
  const factRows = factResponses.flatMap(analyticsToFactRows);
  writeFileSync(join(outDir, 'fact.csv'), toCsv(factRows, ['dx', 'ou', 'pe', 'periodType', 'value']));
  console.log(`fact.csv: ${factRows.length} rows`);

  // --- disaggregation cuts ---
  for (const d of cfg.disaggregations) {
    const resps = [];
    for (const chunk of chunkPeriods(periods)) resps.push(await client.analytics(d.dx, d.ouLevels, chunk, d.dim));
    const rows = resps.flatMap((r) => analyticsToDisaggRows(r, d.dim));
    writeFileSync(join(outDir, `fact_${d.slug}.csv`),
      toCsv(rows, ['dx', 'ou', 'pe', 'periodType', 'category_id', 'category_name', 'value']));
    console.log(`fact_${d.slug}.csv: ${rows.length} rows`);
  }

  // --- org units + geometry ---
  const features = [];
  for (const level of cfg.ouLevels) features.push(...(await client.geoFeatures(level)));
  const ouRows = features.map(geoFeatureToOuRow);
  writeFileSync(join(outDir, 'ou.csv'),
    toCsv(ouRows, ['id', 'name', 'level', 'parent_id', 'parent_name', 'path', 'ty', 'lng', 'lat']));
  writeFileSync(join(outDir, 'ou.geojson'), JSON.stringify(geoFeaturesToGeoJSON(features)));
  console.log(`ou.csv: ${ouRows.length} rows; ou.geojson written`);

  // --- dimensions ---
  writeFileSync(join(outDir, 'dx.csv'), toCsv(dxRowsFromMeta(factResponses, cfg.dx), ['id', 'name']));
  writeFileSync(join(outDir, 'pe.csv'),
    toCsv(periods.map(parsePeriod), ['period', 'periodType', 'year', 'quarter', 'month', 'startDate']));
  console.log('dx.csv, pe.csv written');
}

main().catch((e) => { console.error(e); process.exit(1); });
