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

// Carto now requires an API key on basemaps.cartocdn.com (unkeyed/invalid-keyed requests still
// 200 but render a watermark). Baked into every generated page's AreaMap `basemap` prop, so the
// key ends up in the static build like any other client-side map key (Carto keys are domain-
// restricted, so this is expected — see CARTO_BASEMAP_KEY in the deploy docs). Fail fast rather
// than silently shipping a watermarked map.
const CARTO_BASEMAP_KEY = process.env.CARTO_BASEMAP_KEY;
if (!CARTO_BASEMAP_KEY) {
  throw new Error('CARTO_BASEMAP_KEY env var is required (Carto basemap tiles need an API key) — set it before running pages:asc / build.');
}
const BASEMAP_URL = `https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_BASEMAP_KEY}`;

// KPI-row indicators. All four KPI tiles disaggregate by the Public/Private toggle (each dx is in
// the ownership cut). schools (MD) is federal/state-only, so it's not a KPI tile — it still feeds
// the schools chart + benchmark.
const I = {
  enrol: 'jwjKmtVK2wj',     // ASC-GEN Enrolment (all levels)
  teachers: 'Dw7f4gs9RcS',  // ASC-GEN Teachers
  ptr: 'eie1tIO5HtX',       // ASC-GEN Learner-teacher ratio
  schools: 'wVjDYI2HuQb',   // MD Total schools
  classrooms: 'DvMfSq5pZSA', // ASC-GEN Usable classrooms (F.2)
  toilets: 'vDmeu4io2Fs',   // ASC-GEN Usable toilets (F.2)
};
const TOGGLE = [I.enrol, I.teachers, I.classrooms, I.toilets]; // all KPI tiles vary with the toggle
const OVERALL = [];          // none — every KPI tile disaggregates by ownership (needs each dx in the cut)

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
    enrol: ['DiEriq7urPG', 'd8qCE7aPWtD'], male: ['L7wp6IPJGhV', 'yjH9LAuAMrk'],
    female: ['NnvopxD62MT', 'Qwjg1QG0Hws'], special: ['Rszp9Ippq5N', 'Mmn0SEDyzOC'] },
  { key: 'jss', label: 'JSS',
    enrol: ['wDf8ZOwWgib'], male: ['gAfSf7sfxib'], female: ['uSfibhbGRT1'], special: ['bCMrPV3785Y'] },
  { key: 'sss', label: 'SSS',
    enrol: ['IYNEmLyFgbe'], male: ['i8dMJSyq5hO'], female: ['vZA5RaodnuH'], special: ['X4cRpKnxayU'] },
  { key: 'iqs', label: 'IQS',
    enrol: ['g1ozV2n8G88'], male: ['kxJmBoDtD9t'], female: ['VzPMQzTjenn'], special: ['kitIA5LU69N'] },
  // Tech/Voc (Science & Technical Colleges) — enrolment/male/female now exist as ASC-STC
  // indicators; there is no STC special-needs indicator, so that column is blank for Tech/Voc.
  { key: 'techvoc', label: 'Tech/Voc',
    enrol: ['u4ogrV7WUcz'], male: ['j3cxHeBhZ4m'], female: ['STJaOAJl6eG'], special: [] },
];
const whens = (pairs) => pairs.map(([id, out]) => `when '${id}' then ${out}`).join(' ');
const ENROL_LABELS = whens(DLEVELS.flatMap((lv) => lv.enrol.map((id) => [id, `'${lv.label}'`])));
const ENROL_ORDS = whens(DLEVELS.flatMap((lv, i) => lv.enrol.map((id) => [id, i + 1])));
const ENROL_IDS = lit(DLEVELS.flatMap((lv) => lv.enrol));
const SEX_LABELS = whens(DLEVELS.flatMap((lv) => [...lv.male, ...lv.female].map((id) => [id, `'${lv.label}'`])));
const SEX_ORDS = whens(DLEVELS.flatMap((lv, i) => [...lv.male, ...lv.female].map((id) => [id, i + 1])));
const SEX_SEX = whens(DLEVELS.flatMap((lv) => [...lv.male.map((id) => [id, `'Male'`]), ...lv.female.map((id) => [id, `'Female'`])]));
const SEX_IDS = lit(DLEVELS.flatMap((lv) => [...lv.male, ...lv.female]));
const SCHOOL_LABELS = whens(SCHOOL_TYPES.map((s) => [s.dx, `'${s.label}'`]));
const SCHOOL_ORDS = whens(SCHOOL_TYPES.map((s, i) => [s.dx, i + 1]));
const SCHOOL_IDS = lit(SCHOOL_TYPES.map((s) => s.dx));
// (label, ord) seed list so the level charts always show every level (incl. IQS & Tech/Voc
// at 0) even where an org unit has no rows for them — e.g. LGAs.
const LEVEL_VALUES = DLEVELS.map((lv, i) => `('${lv.label}',${i + 1})`).join(',');

// Benchmark ratios for the "Key Indicators" table. `dx` = read directly; otherwise computed as
// factor × Σnum ÷ den (learner-school = enrolment ÷ schools; female teachers % = F ÷ all × 100).
const BENCH = [
  { label: 'Learner–Teacher Ratio', fmt: 'ratio', dx: 'eie1tIO5HtX' },
  { label: 'Learner–Classroom Ratio', fmt: 'ratio', dx: 'YN2pzjKpi3l' },
  { label: 'Learner–School Ratio', fmt: 'ratio', num: ['jwjKmtVK2wj'], den: 'wVjDYI2HuQb', factor: 1 },
  { label: 'Learner–Toilet Ratio', fmt: 'ratio', dx: 'uWkPykwyYn2' },
  { label: 'Female Learners (%)', fmt: 'pct', dx: 'Nc9bgbCb6eO' },
  { label: 'Female Teachers (%)', fmt: 'pct', num: ['PbzDc38hOsx'], den: 'ABJrmFcIpT3', factor: 100 },
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
    from census.fact where ou = '${ouId}' and periodType = 'YEARLY' and pe = '2024' and dx in (${a},${e})`;
  };
  return REPORT_MODES.map(one).join('\nunion all\n');
}

// Any toggle-independent KPI counts (OVERALL) appended to the Public/Private KPI sets from
// census.fact. Returns '' when there are none, so the `union all` is omitted (an empty
// `dx in ()` would be invalid SQL).
function overallUnion(ouId) {
  return OVERALL.length
    ? `\nunion all\nselect dx, value from census.fact where ou = '${ouId}' and periodType = 'YEARLY' and pe = '2024' and dx in (${lit(OVERALL)})`
    : '';
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
  const scope = `ou in (${unitE}, ${stateE}, ${fedE}) and periodType='YEARLY' and pe='2024' ${M.cat}`;
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

// SEO: a keyword-rich <title> + meta description per page. Evidence's @evidence-dev/preprocess
// turns frontmatter `title`/`description` into <title>, <meta name="description"> and the
// OpenGraph/Twitter tags automatically. (It also injects the page's single <svelte:head>, so we
// must NOT add one here — Svelte allows only one per component; the canonical link lives in the
// layout's <svelte:head> instead, derived per-page from $page.url — see patch-evidence.mjs.)
// JSON.stringify emits a valid double-quoted YAML scalar (safe for the em-dash/pipe/apostrophe).
function seo(ou) {
  if (ou.level === '1') return {
    title: 'Nigeria Education Statistics 2024 — Annual School Census | Federal Ministry of Education',
    desc: 'Official Nigeria education statistics from the 2024 Annual School Census (ASC): schools, learners, teachers, classrooms and key indicators, nationally and by state — from the Federal Ministry of Education (DNEMIS).',
  };
  return {
    title: `${ou.name} Education Statistics 2024 — Annual School Census | Nigeria DNEMIS`,
    desc: `${ou.name} education statistics from Nigeria's 2024 Annual School Census: schools, learners, teachers, classrooms and key indicators by LGA — from the Federal Ministry of Education (DNEMIS).`,
  };
}

function head(ou, crumbs, federalId, unitLabel, stateId, stateLabel) {
  const ownDx = lit(TOGGLE);
  const unitE = `'${ou.id}'`, fedE = `'${federalId}'`, stateE = stateId ? `'${stateId}'` : `''`;
  const benchmark = `select * from (\n${BENCH.flatMap((b, i) => MODES3.map((M) => benchSelect(b, i, unitE, stateE, fedE, M))).join('\nunion all\n')}\n) order by mode, ord`;
  const benchHeading = stateLabel ? 'Key Indicators vs State & Federal' : unitLabel ? 'Key Indicators vs Federal' : 'Key Indicators';
  const { title: seoTitle, desc } = seo(ou);
  return `---
title: ${JSON.stringify(seoTitle)}
description: ${JSON.stringify(desc)}
---


\`\`\`sql kpis_total
select dx, value from census.fact
where ou = '${ou.id}' and periodType = 'YEARLY' and pe = '2024' and dx in (${lit([...TOGGLE, ...OVERALL])})
\`\`\`

\`\`\`sql kpis_public
select dx, value from census.fact_ownership
where ou = '${ou.id}' and periodType = 'YEARLY' and pe = '2024' and category_name like 'Public%' and dx in (${ownDx})${overallUnion(ou.id)}
\`\`\`

\`\`\`sql kpis_private
select dx, value from census.fact_ownership
where ou = '${ou.id}' and periodType = 'YEARLY' and pe = '2024' and category_name like 'Private%' and dx in (${ownDx})${overallUnion(ou.id)}
\`\`\`

\`\`\`sql reporting
${reportingQuery(ou.id)}
\`\`\`

\`\`\`sql benchmark
${benchmark}
\`\`\`

<ScopeNav crumbs={${JSON.stringify(crumbs)}} />

<ControlBar />

<ReportStats data={reporting} />

<KpiRow total={kpis_total} pub={kpis_public} priv={kpis_private}
  kpis={[
    {dx:'${I.enrol}',title:'Learners',fmt:'int',icon:'users'},
    {dx:'${I.teachers}',title:'Teachers',fmt:'int',icon:'chalkboard-user'},
    {dx:'${I.classrooms}',title:'Classrooms',fmt:'int',icon:'school'},
    {dx:'${I.toilets}',title:'Toilets',fmt:'int',icon:'toilet'}
  ]} />

## ${benchHeading}

<Benchmark rows={benchmark} unitLabel="${unitLabel}" stateLabel="${stateLabel}" />
`;
}

// Charts + (optionally) the children choropleth, in a responsive 2-col grid. SQL blocks go
// BEFORE the <Grid> (mdsvex gotcha). withMap true on branch pages; childLevel labels the map.
function chartsSection(ou, withMap, geoUrl, childLinkPrefix, childLevel) {
  const W = `f.ou = '${ou.id}' and f.periodType = 'YEARLY' and f.pe = '2024'`;
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
with lv(level, ord) as (values ${LEVEL_VALUES}), sx(sex) as (values ('Male'),('Female'))
select lv.level as level, sx.sex as sex, coalesce(agg.learners, 0) as learners, lv.ord as ord
from lv cross join sx left join (
  select case f.dx ${SEX_LABELS} end as level, case f.dx ${SEX_SEX} end as sex, sum(f.value) as learners
  from ${M.src} f where ${W} ${M.cat} and f.dx in (${SEX_IDS}) group by 1, 2
) agg on agg.level = lv.level and agg.sex = sx.sex order by lv.ord, sx.sex desc
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
where o.parent_id = '${ou.id}' and f.dx = '${I.enrol}' and f.periodType = 'YEARLY' and f.pe = '2024' ${M.cat}
\`\`\``;
  const q3 = (fn) => MODES3.map(fn).join('\n\n');
  return `
${q3(enrolQ)}

${q3(sexQ)}

${q3(schoolsQ)}

\`\`\`sql ownership_enrol
select category_name, value from census.fact_ownership
where ou = '${ou.id}' and dx = '${I.enrol}' and periodType = 'YEARLY' and pe = '2024'
\`\`\`

\`\`\`sql schools_ownership
select 'Public' as category_name, sum(case when dx = '${SCHOOL_PUBLIC}' then value else 0 end) as value
from census.fact where ou = '${ou.id}' and periodType = 'YEARLY' and pe = '2024'
union all
select 'Private', sum(case when dx = '${SCHOOL_PRIVATE}' then value else 0 end)
from census.fact where ou = '${ou.id}' and periodType = 'YEARLY' and pe = '2024'
\`\`\`
${withMap ? `
${q3(mapQ)}
` : ''}
<!-- Value axes use full numbers (yFmt="#,##0"), not Evidence's default "k" abbreviation:
     UAT found "k" wasn't understood, and a fixed unit label ("thousands") can't fit charts
     that span ~400x in magnitude on one page (learners ~30,000,000 vs schools ~80,000) or
     across pages (Federal millions → small-LGA hundreds). Full numbers auto-scale per chart
     and match the rest of the portal (map legend, KPI tiles, donut labels, compare table).
     Tradeoff: the wider labels mean ECharts thins the value-axis ticks on narrow screens and
     the max tick can clip slightly — accepted; readability of the unit beats tick density. -->
<Grid cols=2>
${withMap ? `  <OwnershipSelect total={children_map_total} pub={children_map_public} priv={children_map_private} let:data>
    <AreaMap data={data} geoJsonUrl="${geoUrl}" geoId="id" areaCol="id" value="learners" link="link" title="Learners by ${childLevel} · Tap to Explore" tooltip={[{id:'name',showColumnTitles:false},{id:'learners',fmt:'#,##0'}]} height={300} basemap={"${BASEMAP_URL}"} />
  </OwnershipSelect>\n` : ''}  <OwnershipSelect total={enrol_total} pub={enrol_public} priv={enrol_private} let:data>
    <BarChart data={data} x=level y=enrolment yFmt="#,##0" title="Learners by Education Level" swapXY=true sort=false />
  </OwnershipSelect>
  <OwnershipSelect total={sex_total} pub={sex_public} priv={sex_private} let:data>
    <BarChart data={data} x=level y=learners series=sex type=grouped yFmt="#,##0" title="Learners by Gender & Level" swapXY=true sort=false />
  </OwnershipSelect>
  <BarChart data={schools_public} x=label y=value yFmt="#,##0" title="Public Schools by Level" swapXY=true sort=false emptySet=pass emptyMessage="No data available at this level" />
  <OwnershipDonut data={ownership_enrol} title="Learners by Ownership" />
  <OwnershipDonut data={schools_ownership} title="Schools by Ownership" />
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
  max(case when f.dx = 'YN2pzjKpi3l' then f.value end) as lc,
  max(case when f.dx = 'uWkPykwyYn2' then f.value end) as ltoilet,
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
from census.ou o left join ${src} f on f.ou = o.id and f.periodType = 'YEARLY' and f.pe = '2024' ${filt}
where o.parent_id = '${ou.id}' group by o.name, o.id order by ou_name
\`\`\`
`;
  };
  const TABS = [{ key: 'total', label: 'Total', id: '' }, ...SCHOOL_TYPE_TABS];
  const queries = TABS.flatMap((t) => ['total', 'public', 'private'].map((m) => query(t, m))).join('');
  const tabs = TABS.map((t) => `{label:'${t.label}',total:lvl_${t.key}_total,public:lvl_${t.key}_public,private:lvl_${t.key}_private}`).join(',');
  return chartsSection(ou, true, geoUrl, childLinkPrefix, childLevel) + `
<LgaPrefetch />

${queries}
## Indicators by ${childLevel}

<ScrollX>
<CompareTable tabs={[${tabs}]}
  columns={[{key:'enrolment',label:'Learners'},{key:'lt',label:'Learner:Teacher'},{key:'lc',label:'Learner:Classroom'},{key:'ltoilet',label:'Learner:Toilet'},{key:'female_l',label:'Female Learners %'},{key:'femt',label:'Female Teachers %'},{key:'special',label:'Special Needs'}]} />
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
title: "Local Government Area Education Statistics 2024 — Annual School Census | Nigeria DNEMIS"
description: "Local Government Area education statistics from Nigeria's 2024 Annual School Census: schools, learners, teachers, classrooms and key indicators — from the Federal Ministry of Education (DNEMIS)."
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
where ou = ${ID} and periodType = 'YEARLY' and pe = '2024' and dx in (${lit([...TOGGLE, ...OVERALL])})
\`\`\`

\`\`\`sql kpis_public
select dx, value from census.fact_ownership
where ou = ${ID} and periodType = 'YEARLY' and pe = '2024' and category_name like 'Public%' and dx in (${ownDx})${overallUnion(P)}
\`\`\`

\`\`\`sql kpis_private
select dx, value from census.fact_ownership
where ou = ${ID} and periodType = 'YEARLY' and pe = '2024' and category_name like 'Private%' and dx in (${ownDx})${overallUnion(P)}
\`\`\`

\`\`\`sql reporting
${reportingQuery(P)}
\`\`\`

\`\`\`sql benchmark
${benchmark}
\`\`\`

<ScopeNav crumbs={crumbs_q} />

<ControlBar />

<ReportStats data={reporting} />

<KpiRow total={kpis_total} pub={kpis_public} priv={kpis_private}
  kpis={[
    {dx:'${I.enrol}',title:'Learners',fmt:'int',icon:'users'},
    {dx:'${I.teachers}',title:'Teachers',fmt:'int',icon:'chalkboard-user'},
    {dx:'${I.classrooms}',title:'Classrooms',fmt:'int',icon:'school'},
    {dx:'${I.toilets}',title:'Toilets',fmt:'int',icon:'toilet'}
  ]} />

## Key Indicators vs State & Federal

<Benchmark rows={benchmark} unitLabel={crumbs_q?.[2]?.name ?? ''} stateLabel={crumbs_q?.[1]?.name ?? ''} />
` + chartsSection({ id: P }, false) + `
## Enrolment by Education Level

<OwnershipSelect total={enrol_total} pub={enrol_public} priv={enrol_private} let:data>
<DataTable data={data}>
  <Column id=level title="Education Level" />
  <Column id=enrolment title="Enrolment (2024)" fmt="#,##0" />
</DataTable>
</OwnershipSelect>
`;
}
