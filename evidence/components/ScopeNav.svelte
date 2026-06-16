<script>
	// Scope navigator: breadcrumb + always-visible, searchable State / LGA selectors that
	// navigate between baked pages. LGA is disabled until a state is selected. No query().
	export let title = '';
	export let crumbs = [];      // [{name, link}] — current last (link null)
	export let selectors = [];   // [{label, currentName, disabled, options:[{name, link}]}]
	function pick(e, options) {
		const o = options.find((o) => o.name === e.target.value);
		if (o && o.link) window.location.assign(o.link);
	}
</script>

<div class="subbar">
	<div>
		<h2>{title}</h2>
		<div class="crumb">
			{#each crumbs as c, i}{#if i}<span class="sep"> › </span>{/if}{#if c.link}<a href={c.link}>{c.name}</a>{:else}<b>{c.name}</b>{/if}{/each}
		</div>
	</div>
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
	.subbar { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 10px; margin: 4px 0 16px; }
	h2 { margin: 0; font-size: 18px; font-weight: 700; }
	.crumb { font-size: 12px; color: #879399; margin-top: 3px; }
	.crumb a { color: #13714a; text-decoration: none; }
	.crumb a:hover { text-decoration: underline; }
	.controls { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
	.sel { display: flex; flex-direction: column; gap: 2px; font-size: 10.5px; color: #6b7872; }
	.sel .lbl { text-transform: uppercase; letter-spacing: .6px; font-weight: 600; }
	.sel input { font-size: 12.5px; padding: 6px 9px; border: 1px solid #bfe0cd; border-radius: 7px; background: #eaf5ee; color: #0a3d2c; font-weight: 600; min-width: 170px; }
	.sel input::placeholder { color: #8fb3a0; font-weight: 400; }
	.sel.disabled input { background: #f3f4f6; border-color: #e0e0e0; color: #aab3ad; cursor: not-allowed; }
	:global(.dark) .sel input { background: #14321f; border-color: #1f5b38; color: #a7f3c8; }
	:global(.dark) .sel.disabled input { background: #27272a; border-color: #3f3f46; }
</style>
