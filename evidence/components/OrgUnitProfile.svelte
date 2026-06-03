<script>
	import { page } from '$app/stores';
	import { buildQuery } from '@evidence-dev/component-utilities/buildQuery';

	// Read the deep-link target, e.g. /anc/profile?ou=O6uvpzGd5pu
	// `$page` is available during SSR/prerender too, so guard on a missing param:
	// when there is no `?ou=`, `ouId` is null and we render nothing.
	$: ouId = $page.url.searchParams.get('ou');

	// Defensive: only allow DHIS2-style ids so we never inject odd characters
	// into the SQL string. If it doesn't look like an id, treat as absent.
	$: safeOu = ouId && /^[A-Za-z0-9]+$/.test(ouId) ? ouId : null;

	// buildQuery(queryString, id, initialData?, opts?) -> reactive Query store
	// (verified against @evidence-dev/component-utilities 4.0.13 +
	// @evidence-dev/sdk 4.0.2: buildQuery returns Query.create(...), a store whose
	// dereferenced value ($q) is an array-like proxy of rows).
	$: q = safeOu
		? buildQuery(
				`select d.name as indicator, f.value as value
				 from anc.fact f join anc.dx d on f.dx=d.id
				 where f.ou = '${safeOu}' and f.periodType='YEARLY'
				   and f.pe = (select max(pe) from anc.fact where periodType='YEARLY')
				 order by d.name`,
				`org_unit_profile_${safeOu}`
			)
		: null;
</script>

{#if safeOu && q}
	<div class="org-unit-profile">
		<h3>Profile for {safeOu} (deep link)</h3>
		{#if $q.error}
			<p>Could not load profile for <code>{safeOu}</code>.</p>
		{:else if $q.length === 0}
			<p>No annual indicators found for <code>{safeOu}</code>.</p>
		{:else}
			<ul>
				{#each [...$q] as r}
					<li>{r.indicator}: {r.value}</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
