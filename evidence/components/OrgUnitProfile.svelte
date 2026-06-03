<script>
	import { page } from '$app/stores';
	import { query } from '@evidence-dev/universal-sql/client-duckdb';
	import { onMount } from 'svelte';

	// Client-only: this section reads the `?ou=` query string and queries the manifest
	// tables in DuckDB-WASM. It must NOT touch either during SSR/prerender:
	//  - `$page.url.searchParams` THROWS during prerender ("Cannot access url.searchParams
	//    on a page with prerendering enabled"), and
	//  - `query()` needs the browser engine + the parquet views the layout registers.
	// So gate everything behind onMount — mirroring the established SchoolExplorer-style pattern.
	let mounted = false;
	onMount(() => {
		mounted = true;
	});

	// Read the deep-link target, e.g. /anc/profile?ou=O6uvpzGd5pu (browser only).
	$: ouId = mounted ? $page.url.searchParams.get('ou') : null;

	// Defensive: only allow DHIS2-style ids so we never inject odd characters
	// into the SQL string. If it doesn't look like an id, treat as absent.
	$: safeOu = ouId && /^[A-Za-z0-9]+$/.test(ouId) ? ouId : null;

	let rows = [];
	let loading = false;
	let error = null;

	async function load(ou) {
		loading = true;
		error = null;
		try {
			const data = await query(
				`select d.name as indicator, f.value as value
				 from anc.fact f join anc.dx d on f.dx = d.id
				 where f.ou = '${ou}' and f.periodType = 'YEARLY'
				   and f.pe = (select max(pe) from anc.fact where periodType = 'YEARLY')
				 order by d.name`
			);
			rows = [...data].map((r) => ({ indicator: String(r.indicator), value: Number(r.value) }));
		} catch (e) {
			error = String(e);
			rows = [];
		}
		loading = false;
	}

	$: if (mounted && safeOu) load(safeOu);
</script>

{#if safeOu}
	<div class="org-unit-profile">
		<h3>Profile for {safeOu} (deep link)</h3>
		{#if loading}
			<p>Loading profile for <code>{safeOu}</code>…</p>
		{:else if error}
			<p>Could not load profile for <code>{safeOu}</code>.</p>
		{:else if rows.length === 0}
			<p>No annual indicators found for <code>{safeOu}</code>.</p>
		{:else}
			<ul>
				{#each rows as r}
					<li>{r.indicator}: {r.value}</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
