import { onMounted, onUnmounted, ref } from 'vue';
import type { Frame, ReplayData, ReplayMeta, ReplayRound, ParsedReplayData, WorldBounds } from '@/types/replay';
import ParserWorker from '@/workers/wasm-parser.worker?worker';
import { getOPFSStorage } from './opfs-storage';
import { decodeReplayMeta, encodeReplayMeta, decodeReplayRound, encodeReplayRound } from './proto-converters';

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
  parseDemo: (file: File) => Promise<void>;
  loadReplayById: (id: string) => Promise<void>;
  loadRoundData: (uuid: string, roundNumber: number) => Promise<void>;
  deleteReplayById: (id: string) => Promise<void>;
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

  const abortController = new AbortController();

  // Save meta and rounds to OPFS with protobuf
  const saveReplayToOPFS = async (meta: ReplayMeta, rounds: ReplayRound[]) => {
    console.time('[SaveReplayToOPFS] 保存到OPFS耗时');
    const storage = await getOPFSStorage();
    
    // Convert to protobuf and save meta
    const metaBytes = await encodeReplayMeta(meta);
    await storage.saveMeta(meta.uuid, metaBytes);
    
    // Save each round
    for (const round of rounds) {
      const roundBytes = await encodeReplayRound(round);
      await storage.saveRound(round.uuid, round.round, roundBytes);
    }
    
    // Update latest UUID
    localStorage.setItem(LATEST_KEY, meta.uuid);

    console.timeEnd('[SaveReplayToOPFS] 保存到OPFS耗时');
  };

  // Load all replay metadata for list display
  const loadAllReplays = async () => {
    console.log('[LoadAllReplays] 开始加载所有回放元数据');
    const storage = await getOPFSStorage();
    
    const uuids = await storage.listAllReplays();
    console.log('[LoadAllReplays] 找到的UUID数量:', uuids.length);
    
    const metas = await Promise.all(
      uuids.map(async (uuid) => {
        const metaBytes = await storage.loadMeta(uuid);
        if (!metaBytes) return null;
        return await decodeReplayMeta(metaBytes);
      })
    );
    
    console.log('[LoadAllReplays] 加载到的元数据数量:', metas.filter(m => m !== null).length);
    
    // Convert meta to ReplayData for list display
    replayList.value = metas
      .filter((m): m is ReplayMeta => m !== null)
      .map(meta => {
        // Detect failed parsing: originalFilePath exists (backfill never completed)
        const hasFailed = !!meta.originalFilePath;
        
        return {
          uuid: meta.uuid,
          id: meta.uuid, // For backward compatibility
          uploaderUid: meta.uploaderUid,
          uploadTime: meta.uploadTime,
          mapName: meta.mapName,
          teamCT: meta.teamCT,
          teamT: meta.teamT,
          scoreCT: meta.scoreCT,
          scoreT: meta.scoreT,
          totalRounds: meta.totalRounds,
          totalFrames: meta.totalFrames || 0,
          totalDurationMs: meta.totalDurationMs || 0,
          frames: [], // Not loaded yet
          projectileRenderConfig: meta.projectileRenderConfig,
          timestamp: meta.uploadTime, // Map to uploadTime for backward compatibility
          fileName: meta.fileName, // Preserve filename
          // Parsing state fields
          isParsing: false,
          hasFailed: hasFailed,
          parsingStatus: hasFailed ? `Upload failed: ${meta.originalFilePath}` : undefined,
        };
      });
  };

  // Load replay meta and first round from OPFS
  const loadReplayFromOPFS = async (uuid?: string): Promise<ReplayData | null> => {
    console.log('[OPFS] 开始从数据库加载回放数据...', { uuid, storedUuid: localStorage.getItem(LATEST_KEY) });
    const storage = await getOPFSStorage();
    const targetUuid = uuid || localStorage.getItem(LATEST_KEY);
    console.log('[OPFS] 目标UUID:', targetUuid);
    if (!targetUuid) {
      console.log('[OPFS] 没有找到目标UUID，返回null');
      return null;
    }

    // Load meta
    const metaBytes = await storage.loadMeta(targetUuid);
    if (!metaBytes) {
      console.log('[OPFS] 未找到元数据');
      return null;
    }
    const meta = await decodeReplayMeta(metaBytes);

    // Load ONLY the first round
    const roundBytes = await storage.loadRound(targetUuid, 1);
    if (!roundBytes) {
      console.warn('[OPFS] First round not found');
      return null;
    }
    const firstRound = await decodeReplayRound(roundBytes);

    console.log('[OPFS] Loaded meta and first round (round 1) with', firstRound.frames.length, 'frames');

    // Sort frames within the first round
    const sortedFrames = firstRound.frames.sort((a, b) => a.timeMs - b.timeMs);

    // Convert to ReplayData format
    const replayData: ReplayData = {
      uuid: meta.uuid,
      id: meta.uuid,
      uploaderUid: meta.uploaderUid,
      uploadTime: meta.uploadTime,
      mapName: meta.mapName,
      teamCT: meta.teamCT,
      teamT: meta.teamT,
      scoreCT: meta.scoreCT,
      scoreT: meta.scoreT,
      totalRounds: meta.totalRounds,
      frames: sortedFrames,
      projectileRenderConfig: meta.projectileRenderConfig,
      timestamp: meta.uploadTime, // Map to uploadTime for backward compatibility
      fileName: meta.fileName, // Preserve filename
    };

    return replayData;
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
    console.log('[DeleteReplayById] Starting deletion for UUID:', uuid);
    const storage = await getOPFSStorage();
    await storage.deleteReplay(uuid);
    await loadAllReplays();
    if (localStorage.getItem(LATEST_KEY) === uuid) {
      localStorage.removeItem(LATEST_KEY);
      console.log('[DeleteReplayById] Removed from localStorage LATEST_KEY');
    }
    console.log('[DeleteReplayById] Deletion complete for UUID:', uuid);
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

  // Save only metadata to OPFS
  const saveMetaToOPFS = async (meta: ReplayMeta) => {
    console.log('[SaveMetaToOPFS] 📦 Starting meta save:', {
      uuid: meta.uuid,
      fileName: meta.fileName,
      mapName: meta.mapName,
      hasOriginalFilePath: !!meta.originalFilePath
    });
    const storage = await getOPFSStorage();
    const metaBytes = await encodeReplayMeta(meta);
    console.log(`[SaveMetaToOPFS] 🔄 Encoded to protobuf, size: ${metaBytes.byteLength} bytes`);
    await storage.saveMeta(meta.uuid, metaBytes);
    console.log('[SaveMetaToOPFS] ✅ Meta saved successfully');
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

  // Update parsing progress for a specific demo in the list
  const updateDemoParsingProgress = (uuid: string, progress: number, status: string) => {
    const demo = replayList.value.find(d => d.uuid === uuid);
    if (demo) {
      demo.parsingProgress = Math.min(100, Math.max(0, progress));
      demo.parsingStatus = status;
    }
  };

  const parseDemo = async (file: File) => {
    // Check if WASM functions are available
    if (typeof (window as any).initDemoParser !== 'function') {
      error.value = 'WASM 引擎尚未就绪，请稍后再试';
      return;
    }

    parsing.value = true;
    parsingProgress.value = 0;
    error.value = null;

    let demoUuid: string | null = null;

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      // Calculate estimated total ticks based on file size
      // Known ratio: 365MB = 131,735 ticks
      // Ratio: ~360.8 ticks per MB
      const fileSizeMB = file.size / (1024 * 1024);
      const estimatedTotalTicks = Math.round(fileSizeMB * 360.8);
      console.log(`[ParseDemo] File size: ${fileSizeMB.toFixed(2)}MB, Estimated ticks: ${estimatedTotalTicks}`);

      // ============ SYNCHRONOUS PHASE: Meta extraction ============
      // Step 1: Initialize parser
      updateParsingProgress(5, 'Initializing parser...');
      const initError = (window as any).initDemoParser(bytes);
      if (initError) throw new Error(initError);

      // Step 2: Extract metadata (header only, no frame traversal)
      updateParsingProgress(50, 'Extracting metadata...');
      console.log('[ParseDemo] 📦 Calling WASM extractDemoMetadata...');
      const metaBinary = await new Promise<Uint8Array>((resolve, reject) => {
        (window as any).extractDemoMetadata((res: any, err: string) => {
          if (err) {
            console.error('[ParseDemo] ❌ extractDemoMetadata error:', err);
            reject(new Error(err));
          } else {
            console.log('[ParseDemo] ✅ extractDemoMetadata returned binary, size:', res?.byteLength);
            resolve(res as Uint8Array);
          }
        });
      });
      console.log('[ParseDemo] 🔄 Decoding metadata from protobuf...');
      const meta: ReplayMeta = await decodeReplayMeta(metaBinary);
      demoUuid = meta.uuid;
      console.log('[ParseDemo] ✅ Metadata decoded successfully:', {
        uuid: meta.uuid,
        fileName: meta.fileName,
        mapName: meta.mapName
      });

      // Save original file path for failure detection
      meta.originalFilePath = file.name;
      
      // Save original filename without .dem extension
      meta.fileName = file.name.replace(/\.dem$/i, '');

      // Step 3: Save incomplete meta to OPFS immediately
      updateParsingProgress(100, 'Metadata saved!');
      console.log('[ParseDemo] 💾 Saving incomplete meta to OPFS...');
      await saveMetaToOPFS(meta);
      console.log('[ParseDemo] 🔄 Refreshing replay list...');
      await loadAllReplays(); // Refresh replay list
      console.log('[ParseDemo] ✅ Meta saved and list refreshed');

      // Mark this demo as parsing in the list
      const newDemo = replayList.value.find(d => d.uuid === meta.uuid);
      if (newDemo) {
        newDemo.isParsing = true;
        newDemo.hasFailed = false; // Clear any previous failure state
        newDemo.parsingProgress = 0;
        newDemo.parsingStatus = 'Starting round parsing...';
        console.log('[ParseDemo] 🏁 Marked demo as parsing in list');
      }

      // Close the global parsing modal - synchronous phase complete
      parsing.value = false;
      parsingProgress.value = 0;

      // ============ ASYNCHRONOUS PHASE: Round parsing in Web Worker ============
      const worker = new ParserWorker();
      const workerRounds: ReplayRound[] = [];

      // Setup message handler
      worker.onmessage = async (e: MessageEvent) => {
        if (e.data.type === 'PROGRESS') {
          // Update progress based on ticks (0-90% for parsing phase)
          const parsedTicks = e.data.parsedTicks;
          const progress = Math.min(90, (parsedTicks / estimatedTotalTicks) * 90);
          const status = `Parsing rounds (${parsedTicks.toLocaleString()} / ~${estimatedTotalTicks.toLocaleString()} ticks)`;
          updateDemoParsingProgress(meta.uuid, Math.floor(progress), status);
          
        } else if (e.data.type === 'ROUND_COMPLETE') {
          const round: ReplayRound = e.data.round;
          workerRounds.push(round);
          
          // Save round to OPFS immediately
          await saveRoundToOPFS(round);
          
          console.log(`[ParseDemo] Round ${workerRounds.length} saved to OPFS`);
          
        } else if (e.data.type === 'PARSING_COMPLETE') {
          try {
            // Phase 3: Update metadata with statistics from worker
            updateDemoParsingProgress(meta.uuid, 95, 'Finalizing metadata...');
            
            // Update meta with final statistics from worker
            meta.totalRounds = e.data.totalRounds;
            meta.scoreCT = e.data.scoreCT;
            meta.scoreT = e.data.scoreT;
            meta.teamCT = e.data.teamCT;
            meta.teamT = e.data.teamT;
            
            console.log(`[ParseDemo] Final stats - Rounds: ${meta.totalRounds}, CT: ${meta.teamCT} (${meta.scoreCT}), T: ${meta.teamT} (${meta.scoreT})`);
            
            // Remove temporary field after successful parsing
            delete meta.originalFilePath;
            await saveMetaToOPFS(meta);
            await loadAllReplays();
            
            // Close parser on main thread
            (window as any).closeDemoParser();
            
            // Mark parsing complete
            updateDemoParsingProgress(meta.uuid, 100, 'Complete');
            const completedDemo = replayList.value.find(d => d.uuid === meta.uuid);
            if (completedDemo) {
              completedDemo.isParsing = false;
              completedDemo.parsingProgress = 100;
              completedDemo.parsingStatus = 'Complete';
            }
            
            console.log(`[ParseDemo] Background parsing complete for ${file.name}`);
          } catch (e: any) {
            console.error('[ParseDemo] Finalization failed:', e);
            const failedDemo = replayList.value.find(d => d.uuid === meta.uuid);
            if (failedDemo) {
              failedDemo.isParsing = false;
              failedDemo.hasFailed = true;
              failedDemo.parsingStatus = `Finalization error: ${e.message || String(e)}`;
            }
            (window as any).closeDemoParser();
          } finally {
            // Cleanup worker
            worker.terminate();
          }
          
        } else if (e.data.type === 'ERROR') {
          console.error('[ParseDemo] Worker error:', e.data.error);
          const failedDemo = replayList.value.find(d => d.uuid === meta.uuid);
          if (failedDemo) {
            failedDemo.isParsing = false;
            failedDemo.hasFailed = true;
            failedDemo.parsingStatus = `Error: ${e.data.error}`;
          }
          (window as any).closeDemoParser();
          worker.terminate();
        }
      };

      // Handle worker errors
      worker.onerror = (error: ErrorEvent) => {
        console.error('[ParseDemo] Worker error event:', error);
        const failedDemo = replayList.value.find(d => d.uuid === meta.uuid);
        if (failedDemo) {
          failedDemo.isParsing = false;
          failedDemo.hasFailed = true;
          failedDemo.parsingStatus = `Worker error: ${error.message}`;
        }
        (window as any).closeDemoParser();
        worker.terminate();
      };

      // Start worker parsing
      worker.postMessage({
        type: 'PARSE_ROUNDS',
        demoBytes: bytes,
        uuid: meta.uuid,
        estimatedTotalTicks
      });

      statusMsg.value = `后台解析中: ${file.name}`;
    } catch (e: any) {
      error.value = `解析失败: ${e.message || String(e)}`;
      if (demoUuid) {
        const failedDemo = replayList.value.find(d => d.uuid === demoUuid);
        if (failedDemo) {
          failedDemo.isParsing = false;
          failedDemo.hasFailed = true;
          failedDemo.parsingStatus = `Error: ${e.message || String(e)}`;
        }
      }
      (window as any).closeDemoParser(); // Cleanup on error
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

  onMounted(load);

  onUnmounted(() => {
    abortController.abort();
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
    parseDemo,
    loadReplayById,
    loadRoundData,
    deleteReplayById,
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
