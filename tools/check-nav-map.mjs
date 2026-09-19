import fs from 'node:fs';
import assert from 'node:assert/strict';
const file = process.argv[2] || 'frontend/public/map/3d/de_ancient.json';
const bytes = fs.readFileSync(file), map = JSON.parse(bytes);
assert.equal(map.source.reconstruction.mode, 'nav-only');
assert.equal(map.source.reconstruction.wallHeight, 24);
assert.match(map.source.navSha256, /^[0-9a-f]{64}$/);
assert.equal(map.source.vpkSha256, undefined, 'No VPK dependency in the NAV-only asset');
assert.ok(bytes.length < 1024 * 1024);
const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
let count = 0, degenerate = 0, open = 0;
for (const surface of map.surfaces) {
  assert.ok(['ground', 'wall'].includes(surface.kind));
  surface.positions.forEach((v, i) => {
    assert.ok(Number.isFinite(v)); bounds.min[i % 3] = Math.min(bounds.min[i % 3], v); bounds.max[i % 3] = Math.max(bounds.max[i % 3], v);
  });
  const edges = new Map();
  for (let i = 0; i < surface.indices.length; i += 3) {
    const ids = surface.indices.slice(i, i + 3);
    ids.forEach(k => assert.ok(Number.isInteger(k) && k >= 0 && k < surface.positions.length / 3));
    const [p, q, r] = ids.map(k => surface.positions.slice(k * 3, k * 3 + 3));
    const a = q.map((v, k) => v - p[k]), b = r.map((v, k) => v - p[k]);
    if (Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) < 1e-7) degenerate++;
    for (let j = 0; j < 3; j++) {
      const a = ids[j], b = ids[(j + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  if (surface.kind === 'wall') {
    assert.equal(surface.blocksShots, false);
    open += [...edges.values()].filter(n => n !== 2).length;
  }
  count += surface.indices.length / 3;
}
assert.deepEqual(bounds, map.bounds);
assert.equal(count, map.source.stats.outputTriangles);
assert.ok(count < 18000);
assert.equal(degenerate, 0, 'No zero-area triangles');
assert.equal(open, 0, 'Infill caps and sides must be closed');
assert.equal(map.surfaces.find(s => s.kind === 'ground').indices.length / 3, map.source.stats.originalNavTriangles);
assert.ok(map.source.stats.capAreaError / map.source.stats.gapArea < .00001, 'Gap triangulation preserves its footprint');
console.log(JSON.stringify({ bytes: bytes.length, triangles: count, degenerate, openWallEdges: open, ...map.source.stats }, null, 2));
