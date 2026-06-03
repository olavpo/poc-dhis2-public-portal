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

export function analyticsToDisaggRows(resp, dimId) {
  const c = idx(resp);
  const items = resp.metaData?.items ?? {};
  return resp.rows.map((r) => ({
    dx: r[c.dx], ou: r[c.ou], pe: r[c.pe],
    periodType: parsePeriod(r[c.pe]).periodType,
    category_id: r[c[dimId]],
    category_name: items[r[c[dimId]]]?.name ?? r[c[dimId]],
    value: Number(r[c.value]),
  }));
}

export function dxRowsFromMeta(responses, dxIds) {
  const want = new Set(dxIds);
  const seen = new Map();
  for (const resp of responses)
    for (const [id, v] of Object.entries(resp.metaData?.items ?? {}))
      if (want.has(id) && !seen.has(id)) seen.set(id, { id, name: v.name });
  return [...seen.values()];
}
