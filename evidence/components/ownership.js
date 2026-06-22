import { writable } from 'svelte/store';

// Shared Total / Public / Private selection. The KpiRow segmented toggle writes it; the KPI
// tiles, the compare table (which sits far below the toggle) and the table's mode label all
// read it. Module-level singleton, so every component on the page shares one value. Default
// 'total'. Purely client-side reactive state — no query/engine involved.
export const ownershipMode = writable('total');
