// scripts/asc-synth/index.mjs
// One-off generator: adds a synthetic Nigeria geography (org-unit levels + hierarchy +
// polygons) to agent-asc-ind, generates deterministic dummy dataValues for the real ASC
// data elements across the (invisible) school leaves, classifies schools by ownership,
// and runs analytics. Reuses the instance's real indicators/DEs — authors no metric defs.
import { readFileSync } from 'node:fs';
import { buildHierarchy, uid } from './lib/hierarchy.mjs';
import { assignGeometry } from './lib/geometry.mjs';
import { valueFor } from './lib/values.mjs';
import { get, dataElementInfo, postMetadata, postDataValues, addToGroup, assignUserRoot, runAnalytics } from './lib/dhis2.mjs';

const LEVELS = [
  { level: 1, name: 'National' },
  { level: 2, name: 'State' },
  { level: 3, name: 'LGA' },
  { level: 4, name: 'School' },
];
const PERIODS = ['2023', '2024'];
const INDICATORS_FILE = 'docs/emis-public-portal-input/school_list_indicators_BY_LEVEL.metadata.json';
const log = (...a) => console.log('[asc-synth]', ...a);

async function main() {
  const { units } = buildHierarchy();
  const geo = assignGeometry(units);

  // 1) Resolve the existing Ownership group set + its Public/Private groups.
  const ogs = (await get('/api/organisationUnitGroupSets.json?paging=false&fields=id,name,organisationUnitGroups[id,name]')).organisationUnitGroupSets;
  const ownership = ogs.find((g) => /ownership/i.test(g.name));
  if (!ownership) throw new Error('Ownership group set not found');
  const groupId = (label) => ownership.organisationUnitGroups.find((g) => new RegExp(label, 'i').test(g.name)).id;
  const PUBLIC = groupId('public'), PRIVATE = groupId('private');
  log('ownership groups:', { PUBLIC, PRIVATE });

  // 2) Metadata payload: levels (deterministic ids for idempotency) + org units (geometry L1-3) + group memberships.
  const organisationUnitLevels = LEVELS.map((l) => ({ id: uid(`level-${l.level}`), name: l.name, level: l.level }));
  const organisationUnits = units.map((u) => ({
    id: u.id, name: u.name, shortName: u.name.slice(0, 50), openingDate: '2015-01-01',
    parent: u.parent ? { id: u.parent } : undefined,
    geometry: geo[u.id], // undefined for schools -> omitted
  }));

  log(`importing ${organisationUnits.length} org units + ${organisationUnitLevels.length} levels…`);
  const r1 = await postMetadata({ organisationUnitLevels, organisationUnits });
  log('metadata import:', r1.status || r1.httpStatus, JSON.stringify(r1.stats || r1.response?.stats || {}));

  // Ownership memberships via the collection endpoint (full-object metadata import rejects partial groups).
  const schoolIds = (own) => units.filter((u) => u.level === 4 && u.ownership === own).map((u) => u.id);
  await addToGroup(PUBLIC, schoolIds('Public'));
  await addToGroup(PRIVATE, schoolIds('Private'));
  log(`ownership: ${schoolIds('Public').length} public, ${schoolIds('Private').length} private schools assigned`);

  // Assign the importing user to our root so data values pass the hierarchy check (E7617).
  await assignUserRoot(units[0].id);
  log('assigned importing user to root', units[0].id);

  // 3) Collect the real data elements referenced by the 67 indicators; fetch their names + COCs.
  const inds = JSON.parse(readFileSync(INDICATORS_FILE, 'utf8')).indicators;
  const deIds = new Set();
  for (const i of inds) for (const e of [i.numerator, i.denominator]) (String(e).match(/#\{([A-Za-z0-9]+)/g) || []).forEach((m) => deIds.add(m.slice(2)));
  log(`referenced data elements: ${deIds.size}`);
  const info = await dataElementInfo([...deIds]);

  // 4) Generate dummy data values at the 288 school leaves, for each DE's COCs, for 2023+2024.
  const schools = units.filter((u) => u.level === 4);
  const dataValues = [];
  for (const deId of deIds) {
    const meta = info[deId];
    if (!meta) { log('WARN: DE not found in instance, skipping', deId); continue; }
    const cocs = meta.cocs.length ? meta.cocs : ['HllvX50cXC0']; // default COC fallback
    for (const ou of schools) for (const coc of cocs) for (const pe of PERIODS)
      dataValues.push({ dataElement: deId, period: pe, orgUnit: ou.id, categoryOptionCombo: coc, value: String(valueFor(ou, { id: deId, name: meta.name }, coc, pe, cocs.length)) });
  }
  log(`importing ${dataValues.length} data values…`);
  let imported = 0, updated = 0, ignored = 0;
  for (let i = 0; i < dataValues.length; i += 50000) {
    const r = await postDataValues(dataValues.slice(i, i + 50000));
    imported += r.importCount?.imported ?? 0;
    updated += r.importCount?.updated ?? 0;
    ignored += r.importCount?.ignored ?? 0;
    log(` chunk ${i / 50000 + 1}: imported=${r.importCount?.imported} updated=${r.importCount?.updated} ignored=${r.importCount?.ignored}`);
  }
  log(`data values: ${imported} imported, ${updated} updated, ${ignored} ignored (ignored = non-numeric DEs / invalid COCs — harmless)`);

  // 5) Run analytics.
  log('running analytics (this can take a couple of minutes)…');
  await runAnalytics();
  log('DONE. national root id:', units[0].id);
}
main().catch((e) => { console.error(e); process.exit(1); });
