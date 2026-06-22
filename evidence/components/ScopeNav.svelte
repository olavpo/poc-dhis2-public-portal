<script>
	// Breadcrumb locator (also the way back up to Federal). The org-unit search + ownership
	// toggle live together in the control bar (see KpiRow). No query().
	import { base } from '$app/paths';
	export let crumbs = []; // [{name, link}] — current last (link null); links are already
	                        // base-prefixed by the page generator (raw <a href>, no addBasePath).
</script>

<nav class="crumb" aria-label="Breadcrumb">
	<a class="home" href="{base}/" title="Federal overview"><i class="fa-solid fa-house"></i></a>
	{#each crumbs as c, i}<span class="sep">›</span>{#if c.link}<a href={c.link}>{c.name}</a>{:else}<span class="here">{c.name}</span>{/if}{/each}
</nav>

<style>
	.crumb { font-size: 16px; font-weight: 600; color: #879399; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 2px 0 14px; }
	.crumb .home { color: #13714a; }
	.crumb a { color: #13714a; text-decoration: none; }
	.crumb a:hover { text-decoration: underline; }
	.crumb .sep { color: #c4ccd0; font-weight: 400; }
	.crumb .here { color: #1f2937; font-weight: 700; }
	:global(.dark) .crumb .here { color: #e4e4e7; }
</style>
