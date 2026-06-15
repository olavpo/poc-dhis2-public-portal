# DNEMIS ASC Public Portal — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully-baked, static public ASC (Annual School Census) portal on the Evidence/DuckDB-WASM foundation — DNEMIS module nav on top, Superset-styled ASC dashboard below, with a Federal→State→LGA drill-down — fed by the real 67 ASC indicators in `agent-asc-ind` over a synthetic Nigeria geography.

**Architecture:** A one-off Node **generator** (`scripts/asc-synth/`) adds org-unit levels + a synthetic Nigeria hierarchy + geometry to the instance and imports deterministic dummy `dataValueSets` for the real 108 data elements, then runs analytics. The **generic extractor** (`scripts/dhis2-extract/`, reused) pulls the 67 indicators at levels 1–3 (yearly 2023–2024, Ownership group-set disaggregation) into tidy CSVs + GeoJSON. A **page generator** writes one baked `.md` per org unit (1 federal + 6 state + 24 LGA) from a shared template; each page's SQL filters by a literal OU id, so everything bakes with no client engine. Superset look via Evidence theme + presentational Svelte components; DNEMIS chrome via the existing `patch-evidence.mjs`.

**Tech Stack:** Node ≥18 (ESM `.mjs`, global `fetch`), Vitest, DHIS2 Web API (metadata + dataValueSets + analytics), Evidence (SvelteKit/mdsvex + ECharts), DuckDB (build-time), YAML.

**Spec:** `docs/superpowers/specs/2026-06-15-emis-asc-public-portal-design.md`

---

## Conventions (read once)

- **Instance:** `http://dhis2-agent-asc-ind:8080`, auth `admin`/`district`. Reachable on dev-net. Set `DHIS2_USERNAME=admin DHIS2_PASSWORD=district` (and for the generator `DHIS2_BASE_URL=http://dhis2-agent-asc-ind:8080`).
- **Already in the instance (DO NOT create/modify):** the 67 indicators, their 108 data elements, indicator types `jEvXVGHRCsj` (Number ×1) / `D0J1oRr1ESx` (Percentage ×100), and the org-unit group set **"Ownership (test)"** with groups Public/Private.
- **Foundation gotchas (CLAUDE.md):** keep ```` ```sql ```` blocks OUTSIDE `<Grid>`; no raw-HTML wrappers around components; filter `periodType` in every fact query; `ou.csv.path` is **ancestor-only (self excluded)** — we scope children by `parent_id = '<id>'`, never path-matching; empty numeric CSV cells type as DOUBLE (filter `is not null`); author all cross-linked pages before building.
- **Determinism:** never use `Math.random()` in generator libs (breaks re-runs and is banned in some contexts) — derive all values from a seeded hash of ids.
- **Commit cadence:** each task ends with a commit. Branch is `emis-pp` (already checked out).
- **Counts (fixed):** 1 Nation + 6 States + 4 LGAs/state (24) + 12 Schools/LGA (288) = 319 OUs. **Schools are invisible data-entry leaves only** — they carry values + the Public/Private classification but are never extracted, paged, or mapped. The portal stops at **LGA**. Pages = 1 + 6 + 24 = 31; LGA pages are leaves. **Choropleths only — no point maps.** Geometry is generated for **levels 1–3 only**; schools get none.

---

## File Structure

**New — synthetic generator** (`scripts/asc-synth/`):
- `lib/hash.mjs` — deterministic seeded hash + ranged number (pure).
- `lib/hierarchy.mjs` — build the Nation→State→LGA→School tree with stable UIDs/names (pure).
- `lib/geometry.mjs` — tessellate nested polygons over a Nigeria bbox + scatter school points (pure).
- `lib/values.mjs` — deterministic dummy value for `(ou, dataElement, coc, period)` (pure).
- `lib/dhis2.mjs` — API client: GET COCs/levels, POST metadata, POST dataValueSets, run+poll analytics (side-effecting).
- `index.mjs` — CLI orchestration.
- `lib/*.test.mjs` — colocated Vitest tests for the pure libs.

**New — extractor config:** `scripts/dhis2-extract/config/asc.yaml`.

**New — Evidence source:** `evidence/sources/asc/connection.yaml`; generated CSVs + `evidence/static/asc.geojson`.

**New — page generator:** `scripts/asc-pages/generate.mjs` + `scripts/asc-pages/template.mjs` (shared page template), writing `evidence/pages/index.md` (federal) + `evidence/pages/asc/state-<id>.md` + `evidence/pages/asc/lga-<id>.md`.

**New — components:** `evidence/components/SupersetBigNumber.svelte`, `CompareTable.svelte`, `ScopeNav.svelte`. (No gauge — the real 67-indicator set has no "reporting rate" metric; the mockup's gauge was illustrative. Add one later only if a reporting-rate indicator is introduced.)

**Modify:**
- `package.json` — add `synth:asc`, `extract:asc`, `pages:asc` scripts; wire `pages:asc` into `build`.
- `evidence/evidence.config.yaml` — Superset categorical palette + theme.
- `evidence/scripts/patch-evidence.mjs` — DNEMIS header/nav + Inter font (idempotent patch).

---

## Phase 1 — Synthetic generator

### Task 1: Deterministic hash + ranged-number util

**Files:**
- Create: `scripts/asc-synth/lib/hash.mjs`
- Test: `scripts/asc-synth/lib/hash.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// scripts/asc-synth/lib/hash.test.mjs
import { describe, it, expect } from 'vitest';
import { hash32, ranged } from './hash.mjs';

describe('hash32', () => {
  it('is deterministic for the same input', () => {
    expect(hash32('abc')).toBe(hash32('abc'));
  });
  it('differs for different input', () => {
    expect(hash32('abc')).not.toBe(hash32('abd'));
  });
  it('returns a non-negative 32-bit integer', () => {
    const h = hash32('anything');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe('ranged', () => {
  it('maps a seed into [min,max] deterministically', () => {
    const v = ranged('seed-x', 100, 200);
    expect(v).toBe(ranged('seed-x', 100, 200));
    expect(v).toBeGreaterThanOrEqual(100);
    expect(v).toBeLessThanOrEqual(200);
  });
  it('spreads across the range for different seeds', () => {
    const vals = Array.from({ length: 50 }, (_, i) => ranged('s' + i, 0, 1000));
    const uniq = new Set(vals);
    expect(uniq.size).toBeGreaterThan(20);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run scripts/asc-synth/lib/hash.test.mjs`
Expected: FAIL — `Cannot find module './hash.mjs'`.

- [ ] **Step 3: Implement**

```js
// scripts/asc-synth/lib/hash.mjs
// Deterministic FNV-1a 32-bit hash — no Math.random, stable across runs.
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Map a seed string deterministically into an integer in [min, max].
export function ranged(seed, min, max) {
  const span = max - min + 1;
  return min + (hash32(seed) % span);
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npx vitest run scripts/asc-synth/lib/hash.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/asc-synth/lib/hash.mjs scripts/asc-synth/lib/hash.test.mjs
git commit -m "feat(asc-synth): deterministic hash + ranged number util"
```

### Task 2: Build the org-unit hierarchy

**Files:**
- Create: `scripts/asc-synth/lib/hierarchy.mjs`
- Test: `scripts/asc-synth/lib/hierarchy.test.mjs`

DHIS2 UIDs are 11 chars, `[A-Za-z][A-Za-z0-9]{10}`. Generate stable UIDs from a hash so re-runs reuse the same ids (idempotent import).

- [ ] **Step 1: Write the failing test**

```js
// scripts/asc-synth/lib/hierarchy.test.mjs
import { describe, it, expect } from 'vitest';
import { uid, buildHierarchy } from './hierarchy.mjs';

describe('uid', () => {
  it('produces a valid 11-char DHIS2 uid, stable per key', () => {
    const a = uid('state-1');
    expect(a).toMatch(/^[A-Za-z][A-Za-z0-9]{10}$/);
    expect(a).toBe(uid('state-1'));
  });
  it('is collision-free across the generated set', () => {
    const { units } = buildHierarchy();
    const ids = units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildHierarchy', () => {
  const { units, root } = buildHierarchy();
  it('has the fixed shape 1+6+24+288 = 319', () => {
    expect(units.length).toBe(319);
    const byLevel = (l) => units.filter((u) => u.level === l).length;
    expect(byLevel(1)).toBe(1);
    expect(byLevel(2)).toBe(6);
    expect(byLevel(3)).toBe(24);
    expect(byLevel(4)).toBe(288);
  });
  it('roots at a single level-1 nation with no parent', () => {
    expect(root.level).toBe(1);
    expect(root.parent).toBeNull();
  });
  it('every non-root has a parent that exists and is one level up', () => {
    const byId = Object.fromEntries(units.map((u) => [u.id, u]));
    for (const u of units) {
      if (u.level === 1) continue;
      expect(byId[u.parent]).toBeTruthy();
      expect(byId[u.parent].level).toBe(u.level - 1);
    }
  });
  it('assigns every school to exactly one ownership group (Public|Private)', () => {
    const schools = units.filter((u) => u.level === 4);
    expect(schools.every((s) => s.ownership === 'Public' || s.ownership === 'Private')).toBe(true);
    expect(schools.some((s) => s.ownership === 'Public')).toBe(true);
    expect(schools.some((s) => s.ownership === 'Private')).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run scripts/asc-synth/lib/hierarchy.test.mjs` → FAIL.

- [ ] **Step 3: Implement**

```js
// scripts/asc-synth/lib/hierarchy.mjs
import { hash32, ranged } from './hash.mjs';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ALNUM = ALPHA + '0123456789';

// Deterministic DHIS2 uid (11 chars, leading letter) from a key string.
export function uid(key) {
  let h = hash32(key);
  let out = ALPHA[h % ALPHA.length];
  for (let i = 0; i < 10; i++) {
    h = hash32(key + '#' + i);
    out += ALNUM[h % ALNUM.length];
  }
  return out;
}

// Plausible Nigerian state / LGA names (illustrative, synthetic).
const STATES = ['Kano', 'Lagos', 'Kaduna', 'Rivers', 'Oyo', 'Borno'];

export function buildHierarchy() {
  const N_STATES = 6, N_LGAS = 4, N_SCHOOLS = 12;
  const units = [];
  const root = { id: uid('nation'), name: 'Nigeria (Federal)', level: 1, parent: null, ownership: null };
  units.push(root);
  for (let s = 0; s < N_STATES; s++) {
    const stName = STATES[s];
    const st = { id: uid(`state-${s}`), name: `${stName} State`, level: 2, parent: root.id, ownership: null };
    units.push(st);
    for (let l = 0; l < N_LGAS; l++) {
      const lga = { id: uid(`lga-${s}-${l}`), name: `${stName} LGA ${l + 1}`, level: 3, parent: st.id, ownership: null };
      units.push(lga);
      for (let sc = 0; sc < N_SCHOOLS; sc++) {
        const key = `school-${s}-${l}-${sc}`;
        units.push({
          id: uid(key),
          name: `${stName} School ${l + 1}-${sc + 1}`,
          level: 4,
          parent: lga.id,
          // ~70% public, deterministic
          ownership: ranged(key + ':own', 0, 9) < 7 ? 'Public' : 'Private',
        });
      }
    }
  }
  return { units, root };
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(asc-synth): synthetic Nigeria org-unit hierarchy"`.

### Task 3: Synthetic nested geometry

**Files:**
- Create: `scripts/asc-synth/lib/geometry.mjs`
- Test: `scripts/asc-synth/lib/geometry.test.mjs`

Approach: partition a Nigeria-like bounding box (lon 2.7–14.7, lat 4.3–13.9) into a 3×2 grid of **states**; each state into a 2×2 grid of **LGAs**. Nation polygon = the whole bbox. All polygons are axis-aligned rectangles (valid GeoJSON `Polygon`), nested by construction. **Schools (level 4) get NO geometry** — they are never mapped (constraint: nothing below LGA).

- [ ] **Step 1: Write the failing test**

```js
// scripts/asc-synth/lib/geometry.test.mjs
import { describe, it, expect } from 'vitest';
import { buildHierarchy } from './hierarchy.mjs';
import { assignGeometry } from './geometry.mjs';

const { units } = buildHierarchy();
const geo = assignGeometry(units);

describe('assignGeometry', () => {
  it('gives every unit at levels 1-3 a Polygon', () => {
    for (const u of units.filter((u) => u.level <= 3)) {
      const g = geo[u.id];
      expect(g).toBeTruthy();
      expect(g.type).toBe('Polygon');
      expect(g.coordinates[0].length).toBeGreaterThanOrEqual(5); // closed ring
    }
  });
  it('assigns NO geometry to schools (level 4 are invisible data leaves)', () => {
    for (const u of units.filter((u) => u.level === 4)) expect(geo[u.id]).toBeUndefined();
  });
  it('includes the national root (level 1) geometry', () => {
    const root = units.find((u) => u.level === 1);
    expect(geo[root.id].type).toBe('Polygon');
  });
  it('is deterministic', () => {
    const geo2 = assignGeometry(units);
    expect(JSON.stringify(geo2)).toBe(JSON.stringify(geo));
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```js
// scripts/asc-synth/lib/geometry.mjs
const BBOX = { lon0: 2.7, lat0: 4.3, lon1: 14.7, lat1: 13.9 };
const rect = (lon0, lat0, lon1, lat1) => ({
  type: 'Polygon',
  coordinates: [[[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]],
});

// Grid the bbox: states 3 cols x 2 rows; LGAs 2x2 within a state.
// Levels 1-3 only — schools get no geometry (never mapped).
export function assignGeometry(units) {
  const geo = {};
  const root = units.find((u) => u.level === 1);
  geo[root.id] = rect(BBOX.lon0, BBOX.lat0, BBOX.lon1, BBOX.lat1);

  const states = units.filter((u) => u.level === 2);
  const sW = (BBOX.lon1 - BBOX.lon0) / 3, sH = (BBOX.lat1 - BBOX.lat0) / 2;
  states.forEach((st, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const lon0 = BBOX.lon0 + col * sW, lat0 = BBOX.lat0 + row * sH;
    geo[st.id] = rect(lon0, lat0, lon0 + sW, lat0 + sH);

    const lgas = units.filter((u) => u.parent === st.id);
    const lW = sW / 2, lH = sH / 2;
    lgas.forEach((lga, j) => {
      const lc = j % 2, lr = Math.floor(j / 2);
      const llon0 = lon0 + lc * lW, llat0 = lat0 + lr * lH;
      geo[lga.id] = rect(llon0, llat0, llon0 + lW, llat0 + lH);
      // schools (children of lga): intentionally no geometry
    });
  });
  return geo;
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(asc-synth): nested synthetic geometry (polygons + school points)"`.

### Task 4: Deterministic dummy values

**Files:**
- Create: `scripts/asc-synth/lib/values.mjs`
- Test: `scripts/asc-synth/lib/values.test.mjs`

Values are written only at **school** (leaf) OUs; DHIS2 aggregates up. The magnitude depends on the data element's semantics, inferred from its name (enrolment → hundreds; teachers → tens; ratios/percentages are computed by indicators, not stored). Signature: `valueFor(ou, de, coc, period)` where `de = {id, name}`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/asc-synth/lib/values.test.mjs
import { describe, it, expect } from 'vitest';
import { valueFor } from './values.mjs';

const school = { id: 'SchoolAAA01', level: 4 };
describe('valueFor', () => {
  it('is deterministic per (ou,de,coc,period)', () => {
    const a = valueFor(school, { id: 'd1', name: 'ASC-PRY Enrolment' }, 'cocX', '2024');
    const b = valueFor(school, { id: 'd1', name: 'ASC-PRY Enrolment' }, 'cocX', '2024');
    expect(a).toBe(b);
  });
  it('scales enrolment larger than teacher counts', () => {
    const enrol = valueFor(school, { id: 'd1', name: 'ASC-PRY Enrolment' }, 'c', '2024');
    const teach = valueFor(school, { id: 'd2', name: 'ASC-GEN Teachers' }, 'c', '2024');
    expect(enrol).toBeGreaterThan(teach);
  });
  it('varies by period (2024 != 2023)', () => {
    const y24 = valueFor(school, { id: 'd1', name: 'ASC-PRY Enrolment' }, 'c', '2024');
    const y23 = valueFor(school, { id: 'd1', name: 'ASC-PRY Enrolment' }, 'c', '2023');
    expect(y24).not.toBe(y23);
  });
  it('returns a non-negative integer', () => {
    const v = valueFor(school, { id: 'd1', name: 'ASC-PRY Enrolment' }, 'c', '2024');
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement**

```js
// scripts/asc-synth/lib/values.mjs
import { ranged } from './hash.mjs';

// Infer a plausible magnitude band from the data element name.
function band(name) {
  const n = name.toLowerCase();
  if (n.includes('enrol')) return [120, 900];
  if (n.includes('teacher') || n.includes('staff')) return [6, 60];
  if (n.includes('classroom') || n.includes('toilet') || n.includes('computer') || n.includes('room')) return [2, 40];
  if (n.includes('special') || n.includes('orphan') || n.includes('dropout') || n.includes('boarding')) return [0, 30];
  return [10, 200]; // default
}

export function valueFor(ou, de, coc, period) {
  const [min, max] = band(de.name || '');
  return ranged(`${ou.id}|${de.id}|${coc}|${period}`, min, max);
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git commit -m "feat(asc-synth): deterministic dummy values by DE band"`.

### Task 5: DHIS2 API client

**Files:**
- Create: `scripts/asc-synth/lib/dhis2.mjs`

Side-effecting; tested via the live run in Task 6 (not unit-tested — network). Provide focused functions.

- [ ] **Step 1: Implement the client**

```js
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

// Return { [dataElementId]: [cocId, ...] } for the given DE ids.
export async function categoryOptionCombos(deIds) {
  const out = {};
  const chunk = 100;
  for (let i = 0; i < deIds.length; i += chunk) {
    const ids = deIds.slice(i, i + chunk).join(',');
    const r = await api(`/api/dataElements.json?paging=false&fields=id,categoryCombo[categoryOptionCombos[id]]&filter=id:in:[${ids}]`);
    for (const de of r.dataElements) out[de.id] = (de.categoryCombo?.categoryOptionCombos || []).map((c) => c.id);
  }
  return out;
}

// Import metadata (orgUnitLevels, organisationUnits with geometry, org unit group memberships).
export const postMetadata = (payload) =>
  api('/api/metadata?importStrategy=CREATE_AND_UPDATE&atomicMode=NONE&mergeMode=MERGE', { method: 'POST', body: payload });

// Import data values in bulk.
export const postDataValues = (dataValues) =>
  api('/api/dataValueSets?importStrategy=CREATE_AND_UPDATE&skipAudit=true', { method: 'POST', body: { dataValues } });

// Kick off analytics and poll to completion.
export async function runAnalytics() {
  await api('/api/resourceTables/analytics?skipResourceTables=false&lastYears=3', { method: 'POST' });
  for (let i = 0; i < 120; i++) {
    const tasks = await api('/api/system/tasks/ANALYTICS_TABLE.json');
    const latest = Array.isArray(tasks) ? tasks[0] : (tasks?.[Object.keys(tasks)[0]] || []);
    const flat = Array.isArray(latest) ? latest : [];
    if (flat.some((t) => t.completed && /completed|finished/i.test(t.message || ''))) return;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('analytics did not complete within timeout');
}
```

> Note: the analytics poll shape varies by DHIS2 version; if polling proves flaky, fall back to a fixed wait (`sleep`) after POST and verify via an analytics query in Task 6. Document whichever is used.

- [ ] **Step 2: Commit** — `git commit -m "feat(asc-synth): DHIS2 API client (metadata, dataValues, analytics)"`.

### Task 6: Generator CLI + live run

**Files:**
- Create: `scripts/asc-synth/index.mjs`
- Modify: `package.json` (add `synth:asc`)

- [ ] **Step 1: Implement the orchestrator**

```js
// scripts/asc-synth/index.mjs
import { buildHierarchy } from './lib/hierarchy.mjs';
import { assignGeometry } from './lib/geometry.mjs';
import { valueFor } from './lib/values.mjs';
import { get, categoryOptionCombos, postMetadata, postDataValues, runAnalytics } from './lib/dhis2.mjs';

const LEVELS = [
  { level: 1, name: 'National' },
  { level: 2, name: 'State' },
  { level: 3, name: 'LGA' },
  { level: 4, name: 'School' },
];
const PERIODS = ['2023', '2024'];

const log = (...a) => console.log('[asc-synth]', ...a);

async function main() {
  const { units } = buildHierarchy();
  const geo = assignGeometry(units);

  // 1) Resolve the existing Ownership group set + its Public/Private groups.
  const ogs = (await get('/api/organisationUnitGroupSets.json?paging=false&fields=id,name,organisationUnitGroups[id,name]')).organisationUnitGroupSets;
  const ownership = ogs.find((g) => /ownership/i.test(g.name));
  if (!ownership) throw new Error('Ownership group set not found');
  const groupId = (label) => ownership.organisationUnitGroups.find((g) => new RegExp(label, 'i').test(g.name)).id;
  const PUBLIC = groupId('public'), PRIVATE = groupId('private');

  // 2) Build metadata payload: levels + org units (with geometry) + group memberships.
  const byId = Object.fromEntries(units.map((u) => [u.id, u]));
  const pathOf = (u) => { const seg = []; let c = u; while (c) { seg.unshift(c.id); c = c.parent ? byId[c.parent] : null; } return '/' + seg.join('/'); };
  const organisationUnits = units.map((u) => ({
    id: u.id, name: u.name, shortName: u.name.slice(0, 50), level: u.level,
    openingDate: '2015-01-01',
    parent: u.parent ? { id: u.parent } : undefined,
    path: pathOf(u),
    geometry: geo[u.id],
  }));
  const schoolsByOwner = (own) => units.filter((u) => u.level === 4 && u.ownership === own).map((u) => ({ id: u.id }));
  const organisationUnitGroups = [
    { id: PUBLIC, organisationUnits: schoolsByOwner('Public') },
    { id: PRIVATE, organisationUnits: schoolsByOwner('Private') },
  ];
  const organisationUnitLevels = LEVELS.map((l) => ({ id: undefined, name: l.name, level: l.level }));

  log(`importing ${organisationUnits.length} org units + levels + ownership groups…`);
  const r1 = await postMetadata({ organisationUnitLevels, organisationUnits, organisationUnitGroups });
  log('metadata import status:', r1.status || r1.httpStatus);

  // 3) Generate dummy data values for the real 108 DEs across schools.
  const inds = JSON.parse(await (await fetch('file://' + process.cwd() + '/emis-public-portal-input/school_list_indicators_BY_LEVEL.metadata.json')).text());
  // collect referenced DE ids from numerators+denominators
  const deIds = new Set();
  for (const i of inds.indicators) for (const e of [i.numerator, i.denominator]) (e.match(/#\{([A-Za-z0-9]+)/g) || []).forEach((m) => deIds.add(m.slice(2)));
  const cocs = await categoryOptionCombos([...deIds]);
  const schools = units.filter((u) => u.level === 4);
  const dataValues = [];
  for (const de of [...deIds]) {
    const name = ''; // band() tolerates empty; names not needed if we fetch — keep simple
    for (const ou of schools) for (const coc of (cocs[de] || ['HllvX50cXC0'])) for (const pe of PERIODS)
      dataValues.push({ dataElement: de, period: pe, orgUnit: ou.id, categoryOptionCombo: coc, value: String(valueFor(ou, { id: de, name }, coc, pe)) });
  }
  log(`importing ${dataValues.length} data values…`);
  // chunk to keep payloads sane
  for (let i = 0; i < dataValues.length; i += 50000) {
    const r = await postDataValues(dataValues.slice(i, i + 50000));
    log(' chunk import:', r.importCount || r.status);
  }

  // 4) Run analytics.
  log('running analytics…');
  await runAnalytics();
  log('done. root id:', units[0].id);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

> The DE *name* drives the value band, but `index.mjs` above passes an empty name for brevity. **Fix during implementation:** fetch DE id→name once (`/api/dataElements.json?fields=id,name&filter=id:in:[...]`) and pass the real name to `valueFor`, so enrolment/teacher magnitudes differ (the Task 4 test asserts this matters). Default COC fallback `HllvX50cXC0` is the standard DHIS2 default COC; prefer the value from `cocs`.

- [ ] **Step 2: Add npm script** — in `package.json` `scripts`:

```json
"synth:asc": "node scripts/asc-synth/index.mjs"
```

- [ ] **Step 3: Run generator against the instance**

Run:
```bash
DHIS2_BASE_URL=http://dhis2-agent-asc-ind:8080 DHIS2_USERNAME=admin DHIS2_PASSWORD=district npm run synth:asc
```
Expected: logs show ~319 org units imported, ownership groups set, data values imported, analytics completed, and prints the root id.

- [ ] **Step 4: Verify in the instance**

Run (substitute `<ROOT>` with the printed root id):
```bash
curl -s -u admin:district "http://dhis2-agent-asc-ind:8080/api/analytics.json?dimension=dx:eie1tIO5HtX&dimension=pe:2024&dimension=ou:LEVEL-2&skipMeta=true" | python3 -c "import sys,json;d=json.load(sys.stdin);print('state rows:',len(d['rows']));print(d['rows'][:3])"
```
Expected: 6 state rows for ASC-GEN Pupil-teacher ratio, non-zero values.

- [ ] **Step 5: Commit** — `git commit -m "feat(asc-synth): generator CLI; populate agent-asc-ind geography + dummy data"`.

---

## Phase 2 — Extract + source

### Task 7: Extractor config + run + non-re-aggregation check

**Files:**
- Create: `scripts/dhis2-extract/config/asc.yaml`
- Modify: `package.json` (add `extract:asc`)

- [ ] **Step 1: Write `asc.yaml`** (dx = the 67 indicators; Ownership disaggregation by group set id — resolve the real id first, see Step 2):

```yaml
# Annual School Census extract from agent-asc-ind (synthetic geography + dummy values,
# real by-level indicators). Auth via env DHIS2_USERNAME / DHIS2_PASSWORD.
baseUrl: http://dhis2-agent-asc-ind:8080
dx: [DiEriq7urPG,L7wp6IPJGhV,NnvopxD62MT,QZl1LOTpSat,i8mFzOkO9Wi,Rszp9Ippq5N,pc4DSr5MyOC,Sydf7CTCFuC,Qsgrw7qe8cC,d8qCE7aPWtD,yjH9LAuAMrk,Qwjg1QG0Hws,JH1hYfoV2hb,uNvBLdtslJ5,Mmn0SEDyzOC,DANh9bP86R9,uXpZ0iaeH4P,QETjPTty02O,aX6SpmH2icc,zGdBeuyjOeQ,wDf8ZOwWgib,gAfSf7sfxib,uSfibhbGRT1,nghVrzkls6X,Yf6K5jD4oED,bCMrPV3785Y,eLOZ1cSBHJM,AoOq7RrHxMr,CEgyg6JJbNv,IYNEmLyFgbe,i8dMJSyq5hO,vZA5RaodnuH,jWEK2IgsZXZ,Y8uv3HrDDcF,X4cRpKnxayU,Bp8XVbKSqVX,yVJPz2WzrgH,AtbaZYTP7Xl,g1ozV2n8G88,kxJmBoDtD9t,VzPMQzTjenn,dRBLKPEMR80,mHzRpEIsf3n,kitIA5LU69N,jRh7NbBDdJI,GSJ3jeCZNsD,VAnbcYjaaZ4,lBfQKjSIx0P,nK3E5siSgHS,jwjKmtVK2wj,zKAZUEGYL52,HxRedgvSK2M,Nc9bgbCb6eO,Dw7f4gs9RcS,XZEG3yT7WmJ,Exv6Kz1TXmJ,eie1tIO5HtX,bWPz06oFs5q,cbeoGyJDnv5,io4yQysi8jU,jox8QDbnBV3,DvMfSq5pZSA,vDmeu4io2Fs,uWkPykwyYn2,DydalnMqg5w,XhYKabiEAnj,q9E9FifnCzE]
ouLevels: [1, 2, 3]
periods:
  list: ['2023', '2024']
disaggregations:
  - dim: <OWNERSHIP_GROUPSET_ID>   # resolve in Step 2
    slug: ownership
    dx: [jwjKmtVK2wj, Dw7f4gs9RcS, eie1tIO5HtX, DiEriq7urPG, d8qCE7aPWtD, wDf8ZOwWgib]
    ouLevels: [1, 2, 3]
```

> `periods.types` is omitted because `list` is explicit; periodType is derived as YEARLY. The disaggregation `dx` is the subset that the portal splits by ownership (enrolment, teachers, PTR for the headline levels) — keep it small to bound the extract.

- [ ] **Step 2: Resolve the Ownership group-set id and patch the config**

Run:
```bash
curl -s -u admin:district "http://dhis2-agent-asc-ind:8080/api/organisationUnitGroupSets.json?fields=id,name&filter=name:ilike:ownership&paging=false"
```
Replace `<OWNERSHIP_GROUPSET_ID>` in `asc.yaml` with the returned id.

- [ ] **Step 3: Add npm script** — `package.json`:

```json
"extract:asc": "node scripts/dhis2-extract/index.mjs --config scripts/dhis2-extract/config/asc.yaml --out evidence/sources/asc && mkdir -p evidence/static && cp evidence/sources/asc/ou.geojson evidence/static/asc.geojson"
```

- [ ] **Step 4: Run the extractor**

Run:
```bash
DHIS2_USERNAME=admin DHIS2_PASSWORD=district npm run extract:asc
```
Expected: writes `evidence/sources/asc/{fact,fact_ownership,ou,dx,pe}.csv` + `ou.geojson`; logs row counts; `fact.csv` has rows for levels 1–3 × 2 years.

- [ ] **Step 5: Verify geometry + the canonical non-re-aggregation test**

Run:
```bash
python3 - <<'PY'
import csv
rows=list(csv.DictReader(open('evidence/sources/asc/fact.csv')))
ou={r['id']:r for r in csv.DictReader(open('evidence/sources/asc/ou.csv'))}
ptr='eie1tIO5HtX'  # ASC-GEN Pupil-teacher ratio
def val(level,pe):
    return [float(r['value']) for r in rows if r['dx']==ptr and r['pe']==pe and r['periodType']=='YEARLY' and ou[r['ou']]['level']==str(level)]
nat=val(1,'2024'); st=val(2,'2024')
print('nation PTR:',nat,'| mean(states):',round(sum(st)/len(st),2),'| n states:',len(st))
assert nat, 'no national PTR row'
assert abs(nat[0]-sum(st)/len(st))>0.01, 'FAIL: national == mean(states) -> looks re-aggregated'
print('PASS: national PTR is DHIS2-aggregated, not the mean of states')
# geometry present for nation + states + LGAs
oucsv=list(csv.DictReader(open('evidence/sources/asc/ou.csv')))
geo=[r for r in oucsv if r['ty']=='2']
print('polygon OUs:',len(geo))
# NO sub-LGA leakage: nothing below level 3 in any extracted file
assert max(int(r['level']) for r in oucsv)<=3, 'FAIL: ou.csv has rows below level 3 (schools leaked)'
assert all(int(ou[r['ou']]['level'])<=3 for r in rows), 'FAIL: fact.csv has sub-LGA rows'
print('PASS: no data below LGA in the extract')
PY
```
Expected: prints both PASS lines; ou.csv max level is 3; polygon OUs = 31 (nation + 6 states + 24 LGAs).

- [ ] **Step 6: Commit** — `git commit -m "feat(extract): asc.yaml config; extract 67 indicators + ownership + geometry"`.

### Task 8: Evidence source + sources build

**Files:**
- Create: `evidence/sources/asc/connection.yaml`

- [ ] **Step 1: Create the connection**

```yaml
# evidence/sources/asc/connection.yaml
name: asc
type: csv
```

- [ ] **Step 2: Run sources**

Run: `npm run sources`
Expected: processes the `asc` source; writes parquet + manifest for `asc.fact`, `asc.fact_ownership`, `asc.ou`, `asc.dx`, `asc.pe`. (If the DuckDB native binding error appears, install `@duckdb/node-bindings-linux-arm64` as in prior sessions.)

- [ ] **Step 3: Commit** — `git commit -m "feat(evidence): add asc csv source"`.

---

## Phase 3 — Theme + DNEMIS chrome

### Task 9: Superset palette + Inter font + DNEMIS header/nav

**Files:**
- Modify: `evidence/evidence.config.yaml`
- Modify: `evidence/scripts/patch-evidence.mjs`

- [ ] **Step 1: Set the Superset categorical palette** in `evidence.config.yaml` (under the existing `theme`/`appearance` block — match the foundation's existing structure; add a `colorPalettes` or `chartColors` entry):

```yaml
# Superset default categorical palette
theme:
  colors:
    seriesColors: ['#1FA8C9', '#454E7C', '#5AC189', '#FF7F44', '#E04355', '#FCC700', '#A868B7', '#3CCCCB']
```
> Confirm the exact key Evidence expects for series colors in this version; if `seriesColors` isn't honored, set ECharts colors per-chart in the page template instead.

- [ ] **Step 2a: First, read the installed layout and capture exact anchors.** The existing branding patch only swaps the `<EvidenceDefaultLayout {data}>` opening tag for one with extra props — it does NOT touch `<slot/>` or `<svelte:head>`. So before writing the new patch, open the generated layout and copy the literal strings you'll target:

Run: `sed -n '1,80p' evidence/.evidence/template/src/pages/+layout.svelte` (path may differ — find it with `find evidence/.evidence -name '+layout.svelte' -path '*pages*'`). Identify (a) a stable anchor to insert the DNEMIS header markup just inside the layout body (e.g. immediately before `<slot` or before the `<EvidenceDefaultLayout` closing), and (b) where to add the Inter `<link>` / `@import`. The `patch()` helper does one guarded `replace(from, to)` per patch, so each insertion needs an exact `from` substring that exists in the regenerated template.

- [ ] **Step 2b: Extend `patch-evidence.mjs`** — add an idempotent patch (marker-guarded `[skip]` like the others) that, using the anchors from 2a, injects the **Inter** Google Font and renders the **DNEMIS header + 6-module nav** at the top of the layout body. The nav links (from `emis-public-portal-input/DNEMIS Platform.html`):

```js
// Idempotent block appended to the existing patch list in patch-evidence.mjs.
// Marker-guarded like the other patches ([skip] if already present).
const DNEMIS_NAV = `
<div class="dnemis-header">
  <div class="dnemis-brand"><span class="crest">🇳🇬</span><div><div class="t">DNEMIS</div><div class="s">Enhancing Education for a Brighter Future</div></div></div>
  <nav class="dnemis-nav">
    <a class="mod active" href="/">📊 Annual School Census</a>
    <a class="mod" href="https://nlin.education.gov.ng/dhis" target="_blank" rel="noopener">🎓 Learner Registry</a>
    <a class="mod" href="https://sites.google.com/view/nemisknowledgebase/" target="_blank" rel="noopener">📚 Knowledge Base</a>
    <a class="mod" href="https://asc.education.gov.ng" target="_blank" rel="noopener">🛡️ Safe Schools</a>
    <a class="mod" href="https://collect.ncaoosce.gov.ng" target="_blank" rel="noopener">🛡️ NCAOOSCE</a>
    <a class="mod" href="https://nimebss.vercel.app" target="_blank" rel="noopener">🛡️ School Grading</a>
  </nav>
</div>`;
```
Plus the CSS (Inter font-family on body; the green gradient header + grid nav; Superset grey canvas) injected into the layout `<style>`. Mirror the existing logo/footer patch mechanics (regex insert + `[skip]` marker). Keep `200.html` fallback + lazy-duckdb patches intact.

- [ ] **Step 3: Verify patch is idempotent**

Run: `npm run patch && npm run patch`
Expected: second run prints `[skip] … already patched` for the DNEMIS block.

- [ ] **Step 4: Commit** — `git commit -m "feat(theme): Superset palette + Inter font + DNEMIS header/nav"`.

---

## Phase 4 — Presentational components (no engine; receive baked data as props)

> All components are **presentational** — they receive already-baked query results as props and render. They must NOT call `query()` (that would pull in the DuckDB-WASM engine and break the "fully baked" goal).

### Task 10: SupersetBigNumber.svelte

**Files:** Create `evidence/components/SupersetBigNumber.svelte`

- [ ] **Step 1: Implement** — a card with title, big value, optional delta, and an inline-SVG sparkline from a `trend` array.

```svelte
<script>
  export let data = [];        // rows; we read the latest as the headline
  export let value;            // column name for the metric
  export let title = '';
  export let fmt = (v) => Number(v).toLocaleString('en-US');
  export let trend = [];       // array of numbers (oldest→newest) for the sparkline
  $: headline = data.length ? data[data.length - 1][value] : null;
  $: pts = (() => {
    if (trend.length < 2) return '';
    const min = Math.min(...trend), max = Math.max(...trend), span = max - min || 1;
    return trend.map((v, i) => `${(i / (trend.length - 1)) * 100},${34 - ((v - min) / span) * 28}`).join(' ');
  })();
</script>
<div class="card bn">
  <div class="ch">{title}</div>
  <div class="num">{headline == null ? '—' : fmt(headline)}</div>
  {#if pts}<svg viewBox="0 0 100 34" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke="#1FA8C9" stroke-width="2"/></svg>{/if}
</div>
<style>
  .card{background:#fff;border:1px solid #e0e0e0;border-radius:3px;padding:10px 12px;position:relative;min-height:90px;font-family:Inter,sans-serif}
  .ch{font-size:13px;font-weight:600;color:#323232}
  .num{font-size:30px;font-weight:600;color:#323232;letter-spacing:-.5px;margin-top:4px}
  svg{position:absolute;left:0;right:0;bottom:0;width:100%;height:34px}
</style>
```

- [ ] **Step 2: Commit** — `git commit -m "feat(components): SupersetBigNumber"`.

### Task 11: CompareTable.svelte (tabs + in-cell bars + child links)

**Files:** Create `evidence/components/CompareTable.svelte`

- [ ] **Step 1: Implement** — two tabs (Pre-Prim/Primary, JSS), columns config, in-cell bar on a chosen ratio column, first column links to the child page.

```svelte
<script>
  export let preprimary = [];   // rows: {ou_id, ou_name, link, ...metric cols}
  export let jss = [];
  export let columns = [];      // [{key, label, fmt?, bar?}]
  export let linkCol = 'link';  // url column for the first cell
  let tab = 'pre';
  $: rows = tab === 'pre' ? preprimary : jss;
  $: barMax = (k) => Math.max(1, ...rows.map((r) => Number(r[k]) || 0));
  const num = (v) => (v == null ? '' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 }));
</script>
<div class="wrap">
  <div class="tabs">
    <button class:on={tab==='pre'} on:click={() => tab='pre'}>Pre-Primary / Primary</button>
    <button class:on={tab==='jss'} on:click={() => tab='jss'}>Junior Secondary</button>
  </div>
  <table>
    <thead><tr><th>Org unit</th>{#each columns as c}<th>{c.label}</th>{/each}</tr></thead>
    <tbody>
      {#each rows as r}
        <tr>
          <td class="name">{#if r[linkCol]}<a href={r[linkCol]}>{r.ou_name} ›</a>{:else}{r.ou_name}{/if}</td>
          {#each columns as c}
            <td>{#if c.bar}<span class="bar" style="width:{(Number(r[c.key])/barMax(c.key))*100}%"></span>{/if}<span class="v">{num(r[c.key])}</span></td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
<style>
  .wrap{font-family:Inter,sans-serif}
  .tabs button{font-size:12px;padding:8px 14px;border:none;background:none;font-weight:600;color:#879399;border-bottom:2px solid transparent;cursor:pointer}
  .tabs button.on{color:#1FA8C9;border-bottom-color:#1FA8C9}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  th{background:#fafafa;color:#5a6b73;text-align:right;padding:8px 9px;border-bottom:1px solid #e0e0e0}
  th:first-child{text-align:left}
  td{text-align:right;padding:7px 9px;border-bottom:1px solid #f1f3f4;position:relative}
  td.name{text-align:left} td.name a{color:#1FA8C9;font-weight:600;text-decoration:none}
  .bar{position:absolute;left:4px;top:50%;transform:translateY(-50%);height:60%;background:rgba(31,168,201,.14);border-radius:2px}
  .v{position:relative}
</style>
```

> `on:click` makes this interactive but **client-only after hydration**; it does not require the DuckDB engine (no `query()`), so pages stay engine-free. The data for both tabs is baked in as props.

- [ ] **Step 2: Commit** — `git commit -m "feat(components): CompareTable with tabs + in-cell bars"`.

### Task 12: ScopeNav.svelte (breadcrumb + scope links)

**Files:** Create `evidence/components/ScopeNav.svelte`

- [ ] **Step 1: Implement** — renders the breadcrumb (ancestors) and a sibling/child jump list, all as `<a>` links to baked pages. Receives `ancestors` (baked array oldest→current) and a `children` array.

```svelte
<script>
  export let title = '';
  export let ancestors = []; // [{name, link}], current last (link may be null)
  export let year = '2024';
</script>
<div class="subbar">
  <div>
    <h2>{title}</h2>
    <div class="crumb">{#each ancestors as a, i}{#if i}<span> › </span>{/if}{#if a.link}<a href={a.link}>{a.name}</a>{:else}<b>{a.name}</b>{/if}{/each}</div>
  </div>
  <div class="controls">
    <span class="pill scope">Scope: {ancestors[ancestors.length-1]?.name}</span>
    <span class="pill year" title="Year filter coming soon">{year} (future)</span>
  </div>
</div>
<style>
  .subbar{display:flex;justify-content:space-between;align-items:flex-end;font-family:Inter,sans-serif;margin:8px 0 6px}
  h2{margin:0;font-size:18px;font-weight:700} .crumb{font-size:12px;color:#879399;margin-top:3px}
  .crumb a{color:#13714a;text-decoration:none} .controls{display:flex;gap:8px}
  .pill{font-size:12px;padding:7px 11px;border-radius:7px;font-weight:600}
  .pill.scope{background:#eaf5ee;border:1px solid #bfe0cd;color:#0a3d2c}
  .pill.year{background:#fff;border:1px dashed #cdd3cf;color:#aab3ad;font-weight:500}
</style>
```

- [ ] **Step 2: Commit** — `git commit -m "feat(components): ScopeNav breadcrumb + reserved year slot"`.

---

## Phase 5 — Pages (generated, baked)

### Task 13: Page template + generator

**Files:**
- Create: `scripts/asc-pages/template.mjs`
- Create: `scripts/asc-pages/generate.mjs`
- Modify: `package.json` (add `pages:asc`; chain before build)

The template produces a markdown page for a given scope OU. Key rules from CLAUDE.md: ```` ```sql ```` blocks **before** `<Grid>`; filter `periodType='YEARLY'`; scope tiles by `ou='<ID>'`; children by `parent_id='<ID>'`; the indicator value is read at the row for the level (no SQL re-aggregation); choropleths from `/asc.geojson`. **Two page shapes** controlled by a `leaf` flag:
- **Federal/State** (`leaf=false`): KPIs + a **children choropleth** + a **CompareTable** of direct children (states or LGAs), child rows linking down.
- **LGA** (`leaf=true`): KPIs + an **education-level breakdown** of *this* LGA (PREPRY/PRY/JSS/SSS/ANFE rows). **No children map/table** — nothing exists or is shown below LGA.

There are **no point maps** anywhere (choropleths only).

- [ ] **Step 1: Implement the template** (returns a string). Indicator id constants are embedded. `leaf` (LGA) pages omit the children sections entirely.

```js
// scripts/asc-pages/template.mjs
// Indicator ids used on the pages (subset of the 67):
const I = {
  enrol: 'jwjKmtVK2wj', teachers: 'Dw7f4gs9RcS', ptr: 'eie1tIO5HtX',
  ptoilet: 'uWkPykwyYn2', female: 'Nc9bgbCb6eO',
  // per-education-level enrolment + ratio (for the LGA leaf breakdown and the level tables)
  preprry_enrol: 'DiEriq7urPG', pry_enrol: 'd8qCE7aPWtD', jss_enrol: 'wDf8ZOwWgib',
  sss_enrol: 'IYNEmLyFgbe', anfe_enrol: 'g1ozV2n8G88',
};

// Common top of every page: KPIs + scope nav.
function head(ou, ancestors) {
  return `---
title: ${ou.name} — Annual School Census
---
<script>
  import SupersetBigNumber from '@components/SupersetBigNumber.svelte';
  import CompareTable from '@components/CompareTable.svelte';
  import ScopeNav from '@components/ScopeNav.svelte';
</script>

\`\`\`sql kpis
select dx, value from asc.fact
where ou = '${ou.id}' and periodType='YEARLY' and pe='2024'
  and dx in ('${I.enrol}','${I.teachers}','${I.ptr}','${I.female}')
\`\`\`

\`\`\`sql enrol_trend
select pe, value from asc.fact
where ou='${ou.id}' and dx='${I.enrol}' and periodType='YEARLY' order by pe
\`\`\`

<ScopeNav title="${ou.name}" ancestors={${JSON.stringify(ancestors)}} />

<Grid cols=4>
  <SupersetBigNumber title="Total learners" data={kpis.filter(r=>r.dx==='${I.enrol}')} value=value trend={enrol_trend.map(r=>r.value)} />
  <SupersetBigNumber title="Teachers" data={kpis.filter(r=>r.dx==='${I.teachers}')} value=value />
  <SupersetBigNumber title="Pupil–teacher ratio" data={kpis.filter(r=>r.dx==='${I.ptr}')} value=value fmt={v=>Number(v).toFixed(1)} />
  <SupersetBigNumber title="Female learners (%)" data={kpis.filter(r=>r.dx==='${I.female}')} value=value fmt={v=>Number(v).toFixed(1)+'%'} />
</Grid>
`;
}

// Federal/State: children choropleth + compare table (children link down). No point maps.
function branchSection(ou, childLevel, childLinkPrefix) {
  const ownPivot = (dxId) => `max(case when f.dx='${dxId}' then f.value end)`;
  return `
\`\`\`sql children_map
select o.id, o.name, f.value
from asc.fact f join asc.ou o on f.ou=o.id
where o.parent_id='${ou.id}' and f.dx='${I.ptr}' and f.periodType='YEARLY' and f.pe='2024'
\`\`\`

<AreaMap data={children_map} geoJsonUrl="/asc.geojson" geoId="id" areaCol="id" value="value"
  title="Pupil–teacher ratio by ${childLevel}" tooltip={[{id:'name',showColumnTitles:false},{id:'value',fmt:'num1'}]} height={360} />

\`\`\`sql preprimary
select o.id as ou_id, o.name as ou_name, '${childLinkPrefix}' || o.id as link,
  ${ownPivot(I.pry_enrol)} as enrolment, ${ownPivot(I.ptr)} as ptr, ${ownPivot(I.ptoilet)} as ptoilet
from asc.ou o left join asc.fact f on f.ou=o.id and f.periodType='YEARLY' and f.pe='2024'
where o.parent_id='${ou.id}' group by o.id, o.name order by o.name
\`\`\`

\`\`\`sql jss
select o.id as ou_id, o.name as ou_name, '${childLinkPrefix}' || o.id as link,
  ${ownPivot(I.jss_enrol)} as enrolment, ${ownPivot(I.ptr)} as ptr, ${ownPivot(I.ptoilet)} as ptoilet
from asc.ou o left join asc.fact f on f.ou=o.id and f.periodType='YEARLY' and f.pe='2024'
where o.parent_id='${ou.id}' group by o.id, o.name order by o.name
\`\`\`

## Indicators by ${childLevel}

<CompareTable preprimary={preprimary} jss={jss}
  columns={[{key:'enrolment',label:'Enrolment'},{key:'ptr',label:'Pupil:Teacher',bar:true},{key:'ptoilet',label:'Pupil:Toilet'}]} />
`;
}

// LGA leaf: this LGA's own figures, broken down by education level. No children.
function leafSection(ou) {
  return `
\`\`\`sql edu_breakdown
select
  case f.dx
    when '${I.preprry_enrol}' then '1 Pre-Primary' when '${I.pry_enrol}' then '2 Primary'
    when '${I.jss_enrol}' then '3 JSS' when '${I.sss_enrol}' then '4 SSS' when '${I.anfe_enrol}' then '5 ANFE' end as level,
  f.value as enrolment
from asc.fact f
where f.ou='${ou.id}' and f.periodType='YEARLY' and f.pe='2024'
  and f.dx in ('${I.preprry_enrol}','${I.pry_enrol}','${I.jss_enrol}','${I.sss_enrol}','${I.anfe_enrol}')
order by level
\`\`\`

## Enrolment by education level — ${ou.name}

<DataTable data={edu_breakdown}>
  <Column id=level title="Education level" />
  <Column id=enrolment title="Enrolment 2024" fmt="#,##0" />
</DataTable>

*This is the lowest level of detail in the portal (no ward- or school-level data).*
`;
}

export function page({ ou, ancestors, leaf, childLevel, childLinkPrefix }) {
  return head(ou, ancestors) + (leaf ? leafSection(ou) : branchSection(ou, childLevel, childLinkPrefix));
}
```

> `@components/` is Evidence's alias for `evidence/components`; `<DataTable>`/`<Column>` are built-in Evidence components (baked). Confirm the alias in this Evidence version; if not configured, use the relative import path the existing `OrgUnitProfile` usage relies on.
>
> **Ownership (Public/Private/Total) columns:** the `branchSection` table currently shows Total. To add Public/Private columns, source them from `asc.fact_ownership` (the group-set cut) with `max(case when category_name='Public' …)`, joined alongside the Total `fact` rows. Wire this once the extract confirms the `category_name` values emitted for the Ownership cut.

- [ ] **Step 2: Implement the generator**

```js
// scripts/asc-pages/generate.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { page } from './template.mjs';

// Tiny CSV reader — ou.csv has no embedded commas/quotes (ids, names, ints). No new dep.
function readCsv(path) {
  const [header, ...lines] = readFileSync(path, 'utf8').trim().split('\n');
  const cols = header.split(',');
  return lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v])));
}
const ou = readCsv('evidence/sources/asc/ou.csv');
const byId = Object.fromEntries(ou.map((o) => [o.id, o]));
const ancestorsOf = (o) => {
  const chain = []; let c = o;
  while (c) { chain.unshift(c); c = c.parent_id ? byId[c.parent_id] : null; }
  return chain.map((u, i) => ({ name: u.name, link: i === chain.length - 1 ? null : (u.level === '1' ? '/' : `/asc/${u.level === '2' ? 'state' : 'lga'}-${u.id}`) }));
};

rmSync('evidence/pages/asc', { recursive: true, force: true });
mkdirSync('evidence/pages/asc', { recursive: true });

for (const o of ou) {
  const anc = ancestorsOf(o);
  if (o.level === '1') {
    writeFileSync('evidence/pages/index.md', page({ ou: o, ancestors: anc, leaf: false, childLevel: 'state', childLinkPrefix: '/asc/state-' }));
  } else if (o.level === '2') {
    writeFileSync(`evidence/pages/asc/state-${o.id}.md`, page({ ou: o, ancestors: anc, leaf: false, childLevel: 'LGA', childLinkPrefix: '/asc/lga-' }));
  } else if (o.level === '3') {
    writeFileSync(`evidence/pages/asc/lga-${o.id}.md`, page({ ou: o, ancestors: anc, leaf: true }));
  }
  // level 4 (schools) -> no page; they are invisible data leaves only
}
console.log('[asc-pages] generated', ou.filter((o) => o.level <= '3').length, 'pages');
```

> Uses `csv-parse` (already transitively available via Evidence; if not, add it or hand-parse). Removes/recreates `evidence/pages/asc` each run so stale pages never linger (and no dangling links).

- [ ] **Step 3: Add npm scripts** — `package.json`:

```json
"pages:asc": "node scripts/asc-pages/generate.mjs",
"build": "npm run patch && npm run pages:asc && npm --prefix evidence run build"
```
> Adjust the existing `build` script: insert `npm run pages:asc` after `patch` and after `sources` has been run at least once (ou.csv must exist). Document that `extract:asc` → `sources` → `build` is the order.

- [ ] **Step 4: Generate pages**

Run: `npm run pages:asc`
Expected: writes `evidence/pages/index.md` + 6 `state-*.md` + 24 `lga-*.md`; logs "generated 31 pages".

- [ ] **Step 5: Commit** — `git commit -m "feat(pages): baked per-OU page generator + template"`.

### Task 14: Build & fix linking

- [ ] **Step 1: Build**

Run: `npm run build` (background it + poll the log per the foundation note; builds take minutes).
Expected: completes; "Wrote site to ./build"; no SvelteKit prerender error about missing internal links.

- [ ] **Step 2: If prerender fails on a link**, confirm every `link` target page exists (federal `/`, `/asc/state-<id>`, `/asc/lga-<id>`) and that LGA pages emit `null` links (no school pages). Re-generate + rebuild.

- [ ] **Step 3: Verify baked (no engine) on the federal page** — inspect `evidence/build/index.html`: KPI numbers and `.arrow` data are inlined; grep the built page's JS imports to confirm the DuckDB-WASM engine chunk is not eagerly loaded on the federal route (the lazy-duckdb patch keeps it out of baked pages).

- [ ] **Step 4: Commit** — `git commit -m "build: generate + prerender ASC portal pages"`.

---

## Phase 6 — Deploy, serve, visual verify

### Task 15: Deploy + serve + visual check

- [ ] **Step 1: Stop the brainstorm visual-companion server** (it holds port 49242):

```bash
bash /home/agent/.claude/skills/brainstorming/scripts/stop-server.sh /poc-public-portal/.superpowers/brainstorm/* 2>/dev/null; true
```

- [ ] **Step 2: Deploy + serve**

Run: `npm run deploy && npm run serve` (serve in background; it binds `$SANDBOX_HOST_PORT`).
Expected: deploy writes a `builds/<ts>/` + flips `current`; serve logs the URL.

- [ ] **Step 3: Visual verification** — open `http://localhost:$SANDBOX_HOST_PORT`:
  - DNEMIS green header + 6 module nav (ASC active; others external).
  - Federal KPIs (Big-Number, Superset look), **choropleth of states** (no point maps), Compare-states table with Pre-Prim/Primary ↔ JSS tabs and in-cell bars.
  - Click a state row → state page (choropleth + table of its **LGAs**); click an LGA → **LGA leaf page** (its KPIs + enrolment-by-education-level table, **no children**). Breadcrumb + scope pill update; year pill shows "(future)".
  - Confirm **nothing below LGA** is reachable or shown. Confirm against the approved mockup (`.superpowers/brainstorm/.../layout-v5-superset.html`).

- [ ] **Step 4: Use the `webapp-testing` skill** (Playwright) to screenshot the federal page and one LGA page; eyeball parity with the mockup; check the browser console shows no engine download on the federal route.

- [ ] **Step 5: Final commit** — `git commit -m "chore: deploy ASC portal; visual verification notes"` (include any screenshots under `docs/` if useful).

---

## Done criteria

- `synth:asc` populates `agent-asc-ind` with the synthetic hierarchy + geometry + dummy 2023/2024 values (idempotent).
- `extract:asc` produces `evidence/sources/asc/*.csv` + `evidence/static/asc.geojson` with levels 1–3, the 67 indicators, and the Ownership cut; the canonical non-re-aggregation test PASSes.
- `npm run pages:asc && npm run build` produces 31 baked pages with working Federal→State→LGA drill-down and no dangling links.
- **Nothing below LGA** appears anywhere in the extract, pages, or maps (schools are in-instance data leaves only); choropleths only.
- The served portal matches the approved Superset mockup; baked pages download no DuckDB-WASM engine.
- All new pure libs have passing Vitest tests; existing extractor tests still pass (`npm test`).
```
