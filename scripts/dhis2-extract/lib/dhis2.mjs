// Thin DHIS2 Web API client. Auth: a personal-access token (preferred) or basic user/pwd;
// chunked analytics fetch.
export function makeClient({ baseUrl, token, username, password }) {
  const auth = token
    ? `ApiToken ${token}`
    : 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  async function getJson(path) {
    const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: auth, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`DHIS2 ${res.status} for ${path}`);
    return res.json();
  }
  // extraDims: zero or more group-set (or other) dimension ids to disaggregate by. One id →
  // a single cut (e.g. Ownership); two → a cross-cut (e.g. School Type × Ownership).
  const asDims = (extra) => (Array.isArray(extra) ? extra : extra ? [extra] : []);
  const dimsURL = (dx, ouLevels, periods, extra) =>
    `/api/analytics.json?dimension=dx:${dx.join(';')}` +
    `&dimension=ou:${ouLevels.map((l) => `LEVEL-${l}`).join(';')}` +
    `&dimension=pe:${periods.join(';')}` +
    asDims(extra).map((d) => `&dimension=${d}:`).join('') +
    `&skipMeta=false&displayProperty=NAME&paging=false`;

  // Cell-aware chunking: a single analytics request returns dx × ou cells, and large
  // instances cap that (DHIS2 returns 409 past ANALYTICS_MAX_LIMIT). Split into one call
  // per ou-level and per dx-group so each stays small, and merge the responses.
  const DX_CHUNK = 20;
  // Fetch one dx-group at one level; on failure bisect and retry, skipping the single dx that
  // errors. Some indicators are only defined at higher levels and return HTTP 500 when
  // requested at a deeper level (e.g. the MD school-count/report indicators at LGA) — skip
  // those rather than abort the whole extract; they simply contribute no rows at that level.
  async function fetchGroup(dxGroup, level, periods, extraDim) {
    try {
      return [await getJson(dimsURL(dxGroup, [level], periods, extraDim))];
    } catch (e) {
      if (dxGroup.length === 1) {
        console.warn(`  [skip] dx ${dxGroup[0]} @ LEVEL-${level}: ${e.message}`);
        return [];
      }
      const mid = Math.ceil(dxGroup.length / 2);
      return [
        ...(await fetchGroup(dxGroup.slice(0, mid), level, periods, extraDim)),
        ...(await fetchGroup(dxGroup.slice(mid), level, periods, extraDim)),
      ];
    }
  }
  async function analyticsChunked(dx, ouLevels, periods, extraDim) {
    const responses = [];
    for (const level of ouLevels) {
      for (let i = 0; i < dx.length; i += DX_CHUNK) {
        responses.push(...(await fetchGroup(dx.slice(i, i + DX_CHUNK), level, periods, extraDim)));
      }
    }
    return responses;
  }

  return {
    getJson,
    analytics: (dx, ouLevels, periods, extraDim) => getJson(dimsURL(dx, ouLevels, periods, extraDim)),
    analyticsChunked,
    geoFeatures: (level) => getJson(`/api/geoFeatures.json?ou=ou:LEVEL-${level}`),
    // Full org-unit hierarchy (incl. geometry-less units like the national root) for the dimension table.
    organisationUnits: (levels) =>
      getJson(`/api/organisationUnits.json?fields=id,name,level,parent[id,name],path` +
        `&filter=level:in:[${levels.join(',')}]&paging=false&order=level:asc`)
        .then((d) => d.organisationUnits ?? []),
  };
}

// Group periods into chunks bounded by count to keep URLs/responses sane.
export function chunkPeriods(periods, size = 24) {
  const out = [];
  for (let i = 0; i < periods.length; i += size) out.push(periods.slice(i, i + size));
  return out;
}
