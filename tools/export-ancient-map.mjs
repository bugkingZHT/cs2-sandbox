/** Offline Source 2 -> small, closed tactical whitebox. See docs/ancient-3d.md. */
import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildWhitebox } from './ancient-whitebox-geometry.mjs';
import { readGlb } from './source-nav-glb.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => {
  if (v.startsWith('--')) a.push([v.slice(2), all[i + 1]]);
  return a;
}, []));
const work = path.resolve(args.work || 'tmp/ancient-source');
const out = path.resolve(args.out || 'frontend/public/map/3d/de_ancient.json');
const cli = path.resolve(args.cli || path.join(work, 'vrf-20.0/Source2Viewer-CLI.exe'));
const vpk = path.resolve(args.vpk || 'C:/Program Files (x86)/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/maps/de_ancient.vpk');
const navPath = path.resolve(args.nav || path.join(homedir(), 'Desktop/de_ancient.nav'));
const meshopt = path.resolve(args.meshopt || path.join(work, 'optimizer/node_modules/meshoptimizer/meshopt_simplifier.module.js'));
const earcutPath = path.resolve(args.earcut || path.join(work, 'optimizer/node_modules/earcut/src/earcut.js'));
const clippingPath = path.resolve(args.clipping || path.join(work, 'optimizer/node_modules/polygon-clipping/dist/polygon-clipping.cjs.js'));
fs.mkdirSync(work, { recursive: true });
for (const f of [cli, vpk, navPath, meshopt, earcutPath, clippingPath]) if (!fs.existsSync(f)) throw new Error(`Missing input/tool: ${f}`);
const { MeshoptSimplifier } = await import(pathToFileURL(meshopt));
const { default: earcut } = await import(pathToFileURL(earcutPath));
const { default: clipping } = await import(pathToFileURL(clippingPath));
await MeshoptSimplifier.ready;
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const run = parameters => {
  const result = spawnSync(cli, parameters, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
};
if (args['reuse-exports'] !== 'true') {
  run(['-i', navPath, '-o', path.join(work, 'nav.glb'), '-d', '--gltf_export_format', 'glb']);
  run(['-i', vpk, '-f', 'maps/de_ancient/world_physics.vmdl_c', '-o', path.join(work, 'world.glb'), '-d', '--gltf_export_format', 'glb']);
  run(['-i', vpk, '-f', 'maps/de_ancient/entities/default_ents.vents_c', '-o', path.join(work, 'entities'), '-d']);
}
const boundsOf = positions => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) { const axis = i % 3; min[axis] = Math.min(min[axis], positions[i]); max[axis] = Math.max(max[axis], positions[i]); }
  return { min, max };
};
const navMeshes = readGlb(path.join(work, 'nav.glb')).filter(m => m.extras.HullIndex === 0);
if (!navMeshes.length) throw new Error('NAV contains no player navigation hull');
const geometry = buildWhitebox({ navMeshes, collisionMeshes: readGlb(path.join(work, 'world_physics.glb')), simplify: MeshoptSimplifier, earcut, clipping });
if (args.diagnostics === 'true') fs.writeFileSync(path.join(work, 'whitebox-diagnostics.json'), JSON.stringify(geometry.diagnostics));
const entities = fs.readFileSync(path.join(work, 'entities'), 'utf8').split(/====\d+====/);
const sites = [];
for (const entity of entities.filter(s => /classname\s+"func_bomb_target"/.test(s))) {
  const designation = entity.match(/bomb_site_designation\s+"(\d)"/)?.[1];
  const model = entity.match(/model\s+resource_name:"([^"]+)"/)?.[1];
  if (!model || !['0', '1'].includes(designation)) continue;
  const label = designation === '0' ? 'A' : 'B', sitePath = path.join(work, `site-${label.toLowerCase()}.glb`);
  if (args['reuse-exports'] !== 'true') run(['-i', vpk, '-f', `${model}_c`, '-o', sitePath, '-d', '--gltf_export_format', 'glb']);
  const meshes = readGlb(sitePath.replace('.glb', '_physics.glb'));
  const bounds = boundsOf(meshes.flatMap(m => Array.from(m.positions)));
  const x = (bounds.min[0] + bounds.max[0]) / 2, y = (bounds.min[1] + bounds.max[1]) / 2;
  sites.push({ label, position: [x, y, Math.round(geometry.support(x, y).z * 100) / 100], radius: Math.min(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1]) / 2, bounds });
}
const result = {
  version: 1, mapName: 'de_ancient', bounds: boundsOf(geometry.surfaces.flatMap(s => s.positions)), surfaces: geometry.surfaces, sites,
  source: {
    format: 'Source 2 VPK collision sections + NAV reconstructed whitebox',
    vpkFile: path.basename(vpk), vpkSha256: hash(vpk), navFile: path.basename(navPath), navSha256: hash(navPath),
    collisionResource: 'maps/de_ancient/world_physics.vmdl_c',
    exporter: 'ValveResourceFormat Source2Viewer-CLI 20.0', simplifier: 'meshoptimizer 0.25.0 + earcut 3.0.2 + polygon-clipping 0.15.7',
    coordinates: 'Source/Demo XYZ; Z up; original world units', reconstruction: geometry.reconstruction,
    notes: 'Abstract tactical whitebox. Connected, capped low walls derive from finite oriented VPK collision sections, not NAV boundary extrusion. Inaccessible enclosed buildings require source roof evidence. Original NAV ground is distinct from non-walkable infill terrain. Small details and roof heights are simplified; geometry is not a collision or line-of-sight proxy.',
    stats: geometry.stats,
  },
};
const serialized = JSON.stringify(result) + '\n';
console.log(result.surfaces.map(s => ({ label: s.label, triangles: s.indices.length / 3 })));
if (Buffer.byteLength(serialized) > 2 * 1024 * 1024 || result.source.stats.outputTriangles > 35000) throw new Error(`Asset exceeds budget: ${serialized.length} bytes / ${result.source.stats.outputTriangles} triangles`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, serialized);
console.log(JSON.stringify({ output: out, bytes: Buffer.byteLength(serialized), bounds: result.bounds, stats: result.source.stats }, null, 2));
