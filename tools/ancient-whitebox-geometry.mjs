/** Rebuild solid, capped low walls from collision slices rather than cut triangles. */
export function buildWhitebox({ navMeshes, collisionMeshes, simplify, earcut, clipping }) {
  const resolution = 12, wallHeight = 96, reach = 128, sliceStep = 16;
  const triangles = [], grid = new Map(), navCell = 96;
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const point = (positions, index) => [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
  for (const mesh of navMeshes) for (let i = 0; i < mesh.indices.length; i += 3) {
    const t = Array.from(mesh.indices.slice(i, i + 3), index => point(mesh.positions, index));
    for (const p of t) for (let axis = 0; axis < 3; axis++) { bounds.min[axis] = Math.min(bounds.min[axis], p[axis]); bounds.max[axis] = Math.max(bounds.max[axis], p[axis]); }
    const id = triangles.push(t) - 1;
    for (let x = Math.floor(Math.min(...t.map(p => p[0])) / navCell); x <= Math.floor(Math.max(...t.map(p => p[0])) / navCell); x++) {
      for (let y = Math.floor(Math.min(...t.map(p => p[1])) / navCell); y <= Math.floor(Math.max(...t.map(p => p[1])) / navCell); y++) {
        const key = `${x},${y}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(id);
      }
    }
  }
  const heightCache = new Map();
  function support(x, y) {
    const key = `${x},${y}`;
    if (heightCache.has(key)) return heightCache.get(key);
    const gx = Math.floor(x / navCell), gy = Math.floor(y / navCell);
    let best = { distance: Infinity, z: 0 };
    const seen = new Set();
    for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) for (const id of grid.get(`${gx + dx},${gy + dy}`) || []) {
      if (seen.has(id)) continue;
      seen.add(id);
      const t = triangles[id], [a, b, c] = t;
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      let distance = Infinity, z = 0;
      if (Math.abs(d) > 1e-4) {
        const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
        const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
        if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001) { distance = 0; z = u * a[2] + v * b[2] + (1 - u - v) * c[2]; }
      }
      if (distance !== 0) for (let e = 0; e < 3; e++) {
        const p = t[e], q = t[(e + 1) % 3], ex = q[0] - p[0], ey = q[1] - p[1];
        const f = Math.min(1, Math.max(0, ((x - p[0]) * ex + (y - p[1]) * ey) / (ex * ex + ey * ey || 1)));
        const dist = (x - p[0] - f * ex) ** 2 + (y - p[1] - f * ey) ** 2;
        if (dist < distance) { distance = dist; z = p[2] + f * (q[2] - p[2]); }
      }
      if (distance < best.distance - 1e-3 || (Math.abs(distance - best.distance) < 1e-3 && z < best.z)) best = { distance, z };
    }
    best.distance = Math.sqrt(best.distance);
    // Interior inaccessible ground can be further from NAV. It is visual infill,
    // not collision geometry, and uses nearest navigation support conservatively.
    if (!Number.isFinite(best.distance)) {
      let d = Infinity;
      for (const tri of triangles) for (const p of tri) {
        const dist = (p[0] - x) ** 2 + (p[1] - y) ** 2;
        if (dist < d) { d = dist; best = { distance: Math.sqrt(d), z: p[2] }; }
      }
    }
    heightCache.set(key, best);
    return best;
  }
  const x0 = Math.floor((bounds.min[0] - reach - resolution * 2) / resolution) * resolution;
  const y0 = Math.floor((bounds.min[1] - reach - resolution * 2) / resolution) * resolution;
  const width = Math.ceil((bounds.max[0] + reach - x0) / resolution) + 2;
  const height = Math.ceil((bounds.max[1] + reach - y0) / resolution) + 2;
  const size = width * height;
  const center = (x, y) => [x0 + (x + .5) * resolution, y0 + (y + .5) * resolution];
  const floor = new Float32Array(size), distance = new Float32Array(size), free = new Uint8Array(size);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const id = y * width + x, p = center(x, y), s = support(...p);
    floor[id] = s.z; distance[id] = s.distance; free[id] = s.distance < .01 ? 1 : 0;
  }
  const z0 = Math.floor((bounds.min[2] + 24) / sliceStep) * sliceStep;
  const layers = Math.ceil((bounds.max[2] + 100 - z0) / sliceStep) + 1;
  const events = Array.from({ length: layers * height }, () => []);
  const sliceEdges = Array.from({ length: layers }, () => []);
  let roofEvidence = new Uint8Array(size);
  const steepRoofEvidence = new Uint8Array(size);
  let originalCollisionTriangles = 0, excludedCollisionTriangles = 0, sectionSegments = 0;
  const clipTags = new Set();
  for (const mesh of collisionMeshes) {
    originalCollisionTriangles += mesh.indices.length / 3;
    const tags = mesh.extras.InteractAs || [];
    if (tags.some(tag => /clip|trigger|sky|passbullets|window/.test(tag))) {
      excludedCollisionTriangles += mesh.indices.length / 3;
      tags.forEach(tag => clipTags.add(tag));
      continue;
    }
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const t = Array.from(mesh.indices.slice(i, i + 3), index => point(mesh.positions, index));
      // A closed solid may enter a scanline before the exported X range.
      // Preserve those crossings so winding at x0 is initialized correctly.
      if (Math.max(...t.map(p => p[1])) < y0 || Math.min(...t.map(p => p[1])) > y0 + height * resolution) continue;
      const a = t[1].map((v, k) => v - t[0][k]), b = t[2].map((v, k) => v - t[0][k]);
      const nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
      // Open Source physics roofs can expose only the downward-facing
      // underside. Either face orientation is valid roof evidence.
      const normalLength = Math.hypot(nx, ny, nz);
      if (Math.abs(nz) > normalLength * .3 && Math.abs(nz) > 16) {
        const c0 = Math.max(0, Math.ceil((Math.min(...t.map(p => p[0])) - x0) / resolution - .5));
        const c1 = Math.min(width - 1, Math.floor((Math.max(...t.map(p => p[0])) - x0) / resolution - .5));
        const r0 = Math.max(0, Math.ceil((Math.min(...t.map(p => p[1])) - y0) / resolution - .5));
        const r1 = Math.min(height - 1, Math.floor((Math.max(...t.map(p => p[1])) - y0) / resolution - .5));
        const [p, q, r] = t;
        const det = (q[1] - r[1]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[1] - r[1]);
        for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
          const id = row * width + col, [x, y] = center(col, row);
          const u = ((q[1] - r[1]) * (x - r[0]) + (r[0] - q[0]) * (y - r[1])) / det;
          const v = ((r[1] - p[1]) * (x - r[0]) + (p[0] - r[0]) * (y - r[1])) / det;
          if (u < 0 || v < 0 || u + v > 1) continue;
          const z = p[2] * u + q[2] * v + r[2] * (1 - u - v);
          if (z > floor[id] + 48 && z < floor[id] + 768) {
            if (Math.abs(nz) > normalLength * .65) roofEvidence[id] = 1;
            else steepRoofEvidence[id] = 1;
          }
        }
      }
      // Sloped floor/roof faces still close a solid's horizontal section and
      // must participate in winding. Only edge seeding excludes those faces.
      const isWallSurface = Math.abs(nz) <= Math.hypot(nx, ny, nz) * .82;
      const l0 = Math.max(0, Math.ceil((Math.min(...t.map(p => p[2])) - z0) / sliceStep));
      const l1 = Math.min(layers - 1, Math.floor((Math.max(...t.map(p => p[2])) - z0) / sliceStep));
      for (let layer = l0; layer <= l1; layer++) {
        const z = z0 + layer * sliceStep, intersections = [];
        for (let e = 0; e < 3; e++) {
          const p = t[e], q = t[(e + 1) % 3];
          if ((p[2] <= z && q[2] > z) || (q[2] <= z && p[2] > z)) {
            const f = (z - p[2]) / (q[2] - p[2]);
            intersections.push([p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1])]);
          }
        }
        if (intersections.length !== 2) continue;
        const [p, q] = intersections;
        if (Math.hypot(q[0] - p[0], q[1] - p[1]) < .5) continue;
        if (isWallSurface) { sliceEdges[layer].push([p, q]); sectionSegments++; }
        const r0 = Math.max(0, Math.ceil((Math.min(p[1], q[1]) - y0) / resolution - .5));
        // Half-open scanlines count a shared polygon vertex once. Including
        // both upper endpoints can leave a nonzero winding past a closed wall.
        const r1 = Math.min(height - 1, Math.ceil((Math.max(p[1], q[1]) - y0) / resolution - .5) - 1);
        if (Math.abs(q[1] - p[1]) < 1e-6) continue;
        for (let row = r0; row <= r1; row++) {
          const y = y0 + (row + .5) * resolution;
          const x = p[0] + (y - p[1]) / (q[1] - p[1]) * (q[0] - p[0]);
          events[layer * height + row].push([x, nx > 0 ? 1 : -1]);
        }
      }
    }
  }
  // Recover steep pieces only where the source roof remains connected to an
  // already supported, flatter roof region. Limit the extension to 96 units;
  // isolated slanted walls cannot become building evidence by themselves.
  for (let pass = 0; pass < 8; pass++) {
    const next = roofEvidence.slice();
    for (let y = 1; y + 1 < height; y++) for (let x = 1; x + 1 < width; x++) {
      const id = y * width + x;
      if (steepRoofEvidence[id] && (roofEvidence[id - 1] || roofEvidence[id + 1] || roofEvidence[id - width] || roofEvidence[id + width])) next[id] = 1;
    }
    roofEvidence = next;
  }
  const occupied = Array.from({ length: layers }, () => new Uint8Array(size));
  for (let layer = 0; layer < layers; layer++) for (let y = 0; y < height; y++) {
    const sourceEvents = events[layer * height + y].sort((a, b) => a[0] - b[0]), entries = [], rowEvents = [];
    // Physics triangle soups also contain genuine open surfaces. An unmatched
    // outward face is not the boundary of an infinite solid. Pair oriented
    // entering/leaving crossings into finite spans; retain open faces only via
    // their actual section edges below. Closed overlapping volumes still union.
    for (const [x, sign] of sourceEvents) {
      if (sign < 0) entries.push(x);
      else if (entries.length) { rowEvents.push([entries.pop(), -1], [x, 1]); }
    }
    rowEvents.sort((a, b) => a[0] - b[0]);
    let winding = 0, e = 0;
    for (let x = 0; x < width; x++) {
      const wx = center(x, y)[0];
      while (e < rowEvents.length && rowEvents[e][0] <= wx) { winding += rowEvents[e][1]; e++; }
      if (winding < 0) occupied[layer][y * width + x] = 1;
    }
  }
  // Thin/open collision surfaces may not enclose a scanline interior. Seed
  // their actual section edges as well, instead of inventing NAV boundary walls.
  for (let layer = 0; layer < layers; layer++) for (const [p, q] of sliceEdges[layer]) {
    const steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (resolution / 2)));
    for (let k = 0; k <= steps; k++) {
      const x = Math.floor((p[0] + (q[0] - p[0]) * k / steps - x0) / resolution);
      const y = Math.floor((p[1] + (q[1] - p[1]) * k / steps - y0) / resolution);
      if (x >= 0 && x < width && y >= 0 && y < height) occupied[layer][y * width + x] = 1;
    }
  }
  let walls = new Uint8Array(size);
  for (let id = 0; id < size; id++) {
    if (distance[id] > reach || free[id]) continue;
    let hits = 0;
    for (const offset of [40, 64, 88]) {
      const layer = Math.max(0, Math.min(layers - 1, Math.round((floor[id] + offset - z0) / sliceStep)));
      hits += occupied[layer][id];
    }
    walls[id] = hits >= 2 ? 1 : 0;
  }
  function morph(mask, dilate) {
    const result = new Uint8Array(size);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      let v = dilate ? 0 : 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const p = mask[(y + dy) * width + x + dx];
        v = dilate ? v | p : v & p;
      }
      result[y * width + x] = v;
    }
    return result;
  }
  walls = morph(morph(walls, true), false);
  for (let i = 0; i < size; i++) if (free[i] || distance[i] > reach) walls[i] = 0;
  // Delete decoration-sized islands while retaining connected room boundaries.
  const seen = new Uint8Array(size);
  for (let start = 0; start < size; start++) {
    if (!walls[start] || seen[start]) continue;
    const component = [start]; seen[start] = 1;
    for (let q = 0; q < component.length; q++) for (const next of [component[q] - 1, component[q] + 1, component[q] - width, component[q] + width]) {
      if (next >= 0 && next < size && walls[next] && !seen[next]) { seen[next] = 1; component.push(next); }
    }
    if (component.length < 4) for (const i of component) walls[i] = 0;
  }
  const ground = new Uint8Array(size);
  for (let id = 0; id < size; id++) ground[id] = distance[id] <= reach || walls[id] ? 1 : 0;
  // The playable footprint gets a continuous supporting slab; fill enclosed
  // voids under inaccessible buildings rather than leaving Swiss-cheese holes.
  const outside = new Uint8Array(size), queue = [];
  for (let x = 0; x < width; x++) queue.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) queue.push(y * width, y * width + width - 1);
  for (let q = 0; q < queue.length; q++) {
    const id = queue[q];
    if (id < 0 || id >= size || outside[id] || ground[id]) continue;
    outside[id] = 1;
    const x = id % width, y = Math.floor(id / width);
    if (x > 0) queue.push(id - 1); if (x + 1 < width) queue.push(id + 1);
    if (y > 0) queue.push(id - width); if (y + 1 < height) queue.push(id + width);
  }
  for (let id = 0; id < size; id++) if (!outside[id]) ground[id] = 1;

  const signedArea = ring => ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  function loops(mask) {
    const edges = new Map();
    const edge = (a, b) => {
      const key = a.join(','); if (!edges.has(key)) edges.set(key, []); edges.get(key).push(b);
    };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (mask[y * width + x]) {
      if (y === 0 || !mask[(y - 1) * width + x]) edge([x, y], [x + 1, y]);
      if (x + 1 === width || !mask[y * width + x + 1]) edge([x + 1, y], [x + 1, y + 1]);
      if (y + 1 === height || !mask[(y + 1) * width + x]) edge([x + 1, y + 1], [x, y + 1]);
      if (x === 0 || !mask[y * width + x - 1]) edge([x, y + 1], [x, y]);
    }
    const rings = [];
    while (edges.size) {
      const first = edges.keys().next().value, start = first.split(',').map(Number), ring = [start];
      let current = start, previous = [start[0] - 1, start[1]], closed = false;
      for (let guard = 0; guard < size * 8; guard++) {
        const key = current.join(','), nexts = edges.get(key);
        if (!nexts?.length) break;
        const dx = current[0] - previous[0], dy = current[1] - previous[1];
        nexts.sort((a, b) => Math.atan2(dx * (b[1] - current[1]) - dy * (b[0] - current[0]), dx * (b[0] - current[0]) + dy * (b[1] - current[1])) - Math.atan2(dx * (a[1] - current[1]) - dy * (a[0] - current[0]), dx * (a[0] - current[0]) + dy * (a[1] - current[1])));
        const next = nexts.shift(); if (!nexts.length) edges.delete(key);
        previous = current; current = next;
        if (current[0] === start[0] && current[1] === start[1]) { closed = true; break; }
        ring.push(current);
      }
      if (closed && ring.length >= 4) rings.push(ring.map(p => [x0 + p[0] * resolution, y0 + p[1] * resolution]));
    }
    return rings;
  }
  function simplifyRing(ring, tolerance) {
    // Split the closed ring at a distant point, then RDP both open halves.
    const distanceToLine = (p, a, b) => {
      const x = b[0] - a[0], y = b[1] - a[1], f = Math.max(0, Math.min(1, ((p[0] - a[0]) * x + (p[1] - a[1]) * y) / (x * x + y * y || 1)));
      return Math.hypot(p[0] - a[0] - f * x, p[1] - a[1] - f * y);
    };
    const rdp = pts => {
      if (pts.length <= 2) return pts;
      let d = tolerance, pivot = -1;
      for (let i = 1; i < pts.length - 1; i++) { const e = distanceToLine(pts[i], pts[0], pts.at(-1)); if (e > d) { d = e; pivot = i; } }
      return pivot < 0 ? [pts[0], pts.at(-1)] : [...rdp(pts.slice(0, pivot + 1)).slice(0, -1), ...rdp(pts.slice(pivot))];
    };
    let split = 1;
    for (let i = 2; i < ring.length; i++) if (Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]) > Math.hypot(ring[split][0] - ring[0][0], ring[split][1] - ring[0][1])) split = i;
    const simplified = [...rdp(ring.slice(0, split + 1)).slice(0, -1), ...rdp([...ring.slice(split), ring[0]]).slice(0, -1)];
    return simplified.length >= 3 ? simplified : ring;
  }
  const inside = (p, ring) => {
    let result = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
    }
    return result;
  };
  function surface(kind, label) {
    const result = { kind, label, positions: [], indices: [] }, vertices = new Map();
    result.beginPart = () => vertices.clear();
    result.add = (a, b, c) => {
      const precision = kind === 'wall' ? 1000000 : 100;
      const points = [a, b, c].map(p => p.map(v => Math.round(v * precision) / precision));
      const ab = points[1].map((v, k) => v - points[0][k]), ac = points[2].map((v, k) => v - points[0][k]);
      if (Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]) < (kind === 'wall' ? 1e-10 : 1e-5)) return;
      for (const p of points) {
        const key = p.join(','); if (!vertices.has(key)) { vertices.set(key, result.positions.length / 3); result.positions.push(...p); }
        result.indices.push(vertices.get(key));
      }
    };
    return result;
  }
  function polygonsFor(mask, tolerance) {
    const rings = loops(mask).map(r => simplifyRing(r, tolerance)).filter(r => Math.abs(signedArea(r)) >= resolution * resolution);
    const outers = rings.filter(r => signedArea(r) > 0), holes = rings.filter(r => signedArea(r) < 0);
    const polygons = outers.map(outer => [outer]);
    for (const hole of holes) {
      const container = polygons.filter(p => inside(hole[0], p[0])).sort((a, b) => Math.abs(signedArea(a[0])) - Math.abs(signedArea(b[0])))[0];
      if (container) container.push(hole);
    }
    return polygons.length ? clipping.union(polygons) : [];
  }
  const navFootprint = clipping.union(triangles.map(t => t.map(p => p.slice(0, 2).map(v => Math.round(v * 100) / 100))).filter(r => Math.abs(signedArea(r)) > .01).map(r => [r]));
  const polygonArea = multi => multi.reduce((total, polygon) => total + Math.abs(signedArea(polygon[0])) - polygon.slice(1).reduce((n, ring) => n + Math.abs(signedArea(ring)), 0), 0);
  let globalFootprint = polygonsFor(walls, 10);
  const filledBuildings = [];
  // Only fill a void that real collision walls enclose, no NAV enters, and
  // original collision roof triangles cover. An arbitrary NAV-free area is not
  // evidence of a building and must remain terrain.
  globalFootprint = globalFootprint.map(polygon => {
    const keep = [polygon[0]];
    for (const hole of polygon.slice(1)) {
      if (polygonArea(clipping.intersection([[hole]], navFootprint)) > 1) { keep.push(hole); continue; }
      const minX = Math.max(0, Math.floor((Math.min(...hole.map(p => p[0])) - x0) / resolution));
      const maxX = Math.min(width - 1, Math.ceil((Math.max(...hole.map(p => p[0])) - x0) / resolution));
      const minY = Math.max(0, Math.floor((Math.min(...hole.map(p => p[1])) - y0) / resolution));
      const maxY = Math.min(height - 1, Math.ceil((Math.max(...hole.map(p => p[1])) - y0) / resolution));
      let samples = 0, roofSamples = 0;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) if (inside(center(x, y), hole)) {
        samples++; roofSamples += roofEvidence[y * width + x];
      }
      if (samples && roofSamples / samples >= .75) filledBuildings.push({ area: Math.abs(signedArea(hole)), roofCoverage: roofSamples / samples, ring: hole });
      else keep.push(hole);
    }
    return keep;
  });
  // Open source collision meshes need not form a closed low-wall ring around
  // a real building. Recover its solid core from the actual continuous roof
  // projection as independent evidence. Keep a conservative NAV shoulder for
  // roof-derived additions only; never erode an actual thin collision wall.
  const roofCore = Uint8Array.from(ground, (v, i) => v && roofEvidence[i] && distance[i] > 32 ? 1 : 0);
  const roofBuildings = [];
  for (const roofPolygon of polygonsFor(roofCore, 10)) {
    // A source wall's own top is also upward-facing collision. Roof recovery
    // adds missing interiors; it must not raise or replace that existing wall.
    for (const polygon of clipping.difference([roofPolygon], globalFootprint)) {
      if (polygonArea([polygon]) < 2048) continue;
      roofBuildings.push(polygon);
      filledBuildings.push({ area: polygonArea([polygon]), roofCoverage: 1, ring: polygon[0], heightReferenceRing: roofPolygon[0], polygon, source: 'continuous collision roof core' });
    }
  }
  if (roofBuildings.length) globalFootprint = clipping.union(globalFootprint, roofBuildings);
  globalFootprint = clipping.difference(globalFootprint, navFootprint);
  const heightBands = [...new Set(Array.from(ground, (v, i) => v ? Math.round(floor[i] / 48) * 48 : undefined).filter(v => v !== undefined))].sort((a, b) => a - b);
  const partitions = new Map();
  let remaining = globalFootprint;
  // An inaccessible, roof-backed building is a single solid volume. Its cap
  // follows the highest surrounding low wall instead of inheriting unrelated
  // nearest-NAV height boundaries across the middle of its roof.
  for (const building of filledBuildings) {
    let band = -Infinity;
    const heightRing = building.heightReferenceRing || building.ring;
    for (let e = 0; e + 1 < heightRing.length; e++) {
      const p = heightRing[e], q = heightRing[e + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / resolution));
      for (let step = 0; step <= steps; step++) {
        const s = support(p[0] + (q[0] - p[0]) * step / steps, p[1] + (q[1] - p[1]) * step / steps);
        band = Math.max(band, Math.round(s.z / 48) * 48);
      }
    }
    building.band = band;
    const part = clipping.intersection(remaining, [building.polygon || [building.ring]]);
    if (!part.length) continue;
    partitions.set(band, clipping.union(partitions.get(band) || [], part));
    remaining = clipping.difference(remaining, part);
  }
  for (const band of heightBands) {
    const mask = Uint8Array.from(ground, (v, i) => v && Math.round(floor[i] / 48) * 48 === band ? 1 : 0);
    const region = polygonsFor(mask, 6);
    if (!region.length || !remaining.length) continue;
    const part = clipping.intersection(remaining, region);
    if (part.length) { partitions.set(band, clipping.union(partitions.get(band) || [], part)); remaining = clipping.difference(remaining, part); }
  }
  // Independently simplified height boundaries may leave small unassigned
  // polygons. Assign those to a neighboring height; never cut gaps in a wall.
  for (const polygon of remaining) {
    const p = polygon[0][0], band = Math.round(support(...p).z / 48) * 48;
    partitions.set(band, clipping.union(partitions.get(band) || [], [polygon]));
  }
  const partitionUnion = clipping.union([...partitions.values()].flat());
  const partitionAreaError = polygonArea(clipping.xor(globalFootprint, partitionUnion));
  if (partitionAreaError > .01) throw new Error(`Height partition changed wall topology: ${partitionAreaError}`);
  const wallSurfaces = [], polygons = [];
  const base = Math.floor((bounds.min[2] - 24) / 8) * 8;
  for (const [band, clipped] of [...partitions.entries()].sort((a, b) => a[0] - b[0])) {
    const wallSurface = surface('wall', `Capped collision walls ${band}`);
    for (const polygonClosed of clipped) {
      const rings = polygonClosed.map(ring => ring.slice(0, -1));
      if (Math.abs(signedArea(rings[0])) < .001) continue;
      wallSurface.beginPart();
      polygons.push({ band, outer: rings[0], holes: rings.slice(1) });
      const points = rings.flat(), flat = points.flat(), holeStarts = [];
      let offset = rings[0].length;
      for (const hole of rings.slice(1)) { holeStarts.push(offset); offset += hole.length; }
      const rawCap = earcut(flat, holeStarts, 2), cap = [], capEdges = new Map();
      for (let i = 0; i < rawCap.length; i += 3) {
        const [a, b, c] = rawCap.slice(i, i + 3);
        if (Math.abs((points[b][0] - points[a][0]) * (points[c][1] - points[a][1]) - (points[b][1] - points[a][1]) * (points[c][0] - points[a][0])) >= 1e-9) cap.push(a, b, c);
      }
      // A boolean contour can touch itself at a single vertex. Earcut then
      // returns disconnected triangle fans that share that vertex index.
      // Split those fans before extrusion: every closed solid needs its own
      // vertical edge at the contact, without changing the XY footprint.
      const incident = Array.from({ length: points.length }, () => []);
      for (let i = 0; i < cap.length; i++) incident[cap[i]].push(i);
      for (let vertex = 0; vertex < incident.length; vertex++) {
        const pending = new Set(incident[vertex]);
        let firstFan = true;
        while (pending.size) {
          const fan = [pending.values().next().value]; pending.delete(fan[0]);
          for (let q = 0; q < fan.length; q++) {
            const t = Math.floor(fan[q] / 3) * 3;
            const neighbors = cap.slice(t, t + 3).filter(index => index !== vertex);
            for (const next of pending) {
              const n = Math.floor(next / 3) * 3;
              if (cap.slice(n, n + 3).some(index => neighbors.includes(index))) { pending.delete(next); fan.push(next); }
            }
          }
          if (!firstFan) {
            const replacement = points.push(points[vertex].slice()) - 1;
            for (const index of fan) cap[index] = replacement;
          }
          firstFan = false;
        }
      }
      let foundation = Math.max(base, band - 32);
      for (const ring of rings) for (let e = 0; e < ring.length; e++) {
        const p = ring[e], q = ring[(e + 1) % ring.length], steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / resolution));
        for (let step = 0; step <= steps; step++) {
          const col = Math.floor((p[0] + (q[0] - p[0]) * step / steps - x0) / resolution), row = Math.floor((p[1] + (q[1] - p[1]) * step / steps - y0) / resolution);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const x = col + dx, y = row + dy;
            if (x < 0 || y < 0 || x >= width || y >= height || !walls[y * width + x]) continue;
            foundation = Math.min(foundation, Math.round(floor[y * width + x] / 48) * 48 + wallHeight - 8);
          }
        }
      }
      foundation = Math.max(base, foundation);
      const bottoms = points.map(p => [...p, foundation]);
      const tops = points.map(p => [...p, band + wallHeight]);
      // Keep coincident contour occurrences distinct at point-touching rooms.
      // Position welding there would turn two closed sides into a nonmanifold
      // vertical edge with four or six incident faces.
      const vertexOffset = wallSurface.positions.length / 3, bottomOffset = vertexOffset + points.length;
      wallSurface.positions.push(...tops.flat(), ...bottoms.flat());
      for (let i = 0; i < cap.length; i += 3) {
        const [a, b, c] = cap.slice(i, i + 3);
        wallSurface.indices.push(vertexOffset + a, vertexOffset + b, vertexOffset + c, bottomOffset + c, bottomOffset + b, bottomOffset + a);
        for (const [u, v] of [[a, b], [b, c], [c, a]]) {
          const key = u < v ? `${u},${v}` : `${v},${u}`;
          if (!capEdges.has(key)) capEdges.set(key, { a: u, b: v, count: 0 });
          capEdges.get(key).count++;
        }
      }
      // Earcut may remove collinear contour vertices. Derive sides from the
      // cap's actual boundary so caps and walls share identical edges.
      for (const { a, b, count } of capEdges.values()) if (count === 1) {
        wallSurface.indices.push(bottomOffset + a, bottomOffset + b, vertexOffset + b, bottomOffset + a, vertexOffset + b, vertexOffset + a);
      }
    }
    if (wallSurface.indices.length) wallSurfaces.push(wallSurface);
  }
  const navigationSurface = surface('ground', 'Navigation floor');
  const stepSurface = surface('ground', 'Navigation step risers');
  const navPolygons = [];
  const navigationEdges = new Map();
  for (const triangle of triangles) {
    navigationSurface.add(...triangle);
    for (let e = 0; e < 3; e++) {
      const a = triangle[e], b = triangle[(e + 1) % 3], key = [a.map(v => Math.round(v * 100)).join(','), b.map(v => Math.round(v * 100)).join(',')].sort().join('|');
      if (!navigationEdges.has(key)) navigationEdges.set(key, { a, b, count: 0 });
      navigationEdges.get(key).count++;
    }
    const ring = triangle.map(p => p.slice(0, 2).map(v => Math.round(v * 100) / 100));
    if (Math.abs(signedArea(ring)) > .01) navPolygons.push([ring]);
  }
  const navigationUnion = navFootprint;
  const navigationAnchors = new Set(navigationUnion.flatMap(p => p.flatMap(r => simplifyRing(r.slice(0, -1), .1).map(v => v.map(n => Math.round(n * 100)).join(',')))));
  const floorSurface = surface('terrain', 'Continuous ground infill');
  for (const { a, b, count } of navigationEdges.values()) {
    if (count !== 1) continue;
    const mid = a.map((v, k) => (v + b[k]) / 2), top = [a, mid, b];
    const low = top.map(p => [p[0], p[1], Math.min(p[2], support(p[0], p[1]).z)]);
    for (let e = 0; e < 2; e++) {
      if (top[e][2] - low[e][2] < .2 && top[e + 1][2] - low[e + 1][2] < .2) continue;
      stepSurface.add(low[e], low[e + 1], top[e + 1]); stepSurface.add(low[e], top[e + 1], top[e]);
    }
  }
  const rimSurface = surface('terrain', 'Continuous terrain edge');
  const vertexWidth = width + 1, vertexHeight = height + 1, vertexCount = vertexWidth * vertexHeight;
  let elevations = new Float32Array(vertexCount);
  const pinned = new Uint8Array(vertexCount);
  for (let y = 0; y < vertexHeight; y++) for (let x = 0; x < vertexWidth; x++) {
    const s = support(x0 + x * resolution, y0 + y * resolution), id = y * vertexWidth + x;
    elevations[id] = Math.round(s.z / 2) * 2; pinned[id] = s.distance <= 40 ? 1 : 0;
  }
  // Keep sampled walkable heights fixed, smoothly fill only inaccessible voids.
  // This removes nearest-triangle discontinuities beneath buildings.
  for (let step = 0; step < 45; step++) {
    const next = elevations.slice();
    for (let y = 1; y < vertexHeight - 1; y++) for (let x = 1; x < vertexWidth - 1; x++) {
      const id = y * vertexWidth + x;
      if (!pinned[id]) next[id] = (elevations[id - 1] + elevations[id + 1] + elevations[id - vertexWidth] + elevations[id + vertexWidth]) / 4;
    }
    elevations = next;
  }
  const heightAtVertex = (x, y) => Math.round(elevations[Math.round((y - y0) / resolution) * vertexWidth + Math.round((x - x0) / resolution)] * 4) / 4;
  const clipTiles = new Map(), tileSize = resolution * 8;
  function addInfillTriangle(tri) {
    const centerX = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, centerY = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
    const tileX = Math.floor((centerX - x0) / tileSize), tileY = Math.floor((centerY - y0) / tileSize), key = `${tileX},${tileY}`;
    if (!clipTiles.has(key)) {
      const tx = x0 + tileX * tileSize, ty = y0 + tileY * tileSize;
      clipTiles.set(key, clipping.intersection(navigationUnion, [[[tx, ty], [tx + tileSize, ty], [tx + tileSize, ty + tileSize], [tx, ty + tileSize]]]));
    }
    const nav = clipTiles.get(key);
    const result = nav.length ? clipping.difference([tri.map(p => p.slice(0, 2))], nav) : [[tri.map(p => p.slice(0, 2))]];
    for (const polygon of result) {
      const rings = polygon.map(r => r.length > 1 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? r.slice(0, -1) : r);
      const points = rings.flat(), holes = [];
      let offset = rings[0].length;
      for (const ring of rings.slice(1)) { holes.push(offset); offset += ring.length; }
      const indices = earcut(points.flat(), holes, 2);
      const [a, b, c] = tri;
      const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      const positions = points.map(p => {
        const h = support(...p);
        if (h.distance < .05) return [...p, h.z];
        const u = ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / det;
        const v = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / det;
        return [...p, a[2] * u + b[2] * v + c[2] * (1 - u - v)];
      });
      for (let i = 0; i < indices.length; i += 3) floorSurface.add(...indices.slice(i, i + 3).map(j => positions[j]));
    }
  }
  const groundStride = 2;
  const groundBlock = (x, y) => {
    if (x < 0 || y < 0 || x + groundStride > width || y + groundStride > height) return false;
    for (let dy = 0; dy < groundStride; dy++) for (let dx = 0; dx < groundStride; dx++) if (ground[(y + dy) * width + x + dx]) return true;
    return false;
  };
  for (let y = 0; y + groundStride <= height; y += groundStride) for (let x = 0; x + groundStride <= width; x += groundStride) if (groundBlock(x, y)) {
    const p = [[x0 + x * resolution, y0 + y * resolution], [x0 + (x + groundStride) * resolution, y0 + y * resolution], [x0 + (x + groundStride) * resolution, y0 + (y + groundStride) * resolution], [x0 + x * resolution, y0 + (y + groundStride) * resolution]].map(p => [...p, heightAtVertex(...p)]);
    addInfillTriangle([p[0], p[1], p[2]]); addInfillTriangle([p[0], p[2], p[3]]);
    for (const [edge, neighbor] of [[0, groundBlock(x, y - groundStride)], [1, groundBlock(x + groundStride, y)], [2, groundBlock(x, y + groundStride)], [3, groundBlock(x - groundStride, y)]]) if (!neighbor) {
      // Reconstructed boundary walls and the slab can otherwise have coplanar
      // vertical faces. Recess the slab 2 units to eliminate depth-fighting.
      const inward = [[0, 2], [-2, 0], [0, -2], [2, 0]][edge];
      const a = [p[edge][0] + inward[0], p[edge][1] + inward[1], p[edge][2]];
      const b = [p[(edge + 1) % 4][0] + inward[0], p[(edge + 1) % 4][1] + inward[1], p[(edge + 1) % 4][2]];
      const lowA = [a[0], a[1], base], lowB = [b[0], b[1], base];
      rimSurface.add(lowA, lowB, b); rimSurface.add(lowA, b, a);
    }
  }
  const surfaces = [navigationSurface, stepSurface, floorSurface, rimSurface, ...wallSurfaces];
  for (const s of surfaces) {
    delete s.add;
    delete s.beginPart;
    if (s.kind !== 'wall' && s !== navigationSurface && s !== stepSurface) {
      const positions = new Float32Array(s.positions);
      let indices = new Uint32Array(s.indices);
      if (s === floorSurface) {
        const locks = new Uint8Array(positions.length / 3);
        for (let v = 0; v < locks.length; v++) if (navigationAnchors.has(`${Math.round(positions[v * 3] * 100)},${Math.round(positions[v * 3 + 1] * 100)}`)) locks[v] = 1;
        [indices] = simplify.simplifyWithAttributes(indices, positions, 3, new Float32Array(locks.length), 1, [0], locks, Math.min(indices.length, 3500 * 3), 3, ['ErrorAbsolute']);
      } else [indices] = simplify.simplify(indices, positions, 3, Math.min(indices.length, 800 * 3), 3, ['ErrorAbsolute']);
      const [remap, count] = simplify.compactMesh(indices), compact = new Array(count * 3);
      for (let i = 0; i < remap.length; i++) if (remap[i] !== 0xffffffff) for (let k = 0; k < 3; k++) compact[remap[i] * 3 + k] = Math.round(positions[i * 3 + k] * 100) / 100;
      s.positions = compact; s.indices = Array.from(indices);
    }
    const valid = [];
    for (let i = 0; i < s.indices.length; i += 3) {
      const p = s.indices.slice(i, i + 3).map(index => point(s.positions, index));
      const a = p[1].map((v, axis) => v - p[0][axis]), b = p[2].map((v, axis) => v - p[0][axis]);
      if (Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) > (s.kind === 'wall' ? 1e-10 : 1e-6)) valid.push(...s.indices.slice(i, i + 3));
    }
    s.indices = valid;
  }
  let wallOpenEdges = 0;
  for (const s of wallSurfaces) {
    const edges = new Map();
    for (let i = 0; i < s.indices.length; i += 3) for (let j = 0; j < 3; j++) {
      const a = s.indices[i + j], b = s.indices[i + (j + 1) % 3], key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
    wallOpenEdges += [...edges.values()].filter(count => count !== 2).length;
  }
  if (wallOpenEdges) throw new Error(`Unclosed wall solids: ${wallOpenEdges} edges`);
  // Material batches retain each independent solid's topology; do not weld
  // adjacent heights together just to reduce draw calls.
  const merged = new Map();
  for (const s of surfaces) {
    if (!merged.has(s.kind)) merged.set(s.kind, { kind: s.kind, label: s.kind === 'ground' ? 'Original walkable navigation floor' : s.kind === 'wall' ? 'Connected collision walls and sealed buildings' : 'Non-walkable supporting terrain', positions: [], indices: [], parts: [] });
    const target = merged.get(s.kind), vertexOffset = target.positions.length / 3;
    target.parts.push({ label: s.label, indexStart: target.indices.length, indexCount: s.indices.length });
    target.positions.push(...s.positions);
    target.indices.push(...s.indices.map(index => index + vertexOffset));
  }
  const batches = [...merged.values()];
  const stats = { originalCollisionTriangles, excludedCollisionTriangles, originalNavTriangles: triangles.length, clipTags: [...clipTags], sectionSegments, wallPolygons: polygons.length, wallContourVertices: polygons.reduce((n, p) => n + p.outer.length + p.holes.reduce((s, h) => s + h.length, 0), 0), wallOpenEdges, partitionAreaError, sealedBuildings: filledBuildings.length, wallCells: walls.reduce((a, b) => a + b, 0), groundCells: ground.reduce((a, b) => a + b, 0), outputTriangles: batches.reduce((n, s) => n + s.indices.length / 3, 0), outputVertices: batches.reduce((n, s) => n + s.positions.length / 3, 0) };
  return { surfaces: batches, support, stats, diagnostics: { x0, y0, width, height, resolution, walls: Array.from(walls), ground: Array.from(ground), distance: Array.from(distance), floor: Array.from(floor), polygons, globalFootprint, filledBuildings }, reconstruction: { gridUnits: resolution, contourTolerance: 10, wallHeight, wallHeightBand: 48, wallFoundationDepth: 32, terrainRimInset: 2, navigationClearance: 0, navigationReach: reach, sourceSliceHeights: [40, 64, 88], sliceStep, finiteCollisionSpans: true, floorErrorLimit: 3, navigationPreserved: true, preserveSharedWallBoundaries: true, sealedBuildingsRequireRoofEvidence: true, roofCoverageThreshold: .75, roofCoreNavigationShoulder: 32, roofCoreMinimumArea: 2048, roofHeightRange: [48, 768], roofBothFaceOrientations: true, roofNormalThreshold: .65, connectedRoofNormalThreshold: .3, connectedRoofExtension: 96, planarBuildingCaps: true } };
}
