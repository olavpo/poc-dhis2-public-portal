---
title: Org-unit profile
---

Pick an org unit to see its latest annual ANC indicators and monthly coverage
trend. This page is **interactive** — its queries reference a `<Dropdown>` input,
so they run client-side in DuckDB-WASM (the engine loads on first use).

You can also deep-link straight to a profile, e.g. `?ou=O6uvpzGd5pu` (Bo).

```sql ou_options
select id as value, name as label from anc.ou where level in (2,3) order by name
```
<Dropdown data={ou_options} name=ou value=value label=label title="Org unit" />

## Latest annual indicators

```sql profile_indicators
select d.name as indicator, f.value, f.pe
from anc.fact f join anc.dx d on f.dx=d.id
where f.ou = '${inputs.ou.value}' and f.periodType='YEARLY'
  and f.pe = (select max(pe) from anc.fact where periodType='YEARLY')
order by d.name
```
<DataTable data={profile_indicators} />

## Coverage trend

```sql profile_trend
select d.name as indicator, p.startDate as month, f.value
from anc.fact f join anc.dx d on f.dx=d.id join anc.pe p on f.pe=p.period
where f.ou = '${inputs.ou.value}' and f.periodType='MONTHLY'
  and f.dx in ('Uvn6LCg7dVU','sB79w2hiLp8') order by p.startDate
```
<LineChart data={profile_trend} x=month y=value series=indicator title="Coverage trend" />

<OrgUnitProfile />
