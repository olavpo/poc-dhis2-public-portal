<script>
	// Scope navigator: breadcrumb + cascading State / LGA selectors that navigate between
	// baked pages (option value = target URL). No query() — pure navigation.
	export let title = '';
	export let crumbs = [];      // [{name, link}] — current last (link null)
	export let selectors = [];   // [{label, value (current url|''), options:[{name, link}]}]
	export let year = '2024';
	function go(e) { const v = e.target.value; if (v) window.location.assign(v); }
</script>

<div class="subbar">
	<div>
		<h2>{title}</h2>
		<div class="crumb">
			{#each crumbs as c, i}{#if i}<span class="sep"> › </span>{/if}{#if c.link}<a href={c.link}>{c.name}</a>{:else}<b>{c.name}</b>{/if}{/each}
		</div>
	</div>
	<div class="controls">
		{#each selectors as s}
			<label class="sel">
				<span class="lbl">{s.label}</span>
				<select on:change={go}>
					{#each s.options as o}<option value={o.link} selected={o.link === s.value}>{o.name}</option>{/each}
				</select>
			</label>
		{/each}
		<span class="pill year" title="Year filter coming soon">{year} (future)</span>
	</div>
</div>

<style>
	.subbar { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 10px; margin: 4px 0 16px; }
	h2 { margin: 0; font-size: 18px; font-weight: 700; }
	.crumb { font-size: 12px; color: #879399; margin-top: 3px; }
	.crumb a { color: #13714a; text-decoration: none; }
	.crumb a:hover { text-decoration: underline; }
	.controls { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
	.sel { display: flex; flex-direction: column; gap: 2px; font-size: 10.5px; color: #6b7872; }
	.sel .lbl { text-transform: uppercase; letter-spacing: .6px; font-weight: 600; }
	.sel select { font-size: 12.5px; padding: 6px 9px; border: 1px solid #bfe0cd; border-radius: 7px; background: #eaf5ee; color: #0a3d2c; font-weight: 600; min-width: 150px; }
	.pill.year { align-self: flex-end; font-size: 12px; padding: 7px 11px; border-radius: 7px; background: #fff; border: 1px dashed #cdd3cf; color: #aab3ad; font-weight: 500; }
	:global(.dark) .sel select { background: #14321f; border-color: #1f5b38; color: #a7f3c8; }
</style>
