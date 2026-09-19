/** Offline structural checks for the shipped map; no game installation required. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = process.argv[2] || 'frontend/public/map/3d/de_ancient.json';
const buffer = fs.readFileSync(file), map = JSON.parse(buffer);
if (map.source?.cutaway) {
  await import('./check-cutaway-map.mjs');
  process.exit(0);
}
if (map.source?.reconstruction?.mode === 'nav-only') {
  await import('./check-nav-map.mjs');
  process.exit(0);
}
assert.equal(map.version, 1);
assert.equal(map.mapName, 'de_ancient');
assert.ok(buffer.byteLength < 2 * 1024 * 1024, 'Map exceeds 2 MiB budget');
assert.match(map.source.vpkSha256, /^[0-9a-f]{64}$/);
assert.match(map.source.navSha256, /^[0-9a-f]{64}$/);
assert.equal(map.source.coordinates, 'Source/Demo XYZ; Z up; original world units');
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
let total = 0, degenerate = 0;
for (const surface of map.surfaces) {
  assert.ok(['wall', 'ground', 'terrain'].includes(surface.kind));
  assert.equal(surface.positions.length % 3, 0);
  assert.equal(surface.indices.length % 3, 0);
  const count = surface.positions.length / 3;
  for (let i = 0; i < surface.positions.length; i++) {
    const value = surface.positions[i];
    assert.ok(Number.isFinite(value), 'Nonfinite vertex');
    min[i % 3] = Math.min(min[i % 3], value); max[i % 3] = Math.max(max[i % 3], value);
  }
  for (const index of surface.indices) assert.ok(Number.isInteger(index) && index >= 0 && index < count, 'Invalid index');
  for (let i = 0; i < surface.indices.length; i += 3) {
    const p = surface.indices.slice(i, i + 3).map(index => surface.positions.slice(index * 3, index * 3 + 3));
    const a = p[1].map((v, axis) => v - p[0][axis]), b = p[2].map((v, axis) => v - p[0][axis]);
    const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    if (Math.hypot(...cross) < 1e-6) degenerate++;
  }
  total += surface.indices.length / 3;
}
assert.equal(degenerate, 0, 'Degenerate triangles');
assert.deepEqual(map.bounds, { min, max });
assert.equal(total, map.source.stats.outputTriangles);
assert.ok(total > 3000 && total < 35000, 'Unexpected triangle budget');
assert.equal(map.surfaces.length, 3, 'Expected three material batches');
assert.ok(map.surfaces.some(s => s.kind === 'wall' && s.indices.length > 3000), 'Missing actual collision walls');
const ground = map.surfaces.find(s => s.kind === 'ground');
assert.equal(ground.parts.find(p => p.label === 'Navigation floor').indexCount / 3, map.source.stats.originalNavTriangles);
assert.equal(map.source.reconstruction.navigationPreserved, true);
assert.equal(map.source.reconstruction.preserveSharedWallBoundaries, true);
assert.ok(map.source.stats.partitionAreaError <= .01, 'Height partitions must preserve the global wall footprint');
const wall = map.surfaces.find(s => s.kind === 'wall');
const edges = new Map();
for (let i = 0; i < wall.indices.length; i += 3) for (let j = 0; j < 3; j++) {
  const a = wall.indices[i + j], b = wall.indices[i + (j + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`;
  edges.set(key, (edges.get(key) || 0) + 1);
}
assert.equal([...edges.values()].filter(count => count !== 2).length, 0, 'Wall solids must have closed caps and sides');
// Foundations can extend down locally to keep the same source wall connected
// across a large NAV height change. Check each indexed solid, not an entire
// material/height batch whose independent solids can use different foundations.
const parents = Array.from({ length: wall.positions.length / 3 }, (_, i) => i);
const root = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
for (let i = 0; i < wall.indices.length; i += 3) {
  const a = root(wall.indices[i]);
  parents[root(wall.indices[i + 1])] = a; parents[root(wall.indices[i + 2])] = a;
}
const solids = new Map();
for (const index of wall.indices) {
  const id = root(index);
  if (!solids.has(id)) solids.set(id, new Set());
  solids.get(id).add(wall.positions[index * 3 + 2]);
}
for (const levels of solids.values()) assert.equal(levels.size, 2, 'Each closed wall solid must have a planar top and bottom');
for (const site of map.sites) {
  assert.ok(site.label === 'A' || site.label === 'B');
  assert.ok(site.radius > 0 && site.radius < 500);
  site.position.forEach((value, axis) => assert.ok(value >= min[axis] && value <= max[axis]));
}
assert.equal(map.sites.length, 2);
console.log(JSON.stringify({ file, bytes: buffer.byteLength, triangles: total, vertices: map.source.stats.outputVertices, bounds: map.bounds, degenerateTriangles: degenerate, openWallEdges: 0, planarWallSolids: solids.size, partitionAreaError: map.source.stats.partitionAreaError, sealedBuildings: map.source.stats.sealedBuildings }, null, 2));

// Optional real-data regression; the caller supplies its own local cache file.
const replayIndex = process.argv.indexOf('--replay');
if (replayIndex >= 0) {
  const replay = JSON.parse(fs.readFileSync(process.argv[replayIndex + 1]));
  const tris = s => Array.from({ length: s.indices.length / 3 }, (_, i) => s.indices.slice(i * 3, i * 3 + 3).map(k => s.positions.slice(k * 3, k * 3 + 3)));
  const navFloors = tris(ground), floors = [...navFloors, ...tris(map.surfaces.find(s => s.kind === 'terrain'))], walls = tris(wall);
  function zAt([a, b, c], x, y) {
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-8) return;
    const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
    const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
    if (u < -1e-6 || v < -1e-6 || u + v > 1.000001) return;
    return a[2] * u + b[2] * v + c[2] * (1 - u - v);
  }
  let samples = 0, samplesOnNav = 0, outsideGroundXY = 0, insideWalls = 0, stable = 0, stableWithin16 = 0, missingFloorBelowFeet = 0;
  for (let i = 1; i < replay.frames.length; i += 10) for (const [id, p] of Object.entries(replay.frames[i].players)) {
    if (!p.alive || !Number.isFinite(p.z)) continue;
    samples++;
    if (navFloors.some(t => zAt(t, p.x, p.y) !== undefined)) samplesOnNav++;
    const heights = floors.map(t => zAt(t, p.x, p.y)).filter(z => z !== undefined);
    if (!heights.length) outsideGroundXY++;
    const candidates = heights.filter(z => z <= p.z + 16);
    if (!candidates.length) missingFloorBelowFeet++;
    else if (Math.abs((replay.frames[i - 1].players[id]?.z ?? Infinity) - p.z) < 1) {
      stable++;
      if (Math.abs(p.z - Math.max(...candidates)) <= 16) stableWithin16++;
    }
    const wallHeights = walls.map(t => zAt(t, p.x, p.y)).filter(z => z !== undefined);
    if (wallHeights.length >= 2 && p.z + 30 > Math.min(...wallHeights) && p.z + 30 < Math.max(...wallHeights)) insideWalls++;
  }
  assert.equal(outsideGroundXY, 0, 'Replay players outside supporting terrain');
  assert.equal(insideWalls, 0, 'Reconstructed walls intrude on sampled player positions');
  assert.ok(stableWithin16 / stable > .98, 'Stable players should align with the navigation height');
  console.log(JSON.stringify({ samples, samplesOnNav, outsideGroundXY, insideWalls, missingFloorBelowFeet, stable, stableWithin16, stableRatio: stableWithin16 / stable }, null, 2));
}
