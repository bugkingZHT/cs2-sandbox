import { onMounted, onUnmounted, ref } from 'vue';
import type { Frame, ReplayData, ReplayMeta, ReplayRound, ParsedReplayData, WorldBounds } from '@/types/replay';

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

const DB_NAME = 'CS2ReplayDB';
const META_STORE_NAME = 'replayMeta';
const ROUND_STORE_NAME = 'replayRounds';
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

  let db: IDBDatabase | null = null;

  const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const request = indexedDB.open(DB_NAME, 2); // Increment version for schema change
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };
      request.onupgradeneeded = (e: any) => {
        const database = e.target.result;
        
        // Create meta store if not exists
        if (!database.objectStoreNames.contains(META_STORE_NAME)) {
          database.createObjectStore(META_STORE_NAME); // key = UUID
        }
        
        // Create rounds store if not exists
        // Key is manually specified as uuid_roundID, not using keyPath
        if (!database.objectStoreNames.contains(ROUND_STORE_NAME)) {
          database.createObjectStore(ROUND_STORE_NAME); // No keyPath, use explicit keys
        }
      };
    });
  };

  // Save meta and rounds to IndexedDB separately
  const saveReplayToDB = async (meta: ReplayMeta, rounds: ReplayRound[]) => {
    console.time('[SaveReplayToDB] 保存到IndexedDB耗时');
    const database = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = database.transaction([META_STORE_NAME, ROUND_STORE_NAME], 'readwrite');
      const metaStore = tx.objectStore(META_STORE_NAME);
      const roundStore = tx.objectStore(ROUND_STORE_NAME);
      
      // Save meta data with UUID as key
      metaStore.put(meta, meta.uuid);
      
      // Save each round with composite key: uuid_roundID
      rounds.forEach(round => {
        const key = `${round.uuid}_${round.round}`;
        roundStore.put(round, key);
      });
      
      // Update latest UUID
      localStorage.setItem(LATEST_KEY, meta.uuid);

      tx.oncomplete = () => {
        console.timeEnd('[SaveReplayToDB] 保存到IndexedDB耗时');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  };

  // Load all replay metadata for list display
  const loadAllReplays = async () => {
    console.log('[LoadAllReplays] 开始加载所有回放元数据');
    const database = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = database.transaction(META_STORE_NAME, 'readonly');
      const store = tx.objectStore(META_STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const metas = request.result as ReplayMeta[];
        console.log('[LoadAllReplays] 加载到的元数据数量:', metas.length);
        
        // Convert meta to ReplayData for list display
        replayList.value = metas.map(meta => ({
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
        }));
        
        resolve();
      };
      request.onerror = () => {
        console.error('[LoadAllReplays] 加载所有回放元数据失败:', request.error);
        reject(request.error);
      };
    });
  };

  // Load replay meta and all rounds from DB
  const loadReplayFromDB = async (uuid?: string): Promise<ReplayData | null> => {
    console.log('[IndexedDB] 开始从数据库加载回放数据...', { uuid, storedUuid: localStorage.getItem(LATEST_KEY) });
    const database = await initDB();
    const targetUuid = uuid || localStorage.getItem(LATEST_KEY);
    console.log('[IndexedDB] 目标UUID:', targetUuid);
    if (!targetUuid) {
      console.log('[IndexedDB] 没有找到目标UUID，返回null');
      return null;
    }

    // Load meta
    const meta = await new Promise<ReplayMeta | null>((resolve, reject) => {
      const tx = database.transaction(META_STORE_NAME, 'readonly');
      const store = tx.objectStore(META_STORE_NAME);
      const request = store.get(targetUuid);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (!meta) {
      console.log('[IndexedDB] 未找到元数据');
      return null;
    }

    // Load ONLY the first round instead of all rounds
    const firstRound = await new Promise<ReplayRound | null>((resolve, reject) => {
      const tx = database.transaction(ROUND_STORE_NAME, 'readonly');
      const store = tx.objectStore(ROUND_STORE_NAME);
      const key = `${targetUuid}_1`; // Load round 1
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    if (!firstRound) {
      console.warn('[IndexedDB] First round not found');
      return null;
    }

    console.log('[IndexedDB] Loaded meta and first round (round 1) with', firstRound.frames.length, 'frames');

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
      totalFrames: meta.totalFrames || 0,
      totalDurationMs: meta.totalDurationMs || 0,
      frames: sortedFrames,
      projectileRenderConfig: meta.projectileRenderConfig,
      timestamp: meta.uploadTime, // Map to uploadTime for backward compatibility
    };

    return replayData;
  };

  const loadReplayById = async (uuid: string) => {
    console.log('[LoadReplayById] 开始加载回放，UUID:', uuid);
    try {
      // 不设置 loading 状态，避免触发 UI 重渲染
      const data = await loadReplayFromDB(uuid);
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
      const database = await initDB();
      const key = `${uuid}_${roundNumber}`;
      
      const round = await new Promise<ReplayRound | null>((resolve, reject) => {
        const tx = database.transaction(ROUND_STORE_NAME, 'readonly');
        const store = tx.objectStore(ROUND_STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });

      if (!round) {
        console.warn('[LoadRoundData] Round', roundNumber, 'not found');
        return;
      }

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
    const database = await initDB();
    return new Promise<void>(async (resolve, reject) => {
      const tx = database.transaction([META_STORE_NAME, ROUND_STORE_NAME], 'readwrite');
      const metaStore = tx.objectStore(META_STORE_NAME);
      const roundStore = tx.objectStore(ROUND_STORE_NAME);
      
      // Delete meta
      metaStore.delete(uuid);
      
      // Delete all rounds with this UUID by iterating and checking keys
      const getAllKeysRequest = roundStore.getAllKeys();
      getAllKeysRequest.onsuccess = () => {
        const allKeys = getAllKeysRequest.result;
        // Filter keys that start with uuid_
        const keysToDelete = allKeys.filter(key => 
          typeof key === 'string' && key.startsWith(`${uuid}_`)
        );
        keysToDelete.forEach(key => roundStore.delete(key));
      };
      
      tx.oncomplete = async () => {
        await loadAllReplays();
        if (localStorage.getItem(LATEST_KEY) === uuid) {
          localStorage.removeItem(LATEST_KEY);
        }
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
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

  // Save only metadata to DB
  const saveMetaToDB = async (meta: ReplayMeta) => {
    const database = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = database.transaction([META_STORE_NAME], 'readwrite');
      const metaStore = tx.objectStore(META_STORE_NAME);
      metaStore.put(meta, meta.uuid);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  };

  // Save single round to DB
  const saveRoundToDB = async (round: ReplayRound) => {
    const database = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = database.transaction([ROUND_STORE_NAME], 'readwrite');
      const roundStore = tx.objectStore(ROUND_STORE_NAME);
      const key = `${round.uuid}_${round.round}`;
      roundStore.put(round, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  };

  const updateParsingProgress = (progress: number, status: string) => {
    parsingProgress.value = Math.min(100, Math.max(0, progress));
    parsingStatus.value = status;
    statusMsg.value = status;
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

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Step 1: Initialize parser
      updateParsingProgress(5, 'Initializing parser...');
      const initError = (window as any).initDemoParser(bytes);
      if (initError) throw new Error(initError);

      // Step 2: Extract metadata (header only, no frame traversal)
      updateParsingProgress(10, 'Extracting metadata...');
      const metaJson = await new Promise<string>((resolve, reject) => {
        (window as any).extractDemoMetadata((res: string, err: string) => {
          if (err) reject(new Error(err));
          else resolve(res);
        });
      });
      const meta: ReplayMeta = JSON.parse(metaJson);

      // Step 3: Save incomplete meta to DB immediately
      updateParsingProgress(15, 'Saving metadata...');
      await saveMetaToDB(meta);
      await loadAllReplays(); // Refresh replay list

      // Step 4: Parse rounds incrementally
      const rounds: ReplayRound[] = [];
      let roundNum = 1;

      while (true) {
        const roundJson = await new Promise<string | null>((resolve, reject) => {
          (window as any).parseNextRound(
            (res: string | null, err: string) => {
              if (err) reject(new Error(err));
              else resolve(res);
            },
            (statusMsg: string) => {
              // Update progress based on round number
              const progress = 15 + (roundNum * 3); // Incremental progress
              updateParsingProgress(Math.min(90, progress), statusMsg);
            }
          );
        });

        if (!roundJson) break; // EOF reached

        const round: ReplayRound = JSON.parse(roundJson);
        rounds.push(round);

        // Save round to DB immediately after parsing
        await saveRoundToDB(round);

        roundNum++;
      }

      // Step 5: Backfill metadata with final round count and scores
      updateParsingProgress(95, 'Finalizing metadata...');
      const updatedMetaJson = await new Promise<string>((resolve, reject) => {
        (window as any).backfillDemoMeta(JSON.stringify(meta), (res: string, err: string) => {
          if (err) reject(new Error(err));
          else resolve(res);
        });
      });
      const finalMeta: ReplayMeta = JSON.parse(updatedMetaJson);

      // Step 6: Update meta in DB with final values
      await saveMetaToDB(finalMeta);

      // Step 7: Close parser and cleanup
      (window as any).closeDemoParser();

      // Step 8: Load complete replay for display
      updateParsingProgress(100, 'Parsing complete!');
      await loadReplayById(finalMeta.uuid);

      statusMsg.value = `解析完成：${file.name}`;
    } catch (e: any) {
      error.value = `解析失败: ${e.message || String(e)}`;
      (window as any).closeDemoParser(); // Cleanup on error
    } finally {
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
