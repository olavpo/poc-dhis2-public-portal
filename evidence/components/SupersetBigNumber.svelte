<script>
	// Presentational Big-Number tile (Superset look). Receives baked query data as props;
	// never calls query() — so pages using it stay engine-free.
	export let data = [];        // rows; we read the latest as the headline
	export let value;            // column name for the metric
	export let title = '';
	export let fmt = (v) => Number(v).toLocaleString('en-US');
	export let trend = [];       // array of numbers (oldest→newest) for the sparkline
	$: headline = data.length ? data[data.length - 1][value] : null;
	$: pts = (() => {
		if (trend.length < 2) return '';
		const min = Math.min(...trend), max = Math.max(...trend), span = max - min || 1;
		return trend.map((v, i) => `${(i / (trend.length - 1)) * 100},${34 - ((v - min) / span) * 28}`).join(' ');
	})();
</script>

<div class="card bn">
	<div class="ch">{title}</div>
	<div class="num">{headline == null ? '—' : fmt(headline)}</div>
	{#if pts}<svg viewBox="0 0 100 34" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke="#1FA8C9" stroke-width="2" /></svg>{/if}
</div>

<style>
	.card { background: #fff; border: 1px solid #e0e0e0; border-radius: 3px; padding: 10px 12px; position: relative; min-height: 90px; }
	.ch { font-size: 13px; font-weight: 600; color: #323232; }
	.num { font-size: 30px; font-weight: 600; color: #323232; letter-spacing: -.5px; margin-top: 4px; }
	svg { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 34px; display: block; }
	:global(.dark) .card { background: #18181b; border-color: #3f3f46; }
	:global(.dark) .ch, :global(.dark) .num { color: #e4e4e7; }
</style>
