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
