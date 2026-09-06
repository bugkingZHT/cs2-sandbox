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
  console.log(
    "PASS: native JSON adapter, local library, weapon normalization, stale request isolation",
  );
} finally {
  await server.close();
}
