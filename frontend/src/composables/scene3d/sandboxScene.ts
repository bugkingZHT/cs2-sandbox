import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Frame, ProjectileState } from '@/types/replay';
import { buildMapGeometry, createToonGradient, type MapGeometryData } from './mapGeometry';
import { ReplayEntities, type EntityOptions } from './replayEntities';
import { createSkyBackground } from './mapArt';
import { getMapArt } from './mapCatalog';
import { demoToScene, demoDirectionToScene, PLAYER_EYE_HEIGHT } from './sampleReplayFrame';

const DEFAULT_ZOOM = 1.5;
const ZOOM_RESPONSE_MS = 85;
const MAX_FLASH_OPACITY = 0.9;

/** Shared renderer and clock-driven entities for orbit and player-eye views. */
export class SandboxScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-3000, 3000, 3000, -3000, 1, 50000);
  readonly eyeCamera = new THREE.PerspectiveCamera(74, 1, 1, 50000);
  followPlayerId: number | undefined;
  private floorView: 'upper' | 'middle' | 'lower' = 'upper';
  private readonly eyeDirection = new THREE.Vector3();
  get activeCamera(): THREE.Camera { return this.followPlayerId === undefined ? this.camera : this.eyeCamera; }
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly entities: ReplayEntities;
  // Clip-space overlay stays inside the WebGL canvas, including recordings and
  // drawing snapshots. No render target, postprocessing stack or external texture.
  readonly flashOverlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform float opacity; void main() { gl_FragColor = vec4(vec3(0.91), opacity); }',
    toneMapped: false,
  }));
  private readonly gradient = createToonGradient();
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.9);
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundRaycaster = new THREE.Raycaster();
  private readonly groundMeshes: THREE.Mesh[] = [];
  private readonly groundHits: THREE.Intersection[] = [];
  private readonly shotRaycaster = new THREE.Raycaster();
  private readonly shotMeshes: THREE.Mesh[] = [];
  private readonly shotHits: THREE.Intersection[] = [];
  private readonly shotQueryMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  private readonly pointer = new THREE.Vector2();
  private readonly resizeObserver: ResizeObserver;
  private readonly center = new THREE.Vector3();
  private bounds = new THREE.Box3(new THREE.Vector3(-2000, -200, -2000), new THREE.Vector3(2000, 500, 2000));
  private extent = 4500;
  private width = 1;
  private height = 1;
  private mapTriangles = 0;
  private map?: THREE.Group;
  private mapName = '';
  private mapSectionPlanes: THREE.Plane[] = [];
  private sectionMaterials = new WeakSet<THREE.Material>();
  private dirty = true;
  private disposed = false;
  private pointerDown?: { x: number; y: number; button: number };
  private focus?: { target: THREE.Vector3; started: number; from: THREE.Vector3; duration: number };
  private zoomTarget?: number;
  private zoomUpdatedAt = 0;
  projectileAnalysisEnabled = true;

  constructor(private readonly host: HTMLElement, private readonly onProjectileClick: (projectile: ProjectileState) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.setAttribute('aria-label', '三维战术沙盘：单击地图平滑居中，拖拽旋转，右键或中键平移，滚轮缩放，双击实体聚焦');
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    this.host.appendChild(this.renderer.domElement);
    this.scene.background = createSkyBackground();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb7b7b7, 1.75));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 2;
    this.sun.shadow.radius = 4;
    this.sun.shadow.intensity = 0.24;
    this.scene.add(this.sun, this.sun.target);
    this.entities = new ReplayEntities(this.gradient);
    this.scene.add(this.entities.group);
    this.flashOverlay.name = 'first-person-flash';
    this.flashOverlay.frustumCulled = false;
    this.flashOverlay.renderOrder = 100000;
    this.flashOverlay.visible = false;
    this.flashOverlay.raycast = () => undefined;
    this.scene.add(this.flashOverlay);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.rotateSpeed = 0.65;
    this.controls.panSpeed = 0.8;
    this.controls.zoomSpeed = 0.8;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.1;
    this.controls.minZoom = 0.5;
    this.controls.maxZoom = 9;
    this.controls.screenSpacePanning = true;
    this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    this.controls.addEventListener('start', this.cancelFocus);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener('dblclick', this.onDoubleClick);
    this.renderer.domElement.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.resetView();
  }

  setMap(data: MapGeometryData): void {
    if (this.map) throw new Error('A sandbox scene accepts one map; recreate it when changing maps.');
    if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose();
    this.scene.background = createSkyBackground(getMapArt(data.mapName));
    this.mapName = data.mapName;
    const map = buildMapGeometry(data);
    this.map = map.group;
    this.mapTriangles = map.triangles;
    this.scene.add(map.group);
    map.group.updateWorldMatrix(true, true);
    map.group.traverse(object => {
      if (object instanceof THREE.Mesh && (object.name === 'map-ground' || object.name === 'map-terrain')) {
        this.groundMeshes.push(object);
      }
      if (object instanceof THREE.Mesh && object.userData.mapSurface === true && object.userData.blocksShots !== false) {
        // Query both sides without altering the displayed wall material. These
        // geometry-sharing meshes never join the scene or allocate GPU buffers.
        const query = new THREE.Mesh(object.geometry, this.shotQueryMaterial);
        query.visible = false;
        query.matrixAutoUpdate = false;
        query.matrixWorldAutoUpdate = false;
        query.matrixWorld.copy(object.matrixWorld);
        this.shotMeshes.push(query);
      }
    });
    this.bounds = map.bounds;
    this.extent = map.extent;
    this.bounds.getCenter(this.center);
    this.sun.position.set(this.center.x - this.extent * 0.4, this.center.y + this.extent * 1.1, this.center.z + this.extent * 0.65);
    this.sun.target.position.copy(this.center);
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = shadowCamera.bottom = -this.extent * 0.72;
    shadowCamera.right = shadowCamera.top = this.extent * 0.72;
    shadowCamera.near = 1;
    shadowCamera.far = this.extent * 4;
    shadowCamera.updateProjectionMatrix();
    this.camera.far = this.extent * 12;
    this.resize();
    this.resetView();
    this.renderer.shadowMap.needsUpdate = true;
  }

  resize(): void {
    if (this.disposed) return;
    this.width = Math.max(1, this.host.clientWidth);
    this.height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    const aspect = this.width / this.height;
    const span = this.extent * 1.22 / Math.min(1, aspect);
    this.camera.left = -span * aspect / 2;
    this.camera.right = span * aspect / 2;
    this.camera.top = span / 2;
    this.camera.bottom = -span / 2;
    this.camera.updateProjectionMatrix();
    this.eyeCamera.aspect = aspect;
    this.eyeCamera.updateProjectionMatrix();
    this.dirty = true;
  }

  /** Preserve true world height; a section view removes occluding Nuke floors. */
  setFloorView(view: 'upper' | 'middle' | 'lower'): void {
    this.floorView = view;
    if (this.followPlayerId !== undefined) view = 'upper';
    // Upper is the complete model. Middle cuts buildings at standing height
    // above the main floor (-416 + 72), without slicing airborne game entities.
    this.renderer.clippingPlanes = this.mapName === 'de_nuke' && view === 'lower'
      ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), -480)] : [];
    this.mapSectionPlanes = this.mapName === 'de_nuke' && view === 'middle'
      ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), -344)] : this.renderer.clippingPlanes;
    this.renderer.localClippingEnabled = true;
    this.sectionMaterials = new WeakSet();
    this.updateSectionShadows();
    this.entities.select(undefined, undefined);
    this.renderer.shadowMap.needsUpdate = true;
    this.dirty = true;
  }

  resetView(): void {
    this.focus = undefined;
    this.zoomTarget = undefined;
    this.camera.zoom = DEFAULT_ZOOM;
    this.controls.target.copy(this.center);
    this.camera.position.copy(this.center).add(new THREE.Vector3(this.extent * 0.8, this.extent * 1.3, this.extent * 1.25));
    this.camera.lookAt(this.center);
    this.camera.updateProjectionMatrix();
    // Clear pending OrbitControls inertia as well as resetting the camera itself.
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.target.copy(this.center);
    this.camera.position.copy(this.center).add(new THREE.Vector3(this.extent * 0.8, this.extent * 1.3, this.extent * 1.25));
    this.camera.zoom = DEFAULT_ZOOM;
    this.controls.update();
    this.camera.updateProjectionMatrix();
    this.controls.enableDamping = damping;
    this.controls.saveState();
    this.dirty = true;
  }

  update(frame: Frame | undefined, options: EntityOptions): void {
    const requested = options.firstPersonPlayerId;
    const player = requested === undefined ? undefined : frame?.players[requested];
    const next = player?.alive && !options.hiddenPlayerIds?.includes(requested!)
      && [player.x, player.y, player.z, player.yaw, player.pitch ?? 0].every(Number.isFinite) ? requested : undefined;
    if (next !== this.followPlayerId) {
      if (this.followPlayerId === undefined && next !== undefined) {
        // Drain orbit inertia without moving the saved overview camera.
        const position = this.camera.position.clone(), rotation = this.camera.quaternion.clone();
        const target = this.controls.target.clone(), zoom = this.camera.zoom;
        const damping = this.controls.enableDamping;
        this.controls.enableDamping = false;
        this.controls.update();
        this.camera.position.copy(position); this.camera.quaternion.copy(rotation);
        this.camera.zoom = zoom; this.camera.updateProjectionMatrix();
        this.controls.target.copy(target); this.controls.enableDamping = damping;
      }
      this.focus = undefined;
      this.zoomTarget = undefined;
      this.followPlayerId = next;
      this.renderer.domElement.setAttribute('aria-label', next === undefined
        ? '三维战术沙盘：单击地图平滑居中，拖拽旋转，右键或中键平移，滚轮缩放，双击实体聚焦'
        : '第一人称回放视角：跟随玩家视线，按 Escape 返回沙盘');
      this.setFloorView(this.floorView);
    }
    if (next !== undefined && player) {
      // Replay records feet, not eye offsets. Use a stable standing eye height
      // independent of the sandbox's player-size preference.
      const position = demoToScene(player.x, player.y, player.z! + PLAYER_EYE_HEIGHT);
      this.eyeCamera.position.set(position.x, position.y, position.z);
      const direction = demoDirectionToScene(player.yaw, THREE.MathUtils.clamp(player.pitch ?? 0, -89.9, 89.9));
      this.eyeDirection.set(direction.x, direction.y, direction.z);
      this.eyeCamera.lookAt(this.eyeDirection.add(this.eyeCamera.position));
      this.eyeCamera.updateMatrixWorld();
    }
    const flash = next !== undefined && frame ? options.playerFlashes?.opacity(next, frame.round, options.currentTimeMs) ?? 0 : 0;
    this.flashOverlay.material.uniforms.opacity.value = flash * MAX_FLASH_OPACITY;
    this.flashOverlay.visible = flash > 0;
    this.entities.update(frame, { ...options, firstPersonPlayerId: next, groundHeightAt: this.groundHeightAt, shotDistanceAt: this.shotDistanceAt });
    if (this.renderer.clippingPlanes.length) this.updateSectionShadows();
    this.renderer.shadowMap.needsUpdate = true;
    this.dirty = true;
  }

  private updateSectionShadows(): void {
    const apply = (object: THREE.Object3D, planes: THREE.Plane[]) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (this.sectionMaterials.has(material)) continue;
        // Global planes clip the picture; shadow passes need local planes too,
        // otherwise hidden upper buildings leave ghost shadows on the lower floor.
        material.clippingPlanes = planes;
        material.clipShadows = true;
        material.needsUpdate = true;
        this.sectionMaterials.add(material);
      }
    };
    this.map?.traverse(object => apply(object, this.mapSectionPlanes));
    this.entities.group.traverse(object => { if (object.castShadow) apply(object, this.renderer.clippingPlanes); });
  }

  /** Scene-space ground below an entity; queried only when a death effect needs it. */
  private groundHeightAt = (point: { x: number; y: number; z: number }): number | undefined => {
    // Simplified infill can sit slightly above recorded feet at a step edge.
    // Include that support too, otherwise settled shards would stay in the floor.
    this.groundRaycaster.ray.origin.set(point.x, point.y + 32, point.z);
    this.groundRaycaster.ray.direction.set(0, -1, 0);
    this.groundHits.length = 0;
    this.groundRaycaster.intersectObjects(this.groundMeshes, false, this.groundHits);
    return this.groundHits[0]?.point.y;
  };

  /** Nearest real map surface, queried once when a shot flight is prepared. */
  private shotDistanceAt = (
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance: number,
  ): number | undefined => {
    if (this.disposed || !Number.isFinite(maxDistance) || maxDistance < 0
      || !Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z)
      || !Number.isFinite(direction.x) || !Number.isFinite(direction.y) || !Number.isFinite(direction.z)) return undefined;
    this.shotRaycaster.ray.origin.set(origin.x, origin.y, origin.z);
    this.shotRaycaster.ray.direction.set(direction.x, direction.y, direction.z);
    if (this.shotRaycaster.ray.direction.lengthSq() === 0) return undefined;
    this.shotRaycaster.ray.direction.normalize();
    // Start at the actor, not at the visible muzzle: a thin wall between those
    // points must stop the shot too. Double-sided queries also detect exits.
    this.shotRaycaster.near = 0;
    this.shotRaycaster.far = maxDistance;
    this.shotHits.length = 0;
    this.shotRaycaster.intersectObjects(this.shotMeshes, false, this.shotHits);
    const distance = this.shotHits[0]?.distance;
    return distance === undefined ? undefined : Math.max(0, distance);
  };

  render(): void {
    if (this.disposed || this.width < 2 || this.height < 2) return;
    if (!this.controls.enabled) {
      this.focus = undefined;
      this.zoomTarget = undefined;
    }
    if (this.zoomTarget !== undefined) {
      const now = performance.now();
      const dt = Math.min(64, Math.max(0, now - this.zoomUpdatedAt));
      this.zoomUpdatedAt = now;
      // Interpolate magnification in log space: equal wheel steps feel equal at
      // every distance, with a time-based response independent of refresh rate.
      const remaining = Math.log(this.zoomTarget / this.camera.zoom);
      this.camera.zoom *= Math.exp(remaining * (1 - Math.exp(-dt / ZOOM_RESPONSE_MS)));
      if (Math.abs(Math.log(this.zoomTarget / this.camera.zoom)) < 0.0001) {
        this.camera.zoom = this.zoomTarget;
        this.zoomTarget = undefined;
      }
      this.camera.updateProjectionMatrix();
      this.dirty = true;
    }
    if (this.focus) {
      const t = Math.min(1, (performance.now() - this.focus.started) / this.focus.duration);
      const nextTarget = this.focus.from.clone().lerp(this.focus.target, 1 - Math.pow(1 - t, 3));
      this.camera.position.add(nextTarget.clone().sub(this.controls.target));
      this.controls.target.copy(nextTarget);
      this.dirty = true;
      if (t === 1) this.focus = undefined;
    }
    const changed = this.controls.enabled && this.followPlayerId === undefined ? this.controls.update() : false;
    // Panning cannot lose the entire model beyond recovery.
    const target = this.controls.target;
    const clamped = target.clone();
    clamped.x = THREE.MathUtils.clamp(target.x, this.center.x - this.extent, this.center.x + this.extent);
    clamped.z = THREE.MathUtils.clamp(target.z, this.center.z - this.extent, this.center.z + this.extent);
    clamped.y = THREE.MathUtils.clamp(target.y, this.bounds.min.y - 300, this.bounds.max.y + 800);
    if (!clamped.equals(target)) {
      this.camera.position.add(clamped.clone().sub(target));
      target.copy(clamped);
      this.dirty = true;
    }
    if (!changed && !this.dirty) return;
    const unitsPerPixel = (this.camera.top - this.camera.bottom) / this.camera.zoom / this.height;
    this.entities.updateLabels(unitsPerPixel, this.followPlayerId === undefined ? undefined : this.eyeCamera, this.height);
    this.raycaster.params.Line = { threshold: unitsPerPixel * 5 };
    this.renderer.render(this.scene, this.activeCamera);
    this.dirty = false;
  }

  private cancelFocus = () => { this.focus = undefined; };

  private onPointerDown = (event: PointerEvent) => {
    // A new drag or touch gesture takes over from pending wheel motion.
    this.zoomTarget = undefined;
    this.pointerDown = { x: event.clientX, y: event.clientY, button: event.button };
  };

  private intersection(event: MouseEvent | PointerEvent, includeMap: boolean) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
      -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.activeCamera);
    const candidates: THREE.Object3D[] = [];
    for (const visual of this.entities.players.values()) if (visual.group.visible) candidates.push(visual.group);
    for (const visual of this.entities.projectiles.values()) {
      if (visual.group.visible) candidates.push(visual.group);
      if (visual.line.visible) candidates.push(visual.line);
    }
    if (includeMap && this.map) candidates.push(this.map);
    return this.raycaster.intersectObjects(candidates, true).find(hit => {
      if (this.renderer.clippingPlanes.some(plane => plane.distanceToPoint(hit.point) < 0)) return false;
      let object: THREE.Object3D | null = hit.object;
      while (object) {
        if (!object.visible || (object === this.map && this.mapSectionPlanes.some(plane => plane.distanceToPoint(hit.point) < 0))) return false;
        object = object.parent;
      }
      return true;
    });
  }

  private entityFor(object: THREE.Object3D) {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current.userData.playerId !== undefined) return { playerId: current.userData.playerId as number };
      if (current.userData.projectileId !== undefined) return { projectileId: current.userData.projectileId as number };
      current = current.parent;
    }
    return {} as { playerId?: number; projectileId?: number };
  }

  private onPointerUp = (event: PointerEvent) => {
    const start = this.pointerDown;
    this.pointerDown = undefined;
    if (!this.controls.enabled || !start || start.button !== 0 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const hit = this.intersection(event, false);
    const entity = hit ? this.entityFor(hit.object) : {};
    this.entities.select(entity.playerId, entity.projectileId);
    this.dirty = true;
    if (entity.projectileId !== undefined && this.projectileAnalysisEnabled) {
      const projectile = this.entities.projectiles.get(entity.projectileId)?.projectile;
      if (projectile) this.onProjectileClick(projectile);
    }
    if (entity.playerId === undefined && entity.projectileId === undefined) {
      const mapHit = this.intersection(event, true);
      if (mapHit) this.centerMapPoint(mapHit.point);
    }
  };

  private centerMapPoint(point: THREE.Vector3): void {
    const from = this.controls.target.clone();
    const viewOffset = this.camera.position.clone().sub(from);
    if (Math.abs(viewOffset.y) < 0.0001) return;
    // Intersect the clicked point's view line with the current target height.
    // Simply copying its X/Z would leave elevated surfaces off-center on screen.
    const target = point.clone().addScaledVector(viewOffset, (from.y - point.y) / viewOffset.y);
    target.y = from.y;
    const position = this.camera.position.clone(), zoom = this.camera.zoom;
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update(); // Drain previous rotation/pan inertia before translating.
    this.controls.target.copy(from);
    this.camera.position.copy(position);
    this.camera.zoom = zoom;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.controls.enableDamping = damping;
    this.zoomTarget = undefined;
    this.focus = { target, from, started: performance.now(), duration: 800 };
    this.dirty = true;
  }

  private onDoubleClick = (event: MouseEvent) => {
    if (!this.controls.enabled) return;
    const hit = this.intersection(event, true);
    if (!hit) return;
    const entity = this.entityFor(hit.object);
    this.entities.select(entity.playerId, entity.projectileId);
    const group = entity.playerId !== undefined ? this.entities.players.get(entity.playerId)?.group
      : entity.projectileId !== undefined ? this.entities.projectiles.get(entity.projectileId)?.group : undefined;
    if (!group) {
      this.centerMapPoint(hit.point);
      return;
    }
    this.focus = { target: group.position.clone(), from: this.controls.target.clone(), started: performance.now(), duration: 260 };
    this.dirty = true;
  };

  /** Preserve trackpad pan; smooth wheel/pinch zoom before OrbitControls sees it. */
  private onWheel = (event: WheelEvent) => {
    if (!this.controls.enabled) return;
    const pan = !event.ctrlKey && (event.shiftKey || Math.abs(event.deltaX) >= 0.5);
    if (pan ? !this.controls.enablePan : !this.controls.enableZoom) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancelFocus();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1;
    if (!pan) {
      const delta = THREE.MathUtils.clamp(event.deltaY * unit * (event.ctrlKey ? 10 : 1), -240, 240);
      if (!delta) return;
      if (this.zoomTarget === undefined) this.zoomUpdatedAt = performance.now();
      // Reversing direction responds from the visible zoom, without first
      // spending several frames unwinding a queued target in the other direction.
      const previous = this.zoomTarget ?? this.camera.zoom;
      const from = (previous - this.camera.zoom) * delta > 0 ? this.camera.zoom : previous;
      this.zoomTarget = THREE.MathUtils.clamp(from * Math.exp(-delta * 0.0016 * this.controls.zoomSpeed),
        this.controls.minZoom, this.controls.maxZoom);
      return;
    }
    const scale = (this.camera.top - this.camera.bottom) / this.camera.zoom / this.height;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    const offset = right.multiplyScalar(event.deltaX * unit * scale).add(up.multiplyScalar(-event.deltaY * unit * scale));
    this.camera.position.add(offset);
    this.controls.target.add(offset);
    this.dirty = true;
  };

  inspect() {
    return {
      players: [...this.entities.players].filter(([, v]) => v.group.visible).map(([id, v]) => ({ id, position: v.group.position.toArray() })),
      projectiles: [...this.entities.projectiles].filter(([, v]) => v.group.visible).map(([id, v]) => ({ id, position: v.group.position.toArray(), exploded: !!v.projectile.isExploded })),
      camera: { position: this.camera.position.toArray(), target: this.controls.target.toArray(), zoom: this.camera.zoom },
      firstPerson: this.followPlayerId === undefined ? null : { playerId: this.followPlayerId,
        position: this.eyeCamera.position.toArray(), direction: this.eyeCamera.getWorldDirection(new THREE.Vector3()).toArray() },
      mapTriangles: this.mapTriangles,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('start', this.cancelFocus);
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('dblclick', this.onDoubleClick);
    canvas.removeEventListener('wheel', this.onWheel, true);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse(object => {
      const renderable = object as THREE.Mesh;
      if (renderable.geometry) geometries.add(renderable.geometry);
      if (renderable.material) for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) materials.add(material);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      material.dispose();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    this.entities.dispose();
    this.gradient.dispose();
    this.groundMeshes.length = 0;
    this.groundHits.length = 0;
    this.shotMeshes.length = 0;
    this.shotHits.length = 0;
    this.shotQueryMaterial.dispose();
    this.sun.shadow.dispose();
    if (this.scene.background instanceof THREE.Texture) this.scene.background.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    canvas.remove();
    this.scene.clear();
  }
}
