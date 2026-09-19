import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ configFile: 'vite.local.config.ts', server: { middlewareMode: true }, appType: 'custom' });
try {
  const { equipmentKind } = await server.ssrLoadModule('/src/composables/scene3d/equipmentKinds.ts');
  // Read the parser contract so frontend IDs cannot silently drift from emitted data.
  const parserEquipment = readFileSync(new URL('../pkg/demoinfocs/common/equipment.go', import.meta.url), 'utf8');
  const parserIds = Object.fromEntries([...parserEquipment.matchAll(/(Eq\w+)\s+EquipmentType\s*=\s*(\d+)/g)].map(m => [m[1], Number(m[2])]));
  for (const [kind, names] of Object.entries({
    pistol: 'P2000 Glock P250 Deagle FiveSeven DualBerettas Tec9 CZ USP Revolver Zeus',
    smg: 'MP7 MP9 Bizon Mac10 UMP P90 MP5',
    shotgun: 'SawedOff Nova Mag7 XM1014', machinegun: 'M249 Negev',
    rifle: 'Galil Famas AK47 M4A4 M4A1 SG553 AUG', sniper: 'Scout SSG08 AWP Scar20 G3SG1',
    knife: 'Knife', c4: 'Bomb', smoke: 'Smoke', flash: 'Flash', hegrenade: 'HE',
    molotov: 'Molotov', incendiary: 'Incendiary', decoy: 'Decoy',
  })) for (const name of names.split(' ')) {
    assert.ok(parserIds[`Eq${name}`]);
    assert.equal(equipmentKind(String(parserIds[`Eq${name}`])), kind, `parser ${name} resolves to the correct held silhouette`);
  }
  for (const [name, kind] of Object.entries({ weapon_awp: 'sniper', weapon_m4a1_silencer: 'rifle', weapon_mp5sd: 'smg',
    weapon_knife_karambit: 'knife', weapon_smokegrenade_projectile: 'smoke', incgrenade: 'incendiary',
    flashbang: 'flash', he: 'hegrenade', weapon_c4: 'c4' })) assert.equal(equipmentKind(name), kind);
  for (const unknown of [undefined, '', '0', '406', '999', 'missing', 'constructor', '__proto__']) {
    assert.equal(equipmentKind(unknown), undefined, 'unknown equipment and defuse kits must not appear as guns');
  }
  const { sampleReplayFrame, demoToScene, sceneToDemo, demoDirectionToScene } =
    await server.ssrLoadModule('/src/composables/scene3d/sampleReplayFrame.ts');
  const { buildProjectileTrails, trailPointCount } =
    await server.ssrLoadModule('/src/composables/scene3d/projectileTrails.ts');
  const { buildPlayerDeaths } =
    await server.ssrLoadModule('/src/composables/scene3d/playerDeaths.ts');
  const { buildShotFlights, SHOT_SPEED, SHOT_RANGE, MUZZLE_OFFSET, MUZZLE_DURATION_MS, IMPACT_DURATION_MS } =
    await server.ssrLoadModule('/src/composables/scene3d/shotFlights.ts');
  const player = (extra = {}) => ({ id: 1, alive: true, x: 0, y: 0, z: 0, yaw: 359, pitch: -10, ...extra });
  const projectile = (extra = {}) => ({ entityID: 7, type: 'smoke', throwerID: 1, throwerName: 'P', x: 0, y: 0, z: 100, isExploded: false, ...extra });
  const frame = (timeMs, extra = {}) => ({ timeMs, tick: timeMs, round: 1, roundTime: { phase: 'normal', timeRemaining: 100 }, players: { 1: player() }, ...extra });
  const { buildProjectileEffectStarts, effectGrowth } =
    await server.ssrLoadModule('/src/composables/scene3d/projectileEffects.ts');
  const effectFrame = (time, projectiles = {}, extra = {}) => frame(time, { projectiles, ...extra });
  const smokeBirth = projectile({ isExploded: true, ttl: 19900 });
  const smokeLater = { ...smokeBirth, ttl: 19800 };
  const fireBirth = projectile({ entityID: 8, type: 503, isExploded: true, ttl: 5400 });
  const fireLater = { ...fireBirth, type: 'incgrenade', ttl: 5300 };
  const effectFrames = [effectFrame(0, { 7: projectile() }),
    effectFrame(100, { 7: smokeBirth, 8: fireBirth }), effectFrame(200, { 7: smokeLater, 8: fireLater })];
  const effectStarts = buildProjectileEffectStarts(effectFrames);
  assert.equal(effectStarts.get(smokeBirth), 100, 'smoke starts on the observed detonation sample');
  assert.equal(effectStarts.get(fireBirth), 100, 'a new inferno ID starts on first appearance, independently of its shorter TTL');
  assert.equal(effectStarts.get(fireLater), 100, 'aliases and later samples retain the same onset');
  assert.equal(effectStarts.get(sampleReplayFrame(effectFrames, 150).projectiles[7]), 100, 'interpolation preserves exploded sample identity for onset lookup');
  assert.equal(effectStarts.get(smokeLater), 100);
  assert.equal(buildProjectileEffectStarts(effectFrames.slice(1)).get(fireLater), undefined, 'clip starts do not invent a fresh burst for existing fire');
  for (const extra of [{ timeMs: 900 }, { round: 2 }]) {
    const afterCut = { ...smokeLater };
    assert.equal(buildProjectileEffectStarts([...effectFrames, effectFrame(300, { 7: afterCut }, extra)]).get(afterCut), undefined, 'cuts and rounds do not carry an onset across the boundary');
  }
  const respawn = { ...fireBirth };
  assert.equal(buildProjectileEffectStarts([...effectFrames, effectFrame(300), effectFrame(400, { 8: respawn })]).get(respawn), 400, 'reused entity IDs get a new onset after disappearing');
  assert.equal(effectGrowth(0, 900), 0);
  assert.equal(effectGrowth(100, 650, 200), 0, 'outer flames wait for the ignition wave');
  assert.ok(effectGrowth(200, 900) < effectGrowth(400, 900));
  assert.equal(effectGrowth(900, 900), 1);
  assert.equal(effectGrowth(Infinity, 900), 1, 'unknown old effects stay fully spread');
  const a = frame(100, {
    players: { 1: player({ shotsFired: 1, shotYaw: 315, health: 100, activeWeapon: 'ak47' }) },
    projectiles: { 7: projectile({ trajectory: [{ x: 0, y: 0, z: 100 }] }) },
    bomb: { x: 0, y: 0, z: 0, isPlanted: false, state: 'dropped', site: '' },
  });
  const b = frame(200, {
    players: { 1: player({ x: 100, y: 40, z: 80, yaw: 1, pitch: 10, health: 50, shotsFired: 0, activeWeapon: 'knife' }), 2: player({ id: 2 }) },
    projectiles: { 7: projectile({ x: 1200, y: 600, z: 500 }) },
    killEvents: { 2: { killerId: 1, weaponId: 'ak47' } },
    bomb: { x: 500, y: 400, z: 100, isPlanted: true, state: 'planted', site: 'A' },
  });
  const source = [a, b];
  const before = structuredClone(source);
  const midway = sampleReplayFrame(source, 150);
  assert.deepEqual([midway.players[1].x, midway.players[1].y, midway.players[1].z], [50, 20, 40]);
  assert.equal(midway.players[1].yaw, 360, '359 to 1 follows the short two-degree arc');
  assert.equal(midway.players[1].pitch, 0);
  assert.equal(midway.players[1].shotYaw, 315, 'gunfire keeps the sampled shot direction');
  assert.equal(midway.players[1].shotsFired, 1);
  assert.equal(midway.players[1].health, 100);
  assert.equal(midway.players[1].activeWeapon, 'ak47');
  assert.equal(midway.players[2], undefined, 'new entities do not appear early');
  assert.equal(midway.killEvents, undefined, 'kills do not appear early');
  assert.equal(midway.bomb, a.bomb, 'ground C4 never slides toward a future planted state');
  assert.deepEqual([midway.projectiles[7].x, midway.projectiles[7].y, midway.projectiles[7].z], [600, 300, 300], 'fast projectiles interpolate beyond the player displacement limit');
  assert.equal(midway.projectiles[7].trajectory, a.projectiles[7].trajectory, 'existing trajectory storage is shared, not rebuilt');
  assert.equal(midway.timeMs, 100, 'event timestamps remain those of the source sample');
  assert.deepEqual(source, before, 'sampling never mutates source frames or nested trajectories');
  assert.deepEqual(sampleReplayFrame(source, 150), midway, 'pause at a fixed clock time produces the identical position');
  assert.equal(sampleReplayFrame(source, 125, 1).players[1].x, 25, 'backwards seeks ignore a stale forward hint');
  assert.equal(sampleReplayFrame(source, 175, -100).players[1].x, 75, 'invalid hints fall back to clock lookup');
  assert.equal(sampleReplayFrame(source, 200, 0), b, 'events apply exactly on their timestamp');
  assert.equal(sampleReplayFrame(source, -100), a, 'before-start clocks clamp to first frame');
  assert.equal(sampleReplayFrame(source, 20000), b, 'after-end clocks never extrapolate');
  assert.equal(sampleReplayFrame([], 100), undefined);
  for (const invalid of [NaN, Infinity, -Infinity]) assert.equal(sampleReplayFrame(source, invalid), undefined);
  assert.equal(sampleReplayFrame([a], 150), a);
  assert.equal(sampleReplayFrame([a, { ...b, round: 2 }], 150), a, 'round cuts are not interpolated');
  assert.equal(sampleReplayFrame([a, { ...b, timeMs: 601 }], 150), a, 'gaps over 500ms freeze until the next sample');
  assert.equal(sampleReplayFrame([a, { ...b, timeMs: 600 }], 350).players[1].x, 50, 'the 500ms boundary is inclusive');
  assert.equal(sampleReplayFrame([a, { ...b, timeMs: NaN }], 150), a, 'invalid future timestamps cannot poison positions');
  assert.equal(sampleReplayFrame([a, frame(200), b], 200, 1), b, 'the last event at a duplicate timestamp wins');

  const samplePair = (p, q) => sampleReplayFrame([frame(0, { players: { 1: p } }), frame(100, { players: { 1: q } })], 50).players[1];
  const dead = player({ alive: false, x: 100 });
  assert.equal(samplePair(a.players[1], dead), a.players[1], 'death state and corpse position never appear early');
  assert.equal(samplePair(dead, player({ x: 100 })), dead, 'respawns do not slide between positions');
  assert.equal(samplePair(dead, { ...dead, x: 200 }), dead, 'corpses remain at their sampled position');
  assert.equal(samplePair(a.players[1], player({ id: 2 })), a.players[1], 'record-key reuse cannot interpolate different identities');
  assert.equal(samplePair(a.players[1], player({ x: 513 })), a.players[1], 'player teleports are discrete');
  assert.equal(samplePair(player({ z: undefined }), player({ x: 100, z: 50 })).z, undefined, 'missing source height is not invented');
  assert.equal(samplePair(player({ z: 50 }), player({ x: 100, z: undefined })).z, 50, 'missing destination height cannot drag a player to zero');
  assert.equal(samplePair(player({ pitch: undefined }), player({ pitch: 40 })).pitch, undefined);
  assert.equal(samplePair(player(), player({ x: NaN } )).x, 0, 'malformed future positions do not infect current geometry');
  assert.equal(samplePair(player(), player({ z: Infinity } )).z, 0);
  assert.equal(samplePair(player(), player({ yaw: NaN } )).yaw, 359);
  assert.equal(samplePair(player({ yaw: -719 }), player({ yaw: 719 })).yaw, -720, 'arbitrary unwrapped angles still take the shortest arc');

  const exploded = { ...b, projectiles: { 7: projectile({ x: 1200, isExploded: true, ttl: 10000 }) } };
  const inFlight = sampleReplayFrame([a, exploded], 150).projectiles[7];
  assert.equal(inFlight.x, 600, 'the terminal effect sample supplies the final landing point');
  assert.equal(inFlight.isExploded, false, 'explosion effects wait for the exact event timestamp');
  assert.equal(inFlight.ttl, undefined);
  assert.equal(sampleReplayFrame([a, exploded], 200).projectiles[7].isExploded, true);
  for (const change of [{ type: 'fire' }, { entityID: 9 }, { throwerID: 9 }, { x: Infinity }]) {
    const changed = { ...b, projectiles: { 7: projectile({ x: 1200, ...change }) } };
    assert.equal(sampleReplayFrame([a, changed], 150).projectiles[7], a.projectiles[7], 'projectile identity/type/data discontinuities retain the source');
  }
  assert.equal(sampleReplayFrame([a, { ...b, projectiles: {} }], 150).projectiles[7], a.projectiles[7], 'entities that disappear are not extrapolated');
  const settled = { ...a, projectiles: { 7: projectile({ isExploded: true }) } };
  assert.equal(sampleReplayFrame([settled, exploded], 150).projectiles[7], settled.projectiles[7], 'active effect volumes do not drift');

  for (const coordinates of [[100, -200, 80], [-400, 300, -150], [0, 0, 0]]) {
    const mapped = demoToScene(...coordinates);
    const roundTrip = sceneToDemo(mapped.x, mapped.y, mapped.z);
    assert.deepEqual(roundTrip, { x: coordinates[0], y: coordinates[1], z: coordinates[2] });
  }
  assert.deepEqual(demoToScene(1, 2), { x: 1, y: 0, z: -2 });
  const north = demoDirectionToScene(90);
  assert.ok(Math.abs(north.x) < 1e-10 && Math.abs(north.z + 1) < 1e-10);
  assert.ok(Math.abs(demoDirectionToScene(0, 90).y + 1) < 1e-10, 'positive pitch points down');
  const direction = demoDirectionToScene(42, -31);
  assert.ok(Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) < 1e-10);

  const flightFrames = [0, 100, 200, 300].map((timeMs, i) => frame(timeMs, {
    projectiles: { 7: projectile({ x: i * 100, y: i * 50, z: [100, 180, 130, 140][i],
      // Deliberately insufficient/untimed checkpoints must not flatten the arc.
      trajectory: [{ x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 100 }] }) },
  }));
  const originalFlight = structuredClone(flightFrames);
  const trails = buildProjectileTrails(flightFrames);
  const trail = trails.get(7, 1, 100);
  assert.deepEqual([...trail.positions], [0, 100, -0, 100, 180, -50, 200, 130, -100, 300, 140, -150]);
  assert.equal(trailPointCount(trail, 150), 2, 'only already reached positions appear in the trail');
  assert.equal(trailPointCount(trail, 100), 2, 'the current sample enters the trail at its exact timestamp');
  assert.equal(trailPointCount(trail, 50), 1, 'backwards seek shortens the trail immediately');
  assert.equal(trails.get(7, 2, 100), undefined, 'round identity is preserved');
  assert.equal(trails.get(7, 1, -1), undefined);
  assert.deepEqual(flightFrames, originalFlight, 'trail indexing does not alter replay data');
  for (const cut of [
    frame(150, { projectiles: {} }),
    frame(150, { projectiles: { 7: projectile({ isExploded: true }) } }),
    frame(150, { projectiles: { 7: projectile({ x: NaN }) } }),
  ]) {
    const disconnected = buildProjectileTrails([flightFrames[0], cut, flightFrames[2]]);
    assert.notEqual(disconnected.get(7, 1, 0), disconnected.get(7, 1, 200), 'missing, exploded and invalid entities split trails');
    assert.equal(disconnected.get(7, 1, 200).times.length, 1);
  }
  for (const change of [{ timeMs: 501 }, { round: 2 }]) {
    const next = { ...flightFrames[1], ...change };
    const disconnected = buildProjectileTrails([flightFrames[0], next]);
    assert.equal(disconnected.get(7, next.round, next.timeMs).times.length, 1, 'large gaps and round cuts never bridge flight histories');
  }
  const reused = frame(100, { projectiles: { 7: projectile({ throwerID: 2 }) } });
  assert.equal(buildProjectileTrails([flightFrames[0], reused]).get(7, 1, 100).times.length, 1, 'reused entity IDs start a fresh trail');

  const deathFrame = (timeMs, changes = {}, frameChanges = {}) => frame(timeMs, {
    players: { 1: player({ alive: false, x: 24, y: -80, z: 144, yaw: 75, ...changes }) },
    ...frameChanges,
  });
  const deathFrames = [frame(100), deathFrame(200), deathFrame(300, { x: 900, yaw: 180 }),
    frame(400), deathFrame(500, { x: 50 }), deathFrame(600)];
  const originalDeaths = structuredClone(deathFrames);
  const deaths = buildPlayerDeaths(deathFrames);
  const firstDeath = deaths.get(1, 1, 200);
  assert.deepEqual(firstDeath, { playerId: 1, round: 1, timeMs: 200, x: 24, y: -80, z: 144, yaw: 75 });
  assert.equal(deaths.get(1, 1, 199.999), undefined, 'death animation cannot appear before the first dead sample');
  assert.equal(deaths.get(1, 1, 350), firstDeath, 'later corpse samples retain the original death time and pose');
  assert.equal(deaths.get(1, 1, 400), undefined, 'respawn ends the previous death at its exact timestamp');
  const secondDeath = deaths.get(1, 1, 500);
  assert.equal(secondDeath.timeMs, 500, 'another witnessed death receives a new event');
  assert.equal(secondDeath.x, 50);
  assert.equal(deaths.get(1, 1, 50000), secondDeath, 'the final dead state stays settled after its animation finishes');
  assert.equal(deaths.get(1, 1, 250), firstDeath, 'reverse seeks recover the original event without playback history');
  assert.equal(deaths.get(1, 1, 250), firstDeath, 'paused queries are stable');
  assert.equal(deaths.get(2, 1, 250), undefined);
  assert.equal(deaths.get(1, 2, 250), undefined);
  for (const timeMs of [NaN, Infinity, -Infinity]) assert.equal(deaths.get(1, 1, timeMs), undefined);
  assert.deepEqual(deathFrames, originalDeaths, 'death indexing and queries never mutate source frames');
  assert.equal(buildPlayerDeaths([]).get(1, 1, 100), undefined);
  assert.equal(buildPlayerDeaths([deathFrame(0), deathFrame(100)]).get(1, 1, 100), undefined,
    'a clip that starts with an already dead player never replays their death');
  assert.equal(buildPlayerDeaths([frame(0), deathFrame(500)]).get(1, 1, 500).timeMs, 500,
    'a valid 500ms interval can witness a death');

  for (const changed of [
    deathFrame(501),
    deathFrame(100, {}, { round: 2 }),
    deathFrame(0),
    deathFrame(-1),
    deathFrame(NaN),
    deathFrame(100, { id: 2 }),
    deathFrame(100, { steamID: 42 }),
    deathFrame(100, { team: 3 }),
    deathFrame(100, { x: NaN }),
    deathFrame(100, { z: Infinity }),
    deathFrame(100, { yaw: NaN }),
  ]) {
    assert.equal(buildPlayerDeaths([frame(0), changed]).get(1, changed.round, changed.timeMs), undefined,
      'time, identity, round and invalid-pose discontinuities cannot invent a death');
  }
  assert.equal(buildPlayerDeaths([frame(0, { players: { 1: player({ x: NaN }) } }), deathFrame(100)])
    .get(1, 1, 100), undefined, 'an invalid previous pose cannot witness a continuous death');
  assert.equal(buildPlayerDeaths([frame(0), deathFrame(100, { z: undefined })]).get(1, 1, 100).z, undefined,
    'legacy missing height stays undefined for the renderer to handle');
  assert.ok(buildPlayerDeaths([frame(0), deathFrame(100, { name: 'renamed' })]).get(1, 1, 100),
    'a display name change does not replace player identity');

  for (const cut of [
    frame(200, { players: {} }),
    deathFrame(200, { id: 2 }),
    deathFrame(200, { steamID: 42 }),
    deathFrame(200, { team: 3 }),
    deathFrame(200, { x: NaN }),
    deathFrame(200, {}, { round: 2 }),
    deathFrame(601),
  ]) {
    const interrupted = buildPlayerDeaths([frame(0), deathFrame(100), cut, deathFrame(cut.timeMs + 100)]);
    assert.equal(interrupted.get(1, 1, 100).timeMs, 100);
    assert.equal(interrupted.get(1, 1, cut.timeMs), undefined, 'a discontinuity expires the old event exactly');
    assert.equal(interrupted.get(1, 1, cut.timeMs + 100), undefined, 'reappearing dead cannot restart an expired animation');
  }
  const invalidTimeDeaths = buildPlayerDeaths([frame(0), deathFrame(100), deathFrame(NaN), deathFrame(200)]);
  assert.equal(invalidTimeDeaths.get(1, 1, 100).timeMs, 100, 'malformed future time retains the last confirmed sample');
  assert.equal(invalidTimeDeaths.get(1, 1, 150), undefined, 'malformed future time cannot extend the event into unknown data');
  assert.equal(invalidTimeDeaths.get(1, 1, 200), undefined);

  const shooting = (changes = {}) => player({ team: 3, yaw: 0, shotYaw: 0, pitch: 0, shotsFired: 1, ...changes });
  const targetPlayer = (changes = {}) => player({ id: 2, team: 2, x: 508, yaw: 0, ...changes });
  const shotFrame = (timeMs, changes = {}, targets = {}, frameChanges = {}) => frame(timeMs, {
    players: { 1: shooting(changes), ...targets }, ...frameChanges,
  });
  const fullFlightMs = (SHOT_RANGE - MUZZLE_OFFSET) / SHOT_SPEED;
  const { ReplayShots } = await server.ssrLoadModule('/src/composables/scene3d/replayShots.ts');
  const sniperFrames = [shotFrame(0, { activeWeapon: '309' }), shotFrame(100, { activeWeapon: '303', shotsFired: 0 })];
  const sniperFlights = buildShotFlights(sniperFrames), sniperFlight = sniperFlights.active(1, 100)[0];
  assert.equal(sniperFlight.muzzleOffset, 76, 'a flying sniper shot retains its launch muzzle after switching to a rifle');
  assert.equal(sniperFlight.endTimeMs, (SHOT_RANGE - 76) / SHOT_SPEED + IMPACT_DURATION_MS);
  const shotRenderer = new ReplayShots();
  shotRenderer.update(sniperFlights, 1, { currentTimeMs: 0 });
  const pooledShot = [...shotRenderer.activeVisuals.values()][0];
  assert.equal(pooledShot.muzzle.position.x, 76, 'the sniper flash starts at the long barrel tip');
  shotRenderer.update(buildShotFlights([shotFrame(0, { activeWeapon: '303' })]), 1, { currentTimeMs: 0 });
  assert.equal([...shotRenderer.activeVisuals.values()][0], pooledShot, 'different gun categories reuse the same effect object');
  assert.equal(pooledShot.muzzle.position.x, 48, 'a reused rifle flash returns to the shorter barrel tip');
  shotRenderer.dispose();
  const shotSource = [shotFrame(100, {}, { 2: targetPlayer() }), shotFrame(200, { shotsFired: 0 }, { 2: targetPlayer() })];
  const originalShots = structuredClone(shotSource);
  const shotIndex = buildShotFlights(shotSource);
  const shot = shotIndex.active(1, 100)[0];
  assert.deepEqual(shot.origin, { x: 0, y: 52, z: -0 });
  assert.deepEqual(shot.direction, { x: 1, y: -0, z: -0 });
  assert.deepEqual(shot.hit, { distance: 490, playerId: 2 }, 'stationary player collision hits the front of its 18u proxy');
  assert.equal(shot.team, 3);
  const hitArrival = shot.timeMs + (shot.hit.distance - MUZZLE_OFFSET) / SHOT_SPEED;
  assert.equal(hitArrival, 100 + (490 - 48) / 4.8, 'muzzle offset is included exactly once in flight travel time');
  assert.equal(shot.endTimeMs, hitArrival + IMPACT_DURATION_MS);
  assert.deepEqual(shotIndex.active(1, 99.999), [], 'a future shot never appears early');
  assert.equal(shotIndex.active(1, 150)[0], shot, 'flying bullets outlive the next source sample without shots');
  assert.equal(shotIndex.active(1, 220)[0], shot, 'impact can remain visible after bullet arrival');
  assert.deepEqual(shotIndex.active(1, shot.endTimeMs), [], 'impact lifetime ends at its exact boundary');
  assert.equal(shotIndex.active(1, 125)[0], shot, 'reverse seek restores the same immutable event');
  assert.equal(shotIndex.active(1, 125)[0], shot, 'paused bullet queries have no hidden playback state');
  assert.deepEqual(shotIndex.active(2, 125), []);
  for (const badTime of [NaN, Infinity, -Infinity]) assert.deepEqual(shotIndex.active(1, badTime), []);
  assert.deepEqual(shotSource, originalShots, 'shot indexing does not modify future player samples');

  const lastShot = buildShotFlights([shotFrame(0)]).active(1, 0)[0];
  assert.equal(lastShot.hit, undefined, 'a shooter cannot hit their own proxy');
  assert.equal(lastShot.endTimeMs, fullFlightMs + IMPACT_DURATION_MS, 'a genuine clip endpoint allows the complete bounded flight');
  const pointBlank = buildShotFlights([shotFrame(0, {}, { 2: targetPlayer({ x: 28 }) })]).active(1, 0)[0];
  assert.equal(pointBlank.hit.distance, 10, 'an enemy inside the longer gun barrel is hit at its near body surface');
  assert.equal(pointBlank.endTimeMs, MUZZLE_DURATION_MS, 'point-blank impact does not shorten the muzzle flash');
  const angled = buildShotFlights([shotFrame(0, { x: 10, y: 20, z: 100, yaw: 0, shotYaw: 90, pitch: -30 })]).active(1, 0)[0];
  assert.deepEqual(angled.origin, { x: 10, y: 152, z: -20 });
  assert.ok(Math.abs(angled.direction.y - 0.5) < 1e-10 && Math.abs(angled.direction.z + Math.sqrt(3) / 2) < 1e-10,
    'event shotYaw and Source pitch determine a three-dimensional flight');
  const elevated = buildShotFlights([shotFrame(0, { pitch: -45 }, { 2: targetPlayer({ x: 200, z: 200 }) })]).active(1, 0)[0];
  assert.ok(Math.abs(elevated.hit.distance - 182 * Math.sqrt(2)) < 1e-9, 'upward bullets can hit a player on a higher floor');
  assert.equal(buildShotFlights([shotFrame(0, {}, { 2: targetPlayer({ z: 200 }) })]).active(1, 0)[0].hit, undefined,
    'a horizontal bullet does not hit a player merely overlapping in XY');

  const movingFrames = [shotFrame(0, {}, { 2: targetPlayer({ x: MUZZLE_OFFSET + 240, y: 200 }) }),
    shotFrame(100, { shotsFired: 0 }, { 2: targetPlayer({ x: MUZZLE_OFFSET + 240, y: -200 }) })];
  const crossingHit = buildShotFlights(movingFrames).active(1, 0)[0].hit;
  assert.equal(crossingHit.playerId, 2);
  assert.ok(Math.abs(crossingHit.distance - (MUZZLE_OFFSET + 222)) < 1e-9, 'relative segment collision catches a moving player between two clear endpoint poses');
  const movingAway = [shotFrame(0, {}, { 2: targetPlayer({ x: 268, y: 0 }) }),
    shotFrame(100, { shotsFired: 0 }, { 2: targetPlayer({ x: 268, y: 200 }) })];
  assert.equal(buildShotFlights(movingAway).active(1, 0)[0].hit, undefined, 'a target leaving the ray before arrival is not hit at its old position');
  for (const discontinuity of [{ id: 3 }, { steamID: 42 }, { alive: false }]) {
    const replaced = [movingFrames[0], shotFrame(100, { shotsFired: 0 }, { 2: targetPlayer({ x: 268, y: -200, ...discontinuity }) })];
    assert.equal(buildShotFlights(replaced).active(1, 0)[0].hit, undefined,
      'death and identity changes cannot sweep a target through the bullet path');
  }
  const targetTeleport = [shotFrame(0, {}, { 2: targetPlayer({ x: 268, y: 400 }) }),
    shotFrame(100, { shotsFired: 0 }, { 2: targetPlayer({ x: 268, y: -400 }) })];
  assert.equal(buildShotFlights(targetTeleport).active(1, 0)[0].hit, undefined, 'teleports do not create a fictitious swept collision');
  const diesBeforeArrival = [shotFrame(0, {}, { 2: targetPlayer({ x: 1000 }) }),
    shotFrame(100, { shotsFired: 0 }, { 2: targetPlayer({ x: 1000, alive: false }) })];
  assert.equal(buildShotFlights(diesBeforeArrival).active(1, 0)[0].hit, undefined, 'a target already dead when the bullet arrives cannot absorb it');
  const nearest = buildShotFlights([shotFrame(0, {}, {
    2: targetPlayer({ x: 400 }), 3: targetPlayer({ id: 3, x: 200 }),
  })]).active(1, 0)[0];
  assert.deepEqual(nearest.hit, { distance: 182, playerId: 3 }, 'the nearest collision wins independently of player enumeration order');

  const consecutive = buildShotFlights([shotFrame(0, { shotsFired: 4 }), shotFrame(100, { shotsFired: 3 })]);
  assert.equal(consecutive.active(1, 100).length, 2, 'aggregated counts produce one tracer each without suppressing consecutive shot samples');
  assert.notEqual(consecutive.active(1, 100)[0].key, consecutive.active(1, 100)[1].key);
  const duplicateShots = buildShotFlights([shotFrame(0), shotFrame(0, { shotsFired: 0 }), shotFrame(100)]);
  assert.deepEqual(duplicateShots.active(1, 0), [], 'the last duplicate timestamp decides whether a shot happened');
  assert.equal(duplicateShots.active(1, 100).length, 1);
  const finalDuplicate = buildShotFlights([shotFrame(0), shotFrame(0, { x: 12, shotsFired: 2 })]).active(1, 0);
  assert.equal(finalDuplicate.length, 1);
  assert.equal(finalDuplicate[0].origin.x, 12, 'duplicate shot data uses the final event pose');
  for (const changes of [{ shotsFired: 0, buttons: [1] }, { shotsFired: undefined }, { shotsFired: NaN },
    { shotsFired: -1 }, { x: NaN }, { shotYaw: NaN }, { pitch: Infinity }]) {
    assert.deepEqual(buildShotFlights([shotFrame(0, changes)]).active(1, 0), [], 'invalid data and attack buttons never fabricate a shot');
  }
  const deadShooter = buildShotFlights([shotFrame(0), shotFrame(50, { alive: false, shotsFired: 0 })]);
  assert.equal(deadShooter.active(1, 100).length, 1, 'an already launched bullet survives its shooter dying');
  for (const cutoff of [
    shotFrame(50, {}, {}, { players: {} }),
    shotFrame(50, { shotsFired: 0, id: 2 }),
    shotFrame(50, { shotsFired: 0, x: 600 }),
    shotFrame(50, { shotsFired: 0 }, {}, { round: 2 }),
  ]) {
    const cutShots = buildShotFlights([shotFrame(0), cutoff]);
    assert.equal(cutShots.active(1, 49.999).length, 1);
    assert.deepEqual(cutShots.active(1, 50), [], 'round, missing-shooter, identity and teleport cuts end flight exactly');
  }
  for (const timeMs of [501, NaN]) {
    assert.deepEqual(buildShotFlights([shotFrame(0), shotFrame(timeMs, { shotsFired: 0 })]).active(1, 1), [],
      'known data gaps stop at the last trustworthy sample rather than leaking a flight into the gap');
  }
  console.log('PASS: 3D replay clock sampling, shortest yaw, XYZ transforms, immutable discrete events, seek/pause and fast projectile boundaries');
  console.log('PASS: timed flight history, progressive trajectory, reverse seek and discontinuity isolation');
  console.log('PASS: deterministic death events, original pose, reverse seek, exact lifetimes and discontinuity isolation');
  console.log('PASS: indexed shot flights, swept moving-player hits, exact travel/impact times, seek and clip boundaries');
} finally {
  await server.close();
}
