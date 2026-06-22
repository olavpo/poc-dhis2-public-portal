<script>
	// KPI row with a Total / Public / Private ownership toggle. All three datasets are
	// baked in as props (Total from fact; Public/Private from the Ownership group-set cut);
	// switching is client-side only — no query(), pages stay engine-free.
	import SupersetBigNumber from './SupersetBigNumber.svelte';
	import OrgSearch from './OrgSearch.svelte';
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

	// Shared across the page (KPIs + compare table) via the ownership store.
	const MODES = [{ k: 'total', label: 'Total' }, { k: 'public', label: 'Public' }, { k: 'private', label: 'Private' }];
	$: rows = $ownershipMode === 'public' ? pub : $ownershipMode === 'private' ? priv : total;
	// reactive (recomputes on mode change) — a plain function call wouldn't re-run per tile
	$: shown = kpis.map((k) => ({ title: k.title, icon: k.icon || '', fmt: FMT[k.fmt] || FMT.int, data: rows.filter((r) => r.dx === k.dx) }));
</script>

<div class="controlbar">
	<OrgSearch />
	<div class="own">
		<span class="lbl">School ownership</span>
		<div class="seg">
			{#each MODES as m}<button class:on={$ownershipMode === m.k} on:click={() => ($ownershipMode = m.k)}>{m.label}</button>{/each}
		</div>
	</div>
</div>

<!-- Print-only banner: the ownership toggle is hidden when printing, so surface the active
     filter at the top of the PDF when it's not the default (Total). -->
{#if $ownershipMode !== 'total'}
	<div class="printmode">Showing {$ownershipMode === 'public' ? 'public' : 'private'} schools only</div>
{/if}

<div class="kpis">
	{#each shown as k}
		<SupersetBigNumber title={k.title} icon={k.icon} data={k.data} value="value" fmt={k.fmt} />
	{/each}
</div>

<style>
	.controlbar { display: flex; align-items: flex-end; gap: 18px; flex-wrap: wrap; margin: 0 0 12px; }
	.own { display: flex; flex-direction: column; gap: 3px; }
	.own .lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .6px; font-weight: 700; color: #6b7872; }
	.seg { display: inline-flex; height: 34px; border: 1px solid #d7dee2; border-radius: 8px; overflow: hidden; }
	.seg button { border: none; background: #fff; padding: 0 16px; font-size: 12.5px; font-weight: 600; color: #5a6b73; cursor: pointer; border-right: 1px solid #e7ecee; }
	.seg button:last-child { border-right: none; }
	.seg button.on { background: #1a9c5b; color: #fff; }
	/* hidden on screen (the toggle is visible); shown only when printing */
	.printmode { display: none; }
	.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
	@media (max-width: 820px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
	@media (max-width: 480px) { .kpis { grid-template-columns: 1fr; } }
	@media print {
		/* keep the boxes equal width on paper (don't collapse to the narrow-screen layout) */
		.kpis { grid-template-columns: repeat(4, 1fr) !important; }
		.printmode { display: block; margin: 0 0 8px; font-size: 12px; font-weight: 700; color: #0a3d2c; }
	}
	:global(.dark) .seg button { background: #18181b; color: #a1a1aa; border-color: #3f3f46; }
	:global(.dark) .seg button.on { background: #1a9c5b; color: #fff; }
</style>
