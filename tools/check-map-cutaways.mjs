import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { navigationIndex, buildCutaway } from './cutaway-geometry.mjs';
import { MeshoptSimplifier } from '../tmp/ancient-source/optimizer/node_modules/meshoptimizer/meshopt_simplifier.module.js';
await MeshoptSimplifier.ready;

const plane = z => ({ positions: new Float32Array([-100,-100,z, 100,-100,z, 100,100,z, -100,100,z]), indices: new Uint32Array([0,1,2,0,2,3]), extras: {} });
const floors = [plane(0), plane(300)];
const nav = navigationIndex(floors);
assert.deepEqual(nav.supports(0, 0).map(s => s.z).sort((a,b) => a-b), [0,300]);
const wall = { positions: new Float32Array([-80,0,-10, 80,0,-10, 80,0,600, -80,0,600]), indices: new Uint32Array([0,1,2,0,2,3]), extras: {} };
const cutaway = buildCutaway(floors, [wall, plane(550)], MeshoptSimplifier);
const vertices = cutaway.surfaces.find(s => s.kind === 'wall').positions.filter((_, i) => i % 3 === 2);
assert.ok(vertices.some(z => z === 136) && vertices.some(z => z === 436), 'both stacked floor wall sections survive');
assert.ok(vertices.every(z => (z >= -24 && z <= 136) || (z >= 276 && z <= 436)), 'roofs and upper wall portions are removed');
assert.equal(cutaway.surfaces.find(s => s.kind === 'ground').indices.length, 12, 'NAV floors are not simplified away');

const stats = [];
for (const name of ['de_ancient','de_dust2','de_mirage','de_inferno','de_nuke','de_anubis','de_cache']) {
  const bytes = fs.readFileSync(`frontend/public/map/3d/${name}.json`), map = JSON.parse(bytes);
  assert.equal(map.mapName, name); assert.equal(map.version, 1);
  assert.ok(bytes.length < 6 * 1024 * 1024);
  assert.deepEqual(map.sites.map(s => s.label).sort(), ['A','B']);
  let triangles = 0;
  for (const surface of map.surfaces) {
    assert.ok(['ground','wall','terrain','cover'].includes(surface.kind));
    assert.equal(surface.positions.length % 3, 0); assert.equal(surface.indices.length % 3, 0);
    for (const [i,p] of surface.positions.entries()) {
      assert.ok(Number.isFinite(p));
      assert.ok(p >= map.bounds.min[i % 3] - .001 && p <= map.bounds.max[i % 3] + .001);
    }
    for (const i of surface.indices) assert.ok(Number.isInteger(i) && i >= 0 && i < surface.positions.length / 3);
    triangles += surface.indices.length / 3;
  }
  assert.ok(triangles > 1000 && triangles < 150000);
  for (const site of map.sites) {
    assert.ok(site.radius > 0);
    site.position.forEach((v,k) => assert.ok(Number.isFinite(v) && v >= map.bounds.min[k] && v <= map.bounds.max[k]));
    assert.ok(site.position[2] >= site.bounds.min[2] - 32 && site.position[2] <= site.bounds.max[2] + 32, `${name} site ${site.label} matches transformed entity height`);
  }
  if (name === 'de_ancient') assert.equal(createHash('sha256').update(bytes).digest('hex'), '9770453588f3fbe0b966ba14c8854e9dd9ce9f5be69306c577705071b7cf6cac');
  else {
    assert.equal(map.source.stats.outputTriangles, triangles);
    assert.equal(map.surfaces.find(s => s.kind === 'ground').indices.length / 3, map.source.stats.navTriangles);
    assert.equal(map.source.cutaway.preservesMultipleFloors, true);
  }
  if (name === 'de_nuke') {
    const ground = map.surfaces.find(s => s.kind === 'ground');
    const localNav = navigationIndex([{ positions: new Float32Array(ground.positions), indices: new Uint32Array(ground.indices) }]);
    const siteB = map.sites.find(s => s.label === 'B');
    const levels = localNav.supports(...siteB.position.slice(0,2)).map(s => s.z);
    assert.ok(levels.some(z => z < -650) && levels.some(z => z > -480), 'Nuke overlapping upper and lower floors retain true heights');
  }
  stats.push({ name, bytes: bytes.length, triangles });
}
console.table(stats);
console.log('PASS: seven map assets, bounds/indices/sites, original Ancient checksum, multi-floor cutaway and roof removal');
