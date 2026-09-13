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
    worldToMap: () => ({ x: 0, y: 0 }),
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
  assert.equal(screenGap(), 2, 'name spacing remains stable on screen');
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
console.log('PASS: player size controls, fixed screen-size names, proportional circle zoom, paused updates and persisted settings');
