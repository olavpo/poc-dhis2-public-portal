import { parsePeriod } from './periods.mjs';

const idx = (resp) => Object.fromEntries(resp.headers.map((h, i) => [h.name, i]));

export function analyticsToFactRows(resp) {
  const c = idx(resp);
  return resp.rows.map((r) => ({
    dx: r[c.dx], ou: r[c.ou], pe: r[c.pe],
    periodType: parsePeriod(r[c.pe]).periodType,
    value: Number(r[c.value]),
  }));
}

// One dimension → category_id/category_name (back-compat). Two+ → cat1_id/cat1_name,
// cat2_id/cat2_name, … (e.g. School Type × Ownership cross-cut).
export function analyticsToDisaggRows(resp, dimIds) {
  const dims = Array.isArray(dimIds) ? dimIds : [dimIds];
  const c = idx(resp);
  const items = resp.metaData?.items ?? {};
  const single = dims.length === 1;
  return resp.rows.map((r) => {
    const row = {
      dx: r[c.dx], ou: r[c.ou], pe: r[c.pe],
      periodType: parsePeriod(r[c.pe]).periodType,
    };
    dims.forEach((dimId, i) => {
      const id = r[c[dimId]];
      const name = items[id]?.name ?? id;
      if (single) { row.category_id = id; row.category_name = name; }
      else { row[`cat${i + 1}_id`] = id; row[`cat${i + 1}_name`] = name; }
    });
    row.value = Number(r[c.value]);
    return row;
  });
}

export function dxRowsFromMeta(responses, dxIds) {
  const want = new Set(dxIds);
  const seen = new Map();
  for (const resp of responses)
    for (const [id, v] of Object.entries(resp.metaData?.items ?? {}))
      if (want.has(id) && !seen.has(id)) seen.set(id, { id, name: v.name });
  return [...seen.values()];
}
