import { describe, it, expect } from 'vitest';
import { coToGeometry, geoFeaturesToGeoJSON, buildOuRows, orgUnitToRow, geometryById } from './orgunits.mjs';

// geoFeatures items (geometry source) — facility is a point, district a polygon.
const facilityGeo = { id: 'plnHVbJR6p4', na: 'Ahamadyya Mission Cl', le: 4, pi: 'QywkxFudXrC',
                      pn: 'Magbema', pg: 'ImspTQPwCqd/PMa2VCrupOd/QywkxFudXrC', ty: 1, co: '[-12.9487,9.0131]' };
const districtGeo = { id: 'O6uvpzGd5pu', na: 'Bo', le: 2, pi: 'ImspTQPwCqd', pn: 'Sierra Leone',
                      pg: 'ImspTQPwCqd', ty: 2, co: '[[[-11.59,8.48],[-11.58,8.47],[-11.57,8.49],[-11.59,8.48]]]' };

// /api/organisationUnits objects (hierarchy source) — note the national root has NO geometry.
const national = { id: 'ImspTQPwCqd', name: 'Sierra Leone', level: 1, path: '/ImspTQPwCqd' };
const district = { id: 'O6uvpzGd5pu', name: 'Bo', level: 2, path: '/ImspTQPwCqd/O6uvpzGd5pu',
                   parent: { id: 'ImspTQPwCqd', name: 'Sierra Leone' } };
const facility = { id: 'plnHVbJR6p4', name: 'Ahamadyya Mission Cl', level: 4,
                   path: '/ImspTQPwCqd/PMa2VCrupOd/QywkxFudXrC',
                   parent: { id: 'QywkxFudXrC', name: 'Magbema' } };

describe('orgUnitToRow', () => {
  it('builds a row from an org-unit, enriched with point geometry', () => {
    const geom = geometryById([facilityGeo]);
    expect(orgUnitToRow(facility, geom)).toEqual({
      id: 'plnHVbJR6p4', name: 'Ahamadyya Mission Cl', level: 4,
      parent_id: 'QywkxFudXrC', parent_name: 'Magbema',
      path: '/ImspTQPwCqd/PMa2VCrupOd/QywkxFudXrC', ty: 1, lng: -12.9487, lat: 9.0131 });
  });
  it('keeps geometry-less units (e.g. the national root) with blank ty/lng/lat', () => {
    expect(orgUnitToRow(national)).toEqual({
      id: 'ImspTQPwCqd', name: 'Sierra Leone', level: 1,
      parent_id: '', parent_name: '', path: '/ImspTQPwCqd', ty: '', lng: '', lat: '' });
  });
});

describe('buildOuRows', () => {
  it('returns one row per org unit (hierarchy), left-joined to geometry', () => {
    const rows = buildOuRows([national, district, facility], [facilityGeo, districtGeo]);
    expect(rows).toHaveLength(3);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId['ImspTQPwCqd'].ty).toBe('');          // national: present, no geometry
    expect(byId['O6uvpzGd5pu'].ty).toBe(2);            // district: polygon
    expect(byId['plnHVbJR6p4']).toMatchObject({ ty: 1, lng: -12.9487, lat: 9.0131 });
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
    const fc = geoFeaturesToGeoJSON([facilityGeo, districtGeo]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].properties).toMatchObject({ id: 'plnHVbJR6p4', name: 'Ahamadyya Mission Cl', level: 4 });
    expect(fc.features[0].geometry.type).toBe('Point');
    expect(fc.features[1].geometry.type).toBe('Polygon');
  });
});
