import assert from 'node:assert/strict';
import earcut from '../tmp/ancient-source/optimizer/node_modules/earcut/src/earcut.js';
import clipping from '../tmp/ancient-source/optimizer/node_modules/polygon-clipping/dist/polygon-clipping.cjs.js';
import { buildNavSandbox } from './nav-sandbox-geometry.mjs';
import { readGlb } from './source-nav-glb.mjs';

const rect = (x, y, w, h, z = () => 0) => ({ positions: [x, y, z(x,y), x+w, y, z(x+w,y), x+w, y+h, z(x+w,y+h), x, y+h, z(x,y+h)], indices: [0,1,2,0,2,3] });
const area = ring => Math.abs(ring.reduce((sum, p, i) => {
  const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1];
}, 0) / 2);
const polyArea = polys => polys.reduce((n, p) => n + area(p[0]) - p.slice(1).reduce((s, r) => s + area(r), 0), 0);
function check(meshes) {
  const original = structuredClone(meshes);
  const model = buildNavSandbox({ navMeshes: meshes, earcut, clipping });
  assert.deepEqual(meshes, original, 'original NAV stays immutable');
  assert.equal(model.surfaces[0].indices.length, meshes.reduce((n, m) => n + m.indices.length, 0), 'all original NAV triangles are retained');
  const wall = model.surfaces.find(s => s.kind === 'wall');
  if (wall) {
    const caps = [];
    const edges = new Map();
    for (let i = 0; i < wall.indices.length; i += 3) {
      const ids = wall.indices.slice(i, i + 3), p = ids.map(k => wall.positions.slice(k * 3, k * 3 + 3));
      const signed = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
      if (signed > 1e-7) {
        caps.push([p.map(v => v.slice(0, 2))]);
        for (const point of p) assert.ok(Math.abs(point[2] - model.support(point[0], point[1]) - 24) < .011, 'cap follows nearby NAV at only 24 units higher');
      }
      for (let j = 0; j < 3; j++) { const a = ids[j], b = ids[(j+1)%3], key = a<b ? `${a},${b}` : `${b},${a}`; edges.set(key,(edges.get(key)||0)+1); }
    }
    assert.ok([...edges.values()].every(n => n === 2), 'every cap and side is closed, including point contacts');
    const overlap = polyArea(clipping.intersection(clipping.union(caps), model.footprint));
    assert.ok(overlap < .01, `infill never crosses original NAV corridors: ${overlap}`);
    assert.equal(wall.blocksShots, false, 'inferred walls cannot create false bullet hits');
  }
  return model;
}
const courtyard = check([rect(0,0,400,40),rect(0,360,400,40),rect(0,40,40,320),rect(360,40,40,320)]);
assert.equal(courtyard.stats.gapArea, 320*320, 'the NAV-free courtyard is capped without inventing a building');
const ramp = check([rect(0,0,100,400,(x,y)=>y*.25),rect(200,0,100,400,(x,y)=>y*.25)]);
assert.equal(ramp.support(150,200),50, 'gap heights interpolate along adjacent NAV ramps');
check([rect(0,0,300,100),rect(0,116,300,100),rect(145,100,10,16)]);
check([rect(0,0,300,100),rect(0,100,100,200),rect(200,100,100,200)]);
const levels = check([rect(0,0,100,300),rect(0,0,100,300,()=>128),rect(200,0,100,300,()=>128)]);
assert.equal(levels.support(50,50),0,'overlapping floors use the lower boundary support without deleting the upper NAV');
check(readGlb('tmp/ancient-source/nav-only.glb').filter(mesh=>mesh.extras.HullIndex===0));
console.log('PASS: NAV preservation, closed low caps, zero NAV intrusion, ramps, narrow passages, disconnected regions, overlapping heights and actual Ancient NAV');
