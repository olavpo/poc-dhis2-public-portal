<script>
	// Reporting completeness strip: submitted / expected reports + completeness rate.
	// Baked data via prop: rows tagged with a `mode` (total/public/private); we show the row for
	// the shared ownership toggle. Public = the 5 public-type census forms, Private = the private
	// form, Total = all six. Never calls query().
	import { ownershipMode } from './ownership.js';
	export let data = [];
	$: r = (data || []).find((x) => x.mode === $ownershipMode) ?? (data || [])[0] ?? {};
	const int = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }));
	const pct = (v) => (v == null ? '—' : Number(v).toFixed(1) + '%');
</script>

<div class="rep">
	<div class="cell"><span class="lab"><i class="fa-solid fa-school"></i> Total schools</span><span class="v">{int(r.expected)}</span></div>
	<div class="cell"><span class="lab"><i class="fa-solid fa-file-circle-check"></i> Schools reported</span><span class="v">{int(r.submitted)}</span></div>
	<div class="cell"><span class="lab"><i class="fa-solid fa-gauge-high"></i> Reporting rate</span><span class="v">{pct(r.completeness)}</span></div>
</div>

<style>
	.rep { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 12px 0 4px; }
	.cell { background: #f4faf6; border: 1px solid #dfeee6; border-radius: 8px; padding: 14px 16px 12px; min-height: 76px; display: flex; flex-direction: column; gap: 7px; }
	.lab { font-size: 12px; color: #5a6b73; font-weight: 600; }
	.lab i { color: #1a9c5b; margin-right: 5px; }
	.v { font-size: 28px; font-weight: 800; color: #0a3d2c; letter-spacing: -.4px; line-height: 1.1; }
	@media (max-width: 560px) { .rep { grid-template-columns: 1fr; } }
	:global(.dark) .cell { background: #18181b; border-color: #3f3f46; }
	:global(.dark) .v { color: #e4e4e7; }
</style>
