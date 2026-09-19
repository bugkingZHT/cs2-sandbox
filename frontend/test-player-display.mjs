import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { Container, Graphics, Text } from 'pixi.js';

let saved = JSON.stringify({ showMapPlayers: false, showMapProjectiles: false, showMapBomb: false, playerSize: 150, playerNameSize: 125 });
globalThis.localStorage = {
  getItem: () => saved,
  setItem: (_key, value) => { saved = value; },
};

async function withModules(check) {
  const server = await createServer({ configFile: 'vite.local.config.ts', server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { useMapDisplaySettings } = await server.ssrLoadModule('/src/composables/useMapDisplaySettings.ts');
    await check(useMapDisplaySettings(), server);
  } finally { await server.close(); }
}

await withModules(async (settings, server) => {
  assert.equal(settings.defaultMapView.value, '2d', 'users without a saved player preference default to 2D');
  assert.equal(settings.playerSize.value, 100, 'old circle midpoint becomes the new 100% default');
  assert.equal(settings.playerNameSize.value, 100);
  assert.equal(settings.playerHeightScaling.value, true, 'height scaling defaults on for existing settings');
  const { drawPlayersForFrame, updatePlayerLabelScale, resetPlayerRenderer } = await server.ssrLoadModule('/src/composables/playersRender.ts');
  const world = new Container();
  const playerLayer = new Container();
  world.addChild(playerLayer);
  world.scale.set(0.5);
  const options = {
    frame: { round: 1, players: { 1: { alive: true, x: 0, y: 0, yaw: 0, team: 3, name: 'Player' } } },
    playerLayer, currentFrameIndex: 0, isPlaying: false, isDragging: false,
    worldToMap: (x, y) => ({ x: x / 2.2, y: -y / 2.2 }),
  };
  drawPlayersForFrame(options);
  const circle = playerLayer.children.find(child => child instanceof Graphics);
  const label = playerLayer.children.find(child => child instanceof Text);
  assert.ok(circle.containsPoint({ x: 0, y: 16 }), '100% circle is 10% larger with a 16.5px radius');
  assert.ok(!circle.containsPoint({ x: 0, y: 18 }));
  assert.equal(label.style.fontSize, 30, '100% name matches the old 125% font size');
  const screenFontSize = () => label.style.fontSize * label.scale.x * world.scale.x;
  const screenCircleWidth = () => circle.getLocalBounds().width * world.scale.x;
  const initialFont = screenFontSize();
  const initialCircle = screenCircleWidth();
  world.scale.set(1);
  updatePlayerLabelScale(0.5);
  assert.equal(screenFontSize(), initialFont, 'paused names remain the same screen size after zoom');
  assert.equal(screenCircleWidth(), initialCircle * 2, 'circles follow map zoom proportionally');
  const screenGap = () => (label.y - 16.5) * world.scale.x;
  assert.ok(Math.abs(screenGap() - 2) < 1e-9, 'name spacing remains stable on screen');
  settings.playerSize.value = 150;
  settings.playerNameSize.value = 150;
  drawPlayersForFrame({ ...options, playerSize: 150, playerNameSize: 150, playerLabelScale: 0.5 });
  assert.ok(circle.containsPoint({ x: 0, y: 22 }));
  assert.ok(!circle.containsPoint({ x: 0, y: 27 }));
  assert.equal(screenFontSize(), initialFont * 1.5, 'name control updates existing labels while paused');
  assert.equal(playerLayer.children.length, 2, 'size changes reuse the existing player');
  world.scale.set(0.5);
  updatePlayerLabelScale(1);
  assert.equal(screenFontSize(), initialFont * 1.5, 'resetting zoom preserves the selected name size');

  const { MAP_CONFIGS, MAP_IMAGE_SIZE } = await server.ssrLoadModule('/src/config/map.ts');
  const scenarios = ['de_dust2', 'de_mirage', 'de_nuke'].map(name => ({
    name, range: MAP_CONFIGS[name].xRange, imageSize: MAP_IMAGE_SIZE, z: 100,
  }));
  scenarios.push(
    { name: 'double resolution', range: MAP_CONFIGS.de_dust2.xRange, imageSize: MAP_IMAGE_SIZE * 2, z: 100 },
    { name: 'lower floor with different scale', range: { start: -2000, end: 6000 }, imageSize: MAP_IMAGE_SIZE, z: -600 },
  );
  for (const scenario of scenarios) {
    const pixelsPerUnit = scenario.imageSize / (scenario.range.end - scenario.range.start);
    const worldToMap = (x, y, z) => {
      assert.equal(z, scenario.z, 'radius projection uses the same floor as the player');
      return { x: (x - scenario.range.start) * pixelsPerUnit + 1000, y: -y * pixelsPerUnit - 200 };
    };
    for (const alive of [true, false]) {
      for (const percent of [50, 100, 150]) {
        drawPlayersForFrame({
          ...options, worldToMap, playerSize: percent,
          frame: { round: 1, players: { 1: { alive, x: 300, y: 200, z: scenario.z, yaw: 0, team: 3, name: 'Player' } } },
        });
        const expectedWorldRadius = (alive ? 33 : 24.75) * 1.1 * percent / 100;
        const expectedPixelRadius = expectedWorldRadius * pixelsPerUnit;
        assert.ok(circle.containsPoint({ x: 0, y: expectedPixelRadius * 0.95 }), `${scenario.name}: world radius interior`);
        assert.ok(!circle.containsPoint({ x: 0, y: expectedPixelRadius * 1.1 }), `${scenario.name}: world radius exterior`);
        assert.equal(label.style.fontSize, 30, 'map scale does not change font size');
      }
    }
  }
  const drawShotCase = (state) => {
    drawPlayersForFrame({
      ...options,
      frame: { round: 1, players: { 1: { alive: true, x: 0, y: 0, yaw: 0, team: 3, activeWeapon: '303', ...state } } },
    });
    return circle.getLocalBounds();
  };
  assert.ok(drawShotCase({ buttons: [], shotsFired: 1, shotYaw: 0 }).width > 400, 'actual shot renders without a held attack button');
  assert.ok(drawShotCase({ buttons: [2048], shotsFired: 1, shotYaw: 0 }).width > 400, 'right-click fire renders from the event');
  assert.ok(drawShotCase({ buttons: [1], shotsFired: 0 }).width < 100, 'holding attack without a shot does not render gunfire');
  assert.ok(drawShotCase({ activeWeapon: '405', shotsFired: 1, shotYaw: 90 }).height > 400, 'switching to a knife does not hide an earlier shot; shot-time aim is retained');
  assert.ok(drawShotCase({ alive: false, shotsFired: 1, shotYaw: 0 }).width > 400, 'a shot just before death remains visible');
  assert.ok(drawShotCase({ activeWeapon: '405', buttons: [1], shotsFired: 0 }).width < 100, 'knife attack is not a gunshot');
  assert.ok(drawShotCase({ buttons: [1] }).width < 100, 'buttons alone never imply a gunshot');
  assert.ok(drawShotCase({ shotsFired: 0 }).width < 100, 'the following idle sample clears the shot effect');
  const { getPlayerHeightReferences, playerHeightScale } = await server.ssrLoadModule('/src/config/map.ts');
  const { inferGroundHeights, createPlayerHeightCalibration } = await server.ssrLoadModule('/src/composables/playerHeight.ts');
  if (process.env.CS_HEIGHT_ROUND_FILE) {
    const { readFileSync } = await import('node:fs');
    const existingRound = JSON.parse(readFileSync(process.env.CS_HEIGHT_ROUND_FILE, 'utf8'));
    const existingReferences = getPlayerHeightReferences(inferGroundHeights(existingRound.frames), -480);
    assert.ok(Number.isFinite(existingReferences.main) && Number.isFinite(existingReferences.lower), 'existing cached Nuke Z provides both reference planes without reparsing');
    assert.equal(playerHeightScale(existingReferences.main, existingReferences), 1);
    assert.equal(playerHeightScale(existingReferences.lower, existingReferences), 1);
    console.log('PASS: existing cached round, no parser metadata required:', existingReferences);
  }
  const zFrames = [0, 100, 200, 300, 400].map((timeMs, i) => ({ timeMs, round: 1, players: {
    1: { alive: true, z: -416 },
    2: { alive: true, z: -768 },
    3: { alive: false, z: -9000 },
    4: { alive: true, z: [0, 30, 40, 30, 0][i] },
    5: { alive: true, z: NaN },
  } }));
  assert.deepEqual(inferGroundHeights(zFrames), { '-416.00': 400, '-768.00': 400 }, 'existing stable feet Z yields both floors, excluding deaths, jumps and invalid data');
  const calibrate = createPlayerHeightCalibration();
  const initial = calibrate(zFrames, 'demo:nuke', -480);
  assert.equal(initial.main, -416);
  assert.equal(initial.lower, -768);
  const differentRound = zFrames.map(f => ({ ...f, round: 2, players: { 1: { alive: true, z: -320 } } }));
  assert.deepEqual(calibrate(differentRound, 'demo:nuke', -480), initial, 'switching rounds cannot change calibrated floors');
  assert.equal(calibrate(differentRound, 'other-demo:nuke', -480).main, -320, 'switching demos recalibrates even when the frame array is reused');
  const fillMissingFloor = createPlayerHeightCalibration();
  assert.equal(fillMissingFloor(differentRound, 'demo:nuke', -480).lower, undefined);
  const completed = fillMissingFloor(zFrames, 'demo:nuke', -480);
  assert.equal(completed.main, -320, 'existing floor baseline is fixed');
  assert.equal(completed.lower, -768, 'a newly encountered floor calibrates independently');
  assert.deepEqual(inferGroundHeights(zFrames.slice(0, 2)), {}, 'brief clips cannot establish a reliable reference plane');
  const references = getPlayerHeightReferences({ '-768': 50, '-752': 2, '-416': 500, '-288': 20 }, -480);
  assert.equal(references.main, -416);
  assert.equal(references.lower, -768, 'lower calibration is independent of upper-floor population');
  assert.equal(playerHeightScale(-416, references), 1);
  assert.equal(playerHeightScale(-768, references), 1, 'both floors have the same base size on their own ground');
  assert.equal(playerHeightScale(-416 + 128, references), playerHeightScale(-768 + 128, references), 'equal relative heights on both floors have equal size');
  assert.ok(playerHeightScale(-768 + 128, references) > 1);
  assert.ok(playerHeightScale(-768 - 128, references) < 1);
  assert.ok(playerHeightScale(-480, references) > 1, 'the threshold itself belongs to the lower radar layer');
  assert.equal(playerHeightScale(0, getPlayerHeightReferences({ '0': 100 })), 1, 'zero is a valid reference plane');
  assert.equal(playerHeightScale(12128, { main: 12000 }), playerHeightScale(128, { main: 0 }), 'absolute map origin does not affect scale');
  assert.equal(playerHeightScale(-768, getPlayerHeightReferences({ '-416': 5 }, -480)), 1, 'missing lower-floor samples must not reuse the upper plane');
  assert.equal(playerHeightScale(undefined, references), 1);
  assert.equal(playerHeightScale(NaN, references), 1);
  assert.equal(playerHeightScale(0), 1, 'unknown reference must not assume world z=0');
  assert.ok(playerHeightScale(128, { main: 0 }) > 1.35, 'a 128-unit rise produces an obvious size increase');
  for (const height of [1, 64, 128, 512, 2048]) {
    const smaller = playerHeightScale(-height, { main: 0 });
    const larger = playerHeightScale(height, { main: 0 });
    assert.ok(smaller >= .88 && smaller < 1, 'shrinkage never exceeds 12%');
    assert.ok(larger > 1 && larger <= 1.46, 'enlargement never exceeds 46%');
    assert.ok(larger - 1 > 1 - smaller, 'enlargement is stronger than shrinkage at equal offsets');
  }
  assert.ok(Math.abs(playerHeightScale(-128, { main: 0 }) - .9706) < .0001, 'moderate drops only shrink gently');
  assert.ok(Math.abs(playerHeightScale(-1e-6, { main: 0 }) - 1) < 1e-8, 'size is continuous at the reference plane');
  assert.equal(playerHeightScale(1e6, references), 1.46);
  assert.equal(playerHeightScale(-1e6, references), .88);
  const heights = [-768, -640, -896, -416, -288];
  const baseFontSize = label.style.fontSize;
  for (const z of heights) {
    drawPlayersForFrame({ ...options, heightReferences: references, frame: { round: 1, players: { 1: { alive: true, x: 0, y: 0, z, yaw: 0, team: 3 } } } });
    const expectedRadius = 16.5 * playerHeightScale(z, references);
    assert.ok(circle.containsPoint({ x: 0, y: expectedRadius * .99 }));
    assert.ok(!circle.containsPoint({ x: 0, y: expectedRadius * 1.1 }));
    const enabledHeight = circle.getLocalBounds().height;
    assert.ok(Math.abs(enabledHeight - 34.65 * playerHeightScale(z, references)) < 1e-4, 'rendered marker geometry follows the height factor');
    assert.equal(label.style.fontSize, baseFontSize, 'height changes marker size, not name size');
    const toggleOptions = { ...options, heightReferences: references, frame: { round: 1, players: { 1: { alive: true, x: 0, y: 0, z, yaw: 0, team: 3 } } } };
    drawPlayersForFrame({ ...toggleOptions, playerHeightScaling: false });
    assert.ok(Math.abs(circle.getLocalBounds().height - 34.65) < 1e-4, 'disabling height scaling restores the larger baseline on either floor while paused');
    assert.equal(label.style.fontSize, baseFontSize);
    drawPlayersForFrame({ ...toggleOptions, playerHeightScaling: true });
    assert.equal(circle.getLocalBounds().height, enabledHeight, 're-enabling restores the height cue immediately');
  }
  settings.playerHeightScaling.value = false;
  settings.defaultMapView.value = '3d';
  assert.equal(JSON.parse(saved).playerSize, 150, 'toggle preserves the existing slider percentage');
  assert.equal(['showMapPlayers', 'showMapProjectiles', 'showMapBomb'].some(key => key in JSON.parse(saved)), false, 'retired visibility settings are removed from persisted settings');
  resetPlayerRenderer();
  world.destroy({ children: true });
});

await withModules(settings => {
  assert.equal(settings.playerSize.value, 150, 'circle size survives reload');
  assert.equal(settings.playerNameSize.value, 150, 'name size survives reload');
  assert.equal(settings.playerHeightScaling.value, false, 'disabled height scaling survives reload');
  assert.equal(settings.defaultMapView.value, '3d', 'default player preference survives reload');
});
saved = JSON.stringify({ playerSizeVersion: 2, playerSize: 9999, playerNameSize: 'broken', playerHeightScaling: 'broken' });
await withModules(settings => {
  assert.equal(settings.playerSize.value, 150, 'saved values are clamped to slider bounds');
  assert.equal(settings.playerNameSize.value, 100, 'invalid saved sizes use defaults');
  assert.equal(settings.playerHeightScaling.value, true, 'invalid height toggle uses the enabled default');
  assert.equal(settings.defaultMapView.value, '2d', 'invalid player preference falls back to 2D');
});
console.log('PASS: world-unit player sizes across maps, resolutions and floors; fixed screen-size names, proportional zoom, paused updates and persisted settings');
