import * as THREE from 'three';
import type { ReplayMeta } from '@/types/replay';
import { getDisplayTeam } from '@/config/game';
import type { ScenePoint } from './sampleReplayFrame';
import { SHOT_SPEED, SHOT_RANGE, MUZZLE_DURATION_MS, IMPACT_DURATION_MS,
  type ShotFlight, type ShotFlights } from './shotFlights';

export interface ShotRenderOptions {
  currentTimeMs: number;
  replayMeta?: ReplayMeta;
  hiddenPlayerIds?: number[];
  shotDistanceAt?: (origin: ScenePoint, direction: ScenePoint, maxDistance: number) => number | undefined;
}

interface ShotEndpoint {
  distance: number;
  kind: 'range' | 'wall' | 'player';
  playerId?: number;
}

interface ShotVisual {
  group: THREE.Group;
  bullet: THREE.Mesh;
  core: THREE.Mesh;
  muzzle: THREE.Mesh;
  muzzleCore: THREE.Mesh;
  impact: THREE.Mesh;
  event: ShotFlight;
  endpoint: ShotEndpoint;
  seen: boolean;
}

function muzzleGeometry(): THREE.BufferGeometry {
  const outline = [[0, 0], [13, 9], [9, 17], [28, 10], [38, 18], [35, 6],
    [54, 0], [35, -6], [38, -18], [25, -10], [9, -17], [13, -8]];
  const triangles = THREE.ShapeUtils.triangulateShape(outline.map(([x, y]) => new THREE.Vector2(x, y)), []);
  const positions: number[] = [];
  for (const crossed of [false, true]) for (const triangle of triangles) for (const index of triangle) {
    const [x, radius] = outline[index];
    positions.push(x, crossed ? 0 : radius, crossed ? radius : 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Short moving tracers, sampled from replay time and independent of the shooter. */
export class ReplayShots {
  readonly group = new THREE.Group();
  readonly activeVisuals = new Map<string, ShotVisual>();
  private readonly pool: ShotVisual[] = [];
  private readonly geometry = {
    bullet: new THREE.CylinderGeometry(0.72, 1, 1, 6).rotateZ(-Math.PI / 2).translate(0.5, 0, 0),
    muzzle: muzzleGeometry(),
    impact: new THREE.OctahedronGeometry(1),
  };
  private readonly materials = new Map<number, {
    bullet: THREE.MeshBasicMaterial; core: THREE.MeshBasicMaterial;
    muzzle: THREE.MeshBasicMaterial; muzzleCore: THREE.MeshBasicMaterial;
  }>();
  private readonly axis = new THREE.Vector3(1, 0, 0);
  private readonly direction = new THREE.Vector3();
  private source?: ShotFlights;
  private collisionQuery?: ShotRenderOptions['shotDistanceAt'];
  private endpoints = new WeakMap<ShotFlight, ShotEndpoint>();
  private metadata?: ReplayMeta;
  private readonly teams = new Map<number, number>();

  constructor() {
    this.group.name = 'flying-bullets';
    for (const [team, color, coreColor] of [[2, 0xf4c542, 0xfff3b0], [3, 0x459eed, 0xc7edff], [0, 0xaaaaaa, 0xffffff]]) {
      this.materials.set(team, {
        bullet: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.86, depthWrite: false, toneMapped: false }),
        core: new THREE.MeshBasicMaterial({ color: coreColor, transparent: true, depthWrite: false, toneMapped: false }),
        muzzle: new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, depthWrite: false, toneMapped: false, forceSinglePass: true }),
        muzzleCore: new THREE.MeshBasicMaterial({ color: coreColor, side: THREE.DoubleSide, transparent: true, depthWrite: false, toneMapped: false, forceSinglePass: true }),
      });
    }
  }

  private createVisual(event: ShotFlight, endpoint: ShotEndpoint): ShotVisual {
    const group = new THREE.Group();
    const material = this.materials.get(0)!;
    const bullet = new THREE.Mesh(this.geometry.bullet, material.bullet);
    const core = new THREE.Mesh(this.geometry.bullet, material.core);
    const muzzle = new THREE.Mesh(this.geometry.muzzle, material.muzzle);
    const muzzleCore = new THREE.Mesh(this.geometry.muzzle, material.muzzleCore);
    const impact = new THREE.Mesh(this.geometry.impact, material.core);
    core.renderOrder = 4;
    bullet.renderOrder = 5;
    muzzle.renderOrder = 6;
    muzzleCore.renderOrder = impact.renderOrder = 7;
    muzzle.position.x = muzzleCore.position.x = event.muzzleOffset;
    for (const mesh of [bullet, core, muzzle, muzzleCore, impact]) {
      mesh.raycast = () => undefined;
      group.add(mesh);
    }
    this.group.add(group);
    return { group, bullet, core, muzzle, muzzleCore, impact, event, endpoint, seen: true };
  }

  private endpoint(event: ShotFlight, query: ShotRenderOptions['shotDistanceAt']): ShotEndpoint {
    const cached = this.endpoints.get(event);
    if (cached) return cached;
    const endpoint: ShotEndpoint = { distance: SHOT_RANGE, kind: 'range' };
    if (event.hit && event.hit.distance < endpoint.distance) {
      endpoint.distance = Math.max(0, event.hit.distance);
      endpoint.kind = 'player';
      endpoint.playerId = event.hit.playerId;
    }
    const wall = query?.(event.origin, event.direction, endpoint.distance);
    if (wall !== undefined && Number.isFinite(wall) && wall >= 0 && wall <= endpoint.distance) {
      endpoint.distance = wall;
      endpoint.kind = 'wall';
      endpoint.playerId = undefined;
    }
    this.endpoints.set(event, endpoint);
    return endpoint;
  }

  update(index: ShotFlights | undefined, round: number, options: ShotRenderOptions): void {
    if (index !== this.source || options.shotDistanceAt !== this.collisionQuery) {
      for (const visual of this.activeVisuals.values()) { visual.group.visible = false; this.pool.push(visual); }
      this.activeVisuals.clear();
      this.endpoints = new WeakMap();
      this.source = index;
      this.collisionQuery = options.shotDistanceAt;
    }
    if (options.replayMeta !== this.metadata) {
      this.metadata = options.replayMeta;
      this.teams.clear();
      for (const player of options.replayMeta?.serverPlayer || []) this.teams.set(player.id, player.team);
    }
    for (const visual of this.activeVisuals.values()) visual.seen = false;
    const hidden = new Set(options.hiddenPlayerIds);
    for (const event of index?.active(round, options.currentTimeMs) || []) {
      if (hidden.has(event.shooterId)) continue;
      const endpoint = this.endpoint(event, options.shotDistanceAt);
      const age = options.currentTimeMs - event.timeMs;
      const muzzleOffset = event.muzzleOffset;
      const flightDuration = Math.max(0, endpoint.distance - muzzleOffset) / SHOT_SPEED;
      const duration = Math.max(MUZZLE_DURATION_MS, flightDuration + (endpoint.kind === 'range' ? 0 : IMPACT_DURATION_MS));
      if (age < 0 || age >= duration || options.currentTimeMs >= event.endTimeMs) continue;
      let visual = this.activeVisuals.get(event.key);
      if (!visual) {
        visual = this.pool.pop() || this.createVisual(event, endpoint);
        this.activeVisuals.set(event.key, visual);
      }
      visual.event = event;
      visual.muzzle.position.x = visual.muzzleCore.position.x = muzzleOffset;
      visual.endpoint = endpoint;
      visual.seen = true;
      visual.group.name = `shot-${event.key}`;
      visual.group.visible = true;
      visual.group.position.set(event.origin.x, event.origin.y, event.origin.z);
      this.direction.set(event.direction.x, event.direction.y, event.direction.z);
      visual.group.quaternion.setFromUnitVectors(this.axis, this.direction);
      const team = getDisplayTeam(this.teams.get(event.shooterId) ?? event.team, event.round);
      const material = this.materials.get(team) || this.materials.get(0)!;
      visual.bullet.material = material.bullet;
      visual.core.material = visual.impact.material = material.core;
      visual.muzzle.material = material.muzzle;
      visual.muzzleCore.material = material.muzzleCore;

      // Only a short segment travels with the head. It never stretches back to
      // the player's current position and survives subsequent non-firing frames.
      const head = Math.min(endpoint.distance, muzzleOffset + age * SHOT_SPEED);
      const tail = Math.max(muzzleOffset, head - 64);
      visual.bullet.position.x = visual.core.position.x = tail;
      visual.bullet.scale.set(Math.max(0, head - tail), 5.5, 5.5);
      visual.core.scale.set(Math.max(0, head - tail), 2.1, 2.1);
      visual.bullet.visible = visual.core.visible = head > muzzleOffset && age < flightDuration;
      const muzzleSpace = Math.max(0, endpoint.distance - muzzleOffset);
      visual.muzzle.visible = visual.muzzleCore.visible = age < MUZZLE_DURATION_MS && muzzleSpace > 0;
      const flare = 0.55 + 0.45 * Math.max(0, 1 - age / MUZZLE_DURATION_MS) ** 2;
      const flameLength = Math.min(flare, muzzleSpace / 54);
      visual.muzzle.scale.set(flameLength, flare, flare);
      visual.muzzleCore.scale.set(flameLength * 0.7, flare * 0.58, flare * 0.58);
      const impactAge = age - flightDuration;
      visual.impact.visible = endpoint.kind !== 'range' && impactAge >= 0 && impactAge < IMPACT_DURATION_MS;
      visual.impact.position.x = endpoint.distance;
      visual.impact.scale.setScalar(7 + Math.max(0, impactAge / IMPACT_DURATION_MS) * 11);
    }
    for (const [key, visual] of this.activeVisuals) if (!visual.seen) {
      visual.group.visible = false;
      this.activeVisuals.delete(key);
      this.pool.push(visual);
    }
  }

  dispose(): void {
    for (const geometry of Object.values(this.geometry)) geometry.dispose();
    for (const set of this.materials.values()) for (const material of Object.values(set)) material.dispose();
    this.activeVisuals.clear();
    this.pool.length = 0;
    this.group.clear();
    this.teams.clear();
    this.source = undefined;
    this.endpoints = new WeakMap();
  }
}
