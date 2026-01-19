import { onMounted, onUnmounted, ref } from 'vue';
import type { Frame, ReplayData, WorldBounds } from '@/types/replay';

interface UseReplayResult {
  loading: ReturnType<typeof ref<boolean>>;
  parsing: ReturnType<typeof ref<boolean>>;
  statusMsg: ReturnType<typeof ref<string>>;
  parsingSteps: ReturnType<typeof ref<Array<{step: string, completed: boolean, message?: string}>>>;
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
const STORE_NAME = 'replays';
const LATEST_KEY = 'latest_replay_id';

export function useReplayData(): UseReplayResult {
  const loading = ref(true);
  const parsing = ref(false);
  const statusMsg = ref('');
  const replayList = ref<ReplayData[]>([]);
  const parsingSteps = ref<Array<{step: string, completed: boolean, message?: string}>>([
    { step: '开始解析', completed: false },
    { step: '复制字节', completed: false },
    { step: '解析Demo', completed: false },
    { step: '生成JSON', completed: false },
    { step: '保存数据', completed: false },
  ]);

  // WASM 步骤映射
  const wasmStepMap: Record<string, number> = {
    '[1/5]': 0,
    '[2/5]': 1,
    '[3/5]': 2, // 以防万一有[3/5]
    '[4/5]': 3,
    '[5/5]': 4,
  };
  const error = ref<string | null>(null);
  const replay = ref<ReplayData | null>(null);
  const frames = ref<Frame[]>([]);
  const bounds = ref<WorldBounds | null>(null);

  const abortController = new AbortController();

  let db: IDBDatabase | null = null;

  const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };
      request.onupgradeneeded = (e: any) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };
    });
  };

  const saveReplayToDB = async (replayData: ReplayData) => {
    const database = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      
      // Save the replay data
      const request = store.put(replayData, replayData.id);
      
      // Also update latest ID
      localStorage.setItem(LATEST_KEY, replayData.id!);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  };

  const loadAllReplays = async () => {
    const database = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        replayList.value = (request.result as ReplayData[]).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  };

  const loadReplayFromDB = async (id?: string): Promise<ReplayData | null> => {
    const database = await initDB();
    const targetId = id || localStorage.getItem(LATEST_KEY);
    if (!targetId) return null;

    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(targetId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  const loadReplayById = async (id: string) => {
    try {
      loading.value = true;
      const data = await loadReplayFromDB(id);
      if (data) {
        setReplayData(JSON.stringify(data));
        localStorage.setItem(LATEST_KEY, id);
      }
    } catch (e) {
      console.error('Failed to load replay', e);
    } finally {
      loading.value = false;
    }
  };

  const deleteReplayById = async (id: string) => {
    const database = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = async () => {
        await loadAllReplays();
        if (localStorage.getItem(LATEST_KEY) === id) {
          localStorage.removeItem(LATEST_KEY);
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
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
      if (!frame.players || frame.players.length === 0) continue;
      for (const p of frame.players) {
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

  const setReplayData = (jsonStr: string) => {
    try {
      const data = JSON.parse(jsonStr) as ReplayData;
      replay.value = data;
      frames.value = data.frames ?? [];
      bounds.value = estimateBounds(frames.value);
    } catch (e) {
      console.error('Failed to parse replay JSON', e);
    }
  };

  const updateParsingStep = (index: number, message?: string) => {
    if (index >= 0 && index < parsingSteps.value.length) {
      parsingSteps.value[index].completed = true;
      if (message) {
        parsingSteps.value[index].message = message;
      }
      // 触发响应式更新
      parsingSteps.value = [...parsingSteps.value];
    }
  };

  const resetParsingSteps = () => {
    parsingSteps.value = [
      { step: '开始解析', completed: false },
      { step: '复制字节', completed: false },
      { step: '解析Demo', completed: false },
      { step: '生成JSON', completed: false },
      { step: '保存数据', completed: false },
    ];
  };

  const advanceParsingStep = (partialMessage: string, stepIndex: number, message?: string) => {
    if (stepIndex >= 0 && stepIndex < parsingSteps.value.length) {
      // 更新状态消息
      statusMsg.value = partialMessage;
      
      // 如果当前步骤还未完成，则更新它
      if (!parsingSteps.value[stepIndex].completed) {
        updateParsingStep(stepIndex, message || partialMessage);
      }
      
      // 如果是最后一步，也要标记为完成
      if (stepIndex === 4) {
        updateParsingStep(4, message || partialMessage);
      }
    }
  };

  const parseDemo = async (file: File) => {
    if (typeof (window as any).parseDemo !== 'function') {
      error.value = 'WASM 引擎尚未就绪，请稍后再试';
      return;
    }

    parsing.value = true;
    resetParsingSteps();
    statusMsg.value = `正在解析 ${file.name}...`;
    error.value = null;

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // 第一步：文件加载完成
      advanceParsingStep(`已加载文件: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`, 0, `已加载文件: ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB`);

      const jsonStr = await new Promise<string>((resolve, reject) => {
        (window as any).parseDemo(bytes, (res: string, err: string) => {
          if (err) reject(new Error(err));
          else resolve(res);
        }, (msg: string) => {
          statusMsg.value = msg;
          
          // 根据消息更新步骤状态
          let matched = false;
          for (const [key, stepIndex] of Object.entries(wasmStepMap)) {
            if (msg.includes(key)) {
              advanceParsingStep(msg, stepIndex, msg.replace(key, '').trim());
              matched = true;
              break;
            }
          }
          
          // 如果没有匹配到特定步骤，但仍需要显示解析进行中
          if (!matched && msg.includes('Parse error')) {
            error.value = '解析失败: ' + msg;
          }
        });
      });

      const replayData = JSON.parse(jsonStr) as ReplayData;
      replayData.id = `demo_${Date.now()}`;
      replayData.timestamp = Date.now();

      // 最后一步：保存数据
      await saveReplayToDB(replayData);
      setReplayData(JSON.stringify(replayData));
      await loadAllReplays();
      statusMsg.value = `解析完成：${file.name}`;
      advanceParsingStep(`已保存到本地数据库`, 4, `已保存到本地数据库`);
    } catch (e: any) {
      error.value = '解析失败: ' + (e.message || String(e));
    } finally {
      parsing.value = false;
    }
  };

  const load = async () => {
    try {
      loading.value = true;
      error.value = null;

      await loadAllReplays();

      // Try loading latest from IndexedDB first
      const stored = await loadReplayFromDB();
      if (stored) {
        setReplayData(JSON.stringify(stored));
        loading.value = false;
        return;
      }

      // Fallback to static JSON if available
      const response = await fetch('/JsonData/replay.json', {
        signal: abortController.signal,
      });
      if (response.ok) {
        const json = (await response.json()) as ReplayData;
        replay.value = json;
        frames.value = json.frames ?? [];
        bounds.value = estimateBounds(frames.value);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      console.warn('Initial load failed', e);
    } finally {
      loading.value = false;
    }
  };

  onMounted(load);

  onUnmounted(() => {
    abortController.abort();
  });

  return {
    loading,
    parsing,
    statusMsg,
    parsingSteps,
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
