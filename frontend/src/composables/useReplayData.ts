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
  parseDemo: (file: File) => Promise<void>;
  loadReplayById: (id: string) => Promise<void>;
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

    // Load all rounds for this UUID by filtering keys
    const rounds = await new Promise<ReplayRound[]>((resolve, reject) => {
      const tx = database.transaction(ROUND_STORE_NAME, 'readonly');
      const store = tx.objectStore(ROUND_STORE_NAME);
      const getAllRequest = store.getAll();
      const getAllKeysRequest = store.getAllKeys();
      
      let allData: any[] = [];
      let allKeys: IDBValidKey[] = [];
      
      getAllRequest.onsuccess = () => {
        allData = getAllRequest.result;
      };
      
      getAllKeysRequest.onsuccess = () => {
        allKeys = getAllKeysRequest.result;
        
        // Filter rounds that belong to this UUID
        const filteredRounds: ReplayRound[] = [];
        for (let i = 0; i < allKeys.length; i++) {
          const key = allKeys[i];
          if (typeof key === 'string' && key.startsWith(`${targetUuid}_`)) {
            filteredRounds.push(allData[i]);
          }
        }
        resolve(filteredRounds);
      };
      
      tx.onerror = () => reject(tx.error);
    });

    console.log('[IndexedDB] 加载到 meta 和 %d 个回合', rounds.length);

    // Combine all frames from rounds, ensuring proper sorting
    const allFrames = rounds
      .sort((a, b) => a.round - b.round)
      .flatMap(round => {
        // Sort frames within each round by timeMs to ensure correct order
        return round.frames.sort((a, b) => a.timeMs - b.timeMs);
      });

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
      frames: allFrames,
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

  const updateParsingProgress = (progress: number, status: string) => {
    parsingProgress.value = Math.min(100, Math.max(0, progress));
    parsingStatus.value = status;
    statusMsg.value = status;
  };

  const parseDemo = async (file: File) => {
    if (typeof (window as any).parseDemo !== 'function') {
      error.value = 'WASM 引擎尚未就绪，请稍后再试';
      return;
    }

    parsing.value = true;
    parsingProgress.value = 0;
    parsingStatus.value = 'Demo 上传中...';
    statusMsg.value = `正在解析 ${file.name}...`;
    error.value = null;

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // 第一步：文件加载完成
      updateParsingProgress(10, `Demo 上传中... (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);

      const jsonStr = await new Promise<string>((resolve, reject) => {
        (window as any).parseDemo(bytes, (res: string, err: string) => {
          if (err) reject(new Error(err));
          else resolve(res);
        }, (msg: string) => {
          // 从消息中提取进度信息
          // 检查是否包含解析进度信息，例如 "Parsed 1000 frames (tick: 5000)..."
          const frameMatch = msg.match(/Parsed (\d+) frames/);
          const roundsMatch = msg.match(/Parsed (\d+) rounds/);
          const totalFramesMatch = msg.match(/Parsed total (\d+) frames/);
                
          if (totalFramesMatch) {
            // 解析完成
            updateParsingProgress(80, `解析完成，共 ${totalFramesMatch[1]} 帧`);
          } else if (roundsMatch) {
            // 正在解析回合
            const roundCount = parseInt(roundsMatch[1]);
            // 假设每个回合约4%进度（从30%到75%）
            const progress = 30 + Math.min(45, roundCount * 4);
            updateParsingProgress(progress, `解析对局中（${roundCount} 回合）`);
          } else if (frameMatch) {
            // 正在解析帧
            const frameCount = parseInt(frameMatch[1]);
            // 假设每1000帧约1%进度（从20%到75%）
            const progress = 20 + Math.min(55, Math.floor(frameCount / 1000));
            updateParsingProgress(progress, `解析对局中（${frameCount} 帧）`);
          } else if (msg.includes('[1/5]') || msg.includes('Creating demo parser')) {
            updateParsingProgress(15, '初始化解析器...');
          } else if (msg.includes('[2/5]')) {
            updateParsingProgress(20, '准备解析数据...');
          } else if (msg.includes('Parsing frames')) {
            updateParsingProgress(25, '开始解析对局...');
          }
                
          statusMsg.value = msg;
        });
      });

      console.log('[ParseDemo] WASM解析完成，JSON字符串大小:', (jsonStr.length / 1024 / 1024).toFixed(2), 'MB');
      
      updateParsingProgress(85, '处理解析结果...');
      
      console.time('[ParseDemo] JSON.parse 耗时');
      const parsedData = JSON.parse(jsonStr) as ParsedReplayData;
      console.timeEnd('[ParseDemo] JSON.parse 耗时');
      
      console.log('[ParseDemo] 解析得到 meta 和 %d 个回合', parsedData.rounds.length);
      
      updateParsingProgress(90, '保存解析结果...');
      
      // 最后一步：保存数据（分离存储 meta 和 rounds）
      await saveReplayToDB(parsedData.meta, parsedData.rounds);
      console.log('[ParseDemo] 数据已保存到IndexedDB，准备设置到状态');
      
      updateParsingProgress(100, `解析完成：${file.name}`);
      statusMsg.value = `解析完成：${file.name}`;
      
      // 延迟一小段时间让用户看到完成状态，然后再设置数据和关闭弹窗
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 合并所有回合的帧数据设置到状态
      const allFrames = parsedData.rounds
        .sort((a, b) => a.round - b.round)
        .flatMap(round => {
          // Sort frames within each round by timeMs to ensure correct order
          return round.frames.sort((a, b) => a.timeMs - b.timeMs);
        });
      
      const replayData: ReplayData = {
        uuid: parsedData.meta.uuid,
        id: parsedData.meta.uuid,
        uploaderUid: parsedData.meta.uploaderUid,
        uploadTime: parsedData.meta.uploadTime,
        mapName: parsedData.meta.mapName,
        teamCT: parsedData.meta.teamCT,
        teamT: parsedData.meta.teamT,
        scoreCT: parsedData.meta.scoreCT,
        scoreT: parsedData.meta.scoreT,
        totalRounds: parsedData.meta.totalRounds,
        totalFrames: parsedData.meta.totalFrames || 0,
        totalDurationMs: parsedData.meta.totalDurationMs || 0,
        frames: allFrames,
        projectileRenderConfig: parsedData.meta.projectileRenderConfig,
        timestamp: parsedData.meta.uploadTime, // Map to uploadTime for backward compatibility
      };
      
      console.time('[ParseDemo] setReplayData 执行时间');
      setReplayData(replayData);
      console.timeEnd('[ParseDemo] setReplayData 执行时间');
      console.log('[ParseDemo] 数据已设置到响应式状态');
      
      await loadAllReplays();
      console.log('[ParseDemo] 回放列表已更新');
    } catch (e: any) {
      error.value = '解析失败: ' + (e.message || String(e));
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
    parseDemo,
    loadReplayById,
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
