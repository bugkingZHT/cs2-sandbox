import { ref, computed, type Ref, type ComputedRef } from 'vue';
import type { Frame, ProjectileState, PlayerState } from '@/types/replay';
import { isButtonPressed, BUTTON_MASKS } from '@/config/buttons';

/**
 * 分析时间范围（毫秒）
 * 投掷前 1 秒、投掷后 1 秒
 */
const PRE_THROW_MS = 1000;
const POST_THROW_MS = 1000;

/** 投掷帧搜索缓存 */
const throwFrameCache = new Map<number, number>();

/** 投掷方式分类 */
export type ThrowType = '跳投' | '蹲投' | '跳蹲投' | '走投' | '站投';

export function useGrenadeAnalyzer(
  frames: Ref<Frame[] | undefined>,
  replayMeta: Ref<any>
) {
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

  /** 当前分析帧索引（基于 localPlaybackTimeMs） */
  const currentAnalyzeFrameIndex = computed(() => {
    if (!isAnalyzeMode.value || !frames.value) return -1;

    const targetTimeMs = analyzeTimeRange.value.startMs + localPlaybackTimeMs.value;
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

  /** 投掷者信息 */
  const throwerInfo = computed((): PlayerState | null => {
    if (!selectedProjectile.value || !replayMeta.value?.serverPlayer) return null;
    const throwerId = selectedProjectile.value.throwerID;
    const playerInfo = replayMeta.value.serverPlayer.find(
      (p: any) => p.id === throwerId
    );
    if (!playerInfo) return null;
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

  /** 投掷时刻的人物位置/角度（用于复制到 CS2 控制台） */
  const throwMomentPosition = computed(() => {
    if (!isAnalyzeMode.value || !frames.value || throwFrameIndex.value < 0 || !selectedProjectile.value) return null;
    const throwerId = selectedProjectile.value.throwerID;
    const frame = frames.value[throwFrameIndex.value];
    const player = frame?.players?.[throwerId];
    if (!player) return null;
    return {
      x: player.x,
      y: player.y,
      z: player.z ?? 0,
      yaw: player.yaw,
      pitch: player.pitch ?? 0,
    };
  });

  /** 当前帧的投掷者按键 */
  const currentButtons = computed((): number[] => {
    const frame = frames.value?.[currentAnalyzeFrameIndex.value];
    if (!frame || !selectedProjectile.value) return [];
    const throwerId = selectedProjectile.value.throwerID;
    const player = frame.players?.[throwerId];
    return player?.buttons ?? [];
  });

  /** 按键状态解析 */
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
      speed: isButtonPressed(buttons, BUTTON_MASKS.SPEED),
    };
  });

  /**
   * 自动识别投掷方式
   * 扫描投掷前 0.5 秒帧数据判断 jump/duck，全范围判断移动
   */
  const throwType = computed((): ThrowType => {
    if (!isAnalyzeMode.value || !frames.value || throwFrameIndex.value < 0) return '站投';

    const framesArr = frames.value;
    const throwerId = selectedProjectile.value?.throwerID;
    if (throwerId === undefined || throwerId === null) return '站投';

    const throwTimeMs = framesArr[throwFrameIndex.value].timeMs;
    let hasJump = false;
    let hasDuck = false;
    let hasMovement = false;

    // 从 startFrame 到 throwFrame 扫描
    const startFrame = analyzeTimeRange.value.startFrame;
    for (let i = startFrame; i <= throwFrameIndex.value; i++) {
      const player = framesArr[i].players?.[throwerId];
      const buttons = player?.buttons ?? [];
      const relTime = framesArr[i].timeMs - throwTimeMs;

      if (relTime >= -500) {
        if (isButtonPressed(buttons, BUTTON_MASKS.JUMP)) hasJump = true;
        if (isButtonPressed(buttons, BUTTON_MASKS.DUCK)) hasDuck = true;
      }
      if (isButtonPressed(buttons, BUTTON_MASKS.FORWARD) ||
          isButtonPressed(buttons, BUTTON_MASKS.BACK) ||
          isButtonPressed(buttons, BUTTON_MASKS.MOVE_LEFT) ||
          isButtonPressed(buttons, BUTTON_MASKS.MOVE_RIGHT)) {
        hasMovement = true;
      }
    }

    if (hasJump && hasDuck) return '跳蹲投';
    if (hasJump) return '跳投';
    if (hasDuck) return '蹲投';
    if (hasMovement) return '走投';
    return '站投';
  });

  // === 工具方法 ===

  function findThrowFrame(entityId: number): number {
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

  // === 操作方法 ===

  function toggleTracking() {
    isTrackingEnabled.value = !isTrackingEnabled.value;
    if (!isTrackingEnabled.value && isAnalyzeMode.value) {
      exitAnalyze();
    }
  }

  function activateAnalyze(proj: ProjectileState) {
    selectedProjectile.value = proj;

    const frameIdx = findThrowFrame(proj.entityID);
    if (frameIdx === -1) {
      console.warn('[GrenadeAnalyzer] 未找到投掷物出手帧:', proj.entityID);
      return;
    }

    throwFrameIndex.value = frameIdx;

    const framesArr = frames.value;
    if (!framesArr) return;

    const throwTimeMs = framesArr[frameIdx].timeMs;
    const startMs = Math.max(0, throwTimeMs - PRE_THROW_MS);
    const endMs = Math.min(
      framesArr[framesArr.length - 1].timeMs,
      throwTimeMs + POST_THROW_MS
    );

    analyzeTimeRange.value = {
      startMs,
      endMs,
      startFrame: findFrameByTime(startMs),
      endFrame: findFrameByTime(endMs),
    };

    // 初始定位到投掷前 0.5 秒
    localPlaybackTimeMs.value = Math.max(0, throwTimeMs - 500 - startMs);
    isAnalyzeMode.value = true;
  }

  function exitAnalyze() {
    isAnalyzeMode.value = false;
    selectedProjectile.value = null;
    throwFrameIndex.value = -1;
    localPlaybackTimeMs.value = 0;
  }

  function setLocalPlaybackTime(timeMs: number) {
    const range = analyzeTimeRange.value;
    const maxTime = range.endMs - range.startMs;
    localPlaybackTimeMs.value = Math.max(0, Math.min(maxTime, timeMs));
  }

  function clearCache() {
    throwFrameCache.clear();
  }

  return {
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
    throwType,
    throwMomentPosition,
    toggleTracking,
    activateAnalyze,
    exitAnalyze,
    setLocalPlaybackTime,
    clearCache,
  };
}
