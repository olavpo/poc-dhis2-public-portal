// Thin DHIS2 Web API client. Auth from constructor; chunked analytics fetch.
export function makeClient({ baseUrl, username, password }) {
  const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
  async function getJson(path) {
    const res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: auth, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`DHIS2 ${res.status} for ${path}`);
    return res.json();
  }
  const dimsURL = (dx, ouLevels, periods, extraDim) =>
    `/api/analytics.json?dimension=dx:${dx.join(';')}` +
    `&dimension=ou:${ouLevels.map((l) => `LEVEL-${l}`).join(';')}` +
    `&dimension=pe:${periods.join(';')}` +
    (extraDim ? `&dimension=${extraDim}:` : '') +
    `&skipMeta=false&displayProperty=NAME&paging=false`;

  return {
    getJson,
    analytics: (dx, ouLevels, periods, extraDim) => getJson(dimsURL(dx, ouLevels, periods, extraDim)),
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
