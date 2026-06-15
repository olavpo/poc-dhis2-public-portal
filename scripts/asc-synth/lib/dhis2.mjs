// scripts/asc-synth/lib/dhis2.mjs
const base = () => (process.env.DHIS2_BASE_URL || 'http://dhis2-agent-asc-ind:8080').replace(/\/$/, '');
const auth = () => 'Basic ' + Buffer.from(`${process.env.DHIS2_USERNAME}:${process.env.DHIS2_PASSWORD}`).toString('base64');

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(base() + path, {
    method,
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

export const get = (p) => api(p);

// Return { [dataElementId]: {name, cocs:[id,...]} } for the given DE ids.
export async function dataElementInfo(deIds) {
  const out = {};
  const chunk = 100;
  for (let i = 0; i < deIds.length; i += chunk) {
    const ids = deIds.slice(i, i + chunk).join(',');
    const r = await api(`/api/dataElements.json?paging=false&fields=id,name,categoryCombo[categoryOptionCombos[id]]&filter=id:in:[${ids}]`);
    for (const de of r.dataElements) out[de.id] = { name: de.name, cocs: (de.categoryCombo?.categoryOptionCombos || []).map((c) => c.id) };
  }
  return out;
}

// Import metadata (orgUnitLevels, organisationUnits with geometry, org unit group memberships).
export const postMetadata = (payload) =>
  api('/api/metadata?importStrategy=CREATE_AND_UPDATE&atomicMode=NONE&mergeMode=MERGE', { method: 'POST', body: payload });

// Assign the importing user's data-capture hierarchy to include rootId (so data values
// for the synthetic subtree pass the "org unit in user hierarchy" check, E7617).
export async function assignUserRoot(rootId) {
  const me = await api('/api/me.json?fields=id');
  await api(`/api/users/${me.id}/organisationUnits/${rootId}`, { method: 'POST' });        // data capture (import)
  await api(`/api/users/${me.id}/dataViewOrganisationUnits/${rootId}`, { method: 'POST' }); // analytics view (extract)
}

// Import data values in bulk. dataValueSets returns 409 for partial WARNING (some rows
// conflict) — that's not fatal here, so return the parsed body regardless of status.
export async function postDataValues(dataValues) {
  const res = await fetch(base() + '/api/dataValueSets?importStrategy=CREATE_AND_UPDATE&skipAudit=true&force=true', {
    method: 'POST',
    headers: { Authorization: auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataValues }),
  });
  const body = await res.json();
  return body.response || body; // {importCount, conflicts, status}
}

// Add org units to a group via the collection endpoint (avoids full-object validation).
export const addToGroup = (groupId, ouIds) =>
  api(`/api/organisationUnitGroups/${groupId}/organisationUnits`, {
    method: 'POST', body: { identifiableObjects: ouIds.map((id) => ({ id })) },
  });

// Kick off analytics and poll to completion. The task endpoint returns either an array
// (latest run's notifications) or an object keyed by task id; the run is done when its
// most recent notification has completed:true.
export async function runAnalytics() {
  await api('/api/resourceTables/analytics?skipResourceTables=false&lastYears=3', { method: 'POST' });
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const tasks = await api('/api/system/tasks/ANALYTICS_TABLE.json');
      const notes = Array.isArray(tasks) ? tasks : Object.values(tasks || {}).flat();
      if (!notes.length) continue;
      const latest = notes.reduce((a, b) => (new Date(b.time) >= new Date(a.time) ? b : a));
      if (latest.completed === true) return;
    } catch { /* poll shape varies; keep waiting */ }
  }
  throw new Error('analytics did not complete within timeout');
}
