// scripts/asc-pages/template.mjs
// Builds one baked Evidence page (Markdown + SQL) per org unit. Components in
// evidence/components are auto-registered by Evidence, so no imports are needed.
// Every query filters periodType='YEARLY' and scopes by a literal OU id (no ${inputs}),
// so the whole page is baked — no DuckDB-WASM engine downloaded.
//
// Org-unit names carry a 2-letter lowercase prefix ("fg Nigeria"); NAME() strips it.
// Charts use sort=false + an explicit `ord` so category axes keep a fixed order while
// showing clean level names (no numeric prefix).

const NAME = (col) => `regexp_replace(${col}, '^[a-z]{2} ', '')`;
const lit = (ids) => ids.map((x) => `'${x}'`).join(',');

// KPI-row indicators. schools is federal/state-only (blank at LGA); classrooms is all levels.
const I = {
  enrol: 'jwjKmtVK2wj',     // ASC-GEN Enrolment (all levels)
  teachers: 'Dw7f4gs9RcS',  // ASC-GEN Teachers
  ptr: 'eie1tIO5HtX',       // ASC-GEN Learner-teacher ratio
  schools: 'wVjDYI2HuQb',   // MD Total schools
  classrooms: 'DvMfSq5pZSA', // ASC-GEN Usable classrooms (F.2)
};
const TOGGLE = [I.enrol, I.teachers];       // KPI tiles that vary with the Public/Private toggle
const OVERALL = [I.classrooms, I.schools];  // KPI tiles that are always overall

// MD reporting indicators — actual (submitted) + expected reports per census form. Reporting
// completeness = Σactual ÷ Σexpected (derived in SQL).
const REPORT_ACTUAL = ['QLfdf8Jd9dc', 'Yr6FePoHpHP', 'OTZHZUXsMeN', 'zH11dcmH2Pg', 'SYwA4fNOprM', 'Jx7wWJI1WpR'];
const REPORT_EXPECTED = ['dh9fliYibms', 'S2cH9F1T7MU', 'jZtYw0T5xJl', 'jSbbKIsSvK3', 'stoCrMx0ED1', 'q5mnwKasEpF'];
const ACT = lit(REPORT_ACTUAL);
const EXP = lit(REPORT_EXPECTED);

// MD school counts by type — the schools-by-type chart (Minister order, no Total Public/Private).
const SCHOOL_TYPES = [
  { dx: 'v31dkf4PhmH', label: 'Primary' },
  { dx: 'I8JeN23lKHn', label: 'JSS' },
  { dx: 'tuku316VSXL', label: 'SSS' },
  { dx: 'CKMgwHERBfg', label: 'IQS' },
  { dx: 'uDBB1WrCkST', label: 'Tech/Voc' },
];
const SCHOOL_PUBLIC = 'U8ytqWQMFwD';
const SCHOOL_PRIVATE = 'BXTUMWSq4zQ';

// Education levels for enrolment / sex / compare. Pre-Primary+Primary merged → "Primary";
// ANFE relabelled "IQS". No Tech/Voc enrolment indicator exists, so it isn't here (it only
// appears in the schools-by-type chart, which uses school *counts*).
const DLEVELS = [
  { key: 'primary', label: 'Primary',
    enrol: ['DiEriq7urPG', 'd8qCE7aPWtD'], boys: ['L7wp6IPJGhV', 'yjH9LAuAMrk'],
    girls: ['NnvopxD62MT', 'Qwjg1QG0Hws'], special: ['Rszp9Ippq5N', 'Mmn0SEDyzOC'] },
  { key: 'jss', label: 'JSS',
    enrol: ['wDf8ZOwWgib'], boys: ['gAfSf7sfxib'], girls: ['uSfibhbGRT1'], special: ['bCMrPV3785Y'] },
  { key: 'sss', label: 'SSS',
    enrol: ['IYNEmLyFgbe'], boys: ['i8dMJSyq5hO'], girls: ['vZA5RaodnuH'], special: ['X4cRpKnxayU'] },
  { key: 'iqs', label: 'IQS',
    enrol: ['g1ozV2n8G88'], boys: ['kxJmBoDtD9t'], girls: ['VzPMQzTjenn'], special: ['kitIA5LU69N'] },
  // Tech/Voc (Science & Technical Colleges) — enrolment/boys/girls now exist as ASC-STC
  // indicators; there is no STC special-needs indicator, so that column is blank for Tech/Voc.
  { key: 'techvoc', label: 'Tech/Voc',
    enrol: ['u4ogrV7WUcz'], boys: ['j3cxHeBhZ4m'], girls: ['STJaOAJl6eG'], special: [] },
];
const whens = (pairs) => pairs.map(([id, out]) => `when '${id}' then ${out}`).join(' ');
const ENROL_LABELS = whens(DLEVELS.flatMap((lv) => lv.enrol.map((id) => [id, `'${lv.label}'`])));
const ENROL_ORDS = whens(DLEVELS.flatMap((lv, i) => lv.enrol.map((id) => [id, i + 1])));
const ENROL_IDS = lit(DLEVELS.flatMap((lv) => lv.enrol));
const SEX_LABELS = whens(DLEVELS.flatMap((lv) => [...lv.boys, ...lv.girls].map((id) => [id, `'${lv.label}'`])));
const SEX_ORDS = whens(DLEVELS.flatMap((lv, i) => [...lv.boys, ...lv.girls].map((id) => [id, i + 1])));
const SEX_SEX = whens(DLEVELS.flatMap((lv) => [...lv.boys.map((id) => [id, `'Boys'`]), ...lv.girls.map((id) => [id, `'Girls'`])]));
const SEX_IDS = lit(DLEVELS.flatMap((lv) => [...lv.boys, ...lv.girls]));
const SCHOOL_LABELS = whens(SCHOOL_TYPES.map((s) => [s.dx, `'${s.label}'`]));
const SCHOOL_ORDS = whens(SCHOOL_TYPES.map((s, i) => [s.dx, i + 1]));
const SCHOOL_IDS = lit(SCHOOL_TYPES.map((s) => s.dx));
// (label, ord) seed list so the level charts always show every level (incl. IQS & Tech/Voc
// at 0) even where an org unit has no rows for them — e.g. LGAs.
const LEVEL_VALUES = DLEVELS.map((lv, i) => `('${lv.label}',${i + 1})`).join(',');

// Benchmark ratios for "Key indicators vs Federal". `dx` = read directly; otherwise computed
// as factor × Σnum ÷ den (learner-lab = (JSS+SSS enrolment) ÷ useable labs; female teachers %).
const BENCH = [
  { label: 'Learner–teacher ratio', fmt: 'ratio', dx: 'eie1tIO5HtX' },
  { label: 'Learner–classroom ratio', fmt: 'ratio', dx: 'zrzIn10PQjq' },
  { label: 'Learner–school ratio', fmt: 'ratio', num: ['jwjKmtVK2wj'], den: 'wVjDYI2HuQb', factor: 1 },
  { label: 'Learner–toilet ratio', fmt: 'ratio', dx: 'uWkPykwyYn2' },
  { label: 'Learner–lab ratio', fmt: 'ratio', num: ['wDf8ZOwWgib', 'IYNEmLyFgbe'], den: 'oOHHjng0014', factor: 1 },
  { label: 'Female learners (%)', fmt: 'pct', dx: 'Nc9bgbCb6eO' },
  { label: 'Female teachers (%)', fmt: 'pct', num: ['PbzDc38hOsx'], den: 'ABJrmFcIpT3', factor: 100 },
];

// The Total/Public/Private cut. Total reads census.fact; Public/Private read the ownership
// group-set cut (census.fact_ownership). cat is unqualified `category_name` — unambiguous in
// our single-fact-table or fact-joined-to-ou queries. Each ownership-aware query bakes all
// three modes UNIONed with a `mode` tag, and the OwnershipData wrapper / a store filter inside
// ReportStats & Benchmark shows the rows for the active toggle.
const MODES3 = [
  { m: 'total', src: 'census.fact', cat: '' },
  { m: 'public', src: 'census.fact_ownership', cat: `and category_name like 'Public%'` },
  { m: 'private', src: 'census.fact_ownership', cat: `and category_name like 'Private%'` },
];

// Reporting completeness splits by *form*, not the ownership group set: the Private census form
// is the private slice; the other five forms are the public slice. So it reads census.fact.
const REPORT_MODES = [
  { m: 'total', act: REPORT_ACTUAL, exp: REPORT_EXPECTED },
  { m: 'public', act: REPORT_ACTUAL.slice(0, 5), exp: REPORT_EXPECTED.slice(0, 5) },
  { m: 'private', act: REPORT_ACTUAL.slice(5), exp: REPORT_EXPECTED.slice(5) },
];
function reportingQuery(ouId) {
  const one = (M) => {
    const a = lit(M.act), e = lit(M.exp);
    return `select '${M.m}' as mode,
      sum(case when dx in (${a}) then value else 0 end) as submitted,
      sum(case when dx in (${e}) then value else 0 end) as expected,
      case when sum(case when dx in (${e}) then value else 0 end) > 0
        then round(100.0 * sum(case when dx in (${a}) then value else 0 end)
                         / sum(case when dx in (${e}) then value else 0 end), 1)
        else null end as completeness
    from census.fact where ou = '${ouId}' and periodType = 'YEARLY' and pe = '2025' and dx in (${a},${e})`;
  };
  return REPORT_MODES.map(one).join('\nunion all\n');
}

// Overall (toggle-independent) counts injected into the Public/Private KPI sets.
function overallRows(ouId) {
  return `select dx, value from census.fact
  where ou = '${ouId}' and periodType = 'YEARLY' and pe = '2025' and dx in (${lit(OVERALL)})`;
}

// Each benchmark row yields the unit's value, its parent state's value (for LGA pages) and the
// Federal value, tagged with the ownership `mode` (M). Public/Private read the ownership cut so
// the whole comparison switches with the toggle. `state` is the parent-state id ('' on
// state/federal pages — that column is hidden by the Benchmark component, which keys off
// stateLabel).
// unitE/stateE/fedE are SQL *value expressions* — a quoted id ('abc') for baked pages, or a
// subquery (for the dynamic LGA page, whose parent state is derived from params.id).
function benchSelect(b, i, unitE, stateE, fedE, M) {
  const cols = `'${M.m}' as mode, ${i + 1} as ord, '${b.label}' as indicator, '${b.fmt}' as fmt`;
  const scope = `ou in (${unitE}, ${stateE}, ${fedE}) and periodType='YEARLY' and pe='2025' ${M.cat}`;
  if (b.dx) {
    return `select ${cols},
      round(max(case when ou=${unitE} then value end),1) as unit,
      round(max(case when ou=${stateE} then value end),1) as state,
      round(max(case when ou=${fedE} then value end),1) as federal
    from ${M.src} where ${scope} and dx='${b.dx}'`;
  }
  const ids = lit([...b.num, b.den]);
  const num = (oE) => `sum(case when ou=${oE} and dx in (${lit(b.num)}) then value else 0 end)`;
  const den = (oE) => `nullif(max(case when ou=${oE} and dx='${b.den}' then value end),0)`;
  return `select ${cols},
    round(${b.factor}*${num(unitE)}/${den(unitE)},1) as unit,
    round(${b.factor}*${num(stateE)}/${den(stateE)},1) as state,
    round(${b.factor}*${num(fedE)}/${den(fedE)},1) as federal
  from ${M.src} where ${scope} and dx in (${ids})`;
}

function head(ou, crumbs, federalId, unitLabel, stateId, stateLabel) {
  const ownDx = lit(TOGGLE);
  const unitE = `'${ou.id}'`, fedE = `'${federalId}'`, stateE = stateId ? `'${stateId}'` : `''`;
  const benchmark = `select * from (\n${BENCH.flatMap((b, i) => MODES3.map((M) => benchSelect(b, i, unitE, stateE, fedE, M))).join('\nunion all\n')}\n) order by mode, ord`;
  const benchHeading = stateLabel ? 'Key indicators vs State & Federal' : unitLabel ? 'Key indicators vs Federal' : 'Key indicators';
  return `---
title: ${ou.name}
---

\`\`\`sql kpis_total
select dx, value from census.fact
where ou = '${ou.id}' and periodType = 'YEARLY' and pe = '2025' and dx in (${lit([...TOGGLE, ...OVERALL])})
\`\`\`

\`\`\`sql kpis_public
select dx, value from census.fact_ownership
where ou = '${ou.id}' and periodType = 'YEARLY' and pe = '2025' and category_name like 'Public%' and dx in (${ownDx})
union all
${overallRows(ou.id)}
\`\`\`

\`\`\`sql kpis_private
select dx, value from census.fact_ownership
where ou = '${ou.id}' and periodType = 'YEARLY' and pe = '2025' and category_name like 'Private%' and dx in (${ownDx})
union all
${overallRows(ou.id)}
\`\`\`

\`\`\`sql reporting
${reportingQuery(ou.id)}
\`\`\`

\`\`\`sql benchmark
${benchmark}
\`\`\`

<ScopeNav crumbs={${JSON.stringify(crumbs)}} />

<KpiRow total={kpis_total} pub={kpis_public} priv={kpis_private}
  kpis={[
    {dx:'${I.enrol}',title:'Learners',fmt:'int',icon:'fa-solid fa-users'},
    {dx:'${I.teachers}',title:'Teachers',fmt:'int',icon:'fa-solid fa-chalkboard-user'},
    {dx:'${I.classrooms}',title:'Classrooms',fmt:'int',icon:'fa-solid fa-school'},
    {dx:'${I.schools}',title:'Schools',fmt:'int',icon:'fa-solid fa-building-columns'}
  ]} />

<ReportStats data={reporting} />

## ${benchHeading}

<Benchmark rows={benchmark} unitLabel="${unitLabel}" stateLabel="${stateLabel}" />
`;
}

// Charts + (optionally) the children choropleth, in a responsive 2-col grid. SQL blocks go
// BEFORE the <Grid> (mdsvex gotcha). withMap true on branch pages; childLevel labels the map.
function chartsSection(ou, withMap, geoUrl, childLinkPrefix, childLevel) {
  const W = `f.ou = '${ou.id}' and f.periodType = 'YEARLY' and f.pe = '2025'`;
  // One real Evidence query per ownership mode (Total / Public / Private). OwnershipSelect
  // picks one and hands the genuine query object to the native chart/map (which subscribes &
  // .fetch()es it). enrol/sex force every level (incl. IQS & Tech/Voc at 0) via the lv seed.
  const enrolQ = (M) => `\`\`\`sql enrol_${M.m}
with lv(level, ord) as (values ${LEVEL_VALUES})
select lv.level as level, coalesce(agg.enrolment, 0) as enrolment, lv.ord as ord
from lv left join (
  select case f.dx ${ENROL_LABELS} end as level, sum(f.value) as enrolment
  from ${M.src} f where ${W} ${M.cat} and f.dx in (${ENROL_IDS}) group by 1
) agg on agg.level = lv.level order by lv.ord
\`\`\``;
  const sexQ = (M) => `\`\`\`sql sex_${M.m}
with lv(level, ord) as (values ${LEVEL_VALUES}), sx(sex) as (values ('Boys'),('Girls'))
select lv.level as level, sx.sex as sex, coalesce(agg.learners, 0) as learners, lv.ord as ord
from lv cross join sx left join (
  select case f.dx ${SEX_LABELS} end as level, case f.dx ${SEX_SEX} end as sex, sum(f.value) as learners
  from ${M.src} f where ${W} ${M.cat} and f.dx in (${SEX_IDS}) group by 1, 2
) agg on agg.level = lv.level and agg.sex = sx.sex order by lv.ord, sx.sex
\`\`\``;
  const schoolsQ = (M) => `\`\`\`sql schools_${M.m}
select label, value, ord from (
  select case f.dx ${SCHOOL_LABELS} end as label, case f.dx ${SCHOOL_ORDS} end as ord, f.value as value
  from ${M.src} f where ${W} ${M.cat} and f.dx in (${SCHOOL_IDS})
) order by ord
\`\`\``;
  const mapQ = (M) => `\`\`\`sql children_map_${M.m}
select o.id as id, ${NAME('o.name')} as name, f.value as learners, '${childLinkPrefix}' || o.id as link
from ${M.src} f join census.ou o on f.ou = o.id
where o.parent_id = '${ou.id}' and f.dx = '${I.enrol}' and f.periodType = 'YEARLY' and f.pe = '2025' ${M.cat}
\`\`\``;
  const q3 = (fn) => MODES3.map(fn).join('\n\n');
  return `
${q3(enrolQ)}

${q3(sexQ)}

${q3(schoolsQ)}

\`\`\`sql ownership_enrol
select category_name, value from census.fact_ownership
where ou = '${ou.id}' and dx = '${I.enrol}' and periodType = 'YEARLY' and pe = '2025'
\`\`\`

\`\`\`sql schools_ownership
select 'Public' as category_name, sum(case when dx = '${SCHOOL_PUBLIC}' then value else 0 end) as value
from census.fact where ou = '${ou.id}' and periodType = 'YEARLY' and pe = '2025'
union all
select 'Private', sum(case when dx = '${SCHOOL_PRIVATE}' then value else 0 end)
from census.fact where ou = '${ou.id}' and periodType = 'YEARLY' and pe = '2025'
\`\`\`
${withMap ? `
${q3(mapQ)}
` : ''}
## Charts

<Grid cols=2>
${withMap ? `  <OwnershipSelect total={children_map_total} pub={children_map_public} priv={children_map_private} let:data>
    <AreaMap data={data} geoJsonUrl="${geoUrl}" geoId="id" areaCol="id" value="learners" link="link" title="Learners by ${childLevel} · tap to explore" tooltip={[{id:'name',showColumnTitles:false},{id:'learners',fmt:'#,##0'}]} height={300} />
  </OwnershipSelect>\n` : ''}  <OwnershipSelect total={enrol_total} pub={enrol_public} priv={enrol_private} let:data>
    <BarChart data={data} x=level y=enrolment title="Learners by education level" swapXY=true sort=false />
  </OwnershipSelect>
  <OwnershipSelect total={sex_total} pub={sex_public} priv={sex_private} let:data>
    <BarChart data={data} x=level y=learners series=sex type=grouped title="Learners by sex & level" swapXY=true sort=false />
  </OwnershipSelect>
  <OwnershipSelect total={schools_total} pub={schools_public} priv={schools_private} let:data>
    <BarChart data={data} x=label y=value title="Schools by type" swapXY=true sort=false emptySet=pass emptyMessage="No data available at this level" />
  </OwnershipSelect>
  <OwnershipDonut data={ownership_enrol} title="Learners by public/private" />
  <OwnershipDonut data={schools_ownership} title="Schools by public/private" />
</Grid>
`;
}

// Federal / State: charts + map, then a tab-per-level compare table (children link down).
// Columns: per-level Learners / Female% / Special needs, plus the org-unit-level benchmark
// ratios (learner-teacher/classroom/toilet/lab, female teachers %) — identical across tabs.
// School-Type group-set categories (ids from the "School Type" group set). "Private" and
// "Unknown school type" are intentionally skipped — ownership is the separate toggle.
const SCHOOL_TYPE_TABS = [
  { key: 'primary', label: 'Primary', id: 'Q9AZ29igB6j' }, // Pre/Primary
  { key: 'jss', label: 'JSS', id: 'LWv2iy1xoW5' },
  { key: 'sss', label: 'SSS', id: 'o62AI6qkSgS' },
  { key: 'iqs', label: 'IQS', id: 'QdjMpXKVYEs' }, // IQS/IQTE
  { key: 'techvoc', label: 'Tech/Voc', id: 'buScFFQAJ1g' },
];
const SPECIAL_IDS = lit(['Rszp9Ippq5N', 'Mmn0SEDyzOC', 'bCMrPV3785Y', 'X4cRpKnxayU', 'kitIA5LU69N']);

function branchSection(ou, childLevel, childLinkPrefix, geoUrl) {
  // Compare table: tabs = Total + each school type; the page's ownership toggle filters each.
  // Ratios are read directly (never summed), from the cut that matches (tab × mode):
  //   Total/Total → fact · Total/Public|Private → fact_ownership · Type/Total → fact_schooltype
  //   · Type/Public|Private → fact_typeown (cat1=type, cat2=ownership).
  const cols = `sum(case when f.dx = 'jwjKmtVK2wj' then f.value else 0 end) as enrolment,
  max(case when f.dx = 'Nc9bgbCb6eO' then f.value end) as female_l,
  max(case when f.dx = 'eie1tIO5HtX' then f.value end) as lt,
  max(case when f.dx = 'zrzIn10PQjq' then f.value end) as lc,
  max(case when f.dx = 'uWkPykwyYn2' then f.value end) as ltoilet,
  round(sum(case when f.dx = 'jwjKmtVK2wj' then f.value else 0 end)
        / nullif(max(case when f.dx = 'oOHHjng0014' then f.value end), 0), 1) as lab,
  case when max(case when f.dx = 'ABJrmFcIpT3' then f.value end) > 0
    then round(100.0 * max(case when f.dx = 'PbzDc38hOsx' then f.value end)
                     / max(case when f.dx = 'ABJrmFcIpT3' then f.value end), 1) end as femt,
  sum(case when f.dx in (${SPECIAL_IDS}) then f.value else 0 end) as special`;
  const ownLike = (m) => `and f.${m.col} like '${m.m === 'public' ? 'Public' : 'Private'}%'`;
  const srcFor = (typeId, m) => {
    if (!typeId) {
      return m === 'total'
        ? { src: 'census.fact', filt: '' }
        : { src: 'census.fact_ownership', filt: ownLike({ m, col: 'category_name' }) };
    }
    return m === 'total'
      ? { src: 'census.fact_schooltype', filt: `and f.category_id = '${typeId}'` }
      : { src: 'census.fact_typeown', filt: `and f.cat1_id = '${typeId}' ${ownLike({ m, col: 'cat2_name' })}` };
  };
  const query = (tab, m) => {
    const { src, filt } = srcFor(tab.id, m);
    return `
\`\`\`sql lvl_${tab.key}_${m}
select ${NAME('o.name')} as ou_name, '${childLinkPrefix}' || o.id as link,
  ${cols}
from census.ou o left join ${src} f on f.ou = o.id and f.periodType = 'YEARLY' and f.pe = '2025' ${filt}
where o.parent_id = '${ou.id}' group by o.name, o.id order by ou_name
\`\`\`
`;
  };
  const TABS = [{ key: 'total', label: 'Total', id: '' }, ...SCHOOL_TYPE_TABS];
  const queries = TABS.flatMap((t) => ['total', 'public', 'private'].map((m) => query(t, m))).join('');
  const tabs = TABS.map((t) => `{label:'${t.label}',total:lvl_${t.key}_total,public:lvl_${t.key}_public,private:lvl_${t.key}_private}`).join(',');
  return chartsSection(ou, true, geoUrl, childLinkPrefix, childLevel) + `
${queries}
## Indicators by ${childLevel}

<ScrollX>
<CompareTable tabs={[${tabs}]}
  columns={[{key:'enrolment',label:'Learners'},{key:'lt',label:'Learner:teacher'},{key:'lc',label:'Learner:classroom'},{key:'ltoilet',label:'Learner:toilet'},{key:'lab',label:'Learner:lab'},{key:'female_l',label:'Female learners %'},{key:'femt',label:'Female teachers %'},{key:'special',label:'Special needs'}]} />
</ScrollX>
`;
}

// Federal + State pages are baked/prerendered (literal OU ids).
export function page({ ou, crumbs, childLevel, childLinkPrefix, geoUrl, federalId, unitLabel, stateId = '', stateLabel = '' }) {
  return head(ou, crumbs, federalId, unitLabel, stateId, stateLabel) + branchSection(ou, childLevel, childLinkPrefix, geoUrl);
}

// LGA leaf: ONE dynamic route (/asc/lga/[id]) instead of 774 baked pages — keeps the build's
// compiled-route count ~39 (fits 16 GB) and renders each LGA client-side from params.id (loads
// the DuckDB-WASM engine on demand). Same content as a baked leaf: KPIs + reporting + benchmark
// (LGA vs its parent state vs Federal) + charts + enrolment table, all toggled by ownership.
// `${params.id}` is Evidence's runtime page param; crumbs/labels resolve via a query.
export function leafDynamicPage(federalId, base = '') {
  const P = '${params.id}';                 // literal param token (single-quoted ⇒ not interpolated here)
  const ID = `'${P}'`;                      // the LGA id as a SQL value: '${params.id}'
  const stateE = `(select parent_id from census.ou where id = ${ID})`;
  const ownDx = lit(TOGGLE);
  const benchmark = `select * from (\n${BENCH.flatMap((b, i) => MODES3.map((M) => benchSelect(b, i, ID, stateE, `'${federalId}'`, M))).join('\nunion all\n')}\n) order by mode, ord`;
  return `---
title: Local Government Area
---

\`\`\`sql crumbs_q
select 1 as ord, '${base}/' as link, ${NAME('name')} as name from census.ou where level = '1'
union all
select 2, '${base}/asc/state-' || id, ${NAME('name')} from census.ou where id = ${stateE}
union all
select 3, null, ${NAME('name')} from census.ou where id = ${ID}
order by ord
\`\`\`

\`\`\`sql kpis_total
select dx, value from census.fact
where ou = ${ID} and periodType = 'YEARLY' and pe = '2025' and dx in (${lit([...TOGGLE, ...OVERALL])})
\`\`\`

\`\`\`sql kpis_public
select dx, value from census.fact_ownership
where ou = ${ID} and periodType = 'YEARLY' and pe = '2025' and category_name like 'Public%' and dx in (${ownDx})
union all
${overallRows(P)}
\`\`\`

\`\`\`sql kpis_private
select dx, value from census.fact_ownership
where ou = ${ID} and periodType = 'YEARLY' and pe = '2025' and category_name like 'Private%' and dx in (${ownDx})
union all
${overallRows(P)}
\`\`\`

\`\`\`sql reporting
${reportingQuery(P)}
\`\`\`

\`\`\`sql benchmark
${benchmark}
\`\`\`

<ScopeNav crumbs={crumbs_q} />

<KpiRow total={kpis_total} pub={kpis_public} priv={kpis_private}
  kpis={[
    {dx:'${I.enrol}',title:'Learners',fmt:'int',icon:'fa-solid fa-users'},
    {dx:'${I.teachers}',title:'Teachers',fmt:'int',icon:'fa-solid fa-chalkboard-user'},
    {dx:'${I.classrooms}',title:'Classrooms',fmt:'int',icon:'fa-solid fa-school'},
    {dx:'${I.schools}',title:'Schools',fmt:'int',icon:'fa-solid fa-building-columns'}
  ]} />

<ReportStats data={reporting} />

## Key indicators vs State & Federal

<Benchmark rows={benchmark} unitLabel={crumbs_q?.[2]?.name ?? ''} stateLabel={crumbs_q?.[1]?.name ?? ''} />
` + chartsSection({ id: P }, false) + `
## Enrolment by education level

<OwnershipSelect total={enrol_total} pub={enrol_public} priv={enrol_private} let:data>
<DataTable data={data}>
  <Column id=level title="Education level" />
  <Column id=enrolment title="Enrolment (2025)" fmt="#,##0" />
</DataTable>
</OwnershipSelect>
`;
}
