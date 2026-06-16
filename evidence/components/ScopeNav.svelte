<script>
	// Scope navigator: a prominent clickable breadcrumb (the page locator — also the way
	// back up to Federal) + always-visible, searchable State / LGA selectors that navigate
	// between baked pages. LGA is disabled until a state is selected. No query().
	export let crumbs = [];      // [{name, link}] — current last (link null)
	export let selectors = [];   // [{label, currentName, disabled, options:[{name, link}]}]
	function pick(e, options) {
		const o = options.find((o) => o.name === e.target.value);
		if (o && o.link) window.location.assign(o.link);
	}
</script>

<div class="subbar">
	<nav class="crumb" aria-label="Breadcrumb">
		<a class="home" href="/" title="Federal overview"><i class="fa-solid fa-house"></i></a>
		{#each crumbs as c, i}<span class="sep">›</span>{#if c.link}<a href={c.link}>{c.name}</a>{:else}<span class="here">{c.name}</span>{/if}{/each}
	</nav>
	<div class="controls">
		{#each selectors as s, i}
			<label class="sel" class:disabled={s.disabled}>
				<span class="lbl">{s.label}</span>
				<input
					list={'scopedl-' + i}
					value={s.currentName}
					placeholder={s.disabled ? 'select a state first' : 'type to search…'}
					disabled={s.disabled}
					on:change={(e) => pick(e, s.options)} />
				<datalist id={'scopedl-' + i}>
					{#each s.options as o}<option value={o.name}></option>{/each}
				</datalist>
			</label>
		{/each}
	</div>
</div>

<style>
	.subbar { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin: 4px 0 16px; }
	.crumb { font-size: 16px; font-weight: 600; color: #879399; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
	.crumb .home { color: #13714a; }
	.crumb a { color: #13714a; text-decoration: none; }
	.crumb a:hover { text-decoration: underline; }
	.crumb .sep { color: #c4ccd0; font-weight: 400; }
	.crumb .here { color: #1f2937; font-weight: 700; }
	.controls { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
	.sel { display: flex; flex-direction: column; gap: 2px; font-size: 10.5px; color: #6b7872; }
	.sel .lbl { text-transform: uppercase; letter-spacing: .6px; font-weight: 600; }
	.sel input { font-size: 12.5px; padding: 6px 9px; border: 1px solid #bfe0cd; border-radius: 7px; background: #eaf5ee; color: #0a3d2c; font-weight: 600; min-width: 170px; }
	.sel input::placeholder { color: #8fb3a0; font-weight: 400; }
	.sel.disabled input { background: #f3f4f6; border-color: #e0e0e0; color: #aab3ad; cursor: not-allowed; }
	:global(.dark) .crumb .here { color: #e4e4e7; }
	:global(.dark) .sel input { background: #14321f; border-color: #1f5b38; color: #a7f3c8; }
	:global(.dark) .sel.disabled input { background: #27272a; border-color: #3f3f46; }
</style>
