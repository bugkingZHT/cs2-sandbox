import assert from "node:assert/strict";
import { createServer } from "vite";

globalThis.location = { hash: "#" + "a".repeat(64) };
globalThis.sessionStorage = { getItem: () => null, setItem: () => {} };
const items = ["one", "two"].map((id) => ({
  id,
  name: id + ".dem",
  status: "ready",
  rounds: [1, 2],
  meta: { uuid: id, mapName: "de_ancient", totalRounds: 2, serverPlayer: [] },
}));
const requests = [];
let currentState = items[0];
let delayFirst = false,
  release;
globalThis.fetch = async (url, init) => {
  assert.equal(init.headers["X-Local-Token"], "a".repeat(64));
  assert.ok(url.startsWith("/api/"));
  requests.push(url);
  if (url === "/api/library") return Response.json(items);
  if (url === "/api/state") return Response.json(currentState);
  if (url === "/api/open") {
    if (JSON.parse(init.body).path === "invalid.dem") return new Response('missing file', { status: 400 });
    currentState = { id: "job", name: "new.dem", status: "parsing", progress: 0, message: "opening", rounds: [], meta: null };
    items.push(currentState);
    return Response.json(currentState);
  }
  if (url.startsWith("/api/round?")) {
    const q = new URL(url, "http://localhost").searchParams;
    if (delayFirst && q.get("id") === "one")
      await new Promise((resolve) => (release = resolve));
    return Response.json({
      round: Number(q.get("n")),
      frames: [
        {
          timeMs: 10,
          tick: 1,
          round: Number(q.get("n")),
          players: { 1: { x: 1, y: 2, activeWeapon: 7, inventory: [7, 44] } },
          projectiles: { 2: { type: 44 } },
          killEvents: { 3: { weaponId: 7 } },
          droppedEquipment: [{ type: 7 }],
        },
      ],
    });
  }
  throw new Error("Unexpected request: " + url);
};
const server = await createServer({
  configFile: "vite.local.config.ts",
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { useReplayData } = await server.ssrLoadModule(
    "/src/composables/useReplayData.ts",
  );
  const data = useReplayData();
  await data.waitForInitialLoad();
  assert.equal(data.replayList.value.length, 2);
  await data.loadRoundData("one", 1);
  assert.equal(data.replay.value.uuid, "one");
  assert.deepEqual(data.frames.value[0].players[1].inventory, ["7", "44"]);
  assert.equal(data.frames.value[0].projectiles[2].type, "44");
  assert.equal(data.frames.value[0].killEvents[3].weaponId, "7");
  assert.equal(data.bounds.value.minX, 1);
  // Navigating while a slow response is in flight must not restore the old match.
  delayFirst = true;
  const first = data.loadRoundData("one", 2);
  await new Promise((resolve) => setImmediate(resolve));
  await data.loadRoundData("two", 2);
  release();
  await first;
  assert.equal(data.replay.value.uuid, "two");
  assert.equal(data.currentRoundNumber.value, 2);
  assert.equal(data.loading.value, false);
  assert.ok(
    requests.every((r) => !r.includes("/demos") && !r.includes("/auth")),
  );
  await assert.rejects(data.parseDemo("invalid.dem"));
  assert.equal(data.parsing.value, false);
  await data.parseDemo("new.dem");
  assert.equal(data.parsing.value, true, "start returns before parsing completes");
  assert.equal(data.replayList.value.find(d => d.id === "job").status, 0);
  await assert.rejects(data.parseDemo("duplicate.dem"));
  currentState.progress = 42;
  currentState.meta = { uuid: "new-meta-id", mapName: "de_ancient" };
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.equal(data.replayList.value.find(d => d.id === "job").parsingProgress, 42);
  assert.equal(data.replayList.value.filter(d => d.id === "job").length, 1);
  currentState.status = "ready";
  currentState.progress = 100;
  await new Promise(resolve => setTimeout(resolve, 700));
  assert.equal(data.parsing.value, false);
  assert.equal(data.replayList.value.find(d => d.id === "job").status, 1);
  console.log("PASS: acceptance/errors, active library card, progress polling, duplicate submission guard");
  const { findGrenadeLandings } = await server.ssrLoadModule('/src/composables/grenadeSearch.ts');
  const { mergeReplayRounds } = await server.ssrLoadModule('/src/composables/useClipMerge.ts');
  const makeRound = (round, explosion) => ({ round, frames: [0, 10, 20, 30, 40].map(timeMs => ({
    round, timeMs, tick: timeMs, roundTime: { phase: 'normal', timeRemaining: 100 },
    players: { 1: { id: 1, x: timeMs, y: 0 }, 2: { id: 2, x: -100, y: 0 } },
    projectiles: {
      10: { entityID: 10, throwerID: 1, type: '505', x: timeMs > explosion ? 999 : 15, y: 10, z: 0, isExploded: timeMs >= explosion },
      11: { entityID: 11, throwerID: 1, type: '505', x: 15, y: 10, z: 0, isExploded: timeMs >= 40 },
      12: { entityID: 12, throwerID: 2, type: '506', x: 15, y: 10, z: 0, isExploded: timeMs >= 20 },
    },
  })) });
  const rounds = new Map([[1, makeRound(1, 30)], [14, makeRound(14, 20)]]);
  const hits = [...rounds.values()].flatMap(r => findGrenadeLandings(r.frames, r.round, '505', p => p.x >= 10 && p.x <= 20).matches);
  assert.equal(hits.length, 4, 'each entity once, including two hits in one round; first explosion position');
  const merged = mergeReplayRounds({ serverPlayer: [{ id: 1, name: 'thrower', team: 2, steamID: 1 }] }, hits, rounds);
  const atAnchor = merged.frames.find(f => f.timeMs === merged.anchorTimeMs);
  assert.equal(Object.keys(atAnchor.players).length, 4, 'one remapped thrower per matching throw');
  assert.equal(Object.keys(atAnchor.projectiles).length, 4, 'unselected players and projectiles excluded');
  assert.ok(Object.values(atAnchor.projectiles).every(p => !p.isExploded), 'every throw is exactly one source frame before explosion');
  assert.ok(Object.values(merged.frames.find(f => f.timeMs === merged.anchorTimeMs + 10).projectiles).every(p => p.isExploded));
  assert.equal(merged.serverPlayer.filter(p => p.team === 3).length, 2, 'preserve throwing side after halftime');
  assert.equal(new Set(merged.serverPlayer.map(p => p.id)).size, 4);
  assert.ok(Object.keys(merged.frames.at(-1).players).length < 4, 'finished segments must disappear');
  assert.deepEqual(rounds.get(1).frames.map(f => f.timeMs), [0, 10, 20, 30, 40], 'merge does not mutate source cache');
  const fire = makeRound(1, 30);
  fire.frames.forEach(f => { f.projectiles[10].type = '502'; f.projectiles[11].type = '503'; });
  assert.equal(findGrenadeLandings(fire.frames, 1, '502', () => true).matches.length, 2, 'combine molotov and incendiary');
  assert.equal(findGrenadeLandings(fire.frames, 1, '505', () => true).matches.length, 0);
  fire.frames.forEach(f => {
    delete f.projectiles[11];
    if (f.timeMs < 30) f.projectiles[10].isExploded = false;
    else {
      delete f.projectiles[10];
      f.projectiles[99] = { entityID: 99, throwerID: 1, type: '502', x: 16, y: 10, z: 0, isExploded: true };
    }
  });
  const fireHits = findGrenadeLandings(fire.frames, 1, '502', () => true).matches;
  assert.equal(fireHits.length, 1, 'inferno is an effect, not an extra throw');
  assert.equal(fireHits[0].effectEntityId, 99);
  assert.equal(fireHits[0].anchorTimeMs, 20);
  const fireMerged = mergeReplayRounds({ serverPlayer: [] }, fireHits, new Map([[1, fire]]));
  assert.equal(fireMerged.frames.find(f => f.timeMs === 30).projectiles[10].isExploded, true, 'stitch flying and burning entities');
  const incomplete = makeRound(1, 30);
  incomplete.frames.forEach((f, i) => { delete f.projectiles[11]; if (i > 1) delete f.projectiles[10]; });
  const estimate = findGrenadeLandings(incomplete.frames, 1, '505', () => true);
  assert.equal(estimate.matches[0].estimated, true);
  assert.equal(estimate.matches[0].anchorTimeMs, 10);
  incomplete.frames[1].projectiles[10].throwerID = -1;
  assert.equal(findGrenadeLandings(incomplete.frames, 1, '505', () => true).missing, 1);
  const normal = mergeReplayRounds({ serverPlayer: [] }, [{ round: 1 }, { round: 14 }], rounds);
  assert.equal(normal.anchorTimeMs, null, 'ordinary round multiselect keeps start alignment');
  console.log('PASS: grenade landing search, missing data, same-round hits, thrower filtering and pre-explosion alignment');
  const { useGrenadeAnalyzer } = await server.ssrLoadModule('/src/composables/useGrenadeAnalyzer.ts');
  const { ref, nextTick, effectScope } = await import('vue');
  const scope = effectScope();
  const analyzedFrames = ref(rounds.get(1).frames);
  const analyzer = scope.run(() => useGrenadeAnalyzer(analyzedFrames, ref({serverPlayer: []})));
  analyzer.activateAnalyze(analyzedFrames.value[0].projectiles[10]);
  assert.equal(analyzer.throwFrameIndex.value, 0);
  analyzedFrames.value = [ { ...rounds.get(1).frames[0], projectiles: {} }, ...rounds.get(1).frames ];
  await nextTick();
  assert.equal(analyzer.isAnalyzeMode.value, false);
  analyzer.activateAnalyze(analyzedFrames.value[1].projectiles[10]);
  assert.equal(analyzer.throwFrameIndex.value, 1, 'discard entity cache when merged frames change');
  scope.stop();
  console.log(
    "PASS: native JSON adapter, local library, weapon normalization, stale request isolation",
  );
} finally {
  await server.close();
}
