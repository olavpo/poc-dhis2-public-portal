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
