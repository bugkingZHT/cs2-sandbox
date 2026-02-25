import { onMounted, onUnmounted, ref, watch } from 'vue';
import type { Frame, ReplayData, ReplayMeta, ReplayRound, ParsedReplayData, WorldBounds } from '@/types/replay';
import ParserWorker from '@/workers/wasm-parser.worker?worker';
import { getReplayStorage, cleanupOrphanedReplayStorage } from './indexdb-storage';
import { getMetaStorage } from './indexdb-storage';
import { decodeReplayMeta, decodeReplayRound, encodeReplayRound } from './proto-converters';
import { useAuth } from './useAuth';
import { PARSER_CONFIG } from '@/config/parser';
import {
  MAX_SURGE_DEMO_NUM_KEY,
  MAX_SURGE_DEMO_NUM_DEFAULT,
  PARSING_ROUND_LIMIT_KEY,
  PARSE_FRAME_RATIO_KEY,
} from '@/config/debug';
import { adaptMeta, adaptRound, checkCompatibility } from './replayDataAdapter';

interface UseReplayResult {
  loading: ReturnType<typeof ref<boolean>>;
  parsing: ReturnType<typeof ref<boolean>>;
  parsingProgress: ReturnType<typeof ref<number>>;
  parsingStatus: ReturnType<typeof ref<string>>;
  statusMsg: ReturnType<typeof ref<string>>;
  error: ReturnType<typeof ref<string | null>>;
  replay: ReturnType<typeof ref<ReplayData | null>>;
  frames: ReturnType<typeof ref<Frame[]>>;
  bounds: ReturnType<typeof ref<WorldBounds | null>>;
  replayList: ReturnType<typeof ref<ReplayData[]>>;
  currentRoundNumber: ReturnType<typeof ref<number>>;
  showUploadBlockedWarning: ReturnType<typeof ref<{ fileName: string; progress: number } | null>>;
  parseDemo: (file: File) => Promise<void>;
  loadReplayById: (id: string) => Promise<void>;
  loadRoundData: (uuid: string, roundNumber: number) => Promise<void>;
  deleteReplayById: (id: string) => Promise<void>;
  /** 等待首次 loadAllReplays 完成，与 demolib 一致，避免 replayer 刷新时竞态 */
  waitForInitialLoad: () => Promise<void>;
  /** replayer 路由下加载失败原因：'not_found' 未找到回放，'forbidden' 回放无权限，null 无错误 */
  replayRouteError: ReturnType<typeof ref<'not_found' | 'forbidden' | null>>;
  /** 从云端下载回合时的进度；lengthComputable 为 true 时可展示百分比，false 时仅展示加载样式，null 时尚未确定 */
  cloudDownloadProgress: ReturnType<typeof ref<{ active: boolean; progress: number; lengthComputable: boolean | null }>>;
  /** 当前 replayer 来源：'local' | 'cloud'，用于 loadRoundData 与 URL 同步 */
  replayerSource: ReturnType<typeof ref<'local' | 'cloud' | null>>;
  /** 当前云笔记 id（source=cloud 时），用于避免重复加载同一 note */
  replayerNoteId: ReturnType<typeof ref<string | null>>;
  /** 当前云附件 demo id（URL demo_id），用于 needLoad 判断 */
  replayerDemoId: ReturnType<typeof ref<number | null>>;
  /** GET item 返回的笔记 title/content/owner_id/demos，公开笔记未登录或他人查看时用于 replayer 展示 */
  cloudNoteDetailFromApi: ReturnType<typeof ref<{ title: string; content?: string; owner_id?: number; demos?: Array<{ id: number; demo_uuid: string; demo_round: number; demo_meta?: string; file_name?: string; file_size?: number; created_at?: string }> } | null>>;
  loadReplayByLocal: (uuid: string, roundNumber: number) => Promise<void>;
  loadReplayByCloud: (noteId: string, demoId?: number) => Promise<void>;
  /** 云端 demo 库（/api/demos）：先读 IndexedDB 缓存，未命中时通过 GET /api/demos/file 拉取并写入缓存后加载，带 progress */
  loadReplayByDemosCloud: (demoId: number, roundNumber: number) => Promise<void>;
  /** 从后端 GET /api/demos 拉取列表并写入 replayList（登录后或刷新 demolib 时调用） */
  loadReplayListFromServer: () => Promise<void>;
  /** 清理云存档播放状态（如切到 Demo 本地库时清掉后台 cloud 播放） */
  clearCloudPlaybackState: () => void;
  /** 只读加载某 demo 某回合的帧数据，用于列表页预览 timeline，不写入全局 replay/frames */
  getRoundFramesForPreview: (uuid: string, roundNumber: number) => Promise<{ frames: Frame[]; roundDurationMs: number } | null>;
}

const LATEST_KEY = 'latest_replay_uuid';

// 单例模式：确保所有组件使用同一个响应式实例
let replayDataInstance: ReturnType<typeof createReplayData> | null = null;

function createReplayData() {
  const loading = ref(true);
  const parsing = ref(false);
  const parsingProgress = ref(0);
  const parsingStatus = ref('');
  const statusMsg = ref('');
  const replayList = ref<ReplayData[]>([]);
  const error = ref<string | null>(null);
  const replay = ref<ReplayData | null>(null);
  const frames = ref<Frame[]>([]);
  const bounds = ref<WorldBounds | null>(null);
  const currentRoundNumber = ref<number>(1);
  const showUploadBlockedWarning = ref<{ fileName: string; progress: number } | null>(null);
  const replayRouteError = ref<'not_found' | 'forbidden' | null>(null);
  const cloudDownloadProgress = ref<{ active: boolean; progress: number; lengthComputable: boolean | null }>({ active: false, progress: 0, lengthComputable: null });
  const replayerSource = ref<'local' | 'cloud' | null>(null);
  const replayerNoteId = ref<string | null>(null);
  const replayerDemoId = ref<number | null>(null);
  /** 公开笔记：GET item 返回的 title/content/owner_id/demos，供未登录或他人查看时 replayer 展示 */
  const cloudNoteDetailFromApi = ref<{ title: string; content?: string; owner_id?: number; demos?: Array<{ id: number; demo_uuid: string; demo_round: number; demo_meta?: string; file_name?: string; file_size?: number; created_at?: string }> } | null>(null);

  const abortController = new AbortController();
  let initialLoadPromise: Promise<void> | null = null;

  // beforeunload: 解析过程中监听页面关闭/刷新，避免用户误操作导致解析中断
  let beforeUnloadHandler: ((e: BeforeUnloadEvent) => string | undefined) | null = null;
  const setupBeforeUnload = () => {
    if (beforeUnloadHandler) return;
    beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
  };
  const removeBeforeUnload = () => {
    if (beforeUnloadHandler) {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      beforeUnloadHandler = null;
    }
  };
  watch(parsing, (isParsing) => {
    if (isParsing) setupBeforeUnload();
    else removeBeforeUnload();
  }, { immediate: true });

  /** 从后端 GET /api/demos 拉取列表，映射为 ReplayData[]（含 cloudDemoId 供打开 replayer 用） */
  const loadReplayListFromServer = async (): Promise<void> => {
    const { currentUser } = useAuth();
    if (!currentUser.value) {
      replayList.value = [];
      return;
    }
    try {
      const res = await fetch('/api/demos', { credentials: 'include' });
      if (!res.ok) {
        replayList.value = [];
        return;
      }
      const json = await res.json().catch(() => ({}));
      const data = (json as { status?: string; data?: { items?: Array<{ id: number; demo_uuid: string; demo_meta?: string; created_at?: string }> } }).data;
      const items = data?.items ?? [];
      replayList.value = items.map((item) => {
        let meta: ReplayMeta;
        try {
          const parsed = item.demo_meta ? (JSON.parse(item.demo_meta) as ReplayMeta) : null;
          meta = parsed ?? {
            uuid: item.demo_uuid,
            uploaderUid: '',
            uploadTime: 0,
            mapName: '',
            teamCT: '',
            teamT: '',
            scoreCT: 0,
            scoreT: 0,
            totalRounds: 0,
            totalFrames: 0,
            status: 1,
            totalDurationMs: 0,
          };
        } catch {
          meta = {
            uuid: item.demo_uuid,
            uploaderUid: '',
            uploadTime: 0,
            mapName: '',
            teamCT: '',
            teamT: '',
            scoreCT: 0,
            scoreT: 0,
            totalRounds: 0,
            totalFrames: 0,
            status: 1,
            totalDurationMs: 0,
          };
        }
        const adapted = adaptMeta(meta);
        const createdAt = item.created_at ? new Date(item.created_at).getTime() : 0;
        return {
          ...adapted,
          id: item.demo_uuid,
          frames: [],
          timestamp: createdAt || adapted.uploadTime,
          cloudDemoId: item.id,
        } as ReplayData & { cloudDemoId: number };
      });
      console.log('[LoadReplayListFromServer] 从后端加载 demo 列表数量:', replayList.value.length);
    } catch (e) {
      console.error('[LoadReplayListFromServer]', e);
      replayList.value = [];
    }
  };

  // Replay list is from server only; this only runs orphan cleanup for round storage.
  const loadAllReplays = async () => {
    const maxSurge = Math.max(0, parseInt(localStorage.getItem(MAX_SURGE_DEMO_NUM_KEY) ?? String(MAX_SURGE_DEMO_NUM_DEFAULT), 10)) || MAX_SURGE_DEMO_NUM_DEFAULT;
    await cleanupOrphanedReplayStorage(maxSurge);
    replayList.value = [];
  };

  // Load replay meta and first round from IndexedDB
  const loadReplayFromStorage = async (uuid?: string): Promise<ReplayData | null> => {
    console.log('[ReplayStorage] 开始从数据库加载回放数据...', { uuid, storedUuid: localStorage.getItem(LATEST_KEY) });
    const metaStorage = await getMetaStorage();
    const replayStorage = await getReplayStorage();
    
    const targetUuid = uuid || localStorage.getItem(LATEST_KEY);
    console.log('[ReplayStorage] 目标UUID:', targetUuid);
    if (!targetUuid) {
      console.log('[ReplayStorage] 没有找到目标UUID，返回null');
      return null;
    }

    // 从 IndexedDB 加载 meta
    const rawMeta = await metaStorage.loadMeta(targetUuid);
    if (!rawMeta) {
      console.log('[ReplayStorage] 未找到 meta');
      return null;
    }

    // 数据适配层：归一化 meta
    const meta = adaptMeta(rawMeta);

    // 兼容性检查
    const compat = checkCompatibility(meta.engineVersion);
    if (!compat.compatible) {
      console.warn('[ReplayStorage]', compat.warning);
    }

    // 从 IndexedDB 加载第一回合
    const roundBytes = await replayStorage.loadRound(targetUuid, 1);
    if (!roundBytes) {
      console.warn('[ReplayStorage] 第一回合未找到');
      return null;
    }
    const firstRound = adaptRound(await decodeReplayRound(roundBytes), meta.engineVersion);

    console.log('[ReplayStorage] Loaded meta and first round (round 1) with', firstRound.frames.length, 'frames');

    // Sort frames within the first round
    const sortedFrames = firstRound.frames.sort((a, b) => a.timeMs - b.timeMs);

    return {
      ...meta,
      id: meta.uuid,
      frames: sortedFrames,
      timestamp: meta.uploadTime,
    };
  };

  const loadReplayById = async (uuid: string) => {
    await loadReplayByLocal(uuid, 1);
    if (!replayRouteError.value) {
      localStorage.setItem(LATEST_KEY, uuid);
    }
  };

  // Apply decoded round bytes to frames and bounds (shared after loading from local or cloud).
  const applyRoundBytes = async (roundBytes: Uint8Array, roundNumber: number) => {
    const engineVersion = replay.value?.engineVersion;
    const round = adaptRound(await decodeReplayRound(roundBytes), engineVersion);
    const sortedFrames = round.frames.sort((a, b) => a.timeMs - b.timeMs);
    frames.value = sortedFrames;
    currentRoundNumber.value = roundNumber;
    requestIdleCallback(() => {
      bounds.value = estimateBounds(frames.value);
    }, { timeout: 100 });
  };

  /** 只读加载某 demo 某回合的帧数据，用于列表页预览 timeline，不写入全局 replay/frames */
  const getRoundFramesForPreview = async (
    uuid: string,
    roundNumber: number
  ): Promise<{ frames: Frame[]; roundDurationMs: number } | null> => {
    try {
      const metaStorage = await getMetaStorage();
      const replayStorage = await getReplayStorage();
      const rawMeta = await metaStorage.loadMeta(uuid);
      if (!rawMeta) return null;
      const meta = adaptMeta(rawMeta);
      const roundBytes = await replayStorage.loadRound(uuid, roundNumber);
      if (!roundBytes) return null;
      const round = adaptRound(await decodeReplayRound(roundBytes), meta.engineVersion);
      const sortedFrames = round.frames.sort((a, b) => a.timeMs - b.timeMs);
      const roundDurationMs =
        sortedFrames.length >= 2
          ? Math.max(0, sortedFrames[sortedFrames.length - 1].timeMs - sortedFrames[0].timeMs)
          : sortedFrames.length === 1
            ? 0
            : 0;
      return { frames: sortedFrames, roundDurationMs };
    } catch {
      return null;
    }
  };

  // Fetch round file from cloud by note_id + demo_id (permission + file in one API). Returns arraybuffer on 2xx, throws on error.
  // Updates cloudDownloadProgress during download for progress bar.
  const fetchRoundFileByNoteAndDemo = (noteId: string, demoId: number): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const url = `/api/note/file?note_id=${encodeURIComponent(noteId)}&demo_id=${demoId}`;
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.withCredentials = true;
      xhr.responseType = 'arraybuffer';
      xhr.onprogress = (e) => {
        const prev = cloudDownloadProgress.value;
        const lengthComputable = prev.lengthComputable ?? e.lengthComputable;
        if (e.lengthComputable && e.total > 0) {
          cloudDownloadProgress.value = { active: true, progress: Math.round((e.loaded / e.total) * 100), lengthComputable: true };
        } else {
          cloudDownloadProgress.value = { active: true, progress: prev.progress, lengthComputable: lengthComputable ?? false };
        }
      };
      xhr.onload = () => {
        cloudDownloadProgress.value = { active: false, progress: 0, lengthComputable: null };
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
          resolve(xhr.response);
        } else {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => {
        cloudDownloadProgress.value = { active: false, progress: 0, lengthComputable: null };
        reject(new Error('Network error'));
      };
      xhr.onabort = () => {
        cloudDownloadProgress.value = { active: false, progress: 0, lengthComputable: null };
        reject(new Error('Aborted'));
      };
      xhr.send();
    });
  };

  /** Cache-first: ensure demo meta and round for a note attachment are in IndexedDB; fill from cloud on miss. Shows progress when fetching round from cloud. */
  const ensureCachedFromNoteCloud = async (
    noteId: string,
    demoId?: number
  ): Promise<{
    uuid: string;
    roundNumber: number;
    meta: ReplayData;
    noteDetail: { title: string; content?: string; owner_id?: number; demos?: Array<{ id: number; demo_uuid: string; demo_round: number; demo_meta?: string; file_name?: string; file_size?: number; created_at?: string }> };
    resolvedDemoId: number;
  }> => {
    const res = await fetch(`/api/note/items/${encodeURIComponent(noteId)}`, { credentials: 'include' });
    if (res.status === 403) throw new Error('forbidden');
    if (res.status === 404) throw new Error('not_found');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json().catch(() => ({}));
    const data = (json as {
      data?: {
        title?: string;
        content?: string;
        owner_id?: number;
        demos?: Array<{ id: number; demo_uuid: string; demo_round: number; demo_meta?: string; file_name?: string; file_size?: number; created_at?: string }>;
      };
    }).data;
    const demos = data?.demos ?? [];
    const targetDemo = demoId != null ? demos.find((d) => d.id === demoId) : demos[0];
    if (!targetDemo) throw new Error('not_found');
    const resolvedDemoId = targetDemo.id;
    const uuid = targetDemo.demo_uuid;
    const roundNumber = targetDemo.demo_round ?? 1;
    const noteDetail = {
      title: data?.title ?? '',
      content: data?.content,
      owner_id: typeof data?.owner_id === 'number' ? data.owner_id : undefined,
      demos: data?.demos,
    };

    const replayStorage = await getReplayStorage();
    const cachedRound = await replayStorage.loadRound(uuid, roundNumber);

    const metaFromApi: ReplayMeta = (() => {
      try {
        const parsed = targetDemo.demo_meta ? (JSON.parse(targetDemo.demo_meta) as ReplayMeta) : null;
        return parsed ? parsed : {
          uuid: targetDemo.demo_uuid,
          uploaderUid: '',
          uploadTime: 0,
          mapName: '',
          teamCT: '',
          teamT: '',
          scoreCT: 0,
          scoreT: 0,
          totalRounds: 0,
          totalFrames: 0,
          status: 1,
          totalDurationMs: 0,
        };
      } catch {
        return {
          uuid: targetDemo.demo_uuid,
          uploaderUid: '',
          uploadTime: 0,
          mapName: '',
          teamCT: '',
          teamT: '',
          scoreCT: 0,
          scoreT: 0,
          totalRounds: 0,
          totalFrames: 0,
          status: 1,
          totalDurationMs: 0,
        };
      }
    })();

    if (!cachedRound) {
      const buf = await fetchRoundFileByNoteAndDemo(noteId, resolvedDemoId);
      const roundBytes = new Uint8Array(buf);
      await replayStorage.saveRound(uuid, roundNumber, roundBytes);
    }

    const meta = adaptMeta(metaFromApi);
    return {
      uuid,
      roundNumber,
      meta: { ...meta, id: meta.uuid, frames: [], timestamp: meta.uploadTime },
      noteDetail,
      resolvedDemoId,
    };
  };

  /** 从云端 demo 库拉取单回合文件（GET /api/demos/file?demo_id=&round=），带 progress，用于填充缓存 */
  const fetchRoundFileByDemosApi = (demoId: number, roundNumber: number): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const url = `/api/demos/file?demo_id=${encodeURIComponent(String(demoId))}&round=${encodeURIComponent(String(roundNumber))}`;
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.withCredentials = true;
      xhr.responseType = 'arraybuffer';
      xhr.onprogress = (e) => {
        const prev = cloudDownloadProgress.value;
        const lengthComputable = prev.lengthComputable ?? e.lengthComputable;
        if (e.lengthComputable && e.total > 0) {
          cloudDownloadProgress.value = { active: true, progress: Math.round((e.loaded / e.total) * 100), lengthComputable: true };
        } else {
          cloudDownloadProgress.value = { active: true, progress: prev.progress, lengthComputable: lengthComputable ?? false };
        }
      };
      xhr.onload = () => {
        cloudDownloadProgress.value = { active: false, progress: 0, lengthComputable: null };
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
          resolve(xhr.response);
        } else {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      };
      xhr.onerror = () => {
        cloudDownloadProgress.value = { active: false, progress: 0, lengthComputable: null };
        reject(new Error('Network error'));
      };
      xhr.onabort = () => {
        cloudDownloadProgress.value = { active: false, progress: 0, lengthComputable: null };
        reject(new Error('Aborted'));
      };
      xhr.send();
    });
  };

  /** 缓存优先：确保指定云端 demo 的 meta 与 round 在 IndexedDB 中；未命中时通过 /api/demos 拉取并写入缓存，拉取时展示 progress */
  const ensureCachedFromDemosCloud = async (
    demoId: number,
    roundNumber: number
  ): Promise<{ uuid: string; roundNumber: number; meta: ReplayData }> => {
    const res = await fetch(`/api/demos/${demoId}`, { credentials: 'include' });
    if (res.status === 403) throw new Error('forbidden');
    if (res.status === 404) throw new Error('not_found');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json().catch(() => ({}));
    const data = (json as { status?: string; data?: { demo_uuid?: string; demo_meta?: string } }).data;
    if (!data?.demo_uuid) throw new Error('not_found');
    const uuid = data.demo_uuid;

    const replayStorage = await getReplayStorage();
    const cachedRound = await replayStorage.loadRound(uuid, roundNumber);

    const metaFromApi: ReplayMeta = (() => {
      try {
        const parsed = data.demo_meta ? (JSON.parse(data.demo_meta) as ReplayMeta) : null;
        return parsed ?? {
          uuid,
          uploaderUid: '',
          uploadTime: 0,
          mapName: '',
          teamCT: '',
          teamT: '',
          scoreCT: 0,
          scoreT: 0,
          totalRounds: 0,
          totalFrames: 0,
          status: 1,
          totalDurationMs: 0,
        };
      } catch {
        return {
          uuid,
          uploaderUid: '',
          uploadTime: 0,
          mapName: '',
          teamCT: '',
          teamT: '',
          scoreCT: 0,
          scoreT: 0,
          totalRounds: 0,
          totalFrames: 0,
          status: 1,
          totalDurationMs: 0,
        };
      }
    })();

    if (!cachedRound) {
      const buf = await fetchRoundFileByDemosApi(demoId, roundNumber);
      const roundBytes = new Uint8Array(buf);
      await replayStorage.saveRound(uuid, roundNumber, roundBytes);
    }

    const meta = adaptMeta(metaFromApi);
    return {
      uuid,
      roundNumber,
      meta: { ...meta, id: meta.uuid, frames: [], timestamp: meta.uploadTime },
    };
  };

  /** 本地录像：IndexedDB meta + round 数据，找不到即 not_found */
  const loadReplayByLocal = async (uuid: string, roundNumber: number) => {
    replayRouteError.value = null;
    replayerSource.value = 'local';
    replayerNoteId.value = null;
    replayerDemoId.value = null;
    try {
      const metaStorage = await getMetaStorage();
      const replayStorage = await getReplayStorage();
      const rawMeta = await metaStorage.loadMeta(uuid);
      if (!rawMeta) {
        replayRouteError.value = 'not_found';
        return;
      }
      const meta = adaptMeta(rawMeta);
      setReplayData({ ...meta, id: meta.uuid, frames: [], timestamp: meta.uploadTime });
      const roundBytes = await replayStorage.loadRound(uuid, roundNumber);
      if (!roundBytes) {
        replayRouteError.value = 'not_found';
        return;
      }
      await applyRoundBytes(roundBytes, roundNumber);
    } catch (e) {
      console.error('[LoadReplayByLocal]', e);
      replayRouteError.value = 'not_found';
    }
  };

  /** 云录像：优先从 IndexedDB 缓存加载；未命中 meta 或 round 时从云端拉取并写入缓存后再加载，拉取时展示 progress。 */
  const loadReplayByCloud = async (noteId: string, demoId?: number) => {
    replayRouteError.value = null;
    cloudNoteDetailFromApi.value = null;
    replayerSource.value = 'cloud';
    replayerNoteId.value = noteId;
    replayerDemoId.value = demoId ?? null;
    try {
      const { uuid, roundNumber, meta, noteDetail, resolvedDemoId } = await ensureCachedFromNoteCloud(noteId, demoId);
      replayerDemoId.value = resolvedDemoId;
      cloudNoteDetailFromApi.value = noteDetail;
      setReplayData(meta);
      const replayStorage = await getReplayStorage();
      const roundBytes = await replayStorage.loadRound(uuid, roundNumber);
      if (!roundBytes) {
        replayRouteError.value = 'not_found';
        return;
      }
      await applyRoundBytes(roundBytes, roundNumber);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'forbidden') replayRouteError.value = 'forbidden';
      else if (msg === 'not_found') replayRouteError.value = 'not_found';
      else {
        console.error('[LoadReplayByCloud]', e);
        replayRouteError.value = 'not_found';
      }
    }
  };

  /** 云端 demo 库（/api/demos）：优先 IndexedDB 缓存，未命中时通过 GET /api/demos/file 拉取并写入缓存后加载，拉取时展示 progress */
  const loadReplayByDemosCloud = async (demoId: number, roundNumber: number) => {
    replayRouteError.value = null;
    cloudNoteDetailFromApi.value = null;
    replayerSource.value = 'cloud';
    replayerNoteId.value = null;
    replayerDemoId.value = demoId;
    try {
      const { uuid, roundNumber: rn, meta } = await ensureCachedFromDemosCloud(demoId, roundNumber);
      setReplayData(meta);
      const replayStorage = await getReplayStorage();
      const roundBytes = await replayStorage.loadRound(uuid, rn);
      if (!roundBytes) {
        replayRouteError.value = 'not_found';
        return;
      }
      await applyRoundBytes(roundBytes, rn);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'forbidden') replayRouteError.value = 'forbidden';
      else if (msg === 'not_found') replayRouteError.value = 'not_found';
      else {
        console.error('[LoadReplayByDemosCloud]', e);
        replayRouteError.value = 'not_found';
      }
    }
  };

  /** 切换回合：仅 local 模式从 IndexedDB 加载；cloud 单回合不切换 */
  /** 清理云笔记播放状态：清空 source/noteId/replay/frames，用于切到本地库时不再保留 cloud 后台播放 */
  const clearCloudPlaybackState = () => {
    if (!replayerNoteId.value && replayerDemoId.value == null) return;
    replayerSource.value = null;
    replayerNoteId.value = null;
    replayerDemoId.value = null;
    cloudNoteDetailFromApi.value = null;
    replayRouteError.value = null;
    cloudDownloadProgress.value = { active: false, progress: 0, lengthComputable: null };
    replay.value = null;
    frames.value = [];
    bounds.value = null;
    currentRoundNumber.value = 1;
  };

  const loadRoundData = async (uuid: string, roundNumber: number) => {
    replayRouteError.value = null;
    if (replayerNoteId.value) {
      return;
    }
    try {
      if (replayerDemoId.value != null) {
        await ensureCachedFromDemosCloud(replayerDemoId.value, roundNumber);
      }
      const storage = await getReplayStorage();
      const roundBytes = await storage.loadRound(uuid, roundNumber);
      if (!roundBytes) {
        replayRouteError.value = 'not_found';
        return;
      }
      await applyRoundBytes(roundBytes, roundNumber);
    } catch (e) {
      console.error('[LoadRoundData]', e);
      replayRouteError.value = 'not_found';
    }
  };

  const deleteReplayById = async (uuid: string) => {
    console.log('[DeleteReplayById] 删除 UUID:', uuid);
    const replayStorage = await getReplayStorage();
    await replayStorage.deleteReplay(uuid);

    const { currentUser } = useAuth();
    if (currentUser.value) await loadReplayListFromServer();

    if (localStorage.getItem(LATEST_KEY) === uuid) {
      localStorage.removeItem(LATEST_KEY);
    }
    console.log('[DeleteReplayById] 删除完成');
  };

  const estimateBounds = (allFrames: Frame[]): WorldBounds | null => {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const sampleCount = Math.min(allFrames.length, 2000);

    for (let i = 0; i < sampleCount; i++) {
      const frame = allFrames[i];
      if (!frame.players || Object.keys(frame.players).length === 0) continue;
      for (const playerId in frame.players) {
        const p = frame.players[playerId];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return null;
    }

    return { minX, maxX, minY, maxY };
  };

  const setReplayData = (data: ReplayData) => {
    console.log('[SetReplayData] 开始设置回放数据');
    console.log('[SetReplayData] 数据:', { id: data.id, mapName: data.mapName, frameCount: data.frames?.length, teamCT: data.teamCT, teamT: data.teamT });
    
    // 直接同步赋值，不使用 requestAnimationFrame，避免延迟
    replay.value = data;
    frames.value = data.frames ?? [];
    console.log('[SetReplayData] 数据设置完成，帧数:', frames.value.length);
    
    // bounds 计算延后到空闲时间
    requestIdleCallback(() => {
      bounds.value = estimateBounds(frames.value);
      console.log('[SetReplayData] 估算边界完成:', bounds.value);
    }, { timeout: 100 });
  };

  const saveRoundToStorage = async (round: ReplayRound) => {
    console.log(`[SaveRoundToStorage] 📦 Starting round ${round.round} save:`, {
      uuid: round.uuid,
      round: round.round,
      frameCount: round.frames?.length || 0
    });
    const storage = await getReplayStorage();
    const roundBytes = await encodeReplayRound(round);
    console.log(`[SaveRoundToStorage] 🔄 Encoded to protobuf, size: ${roundBytes.byteLength} bytes`);
    await storage.saveRound(round.uuid, round.round, roundBytes);
    console.log(`[SaveRoundToStorage] ✅ Round ${round.round} saved successfully`);
  };

  const updateParsingProgress = (progress: number, status: string) => {
    parsingProgress.value = Math.min(100, Math.max(0, progress));
    parsingStatus.value = status;
    statusMsg.value = status;
  };

  /** Upload demo (meta + all rounds) to POST /api/demos; progress 80–100. Skips if not logged in. */
  const uploadDemosToServer = async (
    uuid: string,
    totalRounds: number,
    meta: ReplayMeta | null,
    updateProgress: (p: number, msg: string) => void
  ) => {
    const { currentUser, handleSessionExpired } = useAuth();
    if (!currentUser.value) {
      updateProgress(100, '完成');
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '已保存到本地（未登录，未上传云端）', type: 'info' } }));
      return;
    }
    try {
      const replayStorage = await getReplayStorage();
      const form = new FormData();
      form.append('demo_uuid', uuid);
      form.append('permission', '0'); // default private
      if (meta) form.append('meta', JSON.stringify(meta));
      for (let r = 1; r <= totalRounds; r++) {
        const roundBytes = await replayStorage.loadRound(uuid, r);
        if (!roundBytes || roundBytes.length === 0) {
          console.warn(`[UploadDemos] Round ${r} missing, skipping upload`);
          continue;
        }
        const slice = roundBytes.buffer.slice(roundBytes.byteOffset, roundBytes.byteOffset + roundBytes.byteLength) as ArrayBuffer;
        form.append(`round_${r}`, new Blob([slice], { type: 'application/octet-stream' }), `round_${r}.pb.gz`);
      }
      const roundKeys = Array.from({ length: totalRounds }, (_, i) => i + 1).map((n) => `round_${n}`);
      const hasRounds = roundKeys.some((k) => form.has(k));
      if (!hasRounds) {
        updateProgress(100, '完成');
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '无回合数据，未上传云端', type: 'warning' } }));
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/demos');
        xhr.withCredentials = true;
        xhr.upload.addEventListener('progress', (ev) => {
          if (ev.lengthComputable) {
            const p = 80 + (ev.loaded / ev.total) * 20;
            updateProgress(Math.round(p), '正在上传到云端...');
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            updateProgress(100, '完成');
            window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '已上传到云端', type: 'info' } }));
            loadReplayListFromServer();
            resolve();
          } else if (xhr.status === 401) {
            handleSessionExpired();
            window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '未登录或登录已过期', type: 'warning' } }));
            resolve();
          } else {
            const j = (() => {
              try {
                return JSON.parse(xhr.responseText || '{}');
              } catch {
                return {};
              }
            })();
            window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: j?.error || `上传失败 ${xhr.status}`, type: 'error' } }));
            resolve();
          }
        });
        xhr.addEventListener('error', () => {
          window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '网络错误，上传失败', type: 'error' } }));
          resolve();
        });
        xhr.send(form);
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: `上传失败: ${msg}`, type: 'error' } }));
    } finally {
      updateProgress(100, '完成');
    }
  };

  const parseDemo = async (file: File) => {
    // ============ CONCURRENCY CHECK: Only allow one parsing at a time ============
    const metaStorage = await getMetaStorage();
    const parsingMetas = await metaStorage.getParsingMetas();
    
    if (parsingMetas.length > 0) {
      // Set warning info for modal display
      showUploadBlockedWarning.value = {
        fileName: parsingMetas[0].fileName || '未知文件',
        progress: parsingMetas[0].parsingProgress || 0
      };
      
      console.warn('[ParseDemo] ⚠️ Upload blocked: another parsing task in progress');
      return;
    }
    
    console.log('[ParseDemo] ✅ Concurrency check passed: no active parsing tasks');
    // ============ END CONCURRENCY CHECK ============

    parsing.value = true;
    parsingProgress.value = 0;
    parsingStatus.value = '首次载入可能耗时较长，将在一分钟内完成';
    error.value = null;

    let meta: ReplayMeta | null = null; // Set on META_READY; used for progress/error
    let demoBytes: Uint8Array | null = null;

    try {
      const buffer = await file.arrayBuffer();
      demoBytes = new Uint8Array(buffer);

      const fileSizeMB = file.size / (1024 * 1024);
      // Estimate total ticks using configured ratio
      const estimatedTotalTicks = Math.round(fileSizeMB * PARSER_CONFIG.estimatedRatio);
      console.log(`[ParseDemo] File size: ${fileSizeMB.toFixed(2)}MB, Estimated ticks: ${estimatedTotalTicks} (ratio: ${PARSER_CONFIG.estimatedRatio})`);

      const worker = new ParserWorker();
      let savedRoundsCount = 0;
      let lastTickTime = Date.now();
      let tickTimeoutHandle: number | null = null;

      worker.onmessage = async (e: MessageEvent) => {
        if (e.data.type === 'META_READY') {
          const { metaJsonString, fileName } = e.data;
          const parsed: ReplayMeta = JSON.parse(metaJsonString);
          parsed.fileName = fileName.replace(/\.dem$/i, '');
          if (parsed.status === -1) {
            meta = parsed;
            parsing.value = false;
            parsingProgress.value = 0;
            console.log('[ParseDemo] Unsupported map or error (status=-1)');
            return;
          }
          parsed.status = 0;
          parsed.parsingProgress = 0;
          parsed.parsingStatus = 'Starting round parsing...';
          parsed.lastTickTime = Date.now();
          meta = parsed;
          updateParsingProgress(0, 'Starting round parsing...');
          console.log('[ParseDemo] Meta ready, round parsing in progress');
          return;
        }
        if (e.data.type === 'PROGRESS') {
          if (!meta) return;
          lastTickTime = Date.now();
          const { uuid: workerUuid, parsedTicks } = e.data;
          if (workerUuid !== meta.uuid) return;
          const progress = Math.min(80, (parsedTicks / estimatedTotalTicks) * 80);
          const status = `Parsing rounds (${parsedTicks.toLocaleString()} / ~${estimatedTotalTicks.toLocaleString()} ticks)`;
          updateParsingProgress(Math.floor(progress), status);
          console.log(`[ParseDemo] [${meta.uuid}] Tick progress: ${parsedTicks.toLocaleString()} ticks (${Math.floor(progress)}%)`);
        } else if (e.data.type === 'ROUND_COMPLETE') {
          const round: ReplayRound = e.data.round;
          
          // Save round to IndexedDB immediately
          await saveRoundToStorage(round);
          savedRoundsCount++;
          
          console.log(`[ParseDemo] Round ${savedRoundsCount} saved to IndexedDB (${round.frames.length} frames)`);
          
          // ⚠️ DO NOT keep round in memory - let it be garbage collected
          // The round data is now safely stored in IndexedDB
          
        } else if (e.data.type === 'PARSING_COMPLETE') {
          if (!meta) return;
          try {
            console.log('[ParseDemo] PARSING_COMPLETE received:', {
              totalRounds: e.data.totalRounds,
              scoreCT: e.data.scoreCT,
              scoreT: e.data.scoreT,
              teamCT: e.data.teamCT,
              teamT: e.data.teamT,
              hasRoundResults: !!e.data.roundResults,
              roundResultsCount: e.data.roundResults?.length || 0,
              hasServerPlayer: !!e.data.serverPlayer,
              serverPlayerCount: e.data.serverPlayer?.length || 0,
            });
            const latestMeta: ReplayMeta = {
              ...meta,
              totalRounds: e.data.totalRounds ?? meta.totalRounds ?? 0,
              scoreCT: e.data.scoreCT ?? meta.scoreCT ?? 0,
              scoreT: e.data.scoreT ?? meta.scoreT ?? 0,
              teamCT: e.data.teamCT ?? meta.teamCT ?? '',
              teamT: e.data.teamT ?? meta.teamT ?? '',
              roundResults: e.data.roundResults ?? meta.roundResults,
              serverPlayer: e.data.serverPlayer ?? meta.serverPlayer,
              totalRawFrames: e.data.totalRawFrames ?? meta.totalRawFrames,
              totalParsedFrames: e.data.totalParsedFrames ?? meta.totalParsedFrames,
              status: 1,
              parsingProgress: 100,
              parsingStatus: 'Complete',
            };

            console.log(`[ParseDemo] Parsing complete for ${file.name}`);

            const totalRounds = e.data.totalRounds ?? 0;
            if (totalRounds > 0 && meta) {
              updateParsingProgress(80, '正在上传到云端...');
              await uploadDemosToServer(meta.uuid, totalRounds, latestMeta, updateParsingProgress);
              const { currentUser } = useAuth();
              if (currentUser.value) await loadReplayListFromServer();
            }
          } catch (e: any) {
            console.error('[ParseDemo] Finalization failed:', e);
          } finally {
            parsing.value = false;
            parsingProgress.value = 0;
            if (tickTimeoutHandle) clearInterval(tickTimeoutHandle);
            worker.terminate();
          }
          
        } else if (e.data.type === 'ERROR') {
          const { uuid: workerUuid, error: errorMessage } = e.data;
          console.error(`[ParseDemo] [${workerUuid}] Worker error:`, errorMessage);
          if (meta) {
            const { currentUser } = useAuth();
            if (currentUser.value) await loadReplayListFromServer();
          } else {
            error.value = `解析失败: ${errorMessage}`;
          }
          parsing.value = false;
          parsingProgress.value = 0;
          if (tickTimeoutHandle) clearInterval(tickTimeoutHandle);
          worker.terminate();
        }
      };

      worker.onerror = async (ev: ErrorEvent) => {
        const errMsg = ev.message || (ev.error && (ev.error as Error).message) || String(ev);
        console.error('[ParseDemo] Worker error event:', ev);
        if (meta) {
          const { currentUser } = useAuth();
          if (currentUser.value) await loadReplayListFromServer();
        } else {
          error.value = `解析失败: ${errMsg}`;
        }
        parsing.value = false;
        parsingProgress.value = 0;
        if (tickTimeoutHandle) clearInterval(tickTimeoutHandle);
        worker.terminate();
      };

      let roundLimit: number = -1;
      const roundLimitStr = localStorage.getItem(PARSING_ROUND_LIMIT_KEY);
      if (roundLimitStr) {
        const parsedLimit = parseInt(roundLimitStr, 10);
        if (parsedLimit > 0) roundLimit = parsedLimit;
      }
      let frameRatio = 1;
      const frameRatioStr = localStorage.getItem(PARSE_FRAME_RATIO_KEY);
      if (frameRatioStr) {
        const n = parseInt(frameRatioStr, 10);
        if (!isNaN(n) && n >= 1) frameRatio = n;
      }

      // Single transfer: worker does init + meta + parse; main never holds Go copy
      const transferList = demoBytes?.buffer ? [demoBytes.buffer] : [];
      worker.postMessage(
        {
          type: 'INIT_AND_PARSE',
          demoBytes,
          fileName: file.name.replace(/\.dem$/i, ''),
          estimatedTotalTicks,
          roundLimit,
          frameRatio
        },
        transferList
      );
      demoBytes = null;
      console.log('[ParseDemo] 🗑️ Transferred file buffer to worker (single copy in worker only)');
    } catch (e: any) {
      error.value = `解析失败: ${e.message || String(e)}`;
      demoBytes = null;
      parsing.value = false;
    }
  };

  const load = async () => {
    console.log('[Load] 开始初始化加载数据');
    try {
      loading.value = true;
      error.value = null;

      const { currentUser } = useAuth();
      if (currentUser.value) {
        await loadReplayListFromServer();
      } else {
        replayList.value = [];
      }
      console.log('[Load] 已加载回放列表，数量:', replayList.value.length);

      statusMsg.value = currentUser.value
        ? 'Demo 列表已从云端加载'
        : '请登录后查看云端 Demo 列表';
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      console.error('Initial load failed', e);
      error.value = '加载数据失败: ' + e.message;
    } finally {
      loading.value = false;
      console.log('[Load] 初始化加载完成，loading设置为false');
    }
  };

  const waitForInitialLoad = (): Promise<void> => {
    return initialLoadPromise ?? Promise.resolve();
  };

  onMounted(() => {
    initialLoadPromise = load();
  });

  onUnmounted(() => {
    abortController.abort();
    removeBeforeUnload();
  });

  return {
    loading,
    parsing,
    parsingProgress,
    parsingStatus,
    statusMsg,
    error,
    replay,
    frames,
    bounds,
    replayList,
    currentRoundNumber,
    showUploadBlockedWarning,
    parseDemo,
    loadReplayById,
    loadRoundData,
    deleteReplayById,
    waitForInitialLoad,
    replayRouteError,
    cloudDownloadProgress,
    replayerSource,
    replayerNoteId,
    replayerDemoId,
    cloudNoteDetailFromApi,
    loadReplayByLocal,
    loadReplayByCloud,
    loadReplayByDemosCloud,
    loadReplayListFromServer,
    clearCloudPlaybackState,
    getRoundFramesForPreview,
  };
}

// 导出单例函数
export function useReplayData(): UseReplayResult {
  if (!replayDataInstance) {
    console.log('[useReplayData] 创建新的单例');
    replayDataInstance = createReplayData();
  } else {
    console.log('[useReplayData] 使用已有单例');
  }
  return replayDataInstance;
}
