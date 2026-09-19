import * as THREE from 'three';
import type { Frame, PlayerInfo, ProjectileRenderConfig, ProjectileState, ReplayMeta } from '@/types/replay';
import { getDisplayTeam } from '@/config/game';
import { demoToScene } from './sampleReplayFrame';
import { trailPointCount, type ProjectileTrail, type ProjectileTrails } from './projectileTrails';
import type { PlayerDeaths } from './playerDeaths';
import { effectGrowth, type ProjectileEffectStarts } from './projectileEffects';
import type { ShotFlights } from './shotFlights';
import { ReplayShots, type ShotRenderOptions } from './replayShots';
import { projectileKind, projectileTypeId, resolveProjectileTeam, PROJECTILE_TEAM_STYLES, projectileEffectDefaults } from './projectileStyle';

export interface EntityOptions extends ShotRenderOptions {
  replayMeta?: ReplayMeta;
  hiddenPlayerIds?: number[];
  projectileConfigs?: Record<number, ProjectileRenderConfig>;
  showMapProjectiles?: boolean;
  showMapDropped?: boolean;
  showMapBomb?: boolean;
  grenadeTrackingEnabled?: boolean;
  playerScale?: number;
  nameScale?: number;
  currentTimeMs: number;
  projectileTrails?: ProjectileTrails;
  playerDeaths?: PlayerDeaths;
  projectileEffectStarts?: ProjectileEffectStarts;
  shotFlights?: ShotFlights;
  groundHeightAt?: (point: { x: number; y: number; z: number }) => number | undefined;
}

interface PlayerVisual {
  group: THREE.Group;
  body: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  bearing: THREE.Group;
  fieldOfView: THREE.Mesh;
  corpse: THREE.Group;
  fragments: THREE.InstancedMesh;
  deathPose?: string;
  deathGroundOffset: number;
  deathSampleTime?: number;
  deathSampleScale?: number;
  c4: THREE.Mesh;
  selection: THREE.Mesh;
  label: THREE.Sprite;
  labelText: string;
  labelPixels: { width: number; height: number };
}

interface ProjectileVisual {
  group: THREE.Group;
  marker: THREE.Mesh;
  hitArea: THREE.Mesh;
  effect: THREE.Mesh;
  burst: THREE.Group;
  blast: THREE.Mesh;
  shards: THREE.InstancedMesh;
  kind: string;
  team: number;
  line: THREE.Line;
  points: Float32Array;
  trail?: ProjectileTrail;
  trailHead: number;
  projectile: ProjectileState;
  seen: boolean;
}

const CT_COLOR = 0x559ccd;
const T_COLOR = 0xe2a16c;
const DEATH_DURATION_MS = 800;
const FRAGMENT_COUNT = 14;
const FIRE_INSTANCE_CAPACITY = 1024;
// Overlapping cone bases fill the area; the outer row defines its silhouette.
const FIRE_LAYERS = [
  { count: 1, radius: 0 }, { count: 6, radius: 0.22 },
  { count: 12, radius: 0.44 }, { count: 18, radius: 0.65 },
  { count: 24, radius: 0.875 },
];
function finitePosition(point: { x: number; y: number; z?: number }): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && (point.z === undefined || Number.isFinite(point.z));
}

/** A compact heading sector, not a collision-tested line-of-sight simulation. */
function createFieldOfViewGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const steps = 32, halfAngle = Math.PI / 4, radius = 165, innerRadius = 16;
  for (let i = 0; i <= steps; i++) {
    const angle = -halfAngle + i / steps * halfAngle * 2;
    for (const r of [innerRadius, radius]) {
      positions.push(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      uv.push((r - innerRadius) / (radius - innerRadius), 0.5);
    }
    if (i < steps) {
      const n = i * 2;
      indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function createFieldOfViewFade(): THREE.DataTexture {
  const pixels = new Uint8Array(32 * 4);
  for (let i = 0; i < 32; i++) pixels.set([255, 255, 255, Math.round(255 * (0.16 + 0.84 * (1 - i / 31) ** 0.8))], i * 4);
  const texture = new THREE.DataTexture(pixels, 32, 1, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Persistent render objects. Data changes update transforms, never the source replay. */
export class ReplayEntities {
  readonly group = new THREE.Group();
  readonly players = new Map<number, PlayerVisual>();
  readonly projectiles = new Map<number, ProjectileVisual>();
  readonly shots = new ReplayShots();
  readonly dropped: THREE.InstancedMesh;
  readonly smoke: THREE.InstancedMesh;
  readonly flames: THREE.InstancedMesh;
  readonly bomb: THREE.Group;
  private readonly geometry = {
    body: new THREE.CylinderGeometry(15, 18, 42, 10),
    head: new THREE.SphereGeometry(13, 10, 6),
    fieldOfView: createFieldOfViewGeometry(),
    fragment: new THREE.IcosahedronGeometry(1, 0),
    marker: new THREE.IcosahedronGeometry(13, 0),
    box: new THREE.BoxGeometry(12, 17, 11),
    ring: new THREE.RingGeometry(22, 27, 32),
    effect: new THREE.RingGeometry(0.86, 1, 40),
    particle: new THREE.IcosahedronGeometry(1, 1),
    flame: new THREE.ConeGeometry(1, 2, 6),
    dropped: new THREE.BoxGeometry(25, 8, 13),
  };
  private readonly ct: THREE.MeshToonMaterial;
  private readonly t: THREE.MeshToonMaterial;
  private readonly neutral: THREE.MeshToonMaterial;
  private readonly white: THREE.MeshToonMaterial;
  private readonly c4Material: THREE.MeshToonMaterial;
  private readonly fieldOfViewFade = createFieldOfViewFade();
  private readonly fieldsOfView = new Map<number, THREE.MeshBasicMaterial>();
  private readonly outline = new THREE.MeshBasicMaterial({ color: 0x2f4652, side: THREE.BackSide });
  private readonly hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  private readonly selectionMaterial = new THREE.MeshBasicMaterial({ color: 0xf4df9c, side: THREE.DoubleSide, depthWrite: false });
  private readonly projectileMaterials = new Map<number, THREE.MeshToonMaterial>();
  private readonly trajectoryMaterials = new Map<number, THREE.LineBasicMaterial>();
  private readonly instanceColor = new THREE.Color();
  private readonly matrixObject = new THREE.Object3D();
  private selectedPlayer: number | undefined;
  private selectedProjectile: number | undefined;
  private metadata?: ReplayMeta;
  private readonly metadataById = new Map<number, PlayerInfo>();
  private round = -1;
  private nameScale = 1;

  constructor(private readonly gradientMap: THREE.DataTexture) {
    this.group.name = 'replay-entities';
    this.ct = new THREE.MeshToonMaterial({ color: CT_COLOR, gradientMap });
    this.t = new THREE.MeshToonMaterial({ color: T_COLOR, gradientMap });
    this.neutral = new THREE.MeshToonMaterial({ color: 0x8a949a, gradientMap });
    this.white = new THREE.MeshToonMaterial({ color: 0xfff8d9, gradientMap });
    this.c4Material = new THREE.MeshToonMaterial({ color: 0xecc361, gradientMap });
    for (const [team, color] of [[3, CT_COLOR], [2, T_COLOR], [0, 0x999999]]) {
      this.fieldsOfView.set(team, new THREE.MeshBasicMaterial({
        color, map: this.fieldOfViewFade, transparent: true, opacity: 0.46,
        side: THREE.DoubleSide, depthWrite: false, polygonOffset: true,
        polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
    }
    for (const [team, style] of Object.entries(PROJECTILE_TEAM_STYLES)) {
      this.projectileMaterials.set(Number(team), new THREE.MeshToonMaterial({ color: style.trail, gradientMap }));
      this.trajectoryMaterials.set(Number(team), new THREE.LineBasicMaterial({ color: style.trail, transparent: true, opacity: 0.95, toneMapped: false }));
    }
    this.dropped = new THREE.InstancedMesh(this.geometry.dropped,
      new THREE.MeshToonMaterial({ color: 0xa7b4ba, gradientMap }), 256);
    this.dropped.name = 'dropped-equipment';
    this.dropped.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dropped.frustumCulled = false;
    this.dropped.count = 0;
    this.smoke = new THREE.InstancedMesh(this.geometry.particle,
      new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap, transparent: true, opacity: 0.5, depthWrite: false }), 256);
    this.smoke.name = 'smoke-volumes';
    this.smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.smoke.frustumCulled = false;
    this.smoke.count = 0;
    this.flames = new THREE.InstancedMesh(this.geometry.flame,
      new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap }), FIRE_INSTANCE_CAPACITY);
    this.flames.name = 'fire-volumes';
    this.flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flames.frustumCulled = false;
    this.flames.count = 0;
    this.bomb = new THREE.Group();
    this.bomb.name = 'bomb';
    const bombBox = new THREE.Mesh(new THREE.BoxGeometry(25, 18, 20), this.c4Material);
    bombBox.position.y = 12;
    bombBox.castShadow = true;
    const bombRing = new THREE.Mesh(this.geometry.ring, this.selectionMaterial);
    bombRing.rotation.x = -Math.PI / 2;
    bombRing.position.y = 3;
    this.bomb.add(bombBox, bombRing);
    this.bomb.visible = false;
    this.group.add(this.dropped, this.smoke, this.flames, this.bomb, this.shots.group);
  }

  private createPlayer(id: number): PlayerVisual {
    const group = new THREE.Group();
    group.name = `player-${id}`;
    group.userData.playerId = id;
    const body = new THREE.Group();
    const torso = new THREE.Mesh(this.geometry.body, this.neutral);
    torso.position.y = 29;
    torso.castShadow = true;
    const torsoOutline = new THREE.Mesh(this.geometry.body, this.outline);
    torsoOutline.position.copy(torso.position);
    torsoOutline.scale.set(1.08, 1.05, 1.08);
    const head = new THREE.Mesh(this.geometry.head, this.neutral);
    head.position.y = 60;
    head.castShadow = true;
    const headOutline = new THREE.Mesh(this.geometry.head, this.outline);
    headOutline.position.copy(head.position);
    headOutline.scale.setScalar(1.08);
    body.add(torsoOutline, torso, headOutline, head);
    const bearing = new THREE.Group();
    const fieldOfView = new THREE.Mesh(this.geometry.fieldOfView, this.fieldsOfView.get(0));
    fieldOfView.name = `player-fov-${id}`;
    // A low, horizontal heading cue clears minor NAV/foot-height differences
    // and shallow ramps without adding a ground raycast per player per frame.
    fieldOfView.position.y = 28;
    fieldOfView.raycast = () => undefined;
    bearing.add(fieldOfView);
    body.add(bearing);
    const c4 = new THREE.Mesh(this.geometry.box, this.c4Material);
    c4.position.set(-19, 30, 0);
    body.add(c4);
    const corpse = new THREE.Group();
    const fragments = new THREE.InstancedMesh(this.geometry.fragment, this.neutral, FRAGMENT_COUNT);
    fragments.name = `death-fragments-${id}`;
    fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fragments.frustumCulled = false;
    fragments.castShadow = true;
    fragments.receiveShadow = true;
    corpse.add(fragments);
    const selection = new THREE.Mesh(this.geometry.ring, this.selectionMaterial);
    selection.rotation.x = -Math.PI / 2;
    selection.position.y = 3;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
    label.center.set(0.5, 0);
    label.position.y = 87;
    label.renderOrder = 20;
    label.raycast = () => undefined;
    group.add(body, corpse, selection, label);
    this.group.add(group);
    const visual: PlayerVisual = { group, body, torso, head, bearing, fieldOfView, corpse, fragments,
      deathGroundOffset: 0, c4, selection, label, labelText: '', labelPixels: { width: 80, height: 18 } };
    this.players.set(id, visual);
    return visual;
  }

  private updateName(visual: PlayerVisual, name: string): void {
    if (visual.labelText === name) return;
    visual.labelText = name;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    context.font = '600 32px system-ui, sans-serif';
    canvas.width = Math.min(560, Math.max(70, Math.ceil(context.measureText(name).width + 24)));
    canvas.height = 50;
    context.font = '600 32px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 5;
    context.lineJoin = 'round';
    context.strokeStyle = '#273e48';
    context.fillStyle = '#faf8ef';
    context.strokeText(name, canvas.width / 2, 25, canvas.width - 16);
    context.fillText(name, canvas.width / 2, 25, canvas.width - 16);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = visual.label.material as THREE.SpriteMaterial;
    material.map?.dispose();
    material.map = texture;
    material.needsUpdate = true;
    visual.labelPixels = { width: canvas.width / 2.4, height: canvas.height / 2.4 };
  }

  private createProjectile(id: number, projectile: ProjectileState): ProjectileVisual {
    const kind = projectileKind(projectile.type);
    const group = new THREE.Group();
    group.name = `projectile-${id}`;
    group.userData.projectileId = id;
    const marker = new THREE.Mesh(this.geometry.marker, this.projectileMaterials.get(0));
    marker.castShadow = true;
    const hull = new THREE.Mesh(this.geometry.marker, this.outline);
    hull.scale.setScalar(1.13);
    marker.add(hull);
    const effect = new THREE.Mesh(this.geometry.effect, new THREE.MeshBasicMaterial({
      color: 0x999999, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    }));
    effect.rotation.x = -Math.PI / 2;
    effect.position.y = 6;
    const hitArea = new THREE.Mesh(this.geometry.particle, this.hitMaterial);
    hitArea.scale.setScalar(26);
    const burst = new THREE.Group();
    burst.visible = false;
    const blast = new THREE.Mesh(this.geometry.fragment, new THREE.MeshToonMaterial({
      color: 0x777777, gradientMap: this.gradientMap, transparent: true, opacity: 0.7, depthWrite: false,
    }));
    blast.name = `he-blast-${id}`;
    const shards = new THREE.InstancedMesh(this.geometry.fragment, blast.material, 8);
    shards.name = `he-shards-${id}`;
    shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shards.frustumCulled = false;
    burst.add(blast, shards);
    for (const mesh of [blast, shards]) mesh.raycast = () => undefined;
    group.add(marker, effect, hitArea, burst);
    const points = new Float32Array(128 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(points, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const line = new THREE.Line(geometry, this.trajectoryMaterials.get(0));
    line.name = `trajectory-${id}`;
    line.frustumCulled = false;
    line.userData.projectileId = id;
    this.group.add(group, line);
    const visual = { group, marker, hitArea, effect, burst, blast, shards,
      kind, team: 0, line, points, projectile, trailHead: -1, seen: true };
    this.projectiles.set(id, visual);
    return visual;
  }

  private updateTrajectory(visual: ProjectileVisual, proj: ProjectileState, trail: ProjectileTrail | undefined, timeMs: number): void {
    if (!trail) { visual.line.visible = false; return; }
    const reached = trailPointCount(trail, timeMs);
    const capacityNeeded = trail.times.length + 1;
    if (capacityNeeded * 3 > visual.points.length) {
      const capacity = Math.max(capacityNeeded, visual.points.length / 3 * 2);
      visual.points = new Float32Array(capacity * 3);
      // Replacing a GPU buffer only at capacity growth, not on every replay sample.
      visual.line.geometry.dispose();
      visual.line.geometry = new THREE.BufferGeometry();
      visual.line.geometry.setAttribute('position', new THREE.BufferAttribute(visual.points, 3).setUsage(THREE.DynamicDrawUsage));
      visual.trail = undefined;
    }
    const attribute = visual.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    attribute.clearUpdateRanges();
    if (visual.trail !== trail) {
      visual.points.set(trail.positions);
      visual.trail = trail;
      attribute.addUpdateRange(0, capacityNeeded * 3);
    } else if (visual.trailHead >= 0 && visual.trailHead < trail.times.length) {
      // Restore the source point previously occupied by the live tip. This also
      // makes backwards scrubbing exact without rebuilding or accumulating a trail.
      const offset = visual.trailHead * 3;
      visual.points.set(trail.positions.subarray(offset, offset + 3), offset);
      attribute.addUpdateRange(offset, 3);
    }
    const end = demoToScene(proj.x, proj.y, proj.z);
    visual.points[reached * 3] = end.x;
    visual.points[reached * 3 + 1] = end.y;
    visual.points[reached * 3 + 2] = end.z;
    visual.trailHead = reached;
    attribute.addUpdateRange(reached * 3, 3);
    attribute.needsUpdate = true;
    visual.line.geometry.setDrawRange(0, reached + 1);
    visual.line.geometry.boundingSphere = null;
    visual.line.visible = reached > 0;
  }

  private deleteProjectile(id: number, visual: ProjectileVisual): void {
    this.group.remove(visual.group, visual.line);
    visual.line.geometry.dispose();
    (visual.effect.material as THREE.Material).dispose();
    (visual.blast.material as THREE.Material).dispose();
    visual.shards.dispose();
    this.projectiles.delete(id);
  }

  private updateDeath(visual: PlayerVisual, id: number, elapsedMs: number, scale: number): void {
    // Everything is sampled from replay time. Pausing, backwards seeking and
    // entering a round halfway through never launch a new wall-clock animation.
    const sampleTime = Math.max(0, Math.min(DEATH_DURATION_MS, elapsedMs));
    if (visual.deathSampleTime === sampleTime && visual.deathSampleScale === scale) return;
    visual.deathSampleTime = sampleTime;
    visual.deathSampleScale = scale;
    const elapsed = sampleTime / 1000;
    const floor = visual.deathGroundOffset / scale;
    for (let i = 0; i < FRAGMENT_COUNT; i++) {
      const seed = ((Math.imul(id + 1, 1664525) + Math.imul(i + 1, 1013904223)) >>> 0) / 0xffffffff;
      const angle = i * 2.3999632297 + seed * Math.PI * 2;
      const head = i >= 12;
      const initialY = head ? 60 : 15 + Math.floor(i / 4) * 14;
      const initialX = head ? (i === 12 ? -6 : 6) : Math.cos(i * Math.PI / 2) * 8;
      const initialZ = head ? 0 : Math.sin(i * Math.PI / 2) * 8;
      const duration = 0.44 + seed * 0.22;
      const t = Math.min(1, elapsed / duration);
      const travel = 1 - (1 - t) ** 2;
      const tumble = Math.min(1, elapsed / 0.8);
      const size = (head ? 11 : 10) * (1 - 0.38 * travel);
      // The primitive lives inside a unit sphere, so this bound keeps every
      // rotating fragment above the sampled floor, including mid-air deaths.
      const restingY = floor + size + 1;
      const arc = 10 + seed * 9;
      const bounce = elapsed > duration
        ? Math.sin(Math.PI * Math.min(1, (elapsed - duration) / (0.8 - duration))) * 3 : 0;
      this.matrixObject.position.set(
        initialX + Math.cos(angle) * (18 + seed * 24) * travel,
        Math.max(restingY, initialY * (1 - t) + restingY * t + 4 * arc * t * (1 - t)) + bounce,
        initialZ + Math.sin(angle) * (18 + seed * 24) * travel,
      );
      this.matrixObject.rotation.set((seed - 0.5) * 5 * tumble, angle * tumble, (i % 2 ? 1 : -1) * 2.2 * tumble);
      this.matrixObject.scale.set(size * 0.86, size * (head ? 1 : 0.76), size * 0.9);
      this.matrixObject.updateMatrix();
      visual.fragments.setMatrixAt(i, this.matrixObject.matrix);
    }
    visual.fragments.instanceMatrix.needsUpdate = true;
    visual.fragments.computeBoundingSphere();
  }

  update(frame: Frame | undefined, options: EntityOptions): void {
    this.group.visible = !!frame;
    if (!frame) return;
    this.shots.update(options.shotFlights, frame.round, options);
    if (options.replayMeta !== this.metadata) {
      this.metadata = options.replayMeta;
      this.metadataById.clear();
      for (const player of options.replayMeta?.serverPlayer || []) this.metadataById.set(player.id, player);
    }
    if (this.round !== frame.round) {
      for (const [id, visual] of this.projectiles) this.deleteProjectile(id, visual);
      this.round = frame.round;
      this.selectedProjectile = undefined;
    }
    this.nameScale = options.nameScale ?? 1;
    const hidden = new Set(options.hiddenPlayerIds);
    for (const visual of this.players.values()) visual.group.visible = false;
    for (const [key, player] of Object.entries(frame.players)) {
      const id = Number(key);
      if (hidden.has(id) || !finitePosition(player)) continue;
      const metadata = this.metadataById.get(id);
      const team = getDisplayTeam(metadata?.team ?? player.team ?? 0, frame.round);
      const visual = this.players.get(id) || this.createPlayer(id);
      const death = player.alive ? undefined : options.playerDeaths?.get(id, frame.round, options.currentTimeMs);
      const deathAge = death ? options.currentTimeMs - death.timeMs : DEATH_DURATION_MS;
      const p = death ? demoToScene(death.x, death.y, death.z) : demoToScene(player.x, player.y, player.z);
      visual.group.position.set(p.x, p.y, p.z);
      visual.group.visible = true;
      const scale = Math.max(0.1, options.playerScale ?? 1);
      visual.body.scale.setScalar(scale);
      visual.corpse.scale.setScalar(scale);
      visual.body.visible = player.alive;
      // Keep only the short break-up animation, never a persistent debris pile.
      visual.corpse.visible = !player.alive && deathAge >= 0 && deathAge < DEATH_DURATION_MS;
      const material = team === 3 ? this.ct : team === 2 ? this.t : this.neutral;
      visual.torso.material = material;
      visual.head.material = player.isBlinded || (player.flashDuration ?? 0) > 0 ? this.white : material;
      visual.fragments.material = material;
      visual.fieldOfView.material = this.fieldsOfView.get(team) || this.fieldsOfView.get(0)!;
      visual.fieldOfView.visible = player.alive;
      if (death && visual.corpse.visible) {
        const pose = `${frame.round}:${death.timeMs}:${p.x}:${p.y}:${p.z}`;
        if (pose !== visual.deathPose) {
          visual.deathPose = pose;
          visual.deathSampleTime = undefined;
          visual.deathGroundOffset = (options.groundHeightAt?.(p) ?? p.y) - p.y;
        }
        visual.corpse.rotation.y = THREE.MathUtils.degToRad(death.yaw);
        this.updateDeath(visual, id, deathAge, scale);
      } else if (player.alive) visual.deathPose = undefined;
      visual.bearing.rotation.y = THREE.MathUtils.degToRad(player.yaw || 0);
      visual.c4.visible = options.showMapBomb !== false && (player.inventory || []).some(item => item === '404' || item === 'c4');
      visual.selection.visible = id === this.selectedPlayer && (player.alive || visual.corpse.visible);
      visual.selection.scale.setScalar(scale);
      visual.label.visible = player.alive;
      visual.label.position.y = 78 * scale;
      if (player.alive) this.updateName(visual, metadata?.name || player.name || `#${id}`);
    }

    let smokeCount = 0;
    let flameCount = 0;
    for (const visual of this.projectiles.values()) {
      visual.seen = false;
      visual.group.visible = visual.line.visible = false;
    }
    for (const [key, projectile] of Object.entries(frame.projectiles || {})) {
      if (options.showMapProjectiles === false || hidden.has(projectile.throwerID)
        || !finitePosition(projectile) || (projectile.ttl ?? 0) < 0) continue;
      const id = Number(key);
      const visual = this.projectiles.get(id) || this.createProjectile(id, projectile);
      visual.seen = true;
      visual.projectile = projectile;
      visual.group.visible = true;
      const p = demoToScene(projectile.x, projectile.y, projectile.z);
      visual.group.position.set(p.x, p.y, p.z);
      const kind = projectileKind(projectile.type);
      const team = resolveProjectileTeam(projectile.throwerID, frame, this.metadataById);
      const style = PROJECTILE_TEAM_STYLES[team];
      visual.kind = kind;
      visual.team = team;
      // Team owns every trail/effect hue, including direct seeks and reused IDs.
      visual.marker.material = this.projectileMaterials.get(team)!;
      visual.line.material = this.trajectoryMaterials.get(team)!;
      const ring = visual.effect.material as THREE.MeshBasicMaterial;
      ring.color.setHex(style.trail);
      (visual.blast.material as THREE.MeshToonMaterial).color.setHex(style.blast);
      visual.marker.visible = !projectile.isExploded;
      visual.marker.rotation.set(options.currentTimeMs / 450, options.currentTimeMs / 700, 0);
      visual.marker.scale.setScalar(this.selectedProjectile === id ? 1.45 : 1);
      visual.effect.visible = !!projectile.isExploded;
      visual.burst.visible = visual.blast.visible = visual.shards.visible = false;
      if (!projectile.isExploded) {
        visual.hitArea.scale.setScalar(26);
        visual.hitArea.position.y = 0;
        this.updateTrajectory(visual, projectile, options.projectileTrails?.get(id, frame.round, frame.timeMs), options.currentTimeMs);
        visual.line.visible &&= options.grenadeTrackingEnabled !== false;
        continue;
      }
      visual.line.visible = false;
      const typeId = projectileTypeId(projectile.type);
      const config = typeId === undefined ? undefined
        : options.projectileConfigs?.[typeId] ?? options.replayMeta?.projectileRenderConfig?.[typeId];
      const defaults = projectileEffectDefaults(kind);
      const radius = Math.min(500, Math.max(20, (config?.explosionRadius ?? 0) > 0 ? config!.explosionRadius : defaults.radius));
      visual.hitArea.scale.set(radius, kind === 'smoke' ? radius : 16, radius);
      visual.hitArea.position.y = kind === 'smoke' ? radius * 0.6 : 6;
      const duration = (config?.durationInMs ?? 0) > 0 ? config!.durationInMs : defaults.durationMs;
      const elapsedSinceSample = Math.max(0, options.currentTimeMs - frame.timeMs);
      // Go omits ttl when it is zero. An exploded projectile without ttl is
      // expired, while the earlier flying branch deliberately needs no ttl.
      const remaining = THREE.MathUtils.clamp(((projectile.ttl ?? 0) - elapsedSinceSample) / Math.max(1, duration), 0, 1);
      if (remaining <= 0) {
        visual.group.visible = false;
        visual.effect.visible = false;
        continue;
      }
      const effectStart = options.projectileEffectStarts?.get(projectile);
      // Unknown clip-start effects are already established; never replay their birth.
      const effectAge = effectStart === undefined ? Infinity : Math.max(0, options.currentTimeMs - effectStart);
      if (kind === 'smoke') {
        visual.effect.visible = false;
        const bloomDuration = Math.min(900, duration * 0.6);
        const spread = effectGrowth(effectAge, bloomDuration);
        visual.hitArea.scale.multiplyScalar(spread);
        visual.hitArea.position.y *= spread;
        for (let i = 0; i < 7 && smokeCount < 256; i++) {
          const angle = i / 6 * Math.PI * 2;
          const offset = i === 6 ? 0 : radius * 0.46 * spread;
          const delay = i === 6 ? 0 : bloomDuration * (0.08 + (i % 3) * 0.04);
          const growth = effectGrowth(effectAge, bloomDuration - delay, delay);
          const breath = 1 + Math.sin(options.currentTimeMs / 1100 + id + i) * 0.025;
          const size = radius * (i === 6 ? 0.74 : 0.62) * breath * Math.min(1, remaining * 8) * growth;
          this.matrixObject.position.set(p.x + Math.cos(angle) * offset, p.y + radius * 0.65 * growth, p.z + Math.sin(angle) * offset);
          this.matrixObject.rotation.set(0, angle, 0);
          this.matrixObject.scale.set(size, size * 0.92, size);
          this.matrixObject.updateMatrix();
          this.smoke.setMatrixAt(smokeCount, this.matrixObject.matrix);
          this.smoke.setColorAt(smokeCount++, this.instanceColor.setHex(style.smoke));
        }
      } else if (kind === 'molotov' || kind === 'incendiary') {
        visual.effect.visible = false;
        const fade = Math.min(1, remaining * 8);
        const spreadDuration = Math.min(650, duration * 0.6);
        const spread = effectGrowth(effectAge, spreadDuration);
        visual.hitArea.scale.multiplyScalar(spread);
        let spike = 0;
        for (const [layerIndex, layer] of FIRE_LAYERS.entries()) {
          for (let i = 0; i < layer.count && flameCount < FIRE_INSTANCE_CAPACITY; i++, spike++) {
            const angle = i / layer.count * Math.PI * 2 + id * 0.37 + (layerIndex % 2) * Math.PI / layer.count;
            const distance = layer.radius * radius * spread;
            // A radial ignition wave fills the center first, then the dense perimeter.
            const delay = spreadDuration * layer.radius * 0.6;
            const growth = effectGrowth(effectAge, spreadDuration - delay, delay);
            const size = radius * 0.125 * fade * growth;
            const height = (22 - layer.radius * 5 + Math.sin(options.currentTimeMs / 140 + spike * 2 + id) * 6) * fade * growth;
            this.matrixObject.position.set(p.x + Math.cos(angle) * distance, p.y + height, p.z + Math.sin(angle) * distance);
            this.matrixObject.rotation.set(0, angle, 0);
            this.matrixObject.scale.set(size, height, size);
            this.matrixObject.updateMatrix();
            this.flames.setMatrixAt(flameCount, this.matrixObject.matrix);
            this.flames.setColorAt(flameCount++, this.instanceColor.setHex(style.fire));
          }
        }
      } else if (kind === 'hegrenade') {
        // HE is a short volumetric blast; no ground ring or lingering footprint.
        const progress = Math.min(1, duration * (1 - remaining) / 650);
        visual.effect.visible = false;
        if (progress >= 1) { visual.group.visible = false; continue; }
        const spread = Math.sqrt(progress);
        visual.burst.visible = true;
        visual.blast.visible = visual.shards.visible = true;
        visual.blast.position.y = radius * 0.24;
        visual.blast.scale.set(radius * (0.16 + 0.42 * spread), radius * (0.2 + 0.24 * spread), radius * (0.16 + 0.42 * spread));
        (visual.blast.material as THREE.MeshToonMaterial).opacity = 0.8 * (1 - progress);
        for (let i = 0; i < 8; i++) {
          const angle = i * Math.PI / 4 + id * 0.37;
          const distance = radius * spread * (0.55 + (i % 3) * 0.1);
          const size = radius * 0.06 * (1 - progress * 0.65);
          this.matrixObject.position.set(Math.cos(angle) * distance,
            size + Math.sin(progress * Math.PI) * radius * (0.26 + (i % 2) * 0.16), Math.sin(angle) * distance);
          this.matrixObject.rotation.set(progress * 5 + i, angle, progress * 3);
          this.matrixObject.scale.set(size, size * 0.8, size);
          this.matrixObject.updateMatrix();
          visual.shards.setMatrixAt(i, this.matrixObject.matrix);
        }
        visual.shards.instanceMatrix.needsUpdate = true;
      } else if (kind === 'flash') {
        // Flash is a clean outward pulse on the ground, fading as it expands.
        const progress = 1 - remaining;
        visual.effect.scale.setScalar(radius * (0.12 + 0.88 * Math.sqrt(progress)));
        ring.opacity = 0.85 * remaining ** 1.4;
      } else {
        const progress = 1 - remaining;
        visual.effect.scale.setScalar(radius * (0.2 + Math.sqrt(progress) * 0.8));
        ring.opacity = Math.max(0, 0.85 * remaining);
      }
    }
    // Keep unseen meshes within a round for scrubbing, but bound the pool over long/custom clips.
    if (this.projectiles.size > 128) {
      for (const [id, visual] of this.projectiles) if (!visual.seen) this.deleteProjectile(id, visual);
    }
    this.smoke.count = smokeCount;
    this.flames.count = flameCount;
    this.smoke.instanceMatrix.needsUpdate = smokeCount > 0;
    this.flames.instanceMatrix.needsUpdate = flameCount > 0;
    if (this.smoke.instanceColor) this.smoke.instanceColor.needsUpdate = smokeCount > 0;
    if (this.flames.instanceColor) this.flames.instanceColor.needsUpdate = flameCount > 0;
    let droppedCount = 0;
    if (options.showMapDropped !== false) for (const equipment of frame.droppedEquipment || []) {
      if (droppedCount >= 256 || !finitePosition(equipment)) continue;
      const p = demoToScene(equipment.x, equipment.y, equipment.z);
      this.matrixObject.position.set(p.x, p.y + 5, p.z);
      this.matrixObject.rotation.set(0, 0, 0);
      this.matrixObject.scale.set(1, 1, 1);
      this.matrixObject.updateMatrix();
      this.dropped.setMatrixAt(droppedCount++, this.matrixObject.matrix);
    }
    this.dropped.count = droppedCount;
    this.dropped.instanceMatrix.needsUpdate = droppedCount > 0;
    const bomb = frame.bomb;
    this.bomb.visible = options.showMapBomb !== false && !!bomb && finitePosition(bomb)
      && ['dropped', 'planted', 'defusing', 'defused'].includes(bomb.state);
    if (bomb && this.bomb.visible) {
      const p = demoToScene(bomb.x, bomb.y, bomb.z);
      this.bomb.position.set(p.x, p.y, p.z);
      const ring = this.bomb.children[1];
      ring.visible = bomb.isPlanted;
      ring.scale.setScalar(bomb.state === 'defused' ? 1 : 1 + 0.14 * Math.sin(options.currentTimeMs / 220));
    }
  }

  updateLabels(worldUnitsPerPixel: number): void {
    for (const visual of this.players.values()) {
      if (!visual.group.visible || !visual.label.visible) continue;
      visual.label.scale.set(visual.labelPixels.width * worldUnitsPerPixel * this.nameScale,
        visual.labelPixels.height * worldUnitsPerPixel * this.nameScale, 1);
    }
  }

  select(playerId?: number, projectileId?: number): void {
    this.selectedPlayer = playerId;
    this.selectedProjectile = projectileId;
    for (const [id, visual] of this.players) visual.selection.visible = id === playerId && (visual.body.visible || visual.corpse.visible);
    for (const [id, visual] of this.projectiles) visual.marker.scale.setScalar(id === projectileId ? 1.45 : 1);
  }

  /** Resources unattached to the scene (e.g. cached materials) need explicit disposal too. */
  dispose(): void {
    this.shots.dispose();
    for (const geometry of Object.values(this.geometry)) geometry.dispose();
    for (const material of [this.ct, this.t, this.neutral, this.white, this.c4Material,
      this.outline, this.hitMaterial, this.selectionMaterial,
      ...this.fieldsOfView.values(), ...this.projectileMaterials.values(), ...this.trajectoryMaterials.values()]) material.dispose();
    this.fieldOfViewFade.dispose();
    this.players.clear();
    this.projectiles.clear();
    this.metadataById.clear();
  }
}
