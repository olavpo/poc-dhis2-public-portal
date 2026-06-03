<script>
	// Self-contained org-unit profile. Works in two modes, both client-side (DuckDB-WASM):
	//   • browse  — pick an org unit from the selector
	//   • deep link — arrive at /anc/profile?ou=<id> (e.g. by clicking a district on a map)
	// Everything runs in the browser engine, so it must be gated behind onMount:
	// $page.url.searchParams throws during prerender, and query() needs the loaded engine.
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	// Use the layout's query function ($page.data.__db.query) rather than calling the raw
	// client-duckdb query() directly: __db.query awaits `database_initialization`, which
	// registers the manifest's anc.* tables. Calling the raw engine query on a page with no
	// other queries skips that registration and times out ("Timeout while initializing database").
	$: db = $page.data?.__db;
	const query = (sql) => db.query(sql);

	let mounted = false;
	let units = [];
	let selectedOu = null;
	let ou = null; // resolved {id,name,level,parent}
	let indicators = []; // [{indicator, value, rate}]
	let refYear = '';
	let loading = false;
	let error = null;

	const LEVEL = { 1: 'National', 2: 'District', 3: 'Chiefdom', 4: 'Facility' };
	const safe = (s) => (s && /^[A-Za-z0-9]+$/.test(s) ? s : null); // guard SQL interpolation
	const isRate = (name) => /coverage/i.test(name); // coverage indicators are percentages

	async function loadUnits() {
		const d = await query(
			`select id, name, level from anc.ou where level in (1,2,3) order by level, name`
		);
		units = [...d].map((r) => ({ id: String(r.id), name: String(r.name), level: Number(r.level) }));
	}

	async function loadProfile(id) {
		loading = true;
		error = null;
		try {
			const meta = await query(
				`select o.name, o.level, o.parent_name as parent from anc.ou o where o.id = '${id}'`
			);
			const m = [...meta][0];
			ou = m
				? { id, name: String(m.name), level: Number(m.level), parent: m.parent ? String(m.parent) : '' }
				: { id, name: id, level: null, parent: '' };
			const yr = await query(`select max(pe) as y from anc.fact where periodType='YEARLY'`);
			refYear = String([...yr][0]?.y ?? '');
			const rows = await query(
				`select d.name as indicator, f.value as value
				 from anc.fact f join anc.dx d on f.dx = d.id
				 where f.ou = '${id}' and f.periodType = 'YEARLY' and f.pe = '${refYear}'
				 order by d.name`
			);
			indicators = [...rows].map((r) => ({
				indicator: String(r.indicator),
				value: Number(r.value),
				rate: isRate(String(r.indicator))
			}));
		} catch (e) {
			error = String(e);
			indicators = [];
		}
		loading = false;
	}

	const fmt = (v, rate) =>
		rate ? `${v.toFixed(1)}%` : v.toLocaleString('en-US', { maximumFractionDigits: 0 });

	onMount(() => {
		mounted = true;
		loadUnits();
	});

	// Initialise selection from ?ou= (deep link) or fall back to the national unit / first option.
	$: if (mounted && units.length && selectedOu === null) {
		const fromUrl = safe($page.url.searchParams.get('ou'));
		selectedOu = fromUrl ?? (units.find((u) => u.level === 1)?.id ?? units[0].id);
	}
	$: if (mounted && safe(selectedOu)) loadProfile(selectedOu);

	$: rateCards = indicators.filter((i) => i.rate);
	$: countRows = indicators.filter((i) => !i.rate);
</script>

<div class="oup">
	<label class="oup-pick">
		<span>Org unit</span>
		<select bind:value={selectedOu}>
			{#each units as u}
				<option value={u.id}>{'  '.repeat(u.level - 1)}{u.name}</option>
			{/each}
		</select>
	</label>

	{#if error}
		<p class="oup-msg">Could not load this profile.</p>
	{:else if !ou || loading}
		<p class="oup-msg">Loading profile…</p>
	{:else}
		<h2 class="oup-title">{ou.name}</h2>
		<p class="oup-sub">{[LEVEL[ou.level] ?? 'Org unit', ou.parent].filter(Boolean).join(' · ')} · Antenatal care, {refYear}</p>

		<div class="oup-cards">
			{#each rateCards as c}
				<div class="oup-card">
					<div class="oup-card-val">{fmt(c.value, true)}</div>
					<div class="oup-card-lbl">{c.indicator}</div>
				</div>
			{/each}
		</div>

		{#if countRows.length}
			<table class="oup-table">
				<thead><tr><th>Indicator</th><th class="oup-num">Value ({refYear})</th></tr></thead>
				<tbody>
					{#each countRows as r}
						<tr><td>{r.indicator}</td><td class="oup-num">{fmt(r.value, false)}</td></tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{/if}
</div>

<style>
	.oup { margin: 0.5rem 0 1.5rem; }
	.oup-pick { display: inline-flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; font-size: 0.85rem; color: var(--grey-600, #52525b); }
	.oup-pick select { padding: 0.35rem 0.5rem; border: 1px solid var(--grey-300, #d4d4d8); border-radius: 6px; background: var(--base-100, #fff); font-size: 0.9rem; }
	.oup-title { margin: 0; font-size: 1.5rem; font-weight: 700; }
	.oup-sub { margin: 0.15rem 0 1rem; color: var(--grey-500, #71717a); font-size: 0.85rem; }
	.oup-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin-bottom: 1.25rem; }
	.oup-card { border: 1px solid var(--grey-200, #e4e4e7); border-radius: 8px; padding: 0.85rem 1rem; background: var(--base-100, #fff); }
	.oup-card-val { font-size: 1.6rem; font-weight: 700; color: #1f6aa5; line-height: 1.1; }
	.oup-card-lbl { font-size: 0.78rem; color: var(--grey-500, #71717a); margin-top: 0.25rem; }
	.oup-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
	.oup-table th { text-align: left; border-bottom: 2px solid var(--grey-200, #e4e4e7); padding: 0.4rem 0.5rem; color: var(--grey-600, #52525b); font-weight: 600; }
	.oup-table td { border-bottom: 1px solid var(--grey-100, #f4f4f5); padding: 0.4rem 0.5rem; }
	.oup-num { text-align: right; font-variant-numeric: tabular-nums; }
	.oup-msg { color: var(--grey-500, #71717a); font-style: italic; }
	:global(.dark) .oup-card-val { color: #71b9f4; }
</style>
