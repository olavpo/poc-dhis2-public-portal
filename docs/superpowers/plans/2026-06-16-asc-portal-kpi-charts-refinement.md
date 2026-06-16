# ASC Portal — KPI & Charts Refinement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the ASC portal's KPI cards + charts: drop all emoji (→ Font Awesome), switch the chart palette to Nigeria-green, rework the KPI tiles, add three baked charts (enrolment by level, learners by sex & level, public/private donut), keep the map at half-width, and make every page a usable responsive layout.

**Architecture:** Pure presentation layer over the already-built, fully-baked portal — no data/extractor/generator changes, no client engine. Changes touch the Evidence theme config, the layout patch, two existing presentational components, one new donut component, and the page template/generator markup.

**Tech Stack:** Evidence (SvelteKit/mdsvex + ECharts), Svelte presentational components (data via props, never `query()`), DuckDB (build-time only), Font Awesome (already loaded via the layout patch).

**Spec:** `docs/superpowers/specs/2026-06-16-asc-portal-kpi-charts-refinement-design.md`

---

## Conventions / ground rules (read once)

- **Branch `emis-pp`.** Build is memory-heavy: **stop the sibling DHIS2 instances first** if a build OOMs (`curl -s -X POST -H "Authorization: Bearer $DHIS2_BROKER_TOKEN" "$DHIS2_BROKER_URL/instances/agent-asc-ind/stop"`); the build needs no live instance (data is already extracted). Build with `NODE_OPTIONS=--max-old-space-size=3072 npm run build`.
- **Everything stays baked:** all queries use a literal OU id + `pe='2024'`, no `${inputs}`. Components are presentational (props only, no `query()`).
- **mdsvex gotchas (CLAUDE.md):** ```` ```sql ```` blocks and raw `<ECharts>` islands must stay OUTSIDE `<Grid>` cells — put charts in `<Grid>` only as components or Evidence chart tags; wrap any raw ECharts/scroll container in a `.svelte` component. **Functions can't be passed through an mdsvex array prop** — pass strings (the `icon` prop is a string FA class, exactly like `fmt`).
- **No live preview during build** — the visual companion holds port 49242. To screenshot, stop the companion or just run the portal server after deploy.
- Verify with: `npm test` (39 tests stay green), a build, and the greps/screenshots in the final task.

## File structure

| File | Change |
|---|---|
| `evidence/evidence.config.yaml` | Modify — green `colorPalettes.default` + `colorScales.default`. |
| `evidence/scripts/patch-evidence.mjs` | Modify — crest emoji → Font Awesome icon (and sync the live layout). |
| `evidence/components/SupersetBigNumber.svelte` | Modify — add `icon` (string FA class) prop, left-accent card styling, remove the sparkline entirely. |
| `evidence/components/KpiRow.svelte` | Modify — carry `icon` per KPI; green toggle; responsive grid. |
| `evidence/components/OwnershipDonut.svelte` | Create — presentational ECharts donut (Public/Private). |
| `evidence/components/ScrollX.svelte` | Create — tiny horizontal-scroll wrapper for the compare table on mobile. |
| `scripts/asc-pages/template.mjs` | Modify — KPI `icon`s; new chart queries + markup in a responsive `<Grid cols=2>` with the half-width map; wrap CompareTable in `<ScrollX>`. |

## Indicator ids (already in `census.fact` / `fact_ownership`)

GEN: enrol `jwjKmtVK2wj`, teachers `Dw7f4gs9RcS`, PTR `eie1tIO5HtX`, female% `Nc9bgbCb6eO`.
Per level **enrol / boys / girls**:
- Pre-Primary `DiEriq7urPG` / `L7wp6IPJGhV` / `NnvopxD62MT`
- Primary `d8qCE7aPWtD` / `yjH9LAuAMrk` / `Qwjg1QG0Hws`
- JSS `wDf8ZOwWgib` / `gAfSf7sfxib` / `uSfibhbGRT1`
- SSS `IYNEmLyFgbe` / `i8dMJSyq5hO` / `vZA5RaodnuH`
- ANFE `g1ozV2n8G88` / `kxJmBoDtD9t` / `VzPMQzTjenn`

---

## Task 1: Nigeria-green chart palette

**Files:** Modify `evidence/evidence.config.yaml`

- [ ] **Step 1: Replace `colorPalettes.default`** (light AND dark identical) with:

```yaml
  colorPalettes:
    # Nigeria-green-anchored categorical palette (matches the DNEMIS chrome).
    default:
      light: ["#1a9c5b", "#f4a261", "#2a6f97", "#e76f51", "#8a5a83", "#e9c46a", "#0e7c4a", "#7fc99b"]
      dark:  ["#1a9c5b", "#f4a261", "#2a6f97", "#e76f51", "#8a5a83", "#e9c46a", "#0e7c4a", "#7fc99b"]
```

- [ ] **Step 2: Replace `colorScales.default`** (light AND dark) with a green sequential scale:

```yaml
  colorScales:
    default:
      light: ["#e6f4ec", "#0a3d2c"]
      dark:  ["#e6f4ec", "#0a3d2c"]
```

- [ ] **Step 3: Set `colors.primary`** light+dark to `"#1a9c5b"` (replaces the cyan `#1FA8C9`).

- [ ] **Step 4: Commit**

```bash
git add evidence/evidence.config.yaml
git commit -m "feat(theme): Nigeria-green chart palette + choropleth scale"
```

## Task 2: Remove the crest emoji (Font Awesome)

**Files:** Modify `evidence/scripts/patch-evidence.mjs` + the live `evidence/node_modules/@evidence-dev/evidence/template/src/pages/+layout.svelte`

- [ ] **Step 1:** In `patch-evidence.mjs`, in `DNEMIS_NAV`, replace `<span class="crest">🇳🇬</span>` with `<span class="crest"><i class="fa-solid fa-landmark"></i></span>`.

- [ ] **Step 2:** In `DNEMIS_STYLE`, the `.crest` rule already centers content; ensure it sizes the icon: append to `.crest` `font-size: 18px;` is fine (icon inherits). No other change.

- [ ] **Step 3: Reset + re-patch the live layout so it regenerates from the updated patch** (the patch is idempotent via `to`-match; the live file must contain the new string):

```bash
cd /poc-public-portal
cat > evidence/node_modules/@evidence-dev/evidence/template/src/pages/+layout.svelte <<'EOF'
<script>
	import '@evidence-dev/tailwind/fonts.css';
	import '../app.css';
	import { EvidenceDefaultLayout } from '@evidence-dev/core-components';
	export let data;
</script>

<EvidenceDefaultLayout {data}>
	<slot slot="content" />
</EvidenceDefaultLayout>
EOF
npm run patch
```

Expected: 5 `[ok]`/`[skip]` lines; the regenerated layout contains `fa-landmark` and **no** `🇳🇬`.

- [ ] **Step 4: Verify no emoji in the patch source**

Run: `grep -nP "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{1F1E6}-\x{1F1FF}]" evidence/scripts/patch-evidence.mjs || echo "no emoji"`
Expected: `no emoji`.

- [ ] **Step 5: Commit**

```bash
git add evidence/scripts/patch-evidence.mjs
git commit -m "feat(nav): replace flag emoji crest with Font Awesome icon"
```

## Task 3: KPI tile — icon prop, accent styling, no sparkline

**Files:** Modify `evidence/components/SupersetBigNumber.svelte`

- [ ] **Step 1: Replace the whole file** with (adds `icon`, drops `trend`/sparkline, left-accent card):

```svelte
<script>
	// Presentational KPI tile (Nigeria-green). Data is a baked query result passed as a
	// prop; never calls query(). `icon` is a Font Awesome class string (no emoji).
	export let data = [];   // rows; we read the latest as the headline
	export let value;       // column name for the metric
	export let title = '';
	export let icon = '';   // e.g. 'fa-solid fa-users' (string — mdsvex array props can't carry fns)
	export let fmt = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
	$: headline = data.length ? data[data.length - 1][value] : null;
</script>

<div class="kpi">
	<div class="lab">{#if icon}<i class={icon}></i>{/if}<span>{title}</span></div>
	<div class="val">{headline == null ? '—' : fmt(headline)}</div>
</div>

<style>
	.kpi { background: #fff; border: 1px solid #e3e8e5; border-left: 4px solid #1a9c5b; border-radius: 8px; padding: 14px 16px; min-height: 84px; }
	.lab { font-size: 12px; color: #6b7872; font-weight: 600; display: flex; align-items: center; gap: 7px; }
	.lab i { color: #1a9c5b; font-size: 13px; }
	.val { font-size: 30px; font-weight: 800; letter-spacing: -.5px; margin-top: 8px; color: #0a3d2c; line-height: 1.1; }
	:global(.dark) .kpi { background: #18181b; border-color: #3f3f46; border-left-color: #1a9c5b; }
	:global(.dark) .val { color: #e4e4e7; }
</style>
```

- [ ] **Step 2: Confirm no other consumer passes `trend`**

Run: `grep -rn "trend=" scripts/asc-pages evidence/components`
Expected: no matches (only `KpiRow` uses the tile; it doesn't pass `trend`).

- [ ] **Step 3: Commit**

```bash
git add evidence/components/SupersetBigNumber.svelte
git commit -m "feat(kpi): icon prop + green accent card; drop sparkline"
```

## Task 4: KpiRow — carry icons, green toggle, responsive

**Files:** Modify `evidence/components/KpiRow.svelte`

- [ ] **Step 1:** In the `<script>`, change the `shown` mapping to forward `icon`:

```js
	$: shown = kpis.map((k) => ({ title: k.title, icon: k.icon || '', fmt: FMT[k.fmt] || FMT.int, data: rows.filter((r) => r.dx === k.dx) }));
```

- [ ] **Step 2:** In the markup, pass the icon:

```svelte
	{#each shown as k}
		<SupersetBigNumber title={k.title} icon={k.icon} data={k.data} value="value" fmt={k.fmt} />
	{/each}
```

- [ ] **Step 3:** Confirm the toggle `.seg button.on` uses green (`#1FA8C9` → `#1a9c5b`) and the `.kpis` grid is responsive. Update the `<style>`:

```css
	.seg button.on { background: #1a9c5b; color: #fff; }
	.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
	@media (max-width: 820px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
	@media (max-width: 480px) { .kpis { grid-template-columns: 1fr; } }
```
(and the dark `.seg button.on` likewise `#1a9c5b`.)

- [ ] **Step 4: Commit**

```bash
git add evidence/components/KpiRow.svelte
git commit -m "feat(kpi): forward FA icons, green toggle, responsive grid"
```

## Task 5: OwnershipDonut + ScrollX components

**Files:** Create `evidence/components/OwnershipDonut.svelte`, `evidence/components/ScrollX.svelte`

- [ ] **Step 1: Create `OwnershipDonut.svelte`** (presentational; uses Evidence's bundled ECharts via the `<ECharts>` core component is not importable here, so render a CSS conic donut — no engine, no deps):

```svelte
<script>
	// Public vs Private donut. data: [{category_name, value}] (baked). No query().
	export let data = [];
	$: pub = Number(data.find((r) => /public/i.test(r.category_name))?.value ?? 0);
	$: priv = Number(data.find((r) => /private/i.test(r.category_name))?.value ?? 0);
	$: total = pub + priv;
	$: pubPct = total ? Math.round((pub / total) * 100) : 0;
	const f = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
</script>

<div class="wrap">
	<div class="donut" style="--p:{pubPct}%">
		<div class="hole"><b>{pubPct}%</b><span>Public</span></div>
	</div>
	<div class="keys">
		<div><i style="background:#1a9c5b"></i> Public — {f(pub)}</div>
		<div><i style="background:#f4a261"></i> Private — {f(priv)}</div>
	</div>
</div>

<style>
	.wrap { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; min-height: 150px; }
	.donut { width: 120px; height: 120px; border-radius: 50%; background: conic-gradient(#1a9c5b 0 var(--p), #f4a261 var(--p) 100%); display: flex; align-items: center; justify-content: center; }
	.hole { width: 74px; height: 74px; background: #fff; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
	.hole b { font-size: 18px; color: #0a3d2c; } .hole span { font-size: 9px; color: #6b7872; }
	.keys { font-size: 12.5px; } .keys div { display: flex; align-items: center; gap: 7px; margin: 5px 0; }
	.keys i { width: 11px; height: 11px; border-radius: 2px; display: inline-block; }
	:global(.dark) .hole { background: #18181b; } :global(.dark) .hole b { color: #e4e4e7; }
</style>
```

- [ ] **Step 2: Create `ScrollX.svelte`** (wrapper so the wide compare table scrolls on mobile — a `.svelte` component, NOT a raw-HTML `<div>`, per the mdsvex gotcha):

```svelte
<div class="scrollx"><slot /></div>
<style>.scrollx { overflow-x: auto; -webkit-overflow-scrolling: touch; }</style>
```

- [ ] **Step 3: Commit**

```bash
git add evidence/components/OwnershipDonut.svelte evidence/components/ScrollX.svelte
git commit -m "feat(components): OwnershipDonut + ScrollX (mobile table wrapper)"
```

## Task 6: Template — KPI icons, charts grid with half-width map, donut, scroll-wrapped table

**Files:** Modify `scripts/asc-pages/template.mjs`

- [ ] **Step 1: Add icons to the KPI config** in `head()` (the `<KpiRow … kpis={[…]} />`):

```
{dx:'${I.enrol}',title:'Total learners',fmt:'int',icon:'fa-solid fa-users'},
{dx:'${I.teachers}',title:'Teachers',fmt:'int',icon:'fa-solid fa-chalkboard-user'},
{dx:'${I.ptr}',title:'Pupil–teacher ratio',fmt:'ratio',icon:'fa-solid fa-scale-balanced'},
{dx:'${I.female}',title:'Female learners (%)',fmt:'pct',icon:'fa-solid fa-venus'}
```

- [ ] **Step 2: Add the per-level enrol/boys/girls ids to the `LEVELS`/`I` maps** (boys/girls are new):

```js
// add to the LEVELS entries: boys + girls ids
{ key:'preprry', label:'Pre-Primary', enrol:'DiEriq7urPG', boys:'L7wp6IPJGhV', girls:'NnvopxD62MT', female:'QZl1LOTpSat', stream:'i8mFzOkO9Wi', special:'Rszp9Ippq5N' },
{ key:'pry',     label:'Primary',     enrol:'d8qCE7aPWtD', boys:'yjH9LAuAMrk', girls:'Qwjg1QG0Hws', female:'JH1hYfoV2hb', stream:'uNvBLdtslJ5', special:'Mmn0SEDyzOC' },
{ key:'jss',     label:'JSS',         enrol:'wDf8ZOwWgib', boys:'gAfSf7sfxib', girls:'uSfibhbGRT1', female:'nghVrzkls6X', stream:'Yf6K5jD4oED', special:'bCMrPV3785Y' },
{ key:'sss',     label:'SSS',         enrol:'IYNEmLyFgbe', boys:'i8dMJSyq5hO', girls:'vZA5RaodnuH', female:'jWEK2IgsZXZ', stream:'Y8uv3HrDDcF', special:'X4cRpKnxayU' },
{ key:'anfe',    label:'ANFE',        enrol:'g1ozV2n8G88', boys:'kxJmBoDtD9t', girls:'VzPMQzTjenn', female:'dRBLKPEMR80', stream:'mHzRpEIsf3n', special:'kitIA5LU69N' },
```

- [ ] **Step 3: Add a shared `chartsSection(ou, {withMap})` helper** that emits the queries (BEFORE the `<Grid>`, per the gotcha) and a responsive `<Grid cols=2>` of chart cards. Map is included only when `withMap` (branch pages). Insert it into `branchSection` (withMap=true) and `leafSection` (withMap=false), replacing the standalone full-width map block in `branchSection`:

```js
const ENROL_WHENS = LEVELS.map((lv,i)=>`when '${lv.enrol}' then '${i+1} ${lv.label}'`).join(' ');
const ENROL_IDS = LEVELS.map(lv=>`'${lv.enrol}'`).join(',');
const SEX_LEVEL_WHENS = LEVELS.map((lv,i)=>`when '${lv.boys}' then '${i+1} ${lv.label}' when '${lv.girls}' then '${i+1} ${lv.label}'`).join(' ');
const SEX_SEX_WHENS = LEVELS.map(lv=>`when '${lv.boys}' then 'Boys' when '${lv.girls}' then 'Girls'`).join(' ');
const SEX_IDS = LEVELS.flatMap(lv=>[`'${lv.boys}'`,`'${lv.girls}'`]).join(',');

function chartsSection(ou, withMap) {
  return `
\`\`\`sql enrol_by_level
select case f.dx ${ENROL_WHENS} end as level, f.value as enrolment
from census.fact f
where f.ou='${ou.id}' and f.periodType='YEARLY' and f.pe='2024' and f.dx in (${ENROL_IDS})
order by level
\`\`\`

\`\`\`sql sex_by_level
select case f.dx ${SEX_LEVEL_WHENS} end as level,
       case f.dx ${SEX_SEX_WHENS} end as sex, f.value as learners
from census.fact f
where f.ou='${ou.id}' and f.periodType='YEARLY' and f.pe='2024' and f.dx in (${SEX_IDS})
order by level, sex
\`\`\`

\`\`\`sql ownership_enrol
select category_name, value from census.fact_ownership
where ou='${ou.id}' and dx='${I.enrol}' and periodType='YEARLY' and pe='2024'
\`\`\`
${withMap ? `
\`\`\`sql children_map
select o.id, o.name, f.value
from census.fact f join census.ou o on f.ou=o.id
where o.parent_id='${ou.id}' and f.dx='${I.ptr}' and f.periodType='YEARLY' and f.pe='2024'
\`\`\`
` : ''}

## Charts

<Grid cols=2>
  ${withMap ? `<AreaMap data={children_map} geoJsonUrl="/asc.geojson" geoId="id" areaCol="id" value="value" title="Pupil–teacher ratio by sub-unit" tooltip={[{id:'name',showColumnTitles:false},{id:'value',fmt:'num1'}]} height={260} />` : ''}
  <BarChart data={enrol_by_level} x=level y=enrolment title="Enrolment by education level" swapXY=true />
  <BarChart data={sex_by_level} x=level y=learners series=sex type=grouped title="Learners by sex & level" swapXY=true />
  <OwnershipDonut data={ownership_enrol} />
</Grid>
`;
}
```

> `<BarChart>` and `<AreaMap>` are Evidence built-ins (baked, palette-aware) and are valid inside `<Grid>`. `<OwnershipDonut>` is our component (also valid in `<Grid>`). The ```` ```sql ```` blocks are emitted **before** the `<Grid>`. `swapXY=true` makes the level labels readable.

- [ ] **Step 4: Wire `chartsSection` into both page kinds.** In `branchSection`, **remove** the old standalone `children_map` query + full-width `<AreaMap>` + the "## …pupil-teacher ratio" heading, and instead call `chartsSection(ou, true)` before the compare-table section. In `leafSection`, call `chartsSection(ou, false)` after the KPIs (before the education-level table). Keep the existing CompareTable (branch) / edu_breakdown table (leaf).

- [ ] **Step 5: Wrap the CompareTable in `<ScrollX>`** in `branchSection`:

```
<ScrollX>
<CompareTable tabs={[${tabs}]} columns={[...]} />
</ScrollX>
```

- [ ] **Step 6: Regenerate pages + sanity check markup**

Run: `npm run pages:asc && grep -c "BarChart\|OwnershipDonut\|enrol_by_level\|sex_by_level" evidence/pages/index.md`
Expected: generates 31 pages; grep ≥ 4. Confirm ```` ```sql ```` blocks are above `<Grid>` (not inside).

- [ ] **Step 7: Commit**

```bash
git add scripts/asc-pages/template.mjs
git commit -m "feat(pages): KPI icons, green charts grid (bar/sex/donut) + half-width map, scroll-wrapped table"
```

## Task 7: Build, deploy, verify

- [ ] **Step 1: Tests still green** — `npm test` → 39 passed.

- [ ] **Step 2: Build + deploy** (stop sibling instances first if memory is tight):

```bash
rm -rf evidence/node_modules/.vite evidence/.evidence/template/.svelte-kit
NODE_OPTIONS=--max-old-space-size=3072 npm run build && npm run deploy
```
Expected: "Build complete", "Deployed build …". No "Error in Query" lines.

- [ ] **Step 3: No emoji in the built output**

Run: `grep -rlP "[\x{1F000}-\x{1FAFF}\x{1F1E6}-\x{1F1FF}\x{2600}-\x{27BF}]" evidence/build 2>/dev/null | grep -v '\.wasm' || echo "no emoji in build"`
Expected: `no emoji in build` (ignore the wasm binary).

- [ ] **Step 4: Still fully baked (0 engine requests)** — serve and run the network check from the previous plan (`/tmp/netcheck.mjs`): federal + a state page must report **0** DuckDB/wasm requests, including after clicking the ownership toggle and a level tab.

- [ ] **Step 5: Visual + responsive check** (Playwright, executablePath `/opt/playwright-browsers/chromium-1223/chrome-linux/chrome`): screenshot the federal page at **1200px** and **375px**. Confirm: FA icons (no emoji) on KPI cards + crest; green bars/donut/map; half-width map; at 375px the KPI cards are ≤2 across, charts single-column, nav ≤2 across, compare table scrolls horizontally.

- [ ] **Step 6: Final commit** (any screenshots/notes), and report.

---

## Done criteria

- No emoji anywhere in source or built output (Font Awesome only).
- Charts use the Nigeria-green palette; map is half-width with a green scale.
- KPI cards: FA icon + green accent, no sparkline/deltas; ownership toggle works (Total/Public/Private switches values) and is green.
- Three new charts render from baked data on federal/state pages; leaf LGA pages show the charts minus the children map.
- Responsive at ~375px (cards ≤2, charts 1-col, nav ≤2, table scrolls).
- 39 tests green; build + deploy succeed; 0 DuckDB-WASM requests on load.
