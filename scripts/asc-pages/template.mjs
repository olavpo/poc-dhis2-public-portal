// scripts/asc-pages/template.mjs
// Builds one baked Evidence page (Markdown + SQL) per org unit. Components in
// evidence/components are auto-registered by Evidence, so no imports are needed.
// Every query filters periodType='YEARLY' and scopes by a literal OU id (no ${inputs}),
// so the whole page is baked — no DuckDB-WASM engine downloaded.

// GEN (all-level) indicators for the KPI row + choropleth.
const I = {
  enrol: 'jwjKmtVK2wj',     // GEN Enrolment (all levels)
  teachers: 'Dw7f4gs9RcS',  // GEN Teachers
  ptr: 'eie1tIO5HtX',       // GEN Pupil-teacher ratio
  female: 'Nc9bgbCb6eO',    // GEN Female learners (%)
};

// Per education-level indicators (enrol/boys/girls for the charts; female/stream/special
// for the compare table).
const LEVELS = [
  { key: 'preprry', label: 'Pre-Primary', enrol: 'DiEriq7urPG', boys: 'L7wp6IPJGhV', girls: 'NnvopxD62MT', female: 'QZl1LOTpSat', stream: 'i8mFzOkO9Wi', special: 'Rszp9Ippq5N' },
  { key: 'pry',     label: 'Primary',     enrol: 'd8qCE7aPWtD', boys: 'yjH9LAuAMrk', girls: 'Qwjg1QG0Hws', female: 'JH1hYfoV2hb', stream: 'uNvBLdtslJ5', special: 'Mmn0SEDyzOC' },
  { key: 'jss',     label: 'JSS',         enrol: 'wDf8ZOwWgib', boys: 'gAfSf7sfxib', girls: 'uSfibhbGRT1', female: 'nghVrzkls6X', stream: 'Yf6K5jD4oED', special: 'bCMrPV3785Y' },
  { key: 'sss',     label: 'SSS',         enrol: 'IYNEmLyFgbe', boys: 'i8dMJSyq5hO', girls: 'vZA5RaodnuH', female: 'jWEK2IgsZXZ', stream: 'Y8uv3HrDDcF', special: 'X4cRpKnxayU' },
  { key: 'anfe',    label: 'ANFE',        enrol: 'g1ozV2n8G88', boys: 'kxJmBoDtD9t', girls: 'VzPMQzTjenn', female: 'dRBLKPEMR80', stream: 'mHzRpEIsf3n', special: 'kitIA5LU69N' },
];

const ENROL_WHENS = LEVELS.map((lv, i) => `when '${lv.enrol}' then '${i + 1} ${lv.label}'`).join(' ');
const ENROL_IDS = LEVELS.map((lv) => `'${lv.enrol}'`).join(',');
const SEX_LEVEL_WHENS = LEVELS.map((lv, i) => `when '${lv.boys}' then '${i + 1} ${lv.label}' when '${lv.girls}' then '${i + 1} ${lv.label}'`).join(' ');
const SEX_SEX_WHENS = LEVELS.map((lv) => `when '${lv.boys}' then 'Boys' when '${lv.girls}' then 'Girls'`).join(' ');
const SEX_IDS = LEVELS.flatMap((lv) => [`'${lv.boys}'`, `'${lv.girls}'`]).join(',');

function head(ou, crumbs, selectors) {
  const dxList = `'${I.enrol}','${I.teachers}','${I.ptr}','${I.female}'`;
  return `---
title: Annual School Census
---

\`\`\`sql kpis_total
select dx, value from census.fact
where ou = '${ou.id}' and periodType = 'YEARLY' and pe = '2024' and dx in (${dxList})
\`\`\`

\`\`\`sql kpis_public
select dx, value from census.fact_ownership
where ou = '${ou.id}' and periodType = 'YEARLY' and pe = '2024' and category_name like 'Public%' and dx in (${dxList})
\`\`\`

\`\`\`sql kpis_private
select dx, value from census.fact_ownership
where ou = '${ou.id}' and periodType = 'YEARLY' and pe = '2024' and category_name like 'Private%' and dx in (${dxList})
\`\`\`

<ScopeNav crumbs={${JSON.stringify(crumbs)}} selectors={${JSON.stringify(selectors)}} />

<KpiRow total={kpis_total} pub={kpis_public} priv={kpis_private}
  kpis={[
    {dx:'${I.enrol}',title:'Total learners',fmt:'int',icon:'fa-solid fa-users'},
    {dx:'${I.teachers}',title:'Teachers',fmt:'int',icon:'fa-solid fa-chalkboard-user'},
    {dx:'${I.ptr}',title:'Pupil–teacher ratio',fmt:'ratio',icon:'fa-solid fa-scale-balanced'},
    {dx:'${I.female}',title:'Female learners (%)',fmt:'pct',icon:'fa-solid fa-venus'}
  ]} />
`;
}

// Charts + (optionally) the children choropleth, in a responsive 2-col grid. The sql blocks
// are emitted BEFORE the <Grid> (mdsvex gotcha). withMap is true on branch pages only.
function chartsSection(ou, withMap, geoUrl) {
  return `
\`\`\`sql enrol_by_level
select case f.dx ${ENROL_WHENS} end as level, f.value as enrolment
from census.fact f
where f.ou = '${ou.id}' and f.periodType = 'YEARLY' and f.pe = '2024' and f.dx in (${ENROL_IDS})
order by level
\`\`\`

\`\`\`sql sex_by_level
select case f.dx ${SEX_LEVEL_WHENS} end as level,
       case f.dx ${SEX_SEX_WHENS} end as sex, f.value as learners
from census.fact f
where f.ou = '${ou.id}' and f.periodType = 'YEARLY' and f.pe = '2024' and f.dx in (${SEX_IDS})
order by level, sex
\`\`\`

\`\`\`sql ownership_enrol
select category_name, value from census.fact_ownership
where ou = '${ou.id}' and dx = '${I.enrol}' and periodType = 'YEARLY' and pe = '2024'
\`\`\`
${withMap ? `
\`\`\`sql children_map
select o.id, o.name, f.value
from census.fact f join census.ou o on f.ou = o.id
where o.parent_id = '${ou.id}' and f.dx = '${I.ptr}' and f.periodType = 'YEARLY' and f.pe = '2024'
\`\`\`
` : ''}
## Charts

<Grid cols=2>
${withMap ? `  <AreaMap data={children_map} geoJsonUrl="${geoUrl}" geoId="id" areaCol="id" value="value" title="Pupil–teacher ratio by sub-unit" tooltip={[{id:'name',showColumnTitles:false},{id:'value',fmt:'num1'}]} height={260} />\n` : ''}  <BarChart data={enrol_by_level} x=level y=enrolment title="Enrolment by education level" swapXY=true />
  <BarChart data={sex_by_level} x=level y=learners series=sex type=grouped title="Learners by sex & level" swapXY=true />
  <OwnershipDonut data={ownership_enrol} />
</Grid>
`;
}

// Federal / State: charts + map, then a tab-per-level compare table (children link down).
function branchSection(ou, childLevel, childLinkPrefix, geoUrl) {
  const levelQuery = (lv) => `
\`\`\`sql lvl_${lv.key}
select o.name as ou_name, '${childLinkPrefix}' || o.id as link,
  max(case when f.dx='${lv.enrol}' then f.value end) as enrolment,
  max(case when f.dx='${lv.female}' then f.value end) as female,
  max(case when f.dx='${lv.stream}' then f.value end) as stream,
  max(case when f.dx='${lv.special}' then f.value end) as special
from census.ou o left join census.fact f on f.ou = o.id and f.periodType = 'YEARLY' and f.pe = '2024'
where o.parent_id = '${ou.id}' group by o.name, o.id order by o.name
\`\`\`
`;
  const tabs = LEVELS.map((lv) => `{label:'${lv.label}',rows:lvl_${lv.key}}`).join(',');
  return chartsSection(ou, true, geoUrl) + `
${LEVELS.map(levelQuery).join('')}
## Indicators by ${childLevel} — by education level

<ScrollX>
<CompareTable tabs={[${tabs}]}
  columns={[{key:'enrolment',label:'Enrolment'},{key:'female',label:'Female %'},{key:'stream',label:'Pupil:stream',bar:true},{key:'special',label:'Special needs'}]} />
</ScrollX>
`;
}

// LGA leaf: charts (no children map) + the LGA's own enrolment-by-level table.
function leafSection(ou) {
  return chartsSection(ou, false) + `
## Enrolment by education level — ${ou.name}

<DataTable data={enrol_by_level}>
  <Column id=level title="Education level" />
  <Column id=enrolment title="Enrolment (2024)" fmt="#,##0" />
</DataTable>

_This is the lowest level of detail in the portal — no ward- or school-level data._
`;
}

export function page({ ou, crumbs, selectors, leaf, childLevel, childLinkPrefix, geoUrl }) {
  return head(ou, crumbs, selectors) + (leaf ? leafSection(ou) : branchSection(ou, childLevel, childLinkPrefix, geoUrl));
}
