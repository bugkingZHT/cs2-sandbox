import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { demoToScene } from './sampleReplayFrame';
import { createMapGradient, createMapMaterial } from './mapArt';
import { getMapArt } from './mapCatalog';
import { createStoneTexture } from './stoneTexture';

export interface MapGeometryData {
  version: 1;
  mapName: string;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  surfaces: Array<{
    kind: 'ground' | 'terrain' | 'wall' | 'cover';
    positions: number[];
    indices: number[];
    blocksShots?: boolean;
  }>;
  sites?: Array<{ label: string; position: [number, number, number]; radius: number }>;
  source?: unknown;
}

/** The browser only consumes the reduced, texture-free asset, never a VPK. */
export async function loadMapGeometry(mapName: string, signal: AbortSignal): Promise<MapGeometryData> {
  if (!/^de_[a-z0-9_]+$/.test(mapName)) throw new Error('地图名称无效');
  const response = await fetch(`/map/3d/${mapName}.json`, { signal });
  if (!response.ok) throw new Error(`这张地图还没有三维白模（${response.status}）`);
  const data = await response.json() as MapGeometryData;
  if (data.version !== 1 || data.mapName !== mapName || !Array.isArray(data.surfaces) || !data.surfaces.length) {
    throw new Error('三维地图数据格式不受支持');
  }
  const validPoint = (p: unknown): p is [number, number, number] =>
    Array.isArray(p) && p.length === 3 && p.every(n => typeof n === 'number' && Number.isFinite(n));
  if (!validPoint(data.bounds?.min) || !validPoint(data.bounds?.max)
    || data.bounds.min.some((n, axis) => n >= data.bounds.max[axis])) {
    throw new Error('三维地图缺少有效的世界坐标范围');
  }
  for (const surface of data.surfaces) {
    if (!['ground', 'terrain', 'wall', 'cover'].includes(surface.kind)
      || !Array.isArray(surface.positions) || surface.positions.length % 3 !== 0
      || !Array.isArray(surface.indices) || surface.indices.length % 3 !== 0
      || surface.positions.some(n => !Number.isFinite(n))
      || surface.indices.some(n => !Number.isInteger(n) || n < 0 || n >= surface.positions.length / 3)) {
      throw new Error('三维地图包含无效几何体');
    }
  }
  return data;
}

export function createToonGradient(): THREE.DataTexture {
  // A tiny lookup, not a surface texture: three intentional light bands.
  const values = new Uint8Array([125, 125, 125, 255, 192, 192, 192, 255, 255, 255, 255, 255]);
  const texture = new THREE.DataTexture(values, 3, 1, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function buildMapGeometry(data: MapGeometryData) {
  const group = new THREE.Group();
  group.name = 'map-whitebox';
  // Source cutaway surfaces use opaque, softly lit stone. Overlapping thin
  // collision faces must not accumulate gray transparency seams.
  const gradient = createMapGradient();
  const stoneTexture = createStoneTexture();
  const mapExtent = Math.max(data.bounds.max[0] - data.bounds.min[0], data.bounds.max[1] - data.bounds.min[1], 1);
  const art = getMapArt(data.mapName), palette = art.palette;
  const ground = createMapMaterial(palette.ground, gradient, mapExtent, undefined, art);
  const wall = createMapMaterial(palette.wall, gradient, mapExtent, stoneTexture, art);
  const terrain = createMapMaterial(palette.terrain, gradient, mapExtent, undefined, art);
  const cover = createMapMaterial(palette.cover, gradient, mapExtent, stoneTexture, art);
  const materials = { ground, terrain, wall, cover };
  let triangles = 0;
  for (const surface of data.surfaces) {
    if (!surface.indices.length) continue;
    let geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(surface.positions.length);
    for (let i = 0; i < vertices.length; i += 3) {
      const p = demoToScene(surface.positions[i], surface.positions[i + 1], surface.positions[i + 2]);
      vertices[i] = p.x; vertices[i + 1] = p.y; vertices[i + 2] = p.z;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(surface.indices);
    const isFloor = surface.kind === 'ground' || surface.kind === 'terrain';
    // Smooth adjacent source faces while keeping real hard corners intact.
    const indexed = geometry;
    geometry = toCreasedNormals(indexed, Math.PI / 3);
    indexed.dispose();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials[surface.kind]);
    mesh.name = `map-${surface.kind}`;
    mesh.receiveShadow = true;
    mesh.castShadow = !isFloor;
    mesh.userData.mapSurface = true;
    mesh.userData.blocksShots = surface.blocksShots !== false;
    group.add(mesh);
    triangles += surface.indices.length / 3;
    // Deliberately no edge/wireframe overlay on map surfaces.
  }

  const [minX, minY, minZ] = data.bounds.min;
  const [maxX, maxY, maxZ] = data.bounds.max;
  const bounds = new THREE.Box3(new THREE.Vector3(minX, minZ, -maxY), new THREE.Vector3(maxX, maxZ, -minY));
  const center = bounds.getCenter(new THREE.Vector3());
  const extent = Math.max(maxX - minX, maxY - minY);
  const side = extent + 220;
  // This is a presentation plinth below all recorded floors, not invented map geometry.
  const base = new THREE.Mesh(new THREE.BoxGeometry(side, 100, side),
    createMapMaterial(palette.base, gradient, mapExtent, undefined, art));
  base.name = 'diorama-base';
  base.position.set(center.x, minZ - 65, center.z);
  base.receiveShadow = true;
  group.add(base);

  for (const site of data.sites || []) {
    if (!Array.isArray(site.position) || site.position.length !== 3 || !site.position.every(Number.isFinite)) continue;
    const p = demoToScene(...site.position);
    const radius = Math.max(30, Math.min(500, site.radius || 130));
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 5, radius, 64),
      new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    ring.name = `bombsite-${site.label}`;
    ring.position.set(p.x, p.y + 5, p.z);
    ring.rotation.x = -Math.PI / 2;
    ring.raycast = () => undefined;
    group.add(ring);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) continue;
    context.font = '700 84px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#707070';
    context.fillText(site.label.slice(0, 2), 64, 67);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(120, 120),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    label.name = `bombsite-label-${site.label}`;
    label.position.set(p.x, p.y + 6, p.z);
    label.rotation.x = -Math.PI / 2;
    label.raycast = () => undefined;
    group.add(label);
  }

  return { group, bounds, extent: side, triangles };
}
