// Generate and parse DHIS2 period identifiers. Pure functions, no I/O.
const pad2 = (n) => String(n).padStart(2, '0');

export function expandPeriods(spec) {
  if (spec.list) return [...spec.list];
  const [from, to] = spec.range.split('..').map(Number);
  const types = spec.types ?? ['monthly', 'quarterly', 'yearly'];
  const out = [];
  for (let y = from; y <= to; y++) {
    if (types.includes('monthly')) for (let m = 1; m <= 12; m++) out.push(`${y}${pad2(m)}`);
    if (types.includes('quarterly')) for (let q = 1; q <= 4; q++) out.push(`${y}Q${q}`);
    if (types.includes('yearly')) out.push(`${y}`);
  }
  return out;
}

export function parsePeriod(period) {
  let m;
  if ((m = /^(\d{4})(\d{2})$/.exec(period))) {
    const year = +m[1], month = +m[2];
    return { period, periodType: 'MONTHLY', year, quarter: Math.ceil(month / 3), month,
             startDate: `${m[1]}-${m[2]}-01` };
  }
  if ((m = /^(\d{4})Q([1-4])$/.exec(period))) {
    const year = +m[1], quarter = +m[2];
    return { period, periodType: 'QUARTERLY', year, quarter, month: null,
             startDate: `${m[1]}-${pad2((quarter - 1) * 3 + 1)}-01` };
  }
  if ((m = /^(\d{4})$/.exec(period))) {
    return { period, periodType: 'YEARLY', year: +m[1], quarter: null, month: null,
             startDate: `${m[1]}-01-01` };
  }
  throw new Error(`Unrecognised period: ${period}`);
}
