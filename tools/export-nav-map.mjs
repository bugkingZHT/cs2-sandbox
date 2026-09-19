import fs from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readGlb } from './source-nav-glb.mjs';
import { buildNavSandbox } from './nav-sandbox-geometry.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => {
  if (v.startsWith('--')) a.push([v.slice(2), all[i + 1]]); return a;
}, []));
const work = path.resolve(args.work || 'tmp/ancient-source');
const nav = path.resolve(args.nav || path.join(homedir(), 'Desktop/de_ancient.nav'));
const out = path.resolve(args.out || 'frontend/public/map/3d/de_ancient.json');
const cli = path.resolve(args.cli || path.join(work, 'vrf-20.0/Source2Viewer-CLI.exe'));
fs.mkdirSync(work, { recursive: true });
// Always extract the supplied NAV afresh, so an old cached GLB cannot be mislabeled.
const glb = path.join(work, 'nav-only.glb');
const result = spawnSync(cli, ['-i', nav, '-o', glb, '-d', '--gltf_export_format', 'glb'],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true });
if (result.error || result.status !== 0) throw new Error(String(result.error || result.stdout + result.stderr));
const { default: earcut } = await import(pathToFileURL(path.resolve(args.earcut || path.join(work, 'optimizer/node_modules/earcut/src/earcut.js'))));
const { default: clipping } = await import(pathToFileURL(path.resolve(args.clipping || path.join(work, 'optimizer/node_modules/polygon-clipping/dist/polygon-clipping.cjs.js'))));
const navMeshes = readGlb(glb).filter(m => m.extras.HullIndex === 0);
const geometry = buildNavSandbox({ navMeshes, earcut, clipping });
// Existing semantic map annotations, not a building/collision input. NAV has no bombsite triggers.
const sites = [{ label: 'A', position: [-1392, 844, 57], radius: 132 }, { label: 'B', position: [886.5, 62, 133], radius: 144 }];
const asset = { version: 1, mapName: 'de_ancient', bounds: geometry.bounds, surfaces: geometry.surfaces, sites,
  source: { format: 'Source 2 NAV-only tactical sandbox', navFile: path.basename(nav),
    navSha256: crypto.createHash('sha256').update(fs.readFileSync(nav)).digest('hex'),
    exporter: 'ValveResourceFormat Source2Viewer-CLI 20.0', coordinates: 'Source/Demo XYZ; Z up; original world units',
    annotations: 'Existing A/B markers retained; not derived from NAV', reconstruction: geometry.reconstruction, stats: geometry.stats,
    notes: 'Original NAV floors plus 24-unit inferred low infill inside the NAV convex hull. Gaps are not evidence of real walls or collision. No VPK, building meshes or textures used.' } };
const serialized = JSON.stringify(asset) + '\n';
if (Buffer.byteLength(serialized) > 1024 * 1024 || geometry.stats.outputTriangles > 18000) throw new Error('NAV model exceeds budget');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, serialized);
console.log(JSON.stringify({ output: out, bytes: Buffer.byteLength(serialized), ...geometry.stats, bounds: geometry.bounds }, null, 2));
