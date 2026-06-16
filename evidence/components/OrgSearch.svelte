<script>
	// One general org-unit search (states + LGAs) replacing the separate State/LGA pickers.
	// Loads a small static index once (client-side, cached) and navigates to the chosen
	// unit's baked page — no query(), no per-page option bloat.
	import { onMount } from 'svelte';
	let units = [];            // [{label, link}]
	let value = '';
	onMount(async () => {
		try {
			const r = await fetch('/asc/search-index.json');
			units = await r.json();
		} catch (e) { /* index missing in dev — search just stays empty */ }
	});
	function go() {
		const u = units.find((u) => u.label === value);
		if (u) window.location.assign(u.link);
	}
</script>

<label class="orgsearch">
	<span class="lbl">Find a state or LGA</span>
	<input list="org-units" bind:value placeholder="type to search…" on:change={go} />
	<datalist id="org-units">
		{#each units as u}<option value={u.label}></option>{/each}
	</datalist>
</label>

<style>
	.orgsearch { display: flex; flex-direction: column; gap: 3px; }
	.lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .6px; font-weight: 700; color: #6b7872; }
	input { height: 34px; font-size: 12.5px; padding: 0 10px; border: 1px solid #bfe0cd; border-radius: 8px; background: #eaf5ee; color: #0a3d2c; font-weight: 600; min-width: 230px; }
	input::placeholder { color: #8fb3a0; font-weight: 400; }
	:global(.dark) input { background: #14321f; border-color: #1f5b38; color: #a7f3c8; }
</style>
