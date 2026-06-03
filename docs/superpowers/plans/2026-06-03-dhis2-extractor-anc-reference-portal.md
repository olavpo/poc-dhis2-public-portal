# DHIS2 Extractor + Sierra Leone ANC Reference Portal — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic, config-driven DHIS2 analytics extractor and a worked Sierra Leone "Antenatal Care" portal (replica of dashboard `nghVC4wtyzi`) to the Evidence foundation on `master`, spanning the baked↔engine spectrum.

**Architecture:** A standalone Node CLI (`scripts/dhis2-extract/`) reads a YAML config, pulls a *superset* analytics extract from a DHIS2 instance, and writes tidy CSVs + GeoJSON into an Evidence CSV source. Three Evidence pages then consume it: a baked national overview (no client engine), an 11-item engine-driven replica with selectable root OU + reference period (client-side DuckDB-WASM), and an on-demand org-unit profile drill-down.

**Tech Stack:** Node ≥18 (global `fetch`), `yaml`, Vitest (pure-function TDD), Evidence v40 + `@evidence-dev/core-components` 5.4.2 (`BarChart`, `LineChart`, `ECharts`, `AreaMap`, `PointMap`, `Dropdown`, `BigValue`, `Grid`), `@evidence-dev/csv` datasource, DuckDB-WASM.

**Spec:** `docs/superpowers/specs/2026-06-03-dhis2-extractor-anc-reference-portal-design.md` — read it first.

---

## Conventions & ground truth (read before starting)

- **Reference DHIS2 instance:** `https://play.im.dhis2.org/stable-2-43-0`, auth `admin`/`district` (public Sierra Leone demo, v2.43.0). Credentials come from env `DHIS2_USERNAME` / `DHIS2_PASSWORD` (never commit them). Org levels: 1 National, 2 District (13), 3 Chiefdom, 4 Facility (601, all points).
- **Data window (verified):** the demo only carries analytics for the recent window relative to its server clock. As of mid-2026 that is **2025 (full) + 2026** — earlier years return zero rows. The ANC config therefore extracts `2025..2026` (not 2021..2025). Don't be surprised that pre-2025 periods are empty; widen the range as the demo's window advances.
- **curl note:** the DHIS2 field syntax uses `[...]`; with curl you must pass `-g` (globoff). In Node `fetch` this is a non-issue.
- **API shapes (verified):**
  - `GET /api/analytics.json?dimension=dx:..&dimension=ou:..&dimension=pe:..&paging=false&skipMeta=false&displayProperty=NAME` → `{ headers:[{name:'dx'},{name:'ou'},{name:'pe'},{name:'value'}], rows:[['dx','ou','pe','value'],...], metaData:{ items:{ "<id>":{name} } } }`. With an extra dimension (e.g. `&dimension=J5jldMd8OHv:`), that dimension id appears as an extra header/column.
  - `GET /api/geoFeatures.json?ou=ou:LEVEL-n` → array of `{ id, na, le, pi, pn, pg, ty, co }`. `ty` 1=point/facility, 2=polygon/area. `co` is a **JSON string**: point `"[lng,lat]"`, polygon `"[[[lng,lat],...]]"`. `pg` is the ancestor path (self excluded), e.g. `"ImspTQPwCqd/O6uvpzGd5pu"`.
- **Repo scripts are plain `.mjs`** (ES modules, no TypeScript build) — follow that for the extractor. Existing examples: `scripts/precompress.mjs`, `scripts/serve.mjs`, `evidence/scripts/patch-evidence.mjs`.
- **Pipeline:** `npm run sources` → `npm run build` → `npm run deploy` → `npm run serve` (on `$SANDBOX_HOST_PORT`). Builds run in background; poll the log (foreground `sleep` is blocked in the sandbox).
- **Baked vs engine:** a page query with **no** `${inputs.x}` is executed at build and baked into HTML (no engine downloaded). A query referencing `${inputs.x}` (from a `<Dropdown>`) runs client-side in DuckDB-WASM. This distinction is the point of the three pages — preserve it.

## The 9 indicators (dx UIDs)

| UID | Name | | UID | Name |
|---|---|---|---|---|
| `Uvn6LCg7dVU` | ANC 1 Coverage | | `Jtf34kNZhzP` | ANC 3rd visit |
| `OdiHJayrsKo` | ANC 2 Coverage | | `hfdmMSPBgLG` | ANC 4th or more visits |
| `sB79w2hiLp8` | ANC 3 Coverage | | `c8fABiNpT0B` | ANC IPT 2 Coverage |
| `fbfJHSPpUQD` | ANC 1st visit | | `Tt5TAvdfdVK` | ANC LLITN coverage |
| `cYeuwXTCPkU` | ANC 2nd visit | | | |

Disaggregation dimensions: `J5jldMd8OHv` "Facility Type", `fMZEcRHuamy` "Fixed vs Outreach" (both ORG_UNIT_GROUP_SET).

---

## File structure

**Part A — extractor (generic, author-time):**

| Path | Responsibility |
|---|---|
| `scripts/dhis2-extract/lib/periods.mjs` | `expandPeriods(spec)`, `parsePeriod(p)` — period id generation + parsing. Pure. |
| `scripts/dhis2-extract/lib/orgunits.mjs` | `geoFeatureToOuRow(f)`, `coToGeometry(ty,co)`, `geoFeaturesToGeoJSON(features)`. Pure. |
| `scripts/dhis2-extract/lib/facts.mjs` | `analyticsToFactRows(resp)`, `analyticsToDisaggRows(resp,dimId)`, `dxRowsFromMeta(resps)`. Pure. |
| `scripts/dhis2-extract/lib/csv.mjs` | `toCsv(rows, columns)` — RFC-4180-ish CSV writer. Pure. |
| `scripts/dhis2-extract/lib/config.mjs` | `loadConfig(path)` — read+validate YAML, normalise defaults. |
| `scripts/dhis2-extract/lib/dhis2.mjs` | `makeClient(env)`, chunked analytics + geoFeatures fetch. Network. |
| `scripts/dhis2-extract/index.mjs` | CLI: orchestrate fetch → transform → write. |
| `scripts/dhis2-extract/config/anc.yaml` | The ANC example config. |
| `scripts/dhis2-extract/README.md` | Usage. |
| `scripts/dhis2-extract/lib/*.test.mjs` | Vitest unit tests (colocated). |

**Part B — Evidence portal:**

| Path | Responsibility |
|---|---|
| `evidence/sources/anc/connection.yaml` | CSV datasource (`type: csv`). |
| `evidence/pages/anc/index.md` | Baked national overview. |
| `evidence/pages/anc/dashboard.md` | 11-item engine replica (root-OU + period selectors). |
| `evidence/pages/anc/profile.md` | On-demand org-unit profile (Dropdown + deep link). |
| `evidence/components/OrgUnitProfile.svelte` | Client-side profile renderer (reads `ou` URL param, `query()`s on demand). |

**Modified:** `vitest.config.ts` (include `scripts/**`), `package.json` (deps + scripts), `scripts/precompress.mjs` (add `.geojson`), `.gitignore` (ignore generated source CSVs + `evidence/static/anc.geojson`), `README.md`, `AGENTS.md`, `evidence/pages/index.md`.

---

# PART A — Generic DHIS2 extractor

### Task 1: Wire Vitest to the extractor's location

**Files:**
- Modify: `vitest.config.ts`
- Modify: `package.json` (add `yaml` dep)

- [ ] **Step 1: Broaden the Vitest include glob**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'] },
});
```

- [ ] **Step 2: Add the one runtime dependency**

`package.json` — add a `dependencies` block (extractor parses YAML configs):
```json
"dependencies": { "yaml": "^2.5.0" },
```
Then `npm install`. Expected: `yaml` resolves under root `node_modules`.

- [ ] **Step 3: Sanity-check Vitest runs with zero tests**

Run: `npm test`
Expected: Vitest exits 0 with "No test files found" or a clean pass (no error about the glob).

- [ ] **Step 4: Commit**
```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "test: include scripts/**/*.test.mjs; add yaml dep for extractor"
```

---

### Task 2: Period expansion & parsing (`periods.mjs`)

**Files:**
- Create: `scripts/dhis2-extract/lib/periods.mjs`
- Test: `scripts/dhis2-extract/lib/periods.test.mjs`

- [ ] **Step 1: Write the failing test**
```js
import { describe, it, expect } from 'vitest';
import { expandPeriods, parsePeriod } from './periods.mjs';

describe('expandPeriods', () => {
  it('expands a year range across monthly/quarterly/yearly', () => {
    const p = expandPeriods({ range: '2021..2022', types: ['monthly', 'quarterly', 'yearly'] });
    expect(p).toContain('202101');
    expect(p).toContain('202212');
    expect(p).toContain('2021Q1');
    expect(p).toContain('2022Q4');
    expect(p).toContain('2021');
    expect(p).toContain('2022');
    expect(p.filter(x => /^\d{6}$/.test(x))).toHaveLength(24);   // 2 years × 12 months
    expect(p.filter(x => /Q/.test(x))).toHaveLength(8);          // 2 × 4 quarters
    expect(p.filter(x => /^\d{4}$/.test(x))).toHaveLength(2);    // 2 years
  });
  it('accepts an explicit list', () => {
    expect(expandPeriods({ list: ['2024', '2024Q1'] })).toEqual(['2024', '2024Q1']);
  });
});

describe('parsePeriod', () => {
  it('parses monthly', () => {
    expect(parsePeriod('202503')).toEqual(
      { period: '202503', periodType: 'MONTHLY', year: 2025, quarter: 1, month: 3, startDate: '2025-03-01' });
  });
  it('parses quarterly', () => {
    expect(parsePeriod('2025Q2')).toEqual(
      { period: '2025Q2', periodType: 'QUARTERLY', year: 2025, quarter: 2, month: null, startDate: '2025-04-01' });
  });
  it('parses yearly', () => {
    expect(parsePeriod('2025')).toEqual(
      { period: '2025', periodType: 'YEARLY', year: 2025, quarter: null, month: null, startDate: '2025-01-01' });
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npm test -- periods`
Expected: FAIL — `expandPeriods is not a function` / module not found.

- [ ] **Step 3: Implement `periods.mjs`**
```js
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
```

- [ ] **Step 4: Run it, confirm pass**

Run: `npm test -- periods`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**
```bash
git add scripts/dhis2-extract/lib/periods.mjs scripts/dhis2-extract/lib/periods.test.mjs
git commit -m "feat(extract): period expansion and parsing"
```

---

### Task 3: Org-unit rows & GeoJSON (`orgunits.mjs`)

**Files:**
- Create: `scripts/dhis2-extract/lib/orgunits.mjs`
- Test: `scripts/dhis2-extract/lib/orgunits.test.mjs`

- [ ] **Step 1: Write the failing test** (fixtures mirror real geoFeatures shape)
```js
import { describe, it, expect } from 'vitest';
import { geoFeatureToOuRow, coToGeometry, geoFeaturesToGeoJSON } from './orgunits.mjs';

const facility = { id: 'plnHVbJR6p4', na: 'Ahamadyya Mission Cl', le: 4, pi: 'QywkxFudXrC',
                   pn: 'Magbema', pg: 'ImspTQPwCqd/PMa2VCrupOd/QywkxFudXrC', ty: 1, co: '[-12.9487,9.0131]' };
const district = { id: 'O6uvpzGd5pu', na: 'Bo', le: 2, pi: 'ImspTQPwCqd', pn: 'Sierra Leone',
                   pg: 'ImspTQPwCqd', ty: 2, co: '[[[-11.59,8.48],[-11.58,8.47],[-11.57,8.49],[-11.59,8.48]]]' };

describe('geoFeatureToOuRow', () => {
  it('maps a facility point with lng/lat', () => {
    expect(geoFeatureToOuRow(facility)).toEqual({
      id: 'plnHVbJR6p4', name: 'Ahamadyya Mission Cl', level: 4,
      parent_id: 'QywkxFudXrC', parent_name: 'Magbema',
      path: 'ImspTQPwCqd/PMa2VCrupOd/QywkxFudXrC', ty: 1, lng: -12.9487, lat: 9.0131 });
  });
  it('maps a polygon with empty lng/lat', () => {
    const r = geoFeatureToOuRow(district);
    expect(r.lng).toBe('');
    expect(r.lat).toBe('');
    expect(r.level).toBe(2);
    expect(r.path).toBe('ImspTQPwCqd');
  });
});

describe('coToGeometry', () => {
  it('point → Point geometry', () => {
    expect(coToGeometry(1, '[-12.9487,9.0131]')).toEqual({ type: 'Point', coordinates: [-12.9487, 9.0131] });
  });
  it('triple-nested → Polygon', () => {
    expect(coToGeometry(2, '[[[-11.59,8.48],[-11.58,8.47]]]').type).toBe('Polygon');
  });
  it('quadruple-nested → MultiPolygon', () => {
    expect(coToGeometry(2, '[[[[-11.59,8.48],[-11.58,8.47]]]]').type).toBe('MultiPolygon');
  });
});

describe('geoFeaturesToGeoJSON', () => {
  it('builds a FeatureCollection with id/name/level properties', () => {
    const fc = geoFeaturesToGeoJSON([facility, district]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].properties).toMatchObject({ id: 'plnHVbJR6p4', name: 'Ahamadyya Mission Cl', level: 4 });
    expect(fc.features[0].geometry.type).toBe('Point');
    expect(fc.features[1].geometry.type).toBe('Polygon');
  });
});
```

- [ ] **Step 2: Run, confirm fail.** Run: `npm test -- orgunits` → FAIL.

- [ ] **Step 3: Implement `orgunits.mjs`**
```js
// Transform DHIS2 geoFeatures into tidy org-unit rows + a GeoJSON FeatureCollection. Pure.
export function coToGeometry(ty, co) {
  const coords = JSON.parse(co);
  if (ty === 1) return { type: 'Point', coordinates: coords };
  // ty === 2: polygon. Depth of nested arrays decides Polygon vs MultiPolygon.
  const depth = (a) => (Array.isArray(a) ? 1 + depth(a[0]) : 0);
  return { type: depth(coords) === 4 ? 'MultiPolygon' : 'Polygon', coordinates: coords };
}

export function geoFeatureToOuRow(f) {
  let lng = '', lat = '';
  if (f.ty === 1) { [lng, lat] = JSON.parse(f.co); }
  return {
    id: f.id, name: f.na, level: f.le,
    parent_id: f.pi ?? '', parent_name: f.pn ?? '', path: f.pg ?? '',
    ty: f.ty, lng, lat,
  };
}

export function geoFeaturesToGeoJSON(features) {
  return {
    type: 'FeatureCollection',
    features: features.map((f) => ({
      type: 'Feature',
      properties: { id: f.id, name: f.na, level: f.le, parent_id: f.pi ?? '' },
      geometry: coToGeometry(f.ty, f.co),
    })),
  };
}
```

- [ ] **Step 4: Run, confirm pass.** Run: `npm test -- orgunits` → PASS.

- [ ] **Step 5: Commit**
```bash
git add scripts/dhis2-extract/lib/orgunits.mjs scripts/dhis2-extract/lib/orgunits.test.mjs
git commit -m "feat(extract): org-unit rows and GeoJSON from geoFeatures"
```

---

### Task 4: Fact & dimension rows from analytics (`facts.mjs`)

**Files:**
- Create: `scripts/dhis2-extract/lib/facts.mjs`
- Test: `scripts/dhis2-extract/lib/facts.test.mjs`

- [ ] **Step 1: Write the failing test**
```js
import { describe, it, expect } from 'vitest';
import { analyticsToFactRows, analyticsToDisaggRows, dxRowsFromMeta } from './facts.mjs';

const resp = {
  headers: [{ name: 'dx' }, { name: 'ou' }, { name: 'pe' }, { name: 'value' }],
  rows: [['Uvn6LCg7dVU', 'O6uvpzGd5pu', '2025Q2', '144.77'],
         ['Uvn6LCg7dVU', 'O6uvpzGd5pu', '202503', '48.1']],
  metaData: { items: { Uvn6LCg7dVU: { name: 'ANC 1 Coverage' }, O6uvpzGd5pu: { name: 'Bo' } } },
};
const disagg = {
  headers: [{ name: 'dx' }, { name: 'J5jldMd8OHv' }, { name: 'ou' }, { name: 'pe' }, { name: 'value' }],
  rows: [['hfdmMSPBgLG', 'uYxK4wmcPqA', 'ImspTQPwCqd', '2025', '12.3']],
  metaData: { items: { hfdmMSPBgLG: { name: 'ANC 4th or more visits' }, uYxK4wmcPqA: { name: 'CHP' } } },
};

it('builds fact rows with derived periodType and numeric value', () => {
  expect(analyticsToFactRows(resp)).toEqual([
    { dx: 'Uvn6LCg7dVU', ou: 'O6uvpzGd5pu', pe: '2025Q2', periodType: 'QUARTERLY', value: 144.77 },
    { dx: 'Uvn6LCg7dVU', ou: 'O6uvpzGd5pu', pe: '202503', periodType: 'MONTHLY', value: 48.1 },
  ]);
});
it('builds disaggregation rows with category id + resolved name', () => {
  expect(analyticsToDisaggRows(disagg, 'J5jldMd8OHv')).toEqual([
    { dx: 'hfdmMSPBgLG', ou: 'ImspTQPwCqd', pe: '2025', periodType: 'YEARLY',
      category_id: 'uYxK4wmcPqA', category_name: 'CHP', value: 12.3 },
  ]);
});
it('collects unique dx rows from metaData across responses (dx ids only)', () => {
  expect(dxRowsFromMeta([resp], ['Uvn6LCg7dVU'])).toEqual([{ id: 'Uvn6LCg7dVU', name: 'ANC 1 Coverage' }]);
});
```

- [ ] **Step 2: Run, confirm fail.** `npm test -- facts` → FAIL.

- [ ] **Step 3: Implement `facts.mjs`**
```js
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
```

- [ ] **Step 4: Run, confirm pass.** `npm test -- facts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add scripts/dhis2-extract/lib/facts.mjs scripts/dhis2-extract/lib/facts.test.mjs
git commit -m "feat(extract): fact, disaggregation and dx rows from analytics"
```

---

### Task 5: CSV writer (`csv.mjs`)

**Files:**
- Create: `scripts/dhis2-extract/lib/csv.mjs`
- Test: `scripts/dhis2-extract/lib/csv.test.mjs`

- [ ] **Step 1: Write the failing test**
```js
import { describe, it, expect } from 'vitest';
import { toCsv } from './csv.mjs';

it('writes header + rows in column order', () => {
  expect(toCsv([{ a: 1, b: 'x' }], ['a', 'b'])).toBe('a,b\n1,x\n');
});
it('quotes values containing comma, quote or newline', () => {
  expect(toCsv([{ a: 'a,b', b: 'he said "hi"' }], ['a', 'b']))
    .toBe('a,b\n"a,b","he said ""hi"""\n');
});
it('renders null/undefined as empty', () => {
  expect(toCsv([{ a: null, b: undefined }], ['a', 'b'])).toBe('a,b\n,\n');
});
```

- [ ] **Step 2: Run, confirm fail.** `npm test -- csv` → FAIL.

- [ ] **Step 3: Implement `csv.mjs`**
```js
// Minimal RFC-4180-ish CSV serialiser. Pure.
function cell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows, columns) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(','));
  return lines.join('\n') + '\n';
}
```

- [ ] **Step 4: Run, confirm pass.** `npm test -- csv` → PASS.

- [ ] **Step 5: Commit**
```bash
git add scripts/dhis2-extract/lib/csv.mjs scripts/dhis2-extract/lib/csv.test.mjs
git commit -m "feat(extract): minimal CSV writer"
```

---

### Task 6: Config loader (`config.mjs`)

**Files:**
- Create: `scripts/dhis2-extract/lib/config.mjs`
- Test: `scripts/dhis2-extract/lib/config.test.mjs`
- Test fixture: `scripts/dhis2-extract/lib/__fixtures__/minimal.yaml`

- [ ] **Step 1: Write the fixture** `scripts/dhis2-extract/lib/__fixtures__/minimal.yaml`
```yaml
baseUrl: https://example.org/dhis
dx: [Uvn6LCg7dVU]
ouLevels: [1, 2]
periods: { range: '2024..2024', types: [yearly] }
```

- [ ] **Step 2: Write the failing test**
```js
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadConfig } from './config.mjs';
const here = dirname(fileURLToPath(import.meta.url));

it('loads and normalises a minimal config', () => {
  const c = loadConfig(join(here, '__fixtures__/minimal.yaml'));
  expect(c.baseUrl).toBe('https://example.org/dhis');
  expect(c.dx).toEqual(['Uvn6LCg7dVU']);
  expect(c.ouLevels).toEqual([1, 2]);
  expect(c.disaggregations).toEqual([]);          // default
  expect(c.periods.types).toEqual(['yearly']);
});
it('throws on missing required keys', () => {
  expect(() => loadConfig(join(here, '__fixtures__/does-not-exist.yaml'))).toThrow();
});
```

- [ ] **Step 3: Run, confirm fail.** `npm test -- config` → FAIL.

- [ ] **Step 4: Implement `config.mjs`**
```js
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

export function loadConfig(path) {
  const raw = parse(readFileSync(path, 'utf8'));
  for (const key of ['baseUrl', 'dx', 'ouLevels', 'periods'])
    if (raw[key] == null) throw new Error(`config: missing required key "${key}"`);
  return {
    baseUrl: raw.baseUrl.replace(/\/$/, ''),
    dx: raw.dx,
    ouLevels: raw.ouLevels,
    periods: raw.periods,
    disaggregations: (raw.disaggregations ?? []).map((d) => ({
      dim: d.dim, slug: d.slug, dx: d.dx, ouLevels: d.ouLevels ?? [1],
    })),
  };
}
```

- [ ] **Step 5: Run, confirm pass.** `npm test -- config` → PASS.

- [ ] **Step 6: Commit**
```bash
git add scripts/dhis2-extract/lib/config.mjs scripts/dhis2-extract/lib/config.test.mjs scripts/dhis2-extract/lib/__fixtures__
git commit -m "feat(extract): YAML config loader with validation"
```

---

### Task 7: DHIS2 fetch client (`dhis2.mjs`)

This task talks to the network; verify against the live play server rather than mocking (mocking `fetch` here would test the mock, not the integration). Keep it thin.

**Files:**
- Create: `scripts/dhis2-extract/lib/dhis2.mjs`

- [ ] **Step 1: Implement `dhis2.mjs`**
```js
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
  };
}

// Group periods into chunks bounded by count to keep URLs/responses sane.
export function chunkPeriods(periods, size = 24) {
  const out = [];
  for (let i = 0; i < periods.length; i += size) out.push(periods.slice(i, i + size));
  return out;
}
```

- [ ] **Step 2: Live smoke test (manual, gated on creds)**

Run (with creds in env):
```bash
DHIS2_USERNAME=admin DHIS2_PASSWORD=district node -e "
import('./scripts/dhis2-extract/lib/dhis2.mjs').then(async ({makeClient}) => {
  const c = makeClient({baseUrl:'https://play.im.dhis2.org/stable-2-43-0',username:process.env.DHIS2_USERNAME,password:process.env.DHIS2_PASSWORD});
  const a = await c.analytics(['Uvn6LCg7dVU'],[2],['2025']);
  console.log('analytics rows:', a.rows.length, 'sample:', a.rows[0]);
  const g = await c.geoFeatures(2);
  console.log('geoFeatures L2:', g.length, 'sample id:', g[0].id);
});"
```
Expected: `analytics rows: 13` (one per district) and `geoFeatures L2: 13`.

- [ ] **Step 3: Commit**
```bash
git add scripts/dhis2-extract/lib/dhis2.mjs
git commit -m "feat(extract): DHIS2 fetch client with chunked analytics"
```

---

### Task 8: CLI orchestrator + ANC config + first real extract

**Files:**
- Create: `scripts/dhis2-extract/index.mjs`
- Create: `scripts/dhis2-extract/config/anc.yaml`
- Create: `scripts/dhis2-extract/README.md`
- Modify: `package.json` (add `extract:anc` script)
- Modify: `.gitignore`

- [ ] **Step 1: Write the ANC config** `scripts/dhis2-extract/config/anc.yaml`
```yaml
# Antenatal Care reference extract (Sierra Leone demo). A *superset* — all levels and a
# multi-year, multi-granularity period range — so the portal's root-OU and reference-period
# selectors have data to filter. Auth comes from env: DHIS2_USERNAME / DHIS2_PASSWORD.
baseUrl: https://play.im.dhis2.org/stable-2-43-0
dx: [Uvn6LCg7dVU, OdiHJayrsKo, sB79w2hiLp8, fbfJHSPpUQD, cYeuwXTCPkU,
     Jtf34kNZhzP, hfdmMSPBgLG, c8fABiNpT0B, Tt5TAvdfdVK]
ouLevels: [1, 2, 3, 4]
periods:
  range: '2025..2026'   # the demo's populated window (see "Data window" above)
  types: [monthly, quarterly, yearly]
disaggregations:
  - dim: J5jldMd8OHv      # Facility Type — items 7 & 8
    slug: facility_type
    dx: [hfdmMSPBgLG, Jtf34kNZhzP]
    ouLevels: [1, 2]
  - dim: fMZEcRHuamy      # Fixed vs Outreach — item 9
    slug: fixed_outreach
    dx: [fbfJHSPpUQD, cYeuwXTCPkU, Jtf34kNZhzP, hfdmMSPBgLG]
    ouLevels: [1, 2]
```

- [ ] **Step 2: Implement `index.mjs`**
```js
#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './lib/config.mjs';
import { expandPeriods, parsePeriod } from './lib/periods.mjs';
import { makeClient, chunkPeriods } from './lib/dhis2.mjs';
import { analyticsToFactRows, analyticsToDisaggRows, dxRowsFromMeta } from './lib/facts.mjs';
import { geoFeatureToOuRow, geoFeaturesToGeoJSON } from './lib/orgunits.mjs';
import { toCsv } from './lib/csv.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const cfg = loadConfig(arg('config'));
  const outDir = arg('out', 'data/anc');
  const { DHIS2_USERNAME: username, DHIS2_PASSWORD: password } = process.env;
  if (!username || !password) throw new Error('Set DHIS2_USERNAME and DHIS2_PASSWORD in env');
  const client = makeClient({ baseUrl: cfg.baseUrl, username, password });
  mkdirSync(outDir, { recursive: true });

  // --- primary fact ---
  const periods = expandPeriods(cfg.periods);
  const factResponses = [];
  for (const chunk of chunkPeriods(periods)) factResponses.push(await client.analytics(cfg.dx, cfg.ouLevels, chunk));
  const factRows = factResponses.flatMap(analyticsToFactRows);
  writeFileSync(join(outDir, 'fact.csv'), toCsv(factRows, ['dx', 'ou', 'pe', 'periodType', 'value']));
  console.log(`fact.csv: ${factRows.length} rows`);

  // --- disaggregation cuts ---
  for (const d of cfg.disaggregations) {
    const resps = [];
    for (const chunk of chunkPeriods(periods)) resps.push(await client.analytics(d.dx, d.ouLevels, chunk, d.dim));
    const rows = resps.flatMap((r) => analyticsToDisaggRows(r, d.dim));
    writeFileSync(join(outDir, `fact_${d.slug}.csv`),
      toCsv(rows, ['dx', 'ou', 'pe', 'periodType', 'category_id', 'category_name', 'value']));
    console.log(`fact_${d.slug}.csv: ${rows.length} rows`);
  }

  // --- org units + geometry ---
  const features = [];
  for (const level of cfg.ouLevels) features.push(...(await client.geoFeatures(level)));
  const ouRows = features.map(geoFeatureToOuRow);
  writeFileSync(join(outDir, 'ou.csv'),
    toCsv(ouRows, ['id', 'name', 'level', 'parent_id', 'parent_name', 'path', 'ty', 'lng', 'lat']));
  writeFileSync(join(outDir, 'ou.geojson'), JSON.stringify(geoFeaturesToGeoJSON(features)));
  console.log(`ou.csv: ${ouRows.length} rows; ou.geojson written`);

  // --- dimensions ---
  writeFileSync(join(outDir, 'dx.csv'), toCsv(dxRowsFromMeta(factResponses, cfg.dx), ['id', 'name']));
  writeFileSync(join(outDir, 'pe.csv'),
    toCsv(periods.map(parsePeriod), ['period', 'periodType', 'year', 'quarter', 'month', 'startDate']));
  console.log('dx.csv, pe.csv written');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Write `scripts/dhis2-extract/README.md`** — document: purpose (generic), config schema (all keys incl. `disaggregations`), env auth, `node scripts/dhis2-extract/index.mjs --config <path> --out <dir>`, and that the ANC config is the worked example. Note the output files and their columns (mirror the spec's "Outputs" section).

- [ ] **Step 4: Add the npm script** in root `package.json` `scripts`:
```json
"extract:anc": "node scripts/dhis2-extract/index.mjs --config scripts/dhis2-extract/config/anc.yaml --out evidence/sources/anc && mkdir -p evidence/static && cp evidence/sources/anc/ou.geojson evidence/static/anc.geojson"
```

- [ ] **Step 5: Update `.gitignore`** — add generated artefacts:
```
# DHIS2 extractor output (regenerate with `npm run extract:anc`)
evidence/sources/anc/*.csv
evidence/sources/anc/*.geojson
evidence/static/anc.geojson
```

- [ ] **Step 6: Run the real extract against the play server**

Run (background — it makes ~20+ API calls; poll the log):
```bash
mkdir -p evidence/static
DHIS2_USERNAME=admin DHIS2_PASSWORD=district npm run extract:anc
```
Expected console: `fact.csv: <hundreds of thousands> rows`, `fact_facility_type.csv`, `fact_fixed_outreach.csv`, `ou.csv: ~764 rows`, `dx.csv, pe.csv written`.

- [ ] **Step 7: Verify outputs structurally**
```bash
head -3 evidence/sources/anc/fact.csv
wc -l evidence/sources/anc/*.csv
python3 -c "import json;d=json.load(open('evidence/sources/anc/ou.geojson'));print('features',len(d['features']),'types',set(f['geometry']['type'] for f in d['features']))"
```
Expected: `fact.csv` header `dx,ou,pe,periodType,value`; geojson has `Point` and `Polygon`/`MultiPolygon` features; `pe.csv` is **35 lines** via `wc -l` = 34 data rows (2 years × [12 monthly + 4 quarterly + 1 yearly]) + 1 header. (`fact.csv` ≈ 312k rows — analytics is sparse but both years are well populated; exact count not pinned.)

- [ ] **Step 8: Commit** (code + config + README + wiring; generated CSVs are gitignored)
```bash
git add scripts/dhis2-extract/index.mjs scripts/dhis2-extract/config/anc.yaml scripts/dhis2-extract/README.md package.json .gitignore
git commit -m "feat(extract): CLI orchestrator + ANC config; first live extract"
```

---

### Task 9: Precompress `.geojson`

**Files:**
- Modify: `scripts/precompress.mjs:19`

- [ ] **Step 1: Add `.geojson` to the EXT set**

`scripts/precompress.mjs` line 19 — add `'.geojson'`:
```js
const EXT = new Set(['.js', '.mjs', '.css', '.html', '.json', '.geojson', '.svg', '.map', '.wasm']);
```

- [ ] **Step 2: Verify (after a later build/deploy) the geojson is compressed** — deferred to Task 15's deploy; note here that `evidence/build/.../anc.geojson.br` and `.gz` must exist.

- [ ] **Step 3: Commit**
```bash
git add scripts/precompress.mjs
git commit -m "build: precompress .geojson assets"
```

---

# PART B — Evidence portal (consumes the extract)

> Pages are not unit-tested; verify each by building and (for engine pages) a Playwright check using the **webapp-testing** skill (`scripts/with_server.py`). The acceptance signal for *baked* pages is **no DuckDB engine request**; for *engine* pages it's that changing an input changes the rendered values.
>
> **Build ordering (important):** `/anc/index.md` links to `/anc/dashboard` and `/anc/profile`, and SvelteKit's prerenderer fails on internal links whose target pages don't exist yet. So **author all four page files (Tasks 11–14) before running `npm run build`**, then do one consolidated build + per-page verification. The per-task "Build" steps below are therefore deferred to a single build at the end of Task 14 / start of Task 15 — author and commit page content per task, but don't build until the cross-linked pages all exist.

### Task 10: CSV source + `npm run sources`

**Files:**
- Create: `evidence/sources/anc/connection.yaml`

- [ ] **Step 1: Write the connection**
```yaml
name: anc
type: csv
```

- [ ] **Step 2: Build sources**

Run: `npm run sources`
Expected: parquet + manifest produced for tables `anc.fact`, `anc.fact_facility_type`, `anc.fact_fixed_outreach`, `anc.ou`, `anc.dx`, `anc.pe` under `evidence/.evidence/template/static/data`. (`ou.geojson` is ignored by the CSV connector — that's expected; it's served from `evidence/static/`.)

- [ ] **Step 3: Spot-check a baked query in dev** — start `npm run dev` (background), open `/`, confirm no source errors in the dev log. Stop dev.

- [ ] **Step 4: Commit**
```bash
git add evidence/sources/anc/connection.yaml
git commit -m "feat(portal): ANC CSV datasource"
```

---

### Task 11: Baked national overview — `/anc`

Fixed root = Sierra Leone (`ImspTQPwCqd`), latest year. **No `${inputs}`** ⇒ fully baked.

**Files:**
- Create: `evidence/pages/anc/index.md`

- [ ] **Step 1: Write the page**
````markdown
---
title: Antenatal Care — Sierra Leone
---

```sql latest_year
select max(year) as y from anc.pe where periodType = 'YEARLY'
```

```sql national_coverage
select d.name as indicator, f.value
from anc.fact f
join anc.dx d on f.dx = d.id
where f.ou = 'ImspTQPwCqd' and f.periodType = 'YEARLY'
  and f.pe = (select max(pe) from anc.fact where periodType = 'YEARLY')
  and f.dx in ('Uvn6LCg7dVU','OdiHJayrsKo','sB79w2hiLp8')
order by d.name
```

<Grid cols=3>
  <BigValue data={national_coverage.filter(r => r.indicator === 'ANC 1 Coverage')} value=value title="ANC 1 Coverage" fmt="num1" />
  <BigValue data={national_coverage.filter(r => r.indicator === 'ANC 2 Coverage')} value=value title="ANC 2 Coverage" fmt="num1" />
  <BigValue data={national_coverage.filter(r => r.indicator === 'ANC 3 Coverage')} value=value title="ANC 3 Coverage" fmt="num1" />
</Grid>

```sql coverage_by_district
select o.name as district, f.value
from anc.fact f
join anc.ou o on f.ou = o.id
where f.dx = 'Uvn6LCg7dVU' and f.periodType = 'YEARLY'
  and f.pe = (select max(pe) from anc.fact where periodType = 'YEARLY')
  and o.level = 2
order by f.value desc
```

<BarChart data={coverage_by_district} x=district y=value title="ANC 1 Coverage by district (latest year)" swapXY=true />

```sql national_trend
select p.startDate as month, f.value
from anc.fact f
join anc.pe p on f.pe = p.period
where f.dx = 'Uvn6LCg7dVU' and f.ou = 'ImspTQPwCqd' and f.periodType = 'MONTHLY'
order by p.startDate
```

<LineChart data={national_trend} x=month y=value title="ANC 1 Coverage — national monthly trend" />

[Explore the full dashboard →](/anc/dashboard)  ·  [Org-unit profiles →](/anc/profile)
````

- [ ] **Step 2: Build**

Run (background, poll log): `npm run build`
Expected: build succeeds; `evidence/build/anc/index.html` exists.

- [ ] **Step 3: Verify it is BAKED (no engine)** — confirm the values are in the HTML and no DuckDB request is needed:
```bash
grep -c "ANC 1 Coverage" evidence/build/anc/index.html      # expect ≥1 (baked text/labels)
ls evidence/build/anc/*.arrow 2>/dev/null || echo "arrow alongside page"
```
Then a Playwright check (webapp-testing skill): serve `evidence/build`, load `/anc/`, assert `page.wait_for_load_state('networkidle')` makes **no request** whose URL contains `duckdb` or `.wasm`, and that the three BigValues render numbers. (Run `python scripts/with_server.py --help` first.)

- [ ] **Step 4: Commit**
```bash
git add evidence/pages/anc/index.md
git commit -m "feat(portal): baked ANC national overview"
```

---

### Task 12: ANC replica charts (items 1–9) — `/anc/dashboard`

Engine page. Root-OU + reference-year selectors drive every query. **Every fact query filters `periodType`** and re-scopes OU via `o.path like '%' || '${inputs.root.value}' || '%'`.

**Files:**
- Create: `evidence/pages/anc/dashboard.md`

- [ ] **Step 1: Inputs + a reusable period anchor**
````markdown
---
title: Antenatal Care dashboard
---

```sql root_options
select id as value, name as label, level from anc.ou where level in (1,2) order by level, name
```
```sql year_options
-- Source years from actual fact data (not anc.pe), so the selector never offers empty years.
select distinct cast(substr(pe,1,4) as integer) as value, substr(pe,1,4) as label
from anc.fact where periodType='YEARLY' order by value desc
```

<Dropdown data={root_options} name=root value=value label=label title="Root org unit" defaultValue="ImspTQPwCqd" />
<Dropdown data={year_options} name=refyear value=value label=label title="Reference year" />

*ANC Overview — coverage and visits for the selected root unit and reference year. Use the icons on each chart to switch table/chart views.*
````
> **Relative windows** resolve against `${inputs.refyear.value}`: "this year" = `periodType='YEARLY' and pe = '${inputs.refyear.value}'`; "last 12 months" = `periodType='MONTHLY' and year in (refyear, refyear-1)` ordered by `startDate` (cap to 12 in the chart if needed); "last 4 quarters" = `periodType='QUARTERLY' and year in (refyear, refyear-1)` last 4.
>
> **Root-OU scope (descendant-or-self).** The extractor's `path` (from geoFeatures `pg`) **excludes self**, so scoping must include the root itself, and must match on `/`-segment boundaries to avoid id-substring false positives. Use this exact predicate everywhere a chart re-scopes to the selected root (substitute the chart's target `level`):
> ```sql
> and o.level = N
> and ( o.id = '${inputs.root.value}'
>       or ('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%' )
> ```
> Semantics: "all units at level N that are the selected root or a descendant of it." Root = national (level 1) → all level-2 districts / level-3 chiefdoms etc.; root = a district (level 2) → that district itself for level-2 charts (a single bar — degenerate but correct) and its chiefdoms/facilities for level-3/4 charts.

- [ ] **Step 2: Add the 8 chart items.** Use this query/component table; each query references an input so all run in the engine. `<area_scope N>` below means the **descendant-or-self predicate** for level N defined in Step 1 (never the naive `like '%id%'`).

| # | Component | Query (SELECT … FROM anc.fact f join anc.ou o on f.ou=o.id join anc.pe p on f.pe=p.period WHERE …) |
|---|---|---|
| 2 | `<BarChart x=district y=value series=indicator>` | `f.dx in ('Uvn6LCg7dVU','OdiHJayrsKo') and f.periodType='QUARTERLY' and p.year in (${inputs.refyear.value}, ${inputs.refyear.value}-1) <area_scope level 2>` (take last 4 quarters; series = `d.name`) |
| 3 | `<BarChart x=district y=value swapXY>` | `f.dx='sB79w2hiLp8' and f.periodType='MONTHLY' and p.year in (${refyear},${refyear}-1) <area_scope 2>` aggregated `avg(value)` per district over last 12 months |
| 4 | `<LineChart x=month y=value series=year>` (YoY) | `f.dx='Uvn6LCg7dVU' and f.ou='${inputs.root.value}' and f.periodType='MONTHLY'`; select `p.month as month, p.year as year, f.value` → one line per year |
| 5 | `<BarChart x=chiefdom y=value swapXY>` | `f.dx='Uvn6LCg7dVU' and f.periodType='YEARLY' and f.pe='${refyear}' <area_scope 3>` |
| 6 | `<LineChart x=month y=cum>` (cumulative) | `f.dx='fbfJHSPpUQD' and f.periodType='MONTHLY' and p.year in (${refyear},${refyear}-1) <area_scope 2>`; window `sum(value) over (partition by district order by startDate)` |
| 7 | `<ECharts>` pie | from `anc.fact_facility_type` `dx='hfdmMSPBgLG' and periodType='YEARLY' and pe='${refyear}' and ou='${inputs.root.value}'`; pie over `category_name` / `value` |
| 8 | `<BarChart x=month y=value series=category_name type=stacked100>` | from `anc.fact_facility_type` `dx='Jtf34kNZhzP' and periodType='MONTHLY' and ou='${inputs.root.value}' and p.year in (${refyear},${refyear}-1)` |
| 9 | `<BarChart x=indicator y=value series=category_name type=stacked100>` | from `anc.fact_fixed_outreach` `dx in (4 visit dx) and periodType='YEARLY' and pe='${refyear}' and ou='${inputs.root.value}'`; x = `d.name` |

Write each as a fenced ```sql <name>``` block + the component, inside `<Grid cols=2>` groupings that approximate the DHIS2 layout (text + KPI row; coverage charts; visit charts). Item 1 is the markdown text panel from Step 1. Confirm `type=stacked100` and pie via `<ECharts>` against the installed `@evidence-dev/core-components` (grep `BarChart.svelte` for `stacked100`; if absent, use `<BarChart ... stackType=...>` per the installed API — verify before writing).

- [ ] **Step 3: Build.** `npm run build` (background, poll). Expect success; `evidence/build/anc/dashboard/index.html` exists.

- [ ] **Step 4: Verify it is ENGINE-driven** (webapp-testing skill): serve build, load `/anc/dashboard`, wait for networkidle, screenshot. Assert: (a) a DuckDB/`.wasm` request DID occur (engine loaded), (b) selecting a different **Reference year** in the `refyear` Dropdown changes at least one chart's rendered values (compare a DataTable cell or `page.content()` before/after).

- [ ] **Step 5: Commit**
```bash
git add evidence/pages/anc/dashboard.md
git commit -m "feat(portal): ANC dashboard replica charts (items 1-9, engine)"
```

---

### Task 13: ANC replica maps (items 10–11) — add to `/anc/dashboard`

**Files:**
- Modify: `evidence/pages/anc/dashboard.md`

- [ ] **Step 1: Item 10 — IPT 2 choropleth (chiefdoms, level 3)**
````markdown
```sql ipt2_map
select o.id, o.name, f.value, '/anc/profile?ou=' || o.id as profile_url
from anc.fact f join anc.ou o on f.ou = o.id
where f.dx = 'c8fABiNpT0B' and f.periodType = 'YEARLY' and f.pe = '${inputs.refyear.value}'
  and o.level = 3
  and ( o.id = '${inputs.root.value}'
        or ('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%' )
```
<AreaMap data={ipt2_map} geoJsonUrl="/anc.geojson" geoId="id" areaCol="id" value="value"
  title="ANC IPT 2 Coverage" tooltip={[{id:'name',showColumnTitles:false},{id:'value',fmt:'num1'}]}
  link="profile_url" height={400} />
```
````
> `geoId="id"` matches the GeoJSON feature property `id` the extractor wrote; `areaCol="id"` is the query column. **`link` is the name of a column** holding the href (verified: 5.4.2 `MapArea.svelte`/`Point.svelte` read `item[link]`) — hence the `profile_url` column, deep-linking into the profile page (Task 14). Re-confirm click-navigation behaviour in 5.4.2 when building.

- [ ] **Step 2: Item 11 — LLITN: district choropleth + facility points**
````markdown
```sql llitn_districts
select o.id, o.name, f.value from anc.fact f join anc.ou o on f.ou=o.id
where f.dx='Tt5TAvdfdVK' and f.periodType='YEARLY' and f.pe='${inputs.refyear.value}'
  and o.level=2
  and ( o.id = '${inputs.root.value}'
        or ('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%' )
```
```sql llitn_facilities
select o.name, o.lng, o.lat, f.value from anc.fact f join anc.ou o on f.ou=o.id
where f.dx='Tt5TAvdfdVK' and f.periodType='YEARLY' and f.pe='${inputs.refyear.value}'
  and o.level=4 and o.lng is not null   -- NOT o.lng <> '' : DuckDB types lng/lat as DOUBLE (polygons → NULL); '' comparison errors
  and ( o.id = '${inputs.root.value}'
        or ('/' || o.path || '/') like '%/' || '${inputs.root.value}' || '/%' )
```
<AreaMap data={llitn_districts} geoJsonUrl="/anc.geojson" geoId="id" areaCol="id" value="value"
  title="ANC LLITN coverage — districts" height={400} />
<PointMap data={llitn_facilities} lat="lat" long="lng" value="value" pointName="name"
  title="ANC LLITN coverage — facilities" height={400} />
````

- [ ] **Step 3: Build + verify maps render** (webapp-testing skill): serve, load `/anc/dashboard`, wait networkidle, screenshot; assert the `/anc.geojson` request returns 200 and the map canvases/SVG render (Leaflet container present, no "areaCol is required" error text). Confirm `value`/`geoId`/`areaCol`/`lat`/`long` prop names against `Areas.svelte`/`Points.svelte` (already verified in design — re-confirm if the component version changed).

- [ ] **Step 4: Commit**
```bash
git add evidence/pages/anc/dashboard.md
git commit -m "feat(portal): ANC dashboard maps (choropleth + facility points)"
```

---

### Task 14: Org-unit profile drill-down — `/anc/profile`

On-demand, deep-linkable. Primary UX: an OU `<Dropdown>`. Deep link: `/anc/profile?ou=<id>` rendered by a custom component that reads the URL param and `query()`s client-side.

**Files:**
- Create: `evidence/components/OrgUnitProfile.svelte`
- Create: `evidence/pages/anc/profile.md`

- [ ] **Step 1: Dropdown-driven profile (definitely works) in `profile.md`**
````markdown
---
title: Org-unit profile
---

```sql ou_options
select id as value, name as label from anc.ou where level in (2,3) order by name
```
<Dropdown data={ou_options} name=ou value=value label=label title="Org unit" />

```sql profile_indicators
select d.name as indicator, f.value, f.pe
from anc.fact f join anc.dx d on f.dx=d.id
where f.ou = '${inputs.ou.value}' and f.periodType='YEARLY'
  and f.pe = (select max(pe) from anc.fact where periodType='YEARLY')
order by d.name
```
<DataTable data={profile_indicators} />

```sql profile_trend
select d.name as indicator, p.startDate as month, f.value
from anc.fact f join anc.dx d on f.dx=d.id join anc.pe p on f.pe=p.period
where f.ou = '${inputs.ou.value}' and f.periodType='MONTHLY'
  and f.dx in ('Uvn6LCg7dVU','sB79w2hiLp8') order by p.startDate
```
<LineChart data={profile_trend} x=month y=value series=indicator title="Coverage trend" />

<OrgUnitProfile />
````

- [ ] **Step 2: Deep-link component `OrgUnitProfile.svelte`** — reads `?ou=` and renders independently of the Dropdown. Evidence's reactive query factory is `buildQuery` (verified export of `@evidence-dev/component-utilities/buildQuery`: `buildQuery`, `buildInputQuery`, … — there is **no** `query` export). It returns a **reactive `Query`** object (a Svelte store), not a promise — subscribe with `$`. Skeleton (confirm the import surface against the installed package before relying on it):
```svelte
<script>
  import { page } from '$app/stores';
  import { buildQuery } from '@evidence-dev/component-utilities/buildQuery'; // VERIFY against installed pkg
  $: ouId = $page.url.searchParams.get('ou');
  // buildQuery(sql, id) → reactive Query store; deref with $ to read rows.
  $: q = ouId
    ? buildQuery(
        `select d.name as indicator, f.value from anc.fact f join anc.dx d on f.dx=d.id
         where f.ou = '${ouId}' and f.periodType='YEARLY'
           and f.pe=(select max(pe) from anc.fact where periodType='YEARLY') order by d.name`,
        `profile_${ouId}`)
    : null;
</script>

{#if ouId && $q}
  <h3>Profile for {ouId} (deep link)</h3>
  <ul>{#each [...$q] as r}<li>{r.indicator}: {r.value}</li>{/each}</ul>
{/if}
```
> The exact `buildQuery` arity/return in 5.4.2 may differ — treat this as a starting point, not verbatim truth. **Fallback (do not block):** if wiring `buildQuery` is time-consuming, ship the Dropdown-driven profile alone (it already satisfies "on-demand drill-down") and leave the deep-link component behind a clear TODO.

- [ ] **Step 3: Build + verify** (webapp-testing skill): serve, load `/anc/profile`, wait networkidle; assert the DataTable + trend render for the default OU and that selecting another OU changes them. Then load `/anc/profile?ou=O6uvpzGd5pu` and assert the deep-link section lists Bo's indicators (if the component shipped).

- [ ] **Step 4: Commit**
```bash
git add evidence/components/OrgUnitProfile.svelte evidence/pages/anc/profile.md
git commit -m "feat(portal): org-unit profile drill-down (dropdown + deep link)"
```

---

### Task 15: Docs reframe, link-up, full deploy + serve

**Files:**
- Modify: `README.md`, `AGENTS.md`, `evidence/pages/index.md`

- [ ] **Step 1: Reframe `AGENTS.md`** — replace "infrastructure only … no dashboards and no datasources" (lines ~9–11) and the sources-layout "Empty in this foundation — add yours" row with: foundation **plus** a generic Sierra Leone ANC reference example. Add a short "DHIS2 extractor" subsection (point at `scripts/dhis2-extract/README.md`) and an "ANC example" subsection (the three pages + what each demonstrates). **Keep** the "stock `evidence sources` + stock prerendering, no shims" statement — the extractor is an author-time pre-step, not a build shim. Add `extract:anc` to the commands list and `evidence/sources/anc/`, `scripts/dhis2-extract/`, `evidence/components/` to the layout table.

- [ ] **Step 2: Mirror into `README.md`** — add an "ANC reference example" section: `npm run extract:anc` (needs `DHIS2_USERNAME`/`DHIS2_PASSWORD`) → `npm run sources` → `npm run build`. Note the three pages and the baked-vs-engine contrast they demonstrate.

- [ ] **Step 3: Link from the landing page** `evidence/pages/index.md` — add a link to `/anc` describing it as a worked DHIS2 example. (Keep the landing page itself baked.)

- [ ] **Step 4: Full pipeline end-to-end**

Run, in order (builds/deploys in background, poll logs):
```bash
DHIS2_USERNAME=admin DHIS2_PASSWORD=district npm run extract:anc
npm run sources
npm run build
npm run deploy
```
Then start the server (background; no foreground sleep — poll with curl):
```bash
npm run serve   # serves current/ on $SANDBOX_HOST_PORT
```

- [ ] **Step 5: Verify the deploy** — confirm `.br`/`.gz` exist for the geojson and the pages load:
```bash
ls builds/*/anc.geojson.br builds/*/anc.geojson.gz 2>/dev/null && echo "geojson precompressed"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:$SANDBOX_HOST_PORT/anc/"
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:$SANDBOX_HOST_PORT/anc/dashboard/"
```
Expected: `geojson precompressed`; both routes `200`.

- [ ] **Step 6: Final Playwright smoke across all three pages** (webapp-testing skill) against the served deploy: `/anc` (baked: no engine request), `/anc/dashboard` (engine loads; year switch changes a chart; maps render), `/anc/profile` (OU switch changes the table). Capture a full-page screenshot of each to `/tmp` for the handoff summary.

- [ ] **Step 7: Commit**
```bash
git add README.md AGENTS.md evidence/pages/index.md
git commit -m "docs: reframe master as foundation + Sierra Leone ANC reference example"
```

---

## Definition of done

- `npm test` passes (extractor pure-function units: periods, orgunits, facts, csv, config).
- `npm run extract:anc` (with creds) produces `fact*.csv`, `ou.csv`, `dx.csv`, `pe.csv`, `ou.geojson`; `ou.geojson` copied to `evidence/static/anc.geojson`.
- `npm run sources && npm run build && npm run deploy && npm run serve` yields, on `$SANDBOX_HOST_PORT`:
  - `/anc` — baked overview, **no DuckDB engine downloaded**.
  - `/anc/dashboard` — all 11 ANC items; changing root OU / reference year re-computes client-side; maps render.
  - `/anc/profile` — on-demand profile, deep-linkable.
- `.geojson` assets ship precompressed.
- `README.md` / `AGENTS.md` reframed; the extractor and ANC example documented; generated CSVs/geojson gitignored.

## Risks / things to confirm during execution (don't guess — verify against installed pkgs)
- `BarChart` 100%-stacked prop name confirmed `type=stacked100` in 5.4.2 (`BarChart.svelte:65`) — re-grep if the version changes.
- Pie via `<ECharts>` config shape in 5.4.2.
- `buildQuery` import/arity for the deep-link component (Task 14) — time-boxed; Dropdown profile is the fallback.
- Analytics response size / chunking: if a chunk 414s or truncates, lower `chunkPeriods` size or split by level.
- Map `link` is a **column name** in 5.4.2 (not a URL template) — the queries emit a `profile_url` column; confirm click-navigation actually fires when building.
- OU scoping uses the anchored descendant-or-self predicate (Task 12 Step 1), which both handles `path` excluding self and avoids id-substring false positives. Do not regress to `like '%id%'`.
