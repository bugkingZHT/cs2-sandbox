import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EQUIPMENT_KINDS, isHandheldUtility, weaponMuzzleOffset, type EquipmentKind } from './equipmentKinds';

const METAL = 0x39434a, EDGE = 0x77848b, STOCK = 0x80634b, RUBBER = 0x263037;
const SILVER = 0xb6bfc2, OLIVE = 0x63735b, PAPER = 0xded7bb;
const GRENADE_GREEN = 0x59643f, UTILITY_RED = 0xbf423b, SMOKE_GREY = 0x41464b;

/** Bake colored parts into one draw call. No images, external models or runtime CSG. */
class Parts {
  private readonly parts: THREE.BufferGeometry[] = [];
  add(source: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rz = 0): void {
    source.rotateZ(rz).translate(x, y, z);
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    geometry.deleteAttribute('uv');
    const rgb = new THREE.Color(color), colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([rgb.r, rgb.g, rgb.b], i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(geometry);
  }
  box(x: number, y: number, z: number, w: number, h: number, d: number, color = METAL, rz = 0): void {
    this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rz);
  }
  cylinder(x: number, y: number, z: number, radius: number, length: number, color = METAL, horizontal = false, top = radius): void {
    this.add(new THREE.CylinderGeometry(top, radius, length, 8), color, x, y, z, horizontal ? Math.PI / 2 : 0);
  }
  finish(): THREE.BufferGeometry {
    const result = mergeGeometries(this.parts)!;
    for (const part of this.parts) part.dispose();
    result.computeBoundingSphere();
    return result;
  }
}

function utility(kind: EquipmentKind, body: Parts, accent: Parts): void {
  if (kind === 'c4') {
    for (const x of [-6, 0, 6]) body.box(x, 0, 0, 5, 20, 8, 0xc4544e);
    body.box(0, 1, 5, 16, 13, 3, 0x843831);
    body.box(0, 5, 7, 10, 3, 1, 0x91b59d);
    for (const x of [-4, 0, 4]) for (const y of [-3, 0]) body.box(x, y, 7, 2, 2, 1, SILVER);
    accent.box(0, -6, 0, 19, 3, 10, 0xffffff);
    return;
  }
  if (kind === 'molotov') {
    // Opaque bottle silhouette keeps the icon legible without costly glass sorting.
    body.cylinder(0, -3, 0, 6, 15, UTILITY_RED);
    body.cylinder(0, 6, 0, 6, 5, UTILITY_RED, false, 2.5);
    body.cylinder(0, 11, 0, 2.5, 6, UTILITY_RED);
    body.box(2, 15, 0, 8, 2.5, 3, PAPER, -0.45);
    accent.cylinder(0, -3, 0, 6.15, 1.8, 0xffffff);
    return;
  }
  if (kind === 'hegrenade') {
    body.add(new THREE.SphereGeometry(8, 10, 8), GRENADE_GREEN);
    body.cylinder(0, 9, 0, 3, 4, METAL);
    accent.add(new THREE.SphereGeometry(8.12, 10, 2, 0, Math.PI * 2, Math.PI / 2 - 0.12, 0.24), 0xffffff);
  } else if (kind === 'flash') {
    // Narrow waist with two broad end caps, all in the same olive shell color.
    body.cylinder(0, 0, 0, 4.3, 8, GRENADE_GREEN);
    body.cylinder(0, 5, 0, 4.3, 2, GRENADE_GREEN, false, 6.5);
    body.cylinder(0, -5, 0, 6.5, 2, GRENADE_GREEN, false, 4.3);
    for (const y of [-8.5, 8.5]) body.cylinder(0, y, 0, 6.5, 5, GRENADE_GREEN);
    accent.cylinder(0, 0, 0, 4.45, 1.8, 0xffffff);
  } else {
    const smoke = kind === 'smoke', incendiary = kind === 'incendiary';
    // Smoke and incendiary have exactly the same canister geometry, only recolored.
    const radius = smoke || incendiary ? 6.5 : 4;
    const height = smoke || incendiary ? 21 : 15;
    body.cylinder(0, 0, 0, radius, height, smoke ? SMOKE_GREY : incendiary ? UTILITY_RED : 0x707c66);
    for (const y of [-height / 2, height / 2]) body.cylinder(0, y, 0, radius + 0.5, 2, incendiary ? 0x87302b : METAL);
    if (kind === 'decoy') body.cylinder(0, 11, 0, 1.3, 7, EDGE);
    accent.cylinder(0, 0, 0, radius + 0.15, 1.8, 0xffffff);
  }
  // Shared spoon and pin, both large enough to read at tactical zoom levels.
  body.box(3, 11, 0, 10, 2, 3, EDGE, -0.2);
  body.box(7, 6, 0, 2, 11, 3, EDGE, 0.16);
  body.add(new THREE.TorusGeometry(2.5, 0.7, 4, 8), SILVER, -4, 12, 0);
}

function firearm(kind: EquipmentKind, body: Parts, accent: Parts): void {
  if (kind === 'knife') {
    body.box(10, -1, 0, 12, 4, 4, RUBBER);
    body.box(16, 0, 0, 2, 9, 6, EDGE);
    const shape = new THREE.Shape();
    shape.moveTo(17, -2); shape.lineTo(29, -2); shape.lineTo(37, 3); shape.lineTo(17, 3); shape.closePath();
    body.add(new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: false, steps: 1 }), SILVER, 0, 0, -0.75);
    accent.box(7, -1, 0, 3, 4.3, 4.3, 0xffffff);
    return;
  }
  const pistol = kind === 'pistol', smg = kind === 'smg', heavy = kind === 'machinegun';
  const gripX = pistol ? 17 : 3;
  body.box(gripX, -6, 0, 5, 11, 5, RUBBER, -0.2);
  if (pistol) {
    body.box(20, 1, 0, 16, 5, 6, METAL);
    body.box(24, -3, 0, 6, 1.5, 4, EDGE);
    body.box(26, 4, 0, 2, 2, 2, SILVER);
    accent.box(17, -6, 2.6, 3, 5, 0.6, 0xffffff);
    return;
  }
  // The sniper's exposed barrel is three times as long as the rifle's.
  // Subtract the held rig's forward offset to keep shots at the actual barrel tip.
  const barrelEnd = weaponMuzzleOffset(kind) - 20;
  body.box(smg ? 7 : 3, 0, 0, smg ? 19 : 25, heavy ? 9 : 7, heavy ? 9 : 6, METAL);
  body.box(smg ? -7 : -15, -1, 0, smg ? 10 : 16, 7, 5, kind === 'rifle' || kind === 'shotgun' ? STOCK : RUBBER);
  body.cylinder((14 + barrelEnd) / 2, 1, 0, heavy ? 2.3 : 1.7, barrelEnd - 14, METAL, true);
  body.cylinder(barrelEnd - 1, 1, 0, 2.5, 2, EDGE, true);
  if (kind === 'sniper') {
    body.box(4, 5, 0, 12, 3, 3, EDGE);
    body.cylinder(5, 9, 0, 3.2, 17, RUBBER, true);
    body.cylinder(14, 9, 0, 4, 3, EDGE, true);
    body.cylinder(15.6, 9, 0, 3, 0.4, 0x8cbbb8, true);
    body.box(3, -6, 0, 6, 6, 5);
  } else if (kind === 'shotgun') {
    body.cylinder(16, -3, 0, 2.3, 22, EDGE, true);
    body.box(14, -1, 0, 10, 6, 8, STOCK);
    for (const x of [11, 14, 17]) body.box(x, -1, 0, 1, 6.3, 8.3, RUBBER);
  } else if (heavy) {
    body.box(7, -9, 0, 13, 12, 12, OLIVE);
    body.box(5, 7, 0, 13, 3, 3, EDGE);
    for (const z of [-5, 5]) body.box(21, -5, z, 2, 12, 2, METAL, -0.25);
  } else {
    body.box(10, -9, 0, smg ? 4 : 6, smg ? 15 : 12, 5, EDGE, smg ? 0 : 0.25);
    body.box(15, 0, 0, 9, 6, 7, smg ? RUBBER : STOCK);
  }
  accent.box(0, 0, heavy ? 4.7 : 3.2, 6, 3, 0.6, 0xffffff);
}

function armsGeometry(twoHanded: boolean, forward = 20): THREE.BufferGeometry {
  const parts = new Parts();
  const start = new THREE.Vector3(), end = new THREE.Vector3(), midpoint = new THREE.Vector3();
  for (const side of [-1, 1]) {
    start.set(0, -12, side * 13);
    end.set(forward + (twoHanded ? side === 1 ? 3 : 17 : 19), twoHanded ? -6 : -5, side * 3);
    const sleeve = new THREE.CylinderGeometry(4.4, 5.2, start.distanceTo(end), 6);
    sleeve.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()));
    midpoint.copy(start).add(end).multiplyScalar(0.5);
    parts.add(sleeve, 0xffffff, midpoint.x, midpoint.y, midpoint.z);
    parts.box(end.x, end.y, end.z, 6, 6, 6, 0xffffff);
  }
  return parts.finish();
}

/** Shared geometry/material cache: switching a held item only changes references. */
export class EquipmentModels {
  readonly material: THREE.MeshToonMaterial;
  readonly longArms = armsGeometry(true);
  readonly shortArms = armsGeometry(false);
  readonly utilityArms = armsGeometry(false, 0);
  private readonly models = new Map<EquipmentKind, { body: THREE.BufferGeometry; accent: THREE.BufferGeometry }>();

  constructor(gradientMap: THREE.DataTexture) {
    this.material = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap });
    for (const kind of EQUIPMENT_KINDS) {
      const body = new Parts(), accent = new Parts();
      if (isHandheldUtility(kind)) utility(kind, body, accent); else firearm(kind, body, accent);
      this.models.set(kind, { body: body.finish(), accent: accent.finish() });
    }
  }

  create(kind: EquipmentKind, teamMaterial: THREE.Material): THREE.Mesh {
    const geometry = this.models.get(kind)!;
    const mesh = new THREE.Mesh(geometry.body, this.material);
    const accent = new THREE.Mesh(geometry.accent, teamMaterial);
    accent.name = 'equipment-team-accent';
    mesh.name = 'equipment-model';
    mesh.userData.equipmentKind = kind;
    mesh.castShadow = accent.castShadow = true;
    mesh.add(accent);
    return mesh;
  }

  set(mesh: THREE.Mesh, kind: EquipmentKind | undefined, teamMaterial: THREE.Material): void {
    mesh.visible = !!kind;
    if (!kind) { mesh.userData.equipmentKind = undefined; return; }
    if (mesh.userData.equipmentKind !== kind) {
      const geometry = this.models.get(kind)!;
      mesh.geometry = geometry.body;
      (mesh.children[0] as THREE.Mesh).geometry = geometry.accent;
      mesh.userData.equipmentKind = kind;
    }
    (mesh.children[0] as THREE.Mesh).material = teamMaterial;
  }

  dispose(): void {
    this.material.dispose();
    this.longArms.dispose();
    this.shortArms.dispose();
    this.utilityArms.dispose();
    for (const model of this.models.values()) { model.body.dispose(); model.accent.dispose(); }
    this.models.clear();
  }
}
