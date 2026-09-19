import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

// Only in-memory fixtures are served. This test never starts the local API or
// writes into the user's Demo library. CS_3D_ROUND_DIR optionally reads a real
// already-parsed Ancient round for the visual integration screenshot.
const output = resolve('../tmp/ancient-3d-qa');
mkdirSync(output, { recursive: true });
const player = { x: 0, y: 0, z: 0, yaw: 359, alive: true, health: 100, armor: 100, inventory: ['303', '404'], activeWeapon: '303', buttons: [] };
const projectile = { entityID: 101, type: '505', throwerID: 1, throwerName: 'CT', x: 0, y: 100, z: 90, trajectory: [{ x: 500, y: 150, z: 200 }] };
const frames = [0, 100, 200, 300, 400, 600, 1100, 2000].map((timeMs, i) => ({
  timeMs, tick: i, round: 1, roundTime: { phase: 'normal', timeRemaining: 100 },
  players: { 1: { ...player, x: Math.min(i, 3) * 20, z: Math.min(i, 3) * 30, yaw: i ? 1 : 359, pitch: -20, alive: i < 3, shotsFired: i === 1 || i === 3 ? 1 : 0, shotYaw: i === 3 ? 210 : 90 }, 2: { ...player, x: -200, y: 200, pitch: 15, inventory: [], shotsFired: timeMs === 600 ? 1 : 0, shotYaw: 45 } },
  projectiles: { 101: { ...projectile, x: Math.min(i, 3) * 100, z: i === 1 ? 230 : 90 + Math.min(i, 3) * 60, isExploded: i >= 2, ttl: i === 2 ? 100 : undefined } },
}));
const meta = { uuid: 'scene-test', mapName: 'de_ancient', totalRounds: 1, totalFrames: frames.length, totalDurationMs: 2000, teamCT: 'CT', teamT: 'T', scoreCT: 0, scoreT: 0, serverPlayer: [
  { id: 1, name: 'CT', team: 3 }, { id: 2, name: 'T', team: 2 },
] };
let realEntry, realRound;
if (process.env.CS_3D_ROUND_DIR) {
  const dir = resolve(process.env.CS_3D_ROUND_DIR);
  realEntry = JSON.parse(readFileSync(resolve(dir, 'entry.json'), 'utf8'));
  realRound = JSON.parse(readFileSync(resolve(dir, '1.json'), 'utf8'));
  assert.equal(realEntry.meta.mapName, 'de_ancient');
}
const entry = realEntry ?? { id: 'scene-test', name: 'scene-test.dem', status: 'ready', rounds: [1], meta };
const round = realRound ?? { round: 1, frames };
const fixtureMeta = { ...entry.meta, totalRounds: 1 };
const fixtureEntry = { ...entry, status: 'ready', rounds: [1], meta: fixtureMeta };

const entryModule = `
import { createApp, h, reactive, ref } from 'vue';
import * as THREE from 'three';
import { MUZZLE_OFFSET, SHOT_SPEED } from '/src/composables/scene3d/shotFlights.ts';
import MapCanvas3D from '/src/components/ReplayPlayer/MapCanvas3D.vue';
const props = reactive(${JSON.stringify({ frames, replayMeta: meta, mapName: 'de_ancient', currentFrameIndex: 0, currentTimeMs: 0, isPlaying: false, hiddenPlayerIds: [] })});
const component = ref();
window.sceneErrors = []; window.clickedProjectile = null;
window.props3d = props;
window.THREE = THREE;
window.shotConstants = { MUZZLE_OFFSET, SHOT_SPEED };
window.app3d = createApp({ setup: () => () => h(MapCanvas3D, { ...props, ref: component,
  onError: message => window.sceneErrors.push(message),
  onExitFirstPerson: () => { props.firstPersonPlayerId = undefined; },
  onProjectileClick: proj => { window.clickedProjectile = proj.entityID; },
}) });
window.app3d.mount('#app'); window.get3D = () => component.value;
`;
const server = await createServer({
  configFile: 'vite.local.config.ts', appType: 'custom', publicDir: 'public',
  plugins: [{ name: 'sandbox-test-fixture', resolveId: id => id === '/test-3d-entry.js' ? '\0test-3d-entry' : undefined,
    load: id => id === '\0test-3d-entry' ? entryModule : undefined }],
  server: { host: '127.0.0.1', port: 0 },
});
server.middlewares.use(async (req, res, next) => {
  const pathname = (req.url ?? '').split('?')[0];
  if (pathname.startsWith('/api/')) {
    assert.equal(req.method, 'GET', 'browser tests do not mutate the library');
    res.setHeader('Content-Type', 'application/json');
    if (pathname === '/api/library') res.end(JSON.stringify([fixtureEntry]));
    else if (pathname === '/api/round') res.end(JSON.stringify(round));
    else { res.statusCode = 404; res.end('{}'); }
    return;
  }
  if (pathname === '/sandbox-test' || pathname === '/replayer') {
    const source = pathname === '/sandbox-test' ? '/test-3d-entry.js' : '/src/main.ts';
    const html = `<!doctype html><html><head><meta charset="UTF-8"><title>Ancient sandbox QA</title><style>html,body,#app{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="app"></div><script type="module" src="${source}"></script></body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.end(await server.transformIndexHtml(req.url, html));
    return;
  }
  next();
});
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}`;
const executablePath = process.env.CS_TEST_BROWSER || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--enable-webgl', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', e => { if (!pageErrors.length) console.error(e.stack); pageErrors.push(e.message); });
  page.on('console', message => {
    if (message.type() === 'error' && /WebGLProgram|VALIDATE_STATUS|Shader Error/.test(message.text())) pageErrors.push(message.text());
  });
  await page.goto(url + '/sandbox-test');
  await page.waitForFunction(() => window.get3D?.()?.getSandbox?.()?.scene.getObjectByName('player-1') || window.sceneErrors?.length, { timeout: 30000 });
  assert.deepEqual(await page.evaluate(() => window.sceneErrors), []);
  const navSupport = await page.evaluate(() => {
    const sandbox = window.get3D().getSandbox();
    const ground = sandbox.scene.getObjectByName('map-ground').geometry.attributes.position;
    const point = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 3; i++) { point.x += ground.getX(i) / 3; point.y += ground.getY(i) / 3; point.z += ground.getZ(i) / 3; }
    window.navSupportPoint = point;
    const walls = sandbox.scene.getObjectByName('map-wall');
    const map = sandbox.scene.getObjectByName('map-whitebox'), lines = [], surfaces = [];
    map.traverse(object => { if (object.isLine) lines.push(object.name); if (object.userData.mapSurface) surfaces.push(object); });
    return { actual: sandbox.groundHeightAt(point), expected: point.y,
      collisionWall: sandbox.shotMeshes.some(mesh => mesh.geometry === walls.geometry), lines,
      opaque: surfaces.every(mesh => !mesh.material.transparent && mesh.material.opacity === 1),
      triangles: sandbox.mapTriangles };
  });
  assert.ok(Math.abs(navSupport.actual - navSupport.expected) < .01, 'death support preserves the original NAV height');
  assert.ok(navSupport.collisionWall, 'restored source collision walls participate in visual bullet hits');
  assert.deepEqual(navSupport.lines, [], 'map surfaces and plinth have no gray edge or wireframe overlays');
  assert.ok(navSupport.opaque, 'opaque map surfaces cannot accumulate transparency seams');
  assert.equal(navSupport.triangles, 76138, 'the exact first cutaway asset is restored without rebuilding its shapes');
  const mapValues = await page.evaluate(() => {
    const THREE = window.THREE, sandbox = window.get3D().getSandbox(), renderer = sandbox.renderer;
    const ground = sandbox.scene.getObjectByName('map-ground').material;
    const wall = sandbox.scene.getObjectByName('map-wall').material;
    const actor = sandbox.entities.players.get(1).torso.material;
    // Measure actual GPU output under equal illumination, not just palette hexes.
    const stage = new THREE.Scene(), camera = new THREE.OrthographicCamera(-2.1, 2.1, 1, -1, .1, 10);
    camera.position.z = 5;
    const light = new THREE.DirectionalLight(0xffffff, 1.9); light.position.set(-1, 3, 5);
    stage.add(light, new THREE.HemisphereLight(0xffffff, 0xb7b7b7, 1.75));
    const geometry = new THREE.PlaneGeometry(2, 2);
    for (const [index, material] of [ground, wall].entries()) {
      const plane = new THREE.Mesh(geometry, material); plane.position.x = index ? 1.05 : -1.05; stage.add(plane);
    }
    const target = new THREE.WebGLRenderTarget(128, 64);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const savedTarget = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(target); renderer.render(stage, camera);
      const pixels = new Uint8Array(128 * 64 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 128, 64, pixels);
      const pixel = x => Array.from(pixels.slice((32 * 128 + x) * 4, (32 * 128 + x) * 4 + 3));
      const colors = { ground: pixel(32), wall: pixel(96) };
      // Adjacent independent wall meshes without UVs must share one continuous
      // weathering pattern at real map scale, with visible broad color variation.
      geometry.deleteAttribute('uv');
      const planes = stage.children.filter(object => object.isMesh);
      planes.forEach((plane, i) => { plane.material = wall; plane.scale.set(192, 192, 1); plane.position.x = i ? 192 : -192; });
      Object.assign(camera, { left: -384, right: 384, top: 192, bottom: -192, far: 2000 });
      camera.position.z = 600; camera.updateProjectionMatrix();
      renderer.render(stage, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 128, 64, pixels);
      const weathered = pixels.slice(), samples = [];
      for (let y = 8; y < 56; y += 4) for (let x = 8; x < 120; x += 4) {
        const k = (y * 128 + x) * 4;
        samples.push(pixels[k] * .2126 + pixels[k + 1] * .7152 + pixels[k + 2] * .0722);
      }
      const seam = Math.max(...[0,1,2].map(channel => Math.abs(pixel(63)[channel] - pixel(64)[channel])));
      renderer.render(stage, camera);
      renderer.readRenderTargetPixels(target, 0, 0, 128, 64, pixels);
      return { ...colors, textureValueRange: Math.max(...samples) - Math.min(...samples), seam,
        stableTexture: pixels.every((v, i) => v === weathered[i]),
        textureSize: [wall.stoneTexture.image.width, wall.stoneTexture.image.height],
        sharedTexture: wall.stoneTexture === sandbox.scene.getObjectByName('map-cover').material.stoneTexture,
        untexturedActorsAndFloor: !actor.stoneTexture && !ground.stoneTexture,
        separateRamp: ground.gradientMap !== actor.gradientMap,
        actorRamp: Array.from(actor.gradientMap.image.data), actorColor: actor.color.getHex() };
    } finally {
      renderer.setRenderTarget(savedTarget); target.dispose(); geometry.dispose();
      renderer.render(sandbox.scene, sandbox.camera);
    }
  });
  const luminance = rgb => rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  console.log('Stone texture QA:', JSON.stringify(mapValues));
  assert.ok(luminance(mapValues.ground) - luminance(mapValues.wall) >= 20, 'softly lit floor and wall retain readable value separation');
  assert.ok([mapValues.ground, mapValues.wall].every(rgb => rgb[1] > rgb[0] && rgb[1] > rgb[2]), 'GPU output preserves the forest green palette on both floor and walls');
  assert.ok(mapValues.wall[0] > 85 && mapValues.wall[0] < 190, 'walls stay readable mid-gray, neither black nor washed-out white');
  assert.ok(mapValues.separateRamp, 'map lighting cannot alter actor or projectile toon ramps');
  assert.deepEqual(mapValues.actorRamp, [125,125,125,255,192,192,192,255,255,255,255,255], 'existing actor lighting is preserved');
  assert.equal(mapValues.actorColor, 0x559ccd, 'existing CT player palette is preserved');
  assert.ok(mapValues.textureValueRange > 12, 'weathering produces visible moss and pale stone patches on the GPU');
  assert.ok(mapValues.seam <= 4, 'adjacent UV-less wall meshes have no texture seam');
  assert.ok(mapValues.stableTexture, 'weathering does not flicker or animate between refreshes');
  assert.deepEqual(mapValues.textureSize, [128, 128]);
  assert.ok(mapValues.sharedTexture && mapValues.untexturedActorsAndFloor, 'only walls and cover share the small stone mask');
  console.log('Map rendered value separation:', JSON.stringify(mapValues));
  await page.evaluate(() => {
    const sandbox = window.get3D().getSandbox();
    window.actualShotDistanceAt = sandbox.shotDistanceAt;
    sandbox.shotDistanceAt = () => undefined; // Isolate flight timing from the Ancient walls around the synthetic origin.
  });
  const snapshot = () => page.evaluate(() => {
    const sandbox = window.get3D().getSandbox();
    const get = name => { const o = sandbox.scene.getObjectByName(name); return o ? { position: o.position.toArray(), visible: o.visible, uuid: o.uuid } : null; };
    return { player: get('player-1'), projectile: get('projectile-101'), camera: sandbox.camera.position.toArray(), zoom: sandbox.camera.zoom, target: sandbox.controls.target.toArray(), info: window.get3D().inspect() };
  });
  const initial = await snapshot();
  const playerState = () => page.evaluate(() => {
    const sandbox = window.get3D().getSandbox(), visual = sandbox.entities.players.get(1);
    const visible = object => {
      for (let node = object; node; node = node.parent) if (!node.visible) return false;
      return !!object;
    };
    const fan = visual.fieldOfView, fragments = visual.fragments;
    return {
      body: visible(visual.body), label: visible(visual.label), fan: visible(fan), corpse: visible(visual.corpse), selection: visible(visual.selection),
      labelVisible: visual.label.visible, fanVisible: fan.visible,
      fragmentCount: fragments.count, instanced: fragments.isInstancedMesh,
      matrices: Array.from(fragments.instanceMatrix.array.slice(0, fragments.count * 16)),
      objects: [visual.group.uuid, visual.label.uuid, fan.uuid, fragments.uuid, fragments.geometry.uuid, fragments.material.uuid],
    };
  });
  // Two display ticks also flush Vue's prop watcher, without tying assertions
  // to machine speed or the animation's wall-clock scheduling.
  const seek = timeMs => page.evaluate(async timeMs => {
    window.props3d.currentTimeMs = timeMs;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  }, timeMs);
  const overview = await page.evaluate(() => window.get3D().inspect().camera);
  await page.evaluate(() => { window.props3d.firstPersonPlayerId = 1; });
  await seek(50);
  const eyeState = () => page.evaluate(() => {
    const s = window.get3D().getSandbox(), v = s.entities.players.get(s.followPlayerId);
    return { eye: s.inspect().firstPerson, overview: s.inspect().camera, orbit: s.controls.enabled,
      self: v && { head: v.head.visible, torso: v.torso.visible, label: v.label.visible, fan: v.fieldOfView.visible,
        weapon: v.weaponRig.visible, body: v.body.visible }, perspective: s.activeCamera.isPerspectiveCamera === true };
  });
  const eye50 = await eyeState();
  assert.deepEqual(eye50.eye.position, [10, 79, -0], 'eye follows interpolated XYZ plus a fixed eye height');
  assert.ok(Math.abs(eye50.eye.direction[0] - Math.cos(Math.PI / 9)) < 1e-6);
  assert.ok(Math.abs(eye50.eye.direction[1] - Math.sin(Math.PI / 9)) < 1e-6);
  assert.ok(Math.abs(eye50.eye.direction[2]) < 1e-6, 'yaw interpolation crosses zero along the short path');
  assert.equal(eye50.perspective, true); assert.equal(eye50.orbit, false);
  assert.deepEqual(eye50.self, { head: false, torso: false, label: false, fan: false, weapon: true, body: true });
  await page.mouse.move(500, 300); await page.mouse.wheel(0, 180);
  await page.mouse.down(); await page.mouse.move(700, 350); await page.mouse.up();
  assert.deepEqual(await eyeState(), eye50, 'paused eye view ignores orbit and zoom inputs');
  await seek(150); const eye150 = await eyeState();
  assert.deepEqual(eye150.eye.position, [30, 109, -0]);
  await page.screenshot({ path: resolve(output, 'first-person.png') });
  await seek(50); assert.deepEqual(await eyeState(), eye50, 'seeking backwards restores the exact eye pose');
  await page.evaluate(() => { window.props3d.firstPersonPlayerId = 2; });
  await seek(50); assert.equal((await eyeState()).eye.playerId, 2);
  assert.equal(await page.evaluate(() => window.get3D().getSandbox().entities.players.get(1).head.visible), true, 'switching restores the previous actor');
  await page.evaluate(() => { window.props3d.hiddenPlayerIds = [2]; });
  await seek(50); await seek(50);
  assert.equal((await eyeState()).eye, null, 'hiding the followed player exits eye view');
  await page.evaluate(() => { window.props3d.hiddenPlayerIds = []; window.props3d.firstPersonPlayerId = 1; });
  await seek(299); assert.equal((await eyeState()).eye.playerId, 1);
  await seek(300); await seek(300);
  assert.equal((await eyeState()).eye, null, 'death exits at the recorded event time');
  const restoredOverview = (await eyeState()).overview;
  for (const key of ['position', 'target']) restoredOverview[key].forEach((value, i) => assert.ok(Math.abs(value - overview[key][i]) < 1e-6));
  assert.equal(restoredOverview.zoom, overview.zoom, 'leaving first person preserves overview zoom');
  await seek(0);
  await page.evaluate(() => {
    window.beforeFlashFrames = window.props3d.frames;
    window.props3d.frames = Array.from({length:23}, (_,i) => ({...window.beforeFlashFrames[0],timeMs:i*100,tick:i,
      players:{1:{...window.beforeFlashFrames[0].players[1],isBlinded:i>=1 && i<21,flashDuration:2},
        2:{...window.beforeFlashFrames[0].players[2],isBlinded:false,flashDuration:2}}}));
    window.props3d.firstPersonPlayerId = 1;
  });
  const flashState = () => page.evaluate(() => {
    const s=window.get3D().getSandbox(), m=s.flashOverlay, gl=s.renderer.getContext();
    s.renderer.render(s.scene,s.activeCamera);
    const pixel=new Uint8Array(4);gl.readPixels(20,20,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    return {visible:m.visible,opacity:m.material.uniforms.opacity.value,pixel:[...pixel],mesh:m.uuid};
  });
  await seek(99); assert.equal((await flashState()).opacity,0,'no flash before the original activation sample');
  await seek(100); const fullFlash=await flashState();
  assert.equal(fullFlash.opacity,.9); assert.equal(fullFlash.visible,true);
  const unflashedPixel = await page.evaluate(() => {
    const s=window.get3D().getSandbox(), m=s.flashOverlay, gl=s.renderer.getContext();
    m.visible=false; s.renderer.render(s.scene,s.activeCamera);
    const pixel=new Uint8Array(4);gl.readPixels(20,20,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    m.visible=true;s.renderer.render(s.scene,s.activeCamera);return [...pixel];
  });
  fullFlash.pixel.slice(0,3).forEach((v,i)=>assert.ok(Math.abs(v-(unflashedPixel[i]*.1+255*.91*.9))<=2,
    'the peak gray-white flash retains 25% of the scene in captured pixels'));
  await page.screenshot({path:resolve(output,'first-person-flashed.png')});
  await seek(1100); const fadingFlash=await flashState();
  assert.ok(fadingFlash.opacity>0 && fadingFlash.opacity<1);
  await page.screenshot({path:resolve(output,'first-person-flash-fading.png')});
  await page.waitForTimeout(150); assert.deepEqual(await flashState(),fadingFlash,'paused flash does not fade by wall clock');
  await seek(1800); assert.ok((await flashState()).opacity<fadingFlash.opacity);
  await seek(2100); assert.equal((await flashState()).visible,false,'stale total flashDuration cannot keep the screen white');
  await seek(1100); assert.deepEqual(await flashState(),fadingFlash,'reverse seek reconstructs the flash fade');
  await page.evaluate(()=>{window.props3d.firstPersonPlayerId=2;});
  await seek(1100); assert.equal((await flashState()).visible,false,'changing observer clears the previous player flash');
  await page.evaluate(()=>{window.props3d.firstPersonPlayerId=undefined;});
  await seek(100); assert.equal((await flashState()).visible,false,'third person is not covered by an actor flash');
  await page.evaluate(()=>{window.props3d.frames=window.beforeFlashFrames;});
  await seek(0);
  const shotState = (id = 1, timeMs = 100) => page.evaluate(({ id, timeMs }) => {
    const sandbox = window.get3D().getSandbox();
    const visual = [...sandbox.entities.shots.activeVisuals.values()].find(shot => shot.event.shooterId === id && shot.event.timeMs === timeMs);
    if (!visual) return null;
    const visible = object => {
      for (let node = object; node; node = node.parent) if (!node.visible) return false;
      return !!object;
    };
    const effects = ['bullet', 'core', 'muzzle', 'muzzleCore', 'impact'].map(name => {
      const mesh = visual[name];
      mesh.geometry.computeBoundingBox();
      const size = mesh.geometry.boundingBox.getSize(mesh.position.clone()).multiply(mesh.scale);
      return { name, visible: visible(mesh), mesh: !!mesh.isMesh, line: !!mesh.isLine,
        size: size.toArray(), color: mesh.material.color.toArray(), uuid: mesh.uuid, geometry: mesh.geometry.uuid,
        transparent: mesh.material.transparent, depthTest: mesh.material.depthTest, depthWrite: mesh.material.depthWrite, renderOrder: mesh.renderOrder,
        transform: [...mesh.position.toArray(), ...mesh.quaternion.toArray(), ...mesh.scale.toArray()] };
    });
    return { visible: visible(visual.group), effects, event: visual.event, endpoint: visual.endpoint,
      origin: visual.group.position.toArray(), head: visual.bullet.position.x + visual.bullet.position.clone().set(visual.bullet.scale.x, 0, 0).applyQuaternion(visual.bullet.quaternion).x,
      forward: visual.group.position.clone().set(1, 0, 0).transformDirection(visual.group.matrixWorld).toArray() };
  }, { id, timeMs });
  const shotPose = state => state && ({ origin: state.origin, forward: state.forward, head: state.head,
    effects: state.effects.map(({ name, visible, transform }) => ({ name, visible, transform })) });
  const assertShotDirection = (state, yaw, pitch) => {
    const radians = Math.PI / 180;
    const expected = [Math.cos(pitch * radians) * Math.cos(yaw * radians), -Math.sin(pitch * radians), -Math.cos(pitch * radians) * Math.sin(yaw * radians)];
    assert.ok(state.forward.every((value, axis) => Math.abs(value - expected[axis]) < 1e-6), 'bullet and muzzle follow shotYaw and Source pitch, independently of body yaw');
  };
  const alive = await playerState();
  assert.ok(alive.body && alive.label && alive.fan && !alive.corpse, 'live players retain model, readable name and field of view');
  const materialChecks = await page.evaluate(() => {
    const sandbox = window.get3D().getSandbox();
    const mapColors = [];
    sandbox.scene.getObjectByName('map-whitebox').traverse(object => {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material?.color) mapColors.push({ name: object.name, rgb: material.color.toArray() });
      }
    });
    const teams = [1, 2].map(id => {
      const visual = sandbox.entities.players.get(id), fan = visual.fieldOfView;
      const positions = fan.geometry.attributes.position;
      const point = visual.group.position.clone();
      const heights = Array.from({ length: positions.count }, (_, i) => point.fromBufferAttribute(positions, i).applyMatrix4(fan.matrixWorld).y);
      const center = point.clone().set(0, 0, 0);
      for (let i = 0; i < positions.count; i++) center.add(point.fromBufferAttribute(positions, i).applyMatrix4(fan.matrixWorld));
      center.divideScalar(positions.count).sub(visual.group.position);
      const yaw = visual.bearing.rotation.y;
      const forwardAlignment = (center.x * Math.cos(yaw) - center.z * Math.sin(yaw)) / Math.hypot(center.x, center.z);
      return { body: visual.torso.material.color.toArray(), fan: fan.material.color.toArray(), fragments: visual.fragments.material.color.toArray(),
        fanOpacity: fan.material.opacity, fanFollowsBearing: fan.parent === visual.bearing,
        heightRange: Math.max(...heights) - Math.min(...heights), forwardAlignment };
    });
    return { mapColors, teams };
  });
  assert.ok(materialChecks.mapColors.length > 5, 'the complete map and presentation base are inspected');
  for (const { name, rgb } of materialChecks.mapColors) {
    assert.ok(Math.max(...rgb) - Math.min(...rgb) < .24, `${name} keeps a restrained stone palette so team colors dominate`);
  }
  for (const team of materialChecks.teams) {
    assert.deepEqual(team.fan, team.body, 'field of view preserves the player team color');
    assert.deepEqual(team.fragments, team.body, 'death fragments preserve the player team color');
    assert.ok(team.fanOpacity > 0 && team.fanOpacity < 1, 'field of view is a translucent overlay');
    assert.ok(team.fanFollowsBearing && team.heightRange < 1e-4, 'field of view follows yaw on a horizontal plane');
    assert.ok(team.forwardAlignment > .99, 'the field-of-view wedge points in the Source yaw direction');
  }
  assert.notDeepEqual(materialChecks.teams[0].fan, materialChecks.teams[1].fan, 'CT and T remain visually distinct against the subdued stone map');
  await seek(99);
  assert.equal(await shotState(), null, 'the shot does not start before its source event');
  await seek(100);
  const shotStart = await shotState();
  assert.ok(shotStart.visible && shotStart.effects[2].visible && shotStart.effects[3].visible && !shotStart.effects[0].visible, 'the exact shot timestamp shows its muzzle while the bullet has not yet moved');
  assert.ok(shotStart.effects.every(effect => effect.mesh && !effect.line), 'all shooting effects use solid low-poly meshes instead of one-pixel lines');
  assert.ok(shotStart.effects[2].size.every(size => size >= 25), 'muzzle has a broad crossed flame silhouette visible from different camera directions');
  assert.notDeepEqual(shotStart.effects[2].color, shotStart.effects[3].color, 'muzzle flame has a distinct bright core');
  assert.ok(shotStart.effects.every(effect => effect.transparent && effect.depthTest && !effect.depthWrite && effect.renderOrder > 0), 'all shot layers share the transparent queue, render over background walls and retain real foreground occlusion');
  assertShotDirection(shotStart, 90, -20);
  await seek(145);
  const shotDecay = await shotState();
  assert.ok(shotDecay.head > shotStart.head + 200, 'the bullet moves away from its muzzle as replay time advances');
  assert.ok(shotDecay.effects[0].size[0] > 0 && shotDecay.effects[0].size[0] <= 70 && shotDecay.effects[0].size[1] >= 5 && shotDecay.effects[0].size[2] >= 5, 'the bullet is a thick short flying streak, not a muzzle-to-target beam');
  assert.deepEqual(shotDecay.origin, shotStart.origin, 'launch origin stays fixed while the shooter moves');
  assert.deepEqual(shotDecay.forward, shotStart.forward, 'the existing bullet keeps its launch direction');
  assert.notDeepEqual(shotDecay.effects[2].transform, shotStart.effects[2].transform, 'muzzle burst decays as replay time advances');
  await page.waitForTimeout(160);
  await page.evaluate(async () => {
    window.props3d.projectileConfigs = {};
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  assert.deepEqual(await shotState(), shotDecay, 'paused shot stays exact beyond its wall-clock lifetime and across a forced refresh');
  await page.evaluate(() => { window.props3d.hiddenPlayerIds = [1]; });
  await page.waitForFunction(() => !window.get3D().getSandbox().entities.players.get(1).group.visible);
  assert.equal(await shotState(), null, 'hiding a firing player hides its independent flying bullet and muzzle');
  await page.evaluate(() => { window.props3d.hiddenPlayerIds = []; });
  await seek(200);
  const continuingShot = await shotState();
  assert.ok(continuingShot.effects[0].visible && !continuingShot.effects[2].visible && continuingShot.head > shotDecay.head, 'a non-shooting sample ends the muzzle flash while the previously fired bullet continues flying');
  await seek(145);
  assert.deepEqual(shotPose(await shotState()), shotPose(shotDecay), 'reverse seek reconstructs the same muzzle and bullet position without delayed effects');
  await seek(50);
  assert.equal(await shotState(), null, 'seeking before a shot leaves no shooting residue');
  await page.evaluate(() => { window.props3d.currentTimeMs = 50; });
  await page.waitForFunction(() => Math.abs(window.get3D().getSandbox().scene.getObjectByName('player-1').position.x - 10) < .01);
  const middle = await snapshot();
  assert.ok(middle.player.position.every((n, i) => Math.abs(n - [10, 15, 0][i]) < 1e-6), 'paused time displays interpolated real XYZ');
  assert.deepEqual(middle.projectile.position, [50, 160, -100], 'flying grenade interpolates altitude and lateral movement');
  assert.equal(middle.player.uuid, initial.player.uuid, 'player mesh survives display updates');
  assert.equal(middle.projectile.uuid, initial.projectile.uuid, 'projectile mesh survives display updates');
  const halfwayYaw = await page.evaluate(() => window.get3D().getSandbox().entities.players.get(1).bearing.rotation.y);
  assert.ok(Math.abs(Math.sin(halfwayYaw)) < 1e-6 && Math.cos(halfwayYaw) > .999, 'yaw and its attached field of view interpolate across the shortest 359-to-1-degree path');
  await page.screenshot({ path: resolve(output, 'scene-initial.png') });
  await page.evaluate(() => { window.props3d.hiddenPlayerIds = [1]; });
  await page.waitForFunction(() => !window.get3D().getSandbox().scene.getObjectByName('player-1')?.visible);
  const hidden = await snapshot();
  assert.ok(!hidden.projectile?.visible, 'hiding thrower also hides projectiles');
  const hiddenPlayer = await playerState();
  assert.ok(!hiddenPlayer.label && !hiddenPlayer.fan && !hiddenPlayer.corpse, 'hidden players leave no label, field of view or fragments');
  await page.evaluate(() => { window.props3d.hiddenPlayerIds = []; window.props3d.currentTimeMs = 0; });
  await page.waitForFunction(() => window.get3D().getSandbox().scene.getObjectByName('player-1')?.visible);

  const trailPoints = () => page.evaluate(() => {
    const line = window.get3D().getSandbox().scene.getObjectByName('trajectory-101');
    return [...line.geometry.attributes.position.array.slice(0, line.geometry.drawRange.count * 3)];
  });
  await page.evaluate(() => { window.props3d.currentTimeMs = 150; });
  await page.waitForFunction(() => window.get3D().getSandbox().scene.getObjectByName('projectile-101').position.x === 150);
  assert.deepEqual(await trailPoints(), [0, 90, -100, 100, 230, -100, 150, 220, -100], 'trail retains the reached apex and appends the live tip instead of a straight chord');
  await page.evaluate(() => { window.props3d.currentTimeMs = 50; });
  await page.waitForFunction(() => window.get3D().getSandbox().scene.getObjectByName('projectile-101').position.x === 50);
  assert.deepEqual(await trailPoints(), [0, 90, -100, 50, 160, -100], 'reverse seek removes future trajectory immediately');
  await page.evaluate(() => { window.props3d.currentTimeMs = 150; });
  await page.waitForFunction(() => window.get3D().getSandbox().scene.getObjectByName('projectile-101').position.x === 150);
  assert.deepEqual(await trailPoints(), [0, 90, -100, 100, 230, -100, 150, 220, -100], 'scrubbing restores source vertices previously occupied by the live tip');

  await page.evaluate(() => { window.props3d.currentTimeMs = 199; });
  await page.waitForFunction(() => window.get3D().getSandbox().scene.getObjectByName('projectile-101').position.x > 198);
  assert.equal((await snapshot()).info.projectiles[0].exploded, false, 'detonation does not happen early');
  await page.evaluate(() => { window.props3d.currentTimeMs = 200; });
  await page.waitForFunction(() => window.get3D().inspect().projectiles[0]?.exploded);
  assert.equal(await page.evaluate(() => window.get3D().getSandbox().entities.smoke.count), 7, 'effect starts at exact event time');
  await seek(250); // Allow the newborn cloud and its matching hit area to expand before picking.
  const entityScreenPoint = name => page.evaluate(name => {
    const s = window.get3D().getSandbox();
    const p = s.scene.getObjectByName(name).position.clone().project(s.camera);
    const rect = s.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  }, name);
  const projectilePoint = await entityScreenPoint('projectile-101');
  await page.mouse.click(projectilePoint.x, projectilePoint.y);
  await page.waitForFunction(() => window.clickedProjectile === 101);
  await page.mouse.dblclick(projectilePoint.x, projectilePoint.y);
  await page.waitForTimeout(450);
  assert.notDeepEqual((await snapshot()).target, initial.target, 'double click focuses the selected entity');
  await seek(299);
  const beforeDeath = await playerState();
  assert.ok(beforeDeath.body && beforeDeath.label && beforeDeath.fan && !beforeDeath.corpse, 'death does not hide the live model, name or field of view early');
  await seek(300);
  await page.waitForFunction(() => window.get3D().getSandbox().entities.players.get(1).corpse.visible);
  const lastEvents = await page.evaluate(() => {
    const s = window.get3D().getSandbox();
    return { smoke: s.entities.smoke.count, expiredVisible: s.entities.projectiles.get(101).group.visible };
  });
  const deathShot = await shotState(1, 300);
  assert.ok(deathShot.effects[2].visible && deathShot.effects[3].visible, 'same-sample death retains its new muzzle flash and launches a separate bullet event');
  assertShotDirection(deathShot, 210, -20);
  const earlierShot = await shotState(1, 100);
  assert.ok(earlierShot?.effects[0].visible && earlierShot.head > continuingShot.head, 'different shots from one player coexist and the earlier bullet keeps flying after the shooter dies');
  assert.notEqual(deathShot.effects[0].uuid, earlierShot.effects[0].uuid, 'overlapping events have independent bullet transforms');
  assert.deepEqual(deathShot.effects.map(effect => effect.geometry), earlierShot.effects.map(effect => effect.geometry), 'independent bullets and flames share their GPU geometry');
  assert.equal(lastEvents.smoke, 0, 'omitted zero TTL never restarts an expired smoke');
  assert.equal(lastEvents.expiredVisible, false, 'expired effects cannot intercept clicks');
  const deathStart = await playerState();
  assert.ok(!deathStart.body && deathStart.corpse, 'the living body switches to fragments at the exact death timestamp');
  assert.equal(deathStart.labelVisible, false, 'death explicitly hides the name instead of leaving a dim label');
  assert.equal(deathStart.fanVisible, false, 'death explicitly hides the field-of-view fan');
  assert.ok(deathStart.instanced && deathStart.fragmentCount > 1 && deathStart.fragmentCount <= 32, 'each corpse is a small batch of instanced fragments');
  await seek(550);
  const scattering = await playerState();
  assert.notDeepEqual(scattering.matrices, deathStart.matrices, 'advancing the replay clock scatters the fragments');
  await page.waitForTimeout(120);
  await page.evaluate(async () => {
    window.props3d.projectileConfigs = {}; // Force a normal same-time entity refresh.
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  assert.deepEqual((await playerState()).matrices, scattering.matrices, 'paused fragments remain exact across wall-clock time and repeated same-time refreshes');
  await seek(450);
  assert.notDeepEqual((await playerState()).matrices, scattering.matrices, 'reverse seek restores an earlier fragmentation pose');
  await seek(550);
  assert.deepEqual((await playerState()).matrices, scattering.matrices, 'returning to a replay time reproduces identical fragment transforms');
  await page.evaluate(() => { window.props3d.hiddenPlayerIds = [1]; });
  await page.waitForFunction(() => !window.get3D().getSandbox().entities.players.get(1).group.visible);
  assert.equal((await playerState()).corpse, false, 'hiding a dead player also hides its fragment batch');
  await page.evaluate(() => { window.props3d.hiddenPlayerIds = []; });
  await seek(299);
  const rewoundAlive = await playerState();
  assert.ok(rewoundAlive.body && rewoundAlive.label && rewoundAlive.fan && !rewoundAlive.corpse, 'seeking before death restores the model, name and field of view without fragment residue');
  await page.evaluate(() => window.get3D().getSandbox().entities.select(1));
  assert.equal((await playerState()).selection, true, 'the living player can be selected before its death');
  await seek(2000);
  const skippedPastDeath = await playerState();
  assert.ok(!skippedPastDeath.body && !skippedPastDeath.corpse && !skippedPastDeath.label && !skippedPastDeath.fan && !skippedPastDeath.selection, 'a direct late seek leaves no permanent body, debris, name, field of view or selection');
  await page.evaluate(() => window.get3D().getSandbox().entities.select(1));
  assert.equal((await playerState()).selection, false, 'selecting an expired death cannot resurrect its selection ring');
  await seek(1099);
  assert.equal((await playerState()).corpse, true, 'fragments remain visible immediately before the 800 ms lifetime ends');
  await seek(1100);
  assert.equal((await playerState()).corpse, false, 'fragments disappear at exactly 800 ms after death');
  await seek(550);
  const restoredBurst = await playerState();
  assert.ok(restoredBurst.corpse && !restoredBurst.label && !restoredBurst.fan, 'reverse seek from an expired death restores its active burst');
  assert.deepEqual(restoredBurst.matrices, scattering.matrices, 'reverse seek from expired debris reproduces the original 250 ms fragment pose');
  const unknownDeathVisible = await page.evaluate(async () => {
    const originalFrames = window.props3d.frames;
    window.props3d.frames = originalFrames.slice(3); // Clip begins with an already-dead player.
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const visible = window.get3D().getSandbox().entities.players.get(1).corpse.visible;
    window.props3d.frames = originalFrames;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return visible;
  });
  assert.equal(unknownDeathVisible, false, 'a clip that starts with a dead player does not invent a new death burst or permanent corpse');
  assert.deepEqual(skippedPastDeath.objects, alive.objects, 'death expiry, hiding and reverse seeking reuse player, label, fan and fragment GPU objects');
  await page.evaluate(() => window.get3D().getSandbox().entities.select());
  await seek(600);
  const isolatedShot = await shotState(2, 600);
  assert.ok(isolatedShot.effects[2].visible && isolatedShot.effects[3].visible, 'a second player can fire using the same pooled effect geometry');
  assertShotDirection(isolatedShot, 45, 15);
  assert.ok(shotStart.effects[0].color[2] > shotStart.effects[0].color[0], 'CT bullets use a blue silhouette');
  assert.ok(isolatedShot.effects[0].color[0] > isolatedShot.effects[0].color[2] && isolatedShot.effects[0].color[1] > isolatedShot.effects[0].color[2], 'T bullets use a yellow silhouette');
  await seek(670);
  const departedShot = await shotState(2, 600);
  assert.ok(departedShot.effects[0].visible && !departedShot.effects[2].visible, 'the muzzle expires after 70 ms independently of its flying bullet');
  await seek(2000);
  assert.equal(await shotState(2, 600), null, 'a missed bullet expires at its range limit instead of persisting to the end of a sparse source sample');
  await page.evaluate(() => { window.originalFlightFrames = window.props3d.frames; });
  for (const kind of ['player', 'wall']) {
    await page.evaluate(kind => {
      const sandbox = window.get3D().getSandbox();
      sandbox.shotDistanceAt = () => kind === 'wall' ? 240 : undefined;
      window.props3d.frames = [0, 100, 200, 400, 700, 1000].map((timeMs, tick) => ({
        timeMs, tick, round: 1, roundTime: { phase: 'normal', timeRemaining: 100 },
        players: {
          1: { x: 0, y: 0, z: 1000, yaw: 0, shotYaw: 0, pitch: 0, alive: true, health: 100, shotsFired: timeMs === 100 ? 1 : 0, inventory: [] },
          2: { x: 600, y: 0, z: 1000, yaw: 180, pitch: 0, alive: true, health: 100, shotsFired: 0, inventory: [] },
        },
      }));
      window.props3d.currentFrameIndex = 0;
    }, kind);
    await seek(110);
    const launched = await shotState();
    assert.equal(launched.endpoint.kind, kind, 'flight selects the nearest eligible collision rather than flying through it');
    if (kind === 'player') {
      assert.equal(launched.endpoint.playerId, 2, 'the bullet terminates on the struck player');
      assert.ok(launched.endpoint.distance > 500 && launched.endpoint.distance < 600, 'player collision occurs on the body silhouette before its center');
    } else assert.equal(launched.endpoint.distance, 240, 'a nearer wall blocks the player behind it');
    const { MUZZLE_OFFSET, SHOT_SPEED } = await page.evaluate(() => window.shotConstants);
    const arrival = 100 + (launched.endpoint.distance - MUZZLE_OFFSET) / SHOT_SPEED;
    await seek(arrival - .25);
    const approaching = await shotState();
    assert.ok(approaching.effects[0].visible && !approaching.effects[4].visible && approaching.head < launched.endpoint.distance, 'before contact the bullet remains in flight without a premature impact');
    await seek(arrival + .25);
    const impact = await shotState();
    assert.ok(!impact.effects[0].visible && impact.effects[4].visible, 'contact replaces the moving bullet with a brief impact and never flies past the hit');
    assert.ok(Math.abs(impact.effects[4].transform[0] - launched.endpoint.distance) < 1e-5, 'impact stays at the actual collision endpoint');
    await seek(arrival + 61);
    assert.equal(await shotState(), null, 'impact geometry clears after its short replay-clock lifetime');
    await seek(arrival - .25);
    assert.deepEqual(shotPose(await shotState()), shotPose(approaching), 'seeking backward through impact restores the exact pre-hit bullet position');
  }
  await page.evaluate(() => {
    window.props3d.frames = window.originalFlightFrames;
    window.get3D().getSandbox().shotDistanceAt = window.actualShotDistanceAt;
  });
  const actualMapHit = await page.evaluate(() => window.actualShotDistanceAt(
    { ...window.navSupportPoint, y: window.navSupportPoint.y + 100 }, { x: 0, y: -1, z: 0 }, 200,
  ));
  assert.ok(Math.abs(actualMapHit - 100) < .01, 'the actual NAV floor participates in bullet collision at its original height');
  await page.evaluate(() => { window.props3d.currentTimeMs = 0; window.get3D().resetView(); });
  await page.waitForFunction(() => !window.get3D().inspect().projectiles[0]?.exploded);

  // Both teams use every grenade type: visual identity comes from shape, while
  // trajectory color and opacity must stay exactly the same within a team.
  await page.evaluate(() => {
    window.originalGrenadeFixture = { frames: window.props3d.frames, configs: window.props3d.projectileConfigs };
    const types = ['506', '504', '505', '502', '503', '501']; // HE, flash, smoke, molotov, incendiary, decoy.
    window.props3d.projectileConfigs = Object.fromEntries(types.map(type => [type, { durationInMs: type === '506' ? 3000 : 600, explosionRadius: 95 }]));
    window.props3d.frames = [0, 100, 200, 300, 400, 700, 800, 849, 850, 1000].map((timeMs, tick) => ({
      timeMs, tick, round: 1, roundTime: { phase: 'normal', timeRemaining: 100 },
      players: {
        1: { x: -1190, y: 250, z: 0, yaw: 0, alive: true, health: 100, inventory: [] },
        2: { x: -1190, y: -250, z: 0, yaw: 0, alive: true, health: 100, inventory: [] },
      },
      projectiles: Object.fromEntries([0, 1].flatMap(row => types.map((type, column) => {
        const entityID = 900 + row * 10 + column;
        const encodedType = row ? Number(type) : type === '504' ? 'flashbang' : type === '506' ? 'hegrenade' : type;
        return [entityID, { entityID, type: encodedType, throwerID: row + 1, throwerName: row ? 'T' : 'CT',
          x: (column - 2.5) * 350 - (timeMs < 200 ? 100 - timeMs * .5 : 0), y: row ? -250 : 250,
          z: timeMs < 200 ? 60 + Math.sin(timeMs / 200 * Math.PI) * 90 : 0,
          isExploded: timeMs >= 200, ttl: timeMs >= 200 ? Math.max(0, (type === '506' ? 3200 : 800) - timeMs) : undefined }];
      }))),
    }));
    window.props3d.currentFrameIndex = 0;
    const sandbox = window.get3D().getSandbox();
    const map = sandbox.scene.getObjectByName('map-whitebox');
    const stage = map.getObjectByName('diorama-base').clone();
    stage.name = 'projectile-qa-stage';
    stage.position.set(-50, -20, 0);
    stage.scale.set(2750 / stage.geometry.parameters.width, .4, 1450 / stage.geometry.parameters.depth);
    sandbox.scene.add(stage);
    map.visible = false;
    sandbox.controls.target.set(-50, 60, 0);
    sandbox.camera.position.set(-50, 1900, 1800);
    sandbox.camera.zoom = 3.2;
    sandbox.camera.updateProjectionMatrix();
  });
  const grenadeState = () => page.evaluate(() => {
    const entities = window.get3D().getSandbox().entities;
    const visible = object => {
      if (!object) return false;
      for (let node = object; node; node = node.parent) if (!node.visible) return false;
      return true;
    };
    const projectiles = [0, 1].flatMap(row => Array.from({ length: 6 }, (_, column) => {
      const id = 900 + row * 10 + column, visual = entities.projectiles.get(id);
      const burst = [];
      visual.burst.traverse(object => {
        if (!object.isMesh && !object.isSprite) return;
        burst.push({ name: object.name, type: object.type, geometry: object.geometry?.type,
          visible: visible(object), color: object.material.color?.toArray(),
          transform: [...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()] });
      });
      return { id, kind: visual.kind, team: visual.team, visible: visible(visual.group), marker: visible(visual.marker), ring: visible(visual.effect),
        position: visual.group.position.toArray(),
        color: visual.line.material.color.toArray(), opacity: visual.line.material.opacity, line: visible(visual.line),
        material: visual.line.material.uuid, ringColor: visual.effect.material.color.toArray(), markerColor: visual.marker.children[0].material.color.toArray(),
        modelKind: visual.marker.userData.equipmentKind, modelGeometry: visual.marker.geometry.uuid,
        ringScale: visual.effect.scale.toArray(), ringOpacity: visual.effect.material.opacity, ttl: visual.projectile.ttl,
        burstVisible: visible(visual.burst), burst, blast: visible(visual.blast), shards: visible(visual.shards),
        shardCount: visual.shards.count, shardMatrices: Array.from(visual.shards.instanceMatrix.array.slice(0, visual.shards.count * 16)),
        objects: [visual.group.uuid, visual.burst.uuid, visual.marker.uuid, visual.effect.uuid, visual.line.uuid, visual.line.geometry.uuid] };
    }));
    const instances = mesh => ({ count: mesh.count, capacity: mesh.instanceMatrix.array.length / 16, geometry: mesh.geometry.uuid, material: mesh.material.uuid, materialColor: mesh.material.color.toArray(),
      colors: Array.from(mesh.instanceColor?.array.slice(0, mesh.count * 3) || []),
      matrices: Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16)) });
    return { projectiles, smoke: instances(entities.smoke), flames: instances(entities.flames) };
  });
  await seek(150);
  assert.deepEqual(await page.evaluate(() => window.sceneErrors), [], 'numeric and aliased projectile types render without stopping the animation loop');
  const flyingGrenades = await grenadeState();
  for (const row of [0, 1]) {
    const grenades = flyingGrenades.projectiles.slice(row * 6, row * 6 + 6), first = grenades[0];
    assert.equal(new Set(grenades.map(grenade => grenade.modelGeometry)).size, 6, 'all utility types have distinct physical models');
    for (const grenade of grenades) {
      assert.equal(grenade.modelKind, grenade.kind);
      assert.ok(grenade.marker && grenade.line && !grenade.burstVisible, 'every grenade type has a flying marker and trajectory before detonation');
      assert.deepEqual(grenade.color, first.color, 'all six grenade types have byte-identical team trajectory RGB');
      assert.equal(grenade.opacity, first.opacity, 'all six grenade types have identical team trajectory opacity');
      assert.equal(grenade.material, first.material, 'same-team trajectories share one material regardless of grenade kind');
    }
  }
  const ctTrail = flyingGrenades.projectiles[0].color, tTrail = flyingGrenades.projectiles[6].color;
  assert.ok(ctTrail[2] > ctTrail[0] && tTrail[0] > tTrail[2] && tTrail[1] > tTrail[2], 'CT trajectories are blue and T trajectories are yellow');
  await page.screenshot({ path: resolve(output, 'scene-grenade-trails.png') });
  await seek(200);
  const birthEffects = await grenadeState();
  const widths = instances => Array.from({ length: instances.count }, (_, i) =>
    Math.hypot(...instances.matrices.slice(i * 16, i * 16 + 3)));
  for (const instances of [birthEffects.smoke, birthEffects.flames]) {
    assert.ok(widths(instances).every(width => width === 0), 'smoke and fire begin at zero size on the exact activation timestamp');
  }
  await seek(240);
  const earlyEffects = await grenadeState();
  assert.ok(widths(earlyEffects.smoke).some(width => width > 0), 'smoke starts expanding continuously after detonation');
  const earlyFireWidths = widths(earlyEffects.flames);
  assert.ok(earlyFireWidths[0] > 0 && earlyFireWidths.slice(37, 61).every(width => width === 0), 'fire ignites at the center before its outer row');
  await page.screenshot({ path: resolve(output, 'scene-grenade-spread-start.png') });
  await seek(320);
  const grenadeBursts = await grenadeState();
  assert.ok(widths(grenadeBursts.smoke).every((width, i) => width > widths(earlyEffects.smoke)[i]), 'every smoke lobe grows between source frames');
  assert.ok(widths(grenadeBursts.flames)[0] > earlyFireWidths[0], 'central flame grows while the ignition wave advances');
  assert.equal(grenadeBursts.smoke.count, 14, 'both smoke grenades have their own seven-instance cloud');
  assert.equal(grenadeBursts.flames.count, 244, 'four molotov/incendiary areas each use a dense 61-cone flame field');
  assert.ok(grenadeBursts.flames.capacity >= 610, 'the flame batch has capacity for at least ten simultaneous areas');
  for (const instances of [grenadeBursts.smoke, grenadeBursts.flames]) {
    assert.deepEqual(instances.materialColor, [1, 1, 1], 'instanced effect material is neutral white so it does not tint team colors');
    for (let i = 0; i < instances.count; i++) {
      const [r, g, b] = instances.colors.slice(i * 3, i * 3 + 3);
      assert.ok(i < instances.count / 2 ? b > r : r > b && g > b, 'smoke and fire instances retain their thrower team hue');
    }
  }
  for (const row of [0, 1]) {
    for (const grenade of grenadeBursts.projectiles.slice(row * 6, row * 6 + 6)) {
      assert.equal(grenade.team, row ? 2 : 3, 'every effect resolves the actual thrower team');
      for (const [r, g, b] of [grenade.markerColor, grenade.ringColor, ...grenade.burst.filter(object => object.visible && object.color).map(object => object.color)]) {
        assert.ok(row ? r > b && g > b : b > r, 'markers, blast clouds, fragments and rings preserve the thrower team hue');
      }
    }
    const [he, flash] = grenadeBursts.projectiles.slice(row * 6, row * 6 + 2);
    assert.ok(!he.marker && !flash.marker, 'HE and flash replace their flying markers with distinct detonation effects');
    assert.ok(he.burstVisible && he.blast && he.shards && he.shardCount === 8 && !he.ring, 'HE displays only its solid blast cloud and eight fragments, with no bottom ring');
    assert.ok(flash.ring && !flash.burstVisible && !flash.blast && !flash.shards, 'flash displays an expanding ring without a star, cloud or fragments');
    for (const grenade of grenadeBursts.projectiles.slice(row * 6 + 2, row * 6 + 5)) {
      assert.ok(grenade.visible && !grenade.ring, 'smoke, molotov and incendiary effects have no bottom ring');
    }
  }
  await seek(700);
  const settledEffects = await grenadeState();
  assert.ok(widths(settledEffects.smoke).every((width, i) => width > widths(grenadeBursts.smoke)[i]), 'smoke reaches its full footprint after the bloom');
  for (const [zone, projectileIndex] of [3, 4, 9, 10].entries()) {
    const position = settledEffects.projectiles[projectileIndex].position;
    const points = Array.from({ length: 61 }, (_, i) => {
      const matrix = settledEffects.flames.matrices.slice((zone * 61 + i) * 16, (zone * 61 + i + 1) * 16);
      const dx = (matrix[12] - position[0]) / 95, dz = (matrix[14] - position[2]) / 95;
      const width = Math.max(Math.hypot(...matrix.slice(0, 3)), Math.hypot(...matrix.slice(8, 11))) / 95;
      return { radius: Math.hypot(dx, dz), width, angle: Math.atan2(dz, dx) };
    });
    assert.ok(points.some(point => point.radius < .02), 'each fire area fills its center');
    assert.ok(points.filter(point => point.radius < .7).length >= 25, 'dense interior cones fill the fire footprint');
    const perimeter = points.filter(point => point.radius > .8);
    assert.ok(perimeter.length >= 20, 'a dense outer row makes the fire boundary readable');
    const sectors = new Set(perimeter.map(point => Math.floor((point.angle + Math.PI) / (2 * Math.PI) * 12) % 12));
    assert.equal(sectors.size, 12, 'outer flames cover the complete perimeter without missing angular sectors');
    assert.ok(points.every(point => point.radius + point.width <= 1.025), 'flame bases remain within the intended effect radius');
  }
  await page.screenshot({ path: resolve(output, 'scene-grenade-spread-full.png') });
  await seek(240);
  assert.deepEqual(await grenadeState(), earlyEffects, 'reverse seeking exactly reconstructs the early smoke bloom and radial ignition wave');
  await seek(320);
  await page.screenshot({ path: resolve(output, 'scene-grenade-effects.png') });
  await seek(500);
  const expandedRings = await grenadeState();
  for (const index of [1, 7]) {
    assert.ok(expandedRings.projectiles[index].ringScale[0] > grenadeBursts.projectiles[index].ringScale[0], 'the flash ring expands as replay time advances');
    assert.ok(expandedRings.projectiles[index].ringOpacity < grenadeBursts.projectiles[index].ringOpacity, 'the expanding flash ring gradually fades');
  }
  await seek(320);
  assert.deepEqual(await grenadeState(), grenadeBursts, 'reverse seek restores the earlier flash ring radius and opacity');
  await page.waitForTimeout(100);
  await page.evaluate(async () => {
    window.props3d.projectileConfigs = { ...window.props3d.projectileConfigs };
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  assert.deepEqual(await grenadeState(), grenadeBursts, 'paused explosion shapes, instance colors and transforms are deterministic across wall-clock time');
  await page.evaluate(() => { window.props3d.hiddenPlayerIds = [1]; });
  await seek(321);
  const hiddenGrenades = await grenadeState();
  assert.ok(hiddenGrenades.projectiles.slice(0, 6).every(projectile => !projectile.visible && !projectile.burstVisible), 'hiding the CT thrower removes every CT grenade effect');
  assert.equal(hiddenGrenades.smoke.count, 7);
  assert.equal(hiddenGrenades.flames.count, 122);
  await page.evaluate(() => { window.props3d.hiddenPlayerIds = []; });
  await seek(800);
  const ttlExpiredGrenades = await grenadeState();
  assert.ok(ttlExpiredGrenades.projectiles.filter(projectile => projectile.kind !== 'hegrenade').every(projectile => !projectile.visible), 'flash, smoke, fire and decoy expire at exactly zero remaining TTL');
  assert.equal(ttlExpiredGrenades.smoke.count, 0);
  assert.equal(ttlExpiredGrenades.flames.count, 0);
  await seek(849);
  const lastHeFrame = await grenadeState();
  assert.ok([0, 6].every(index => lastHeFrame.projectiles[index].visible && lastHeFrame.projectiles[index].ttl > 0), 'HE remains visible immediately before its 650 ms blast lifetime ends');
  await seek(850);
  const expiredGrenades = await grenadeState();
  assert.ok(expiredGrenades.projectiles.every(projectile => !projectile.visible && !projectile.burstVisible), 'expired effects leave no visible projectile or burst group');
  assert.ok([0, 6].every(index => expiredGrenades.projectiles[index].ttl > 0 && !expiredGrenades.projectiles[index].ring), 'HE disappears after 650 ms despite positive parser TTL, without leaving a ring');
  assert.equal(expiredGrenades.smoke.count, 0);
  assert.equal(expiredGrenades.flames.count, 0);
  await page.evaluate(() => { window.clickedProjectile = null; });
  const expiredHePoint = await entityScreenPoint('projectile-900');
  await page.mouse.click(expiredHePoint.x, expiredHePoint.y);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.evaluate(() => window.clickedProjectile), null, 'an expired HE blast leaves no invisible hit area that can intercept a click');
  await seek(320);
  assert.deepEqual(await grenadeState(), grenadeBursts, 'reverse seek restores the exact colored HE, flash, smoke and fire poses with the same pooled objects');
  await seek(150);
  assert.deepEqual((await grenadeState()).projectiles.map(projectile => projectile.objects), flyingGrenades.projectiles.map(projectile => projectile.objects), 'all projectile meshes and trajectories are reused across detonation, expiry and reverse seek');
  await page.evaluate(() => {
    window.originalDenseFireFrames = window.props3d.frames;
    window.props3d.frames = window.props3d.frames.map(frame => ({ ...frame,
      projectiles: Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
        const entityID = 950 + index;
        return [entityID, { ...frame.projectiles[903], entityID, type: index % 2 ? 503 : 502,
          throwerID: index < 5 ? 1 : 2, x: (index % 5 - 2) * 400, y: index < 5 ? 250 : -250 }];
      })),
    }));
  });
  await seek(320);
  const tenFires = await page.evaluate(() => {
    const entities = window.get3D().getSandbox().entities;
    return { count: entities.flames.count, capacity: entities.flames.instanceMatrix.array.length / 16,
      geometry: entities.flames.geometry.uuid, material: entities.flames.material.uuid,
      zones: Array.from({ length: 10 }, (_, index) => entities.projectiles.get(950 + index).group.visible) };
  });
  assert.equal(tenFires.count, 610, 'ten simultaneous fire areas are fully rendered without truncating later zones');
  assert.ok(tenFires.capacity >= 610 && tenFires.zones.every(Boolean), 'the full ten-area stress fixture remains visible');
  assert.equal(tenFires.geometry, grenadeBursts.flames.geometry, 'dense fire areas share the same cone geometry');
  assert.equal(tenFires.material, grenadeBursts.flames.material, 'adding fire areas reuses the existing instanced material');
  await page.evaluate(() => { window.props3d.frames = window.originalDenseFireFrames; });
  await seek(320);
  assert.deepEqual(await grenadeState(), grenadeBursts, 'returning from ten fire areas restores the original instance transforms and colors');
  // The middle smoke naturally fades during recovery; the right smoke is outside both blasts.
  await page.evaluate(() => {
    window.props3d.projectileConfigs = { 505: { explosionRadius: 160, durationInMs: 20000 },
      506: { explosionRadius: 160, durationInMs: 3000, canClearSmoke: true } };
    window.props3d.frames = Array.from({ length: 131 }, (_, tick) => {
      const timeMs = tick * 100;
      const smoke = (entityID, x, expiry, throwerID) => ({ entityID, type: '505', x, y: 0, z: 0,
        throwerID, isExploded: true, ttl: Math.max(0, expiry - timeMs) });
      return { timeMs, tick, round: 1, players: {}, projectiles: {
        1001: smoke(1001, -800, 12000, 1), 1002: smoke(1002, 0, 4700, 2), 1003: smoke(1003, 800, 12000, 1),
        ...(timeMs <= 400 ? Object.fromEntries([-800, 0].map((x, i) => [1010 + i, {
          entityID: 1010 + i, type: '506', x: x + 100, y: 0, z: 60, throwerID: 1,
          isExploded: timeMs >= 200, ttl: timeMs >= 200 ? 3200 - timeMs : undefined,
        }])) : {}),
      } };
    });
  });
  const smokeState = () => page.evaluate(() => {
    const entities = window.get3D().getSandbox().entities, mesh = entities.smoke;
    return { count: mesh.count, matrices: Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16)),
      visible: [1001, 1002, 1003].map(id => entities.projectiles.get(id)?.group.visible),
      holes: [0, 7, 14].map(i => ({ count: entities.smokeHoles.rows.getY(i),
        sphere: entities.smokeHoles.rows.getY(i) ? Array.from(entities.smokeHoles.data.slice(i * 16 * 4, i * 16 * 4 + 4)) : [] })),
      geometry: mesh.geometry.uuid, material: mesh.material.uuid };
  });
  await seek(199); const unbrokenSmoke = await smokeState();
  assert.equal(unbrokenSmoke.count, 21);
  await page.screenshot({ path: resolve(output, 'smoke-clear-before.png') });
  await seek(200); const clearedSmoke = await smokeState();
  assert.deepEqual(clearedSmoke.visible, [true, true, true], 'HE cuts local holes without hiding the cloud');
  assert.equal(clearedSmoke.count, 21, 'all cloud puffs remain in place');
  assert.deepEqual(clearedSmoke.holes.map(h=>h.count), [1, 1, 0]);
  assert.deepEqual(clearedSmoke.holes[0].sphere, [-700, 60, -0, 160], 'the hole uses the exact blast world position and radius');
  await page.screenshot({ path: resolve(output, 'smoke-clear-empty.png') });
  await seek(1199); assert.equal((await smokeState()).holes[0].sphere[3], 160, 'the cut-out stays full size for one second');
  await seek(1200); assert.equal((await smokeState()).holes[0].sphere[3], 160, 'recovery begins at exactly one second');
  const localCutPixels = await page.evaluate(() => {
    const s = window.get3D().getSandbox(), gl = s.renderer.getContext(), rows = s.entities.smokeHoles.rows;
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const read = () => { s.renderer.render(s.scene, s.camera); const bytes = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes; };
    const cut = read(), saved = rows.array.slice();
    for (let i=0; i<rows.count; i++) rows.setY(i, 0);
    rows.needsUpdate = true; const full = read();
    rows.array.set(saved); rows.needsUpdate = true; s.renderer.render(s.scene, s.camera);
    let blueCut=0, blueFull=0, changedRight=0;
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const k=(y*width+x)*4;
      if(x<width/3) {
        if(cut[k+2]>cut[k]+10 && cut[k+2]>cut[k+1]+3) blueCut++;
        if(full[k+2]>full[k]+10 && full[k+2]>full[k+1]+3) blueFull++;
      }
      if(x>width*2/3 && Math.abs(cut[k]-full[k])+Math.abs(cut[k+1]-full[k+1])+Math.abs(cut[k+2]-full[k+2])>3) changedRight++;
    }
    return {blueCut,blueFull,changedRight};
  });
  assert.ok(localCutPixels.blueCut > 100 && localCutPixels.blueCut < localCutPixels.blueFull * .95, 'rendered smoke loses a local portion, while the rest stays visible');
  assert.equal(localCutPixels.changedRight, 0, 'another cloud outside the blast is pixel-identical');
  await page.screenshot({ path: resolve(output, 'smoke-local-hole.png') });
  await seek(2200); const halfRestored = await smokeState();
  assert.equal(halfRestored.count, 21);
  await page.screenshot({ path: resolve(output, 'smoke-clear-recovering.png') });
  const smokeWidth = (state, instance) => Math.hypot(...state.matrices.slice(instance * 16, instance * 16 + 3));
  await seek(3000); const naturallyFading = await smokeState();
  assert.ok(naturallyFading.holes[0].sphere[3] < halfRestored.holes[0].sphere[3], 'the local hole shrinks as smoke recovers');
  assert.ok(smokeWidth(naturallyFading, 7) < smokeWidth(halfRestored, 7), 'natural fading takes priority and never regrows the expiring cloud');
  await seek(3200); const restoredSmoke = await smokeState();
  await page.screenshot({ path: resolve(output, 'smoke-clear-restored-and-fading.png') });
  // Compare against the same time without clearance to exclude natural breath/fade differences.
  await page.evaluate(() => { window.props3d.projectileConfigs = { ...window.props3d.projectileConfigs,
    506: { explosionRadius: 160, durationInMs: 3000, canClearSmoke: false } }; });
  await seek(3200); const normalSmoke = await smokeState();
  assert.ok(Math.abs(smokeWidth(restoredSmoke, 0) - smokeWidth(normalSmoke, 0)) < .001, 'non-expiring smoke restores fully at three seconds');
  assert.deepEqual(restoredSmoke.matrices, normalSmoke.matrices, 'cut-outs never resize or move the underlying cloud, including its natural fade');
  assert.equal(restoredSmoke.holes[0].count, 0, 'the recovered cloud has no remaining hole at three seconds');
  assert.equal(restoredSmoke.holes[1].sphere[3], 80, 'natural fade freezes the local hole radius at fade onset');
  await page.evaluate(() => { window.props3d.projectileConfigs = { ...window.props3d.projectileConfigs,
    506: { explosionRadius: 160, durationInMs: 3000, canClearSmoke: true } }; });
  await seek(2200); assert.deepEqual(await smokeState(), halfRestored, 'config changes and reverse seeking reproduce the exact recovery pose');
  await page.waitForTimeout(150); assert.deepEqual(await smokeState(), halfRestored, 'paused recovery does not advance with wall time');
  await seek(199); assert.deepEqual(await smokeState(), unbrokenSmoke, 'seeking before the explosion restores the original cloud');
  await seek(4700); assert.deepEqual((await smokeState()).visible, [true, false, true], 'expired smoke cannot be resurrected by restoration');
  await seek(12000); assert.equal((await smokeState()).count, 0, 'normal expiry removes every cloud');
  assert.equal(restoredSmoke.geometry, unbrokenSmoke.geometry);
  assert.equal(restoredSmoke.material, unbrokenSmoke.material);
  await page.evaluate(() => {
    const sandbox = window.get3D().getSandbox();
    sandbox.scene.remove(sandbox.scene.getObjectByName('projectile-qa-stage'));
    sandbox.scene.getObjectByName('map-whitebox').visible = true;
    window.props3d.frames = window.originalGrenadeFixture.frames;
    window.props3d.projectileConfigs = window.originalGrenadeFixture.configs;
    window.props3d.currentTimeMs = 0;
    window.get3D().resetView();
  });
  await seek(0);

  await page.mouse.move(760, 480); await page.mouse.down(); await page.mouse.move(970, 545, { steps: 12 }); await page.mouse.up();
  await page.waitForTimeout(350);
  assert.notDeepEqual((await snapshot()).camera, initial.camera, 'left drag rotates the view');
  const beforeZoom = await snapshot();
  await page.mouse.wheel(0, -300); await page.waitForTimeout(350);
  assert.ok((await snapshot()).zoom > beforeZoom.zoom, 'wheel zooms toward scene');
  const smoothZoom = await page.evaluate(async () => {
    const s = window.get3D().getSandbox(); s.resetView();
    const canvas = s.renderer.domElement, start = s.camera.zoom;
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, cancelable: true }));
    const immediate = s.camera.zoom, samples = [];
    const started = performance.now();
    while (performance.now() - started < 650) {
      await new Promise(requestAnimationFrame); samples.push(s.camera.zoom);
    }
    // Reversal must immediately change direction even if an earlier zoom is queued.
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, cancelable: true }));
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, cancelable: true }));
    const beforeReverse = s.camera.zoom;
    await new Promise(resolve => setTimeout(resolve, 120));
    const reversed = s.camera.zoom;
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, cancelable: true }));
    s.resetView();
    await new Promise(resolve => setTimeout(resolve, 150));
    const resetZoom = s.camera.zoom;
    const beforePan = s.controls.target.clone();
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaX: 25, deltaY: 10, cancelable: true }));
    const trackpadPanned = !s.controls.target.equals(beforePan);
    s.resetView();
    return { start, immediate, samples, expected: start * Math.exp(120 * .0016 * s.controls.zoomSpeed),
      beforeReverse, reversed, resetZoom, trackpadPanned };
  });
  assert.equal(smoothZoom.start, 1.5, 'default framing is 150% of the previous view');
  assert.equal(smoothZoom.immediate, smoothZoom.start, 'wheel input does not jump the camera synchronously');
  assert.ok(smoothZoom.samples.filter(z => z > smoothZoom.start && z < smoothZoom.expected - .001).length >= 2, 'zoom travels through intermediate rendered positions');
  for (let i = 1; i < smoothZoom.samples.length; i++) assert.ok(smoothZoom.samples[i] >= smoothZoom.samples[i - 1], 'zoom converges without overshoot or jitter');
  assert.ok(Math.abs(smoothZoom.samples.at(-1) - smoothZoom.expected) < .005, 'zoom settles promptly at the wheel target');
  assert.ok(smoothZoom.reversed < smoothZoom.beforeReverse, 'opposite scrolling responds without unwinding queued zoom');
  assert.equal(smoothZoom.resetZoom, 1.5, 'reset cancels pending wheel motion');
  assert.ok(smoothZoom.trackpadPanned, 'two-axis trackpad gestures retain panning');
  const beforePan = await snapshot();
  await page.mouse.down({ button: 'right' }); await page.mouse.move(850, 485, { steps: 10 }); await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(350);
  assert.notDeepEqual((await snapshot()).target, beforePan.target, 'right drag pans');
  await page.evaluate(() => window.get3D().resetView());
  await page.waitForTimeout(350);
  const reset = await snapshot();
  assert.equal(reset.zoom, initial.zoom);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(reset.camera[i] - initial.camera[i]) < 1);
  const mapClick = await page.evaluate(() => {
    const s = window.get3D().getSandbox(), rect = s.renderer.domElement.getBoundingClientRect();
    const ray = new window.THREE.Raycaster();
    for (const x of [.7, .3, .6, .4]) for (const y of [.4, .6, .3, .7]) {
      const event = { clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * y };
      if (s.intersection(event, false)) continue; // Preserve entity click behavior.
      ray.setFromCamera(new window.THREE.Vector2(x * 2 - 1, 1 - y * 2), s.camera);
      const hit = ray.intersectObject(s.scene.getObjectByName('map-whitebox'), true)[0];
      if (!hit || Math.abs(hit.point.y - s.controls.target.y) < 20) continue;
      return { x: event.clientX, y: event.clientY, point: hit.point.toArray(),
        position: s.camera.position.toArray(), target: s.controls.target.toArray(),
        quaternion: s.camera.quaternion.toArray(), zoom: s.camera.zoom };
    }
    throw new Error('No unobstructed elevated map surface for centering check');
  });
  await page.mouse.click(mapClick.x, mapClick.y);
  const mapPanSamples = await page.evaluate(async point => {
    const s = window.get3D().getSandbox(), samples = [], started = performance.now();
    while (performance.now() - started < 900) {
      await new Promise(requestAnimationFrame);
      const projected = new window.THREE.Vector3(...point).project(s.camera);
      samples.push({ position: s.camera.position.toArray(), target: s.controls.target.toArray(),
        quaternion: s.camera.quaternion.toArray(), zoom: s.camera.zoom, offset: Math.hypot(projected.x, projected.y) });
    }
    return samples;
  }, mapClick.point);
  assert.ok(mapPanSamples.filter(v => v.offset > .001 && v.offset < .3).length >= 2, 'single map click animates through intermediate positions');
  for (const sample of mapPanSamples) {
    assert.equal(sample.zoom, mapClick.zoom, 'map click preserves magnification');
    assert.ok(Math.abs(sample.position[1] - mapClick.position[1]) < 1e-6, 'map click preserves camera height');
    assert.ok(Math.abs(sample.target[1] - mapClick.target[1]) < 1e-6, 'map click translates only the horizontal plane');
    sample.quaternion.forEach((v, i) => assert.ok(Math.abs(v - mapClick.quaternion[i]) < 1e-6, 'map click preserves viewing angles'));
  }
  assert.ok(mapPanSamples.at(-1).offset < 1e-6, 'clicked surface reaches the screen center even above or below the target height');
  await page.evaluate(() => window.get3D().resetView());
  await page.waitForTimeout(50);
  await page.screenshot({ path: resolve(output, 'scene-overview.png') });
  console.log('SCENE:', JSON.stringify(reset.info));
  if (realRound) {
    const realSnapshot = await page.evaluate(async meta => {
      const round = await (await fetch('/api/round')).json();
      let best = 0, bestScore = -1;
      for (let i = 0; i < round.frames.length; i++) {
        const score = Object.values(round.frames[i].projectiles || {}).reduce((sum, p) => sum + (p.isExploded ? 1 : 5), 0);
        if (score > bestScore) { best = i; bestScore = score; }
      }
      Object.assign(window.props3d, { frames: round.frames, replayMeta: meta, currentFrameIndex: best, currentTimeMs: round.frames[best].timeMs + 20 });
      return { timeMs: window.props3d.currentTimeMs, projectileCount: Object.keys(round.frames[best].projectiles || {}).length };
    }, fixtureMeta);
    await page.waitForFunction(() => window.get3D().inspect().players.length > 2 || window.sceneErrors.length);
    assert.deepEqual(await page.evaluate(() => window.sceneErrors), [], 'actual parsed round renders without swallowed component errors');
    await page.screenshot({ path: resolve(output, 'scene-replay.png') });
    await page.evaluate(() => {
      const s = window.get3D().getSandbox();
      s.controls.target.set(650, 90, -100);
      s.camera.position.copy(s.controls.target).add(new window.THREE.Vector3(1400, 1800, 1500));
      s.camera.zoom = 2.7; s.camera.updateProjectionMatrix();
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(output, 'scene-stone-closeup.png') });
    await page.evaluate(() => window.get3D().resetView());
    await page.evaluate(() => {
      const s = window.get3D().getSandbox();
      s.camera.position.copy(s.controls.target).add(s.controls.target.clone().set(0, 9000, 1));
    });
    await page.waitForTimeout(180);
    await page.screenshot({ path: resolve(output, 'scene-top.png') });
    await page.evaluate(() => window.get3D().resetView());
    console.log('Real round visual sample:', JSON.stringify(realSnapshot));
    const reuse = await page.evaluate(async () => {
      const { currentTimeMs } = window.props3d;
      const before = window.get3D().inspect();
      for (let i = 0; i < 90; i++) {
        window.props3d.currentTimeMs = currentTimeMs + i % 5;
        await new Promise(requestAnimationFrame);
      }
      return { before, after: window.get3D().inspect() };
    });
    assert.equal(reuse.after.geometries, reuse.before.geometries, 'ten-player display refresh does not recreate GPU geometry');
    assert.equal(reuse.after.textures, reuse.before.textures, 'names and materials keep their textures across refreshes');
    console.log('Real round render budget:', JSON.stringify({ players: reuse.after.players.length,
      projectiles: reuse.after.projectiles.length, drawCalls: reuse.after.drawCalls, triangles: reuse.after.triangles,
      geometries: reuse.after.geometries, textures: reuse.after.textures }));
    const flight = await page.evaluate(() => {
      const flights = new Map();
      window.props3d.frames.forEach((frame, index) => {
        for (const [id, p] of Object.entries(frame.projectiles || {})) {
          if (p.isExploded) continue;
          const list = flights.get(id) || [];
          list.push({ index, time: frame.timeMs, p });
          flights.set(id, list);
        }
      });
      const [id, points] = [...flights].sort((a, b) => b[1].length - a[1].length)[0];
      const at = points[Math.floor(points.length * .7)];
      window.props3d.currentFrameIndex = at.index;
      window.props3d.currentTimeMs = at.time + 15;
      const s = window.get3D().getSandbox();
      const target = s.controls.target.clone().set((points[0].p.x + at.p.x) / 2,
        (points[0].p.z + at.p.z) / 2, -(points[0].p.y + at.p.y) / 2);
      s.camera.position.copy(target).add(target.clone().set(2800, 2300, -1500));
      s.controls.target.copy(target);
      s.camera.zoom = 3;
      s.camera.updateProjectionMatrix();
      return Number(id);
    });
    await page.waitForFunction(id => window.get3D().getSandbox().scene.getObjectByName(`trajectory-${id}`)?.geometry.drawRange.count > 10, flight);
    await page.waitForTimeout(120);
    await page.screenshot({ path: resolve(output, 'scene-flight.png') });
    const arc = await page.evaluate(id => {
      const line = window.get3D().getSandbox().scene.getObjectByName(`trajectory-${id}`);
      const count = line.geometry.drawRange.count;
      const array = line.geometry.attributes.position.array;
      const start = [array[0], array[1], array[2]];
      const d = [0, 1, 2].map(axis => array[(count - 1) * 3 + axis] - start[axis]);
      const length2 = d.reduce((sum, x) => sum + x * x, 0);
      let deviation = 0;
      for (let i = 1; i < count - 1; i++) {
        const v = [0, 1, 2].map(axis => array[i * 3 + axis] - start[axis]);
        const u = v.reduce((sum, x, axis) => sum + x * d[axis], 0) / length2;
        deviation = Math.max(deviation, Math.hypot(...v.map((x, axis) => x - u * d[axis])));
      }
      return { points: count, deviation };
    }, flight);
    assert.ok(arc.deviation > 10, 'real flight retains its curved recorded path instead of a launch-to-current chord');
    console.log('Real flight trajectory:', JSON.stringify(arc));
    const realDeath = await page.evaluate(() => {
      const frames = window.props3d.frames;
      for (let i = 1; i < frames.length; i++) {
        const frame = frames[i], previous = frames[i - 1];
        if (previous.round !== frame.round || frame.timeMs + 1000 > frames.at(-1).timeMs) continue;
        for (const [id, player] of Object.entries(frame.players)) {
          if (!previous.players[id]?.alive || player.alive || ![player.x, player.y, player.z].every(Number.isFinite)) continue;
          const later = frames.findLast(f => f.timeMs <= frame.timeMs + 1000);
          if (later.round !== frame.round || !later.players[id] || later.players[id].alive) continue;
          const sandbox = window.get3D().getSandbox();
          const target = sandbox.controls.target.clone().set(player.x, player.z + 30, -player.y);
          sandbox.controls.target.copy(target);
          sandbox.camera.position.copy(target).add(target.clone().set(650, 520, -550));
          sandbox.camera.zoom = 8;
          sandbox.camera.updateProjectionMatrix();
          return { id: Number(id), timeMs: frame.timeMs, round: frame.round };
        }
      }
      return null;
    });
    assert.ok(realDeath, 'real fixture contains a death and one second of subsequent replay');
    for (const [phase, offset] of [['alive', -1], ['fragments', 250], ['gone', 1000]]) {
      await seek(realDeath.timeMs + offset);
      await page.waitForFunction(({ id, dead, fragments }) => {
        const visual = window.get3D().getSandbox().entities.players.get(id);
        return visual?.group.visible && visual.corpse.visible === fragments && visual.label.visible === !dead && visual.fieldOfView.visible === !dead;
      }, { id: realDeath.id, dead: offset >= 0, fragments: offset >= 0 && offset < 800 });
      await page.screenshot({ path: resolve(output, `scene-death-${phase}.png`) });
    }
    console.log('Real death visual sample:', JSON.stringify(realDeath));
    const realShot = await page.evaluate(() => {
      const sandbox = window.get3D().getSandbox();
      const raycaster = new sandbox.groundRaycaster.constructor();
      const obstacles = [];
      sandbox.scene.getObjectByName('map-whitebox').traverse(object => {
        if (object.isMesh && ['map-wall', 'map-cover', 'map-terrain'].includes(object.name)) obstacles.push(object);
      });
      const seenPlayers = new Set();
      let best;
      // Select a clear real firing view; the earliest shot can be inside a
      // doorway where a foreground wall correctly hides most of the flame.
      for (const [index, frame] of window.props3d.frames.entries()) {
        for (const [id, player] of Object.entries(frame.players)) {
          if (seenPlayers.has(id) || !player.alive || !(player.shotsFired > 0) || ![player.x, player.y, player.z].every(Number.isFinite)) continue;
          const yaw = (player.shotYaw ?? player.yaw ?? 0) * Math.PI / 180;
          const pitch = (player.pitch ?? 0) * Math.PI / 180;
          const direction = sandbox.controls.target.clone().set(Math.cos(pitch) * Math.cos(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.sin(yaw));
          const origin = sandbox.controls.target.clone().set(player.x, player.z + 52, -player.y);
          const wallDistance = sandbox.shotDistanceAt(origin, direction, 1800) ?? 1800;
          const event = sandbox.entities.shots.source.active(frame.round, frame.timeMs).find(event => event.shooterId === Number(id) && event.timeMs === frame.timeMs);
          if (!event || Math.min(wallDistance, event.hit?.distance ?? 1800) < 500) continue;
          seenPlayers.add(id);
          const target = sandbox.controls.target.clone().set(player.x + Math.cos(yaw) * 100, player.z + 55, -player.y - Math.sin(yaw) * 100);
          for (const side of [1, -1]) {
            const camera = target.clone().add(target.clone().set(Math.sin(yaw) * 850 * side, 1050, Math.cos(yaw) * 850 * side));
            let blocked = 0;
            for (const distance of [0, 42, 65, 170, 290]) {
              const point = origin.clone().addScaledVector(direction, distance);
              raycaster.set(camera, point.clone().sub(camera).normalize());
              raycaster.far = camera.distanceTo(point) - 2;
              if (raycaster.intersectObjects(obstacles, false).length) blocked++;
            }
            if (!best || blocked < best.blocked) best = { id: Number(id), timeMs: frame.timeMs, index, camera, target, blocked };
          }
        }
      }
      if (!best) return null;
      sandbox.controls.target.copy(best.target);
      sandbox.camera.position.copy(best.camera);
      sandbox.camera.zoom = 8;
      sandbox.camera.updateProjectionMatrix();
      window.props3d.currentFrameIndex = best.index;
      return { id: best.id, timeMs: best.timeMs, blocked: best.blocked };
    });
    assert.ok(realShot, 'real fixture contains a living player firing');
    await seek(realShot.timeMs + 45);
    await page.waitForFunction(({ id, timeMs }) => [...window.get3D().getSandbox().entities.shots.activeVisuals.values()].some(visual => visual.event.shooterId === id && visual.event.timeMs === timeMs && visual.bullet.visible), realShot);
    const actualShot = await shotState(realShot.id, realShot.timeMs);
    assert.ok(actualShot.effects.slice(0, 4).every(effect => effect.visible) && actualShot.effects[0].transform[0] > 100, 'actual replay shows a short bullet separated from the source muzzle flash');
    await page.screenshot({ path: resolve(output, 'scene-shot.png') });
    await seek(realShot.timeMs);
    await page.screenshot({ path: resolve(output, 'scene-shot-launch.png') });
    await seek(realShot.timeMs + 90);
    const advancedShot = await shotState(realShot.id, realShot.timeMs);
    assert.ok(advancedShot.effects[0].visible && !advancedShot.effects[2].visible && advancedShot.head > actualShot.head, 'the actual replay bullet continues forward after its launch flame has ended');
    await page.screenshot({ path: resolve(output, 'scene-shot-flight.png') });
    console.log('Real shooting visual sample:', JSON.stringify(realShot));
  }
  await page.evaluate(() => window.app3d.unmount());
  assert.equal(await page.locator('canvas').count(), 0, 'unmount releases canvas');
  assert.deepEqual(pageErrors, []);

  // Run the complete existing replay page as well: view persistence, fallback,
  // timeline, pure mode exit and the existing reverse-search entry point.
  await page.goto(url + '/replayer?demo_uuid=' + encodeURIComponent(fixtureMeta.uuid) + '&round=1');
  await page.getByRole('button', { name: '3D 沙盘', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.scene-view-switch button[aria-pressed="true"]')?.textContent?.includes('3D'));
  await page.locator('canvas').first().waitFor();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: resolve(output, 'replay-overview.png') });
  const playerCard = page.locator('.player-card-wrap[data-player-id="2"]:visible .player-pov-button');
  await playerCard.click({ position: { x: 8, y: 8 } });
  await page.getByRole('button', { name: '返回沙盘', exact: true }).waitFor();
  assert.equal(await playerCard.getAttribute('aria-pressed'), 'true');
  await page.getByRole('img', { name: '第一人称回放视角：跟随玩家视线，按 Escape 返回沙盘' }).waitFor();
  await page.screenshot({ path: resolve(output, 'replay-first-person.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '返回沙盘', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await playerCard.getAttribute('aria-pressed'), 'false');
  await playerCard.focus(); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '返回沙盘', exact: true }).waitFor();
  await page.getByRole('button', { name: '返回沙盘', exact: true }).click();
  assert.equal(await playerCard.getAttribute('aria-pressed'), 'false');
  await playerCard.click({ position: { x: 8, y: 8 } });
  await playerCard.click({ position: { x: 8, y: 8 } });
  await page.getByRole('button', { name: '返回沙盘', exact: true }).waitFor({ state: 'hidden' });
  const visibleCard = page.locator('.player-card-wrap[data-player-id="2"]:visible');
  await playerCard.click({ position: { x: 8, y: 8 } });
  await visibleCard.locator('.toggle-vis').click();
  await page.getByRole('button', { name: '返回沙盘', exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await playerCard.isDisabled(), true, 'card actions stay separate from camera selection');
  await visibleCard.locator('.toggle-vis').click();
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.locator('.map-canvas-element canvas').waitFor();
  await playerCard.click({ position: { x: 8, y: 8 } });
  await page.getByRole('button', { name: '返回沙盘', exact: true }).waitFor();
  await page.getByRole('img', { name: '第一人称回放视角：跟随玩家视线，按 Escape 返回沙盘' }).waitFor();
  assert.equal(await playerCard.getAttribute('aria-pressed'), 'true', 'clicking a card in 2D opens its first-person 3D view');
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await page.getByRole('button', { name: '返回沙盘', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.locator('.map-canvas-element canvas').waitFor();
  await page.reload();
  await page.getByRole('button', { name: '2D', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '2D', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '3D 沙盘', exact: true }).click();
  await page.getByRole('button', { name: '重置视角', exact: true }).waitFor();
  await page.getByRole('button', { name: '反查道具', exact: true }).click();
  await page.locator('.map-canvas-element canvas').waitFor();
  await page.getByRole('button', { name: '反查道具', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '3D 沙盘', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: '纯净视图', exact: true }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(output, 'replay-pure.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '重置视角', exact: true }).waitFor();
  await page.route('**/map/3d/de_ancient.json', route => route.fulfill({ status: 503, body: 'test: unavailable map' }));
  await page.reload();
  await page.locator('.map-canvas-element canvas').waitFor();
  assert.match(await page.locator('.tool-message.error').textContent(), /已切回 2D/, 'asset failure preserves a working 2D replay');
  assert.deepEqual(pageErrors, []);
  console.log('PASS: identical team trajectories across all grenade types, distinct HE/flash shapes and colored smoke/fire, numeric/aliased projectile types, independent team-colored moving bullets, exact player/wall impacts and clock-driven muzzle flashes, softly lit stone 3D map, team-colored horizontal field of view, deterministic clock-driven death fragments and hidden names, XYZ interpolation, exact detonation, effect hit testing, entity reuse/visibility, orbit/pan/zoom/focus/reset, teardown, failed-asset 2D fallback, preference persistence and reverse-search handoff');
  console.log('Visual checks:', output);
} finally {
  await browser?.close();
  await server.close();
}
