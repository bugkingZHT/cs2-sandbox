/** Reproducible offline export of six additional VPKs. Ancient stays archived. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readGlb } from './source-nav-glb.mjs';
import { buildCutaway } from './cutaway-geometry.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((list, v, i, all) => v.startsWith('--') ? [...list, [v.slice(2), all[i + 1]]] : list, []));
const names = (args.maps || 'de_dust2,de_mirage,de_inferno,de_nuke,de_anubis,de_cache').split(',');
const mapsRoot = args.vpkDir || 'C:/Program Files (x86)/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/maps';
const toolRoot = path.resolve('tmp/ancient-source');
const cli = path.resolve(args.cli || path.join(toolRoot, 'vrf-20.0/Source2Viewer-CLI.exe'));
const { MeshoptSimplifier } = await import(pathToFileURL(path.resolve(args.meshopt || path.join(toolRoot, 'optimizer/node_modules/meshoptimizer/meshopt_simplifier.module.js'))));
await MeshoptSimplifier.ready;
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(parameters) {
  const result = spawnSync(cli, parameters, { windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
}
const boundsOf = positions => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) { min[i % 3] = Math.min(min[i % 3], positions[i]); max[i % 3] = Math.max(max[i % 3], positions[i]); }
  return { min, max };
};
for (const mapName of names) {
  if (!/^de_(dust2|mirage|inferno|nuke|anubis|cache)$/.test(mapName)) throw new Error(`Unsupported export: ${mapName}`);
  const work = path.resolve(args.work || 'tmp/map-sources', mapName), vpk = path.join(mapsRoot, `${mapName}.vpk`);
  fs.mkdirSync(work, { recursive: true });
  if (args.reuse !== 'true') {
    run(['-i', vpk, '-f', `maps/${mapName}.nav`, '-o', path.join(work, 'source.nav')]);
    run(['-i', path.join(work, 'source.nav'), '-o', path.join(work, 'nav.glb'), '-d', '--gltf_export_format', 'glb']);
    run(['-i', vpk, '-f', `maps/${mapName}/world_physics.vmdl_c`, '-o', path.join(work, 'world.glb'), '-d', '--gltf_export_format', 'glb']);
    run(['-i', vpk, '-f', `maps/${mapName}/entities/default_ents.vents_c`, '-o', path.join(work, 'entities'), '-d']);
  }
  const navMeshes = readGlb(path.join(work, 'nav.glb')).filter(m => m.extras.HullIndex === 0);
  if (!navMeshes.length) throw new Error(`${mapName}: missing player NAV hull`);
  const geometry = buildCutaway(navMeshes, readGlb(path.join(work, 'world_physics.glb')), MeshoptSimplifier);
  const sites = [];
  for (const entity of fs.readFileSync(path.join(work, 'entities'), 'utf8').split(/====\d+====/)) {
    if (!/classname\s+"func_bomb_target"/.test(entity)) continue;
    const designation = entity.match(/bomb_site_designation\s+"(\d)"/)?.[1];
    const model = entity.match(/model\s+resource_name:"([^"]+)"/)?.[1];
    if (!model || !['0', '1'].includes(designation)) continue;
    const label = designation === '0' ? 'A' : 'B', sitePath = path.join(work, `site-${label.toLowerCase()}.glb`);
    if (!fs.existsSync(sitePath.replace('.glb', '_physics.glb'))) run(['-i', vpk, '-f', `${model}_c`, '-o', sitePath, '-d', '--gltf_export_format', 'glb']);
    const vector = (key, fallback) => entity.match(new RegExp(`^${key}\\s+\\[([^\\]]+)\\]`, 'm'))?.[1].split(',').map(Number) || fallback;
    const origin = vector('origin', [0, 0, 0]), scales = vector('scales', [1, 1, 1]);
    const [pitch, yaw, roll] = vector('angles', [0, 0, 0]).map(v => v * Math.PI / 180);
    const vertices = readGlb(sitePath.replace('.glb', '_physics.glb')).flatMap(m => Array.from(m.positions));
    for (let i = 0; i < vertices.length; i += 3) {
      let [x, y, z] = vertices.slice(i, i + 3).map((v, k) => v * scales[k]);
      [y, z] = [y * Math.cos(roll) - z * Math.sin(roll), y * Math.sin(roll) + z * Math.cos(roll)];
      [x, z] = [x * Math.cos(pitch) + z * Math.sin(pitch), -x * Math.sin(pitch) + z * Math.cos(pitch)];
      [x, y] = [x * Math.cos(yaw) - y * Math.sin(yaw), x * Math.sin(yaw) + y * Math.cos(yaw)];
      vertices.splice(i, 3, x + origin[0], y + origin[1], z + origin[2]);
    }
    const bounds = boundsOf(vertices);
    const x = (bounds.min[0] + bounds.max[0]) / 2, y = (bounds.min[1] + bounds.max[1]) / 2;
    const floors = geometry.nav.supports(x, y, 384, 24).sort((a, b) => Math.abs(a.z - bounds.min[2]) - Math.abs(b.z - bounds.min[2]) || a.distance - b.distance);
    if (!floors.length) throw new Error(`${mapName}: no navigation near site ${label}`);
    sites.push({ label, position: [x, y, Math.round(floors[0].z * 20) / 20], radius: Math.min(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1]) / 2, bounds });
  }
  if (sites.length !== 2) throw new Error(`${mapName}: expected both bomb sites`);
  const result = { version: 1, mapName, bounds: boundsOf(geometry.surfaces.flatMap(s => s.positions)), surfaces: geometry.surfaces, sites,
    source: { format: 'Source 2 VPK collision cutaway + original NAV', vpkFile: path.basename(vpk), vpkSha256: hash(vpk), navSha256: hash(path.join(work, 'source.nav')),
      collisionResource: `maps/${mapName}/world_physics.vmdl_c`, exporter: 'ValveResourceFormat 20.0 + meshoptimizer 0.25.0',
      coordinates: 'Source/Demo XYZ; Z up; original world units', cutaway: { navigationRadius: 128, wallHeight: 136, roofHeight: 92, floorDepth: 24, preservesMultipleFloors: true },
      stats: geometry.stats, notes: 'Original collision surfaces cropped near all local navigation levels. Not a full game collision, visibility or penetration proxy.' } };
  const serialized = JSON.stringify(result);
  if (serialized.length > 6 * 1024 * 1024 || geometry.stats.outputTriangles > 150000) throw new Error(`${mapName}: cutaway exceeds budget (${serialized.length} bytes)`);
  const output = path.resolve(args.out || 'frontend/public/map/3d', `${mapName}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, serialized);
  console.log(JSON.stringify({ mapName, bytes: serialized.length, ...geometry.stats, sites, bounds: result.bounds }));
}
