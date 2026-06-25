// Thin DHIS2 Web API client. Auth: a personal-access token (preferred) or basic user/pwd.
// Chunked, resilient analytics fetch tuned for large / struggling instances:
//   • requests are split by dx-group AND by org-unit batch (explicit ids), so each call stays
//     small regardless of how many org units a level has (a single `ou:LEVEL-3` can ask for
//     hundreds of LGAs at once — too much for a busy DHIS2 40 instance);
//   • transient gateway errors (502/503/504, network drops) are retried with backoff;
//   • a persistently-failing group is skipped (logged) rather than aborting the run.
//
// Tunables (env): DX_CHUNK (dx per request, default 10), OU_CHUNK (org units per request,
// default 25), HTTP_RETRIES (default 4), HTTP_RETRY_BASE_MS (default 1000).
const DX_CHUNK = Number(process.env.DX_CHUNK) || 10;
const OU_CHUNK = Number(process.env.OU_CHUNK) || 25;
const MAX_RETRIES = Number(process.env.HTTP_RETRIES) || 4;
const RETRY_BASE_MS = Number(process.env.HTTP_RETRY_BASE_MS) || 1000;
const RETRYABLE = new Set([502, 503, 504]); // gateway / unavailable / timeout — transient
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class HttpError extends Error {
  constructor(status, path) { super(`DHIS2 ${status} for ${path}`); this.status = status; }
}

export function makeClient({ baseUrl, token, username, password }) {
  const auth = token
    ? `ApiToken ${token}`
    : 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

  // dx × level cuts skipped after exhausting retries — surfaced as a summary by the caller.
  const skips = [];

  // GET with retry/backoff on transient failures. Throws HttpError (with .status) on a
  // non-retryable HTTP error, or an Error with status undefined on a network error.
  async function getJson(path) {
    let attempt = 0;
    for (;;) {
      let res;
      try {
        res = await fetch(`${baseUrl}${path}`, { headers: { Authorization: auth, Accept: 'application/json' } });
      } catch (netErr) {                                   // DNS / socket / abort — transient
        if (attempt++ < MAX_RETRIES) { await sleep(backoff(attempt)); continue; }
        throw new Error(`network error for ${path}: ${netErr.message}`);
      }
      if (res.ok) return res.json();
      if (RETRYABLE.has(res.status) && attempt++ < MAX_RETRIES) { await sleep(backoff(attempt)); continue; }
      throw new HttpError(res.status, path);
    }
  }
  const backoff = (attempt) => Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), 15000) + Math.floor(Math.random() * 250);

  // extraDims: zero or more group-set (or other) dimension ids to disaggregate by. One id →
  // a single cut (e.g. Ownership); two → a cross-cut (e.g. School Type × Ownership).
  const asDims = (extra) => (Array.isArray(extra) ? extra : extra ? [extra] : []);
  // ouItems are ready-made `ou:` dimension tokens — explicit org-unit ids, or a `LEVEL-n`
  // fallback when no id list is available.
  const dimsURL = (dx, ouItems, periods, extra) =>
    `/api/analytics.json?dimension=dx:${dx.join(';')}` +
    `&dimension=ou:${ouItems.join(';')}` +
    `&dimension=pe:${periods.join(';')}` +
    asDims(extra).map((d) => `&dimension=${d}:`).join('') +
    `&skipMeta=false&displayProperty=NAME&paging=false`;

  // Fetch one dx-group for one org-unit batch. On failure:
  //   • transient (502/503/504 or network) AFTER retries → the server is unavailable; skip the
  //     whole group at once (bisecting a gateway error just hammers a struggling server);
  //   • structural (500/409/4xx) → bisect to isolate the single dx that errors (e.g. an MD
  //     school-count indicator that is genuinely undefined at LGA level returns 500), skipping
  //     only that dx so the others still contribute rows.
  async function fetchGroup(dxGroup, ouItems, periods, extraDim, level, label) {
    try {
      return [await getJson(dimsURL(dxGroup, ouItems, periods, extraDim))];
    } catch (e) {
      const transient = e.status == null || RETRYABLE.has(e.status);
      if (transient) {
        dxGroup.forEach((dx) => skips.push({ dx, level, label, status: e.message }));
        console.warn(`  [skip] ${dxGroup.length} dx @ LEVEL-${level}${label ? ` [${label}]` : ''}: ${e.message}`);
        return [];
      }
      if (dxGroup.length === 1) {
        skips.push({ dx: dxGroup[0], level, label, status: e.message });
        console.warn(`  [skip] dx ${dxGroup[0]} @ LEVEL-${level}${label ? ` [${label}]` : ''}: ${e.message}`);
        return [];
      }
      const mid = Math.ceil(dxGroup.length / 2);
      return [
        ...(await fetchGroup(dxGroup.slice(0, mid), ouItems, periods, extraDim, level, label)),
        ...(await fetchGroup(dxGroup.slice(mid), ouItems, periods, extraDim, level, label)),
      ];
    }
  }

  // Org-unit batches for a level: explicit-id chunks of OU_CHUNK (keeps each request small),
  // or a single `LEVEL-n` token when no id list was supplied.
  function ouBatches(level, ouIdsByLevel) {
    const ids = ouIdsByLevel?.[level];
    if (!ids || !ids.length) return [[`LEVEL-${level}`]];
    const out = [];
    for (let i = 0; i < ids.length; i += OU_CHUNK) out.push(ids.slice(i, i + OU_CHUNK));
    return out;
  }

  // opts: { ouIdsByLevel?: {level: [id,…]}, label?: string (for skip reporting) }
  async function analyticsChunked(dx, ouLevels, periods, extraDim, opts = {}) {
    const { ouIdsByLevel, label } = opts;
    const responses = [];
    for (const level of ouLevels) {
      for (const ouItems of ouBatches(level, ouIdsByLevel)) {
        for (let i = 0; i < dx.length; i += DX_CHUNK) {
          responses.push(...(await fetchGroup(dx.slice(i, i + DX_CHUNK), ouItems, periods, extraDim, level, label)));
        }
      }
    }
    return responses;
  }

  return {
    getJson,
    analytics: (dx, ouLevels, periods, extraDim) =>
      getJson(dimsURL(dx, ouLevels.map((l) => `LEVEL-${l}`), periods, extraDim)),
    analyticsChunked,
    getSkips: () => skips,
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
