// scripts/asc-pages/template.mjs
// Builds one baked Evidence page (Markdown + SQL) per org unit. Components in
// evidence/components are auto-registered by Evidence, so no imports are needed.
// Every query filters periodType='YEARLY' and scopes by a literal OU id (no ${inputs}),
// so the whole page is baked — no DuckDB-WASM engine downloaded.

// Indicator ids used on the pages (subset of the 67 real ASC indicators):
const I = {
  enrol: 'jwjKmtVK2wj',     // GEN Enrolment (all levels)
  teachers: 'Dw7f4gs9RcS',  // GEN Teachers
  ptr: 'eie1tIO5HtX',       // GEN Pupil-teacher ratio
  ptoilet: 'uWkPykwyYn2',   // GEN Pupil-usable toilet ratio
  female: 'Nc9bgbCb6eO',    // GEN Female learners (%)
  preprry_enrol: 'DiEriq7urPG', pry_enrol: 'd8qCE7aPWtD', jss_enrol: 'wDf8ZOwWgib',
  sss_enrol: 'IYNEmLyFgbe', anfe_enrol: 'g1ozV2n8G88',
};

const frontmatter = (ou) => `---
title: ${ou.name} — Annual School Census
---
`;

function head(ou, ancestors) {
  return `${frontmatter(ou)}
\`\`\`sql kpis
select dx, value from census.fact
where ou = '${ou.id}' and periodType = 'YEARLY' and pe = '2024'
  and dx in ('${I.enrol}','${I.teachers}','${I.ptr}','${I.female}')
\`\`\`

\`\`\`sql enrol_trend
select pe, value from census.fact
where ou = '${ou.id}' and dx = '${I.enrol}' and periodType = 'YEARLY' order by pe
\`\`\`

<ScopeNav title="${ou.name}" ancestors={${JSON.stringify(ancestors)}} />

<Grid cols=4>
  <SupersetBigNumber title="Total learners" data={kpis.filter(r=>r.dx==='${I.enrol}')} value=value trend={enrol_trend.map(r=>r.value)} />
  <SupersetBigNumber title="Teachers" data={kpis.filter(r=>r.dx==='${I.teachers}')} value=value />
  <SupersetBigNumber title="Pupil–teacher ratio" data={kpis.filter(r=>r.dx==='${I.ptr}')} value=value fmt={v=>Number(v).toFixed(1)} />
  <SupersetBigNumber title="Female learners (%)" data={kpis.filter(r=>r.dx==='${I.female}')} value=value fmt={v=>Number(v).toFixed(1)+'%'} />
</Grid>
`;
}

// Federal / State: children choropleth + compare table (children link down). Choropleth only.
function branchSection(ou, childLevel, childLinkPrefix) {
  const pivot = (dxId) => `max(case when f.dx='${dxId}' then f.value end)`;
  return `
\`\`\`sql children_map
select o.id, o.name, f.value
from census.fact f join census.ou o on f.ou = o.id
where o.parent_id = '${ou.id}' and f.dx = '${I.ptr}' and f.periodType = 'YEARLY' and f.pe = '2024'
\`\`\`

## ${childLevel}s — pupil-teacher ratio

<AreaMap data={children_map} geoJsonUrl="/asc.geojson" geoId="id" areaCol="id" value="value"
  title="Pupil–teacher ratio by ${childLevel}" tooltip={[{id:'name',showColumnTitles:false},{id:'value',fmt:'num1'}]} height={380} />

\`\`\`sql preprimary
select o.name as ou_name, '${childLinkPrefix}' || o.id as link,
  ${pivot(I.pry_enrol)} as enrolment, ${pivot(I.ptr)} as ptr, ${pivot(I.ptoilet)} as ptoilet
from census.ou o left join census.fact f on f.ou = o.id and f.periodType = 'YEARLY' and f.pe = '2024'
where o.parent_id = '${ou.id}'
group by o.name, o.id order by o.name
\`\`\`

\`\`\`sql jss
select o.name as ou_name, '${childLinkPrefix}' || o.id as link,
  ${pivot(I.jss_enrol)} as enrolment, ${pivot(I.ptr)} as ptr, ${pivot(I.ptoilet)} as ptoilet
from census.ou o left join census.fact f on f.ou = o.id and f.periodType = 'YEARLY' and f.pe = '2024'
where o.parent_id = '${ou.id}'
group by o.name, o.id order by o.name
\`\`\`

## Indicators by ${childLevel}

<CompareTable preprimary={preprimary} jss={jss}
  columns={[{key:'enrolment',label:'Enrolment'},{key:'ptr',label:'Pupil:Teacher',bar:true},{key:'ptoilet',label:'Pupil:Toilet'}]} />
`;
}

// LGA leaf: this LGA's own figures by education level. No children (nothing below LGA).
function leafSection(ou) {
  return `
\`\`\`sql edu_breakdown
select
  case f.dx
    when '${I.preprry_enrol}' then '1 Pre-Primary' when '${I.pry_enrol}' then '2 Primary'
    when '${I.jss_enrol}' then '3 JSS' when '${I.sss_enrol}' then '4 SSS' when '${I.anfe_enrol}' then '5 ANFE' end as level,
  f.value as enrolment
from census.fact f
where f.ou = '${ou.id}' and f.periodType = 'YEARLY' and f.pe = '2024'
  and f.dx in ('${I.preprry_enrol}','${I.pry_enrol}','${I.jss_enrol}','${I.sss_enrol}','${I.anfe_enrol}')
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

export function page({ ou, ancestors, leaf, childLevel, childLinkPrefix }) {
  return head(ou, ancestors) + (leaf ? leafSection(ou) : branchSection(ou, childLevel, childLinkPrefix));
}
