<script>
	// Presentational compare table (Superset look) with Pre-Prim/Primary ↔ JSS tabs,
	// in-cell bars, and child-linking first column. Data is baked in as props; no query().
	export let preprimary = [];   // rows: {ou_name, link, ...metric cols}
	export let jss = [];
	export let columns = [];      // [{key, label, bar?}]
	export let linkCol = 'link';  // url column for the first cell
	let tab = 'pre';
	$: rows = tab === 'pre' ? preprimary : jss;
	$: barMax = (k) => Math.max(1, ...rows.map((r) => Number(r[k]) || 0));
	const num = (v) => (v == null ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 }));
</script>

<div class="wrap">
	<div class="tabs">
		<button class:on={tab === 'pre'} on:click={() => (tab = 'pre')}>Pre-Primary / Primary</button>
		<button class:on={tab === 'jss'} on:click={() => (tab = 'jss')}>Junior Secondary</button>
	</div>
	<table>
		<thead><tr><th>Org unit</th>{#each columns as c}<th>{c.label}</th>{/each}</tr></thead>
		<tbody>
			{#each rows as r}
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
	.tabs button { font-size: 12px; padding: 8px 14px; border: none; background: none; font-weight: 600; color: #879399; border-bottom: 2px solid transparent; cursor: pointer; }
	.tabs button.on { color: #1FA8C9; border-bottom-color: #1FA8C9; }
	table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
	th { background: #fafafa; color: #5a6b73; text-align: right; padding: 8px 9px; border-bottom: 1px solid #e0e0e0; white-space: nowrap; }
	th:first-child { text-align: left; }
	td { text-align: right; padding: 7px 9px; border-bottom: 1px solid #f1f3f4; position: relative; }
	td.name { text-align: left; }
	td.name a { color: #1FA8C9; font-weight: 600; text-decoration: none; }
	tr:hover { background: #f7fbfc; }
	.bar { position: absolute; left: 4px; top: 50%; transform: translateY(-50%); height: 60%; background: rgba(31,168,201,.14); border-radius: 2px; }
	.v { position: relative; }
	:global(.dark) th { background: #27272a; color: #a1a1aa; border-color: #3f3f46; }
	:global(.dark) td { border-color: #27272a; }
</style>
