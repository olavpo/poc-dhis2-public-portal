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
