# ANC reference example — preserved page cookbook

This repo's `master` shipped one worked example: an **Antenatal Care** portal built from
the public DHIS2 Sierra Leone demo (`play.im.dhis2.org`), replicating dashboard
`nghVC4wtyzi`. The live example pages were removed when the project pivoted to a
from-scratch portal (branch `emis-pp`), but the **patterns are worth keeping** — this doc
preserves the full source of the three example pages plus the profile-component wiring, so
you can copy the techniques into a new portal.

The example data came from these DHIS2 `dx` ids (see `scripts/dhis2-extract/config/anc.yaml`,
kept as a template): ANC 1/2/3 Coverage (`Uvn6LCg7dVU`, `OdiHJayrsKo`, `sB79w2hiLp8`),
ANC 1st–4th visits (`fbfJHSPpUQD`, `cYeuwXTCPkU`, `Jtf34kNZhzP`, `hfdmMSPBgLG`), IPT2
(`c8fABiNpT0B`), LLITN (`Tt5TAvdfdVK`); national root `ImspTQPwCqd`. The org-unit levels
were 1 National / 2 District / 3 Chiefdom / 4 Facility.

Read this alongside the **"Conventions & gotchas"** section of `CLAUDE.md` (`AGENTS.md`) —
that section is the normative rule list; this doc is the worked illustration of each rule.

---

## 1. Baked overview page (no client engine)

`pages/anc/index.md` — every query is static (no `${inputs.x}`), so Evidence executes it at
build time and the page renders **without downloading DuckDB-WASM**. This is the default you
should reach for. Note the indicator rule: national coverage is read from the single
DHIS2-supplied national/yearly row (`ou='ImspTQPwCqd'`, `periodType='YEARLY'`) — never
re-aggregated.

````markdown
---
title: Antenatal Care — Sierra Leone
---

```sql latest_year
select max(year) as y from anc.pe where periodType = 'YEARLY'
```

```sql national_coverage
select d.name as indicator, f.value
from anc.fact f
join anc.dx d on f.dx = d.id
where f.ou = 'ImspTQPwCqd' and f.periodType = 'YEARLY'
  and f.pe = (select max(pe) from anc.fact where periodType = 'YEARLY')
  and f.dx in ('Uvn6LCg7dVU','OdiHJayrsKo','sB79w2hiLp8')
order by d.name
```

<Grid cols=3>
  <BigValue data={national_coverage.filter(r => r.indicator === 'ANC 1 Coverage')} value=value title="ANC 1 Coverage" fmt="num1" />
  <BigValue data={national_coverage.filter(r => r.indicator === 'ANC 2 Coverage')} value=value title="ANC 2 Coverage" fmt="num1" />
  <BigValue data={national_coverage.filter(r => r.indicator === 'ANC 3 Coverage')} value=value title="ANC 3 Coverage" fmt="num1" />
</Grid>

```sql coverage_by_district
select o.name as district, f.value
from anc.fact f
join anc.ou o on f.ou = o.id
where f.dx = 'Uvn6LCg7dVU' and f.periodType = 'YEARLY'
  and f.pe = (select max(pe) from anc.fact where periodType = 'YEARLY')
  and o.level = 2
order by f.value desc
```

<BarChart data={coverage_by_district} x=district y=value title="ANC 1 Coverage by district (latest year)" swapXY=true />

```sql national_trend
select p.startDate as month, f.value
from anc.fact f
join anc.pe p on f.pe = p.period
where f.dx = 'Uvn6LCg7dVU' and f.ou = 'ImspTQPwCqd' and f.periodType = 'MONTHLY'
order by p.startDate
```

<LineChart data={national_trend} x=month y=value title="ANC 1 Coverage — national monthly trend" />

[Explore the full dashboard →](/anc/dashboard)  ·  [Org-unit profiles →](/anc/profile)
````

**Lessons shown:** baked-by-default; every fact query filters `periodType`; indicators read
at the DHIS2-supplied level/period, never `avg()`/`sum()`-ed.

---

## 2. Interactive dashboard (client-side engine)

`pages/anc/dashboard.md` — two `<Dropdown>`s (root org unit + reference year) feed
`${inputs.root.value}` / `${inputs.refyear.value}` into every query, so the whole page runs
client-side in DuckDB-WASM and recomputes on selection. This is the full 11-item dashboard
replica and demonstrates nearly every gotcha at once.

Key techniques:
- **Year options sourced from `fact`, kept as TEXT** so the string `defaultValue="2026"`
  type-matches (an input that never initialises hangs forever with no error).
- **Queries defined *before* each `<Grid>`**, only chart components inside it (a `sql` block
  inside `<Grid>` eats a cell).
- **Descendant-or-self scoping** via the self-inclusive `ou.path`:
  `('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%'`.
- **Indicators read at a single DHIS2 `ou`/`pe` cell** (latest quarter / reference year);
  **data-element counts** legitimately `sum()`-ed across categories.
- **Long category chart** (chiefdoms) rendered as raw `<ECharts>` with fixed height + a
  `dataZoom` slider — an Evidence `BarChart` would grow unbounded.
- **Choropleth deep-links into the profile** via a computed `profile_url` column + the map's
  `link` prop.
- **`o.lng is not null`** for point maps (empty CSV cells are typed DOUBLE → NULL, so `<> ''`
  errors).

````markdown
---
title: Antenatal Care dashboard
---

```sql root_options
select id, name, level from anc.ou where level in (1,2) order by level, name
```

```sql year_options
-- Source years from actual fact data (not anc.pe), so the selector never offers empty years.
-- Keep yr as TEXT so it matches the string defaultValue (Evidence parses defaultValue as a string).
select distinct substr(pe,1,4) as yr from anc.fact where periodType='YEARLY' order by yr desc
```

<Dropdown data={root_options} name=root value=id label=name title="Root org unit" defaultValue="ImspTQPwCqd" />
<Dropdown data={year_options} name=refyear value=yr title="Reference year" defaultValue="2026" />

*ANC Overview — coverage and visits for the selected root unit and reference year. Use the icons on each chart to switch table/chart views.*

## Coverage

```sql coverage_quarterly
-- Item 2: ANC 1 & 2 coverage by district — the latest quarter of the reference year, read
-- DIRECTLY from DHIS2's quarterly value. We do NOT aggregate a rate in SQL: each value is a
-- single (dx, ou, quarter) cell that DHIS2 already aggregated correctly. See AGENTS.md.
select o.name as district, d.name as indicator, f.value as value
from anc.fact f
join anc.ou o on f.ou = o.id
join anc.dx d on f.dx = d.id
where f.dx in ('Uvn6LCg7dVU','OdiHJayrsKo')
  and f.periodType = 'QUARTERLY'
  and f.pe = (select max(pe) from anc.fact
              where periodType='QUARTERLY' and cast(substr(pe,1,4) as integer) = ${inputs.refyear.value})
  and o.level = 2
  and ( o.id = '${inputs.root.value}'
        or ('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%' )
order by o.name, d.name
```

```sql coverage_annual
-- Item 3: ANC 3 coverage by district for the reference year — DHIS2's YEARLY value directly.
select o.name as district, f.value as value
from anc.fact f
join anc.ou o on f.ou = o.id
where f.dx = 'sB79w2hiLp8'
  and f.periodType = 'YEARLY'
  and f.pe = '${inputs.refyear.value}'
  and o.level = 2
  and ( o.id = '${inputs.root.value}'
        or ('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%' )
order by f.value desc
```

```sql coverage_yoy
-- Item 4: ANC 1 coverage at the root unit, monthly, one line per year (year-over-year).
select p.month as month, cast(p.year as varchar) as year, f.value as value
from anc.fact f
join anc.pe p on f.pe = p.period
where f.dx = 'Uvn6LCg7dVU'
  and f.ou = '${inputs.root.value}'
  and f.periodType = 'MONTHLY'
order by p.year, p.month
```

```sql coverage_chiefdoms
-- Item 5: ANC 1 coverage by chiefdom (level 3), reference year (descendant-or-self of root).
select o.name as chiefdom, f.value as value
from anc.fact f
join anc.ou o on f.ou = o.id
where f.dx = 'Uvn6LCg7dVU'
  and f.periodType = 'YEARLY'
  and f.pe = '${inputs.refyear.value}'
  and o.level = 3
  and ( o.id = '${inputs.root.value}'
        or ('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%' )
order by f.value desc
```

<Grid cols=2>
  <BarChart data={coverage_quarterly} x=district y=value series=indicator title="ANC 1 & 2 coverage by district (latest quarter)" swapXY=true />
  <BarChart data={coverage_annual} x=district y=value title="ANC 3 coverage by district (reference year)" swapXY=true />
  <LineChart data={coverage_yoy} x=month y=value series=year title="ANC 1 coverage — year over year (root unit)" chartAreaHeight={363} />
  <ECharts height="420px" config={{
    title: { text: 'ANC 1 coverage by chiefdom (reference year)', left: 'center', textStyle: { fontSize: 14, fontWeight: 'bold' } },
    grid: { left: 8, right: 56, top: 40, bottom: 16, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}: {c}' },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', inverse: true, data: [...coverage_chiefdoms].map(r => r.chiefdom) },
    dataZoom: [
      { type: 'slider', yAxisIndex: 0, startValue: 0, endValue: 13, right: 8, width: 12 },
      { type: 'inside', yAxisIndex: 0, startValue: 0, endValue: 13 }
    ],
    series: [{ type: 'bar', name: 'ANC 1 Coverage', color: '#236aa4',
      data: [...coverage_chiefdoms].map(r => r.value) }]
  }} />
</Grid>

## Visits

```sql visits_cumulative
-- Item 6: ANC 1st visit — cumulative monthly total per district over last 12 months.
select district, month, sum(value) over (partition by district order by startDate) as cum
from (
  select o.name as district, p.startDate as month, p.startDate as startDate, f.value
  from anc.fact f
  join anc.ou o on f.ou = o.id
  join anc.pe p on f.pe = p.period
  where f.dx = 'fbfJHSPpUQD'
    and f.periodType = 'MONTHLY'
    and p.year in (${inputs.refyear.value}, ${inputs.refyear.value}-1)
    and o.level = 2
    and ( o.id = '${inputs.root.value}'
          or ('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%' )
  qualify dense_rank() over (order by startDate desc) <= 12
) t
order by district, month
```

```sql visits_facility_type_pie
-- Item 7: ANC 4th+ visits at the root unit, reference year, split by facility type (pie).
select category_name, value
from anc.fact_facility_type
where dx = 'hfdmMSPBgLG'
  and periodType = 'YEARLY'
  and pe = '${inputs.refyear.value}'
  and ou = '${inputs.root.value}'
order by value desc
```

```sql visits_3rd_facility_type
-- Item 8: ANC 3rd visit at the root unit, monthly, 100%-stacked by facility type.
select p.startDate as month, f.category_name as category_name, sum(f.value) as value
from anc.fact_facility_type f
join anc.pe p on f.pe = p.period
where f.dx = 'Jtf34kNZhzP'
  and f.periodType = 'MONTHLY'
  and f.ou = '${inputs.root.value}'
  and p.year in (${inputs.refyear.value}, ${inputs.refyear.value}-1)
group by p.startDate, f.category_name
order by p.startDate, f.category_name
```

```sql visits_fixed_outreach
-- Item 9: 4 visit indicators at the root unit, reference year, 100%-stacked by Fixed vs Outreach.
select d.name as indicator, f.category_name as category_name, sum(f.value) as value
from anc.fact_fixed_outreach f
join anc.dx d on f.dx = d.id
where f.dx in ('fbfJHSPpUQD','cYeuwXTCPkU','Jtf34kNZhzP','hfdmMSPBgLG')
  and f.periodType = 'YEARLY'
  and f.pe = '${inputs.refyear.value}'
  and f.ou = '${inputs.root.value}'
group by d.name, f.category_name
order by d.name, f.category_name
```

<Grid cols=2>
  <LineChart data={visits_cumulative} x=month y=cum series=district title="ANC 1st visit — cumulative (last 12 months)" />
  <ECharts config={{
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0 },
    title: { text: 'ANC 4th+ visits by facility type', left: 'center', textStyle: { fontSize: 14 } },
    series: [{ type: 'pie', radius: '60%', center: ['50%', '50%'],
      data: [...visits_facility_type_pie].map(r => ({ name: r.category_name, value: r.value })) }]
  }} />
  <BarChart data={visits_3rd_facility_type} x=month y=value series=category_name type=stacked100 title="ANC 3rd visit by facility type (monthly, % share)" />
  <BarChart data={visits_fixed_outreach} x=indicator y=value series=category_name type=stacked100 title="ANC visits: fixed vs outreach (reference year)" swapXY=true />
</Grid>

## Maps

```sql ipt2_map
-- Item 10: ANC IPT 2 coverage choropleth by chiefdom (level 3); profile_url deep-links into the profile page.
select o.id, o.name, f.value, '/anc/profile?ou=' || o.id as profile_url
from anc.fact f join anc.ou o on f.ou = o.id
where f.dx = 'c8fABiNpT0B' and f.periodType = 'YEARLY' and f.pe = '${inputs.refyear.value}'
  and o.level = 3
  and ( o.id = '${inputs.root.value}'
        or ('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%' )
```

```sql llitn_districts
-- Item 11a: ANC LLITN coverage choropleth by district (level 2).
select o.id, o.name, f.value from anc.fact f join anc.ou o on f.ou=o.id
where f.dx='Tt5TAvdfdVK' and f.periodType='YEARLY' and f.pe='${inputs.refyear.value}'
  and o.level=2
  and ( o.id = '${inputs.root.value}'
        or ('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%' )
```

```sql llitn_facilities
-- Item 11b: ANC LLITN coverage by facility (level 4 points). lng/lat are DOUBLE (polygons → NULL).
select o.name, o.lng, o.lat, f.value from anc.fact f join anc.ou o on f.ou=o.id
where f.dx='Tt5TAvdfdVK' and f.periodType='YEARLY' and f.pe='${inputs.refyear.value}'
  and o.level=4 and o.lng is not null
  and ( o.id = '${inputs.root.value}'
        or ('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%' )
```

<Grid cols=2>
  <AreaMap data={ipt2_map} geoJsonUrl="/anc.geojson" geoId="id" areaCol="id" value="value"
    title="ANC IPT 2 Coverage (chiefdoms)" tooltip={[{id:'name',showColumnTitles:false},{id:'value',fmt:'num1'}]}
    link="profile_url" height={400} />
  <AreaMap data={llitn_districts} geoJsonUrl="/anc.geojson" geoId="id" areaCol="id" value="value"
    title="ANC LLITN coverage — districts" tooltip={[{id:'name',showColumnTitles:false},{id:'value',fmt:'num1'}]} height={400} />
</Grid>

<PointMap data={llitn_facilities} lat="lat" long="lng" value="value" pointName="name"
  title="ANC LLITN coverage — facilities" height={420} />
````

---

## 3. On-demand profile drill-down (deep-linkable component)

`pages/anc/profile.md` was a thin host for the `<OrgUnitProfile />` component (kept in
`evidence/components/OrgUnitProfile.svelte`). The page:

````markdown
---
title: Org-unit profile
---

Browse any district or chiefdom, or arrive here from a map — clicking a unit deep-links
to its profile (e.g. `?ou=O6uvpzGd5pu` for Bo). The profile is computed live in your
browser from the local extract, so it works without any server round-trip.

<OrgUnitProfile />
````

The component (still in the repo) demonstrates the **custom-component query pattern**:
- Query via **`$page.data.__db.query`**, not the raw client-duckdb `query()` — `__db.query`
  awaits `database_initialization` (which registers the manifest's parquet tables);
  the raw engine query skips that and times out on a page with no other queries.
- Gate all engine/`$page.url` access behind **`onMount`** — `$page.url.searchParams` throws
  during prerender and the engine only exists in the browser.
- Initialise selection from `?ou=` (deep link) → national → first option.
- Guard every interpolated id with a `^[A-Za-z0-9]+$` check before putting it in SQL.

> **Note for reuse:** `OrgUnitProfile.svelte` is currently hard-coded to the `anc.*` tables
> and ANC specifics (the `coverage` → percentage heuristic, the National/District/Chiefdom/
> Facility level names). Adapt those to your portal's source tables and indicator semantics.
> The *structure* (deep-link init, `__db.query`, onMount gating, rate-vs-count split) is the
> reusable part.

---

## Where the rules live

The full normative list of papercuts (layout, input initialisation, `periodType`,
descendant-or-self scoping, indicator non-re-aggregation, the extractor's
organisationUnits-vs-geoFeatures split, build/serve precompression) is in the
**"Conventions & gotchas"** section of `CLAUDE.md` / `AGENTS.md`. The extractor itself and
its worked config (`scripts/dhis2-extract/config/anc.yaml`) remain in the repo as the
template to copy for a new portal.
