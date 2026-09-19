/** NAV-only tactical model. Gaps are visual infill, never source collision. */
export function buildNavSandbox({ navMeshes, earcut, clipping, wallHeight = 24 }) {
  const round = n => Math.round(n * 100) / 100;
  const triangles = navMeshes.flatMap(mesh => Array.from({ length: mesh.indices.length / 3 }, (_, i) =>
    Array.from(mesh.indices.slice(i * 3, i * 3 + 3), k => Array.from(mesh.positions.slice(k * 3, k * 3 + 3), round))));
  if (!triangles.length) throw new Error('NAV contains no player hull triangles');
  const area = ring => ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;
  const footprint = clipping.union(triangles.map(t => [t.map(p => p.slice(0, 2))]).filter(p => Math.abs(area(p[0])) > .001));
  // A convex outline bounds interior gaps without filling the whole square plinth.
  // Its corners are taken from NAV; no building geometry or VPK is consulted.
  const xy = [...new Map(triangles.flat().map(p => [p.slice(0, 2).join(','), p.slice(0, 2)])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const chain = points => {
    const result = [];
    for (const p of points) {
      while (result.length > 1 && cross(result.at(-2), result.at(-1), p) <= 0) result.pop();
      result.push(p);
    }
    return result.slice(0, -1);
  };
  const envelope = [[chain(xy).concat(chain([...xy].reverse()))]];
  const gaps = clipping.difference(envelope, footprint);
  const heightCache = new Map();
  // At boundaries use the actual NAV ramp/step height, including interpolated Z.
  // Where floors overlap, the lower support wins; never invent a tall building.
  function support(x, y) {
    const key = `${x},${y}`;
    if (heightCache.has(key)) return heightCache.get(key);
    let best = Infinity, height = Infinity;
    const update = (distance, z) => {
      if (distance < best - 1e-5 || (Math.abs(distance - best) <= 1e-5 && z < height)) { best = distance; height = z; }
    };
    for (const [a, b, c] of triangles) {
      const d = cross(a, b, c);
      if (Math.abs(d) > 1e-5) {
        const u = cross([x, y], b, c) / d, v = cross(a, [x, y], c) / d;
        if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) update(0, u * a[2] + v * b[2] + (1 - u - v) * c[2]);
      }
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const dx = q[0] - p[0], dy = q[1] - p[1];
        const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy || 1)));
        update((x - p[0] - t * dx) ** 2 + (y - p[1] - t * dy) ** 2, p[2] + t * (q[2] - p[2]));
      }
    }
    heightCache.set(key, round(height));
    return round(height);
  }
  const ground = { kind: 'ground', label: 'Original NAV floors', positions: [], indices: [], parts: [] };
  const vertices = new Map();
  for (const triangle of triangles) for (const point of triangle) {
    const key = point.join(',');
    if (!vertices.has(key)) { vertices.set(key, ground.positions.length / 3); ground.positions.push(...point); }
    ground.indices.push(vertices.get(key));
  }
  ground.parts.push({ label: 'Navigation floor', indexStart: 0, indexCount: ground.indices.length });
  const wall = { kind: 'wall', label: 'NAV gap low infill', blocksShots: false, positions: [], indices: [], parts: [] };
  let capArea = 0;
  for (const polygon of gaps) {
    const rings = polygon.map(r => r.slice(0, -1).map(p => p.map(v => Math.round(v * 1e6) / 1e6)))
      .map(r => r.filter((p, i) => Math.hypot(p[0] - r[(i + r.length - 1) % r.length][0], p[1] - r[(i + r.length - 1) % r.length][1]) > 1e-7));
    const points = rings.flat(), holes = [];
    let offset = rings[0].length;
    for (const hole of rings.slice(1)) { holes.push(offset); offset += hole.length; }
    const rawCap = earcut(points.flat(), holes, 2), cap = [];
    for (let i = 0; i < rawCap.length; i += 3) {
      const [a, b, c] = rawCap.slice(i, i + 3);
      if (Math.abs(cross(points[a], points[b], points[c])) > 1e-7) cap.push(a, b, c);
    }
    if (!cap.length) continue;
    // Split triangle fans at point contacts so each extruded boundary is closed.
    const incident = Array.from({ length: points.length }, () => []);
    for (let i = 0; i < cap.length; i++) incident[cap[i]].push(i);
    for (let vertex = 0; vertex < incident.length; vertex++) {
      const pending = new Set(incident[vertex]);
      let first = true;
      while (pending.size) {
        const fan = [pending.values().next().value]; pending.delete(fan[0]);
        for (let k = 0; k < fan.length; k++) {
          const start = Math.floor(fan[k] / 3) * 3, neighbors = cap.slice(start, start + 3).filter(v => v !== vertex);
          for (const next of pending) {
            const n = Math.floor(next / 3) * 3;
            if (cap.slice(n, n + 3).some(v => neighbors.includes(v))) { pending.delete(next); fan.push(next); }
          }
        }
        if (!first) { const replacement = points.push(points[vertex].slice()) - 1; for (const i of fan) cap[i] = replacement; }
        first = false;
      }
    }
    const start = wall.indices.length, base = wall.positions.length / 3, bottom = base + points.length;
    const heights = points.map(p => support(...p));
    for (const delta of [wallHeight, -8]) for (let i = 0; i < points.length; i++) {
      // Boolean intersections can form sub-centimeter edges. Retain precision
      // here so rounding never collapses an otherwise closed cap/side pair.
      wall.positions.push(...points[i].map(v => Math.round(v * 1e6) / 1e6), round(heights[i] + delta));
    }
    const edges = new Map();
    for (let i = 0; i < cap.length; i += 3) {
      let [a, b, c] = cap.slice(i, i + 3);
      if (cross(points[a], points[b], points[c]) < 0) [b, c] = [c, b];
      capArea += Math.abs(cross(points[a], points[b], points[c])) / 2;
      wall.indices.push(base + a, base + b, base + c, bottom + c, bottom + b, bottom + a);
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const key = u < v ? `${u},${v}` : `${v},${u}`;
        if (!edges.has(key)) edges.set(key, { u, v, count: 0 });
        edges.get(key).count++;
      }
    }
    for (const { u, v, count } of edges.values()) if (count === 1) {
      wall.indices.push(bottom + u, bottom + v, base + v, bottom + u, base + v, base + u);
    }
    wall.parts.push({ label: 'NAV gap', indexStart: start, indexCount: wall.indices.length - start });
  }
  const surfaces = [ground, wall].filter(s => s.indices.length);
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const surface of surfaces) surface.positions.forEach((v, i) => {
    bounds.min[i % 3] = Math.min(bounds.min[i % 3], v); bounds.max[i % 3] = Math.max(bounds.max[i % 3], v);
  });
  const polygonArea = polys => polys.reduce((n, p) => n + Math.abs(area(p[0])) - p.slice(1).reduce((s, r) => s + Math.abs(area(r)), 0), 0);
  return { surfaces, bounds, support, footprint, gaps,
    reconstruction: { mode: 'nav-only', navigationPreserved: true, wallHeight, foundationDepth: 8,
      heightSource: 'nearest NAV surface; lower floor at overlaps', envelope: 'NAV convex hull', inferredWallsBlockShots: false },
    stats: { originalNavTriangles: triangles.length, outputTriangles: surfaces.reduce((n, s) => n + s.indices.length / 3, 0),
      outputVertices: surfaces.reduce((n, s) => n + s.positions.length / 3, 0), gapParts: wall.parts.length,
      gapArea: polygonArea(gaps), capAreaError: Math.abs(capArea - polygonArea(gaps)) } };
}
