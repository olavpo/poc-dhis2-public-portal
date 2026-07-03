<script>
	// Page control bar: org-unit search + school-year box + Total/Public/Private ownership toggle.
	// The ownership toggle drives the whole page via the shared store (no query() — pages stay
	// engine-free). The school-year box is presentational for now: a placeholder styled like the
	// other controls so it can become a real year selector later. Rendered once near the top, above
	// the reporting strip and KPI tiles.
	import OrgSearch from './OrgSearch.svelte';
	import Icon from './Icon.svelte';
	import { ownershipMode } from './ownership.js';
	export let schoolYear = '2024/2025';
	const MODES = [{ k: 'total', label: 'Total' }, { k: 'public', label: 'Public' }, { k: 'private', label: 'Private' }];
</script>

<div class="controlbar">
	<OrgSearch />
	<div class="ctl">
		<span class="lbl">School year</span>
		<div class="yearbox" title="Reference school year">{schoolYear}<Icon name="chevron-down" /></div>
	</div>
	<div class="ctl">
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

<style>
	.controlbar { display: flex; align-items: flex-end; gap: 18px; flex-wrap: wrap; margin: 0 0 12px; }
	.ctl { display: flex; flex-direction: column; gap: 3px; }
	.lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .6px; font-weight: 700; color: #6b7872; }
	/* styled like a (future) selector — same height/border as the search input + toggle */
	.yearbox { height: 34px; display: inline-flex; align-items: center; gap: 10px; padding: 0 12px; border: 1px solid #d7dee2; border-radius: 8px; background: #fff; font-size: 12.5px; font-weight: 600; color: #0a3d2c; white-space: nowrap; }
	.yearbox :global(svg) { color: #aab3ad; font-size: 11px; }
	.seg { display: inline-flex; height: 34px; border: 1px solid #d7dee2; border-radius: 8px; overflow: hidden; }
	.seg button { border: none; background: #fff; padding: 0 16px; font-size: 12.5px; font-weight: 600; color: #5a6b73; cursor: pointer; border-right: 1px solid #e7ecee; }
	.seg button:last-child { border-right: none; }
	.seg button.on { background: #1a9c5b; color: #fff; }
	.printmode { display: none; }
	@media print { .printmode { display: block; margin: 0 0 8px; font-size: 12px; font-weight: 700; color: #0a3d2c; } }
	:global(.dark) .yearbox { background: #18181b; color: #e4e4e7; border-color: #3f3f46; }
	:global(.dark) .seg button { background: #18181b; color: #a1a1aa; border-color: #3f3f46; }
	:global(.dark) .seg button.on { background: #1a9c5b; color: #fff; }
</style>
