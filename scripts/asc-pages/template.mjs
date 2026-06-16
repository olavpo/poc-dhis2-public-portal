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

// Per education-level indicators for the "by sub-unit" overview tabs.
const LEVELS = [
  { key: 'preprry', label: 'Pre-Primary', enrol: 'DiEriq7urPG', female: 'QZl1LOTpSat', stream: 'i8mFzOkO9Wi', special: 'Rszp9Ippq5N' },
  { key: 'pry',     label: 'Primary',     enrol: 'd8qCE7aPWtD', female: 'JH1hYfoV2hb', stream: 'uNvBLdtslJ5', special: 'Mmn0SEDyzOC' },
  { key: 'jss',     label: 'JSS',         enrol: 'wDf8ZOwWgib', female: 'nghVrzkls6X', stream: 'Yf6K5jD4oED', special: 'bCMrPV3785Y' },
  { key: 'sss',     label: 'SSS',         enrol: 'IYNEmLyFgbe', female: 'jWEK2IgsZXZ', stream: 'Y8uv3HrDDcF', special: 'X4cRpKnxayU' },
  { key: 'anfe',    label: 'ANFE',        enrol: 'g1ozV2n8G88', female: 'dRBLKPEMR80', stream: 'mHzRpEIsf3n', special: 'kitIA5LU69N' },
];

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
    {dx:'${I.enrol}',title:'Total learners',fmt:'int'},
    {dx:'${I.teachers}',title:'Teachers',fmt:'int'},
    {dx:'${I.ptr}',title:'Pupil–teacher ratio',fmt:'ratio'},
    {dx:'${I.female}',title:'Female learners (%)',fmt:'pct'}
  ]} />
`;
}

// Federal / State: children choropleth + a tab-per-level compare table (children link down).
function branchSection(ou, childLevel, childLinkPrefix) {
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
  return `
\`\`\`sql children_map
select o.id, o.name, f.value
from census.fact f join census.ou o on f.ou = o.id
where o.parent_id = '${ou.id}' and f.dx = '${I.ptr}' and f.periodType = 'YEARLY' and f.pe = '2024'
\`\`\`

## ${childLevel}s — pupil-teacher ratio

<AreaMap data={children_map} geoJsonUrl="/asc.geojson" geoId="id" areaCol="id" value="value"
  title="Pupil–teacher ratio by ${childLevel}" tooltip={[{id:'name',showColumnTitles:false},{id:'value',fmt:'num1'}]} height={380} />
${LEVELS.map(levelQuery).join('')}
## Indicators by ${childLevel} — by education level

<CompareTable tabs={[${tabs}]}
  columns={[{key:'enrolment',label:'Enrolment'},{key:'female',label:'Female %'},{key:'stream',label:'Pupil:stream',bar:true},{key:'special',label:'Special needs'}]} />
`;
}

// LGA leaf: this LGA's own figures by education level. No children (nothing below LGA).
function leafSection(ou) {
  const whens = LEVELS.map((lv, i) => `when '${lv.enrol}' then '${i + 1} ${lv.label}'`).join(' ');
  const ids = LEVELS.map((lv) => `'${lv.enrol}'`).join(',');
  return `
\`\`\`sql edu_breakdown
select case f.dx ${whens} end as level, f.value as enrolment
from census.fact f
where f.ou = '${ou.id}' and f.periodType = 'YEARLY' and f.pe = '2024' and f.dx in (${ids})
order by level
\`\`\`

## Enrolment by education level — ${ou.name}

<DataTable data={edu_breakdown}>
  <Column id=level title="Education level" />
  <Column id=enrolment title="Enrolment (2024)" fmt="#,##0" />
</DataTable>

_This is the lowest level of detail in the portal — no ward- or school-level data._
`;
}

export function page({ ou, crumbs, selectors, leaf, childLevel, childLinkPrefix }) {
  return head(ou, crumbs, selectors) + (leaf ? leafSection(ou) : branchSection(ou, childLevel, childLinkPrefix));
}
