/** Verify the archived first-generation cutaway; open crop edges are intentional. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const file = process.argv[2] || 'frontend/public/map/3d/de_ancient.json';
const bytes = fs.readFileSync(file), map = JSON.parse(bytes);
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(sha256, '9770453588f3fbe0b966ba14c8854e9dd9ce9f5be69306c577705071b7cf6cac', 'Use the actual archived first cutaway, not a reconstructed approximation');
assert.equal(map.version, 1);
assert.equal(map.mapName, 'de_ancient');
assert.equal(map.source.format, 'Source 2 VPK world physics + NAV player hull');
assert.equal(map.source.coordinates, 'Source/Demo XYZ; Z up; original world units');
assert.deepEqual(map.source.cutaway, { navigationRadius: 128, wallHeight: 136, roofHeight: 92, floorDepth: 24 });
let triangles = 0;
for (const surface of map.surfaces) {
  assert.ok(surface.positions.every(Number.isFinite));
  assert.ok(surface.indices.every(i => Number.isInteger(i) && i >= 0 && i < surface.positions.length / 3));
  triangles += surface.indices.length / 3;
}
assert.equal(triangles, 76138);
assert.equal(map.surfaces.find(s => s.label === 'Navigation floor').indices.length / 3, 2680);
assert.equal(map.surfaces.length, 4);
assert.ok(bytes.length < 3 * 1024 * 1024);
console.log(JSON.stringify({ file, bytes: bytes.length, triangles, sha256, source: 'Restored original VPK cutaway' }, null, 2));
