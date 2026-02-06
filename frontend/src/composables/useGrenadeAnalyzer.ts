import { ref, computed, type Ref, type ComputedRef } from 'vue';
import type { Frame, ProjectileState, PlayerState } from '@/types/replay';
import { isButtonPressed, BUTTON_MASKS } from '@/config/buttons';

/**
 * 投掷物分析模式的时间范围（毫秒）
 * 投掷时刻前后各 3 秒
 */
const ANALYZE_TIME_RANGE_MS = 3000;

/**
 * 投掷帧搜索缓存，避免重复遍历
 */
const throwFrameCache = new Map<number, number>();

export interface GrenadeAnalyzerState {
  // 功能总开关
  isTrackingEnabled: Ref<boolean>;
  // 分析模式是否激活
  isAnalyzeMode: Ref<boolean>;
  // 当前选中的投掷物
  selectedProjectile: Ref<ProjectileState | null>;
  // 投掷物出手帧索引
  throwFrameIndex: Ref<number>;
  // 分析时间范围
  analyzeTimeRange: Ref<{ startMs: number; endMs: number; startFrame: number; endFrame: number }>;
  // 当前分析播放时间（相对于 startMs）
  localPlaybackTimeMs: Ref<number>;
  // 当前分析帧索引
  currentAnalyzeFrameIndex: ComputedRef<number>;
  // 投掷者信息
  throwerInfo: ComputedRef<PlayerState | null>;
  // 当前帧的投掷者按键状态
  currentButtons: ComputedRef<number[]>;
  // 按键状态解析
  buttonStates: ComputedRef<{
    forward: boolean;
    back: boolean;
    left: boolean;
    right: boolean;
    attack: boolean;
    attack2: boolean;
    jump: boolean;
    duck: boolean;
  }>;
}

export interface GrenadeAnalyzerActions {
  // 切换追踪功能开关
  toggleTracking: () => void;
  // 激活分析模式
  activateAnalyze: (proj: ProjectileState) => void;
  // 退出分析模式
  exitAnalyze: () => void;
  // 设置分析播放时间
  setLocalPlaybackTime: (timeMs: number) => void;
  // 清除缓存
  clearCache: () => void;
}

/**
 * 投掷物操作分析 Composable
 * 提供投掷物追踪、分析模式和按键状态可视化功能
 */
export function useGrenadeAnalyzer(
  frames: Ref<Frame[] | undefined>,
  replayMeta: Ref<any>
): GrenadeAnalyzerState & GrenadeAnalyzerActions {
  // === 状态 ===
  const isTrackingEnabled = ref(false);
  const isAnalyzeMode = ref(false);
  const selectedProjectile = ref<ProjectileState | null>(null);
  const throwFrameIndex = ref(-1);
  const analyzeTimeRange = ref({
    startMs: 0,
    endMs: 0,
    startFrame: 0,
    endFrame: 0,
  });
  const localPlaybackTimeMs = ref(0);

  // === 计算属性 ===

  /**
   * 当前分析帧索引（基于 localPlaybackTimeMs）
   */
  const currentAnalyzeFrameIndex = computed(() => {
    if (!isAnalyzeMode.value || !frames.value) return -1;
    
    const targetTimeMs = analyzeTimeRange.value.startMs + localPlaybackTimeMs.value;
    
    // 二分搜索找到对应帧
    const framesArr = frames.value;
    let low = analyzeTimeRange.value.startFrame;
    let high = analyzeTimeRange.value.endFrame;
    let result = low;
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (framesArr[mid].timeMs <= targetTimeMs) {
        result = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    
    return result;
  });

  /**
   * 投掷者信息
   */
  const throwerInfo = computed((): PlayerState | null => {
    if (!selectedProjectile.value || !replayMeta.value?.serverPlayer) return null;
    
    const throwerId = selectedProjectile.value.throwerID;
    const playerInfo = replayMeta.value.serverPlayer.find(
      (p: any) => p.id === throwerId
    );
    
    if (!playerInfo) return null;
    
    // 从当前分析帧获取玩家状态
    const frame = frames.value?.[currentAnalyzeFrameIndex.value];
    const framePlayer = frame?.players?.[throwerId];
    
    if (!framePlayer) return null;
    
    return {
      ...framePlayer,
      id: playerInfo.id,
      name: playerInfo.name,
      team: playerInfo.team,
      steamID: playerInfo.steamID,
      isBot: playerInfo.isBot,
    };
  });

  /**
   * 当前帧的投掷者按键状态
   */
  const currentButtons = computed((): number[] => {
    const frame = frames.value?.[currentAnalyzeFrameIndex.value];
    if (!frame || !selectedProjectile.value) return [];
    
    const throwerId = selectedProjectile.value.throwerID;
    const player = frame.players?.[throwerId];
    
    return player?.buttons ?? [];
  });

  /**
   * 按键状态解析（用于 UI 显示）
   */
  const buttonStates = computed(() => {
    const buttons = currentButtons.value;
    return {
      forward: isButtonPressed(buttons, BUTTON_MASKS.FORWARD),
      back: isButtonPressed(buttons, BUTTON_MASKS.BACK),
      left: isButtonPressed(buttons, BUTTON_MASKS.MOVE_LEFT),
      right: isButtonPressed(buttons, BUTTON_MASKS.MOVE_RIGHT),
      attack: isButtonPressed(buttons, BUTTON_MASKS.ATTACK),
      attack2: isButtonPressed(buttons, BUTTON_MASKS.ATTACK2),
      jump: isButtonPressed(buttons, BUTTON_MASKS.JUMP),
      duck: isButtonPressed(buttons, BUTTON_MASKS.DUCK),
    };
  });

  // === 方法 ===

  /**
   * 查找投掷物首次出现的帧索引
   * 使用缓存优化重复查询
   */
  function findThrowFrame(entityId: number): number {
    // 检查缓存
    if (throwFrameCache.has(entityId)) {
      return throwFrameCache.get(entityId)!;
    }
    
    const framesArr = frames.value;
    if (!framesArr) return -1;
    
    for (let i = 0; i < framesArr.length; i++) {
      if (framesArr[i].projectiles?.[entityId]) {
        throwFrameCache.set(entityId, i);
        return i;
      }
    }
    
    return -1;
  }

  /**
   * 根据时间查找帧索引（二分搜索）
   */
  function findFrameByTime(targetTimeMs: number): number {
    const framesArr = frames.value;
    if (!framesArr || framesArr.length === 0) return 0;
    
    let low = 0;
    let high = framesArr.length - 1;
    let result = 0;
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (framesArr[mid].timeMs <= targetTimeMs) {
        result = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    
    return result;
  }

  /**
   * 切换追踪功能开关
   */
  function toggleTracking() {
    isTrackingEnabled.value = !isTrackingEnabled.value;
    
    // 关闭追踪时，同时退出分析模式
    if (!isTrackingEnabled.value && isAnalyzeMode.value) {
      exitAnalyze();
    }
  }

  /**
   * 激活分析模式
   */
  function activateAnalyze(proj: ProjectileState) {
    if (!isTrackingEnabled.value) return;
    
    selectedProjectile.value = proj;
    
    // 查找投掷帧
    const frameIdx = findThrowFrame(proj.entityID);
    if (frameIdx === -1) {
      console.warn('[GrenadeAnalyzer] 未找到投掷物出手帧:', proj.entityID);
      return;
    }
    
    throwFrameIndex.value = frameIdx;
    
    // 计算时间范围
    const framesArr = frames.value;
    if (!framesArr) return;
    
    const throwTimeMs = framesArr[frameIdx].timeMs;
    const startMs = Math.max(0, throwTimeMs - ANALYZE_TIME_RANGE_MS);
    const endMs = Math.min(
      framesArr[framesArr.length - 1].timeMs,
      throwTimeMs + ANALYZE_TIME_RANGE_MS
    );
    
    analyzeTimeRange.value = {
      startMs,
      endMs,
      startFrame: findFrameByTime(startMs),
      endFrame: findFrameByTime(endMs),
    };
    
    // 初始时间设置为投掷时刻
    localPlaybackTimeMs.value = throwTimeMs - startMs;
    
    isAnalyzeMode.value = true;
    
    console.log('[GrenadeAnalyzer] 激活分析模式:', {
      entityId: proj.entityID,
      throwFrameIndex: frameIdx,
      throwTimeMs,
      timeRange: analyzeTimeRange.value,
    });
  }

  /**
   * 退出分析模式
   */
  function exitAnalyze() {
    isAnalyzeMode.value = false;
    selectedProjectile.value = null;
    throwFrameIndex.value = -1;
    localPlaybackTimeMs.value = 0;
  }

  /**
   * 设置分析播放时间
   */
  function setLocalPlaybackTime(timeMs: number) {
    const range = analyzeTimeRange.value;
    const maxTime = range.endMs - range.startMs;
    localPlaybackTimeMs.value = Math.max(0, Math.min(maxTime, timeMs));
  }

  /**
   * 清除缓存
   */
  function clearCache() {
    throwFrameCache.clear();
  }

  return {
    // 状态
    isTrackingEnabled,
    isAnalyzeMode,
    selectedProjectile,
    throwFrameIndex,
    analyzeTimeRange,
    localPlaybackTimeMs,
    currentAnalyzeFrameIndex,
    throwerInfo,
    currentButtons,
    buttonStates,
    // 方法
    toggleTracking,
    activateAnalyze,
    exitAnalyze,
    setLocalPlaybackTime,
    clearCache,
  };
}
