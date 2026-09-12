import { computed, ref, shallowRef } from "vue";
import type {
  Frame,
  ReplayData,
  ReplayRound,
  WorldBounds,
} from "@/types/replay";
import { localAPI } from "@/local/api";

interface LocalState {
  id: string;
  name: string;
  status: string;
  message: string;
  progress: number;
  rounds: number[];
  meta: ReplayData | null;
}
const loading = ref(false),
  parsing = ref(false),
  parsingProgress = ref(0),
  parsingStatus = ref("");
const error = ref<string | null>(null);
const replay = shallowRef<ReplayData | null>(null),
  frames = shallowRef<Frame[]>([]);
const replayList = shallowRef<ReplayData[]>([]),
  states = shallowRef<LocalState[]>([]);
const currentRoundNumber = ref(1),
  bounds = shallowRef<WorldBounds | null>(null);
const replayRouteError = ref<"not_found" | null>(null);
let submitting = false;
let polling: Promise<void> | undefined;
let activeRequest = 0;
const cache = new Map<string, ReplayRound>();

export function normalizeLocalRound(round: ReplayRound): ReplayRound {
  for (const f of round.frames) {
    f.players ||= {};
    for (const p of Object.values(f.players)) {
      p.inventory = (p.inventory || []).map(String);
      if (p.activeWeapon != null) p.activeWeapon = String(p.activeWeapon);
    }
    for (const p of Object.values(f.projectiles || {})) p.type = String(p.type);
    for (const e of Object.values(f.killEvents || {}))
      e.weaponId = String(e.weaponId);
    for (const e of f.droppedEquipment || []) e.type = String(e.type);
  }
  round.frames.sort((a, b) => a.timeMs - b.timeMs);
  return round;
}
async function refreshLibrary() {
  states.value = await localAPI<LocalState[]>("library");
  rebuildLibrary();
  const active = states.value.find(s => s.status === "parsing" || s.status === "extracting")
    || states.value.find(s => s.status === "queued");
  parsing.value = !!active;
  parsingStatus.value = active?.message || "";
  parsingProgress.value = active?.progress || 0;
}
function rebuildLibrary() {
  replayList.value = states.value
    .map((s) => ({
      uploaderUid: "", uploadTime: 0, mapName: "", teamCT: "", teamT: "",
      scoreCT: 0, scoreT: 0, totalRounds: 0, totalFrames: 0, totalDurationMs: 0,
      ...s.meta,
      uuid: s.meta?.uuid || s.id,
      id: s.id,
      timestamp: s.meta?.uploadTime || 0,
      fileName: s.name.replace(/\.dem$/i, ""),
      frames: [],
      status: s.status === "ready" ? 1 : s.status === "error" ? -1 : 0,
      parsingProgress: s.progress || 0,
      parsingStatus: s.message,
    }));
}
function applyState(st: LocalState) {
  parsing.value = ["queued", "extracting", "parsing"].includes(st.status);
  parsingStatus.value = st.message;
  parsingProgress.value = st.progress || 0;
  if (st.id) {
    states.value = [st, ...states.value.filter((s) => s.id !== st.id)];
    rebuildLibrary();
  }
  if (st.status === "error") error.value = st.message;
}
export async function fetchLocalRound(
  uuid: string,
  n: number,
): Promise<ReplayRound> {
  const key = uuid + ":" + n;
  if (cache.has(key)) return cache.get(key)!;
  let state = states.value.find((s) => s.meta?.uuid === uuid);
  if (!state) {
    await refreshLibrary();
    state = states.value.find((s) => s.meta?.uuid === uuid);
  }
  if (!state || !state.rounds.includes(n))
    throw new Error("本地回放或回合不存在");
  const round = normalizeLocalRound(
    await localAPI<ReplayRound>(
      "round?id=" + encodeURIComponent(state.id) + "&n=" + n,
    ),
  );
  cache.set(key, round);
  // Current round and one preview, not an entire match in browser memory.
  while (cache.size > 2) cache.delete(cache.keys().next().value!);
  return round;
}
async function loadRoundData(uuid: string, n: number) {
  const request = ++activeRequest;
  loading.value = true;
  error.value = null;
  replayRouteError.value = null;
  try {
    const round = await fetchLocalRound(uuid, n);
    if (request !== activeRequest) return;
    const meta = replayList.value.find((s) => s.uuid === uuid);
    if (!meta) throw new Error("本地回放不存在");
    replay.value = meta;
    frames.value = round.frames;
    currentRoundNumber.value = n;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const f of round.frames)
      for (const p of Object.values(f.players)) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    bounds.value = Number.isFinite(minX) ? { minX, maxX, minY, maxY } : null;
  } catch (e) {
    if (request === activeRequest) {
      error.value = String(e);
      replayRouteError.value = "not_found";
      frames.value = [];
    }
  } finally {
    if (request === activeRequest) loading.value = false;
  }
}
async function parseDemo(source: string | File[]) {
  if (submitting || (typeof source === "string" && parsing.value)) throw new Error("请等待当前文件导入完成");
  submitting = true;
  try {
    if (typeof source === "string") {
      const st = await localAPI<LocalState>("open", { path: source });
      applyState(st);
    } else {
      if (!source.length) throw new Error("请至少选择一个 .dem 或 .zip 文件");
      const form = new FormData();
      for (const file of source) form.append("files", file, file.name);
      const batch = await localAPI<{ items: LocalState[] }>("import", form);
      for (const st of batch.items) applyState(st);
    }
    error.value = null;
    void watchParsing();
  } finally { submitting = false; }
}
function watchParsing(): Promise<void> {
  return (polling ||= pollParsing().finally(() => {
    polling = undefined;
    if (parsing.value) void watchParsing();
  }));
}
async function pollParsing() {
  try {
  while (parsing.value) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await refreshLibrary();
  }
  await refreshLibrary();
  } catch (e) {
    error.value = "无法读取解析进度，请刷新重连：" + String(e);
    parsing.value = false;
  }
}
async function deleteDemoByUuid(uuid: string) {
  const st = states.value.find((s) => s.meta?.uuid === uuid || s.id === uuid);
  if (!st) return;
  await localAPI("remove", { id: st.id });
  cache.clear();
  if (replay.value?.uuid === st.meta?.uuid) {
    ++activeRequest;
    replay.value = null;
    frames.value = [];
  }
  await refreshLibrary();
}
async function getRoundFramesForPreview(uuid: string, n: number) {
  const round = await fetchLocalRound(uuid, n);
  return {
    frames: round.frames,
    roundDurationMs: round.frames.length
      ? round.frames.at(-1)!.timeMs - round.frames[0].timeMs
      : 0,
  };
}
let initialization: Promise<void> | undefined;
function waitForInitialLoad() {
  return (initialization ||= (async () => {
    loading.value = true;
    try {
      await refreshLibrary();
      if (parsing.value) void watchParsing();
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  })());
}
const data = {
  loading,
  parsing,
  parsingProgress,
  parsingStatus,
  error,
  replay,
  frames,
  bounds,
  replayList,
  currentRoundNumber,
  replayRouteError,
  parseDemo,
  loadRoundData,
  loadReplayByLocal: loadRoundData,
  deleteDemoByUuid,
  getRoundFramesForPreview,
  waitForInitialLoad,
  refreshLibrary,
  statusMsg: parsingStatus,
  replayerSource: ref<"local">("local"),
  replayerNoteId: ref(null),
  replayerDemoId: ref(null),
  cloudDownloadProgress: ref({
    active: false,
    progress: 0,
    lengthComputable: false,
  }),
  availableRounds: computed(
    () =>
      states.value.find((s) => s.meta?.uuid === replay.value?.uuid)?.rounds ||
      [],
  ),
};
export function useReplayData() {
  return data;
}
