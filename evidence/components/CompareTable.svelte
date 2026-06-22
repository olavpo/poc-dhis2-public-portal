<script>
	// Presentational compare table (Superset look) with one tab per level, in-cell bars, a
	// child-linking first column and a name filter. Baked data via props; no query(). Each tab
	// carries total/public/private row-sets; the shared ownership store picks which to show.
	import { ownershipMode } from './ownership.js';
	export let tabs = [];        // [{label, total:[], public:[], private:[]}]
	export let columns = [];     // [{key, label, bar?}]
	export let linkCol = 'link'; // url column for the first cell
	let active = 0;
	let search = '';
	$: rows = tabs[active]?.[$ownershipMode] ?? tabs[active]?.total ?? [];
	// Client-side filter on the org-unit name — plain JS, no query/engine.
	$: filtered = search.trim()
		? rows.filter((r) => String(r.ou_name ?? '').toLowerCase().includes(search.trim().toLowerCase()))
		: rows;
	$: barMax = (k) => Math.max(1, ...filtered.map((r) => Number(r[k]) || 0));
	$: modeLabel = $ownershipMode === 'public' ? 'Public schools only'
		: $ownershipMode === 'private' ? 'Private schools only' : 'All schools (Total)';
	const num = (v) => (v == null ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 }));
</script>

<div class="wrap">
	<div class="toolbar">
		<div class="tabs">
			{#each tabs as t, i}<button class:on={i === active} on:click={() => (active = i)}>{t.label}</button>{/each}
		</div>
		<input class="search" type="search" bind:value={search} placeholder="Filter by name…" />
	</div>
	<div class="modelabel" class:filtered={$ownershipMode !== 'total'}>Showing: {modeLabel}</div>
	<table>
		<thead><tr><th class="ou">Org unit</th>{#each columns as c}<th class="rot"><span>{c.label}</span></th>{/each}</tr></thead>
		<tbody>
			{#each filtered as r}
				<tr>
					<td class="name">{#if r[linkCol]}<a href={r[linkCol]}>{r.ou_name} ›</a>{:else}{r.ou_name}{/if}</td>
					{#each columns as c}
						<td>{#if c.bar}<span class="bar" style="width:{(Number(r[c.key]) / barMax(c.key)) * 100}%"></span>{/if}<span class="v">{num(r[c.key])}</span></td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
	.search { height: 30px; border: 1px solid #d7dee2; border-radius: 7px; padding: 0 10px; font-size: 12px; color: #0a3d2c; min-width: 160px; }
	.search:focus { outline: none; border-color: #1a9c5b; }
	.modelabel { font-size: 11.5px; font-weight: 600; color: #6b7872; margin: 4px 0 6px; }
	.modelabel.filtered { color: #0a3d2c; background: #eaf6ef; border-left: 3px solid #1a9c5b; padding: 4px 8px; border-radius: 4px; display: inline-block; }
	.tabs { display: flex; flex-wrap: wrap; gap: 2px; }
	.tabs button { font-size: 12px; padding: 8px 14px; border: none; background: none; font-weight: 600; color: #879399; border-bottom: 2px solid transparent; cursor: pointer; }
	.tabs button.on { color: #1FA8C9; border-bottom-color: #1FA8C9; }
	table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
	th { background: #fafafa; color: #5a6b73; text-align: right; padding: 8px 9px; border-bottom: 1px solid #e0e0e0; white-space: nowrap; }
	th:first-child { text-align: left; }
	/* Metric headers angled ~50° so the wide table fits (esp. in print). Each label's bottom-right
	   corner is pinned (absolutely) to the column's right edge — the same edge its right-aligned
	   numbers sit on — so the label's right side aligns with the column regardless of label length.
	   The label therefore rises up-and-to-the-left; anchoring on the right is the only way to pin
	   that edge without the text dipping down into the row. "Org unit" stays horizontal. */
	th.rot { position: relative; height: 104px; min-width: 2.6em; vertical-align: bottom; padding: 0; }
	th.rot span { position: absolute; right: 9px; bottom: 6px; transform: rotate(50deg); transform-origin: right bottom; white-space: nowrap; font-size: 11px; font-weight: 600; line-height: 1; }
	th.ou { text-align: left; vertical-align: bottom; }
	td { text-align: right; padding: 7px 9px; border-bottom: 1px solid #f1f3f4; position: relative; }
	td.name { text-align: left; }
	td.name a { color: #1FA8C9; font-weight: 600; text-decoration: none; }
	tr:hover { background: #f7fbfc; }
	.bar { position: absolute; left: 4px; top: 50%; transform: translateY(-50%); height: 60%; background: rgba(31,168,201,.14); border-radius: 2px; }
	.v { position: relative; }
	:global(.dark) th { background: #27272a; color: #a1a1aa; border-color: #3f3f46; }
	:global(.dark) td { border-color: #27272a; }
</style>
