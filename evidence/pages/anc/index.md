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
