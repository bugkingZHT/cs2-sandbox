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
    console.log('[LoadAllReplays] 开始加载所有回放数据');
    const database = await initDB();
    return new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        console.log('[LoadAllReplays] 获取到所有回放数据，数量:', request.result.length);
        replayList.value = (request.result as ReplayData[]).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        console.log('[LoadAllReplays] 排序后的回放列表，数量:', replayList.value.length);
        resolve();
      };
      request.onerror = () => {
        console.error('[LoadAllReplays] 加载所有回放数据失败:', request.error);
        reject(request.error);
      };
    });
  };

  const loadReplayFromDB = async (id?: string): Promise<ReplayData | null> => {
    console.log('[IndexedDB] 开始从数据库加载回放数据...', { id, storedId: localStorage.getItem(LATEST_KEY) });
    const database = await initDB();
    const targetId = id || localStorage.getItem(LATEST_KEY);
    console.log('[IndexedDB] 目标ID:', targetId);
    if (!targetId) {
      console.log('[IndexedDB] 没有找到目标ID，返回null');
      return null;
    }

    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(targetId);
      request.onsuccess = () => {
        console.log('[IndexedDB] 成功获取回放数据:', request.result ? '存在数据' : '未找到数据', { id: request.result?.id, frameCount: request.result?.frames?.length });
        resolve(request.result);
      };
      request.onerror = () => {
        console.error('[IndexedDB] 加载回放数据失败:', request.error);
        reject(request.error);
      };
    });
  };

  const loadReplayById = async (id: string) => {
    console.log('[LoadReplayById] 开始加载回放，ID:', id);
    try {
      loading.value = true;
      const data = await loadReplayFromDB(id);
      console.log('[LoadReplayById] 从数据库获取的数据:', data ? '存在数据' : '未找到数据', { frameCount: data?.frames?.length });
      if (data) {
        console.log('[LoadReplayById] 准备设置回放数据，帧数量:', data.frames?.length);
        setReplayData(JSON.stringify(data));
        localStorage.setItem(LATEST_KEY, id);
        console.log('[LoadReplayById] 回放数据设置完成，已更新最新ID');
      } else {
        console.warn('[LoadReplayById] 未找到ID为', id, '的回放数据');
      }
    } catch (e) {
      console.error('Failed to load replay', e);
    } finally {
      loading.value = false;
      console.log('[LoadReplayById] 加载完成，loading设置为false');
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
    console.log('[SetReplayData] 开始设置回放数据，JSON字符串长度:', jsonStr.length);
    try {
      const data = JSON.parse(jsonStr) as ReplayData;
      console.log('[SetReplayData] 解析后的数据:', { id: data.id, mapName: data.mapName, frameCount: data.frames?.length, teamCT: data.teamCT, teamT: data.teamT });
      replay.value = data;
      frames.value = data.frames ?? [];
      console.log('[SetReplayData] 设置frames完成，帧数:', frames.value.length);
      bounds.value = estimateBounds(frames.value);
      console.log('[SetReplayData] 估算边界完成:', bounds.value);
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
    console.log('[Load] 开始初始化加载数据');
    try {
      loading.value = true;
      error.value = null;

      await loadAllReplays();
      console.log('[Load] 已加载所有回放列表，数量:', replayList.value.length);

      // Try loading latest from IndexedDB first
      console.log('[Load] 尝试从IndexedDB加载最新的回放数据');
      const stored = await loadReplayFromDB();
      if (stored) {
        console.log('[Load] 从IndexedDB获取到数据，准备设置');
        setReplayData(JSON.stringify(stored));
        console.log('[Load] 从IndexedDB加载完成');
        loading.value = false;
        return;
      }
      console.log('[Load] 未从IndexedDB获取到数据，尝试加载默认数据');

      // Fallback to static JSON if available
      const response = await fetch('/JsonData/replay.json', {
        signal: abortController.signal,
      });
      if (response.ok) {
        console.log('[Load] 从静态JSON文件加载数据');
        const json = (await response.json()) as ReplayData;
        replay.value = json;
        frames.value = json.frames ?? [];
        bounds.value = estimateBounds(frames.value);
        console.log('[Load] 从静态JSON加载完成');
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      console.warn('Initial load failed', e);
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
