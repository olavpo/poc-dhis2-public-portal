<script>
	// Engine pre-warm for LGA drill-down. Federal/State pages are baked (0 wasm); the LGA
	// route is the one client-rendered page, so the first drill-down pays the DuckDB-WASM
	// cold start: download the ~6 MB engine, autoload the parquet/httpfs extensions from
	// extensions.duckdb.org, register + fetch the census parquet. That's the "noticeable
	// delay" when clicking into an LGA.
	//
	// This component hides most of it WITHOUT eagerly booting the engine on every baked page
	// (which would break the 0-wasm property). It watches for *intent* — a hover / focus /
	// touch on any LGA link — and on the FIRST such signal kicks off a throwaway query in the
	// background. That boots the engine + extensions + warms one parquet, all cached, so the
	// real LGA page mounts against a hot engine. A visitor who never moves toward an LGA never
	// downloads the engine.
	//
	// Reversible: delete this file and the single <LgaPrefetch /> in template.mjs.
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	// Module-level so the warm happens at most once per browser session, even as the user
	// navigates between baked State pages (each remounts this component).
	let warmed = false;

	function warm() {
		if (warmed) return;
		warmed = true;
		const db = $page.data?.__db;
		if (!db) return;
		// __db.query awaits database_initialization (registers the manifest tables) and triggers
		// the lazy loadDB; touching a real table also autoloads the parquet extension and fetches
		// that parquet. Fire-and-forget; failure here is harmless (the LGA page re-queries).
		Promise.resolve(db.query('select 1 from census.fact limit 1')).catch(() => {});
	}

	onMount(() => {
		// Intent = pointer/focus/touch landing on (or bubbling up from) an LGA link.
		const onIntent = (e) => {
			const a = e.target?.closest?.('a[href*="/asc/lga/"]');
			if (a) warm();
		};
		const opts = { capture: true, passive: true };
		// pointerover bubbles (mouseenter doesn't), covering hover for table + map links;
		// focusin covers keyboard nav; touchstart covers tap-intent on mobile.
		document.addEventListener('pointerover', onIntent, opts);
		document.addEventListener('focusin', onIntent, opts);
		document.addEventListener('touchstart', onIntent, opts);
		return () => {
			document.removeEventListener('pointerover', onIntent, opts);
			document.removeEventListener('focusin', onIntent, opts);
			document.removeEventListener('touchstart', onIntent, opts);
		};
	});
</script>
