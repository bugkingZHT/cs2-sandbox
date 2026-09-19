/** Offline cutaway of actual Source collision triangles; never extrudes NAV walls. */
export function navigationIndex(meshes) {
  const triangles = [], grid = new Map(), cell = 128;
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const mesh of meshes) for (let i = 0; i < mesh.indices.length; i += 3) {
    const t = Array.from(mesh.indices.slice(i, i + 3), j => Array.from(mesh.positions.slice(j * 3, j * 3 + 3)));
    const id = triangles.push(t) - 1;
    for (const p of t) for (let k = 0; k < 3; k++) { bounds.min[k] = Math.min(bounds.min[k], p[k]); bounds.max[k] = Math.max(bounds.max[k], p[k]); }
    for (let x = Math.floor(Math.min(...t.map(p => p[0])) / cell); x <= Math.floor(Math.max(...t.map(p => p[0])) / cell); x++)
      for (let y = Math.floor(Math.min(...t.map(p => p[1])) / cell); y <= Math.floor(Math.max(...t.map(p => p[1])) / cell); y++) {
        const key = `${x},${y}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(id);
      }
  }
  function supports(x, y, radius = 128, levelSeparation = 112) {
    const candidates = [], seen = new Set(), reach = Math.ceil(radius / cell);
    for (let gx = Math.floor(x / cell) - reach; gx <= Math.floor(x / cell) + reach; gx++)
      for (let gy = Math.floor(y / cell) - reach; gy <= Math.floor(y / cell) + reach; gy++)
        for (const id of grid.get(`${gx},${gy}`) || []) {
          if (seen.has(id)) continue; seen.add(id);
          const t = triangles[id], [a, b, c] = t;
          const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
          let distance = Infinity, z = 0;
          if (Math.abs(det) > 1e-6) {
            const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det;
            const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det;
            if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001) { distance = 0; z = u * a[2] + v * b[2] + (1 - u - v) * c[2]; }
          }
          if (distance !== 0) for (let e = 0; e < 3; e++) {
            const p = t[e], q = t[(e + 1) % 3], dx = q[0] - p[0], dy = q[1] - p[1];
            const f = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy || 1)));
            const d = (x - p[0] - f * dx) ** 2 + (y - p[1] - f * dy) ** 2;
            if (d < distance) { distance = d; z = p[2] + f * (q[2] - p[2]); }
          }
          if (distance <= radius * radius) candidates.push({ distance, z });
        }
    // Multiple genuine floors at the same X/Y survive independently (Nuke,
    // tunnels and bridges). Never collapse the lookup to just the lowest floor.
    candidates.sort((a, b) => a.distance - b.distance || a.z - b.z);
    const levels = [];
    for (const candidate of candidates) if (!levels.some(level => Math.abs(level.z - candidate.z) < levelSeparation)) levels.push(candidate);
    return levels;
  }
  return { triangles, bounds, supports };
}

function batch(kind, label) {
  const positions = [], indices = [], vertices = new Map(), faces = new Set();
  return { kind, label, positions, indices, add(tri) {
    const ids = tri.map(p => {
      const q = p.map(v => Math.round(v * 20) / 20), key = q.join(',');
      if (!vertices.has(key)) { vertices.set(key, positions.length / 3); positions.push(...q); }
      return vertices.get(key);
    });
    if (new Set(ids).size !== 3) return;
    const key = [...ids].sort((a, b) => a - b).join(',');
    if (!faces.has(key)) { faces.add(key); indices.push(...ids); }
  } };
}

function clip(poly, height, keepAbove) {
  const result = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const insideA = keepAbove ? a[2] >= height : a[2] <= height;
    const insideB = keepAbove ? b[2] >= height : b[2] <= height;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = (height - a[2]) / (b[2] - a[2]);
      result.push(a.map((v, k) => v + t * (b[k] - v)));
    }
  }
  return result;
}

export function buildCutaway(navMeshes, collisionMeshes, simplify) {
  const nav = navigationIndex(navMeshes), cache = new Map();
  const ground = batch('ground', 'Original NAV walkable floors');
  const wall = batch('wall', 'Original VPK cutaway walls');
  const terrain = batch('terrain', 'Original VPK ground and slopes');
  const cover = batch('cover', 'Original VPK ledges and cover');
  nav.triangles.forEach(t => ground.add(t));
  let sourceTriangles = 0, excludedTriangles = 0;
  function visit(t, depth = 0) {
    if ([0, 1].some(k => Math.max(...t.map(p => p[k])) < nav.bounds.min[k] - 128 || Math.min(...t.map(p => p[k])) > nav.bounds.max[k] + 128)) return;
    if (Math.max(...t.map(p => p[2])) < nav.bounds.min[2] - 24 || Math.min(...t.map(p => p[2])) > nav.bounds.max[2] + 136) return;
    // Sample long original faces locally before height clipping, rather than
    // dropping an entire wall when only its centroid is outside navigation.
    const edges = t.map((p, i) => Math.hypot(p[0] - t[(i + 1) % 3][0], p[1] - t[(i + 1) % 3][1]));
    const longest = Math.max(...edges);
    if (longest > 144 && depth < 12) {
      const i = edges.indexOf(longest), a = t[i], b = t[(i + 1) % 3], c = t[(i + 2) % 3];
      const mid = a.map((v, k) => (v + b[k]) / 2);
      visit([a, mid, c], depth + 1); visit([mid, b, c], depth + 1); return;
    }
    const x = t.reduce((s, p) => s + p[0], 0) / 3, y = t.reduce((s, p) => s + p[1], 0) / 3;
    const key = `${Math.round(x / 16)},${Math.round(y / 16)}`;
    if (!cache.has(key)) cache.set(key, nav.supports(Math.round(x / 16) * 16, Math.round(y / 16) * 16));
    const a = t[1].map((v, k) => v - t[0][k]), b = t[2].map((v, k) => v - t[0][k]);
    const normal = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const length = Math.hypot(...normal); if (length < .1) return;
    const horizontal = Math.abs(normal[2]) / length > .7;
    for (const { z, distance } of cache.get(key)) {
      const meanZ = t.reduce((s, p) => s + p[2], 0) / 3;
      if (horizontal && (meanZ > z + 92 || meanZ < z - 24)) continue;
      // NAV already supplies walking surfaces; avoid nearly coincident faces.
      if (horizontal && distance < 1 && Math.abs(meanZ - z) < 5) continue;
      const polygon = clip(clip(t, z - 24, true), z + (horizontal ? 92 : 136), false);
      const output = horizontal ? (meanZ < z + 20 ? terrain : cover) : wall;
      for (let i = 1; i + 1 < polygon.length; i++) output.add([polygon[0], polygon[i], polygon[i + 1]]);
    }
  }
  for (const mesh of collisionMeshes) {
    sourceTriangles += mesh.indices.length / 3;
    if ((mesh.extras.InteractAs || []).some(tag => /clip|trigger|sky|passbullets|window|blocklight|blocklos|blocksound/.test(tag))) {
      excludedTriangles += mesh.indices.length / 3; continue;
    }
    for (let i = 0; i < mesh.indices.length; i += 3) visit(Array.from(mesh.indices.slice(i, i + 3), j => Array.from(mesh.positions.slice(j * 3, j * 3 + 3))));
  }
  const surfaces = [ground, wall, terrain, cover].filter(s => s.indices.length).map(s => {
    let positions = new Float32Array(s.positions), indices = new Uint32Array(s.indices);
    if (s !== ground) [indices] = simplify.simplify(indices, positions, 3, Math.min(indices.length, (s === wall ? 32000 : 9000) * 3), 3, ['ErrorAbsolute']);
    const [remap, count] = simplify.compactMesh(indices), compact = new Array(count * 3);
    for (let i = 0; i < remap.length; i++) if (remap[i] !== 0xffffffff) for (let k = 0; k < 3; k++) compact[remap[i] * 3 + k] = Math.round(positions[i * 3 + k] * 20) / 20;
    return { kind: s.kind, label: s.label, positions: compact, indices: Array.from(indices) };
  });
  return { surfaces, nav, stats: { sourceTriangles, excludedTriangles, outputTriangles: surfaces.reduce((s, m) => s + m.indices.length / 3, 0), navTriangles: ground.indices.length / 3 } };
}
