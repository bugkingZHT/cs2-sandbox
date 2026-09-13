import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { Container, Graphics, Text } from 'pixi.js';

let saved = JSON.stringify({ showMapPlayers: false, playerSize: 150, playerNameSize: 125 });
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
  assert.equal(settings.showMapPlayers.value, false, 'existing layer preferences survive');
  assert.equal(settings.playerSize.value, 100, 'old circle midpoint becomes the new 100% default');
  assert.equal(settings.playerNameSize.value, 100);
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
  assert.ok(circle.containsPoint({ x: 0, y: 14 }), '100% circle matches the old 150% radius of 15');
  assert.ok(!circle.containsPoint({ x: 0, y: 16 }));
  assert.equal(label.style.fontSize, 30, '100% name matches the old 125% font size');
  const screenFontSize = () => label.style.fontSize * label.scale.x * world.scale.x;
  const screenCircleWidth = () => circle.getLocalBounds().width * world.scale.x;
  const initialFont = screenFontSize();
  const initialCircle = screenCircleWidth();
  world.scale.set(1);
  updatePlayerLabelScale(0.5);
  assert.equal(screenFontSize(), initialFont, 'paused names remain the same screen size after zoom');
  assert.equal(screenCircleWidth(), initialCircle * 2, 'circles follow map zoom proportionally');
  const screenGap = () => (label.y - 15) * world.scale.x;
  assert.ok(Math.abs(screenGap() - 2) < 1e-9, 'name spacing remains stable on screen');
  settings.playerSize.value = 150;
  settings.playerNameSize.value = 150;
  drawPlayersForFrame({ ...options, playerSize: 150, playerNameSize: 150, playerLabelScale: 0.5 });
  assert.ok(circle.containsPoint({ x: 0, y: 22 }));
  assert.ok(!circle.containsPoint({ x: 0, y: 24 }));
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
        const expectedWorldRadius = (alive ? 33 : 24.75) * percent / 100;
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
  resetPlayerRenderer();
  world.destroy({ children: true });
});

await withModules(settings => {
  assert.equal(settings.playerSize.value, 150, 'circle size survives reload');
  assert.equal(settings.playerNameSize.value, 150, 'name size survives reload');
});
saved = JSON.stringify({ playerSizeVersion: 2, playerSize: 9999, playerNameSize: 'broken' });
await withModules(settings => {
  assert.equal(settings.playerSize.value, 150, 'saved values are clamped to slider bounds');
  assert.equal(settings.playerNameSize.value, 100, 'invalid saved sizes use defaults');
});
console.log('PASS: world-unit player sizes across maps, resolutions and floors; fixed screen-size names, proportional zoom, paused updates and persisted settings');
