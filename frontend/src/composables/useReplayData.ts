import { onMounted, onUnmounted, ref } from 'vue';
import type { Frame, ReplayData, ReplayMeta, ReplayRound, ParsedReplayData, WorldBounds } from '@/types/replay';
import ParserWorker from '@/workers/wasm-parser.worker?worker';
import { getOPFSStorage } from './opfs-storage';
import { getMetaStorage } from './indexdb-storage';
import { decodeReplayMeta, decodeReplayRound, encodeReplayRound } from './proto-converters';
import { PARSER_CONFIG } from '@/config/parser';
import { ParsingMonitor } from './parsingMonitor';

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

  const abortController = new AbortController();
  let initialLoadPromise: Promise<void> | null = null;

  // ParsingMonitor instance
  let parsingMonitor: ParsingMonitor | null = null;

  // Load all replay metadata for list display
  const loadAllReplays = async () => {
    console.log('[LoadAllReplays] 开始加载所有回放元数据');
    const metaStorage = await getMetaStorage();
    const opfsStorage = await getOPFSStorage();
    
    // Step 1: 从 IndexedDB 加载所有 meta
    const metas = await metaStorage.loadAllMetas();
    console.log('[LoadAllReplays] 从 IndexedDB 加载的 meta 数量:', metas.length);
    
    // Step 2: 从 OPFS 获取所有 UUID（用于清理孤立目录）
    const opfsUUIDs = await opfsStorage.listAllReplays();
    const metaUUIDs = new Set(metas.map(m => m.uuid));
    
    // Step 3: 清理 OPFS 中孤立的目录（meta 已删除但 round 文件仍存在）
    const orphanDirs = opfsUUIDs.filter(uuid => !metaUUIDs.has(uuid));
    for (const uuid of orphanDirs) {
      console.log(`[LoadAllReplays] 清理孤立的 OPFS 目录: ${uuid}`);
      await opfsStorage.deleteReplay(uuid);
    }
    
    // Step 4: 直接映射 meta 到 replayList（无需 cache 合并）
    replayList.value = metas.map(meta => ({
      ...meta,
      id: meta.uuid,
      frames: [],
      timestamp: meta.uploadTime,
    }));
    
    console.log('[LoadAllReplays] 最终 replay list 大小:', replayList.value.length);
    
    // Start or restart ParsingMonitor
    startParsingMonitor();
  };
  
  // Start parsing monitor
  const startParsingMonitor = () => {
    // Stop existing monitor if any
    if (parsingMonitor) {
      parsingMonitor.stop();
    }
    
    // Create and start new monitor
    parsingMonitor = new ParsingMonitor({
      replayList,
      onReload: loadAllReplays,
    });
    
    parsingMonitor.start();
    console.log('[useReplayData] ParsingMonitor started');
  };
  
  // Stop parsing monitor
  const stopParsingMonitor = () => {
    if (parsingMonitor) {
      parsingMonitor.stop();
      parsingMonitor = null;
      console.log('[useReplayData] ParsingMonitor stopped');
    }
  };

  // Load replay meta and first round from OPFS
  const loadReplayFromOPFS = async (uuid?: string): Promise<ReplayData | null> => {
    console.log('[OPFS] 开始从数据库加载回放数据...', { uuid, storedUuid: localStorage.getItem(LATEST_KEY) });
    const metaStorage = await getMetaStorage();
    const opfsStorage = await getOPFSStorage();
    
    const targetUuid = uuid || localStorage.getItem(LATEST_KEY);
    console.log('[OPFS] 目标UUID:', targetUuid);
    if (!targetUuid) {
      console.log('[OPFS] 没有找到目标UUID，返回null');
      return null;
    }

    // 从 IndexedDB 加载 meta
    const meta = await metaStorage.loadMeta(targetUuid);
    if (!meta) {
      console.log('[OPFS] 未找到 meta');
      return null;
    }

    // 从 OPFS 加载第一回合
    const roundBytes = await opfsStorage.loadRound(targetUuid, 1);
    if (!roundBytes) {
      console.warn('[OPFS] 第一回合未找到');
      return null;
    }
    const firstRound = await decodeReplayRound(roundBytes);

    console.log('[OPFS] Loaded meta and first round (round 1) with', firstRound.frames.length, 'frames');

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
    console.log('[LoadReplayById] 开始加载回放，UUID:', uuid);
    try {
      // 不设置 loading 状态，避免触发 UI 重渲染
      const data = await loadReplayFromOPFS(uuid);
      console.log('[LoadReplayById] 从数据库获取的数据:', data ? '存在数据' : '未找到数据', { frameCount: data?.frames?.length });
      if (data) {
        console.log('[LoadReplayById] 准备设置回放数据，帧数量:', data.frames?.length);
        currentRoundNumber.value = 1; // Reset to first round
        setReplayData(data);
        localStorage.setItem(LATEST_KEY, uuid);
        console.log('[LoadReplayById] 回放数据设置完成，已更新最新UUID');
      } else {
        console.warn('[LoadReplayById] 未找到UUID为', uuid, '的回放数据');
      }
    } catch (e) {
      console.error('Failed to load replay', e);
    }
  };

  // Load specific round data and update frames
  const loadRoundData = async (uuid: string, roundNumber: number) => {
    console.log('[LoadRoundData] Loading round', roundNumber, 'for UUID:', uuid);
    try {
      const storage = await getOPFSStorage();
      const roundBytes = await storage.loadRound(uuid, roundNumber);

      if (!roundBytes) {
        console.warn('[LoadRoundData] Round', roundNumber, 'not found');
        return;
      }

      const round = await decodeReplayRound(roundBytes);
      console.log('[LoadRoundData] Loaded round', roundNumber, 'with', round.frames.length, 'frames');
      
      // Sort and update frames
      const sortedFrames = round.frames.sort((a, b) => a.timeMs - b.timeMs);
      frames.value = sortedFrames;
      currentRoundNumber.value = roundNumber;
      
      // Recalculate bounds if needed
      requestIdleCallback(() => {
        bounds.value = estimateBounds(frames.value);
        console.log('[LoadRoundData] Bounds recalculated for round', roundNumber);
      }, { timeout: 100 });
    } catch (e) {
      console.error('[LoadRoundData] Failed to load round', roundNumber, e);
    }
  };

  const deleteReplayById = async (uuid: string) => {
    console.log('[DeleteReplayById] 删除 UUID:', uuid);
    
    const metaStorage = await getMetaStorage();
    const opfsStorage = await getOPFSStorage();
    
    // 从 IndexedDB 删除 meta
    await metaStorage.deleteMeta(uuid);
    
    // 从 OPFS 删除 rounds
    await opfsStorage.deleteReplay(uuid);
    
    // 刷新列表
    await loadAllReplays();
    
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

  // Save single round to OPFS
  const saveRoundToOPFS = async (round: ReplayRound) => {
    console.log(`[SaveRoundToOPFS] 📦 Starting round ${round.round} save:`, {
      uuid: round.uuid,
      round: round.round,
      frameCount: round.frames?.length || 0
    });
    const storage = await getOPFSStorage();
    const roundBytes = await encodeReplayRound(round);
    console.log(`[SaveRoundToOPFS] 🔄 Encoded to protobuf, size: ${roundBytes.byteLength} bytes`);
    await storage.saveRound(round.uuid, round.round, roundBytes);
    console.log(`[SaveRoundToOPFS] ✅ Round ${round.round} saved successfully`);
  };

  const updateParsingProgress = (progress: number, status: string) => {
    parsingProgress.value = Math.min(100, Math.max(0, progress));
    parsingStatus.value = status;
    statusMsg.value = status;
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

      const metaStorage = await getMetaStorage();
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
            // 地图不支持等已由 worker 写入 status=-1 和 parsingStatus，直接保存不覆盖
            meta = parsed;
            await metaStorage.saveMeta(parsed);
            await loadAllReplays();
            parsing.value = false;
            parsingProgress.value = 0;
            console.log('[ParseDemo] ✅ Meta saved (status=-1, unsupported map or error)');
            return;
          }
          parsed.status = 0;
          parsed.parsingProgress = 0;
          parsed.parsingStatus = 'Starting round parsing...';
          parsed.lastTickTime = Date.now();
          meta = parsed;
          await metaStorage.saveMeta(parsed);
          await loadAllReplays();
          parsing.value = false;
          parsingProgress.value = 0;
          console.log('[ParseDemo] ✅ Meta saved (single copy in worker), parsing in progress');
          return;
        }
        if (e.data.type === 'PROGRESS') {
          if (!meta) return;
          lastTickTime = Date.now();
          const { uuid: workerUuid, parsedTicks } = e.data;
          if (workerUuid !== meta.uuid) return;
          const progress = Math.min(95, (parsedTicks / estimatedTotalTicks) * 95);
          const status = `Parsing rounds (${parsedTicks.toLocaleString()} / ~${estimatedTotalTicks.toLocaleString()} ticks)`;
          await metaStorage.updateMetaStatus(meta.uuid, 0, Math.floor(progress), status, Date.now());
          console.log(`[ParseDemo] [${meta.uuid}] Tick progress: ${parsedTicks.toLocaleString()} ticks (${Math.floor(progress)}%)`);
        } else if (e.data.type === 'ROUND_COMPLETE') {
          const round: ReplayRound = e.data.round;
          
          // Save round to OPFS immediately
          await saveRoundToOPFS(round);
          savedRoundsCount++;
          
          console.log(`[ParseDemo] Round ${savedRoundsCount} saved to OPFS (${round.frames.length} frames)`);
          
          // ⚠️ DO NOT keep round in memory - let it be garbage collected
          // The round data is now safely stored in OPFS
          
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
            const latestMeta = await metaStorage.loadMeta(meta.uuid);
            if (latestMeta) {
              latestMeta.totalRounds = e.data.totalRounds;
              latestMeta.scoreCT = e.data.scoreCT;
              latestMeta.scoreT = e.data.scoreT;
              latestMeta.teamCT = e.data.teamCT;
              latestMeta.teamT = e.data.teamT;
              latestMeta.roundResults = e.data.roundResults;
              latestMeta.serverPlayer = e.data.serverPlayer; // Save server player info
              if (e.data.totalRawFrames !== undefined) latestMeta.totalRawFrames = e.data.totalRawFrames;
              if (e.data.totalParsedFrames !== undefined) latestMeta.totalParsedFrames = e.data.totalParsedFrames;
              latestMeta.status = 1; // 完成
              latestMeta.parsingProgress = 100;
              latestMeta.parsingStatus = 'Complete';
              
              await metaStorage.saveMeta(latestMeta);
              console.log(`[ParseDemo] Meta 已更新到 IndexedDB: status=1, progress=100%, serverPlayers=${e.data.serverPlayer?.length || 0}`);
            }
            
            await loadAllReplays();
            console.log(`[ParseDemo] Background parsing complete for ${file.name}`);
          } catch (e: any) {
            console.error('[ParseDemo] Finalization failed:', e);
            await metaStorage.updateMetaStatus(meta.uuid, -1, undefined, `Finalization error: ${e.message}`);
          } finally {
            // Cleanup worker and tick timeout checker
            if (tickTimeoutHandle) clearInterval(tickTimeoutHandle);
            worker.terminate();
          }
          
        } else if (e.data.type === 'ERROR') {
          const { uuid: workerUuid, error: errorMessage } = e.data;
          console.error(`[ParseDemo] [${workerUuid}] Worker error:`, errorMessage);
          if (meta) {
            await metaStorage.updateMetaStatus(meta.uuid, -1, undefined, errorMessage);
            await loadAllReplays();
          } else {
            error.value = `解析失败: ${errorMessage}`;
            parsing.value = false;
          }
          if (tickTimeoutHandle) clearInterval(tickTimeoutHandle);
          worker.terminate();
        }
      };

      worker.onerror = async (ev: ErrorEvent) => {
        const errMsg = ev.message || (ev.error && (ev.error as Error).message) || String(ev);
        console.error('[ParseDemo] Worker error event:', ev);
        if (meta) {
          await metaStorage.updateMetaStatus(meta.uuid, -1, undefined, errMsg);
          await loadAllReplays();
        } else {
          error.value = `解析失败: ${errMsg}`;
          parsing.value = false;
        }
        if (tickTimeoutHandle) clearInterval(tickTimeoutHandle);
        worker.terminate();
      };

      let roundLimit: number = -1;
      const roundLimitStr = localStorage.getItem('demoParsingRoundLimit');
      if (roundLimitStr) {
        const parsedLimit = parseInt(roundLimitStr, 10);
        if (parsedLimit > 0) roundLimit = parsedLimit;
      }
      let frameRatio = 1;
      const frameRatioStr = localStorage.getItem('demoParsingFrameRatio');
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

      statusMsg.value = `后台解析中: ${file.name}`;
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

      await loadAllReplays();
      console.log('[Load] 已加载所有回放列表，数量:', replayList.value.length);

      // Don't automatically load any demo on first page load
      // User must manually select a demo from the list
      console.log('[Load] 不自动加载任何Demo，等待用户手动选择');
      statusMsg.value = '请打开左上角 Demo 列表并上传 demo 文件';
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
    stopParsingMonitor();
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
