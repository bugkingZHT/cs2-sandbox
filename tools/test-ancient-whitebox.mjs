/** Synthetic source-geometry regressions. Requires the offline exporter dependencies, not CS2 assets. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildWhitebox } from './ancient-whitebox-geometry.mjs';

const optimizer = path.resolve(process.argv[2] || 'tmp/ancient-source/optimizer/node_modules');
const { MeshoptSimplifier } = await import(pathToFileURL(path.join(optimizer, 'meshoptimizer/meshopt_simplifier.module.js')));
const { default: earcut } = await import(pathToFileURL(path.join(optimizer, 'earcut/src/earcut.js')));
const { default: clipping } = await import(pathToFileURL(path.join(optimizer, 'polygon-clipping/dist/polygon-clipping.cjs.js')));
await MeshoptSimplifier.ready;

function navQuad(points) {
  return { positions: new Float32Array(points.flat()), indices: new Uint32Array([0, 1, 2, 0, 2, 3]), extras: { HullIndex: 0 } };
}
const navRect = (x0, y0, x1, y1, z = 0) => navQuad([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]);

/** Closed, outward-facing source collision prism; XY polygon must be CCW. */
function prism(polygon, bottom, top) {
  const n = polygon.length;
  const positions = [...polygon.map(([x, y]) => [x, y, bottom]), ...polygon.map(([x, y]) => [x, y, top])].flat();
  const cap = earcut(polygon.flat());
  const indices = [];
  for (let i = 0; i < cap.length; i += 3) {
    const [a, b, c] = cap.slice(i, i + 3);
    indices.push(c, b, a, a + n, b + n, c + n);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, j, j + n, i, j + n, i + n);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices), extras: { InteractAs: [] } };
}
const box = (x0, y0, x1, y1, bottom = -24, top = 256) => prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], bottom, top);

function build(navMeshes, collisionMeshes) {
  return buildWhitebox({ navMeshes, collisionMeshes, simplify: MeshoptSimplifier, earcut, clipping });
}

/** Inspect the exported triangles, not reconstruction masks or success counters. */
function wallSection(map, x, y) {
  const heights = [];
  for (const surface of map.surfaces.filter(s => s.kind === 'wall')) {
    const p = surface.positions;
    for (let i = 0; i < surface.indices.length; i += 3) {
      const [ia, ib, ic] = surface.indices.slice(i, i + 3).map(index => index * 3);
      const ax = p[ia], ay = p[ia + 1], bx = p[ib], by = p[ib + 1], cx = p[ic], cy = p[ic + 1];
      const determinant = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(determinant) < 1e-8) continue;
      const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / determinant;
      const v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / determinant;
      if (u < -1e-7 || v < -1e-7 || u + v > 1.0000001) continue;
      heights.push(u * p[ia + 2] + v * p[ib + 2] + (1 - u - v) * p[ic + 2]);
    }
  }
  return heights;
}

function wallFootprint(map) {
  const triangles = [];
  for (const surface of map.surfaces.filter(s => s.kind === 'wall')) {
    for (let i = 0; i < surface.indices.length; i += 3) {
      const points = surface.indices.slice(i, i + 3).map(index => surface.positions.slice(index * 3, index * 3 + 2));
      const [a, b, c] = points;
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(area) > 1e-6) triangles.push([points]);
    }
  }
  return triangles.length ? clipping.union(triangles) : [];
}

function assertWallAt(map, x, y, floor, label) {
  const heights = wallSection(map, x, y);
  assert.ok(heights.length >= 2 && Math.max(...heights) >= floor + 32 && Math.min(...heights) <= floor + 24,
    `${label}: missing a solid wall at (${x.toFixed(2)}, ${y.toFixed(2)}); section=${JSON.stringify(heights)}`);
}
function assertOpenAt(map, x, y, floor, label) {
  const heights = wallSection(map, x, y);
  assert.ok(!heights.length || Math.max(...heights) <= floor + 1,
    `${label}: walls block walkable space at (${x}, ${y}); section=${JSON.stringify(heights)}`);
}

const tests = [
  ['continuous diagonal source wall survives all NAV height-band boundaries', () => {
    // The sloping NAV is adjacent to a single unbroken collision wall. Independent
    // simplification of the 48u elevation bands must not open transverse cracks.
    const length = 576, slope = .25;
    const nav = navQuad([[0, -192, 0], [length, slope * length - 192, 192],
      [length, slope * length - 32, 192], [0, -32, 0]]);
    const wall = prism([[-24, -24 * slope], [length + 24, (length + 24) * slope],
      [length + 24, (length + 24) * slope + 24], [-24, -24 * slope + 24]], -48, 512);
    const map = build([nav], [wall]);
    const footprint = wallFootprint(map);
    assert.equal(footprint.length, 1, 'One continuous source wall must not become disconnected closed blocks');
    assert.equal(footprint[0].length, 1, 'A solid source wall must not gain holes between height bands');
    for (const [x, y] of footprint[0][0]) {
      assert.ok(x >= -48 && x <= length + 48 && y >= slope * x - 24 && y <= slope * x + 48,
        `Rasterization invented a wall outside the source geometry: (${x}, ${y})`);
    }
    for (let x = 36; x <= length - 36; x += 4) {
      assertWallAt(map, x, slope * x + 12, x / length * 192, 'continuous wall');
    }
  }],
  ['a narrow source wall touching NAV is retained without occupying the NAV', () => {
    // A 16u expansion of navigation deletes this entire 12u real wall.
    const map = build([navRect(-48, -192, 432, 0)], [box(0, 0, 384, 12)]);
    for (let x = 36; x <= 348; x += 12) {
      assertWallAt(map, x, 6, 0, '12u source wall');
      assertOpenAt(map, x, -6, 0, 'adjacent navigable ground');
    }
  }],
  ['a closed sloped source solid does not generate walls in the air beyond its end', () => {
    const wedge = box(0, 0, 384, 120, -24, 96);
    // Top rises from Z=0 to 96 across X=0..384. Its mostly upward normal
    // makes it easy to mistake for a face that can be omitted from slicing.
    // Omitting it leaves only the far end's scanline crossing and fills the
    // wrong side of that end, even though all source geometry is closed.
    for (let i = 4; i < 8; i++) wedge.positions[i * 3 + 2] = wedge.positions[i * 3] / 4;
    const map = build([navRect(-48, -192, 528, -24)], [wedge]);
    for (const x of [300, 360]) assertWallAt(map, x, 48, 0, 'upper solid portion of the source wedge');
    for (const x of [420, 456]) for (const y of [48, 84]) {
      assertOpenAt(map, x, y, 0, 'source-confirmed empty space beyond the wedge');
    }
  }],
  ['an open outward face does not turn neighboring air into an infinite solid', () => {
    const openFace = {
      // Both triangles face +X. There is no corresponding entry face or volume.
      positions: new Float32Array([0, 0, -24, 0, 120, -24, 0, 120, 128, 0, 0, 128]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      extras: { InteractAs: [] },
    };
    const map = build([navRect(-96, -192, 360, -24)], [openFace, box(144, 0, 216, 120, -24, 128)]);
    // The real open surface still needs its thin, finite visual edge. A separate
    // closed box must retain its interior even after the unmatched outward face.
    for (const y of [36, 72]) {
      assertWallAt(map, 6, y, 0, 'actual thin open collision face');
      for (const x of [48, 96, 264]) assertOpenAt(map, x, y, 0, 'air next to an unmatched outward face');
      assertWallAt(map, 180, y, 0, 'independent closed source box');
    }
  }],
  ['one solid source wall remains connected in 3D across a large support-height change', () => {
    // This is genuinely one collision solid from Z=-48 to 512. It is not two
    // unrelated suspended walls that a reconstruction should invent a bridge for.
    const nav = [navRect(0, -192, 288, -24, 0), navRect(288, -192, 576, -24, 192)];
    const map = build(nav, [box(-24, 0, 600, 24, -48, 512)]);
    let previous;
    // Offset the probes from grid seams: taking min/max exactly on a seam could
    // falsely merge two disjoint bands and hide a vertical separation.
    for (let x = 36.5; x <= 540; x += 4) {
      const heights = wallSection(map, x, 12);
      assertWallAt(map, x, 12, x < 288 ? 0 : 192, 'continuous source wall across NAV platforms');
      const current = { x, low: Math.min(...heights), high: Math.max(...heights) };
      if (previous) {
        assert.ok(Math.max(previous.low, current.low) <= Math.min(previous.high, current.high) + 1e-6,
          `Source wall split vertically: x=${previous.x} spans [${previous.low}, ${previous.high}], `
          + `x=${current.x} spans [${current.low}, ${current.high}]`);
      }
      previous = current;
    }
  }],
  ['a collision-enclosed inaccessible building with a source roof receives a solid cap', () => {
    const nav = [navRect(-192, -192, 576, -24), navRect(-192, 408, 576, 576),
      navRect(-192, -24, -24, 408), navRect(408, -24, 576, 408)];
    const source = [box(0, 0, 384, 24), box(0, 360, 384, 384), box(0, 24, 24, 360),
      box(360, 24, 384, 360), box(0, 0, 384, 384, 240, 264)];
    const map = build(nav, source);
    for (const x of [96, 192, 288]) for (const y of [96, 192, 288]) {
      assertWallAt(map, x, y, 0, 'inaccessible building cap');
    }
  }],
  ['a complete source roof caps inaccessible interior despite an open lower wall', () => {
    const nav = [navRect(-192, -192, 576, -24), navRect(-192, 408, 576, 576),
      navRect(-192, -24, -24, 408), navRect(408, -24, 576, 408),
      navRect(144, -48, 240, 96)];
    // The entire front low wall is absent. Closed-hole filling alone cannot
    // recover this building, but its complete source roof is direct evidence.
    const source = [box(0, 360, 384, 384), box(0, 24, 24, 360),
      box(360, 24, 384, 360), box(0, 0, 384, 384, 240, 264)];
    const map = build(nav, source);
    for (const x of [96, 192, 288]) {
      assertWallAt(map, x, 192, 0, 'inaccessible core beneath the complete source roof');
    }
    for (const x of [168, 192, 216]) for (const y of [0, 24, 60, 84, 108]) {
      // y=108 is outside the NAV footprint, but still within its 32u clearance.
      assertOpenAt(map, x, y, 0, 'actual entrance and its clearance beneath the source roof');
    }
  }],
  ['an open-air enclosure is not roofed merely because its center has no NAV', () => {
    const nav = [navRect(-192, -192, 576, -24), navRect(-192, 408, 576, 576),
      navRect(-192, -24, -24, 408), navRect(408, -24, 576, 408)];
    const source = [box(0, 0, 384, 24), box(0, 360, 384, 384),
      box(0, 24, 24, 360), box(360, 24, 384, 360)];
    const map = build(nav, source);
    assertOpenAt(map, 192, 192, 0, 'open-air enclosure without source roof');
  }],
  ['a partial roof along one edge does not seal the open center of an enclosure', () => {
    const nav = [navRect(-192, -192, 576, -24), navRect(-192, 408, 576, 576),
      navRect(-192, -24, -24, 408), navRect(408, -24, 576, 408)];
    const source = [box(0, 0, 384, 24), box(0, 360, 384, 384),
      box(0, 24, 24, 360), box(360, 24, 384, 360),
      // This narrow eave covers about 26% of the enclosed interior. There is
      // neither roof nor NAV in the open center; absence of NAV is not a roof.
      box(0, 0, 112, 384, 240, 264)];
    const map = build(nav, source);
    for (const x of [168, 192, 240, 288]) for (const y of [96, 192, 288]) {
      assertOpenAt(map, x, y, 0, 'open courtyard beside a partial roof');
    }
  }],
  ['source roof does not seal a true doorway or a navigable interior', () => {
    const nav = [navRect(-192, -192, 576, -24), navRect(-192, 408, 576, 576),
      navRect(-192, -24, -24, 408), navRect(408, -24, 576, 408),
      navRect(144, -48, 240, 120), navRect(48, 48, 336, 336)];
    const source = [box(0, 0, 144, 24), box(240, 0, 384, 24), box(0, 360, 384, 384),
      box(0, 24, 24, 360), box(360, 24, 384, 360), box(0, 0, 384, 384, 240, 264)];
    const map = build(nav, source);
    for (let y = -36; y <= 120; y += 12) {
      for (const x of [168, 192, 216]) assertOpenAt(map, x, y, 0, 'real 96u doorway');
    }
    for (const x of [96, 192, 288]) for (const y of [96, 192, 288]) {
      assertOpenAt(map, x, y, 0, 'navigable room');
    }
    assertWallAt(map, 72, 12, 0, 'wall beside doorway');
    assertWallAt(map, 312, 12, 0, 'wall beside doorway');
  }],
];

let failures = 0;
for (const [name, run] of tests) {
  try { run(); console.log(`PASS: ${name}`); }
  catch (error) { failures++; console.error(`FAIL: ${name}\n${error.stack || error}`); }
}
if (failures) process.exitCode = 1;
