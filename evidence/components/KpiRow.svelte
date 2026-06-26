<script>
	// KPI tiles, driven by the shared Total / Public / Private ownership toggle (in ControlBar).
	// All three datasets are baked in as props (Total from fact; Public/Private from the Ownership
	// group-set cut); switching is client-side only — no query(), pages stay engine-free.
	import SupersetBigNumber from './SupersetBigNumber.svelte';
	import { ownershipMode } from './ownership.js';

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

	$: rows = $ownershipMode === 'public' ? pub : $ownershipMode === 'private' ? priv : total;
	// reactive (recomputes on mode change) — a plain function call wouldn't re-run per tile
	$: shown = kpis.map((k) => ({ title: k.title, icon: k.icon || '', sub: k.sub || '', fmt: FMT[k.fmt] || FMT.int, data: rows.filter((r) => r.dx === k.dx) }));
</script>

<div class="kpis">
	{#each shown as k}
		<SupersetBigNumber title={k.title} icon={k.icon} subtitle={k.sub} data={k.data} value="value" fmt={k.fmt} />
	{/each}
</div>

<style>
	.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
	@media (max-width: 820px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
	@media (max-width: 480px) { .kpis { grid-template-columns: 1fr; } }
	@media print {
		/* keep the boxes equal width on paper (don't collapse to the narrow-screen layout) */
		.kpis { grid-template-columns: repeat(4, 1fr) !important; }
	}
</style>
