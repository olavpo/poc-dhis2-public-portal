<script>
	// Public vs Private donut. data: [{category_name, value}] (baked). No query().
	// CSS conic-gradient (no chart engine, no deps) so the page stays fully baked.
	// Always shows the public/private split of `data` — independent of the KPI ownership toggle.
	export let data = [];
	export let title = '';
	$: pub = Number(data.find((r) => /public/i.test(r.category_name))?.value ?? 0);
	$: priv = Number(data.find((r) => /private/i.test(r.category_name))?.value ?? 0);
	$: total = pub + priv;
	$: pubPct = total ? Math.round((pub / total) * 100) : 0;
	const f = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
</script>

<div class="block">
{#if title}<div class="dt">{title}</div>{/if}
<div class="wrap">
	<div class="donut" style="--p:{pubPct}%">
		<div class="hole"><b>{pubPct}%</b><span>Public</span></div>
	</div>
	<div class="keys">
		<div><i style="background:#1a9c5b"></i> Public — {f(pub)}</div>
		<div><i style="background:#f4a261"></i> Private — {f(priv)}</div>
	</div>
</div>
</div>

<style>
	.dt { font-size: 13px; font-weight: 600; color: #0a3d2c; margin: 0 0 6px; }
	:global(.dark) .dt { color: #e4e4e7; }
	.wrap { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; min-height: 150px; }
	.donut { width: 120px; height: 120px; border-radius: 50%; background: conic-gradient(#1a9c5b 0 var(--p), #f4a261 var(--p) 100%); display: flex; align-items: center; justify-content: center; }
	.hole { width: 74px; height: 74px; background: #fff; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; }
	.hole b { font-size: 18px; color: #0a3d2c; } .hole span { font-size: 9px; color: #6b7872; }
	.keys { font-size: 12.5px; } .keys div { display: flex; align-items: center; gap: 7px; margin: 5px 0; }
	.keys i { width: 11px; height: 11px; border-radius: 2px; display: inline-block; }
	:global(.dark) .hole { background: #18181b; } :global(.dark) .hole b { color: #e4e4e7; }
</style>
