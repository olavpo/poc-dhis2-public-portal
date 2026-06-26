<script>
	// Comparison table: this org unit's key indicators vs its parent State (LGA pages) and the
	// Federal benchmark. rows: [{indicator, unit, state, federal, fmt}] (fmt: 'ratio' | 'pct').
	// unitLabel='' (federal page) drops the unit + delta columns; stateLabel='' drops the State
	// column (state & federal pages). rows are tagged with a `mode` (total/public/private); the
	// shared ownership toggle picks which set to show, so the whole comparison switches with it.
	import { ownershipMode } from './ownership.js';
	export let rows = [];
	export let unitLabel = '';
	export let stateLabel = '';
	$: shown = (rows || []).filter((r) => r.mode === $ownershipMode);
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
			{#if stateLabel}<th class="num">{stateLabel}</th>{/if}
			<th class="num">Federal</th>
			{#if unitLabel}<th class="num">vs Federal</th>{/if}
		</tr>
	</thead>
	<tbody>
		{#each shown as r}
			<tr>
				<td>{r.indicator}</td>
				{#if unitLabel}<td class="num">{f(r.unit, r.fmt)}</td>{/if}
				{#if stateLabel}<td class="num">{f(r.state, r.fmt)}</td>{/if}
				<td class="num fed">{f(r.federal, r.fmt)}</td>
				{#if unitLabel}<td class="num d {better(r)}">{delta(r)}</td>{/if}
			</tr>
		{/each}
	</tbody>
</table>

<style>
	table { width: 100%; border-collapse: collapse; font-size: 14px; }
	th { background: #fafafa; color: #5a6b73; text-align: right; padding: 9px 11px; border-bottom: 1px solid #e0e0e0; white-space: nowrap; }
	th:first-child { text-align: left; }
	td { text-align: right; padding: 9px 11px; border-bottom: 1px solid #f1f3f4; }
	td:first-child { text-align: left; font-weight: 600; color: #0a3d2c; }
	.num { font-variant-numeric: tabular-nums; }
	.fed { color: #6b7872; }
	.d.good { color: #0e7c4a; font-weight: 600; }
	.d.bad { color: #c0392b; font-weight: 600; }
	.d.flat { color: #aab3ad; }
	:global(.dark) th { background: #27272a; color: #a1a1aa; border-color: #3f3f46; }
	:global(.dark) td { border-color: #27272a; }
</style>
