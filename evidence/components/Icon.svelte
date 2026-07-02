<script>
	// Self-hosted stand-in for a Font Awesome <i class="fa-solid fa-x"> glyph. No <style> block
	// here on purpose: fill/size are plain attributes so they inherit color/font-size from
	// whatever element hosts <Icon>, the same way the FA font glyph used to. See icons.js for
	// the path data and evidence/components/*.svelte for callers.
	import { ICONS } from './icons.js';
	export let name;
	$: [viewBox, d] = ICONS[name] || [];
</script>

{#if d}
	<svg {viewBox} width="1em" height="1em" fill="currentColor" style="vertical-align:-.125em" aria-hidden="true" focusable="false"><path {d} /></svg>
{/if}
