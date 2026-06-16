<script>
	// KPI row with a Total / Public / Private ownership toggle. All three datasets are
	// baked in as props (Total from fact; Public/Private from the Ownership group-set cut);
	// switching is client-side only — no query(), pages stay engine-free.
	import SupersetBigNumber from './SupersetBigNumber.svelte';

	export let total = [];   // [{dx, value}]
	export let pub = [];     // [{dx, category_name, value}] Public rows
	export let priv = [];    // [{dx, category_name, value}] Private rows
	export let kpis = [];    // [{dx, title, fmt:'int'|'ratio'|'pct'}] — fmt is a STRING
	                         // (inline functions in an mdsvex array prop don't compile)

	// Format keyed by string so no functions pass through the markdown prop.
	const FMT = {
		int: (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }),
		ratio: (v) => Number(v).toFixed(1),
		pct: (v) => Number(v).toFixed(1) + '%',
	};

	let mode = 'total';
	const MODES = [{ k: 'total', label: 'Total' }, { k: 'public', label: 'Public' }, { k: 'private', label: 'Private' }];
	$: rows = mode === 'public' ? pub : mode === 'private' ? priv : total;
	// reactive (recomputes on mode change) — a plain function call wouldn't re-run per tile
	$: shown = kpis.map((k) => ({ title: k.title, fmt: FMT[k.fmt] || FMT.int, data: rows.filter((r) => r.dx === k.dx) }));
</script>

<div class="ownbar">
	<span class="lbl">School ownership</span>
	<div class="seg">
		{#each MODES as m}<button class:on={mode === m.k} on:click={() => (mode = m.k)}>{m.label}</button>{/each}
	</div>
</div>

<div class="kpis">
	{#each shown as k}
		<SupersetBigNumber title={k.title} data={k.data} value="value" fmt={k.fmt} />
	{/each}
</div>

<style>
	.ownbar { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; }
	.ownbar .lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .6px; font-weight: 600; color: #6b7872; }
	.seg { display: inline-flex; border: 1px solid #d7dee2; border-radius: 8px; overflow: hidden; }
	.seg button { border: none; background: #fff; padding: 6px 14px; font-size: 12px; font-weight: 600; color: #5a6b73; cursor: pointer; border-right: 1px solid #e7ecee; }
	.seg button:last-child { border-right: none; }
	.seg button.on { background: #1FA8C9; color: #fff; }
	.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
	@media (max-width: 800px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
	:global(.dark) .seg button { background: #18181b; color: #a1a1aa; border-color: #3f3f46; }
	:global(.dark) .seg button.on { background: #1FA8C9; color: #fff; }
</style>
