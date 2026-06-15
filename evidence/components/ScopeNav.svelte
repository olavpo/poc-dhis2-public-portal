<script>
	// Presentational scope navigator: breadcrumb of ancestors + a reserved (disabled)
	// year filter slot. All links point to baked pages; no query().
	export let title = '';
	export let ancestors = []; // [{name, link}], current last (link null)
	export let year = '2024';
</script>

<div class="subbar">
	<div>
		<h2>{title}</h2>
		<div class="crumb">
			{#each ancestors as a, i}{#if i}<span class="sep"> › </span>{/if}{#if a.link}<a href={a.link}>{a.name}</a>{:else}<b>{a.name}</b>{/if}{/each}
		</div>
	</div>
	<div class="controls">
		<span class="pill scope">Scope: {ancestors[ancestors.length - 1]?.name ?? title}</span>
		<span class="pill year" title="Year filter coming soon">{year} (future)</span>
	</div>
</div>

<style>
	.subbar { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 8px; margin: 4px 0 14px; }
	h2 { margin: 0; font-size: 18px; font-weight: 700; }
	.crumb { font-size: 12px; color: #879399; margin-top: 3px; }
	.crumb a { color: #13714a; text-decoration: none; }
	.crumb a:hover { text-decoration: underline; }
	.controls { display: flex; gap: 8px; }
	.pill { font-size: 12px; padding: 7px 11px; border-radius: 7px; font-weight: 600; }
	.pill.scope { background: #eaf5ee; border: 1px solid #bfe0cd; color: #0a3d2c; }
	.pill.year { background: #fff; border: 1px dashed #cdd3cf; color: #aab3ad; font-weight: 500; }
	:global(.dark) .pill.scope { background: #14321f; border-color: #1f5b38; color: #a7f3c8; }
	:global(.dark) .pill.year { background: transparent; }
</style>
