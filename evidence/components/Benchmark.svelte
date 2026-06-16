<script>
	// Comparison table: this org unit's key indicators vs the Federal benchmark.
	// rows: [{indicator, unit, federal, fmt}] (fmt: 'ratio' | 'pct'). Baked data via props.
	// On the federal page pass unitLabel='' → the "this unit" column is dropped.
	export let rows = [];
	export let unitLabel = '';
	const FMT = { ratio: (v) => Number(v).toFixed(1), pct: (v) => Number(v).toFixed(1) + '%' };
	const f = (v, k) => (v == null ? '—' : (FMT[k] || FMT.ratio)(v));
	// For ratios lower is better; for % higher is better. Colour the unit vs federal delta.
	const better = (r) => {
		if (r.unit == null || r.federal == null) return '';
		const d = Number(r.unit) - Number(r.federal);
		if (Math.abs(d) < 1e-9) return 'flat';
		const good = r.fmt === 'pct' ? d > 0 : d < 0;
		return good ? 'good' : 'bad';
	};
	const delta = (r) => {
		if (r.unit == null || r.federal == null) return '';
		const d = Number(r.unit) - Number(r.federal);
		const s = (r.fmt === 'pct' ? d.toFixed(1) + ' pp' : d.toFixed(1));
		return (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '') + s;
	};
</script>

<table>
	<thead>
		<tr>
			<th>Indicator</th>
			{#if unitLabel}<th class="num">{unitLabel}</th>{/if}
			<th class="num">Federal</th>
			{#if unitLabel}<th class="num">vs Federal</th>{/if}
		</tr>
	</thead>
	<tbody>
		{#each rows as r}
			<tr>
				<td>{r.indicator}</td>
				{#if unitLabel}<td class="num">{f(r.unit, r.fmt)}</td>{/if}
				<td class="num fed">{f(r.federal, r.fmt)}</td>
				{#if unitLabel}<td class="num d {better(r)}">{delta(r)}</td>{/if}
			</tr>
		{/each}
	</tbody>
</table>

<style>
	table { width: 100%; border-collapse: collapse; font-size: 12px; }
	th { background: #fafafa; color: #5a6b73; text-align: right; padding: 8px 10px; border-bottom: 1px solid #e0e0e0; white-space: nowrap; }
	th:first-child { text-align: left; }
	td { text-align: right; padding: 8px 10px; border-bottom: 1px solid #f1f3f4; }
	td:first-child { text-align: left; }
	.num { font-variant-numeric: tabular-nums; }
	.fed { color: #6b7872; }
	.d.good { color: #0e7c4a; font-weight: 600; }
	.d.bad { color: #c0392b; font-weight: 600; }
	.d.flat { color: #aab3ad; }
	:global(.dark) th { background: #27272a; color: #a1a1aa; border-color: #3f3f46; }
	:global(.dark) td { border-color: #27272a; }
</style>
