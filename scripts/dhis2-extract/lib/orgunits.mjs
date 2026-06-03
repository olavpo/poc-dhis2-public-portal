// Build the org-unit dimension + a GeoJSON FeatureCollection from DHIS2. Pure functions.
//
// IMPORTANT: hierarchy and geometry come from DIFFERENT endpoints, and must not be conflated.
//   - Hierarchy (every unit, incl. geometry-less ones like the national root) → /api/organisationUnits.
//   - Geometry (only units that have a boundary/point) → /api/geoFeatures.
// geoFeatures silently omits units without geometry (e.g. the national level in the SL demo),
// so using it for the hierarchy drops the root unit — which breaks any root-OU selector. We
// therefore source `ou.csv` rows from organisationUnits and LEFT-JOIN geometry (ty/lng/lat) by id.

export function coToGeometry(ty, co) {
  const coords = JSON.parse(co);
  if (ty === 1) return { type: 'Point', coordinates: coords };
  // ty === 2: polygon. Depth of nested arrays decides Polygon vs MultiPolygon.
  const depth = (a) => (Array.isArray(a) ? 1 + depth(a[0]) : 0);
  return { type: depth(coords) === 4 ? 'MultiPolygon' : 'Polygon', coordinates: coords };
}

// Map a geoFeatures item → its geometry attributes (ty + lng/lat for points). Used to enrich rows.
export function geoFeatureGeometry(f) {
  let lng = '', lat = '';
  if (f.ty === 1) { [lng, lat] = JSON.parse(f.co); }
  return { ty: f.ty, lng, lat };
}

// Build id → geometry-attributes map from a list of geoFeatures.
export function geometryById(features) {
  return new Map(features.map((f) => [f.id, geoFeatureGeometry(f)]));
}

// One org-unit row from an /api/organisationUnits object, enriched with geometry (or blanks).
// `path` is the DHIS2 path ("/root/.../self" — includes self, leading slash).
export function orgUnitToRow(o, geom = new Map()) {
  const g = geom.get(o.id) ?? { ty: '', lng: '', lat: '' };
  return {
    id: o.id, name: o.name, level: o.level,
    parent_id: o.parent?.id ?? '', parent_name: o.parent?.name ?? '', path: o.path ?? '',
    ty: g.ty, lng: g.lng, lat: g.lat,
  };
}

// Full ou.csv row set: every org unit (hierarchy) left-joined to geometry.
export function buildOuRows(orgUnits, features) {
  const geom = geometryById(features);
  return orgUnits.map((o) => orgUnitToRow(o, geom));
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
