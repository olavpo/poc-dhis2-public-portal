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

<!--
NOTE ON LAYOUT: keep ```sql``` query blocks OUTSIDE <Grid>. In mdsvex each sql block renders
an (invisible) container element; if it sits inside <Grid> it consumes a grid cell, pushing the
chart into the next column and leaving a blank cell. So: define queries first, then put ONLY the
chart components inside <Grid>.

Root-OU scope (descendant-or-self). The extractor's `path` is the DHIS2 path
("/root/.../self", includes self); match on `/`-segment boundaries:
  and o.level = N
  and ( o.id = '${inputs.root.value}'
        or ('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%' )
-->

## Coverage

```sql coverage_quarterly
-- Item 2: ANC 1 & 2 coverage by district, avg of last 4 quarters (descendant-or-self, level 2).
-- NOTE: ANC*Coverage are INDICATORS (rates) — never sum() them across periods (4×~120% = 480%).
-- avg() across time is itself only an approximation; the rigorous aggregate would recompute the
-- indicator from summed numerators/denominators (i.e. the underlying data elements). See AGENTS.md.
select o.name as district, d.name as indicator, avg(f.value) as value
from anc.fact f
join anc.ou o on f.ou = o.id
join anc.pe p on f.pe = p.period
join anc.dx d on f.dx = d.id
where f.dx in ('Uvn6LCg7dVU','OdiHJayrsKo')
  and f.periodType = 'QUARTERLY'
  and p.year in (${inputs.refyear.value}, ${inputs.refyear.value}-1)
  and o.level = 2
  and ( o.id = '${inputs.root.value}'
        or ('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%' )
  and f.pe in (
    select pe from (
      select distinct pe from anc.fact
      where periodType = 'QUARTERLY'
        and cast(substr(pe,1,4) as integer) in (${inputs.refyear.value}, ${inputs.refyear.value}-1)
      order by pe desc limit 4
    )
  )
group by o.name, d.name
order by o.name, d.name
```

```sql coverage_avg_monthly
-- Item 3: ANC 3 coverage — average over last 12 months by district (descendant-or-self, level 2).
select district, avg(value) as value
from (
  select o.name as district, p.startDate as startDate, f.value
  from anc.fact f
  join anc.ou o on f.ou = o.id
  join anc.pe p on f.pe = p.period
  where f.dx = 'sB79w2hiLp8'
    and f.periodType = 'MONTHLY'
    and p.year in (${inputs.refyear.value}, ${inputs.refyear.value}-1)
    and o.level = 2
    and ( o.id = '${inputs.root.value}'
          or ('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%' )
  qualify dense_rank() over (order by startDate desc) <= 12
) t
group by district
order by value desc
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
  <BarChart data={coverage_quarterly} x=district y=value series=indicator title="ANC 1 & 2 coverage by district (avg, last 4 quarters)" swapXY=true />
  <BarChart data={coverage_avg_monthly} x=district y=value title="ANC 3 coverage — avg over last 12 months" swapXY=true />
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
