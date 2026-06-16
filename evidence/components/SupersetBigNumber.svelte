<script>
	// Presentational KPI tile (Nigeria-green). Data is a baked query result passed as a
	// prop; never calls query(). `icon` is a Font Awesome class string (no emoji).
	export let data = [];   // rows; we read the latest as the headline
	export let value;       // column name for the metric
	export let title = '';
	export let icon = '';   // e.g. 'fa-solid fa-users' (string — mdsvex array props can't carry fns)
	export let fmt = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
	$: headline = data.length ? data[data.length - 1][value] : null;
</script>

<div class="kpi">
	<div class="lab">{#if icon}<i class={icon}></i>{/if}<span>{title}</span></div>
	<div class="val">{headline == null ? '—' : fmt(headline)}</div>
</div>

<style>
	.kpi { background: #fff; border: 1px solid #e3e8e5; border-left: 4px solid #1a9c5b; border-radius: 8px; padding: 14px 16px; min-height: 84px; }
	.lab { font-size: 12px; color: #6b7872; font-weight: 600; display: flex; align-items: center; gap: 7px; }
	.lab i { color: #1a9c5b; font-size: 13px; }
	.val { font-size: 30px; font-weight: 800; letter-spacing: -.5px; margin-top: 8px; color: #0a3d2c; line-height: 1.1; }
	:global(.dark) .kpi { background: #18181b; border-color: #3f3f46; border-left-color: #1a9c5b; }
	:global(.dark) .val { color: #e4e4e7; }
</style>
