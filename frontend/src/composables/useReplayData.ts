import { onMounted, onUnmounted, ref } from 'vue';
import type { Frame, ReplayData, ReplayMeta, ReplayRound, ParsedReplayData, WorldBounds } from '@/types/replay';
import ParserWorker from '@/workers/wasm-parser.worker?worker';
import { getOPFSStorage } from './opfs-storage';
import { decodeReplayMeta, encodeReplayMeta, decodeReplayRound, encodeReplayRound } from './proto-converters';
import { PARSER_CONFIG } from '@/config/parser';

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
const PARSING_CACHE_PREFIX = 'parsing_cache_';

// Interface for cached parsing state
interface ParsingStateCache {
  uuid: string;
  progress: number;
  status: string;
  lastTickTime: number; // Timestamp of last tick event (for timeout detection)
}

// Generate cache key from UUID
const getParsingCacheKey = (uuid: string) => `${PARSING_CACHE_PREFIX}${uuid}`;

// Save parsing state to sessionStorage (called by worker progress updates)
const saveParsingState = (uuid: string, progress: number, status: string) => {
  try {
    const cache: ParsingStateCache = {
      uuid,
      progress,
      status,
      lastTickTime: Date.now()
    };
    sessionStorage.setItem(getParsingCacheKey(uuid), JSON.stringify(cache));
  } catch (e) {
    console.warn('[ParsingCache] Failed to save:', e);
  }
};

// Load cached parsing state
const loadParsingState = (uuid: string): ParsingStateCache | null => {
  try {
    const cached = sessionStorage.getItem(getParsingCacheKey(uuid));
    if (!cached) return null;
    
    const state: ParsingStateCache = JSON.parse(cached);
    return state;
  } catch (e) {
    console.warn('[ParsingCache] Failed to load:', e);
    return null;
  }
};

// Check if parsing has timed out based on cached timestamp
const isParsingTimedOut = (cache: ParsingStateCache): boolean => {
  const timeSinceLastTick = Date.now() - cache.lastTickTime;
  return timeSinceLastTick > PARSER_CONFIG.workerTickTimeout;
};

// Clear parsing state cache for a specific UUID
const clearParsingState = (uuid: string) => {
  try {
    sessionStorage.removeItem(getParsingCacheKey(uuid));
  } catch (e) {
    console.warn('[ParsingCache] Failed to clear:', e);
  }
};

// Clear all parsing caches (useful for cleanup)
const clearAllParsingStates = () => {
  try {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith(PARSING_CACHE_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (e) {
    console.warn('[ParsingCache] Failed to clear all:', e);
  }
};

// Get all UUIDs that have parsing cache
const getAllCachedUUIDs = (): string[] => {
  try {
    const keys = Object.keys(sessionStorage);
    return keys
      .filter(key => key.startsWith(PARSING_CACHE_PREFIX))
      .map(key => key.replace(PARSING_CACHE_PREFIX, ''));
  } catch (e) {
    console.warn('[ParsingCache] Failed to get cached UUIDs:', e);
    return [];
  }
};

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
  
  // Interval handle for checking incomplete demos timeout
  let incompleteCheckInterval: number | null = null;

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
    
    // Step 1: Build UUID map from meta
    const metaMap = new Map<string, ReplayMeta>();
    metas
      .filter((m): m is ReplayMeta => m !== null)
      .forEach(meta => {
        metaMap.set(meta.uuid, meta);
      });
    console.log('[LoadAllReplays] Step 1: Meta map size:', metaMap.size);
    
    // Step 2: Get all UUIDs from cache
    const cachedUUIDs = getAllCachedUUIDs();
    const cacheSet = new Set(cachedUUIDs);
    console.log('[LoadAllReplays] Step 2: Cached UUIDs:', cachedUUIDs.length, cachedUUIDs);
    
    // Step 3: Find intersection and clean up orphan caches
    const intersection = cachedUUIDs.filter(uuid => metaMap.has(uuid));
    const orphanCaches = cachedUUIDs.filter(uuid => !metaMap.has(uuid));
    
    console.log('[LoadAllReplays] Step 3: Intersection (cache + meta):', intersection.length, intersection);
    console.log('[LoadAllReplays] Step 3: Orphan caches (cache only):', orphanCaches.length, orphanCaches);
    
    // Clean up orphan caches (uuid in cache but not in meta)
    orphanCaches.forEach(uuid => {
      console.log(`[LoadAllReplays] Cleaning orphan cache: ${uuid}`);
      clearParsingState(uuid);
    });
    
    // Step 4: Render cards based on meta map
    replayList.value = Array.from(metaMap.values()).map(meta => {
      const uuid = meta.uuid;
      const hasCache = cacheSet.has(uuid);
      
      let hasFailed = false;
      let parsingStatus: string | undefined = undefined;
      let parsingProgress = 0;
      
      if (hasCache) {
        // UUID exists in both cache and meta - show progress bar
        const cachedState = loadParsingState(uuid);
        
        if (cachedState) {
          // Check timeout using cached timestamp and config
          if (isParsingTimedOut(cachedState)) {
            // Timeout exceeded - mark as failed but KEEP cache
            hasFailed = true;
            parsingStatus = `Parsing timeout (no progress for ${PARSER_CONFIG.workerTickTimeout / 1000}s)`;
            parsingProgress = cachedState.progress;
            console.log(`[LoadAllReplays] [${uuid}] Timeout detected from cache - marked as failed, cache retained`);
            // Do NOT clear cache here - user will clean up manually
            // clearParsingState(uuid); // ❌ 移除这行
          } else {
            // Still within timeout - show incomplete with progress from cache
            parsingProgress = cachedState.progress;
            parsingStatus = cachedState.status;
            console.log(`[LoadAllReplays] [${uuid}] Restoring progress: ${parsingProgress}%, status: ${parsingStatus}`);
          }
        } else {
          // Cache key exists but content is invalid/empty
          console.warn(`[LoadAllReplays] [${uuid}] Cache key exists but content invalid`);
          clearParsingState(uuid);
        }
      }
      // If UUID only in meta (not in cache), render normally (no special handling)
      
      return {
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
        totalFrames: meta.totalFrames || 0,
        totalDurationMs: meta.totalDurationMs || 0,
        frames: [],
        projectileRenderConfig: meta.projectileRenderConfig,
        timestamp: meta.uploadTime,
        fileName: meta.fileName,
        // Parsing state fields - purely based on cache
        isParsing: false,
        hasFailed: hasFailed,
        parsingProgress: parsingProgress,
        parsingStatus: parsingStatus,
      };
    });
    
    console.log('[LoadAllReplays] Final replay list size:', replayList.value.length);
    
    // Start monitoring incomplete demos for timeout
    startIncompleteMonitoring();
  };
  
  // Monitor incomplete demos and check for timeout
  const startIncompleteMonitoring = () => {
    // Clear existing interval if any
    if (incompleteCheckInterval) {
      clearInterval(incompleteCheckInterval);
    }
    
    // Check every 2 seconds (faster polling for responsive progress updates)
    incompleteCheckInterval = setInterval(() => {
      checkIncompleteDemosTimeout();
    }, 2000) as unknown as number;
    
    console.log('[IncompleteMonitor] Started monitoring (polling cache every 2s)');
  };
  
  // Check all incomplete demos for timeout
  const checkIncompleteDemosTimeout = () => {
    let checkedCount = 0;
    let updatedCount = 0;
    let timedOutCount = 0;
    let cacheNotFoundCount = 0;
    let completedCount = 0;
    
    // Get current cached UUIDs (may be multiple demos parsing concurrently)
    const cachedUUIDs = getAllCachedUUIDs();
    
    if (cachedUUIDs.length > 0) {
      console.log(`[IncompleteMonitor] Polling ${cachedUUIDs.length} demos in cache: [${cachedUUIDs.map(u => u.substring(0, 8)).join(', ')}]`);
    }
    
    // Track if any updates were made
    let hasUpdates = false;
    let needsReload = false;
    
    // Iterate through ALL demos in replayList with index for reactive updates
    replayList.value.forEach((demo, index) => {
      // Only check demos that have cache and are not already failed
      if (cachedUUIDs.includes(demo.uuid) && !demo.hasFailed) {
        checkedCount++;
        const cachedState = loadParsingState(demo.uuid);
        
        if (cachedState) {
          // Check if parsing is complete
          if (cachedState.progress === 100 && cachedState.status === 'Complete') {
            completedCount++;
            console.log(`[IncompleteMonitor] [${demo.uuid.substring(0, 8)}] Parsing completed (100%), will reload cards`);
            
            // Clear cache for completed demo
            clearParsingState(demo.uuid);
            
            // Mark that we need to reload all cards to show normal state
            needsReload = true;
          }
          // Check timeout
          else if (isParsingTimedOut(cachedState)) {
            // Timeout exceeded - mark as failed but KEEP cache (wait for user to delete)
            timedOutCount++;
            console.log(`[IncompleteMonitor] [${demo.uuid.substring(0, 8)}] Timeout detected (no updates for ${PARSER_CONFIG.workerTickTimeout / 1000}s) - marked as failed, cache retained`);
            
            // Update via index assignment to trigger reactivity
            replayList.value[index] = {
              ...demo,
              hasFailed: true,
              parsingStatus: `Parsing timeout (no progress for ${PARSER_CONFIG.workerTickTimeout / 1000}s)`,
              isParsing: false,
              parsingProgress: cachedState.progress, // Keep last known progress
            };
            hasUpdates = true;
            
            // Do NOT clear cache - keep it until user deletes the card
            // clearParsingState(demo.uuid); // ❌ 移除这行
          } else {
            // Still within timeout - update progress from cache
            const progressChanged = demo.parsingProgress !== cachedState.progress;
            const statusChanged = demo.parsingStatus !== cachedState.status;
            
            if (progressChanged || statusChanged) {
              updatedCount++;
              console.log(`[IncompleteMonitor] [${demo.uuid.substring(0, 8)}] Progress updated: ${cachedState.progress}%, status: ${cachedState.status}`);
              
              // Update via index assignment to trigger reactivity
              replayList.value[index] = {
                ...demo,
                parsingProgress: cachedState.progress,
                parsingStatus: cachedState.status,
              };
              hasUpdates = true;
            }
          }
        } else {
          // Cache not found but UUID in cached list - invalid state, clean up
          cacheNotFoundCount++;
          console.warn(`[IncompleteMonitor] [${demo.uuid.substring(0, 8)}] Cache key exists but content invalid, cleaning up`);
          clearParsingState(demo.uuid);
        }
      }
    });
    
    if (checkedCount > 0) {
      console.log(`[IncompleteMonitor] Poll summary: ${checkedCount} checked, ${updatedCount} updated, ${completedCount} completed, ${timedOutCount} timed out, ${cacheNotFoundCount} cache invalid, hasUpdates: ${hasUpdates}`);
    }
    
    // Reload all cards if any demo completed parsing
    if (needsReload) {
      console.log(`[IncompleteMonitor] Reloading all cards due to ${completedCount} completed demo(s)`);
      loadAllReplays();
    }
  };
  
  // Stop monitoring when component unmounts
  const stopIncompleteMonitoring = () => {
    if (incompleteCheckInterval) {
      clearInterval(incompleteCheckInterval);
      incompleteCheckInterval = null;
      console.log('[IncompleteMonitor] Stopped monitoring');
    }
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
      roundResults: meta.roundResults, // Preserve round results
      frames: sortedFrames,
      projectileRenderConfig: meta.projectileRenderConfig,
      timestamp: meta.uploadTime, // Map to uploadTime for backward compatibility
      fileName: meta.fileName, // Preserve filename
    };

    console.log('[LoadReplayFromOPFS] ReplayData created with roundResults:', {
      hasRoundResults: !!replayData.roundResults,
      roundResultsLength: replayData.roundResults?.length || 0,
      roundResults: replayData.roundResults
    });

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
    
    // Clean up parsing cache when user deletes the card
    clearParsingState(uuid);
    console.log('[DeleteReplayById] Cleared parsing cache for UUID:', uuid);
    
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

  // Update parsing progress for a specific demo - only write to cache, do not update replayList
  // Frontend will poll cache periodically to update progress bar
  const updateDemoParsingProgress = (uuid: string, progress: number, status: string) => {
    // Only save to cache, frontend will read from cache to update UI
    saveParsingState(uuid, progress, status);
    console.log(`[UpdateProgress] [${uuid}] Saved to cache: ${progress}%, ${status}`);
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
      // Ratio: ~360.8 ticks per MB （or less）
      const fileSizeMB = file.size / (1024 * 1024);
      const estimatedTotalTicks = Math.round(fileSizeMB * 360);
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
      
      // Mark as parsing (will be cleared during backfill)
      meta.isParsing = true;

      // Step 3: Save incomplete meta to OPFS immediately
      updateParsingProgress(100, 'Metadata saved!');
      console.log('[ParseDemo] 💾 Saving incomplete meta to OPFS (with isParsing=true)...');
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
      let lastTickTime = Date.now();
      let tickTimeoutHandle: number | null = null;

      // Check for tick timeout (no progress updates for configured duration)
      const checkTickTimeout = () => {
        const timeSinceLastTick = Date.now() - lastTickTime;
        if (timeSinceLastTick > PARSER_CONFIG.workerTickTimeout) {
          console.error(`[ParseDemo] Tick timeout - no progress updates for ${PARSER_CONFIG.workerTickTimeout / 1000}s`);
          // Worker timeout - don't clear cache, let polling detect it and mark as failed
          // This preserves the last known progress for user to see
          (window as any).closeDemoParser();
          // Do NOT clear cache here - let polling handle it
          // clearParsingState(meta.uuid); // ❌ 移除这行
          if (tickTimeoutHandle) clearInterval(tickTimeoutHandle);
          worker.terminate();
        }
      };

      // Start tick timeout checker (check every 5 seconds)
      tickTimeoutHandle = setInterval(checkTickTimeout, 5000) as unknown as number;

      // Setup message handler
      worker.onmessage = async (e: MessageEvent) => {
        if (e.data.type === 'PROGRESS') {
          // Update last tick time on progress
          lastTickTime = Date.now();
          
          const { uuid: workerUuid, parsedTicks } = e.data;
          
          // Verify uuid match
          if (workerUuid !== meta.uuid) {
            console.error(`[ParseDemo] UUID mismatch! Expected: ${meta.uuid}, Got: ${workerUuid}`);
            return;
          }
          
          // Update progress based on ticks (0-95% for parsing phase)
          const progress = Math.min(95, (parsedTicks / estimatedTotalTicks) * 95);
          const status = `Parsing rounds (${parsedTicks.toLocaleString()} / ~${estimatedTotalTicks.toLocaleString()} ticks)`;
          updateDemoParsingProgress(meta.uuid, Math.floor(progress), status);
          console.log(`[ParseDemo] [${meta.uuid}] Tick progress: ${parsedTicks.toLocaleString()} ticks (${Math.floor(progress)}%)`);
          
        } else if (e.data.type === 'ROUND_COMPLETE') {
          const round: ReplayRound = e.data.round;
          workerRounds.push(round);
          
          // Save round to OPFS immediately
          await saveRoundToOPFS(round);
          
          console.log(`[ParseDemo] Round ${workerRounds.length} saved to OPFS`);
          
        } else if (e.data.type === 'PARSING_COMPLETE') {
          try {
            // Phase 3: Update metadata with statistics from worker
            updateDemoParsingProgress(meta.uuid, 97, 'Finalizing metadata...');
            
            console.log('[ParseDemo] PARSING_COMPLETE received:', {
              totalRounds: e.data.totalRounds,
              scoreCT: e.data.scoreCT,
              scoreT: e.data.scoreT,
              teamCT: e.data.teamCT,
              teamT: e.data.teamT,
              hasRoundResults: !!e.data.roundResults,
              roundResultsCount: e.data.roundResults?.length || 0,
              roundResults: e.data.roundResults
            });
            
            // Update meta with final statistics from worker
            meta.totalRounds = e.data.totalRounds;
            meta.scoreCT = e.data.scoreCT;
            meta.scoreT = e.data.scoreT;
            meta.teamCT = e.data.teamCT;
            meta.teamT = e.data.teamT;
            meta.roundResults = e.data.roundResults; // Save round results!
            
            console.log(`[ParseDemo] Final stats - Rounds: ${meta.totalRounds}, CT: ${meta.teamCT} (${meta.scoreCT}), T: ${meta.teamT} (${meta.scoreT}), RoundResults: ${meta.roundResults?.length || 0}`);
            console.log('[ParseDemo] Meta roundResults before save:', meta.roundResults);
            
            // Remove temporary fields after successful parsing (backfill complete)
            delete meta.originalFilePath;
            delete meta.isParsing;
            await saveMetaToOPFS(meta);
            await loadAllReplays(); // Reload will detect cache cleared and show normal card
            
            // Close parser on main thread
            (window as any).closeDemoParser();
            
            // Save completion status to cache (will be read by next poll)
            updateDemoParsingProgress(meta.uuid, 100, 'Complete');
            
            // Clear cached parsing state after a short delay (allow one last poll to see 100%)
            setTimeout(() => {
              clearParsingState(meta.uuid);
              console.log(`[ParseDemo] Cleared cache for ${meta.uuid}`);
            }, 3000);
            
            console.log(`[ParseDemo] Background parsing complete for ${file.name}`);
          } catch (e: any) {
            console.error('[ParseDemo] Finalization failed:', e);
            // Don't clear cache - keep last progress for user to see before manual deletion
            (window as any).closeDemoParser();
            // Do NOT clear cache - let polling detect timeout
            // clearParsingState(meta.uuid); // ❌ 移除这行
          } finally {
            // Cleanup worker and tick timeout checker
            if (tickTimeoutHandle) clearInterval(tickTimeoutHandle);
            worker.terminate();
          }
          
        } else if (e.data.type === 'ERROR') {
          const { uuid: workerUuid, error: errorMessage } = e.data;
          console.error(`[ParseDemo] [${workerUuid}] Worker error:`, errorMessage);
          
          // Verify uuid match
          if (workerUuid !== meta.uuid) {
            console.error(`[ParseDemo] UUID mismatch in error! Expected: ${meta.uuid}, Got: ${workerUuid}`);
          }
          
          // Don't clear cache - keep last progress for user to see
          (window as any).closeDemoParser();
          // Do NOT clear cache - let polling detect timeout and mark as failed
          // clearParsingState(meta.uuid); // ❌ 移除这行
          if (tickTimeoutHandle) clearInterval(tickTimeoutHandle);
          worker.terminate();
        }
      };

      // Handle worker errors
      worker.onerror = (error: ErrorEvent) => {
        console.error('[ParseDemo] Worker error event:', error);
        // Don't clear cache - keep last progress for user to see
        (window as any).closeDemoParser();
        // Do NOT clear cache - let polling detect timeout and mark as failed
        // clearParsingState(meta.uuid); // ❌ 移除这行
        if (tickTimeoutHandle) clearInterval(tickTimeoutHandle);
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
    stopIncompleteMonitoring(); // Stop monitoring on unmount
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
