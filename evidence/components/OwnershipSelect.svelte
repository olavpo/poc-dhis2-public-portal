<script>
	// Picks one of three baked Evidence query results (Total / Public / Private) by the shared
	// ownership toggle and exposes it via the slot, so a *native* Evidence chart/map/table
	// receives a genuine query result (which it subscribes to and may .fetch()). Passing a
	// filtered array or a derived store breaks AreaMap (it calls data.fetch()), so we select
	// among real query objects rather than transforming the rows.
	//   <OwnershipSelect total={q_total} pub={q_public} priv={q_private} let:data>
	//     <BarChart {data} … />
	//   </OwnershipSelect>
	import { ownershipMode } from './ownership.js';
	export let total = [];
	export let pub = [];
	export let priv = [];
	$: selected = $ownershipMode === 'public' ? pub : $ownershipMode === 'private' ? priv : total;
</script>

<slot data={selected} />
