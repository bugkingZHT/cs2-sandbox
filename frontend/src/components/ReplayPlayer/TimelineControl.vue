<template>
  <div class="timeline-widget-container">
    <!-- 一、上方：回合选择进度条 -->
    <div v-if="!pureMode" class="round-selection-module">
      <!-- 核心进度条主体 -->
      <div class="round-nav-wrapper">
        <div class="round-buttons-grid">
          <template v-for="r in totalRoundsCount" :key="r">
            <div class="round-btn-cell" :class="{ 'active': currentRound === r, 'disabled': cloudReplay && r !== currentRound }">
              <button class="round-square-btn" :disabled="cloudReplay && r !== currentRound" @click="seekToRound(r)" :class="getFlexDirectionClass(r)">
                <!-- Icon on top or bottom based on logic -->
                <img 
                  v-if="getRoundResultIcon(r) && shouldIconBeFirst(r)" 
                  :src="getRoundResultIcon(r)!" 
                  class="round-result-icon" 
                  :alt="getRoundResult(r) || ''"
                />
                <span class="round-number">{{ r }}</span>
                <img 
                  v-if="getRoundResultIcon(r) && !shouldIconBeFirst(r)" 
                  :src="getRoundResultIcon(r)!" 
                  class="round-result-icon" 
                  :alt="getRoundResult(r) || ''"
                />
              </button>
              <div class="round-underline-static"></div>
            </div>
            <!-- 12和13号之间的纵向虚线 -->
            <div v-if="r === 12" class="v-dashed-divider"></div>
          </template>
        </div>
      </div>
    </div>

    <!-- 二、下方：时间轴进度条 -->
    <div class="playback-control-module">
      <!-- 左侧控制区：播放按钮 + 倍速 -->
      <div class="playback-info-box">
        <div class="controls-stack">
          <button
            class="circle-play-btn"
            :disabled="!canPlay"
            @click="$emit('toggle-play')"
          >
            <svg v-if="isPlaying" class="play-icon-svg" viewBox="0 0 24 24" fill="white">
              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
            </svg>
            <svg v-else class="play-icon-svg" viewBox="0 0 24 24" fill="white">
              <path d="M8 5V19L19 12L8 5Z"/>
            </svg>
          </button>
        </div>
        <div class="speed-tabs">
          <button
            v-for="s in speedOptions"
            :key="s"
            class="speed-tab-btn"
            :class="{ active: playbackSpeed === s }"
            @click="emit('update-speed', s)"
          >
            {{ s }}x
          </button>
        </div>
      </div>

      <!-- 中间时间轴主体 -->
      <div class="timeline-track-main" @mousedown="onTimelineMouseDown">
        <!-- 进度填充（平面化） -->
        <div class="flat-progress-fill" :style="{ width: `${(roundRelativeTimeMs / roundDurationMs) * 100}%` }"></div>

        <!-- 动态视觉标记 -->
        <div class="decorative-markers">
          <!-- 1. 击杀事件 (竖线) -->
          <template v-for="m in killMarkers" :key="`kill-${m.victimId}`">
            <div 
              class="kill-marker" 
              :class="{ 'ct': m.team === 3, 't': m.team === 2 }"
              :style="{ left: `${m.offset}%` }"
              :title="m.team === 3 ? 'CT Kill' : 'T Kill'"
            ></div>
          </template>

          <!-- 2. 道具投掷 (下沿三角) -->
          <template v-for="m in throwMarkers" :key="`throw-${m.id}`">
            <div 
              class="throw-marker" 
              :class="{ 'ct': m.team === 3, 't': m.team === 2 }"
              :style="{ left: `${m.offset}%` }"
              :title="`${m.team === 3 ? 'CT' : 'T'} Throw`"
            ></div>
          </template>
          
          <!-- 3. 炸弹/回合事件标记 -->
          <template v-for="(bm, idx) in bombEventMarkers" :key="`bomb-${idx}`">
            <!-- 下包完成线 -->
            <div 
              v-if="bm.event === 'planted'"
              class="bomb-planted-marker" 
              :style="{ left: `${bm.offset}%` }"
              title="Bomb Planted"
            >
              <div class="bomb-line"></div>
              <div class="bomb-icon-wrapper">
                <img src="/utility/c4.svg" class="bomb-svg-img" alt="C4" />
              </div>
            </div>
            
            <!-- 回合结束标记 -->
            <div 
              v-else-if="bm.event === 'roundend' && bm.result"
              class="round-end-marker"
              :class="getRoundEndClass(bm.result)"
              :style="{ left: `${bm.offset}%` }"
              :title="getRoundEndTitle(bm.result)"
            >
              <div class="round-end-line"></div>
              <div class="round-end-icon-wrapper">
                <img :src="getRoundEndIcon(bm.result)" class="round-end-icon" :alt="bm.result" />
              </div>
            </div>
            
            <!-- 其他事件 (爆炸或无结果) -->
            <div 
              v-else
              class="bomb-event-mark" 
              :class="{ 
                'bomb-exploded': bm.event === 'exploded',
                'round-end': bm.event === 'roundend'
              }"
              :style="{ left: `${bm.offset}%` }"
              :title="bm.event === 'exploded' ? 'Bomb Exploded' : 'Round End'"
            ></div>
          </template>
        </div>
      </div>

      <!-- 右侧时间显示 -->
      <div class="time-display-box">
        <div class="time-display">
          <!-- Show C4 icon when bomb is planted -->
          <img 
            v-if="currentRoundTime.phase === 'planted'" 
            src="/utility/c4.svg" 
            class="icon-c4" 
            alt="C4"
          />
          <!-- Show clock icon for other phases -->
          <svg 
            v-else
            class="icon-stopwatch" 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="none" 
            :stroke="roundTimeColor" 
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10"/><path d="M12 6V12L16 14"/>
          </svg>
          <span class="time-font" :style="{ color: roundTimeColor }">{{ formatRoundTime }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { EQUIPMENT_ID_MAP } from '@/config/equipment';
import { MATCH_CONFIG, getDisplayTeam } from '@/config/game';
import { DEBUG_CONFIG } from '@/config/debug';
import type { RoundResultInfo, ReplayData } from '@/types/replay';
import { showFrameData } from '@/composables/frameDataViewer';

const props = defineProps<{
  currentFrameIndex: number;
  totalFrames: number;
  isPlaying: boolean;
  currentTimeMs: number;
  totalTimeMs: number;
  playbackSpeed: number;
  frames: any[];
  roundFrames: any[];
  roundStartTimeMs: number;
  roundDurationMs: number;
  scoreCT: number;
  scoreT: number;
  replayUuid?: string;
  totalRounds?: number;
  roundResults?: RoundResultInfo[];
  replayMeta?: ReplayData | null;
  pureMode?: boolean;
  /** 云回放仅单回合，其他回合按钮禁用并置灰 */
  cloudReplay?: boolean;
  /** 是否允许播放（有帧数据时 true，避免刷新后未同步状态时点击无效） */
  canPlay?: boolean;
}>();

const canPlay = computed(() => props.canPlay ?? true);

const emit = defineEmits<{
  (e: 'seek-seconds', value: number): void;
  (e: 'toggle-play'): void;
  (e: 'update-speed', value: number): void;
  (e: 'exit-replay'): void;
  (e: 'dragging-change', value: boolean): void;
  (e: 'load-round', roundNumber: number): void;
}>();

// Log roundResults when they change
watch(() => props.roundResults, (newResults) => {
  console.log('[TimelineControl] roundResults updated:', {
    hasResults: !!newResults,
    length: newResults?.length || 0,
    results: newResults
  });
}, { immediate: true });

const isDragging = ref(false);

// Listen for debug event from App.vue
const handleDebugFrameDataEvent = () => {
  showCurrentFrameData();
};

onMounted(() => {
  window.addEventListener('debug:show-frame-data', handleDebugFrameDataEvent);
});

onUnmounted(() => {
  window.removeEventListener('debug:show-frame-data', handleDebugFrameDataEvent);
});

// Debug: show current frame data
const showCurrentFrameData = () => {
  if (!DEBUG_CONFIG.enableFrameDataViewer) return;
  
  const currentFrame = props.frames[props.currentFrameIndex];
  showFrameData(currentFrame, props.currentFrameIndex, props.replayMeta);
};

// 计算当前回合相对于该局开始的时间
const roundRelativeTimeMs = computed(() => {
  return Math.max(0, props.currentTimeMs - props.roundStartTimeMs);
});

// 获取当前帧的回合时间信息
const currentRoundTime = computed(() => {
  if (!props.frames || props.frames.length === 0 || props.currentFrameIndex >= props.frames.length) {
    return { phase: 'normal', timeRemaining: 0 };
  }
  const frame = props.frames[props.currentFrameIndex];
  return frame?.roundTime || { phase: 'normal', timeRemaining: 0 };
});

// 根据 phase 计算颜色
const roundTimeColor = computed(() => {
  const phase = currentRoundTime.value.phase;
  switch (phase) {
    case 'freezetime':
      return '#4dabf7'; // 蓝色 - 冻结时间
    case 'normal':
      return '#ffffff'; // 白色 - 正常时间
    case 'planted':
      return '#ff6b6b'; // 红色 - C4 已安放
    case 'end':
      return '#868e96'; // 灰色 - 回合结束
    default:
      return '#ffffff';
  }
});

// 格式化回合时间显示
const formatRoundTime = computed(() => {
  const timeRemaining = currentRoundTime.value.timeRemaining;
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = Math.floor(timeRemaining % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// 计算道具投掷标记
const throwMarkers = computed(() => {
  if (!props.roundFrames || props.roundDurationMs === 0) return [];
  const markers: { offset: number; type: string; id: number; team: number }[] = [];
  const seenIds = new Set<number>();

  props.roundFrames.forEach(f => {
    if (f.projectiles && Object.keys(f.projectiles).length > 0) {
      Object.values(f.projectiles).forEach((p: any) => {
        if (!seenIds.has(p.entityID)) {
          seenIds.add(p.entityID);
          const relTime = f.timeMs - props.roundStartTimeMs;
          
          // Use serverPlayer metadata to get thrower's team
          let team = 0;
          if (p.throwerID && props.replayMeta?.serverPlayer) {
            const throwerInfo = props.replayMeta.serverPlayer.find(player => player.id === p.throwerID);
            if (throwerInfo) {
              // Get display team (flipped in second half)
              team = getDisplayTeam(throwerInfo.team, f.round);
            }
          }

          markers.push({
            offset: (relTime / props.roundDurationMs) * 100,
            type: p.type,
            id: p.entityID,
            team: team
          });
        }
      });
    }
  });
  return markers;
});

// 计算击杀标记
const killMarkers = computed(() => {
  if (!props.roundFrames || props.roundDurationMs === 0) return [];
  const markers: { offset: number; team: number; victimId: number }[] = [];
  const seenVictims = new Set<number>();

  props.roundFrames.forEach(f => {
    if (f.killEvents && Object.keys(f.killEvents).length > 0) {
      Object.entries(f.killEvents).forEach(([victimIdStr, kill]: [string, any]) => {
        const victimId = parseInt(victimIdStr);
        if (!seenVictims.has(victimId)) {
          seenVictims.add(victimId);
          const relTime = f.timeMs - props.roundStartTimeMs;
          
          let killerTeam = 0;
          if (kill.killerId !== 0 && props.replayMeta?.serverPlayer) {
            // Use serverPlayer metadata to get killer's team
            const killerInfo = props.replayMeta.serverPlayer.find(p => p.id === kill.killerId);
            if (killerInfo) {
              // Get display team (flipped in second half)
              killerTeam = getDisplayTeam(killerInfo.team, f.round);
            }
          }

          markers.push({
            offset: (relTime / props.roundDurationMs) * 100,
            team: killerTeam,
            victimId: victimId
          });
        }
      });
    }
  });
  return markers;
});

// 计算炸弹事件标记（安放和爆炸）
const bombEventMarkers = computed(() => {
  if (!props.roundFrames || props.roundDurationMs === 0) return [];
  const markers: { offset: number; event: 'planted' | 'exploded' | 'roundend'; result?: string }[] = [];
  
  let bombPlantedFound = false;
  let bombExplodedFound = false;
  let roundEndFound = false;
  
  props.roundFrames.forEach(f => {
    const relTime = f.timeMs - props.roundStartTimeMs;
    const offset = (relTime / props.roundDurationMs) * 100;
    
    if (f.bomb) {
      // 检测炸弹安放时刻（状态从非 planted 变为 planted）
      if (!bombPlantedFound && f.bomb.state === 'planted') {
        bombPlantedFound = true;
        markers.push({ offset, event: 'planted' });
      }
      
      // 检测炸弹爆炸时刻（状态变为 exploded）
      if (!bombExplodedFound && f.bomb.state === 'exploded') {
        bombExplodedFound = true;
        markers.push({ offset, event: 'exploded' });
      }
    }
    
    // 检测回合结束时刻（roundTime.phase 变为 'end'）
    if (!roundEndFound && f.roundTime && f.roundTime.phase === 'end') {
      roundEndFound = true;
      // Get round result from roundResults
      const roundNumber = currentRound.value;
      const roundResult = getRoundResult(roundNumber);
      markers.push({ offset, event: 'roundend', result: roundResult || undefined });
    }
  });
  
  return markers;
});

// 计算总回合数
const totalRoundsCount = computed(() => {
  const sum = props.scoreCT + props.scoreT;
  // 如果分数为0，至少显示原本存在的帧中的最大回合数
  if (sum === 0 && props.frames && props.frames.length > 0) {
    return Math.max(...props.frames.map(f => f.round), 0);
  }
  return sum || 1; // 至少显示1个
});

// 计算当前回合
const currentRound = computed(() => {
  if (!props.frames || props.frames.length === 0 || props.currentFrameIndex >= props.frames.length) return 0;
  return props.frames[props.currentFrameIndex]?.round || 0;
});

// 计算回合标记用于跳转 - 基于分片的round索引
const roundMarkers = computed(() => {
  if (!props.replayUuid || !props.totalRounds) return [];
  const markers: { round: number; uuid: string }[] = [];
  // 根据总回合数生成标记
  for (let r = 1; r <= props.totalRounds; r++) {
    markers.push({ 
      round: r, 
      uuid: props.replayUuid 
    });
  }
  return markers;
});

const seekToRound = (round: number) => {
  console.log(`[SeekToRound] Emitting load-round event for round ${round}`);
  emit('load-round', round);
};

// Get round result for a specific round number
const getRoundResult = (roundNumber: number) => {
  if (!props.roundResults || props.roundResults.length === 0) {
    return null;
  }
  const result = props.roundResults.find(rr => rr.round === roundNumber);
  return result?.result || null;
};

// Get icon path for round result
const getRoundResultIcon = (roundNumber: number): string | null => {
  const result = getRoundResult(roundNumber);
  if (!result) return null;
  
  const iconMap: Record<string, string> = {
    'ct_win': '/icons/ct_win.svg',
    't_win': '/icons/t_win.svg',
    'bomb_defused': '/icons/bomb_defused.svg',
    'bomb_exploded': '/icons/bomb_exploded.svg'
  };
  
  const iconPath = iconMap[result] || null;
  return iconPath;
};

// Get icon path for round end marker based on result
const getRoundEndIcon = (result: string): string => {
  const iconMap: Record<string, string> = {
    'ct_win': '/icons/ct_win.svg',
    't_win': '/icons/t_win.svg',
    'bomb_defused': '/icons/bomb_defused.svg',
    'bomb_exploded': '/icons/bomb_exploded.svg'
  };
  return iconMap[result] || '/icons/ct_win.svg';
};

// Get CSS class for round end marker based on result
const getRoundEndClass = (result: string): string => {
  if (result === 'ct_win' || result === 'bomb_defused') {
    return 'ct-win';
  } else if (result === 't_win' || result === 'bomb_exploded') {
    return 't-win';
  }
  return '';
};

// Get title for round end marker
const getRoundEndTitle = (result: string): string => {
  const titleMap: Record<string, string> = {
    'ct_win': 'CT Win',
    't_win': 'T Win',
    'bomb_defused': 'Bomb Defused',
    'bomb_exploded': 'Bomb Exploded'
  };
  return titleMap[result] || 'Round End';
};

// Determine if icon should be positioned first (above number) based on round and result
const shouldIconBeFirst = (roundNumber: number): boolean => {
  const result = getRoundResult(roundNumber);
  if (!result) return false;
  
  const isFirstHalf = roundNumber <= 12;
  const isTWin = result === 't_win' || result === 'bomb_exploded';
  const isCTWin = result === 'ct_win' || result === 'bomb_defused';
  
  // First half (rounds 1-12):
  // T win or bomb exploded: number on top, icon on bottom (icon is NOT first)
  // CT win or bomb defused: number on bottom, icon on top (icon IS first)
  if (isFirstHalf) {
    return isTWin; // T wins -> icon first (top)
  } else {
    // Second half (rounds 13+): reverse the logic
    return isCTWin; // CT wins -> icon first (top)
  }
};

// Get flex direction class for button layout
const getFlexDirectionClass = (roundNumber: number): string => {
  // Always use column direction, order is controlled by shouldIconBeFirst
  return 'flex-column';
};

const handleInteraction = (clientX: number, el: HTMLElement) => {
  const rect = el.getBoundingClientRect();
  const pos = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const relTimeMs = (pos / rect.width) * props.roundDurationMs;
  // 跳转到全局时间：回合开始时间 + 相对偏移
  emit('seek-seconds', (props.roundStartTimeMs + relTimeMs) / 1000);
};

const onTimelineMouseDown = (e: MouseEvent) => {
  const el = e.currentTarget as HTMLElement;
  isDragging.value = true;
  emit('dragging-change', true);
  handleInteraction(e.clientX, el);
  
  const onMove = (me: MouseEvent) => handleInteraction(me.clientX, el);
  const onUp = () => {
    isDragging.value = false;
    emit('dragging-change', false);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
};

const formatMs = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const speedOptions = [0.5, 1, 2] as const;
</script>

<style scoped>
/* === Container === */
.timeline-widget-container {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 8px;
  background: transparent;
  user-select: none;
}

/* === Round Selection Module === */
.round-selection-module {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--ds-space-md);
}

/* === Layer Control === */
.layer-control-btn {
  width: 110px;
  height: 32px;
  background: transparent;
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-sm);
  display: flex;
  align-items: center;
  padding: 0 var(--ds-space-sm);
  cursor: pointer;
  transition: background var(--ds-transition-base);
  flex-shrink: 0;
}

.layer-control-btn:hover {
  background: var(--ds-surface-hover);
}

.icon-layer {
  width: 16px;
  height: 16px;
  margin-right: var(--ds-space-xs);
}

.btn-text-small {
  color: var(--ds-text-primary);
  font-size: var(--ds-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* === Debug Frame Button === */
.debug-frame-btn-fixed {
  height: 32px;
  background: rgba(74, 171, 247, 0.15);
  border: 1px solid rgba(74, 171, 247, 0.4);
  border-radius: var(--ds-radius-sm);
  display: flex;
  align-items: center;
  padding: 0 var(--ds-space-sm);
  gap: var(--ds-space-xs);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  flex-shrink: 0;
  color: #4dabf7;
  font-size: var(--ds-text-xs);
  font-weight: 600;
}

.debug-frame-btn-fixed:hover {
  background: rgba(74, 171, 247, 0.25);
  border-color: rgba(74, 171, 247, 0.6);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(74, 171, 247, 0.3);
}

.debug-frame-btn-fixed:active {
  transform: translateY(0);
}

.debug-frame-btn-fixed svg {
  flex-shrink: 0;
}

/* === Round Navigation === */
.round-nav-wrapper {
  flex: 1; /* 与 timeline-track-main 一样的 flex 布局 */
  height: 40px;
  background: transparent;
  display: flex;
  align-items: center;
  padding: 0;
  border-radius: 2px;
  overflow-x: auto;
  overflow-y: hidden;
}

.round-nav-wrapper::-webkit-scrollbar {
  height: 2px;
}

.round-nav-wrapper::-webkit-scrollbar-thumb {
  background: var(--ds-border-subtle);
}

.round-buttons-grid {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 1px;
  padding: 0 2px;
}

.round-btn-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.round-square-btn {
  width: 30px;
  height: 30px;
  background: transparent;
  border: none;
  color: var(--ds-text-primary);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition: background var(--ds-transition-base);
  position: relative;
}

.round-result-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  flex-shrink: 0;
  display: block;
}

.round-number {
  font-size: 10px;
  line-height: 1;
  height: 14px; /* Same height as icon for equal spacing */
  display: flex;
  align-items: center;
  justify-content: center;
}

.round-square-btn:hover {
  background: var(--ds-surface-hover);
}

.round-btn-cell.active .round-square-btn {
  background: var(--ds-surface-active);
  font-weight: bold;
}

.round-btn-cell.disabled .round-square-btn {
  opacity: 0.4;
  cursor: not-allowed;
  color: var(--ds-text-tertiary);
}
.round-btn-cell.disabled .round-square-btn:hover {
  background: transparent;
}
.round-btn-cell.disabled .round-result-icon {
  opacity: 0.6;
}

.round-underline-static {
  width: 100%;
  height: 2px;
  background: var(--ds-border-accent);
}

.v-dashed-divider {
  width: 1px;
  height: 24px;
  border-left: 1px dashed var(--ds-border-strong);
  margin: 0 var(--ds-space-xs);
  flex-shrink: 0;
}

/* === Playback Control Module === */
.playback-control-module {
  display: flex;
  height: 36px;
  gap: var(--ds-space-sm);
  align-items: center;
}

.playback-info-box {
  height: 100%;
  background: var(--ds-bg-secondary);
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  padding: 0 var(--ds-space-sm);
  border-radius: 2px;
  flex-shrink: 0;
  position: relative;
}

.controls-stack {
  display: flex;
  align-items: stretch;
  height: 100%;
  position: relative;
  z-index: 10;
}

.circle-play-btn {
  aspect-ratio: 1;
  height: 100%;
  width: auto;
  min-width: 0;
  border-radius: 6px;
  background: var(--ds-bg-secondary);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--ds-transition-base);
  flex-shrink: 0;
}

.circle-play-btn .play-icon-svg {
  width: 55%;
  height: 55%;
}

.circle-play-btn:hover:not(:disabled) {
  background: var(--ds-surface-hover);
}

.circle-play-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-meta {
  margin-left: var(--ds-space-sm);
  flex: 1;
  position: relative;
}

.speed-tabs {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  height: 80%;
  background: var(--ds-bg-secondary);
  border-radius: 2px;
  overflow: hidden;
}

.speed-tab-btn {
  padding: 0 12px;
  font-family: var(--ds-font-mono);
  font-size: 13px;
  font-weight: bold;
  color: var(--ds-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.speed-tab-btn:last-child {
  border-right: none;
}

.speed-tab-btn:hover {
  color: var(--ds-text-primary);
  background: var(--ds-surface-hover);
}

.speed-tab-btn.active {
  color: var(--ds-primary);
  background: rgba(78, 204, 163, 0.15);
}

.time-display-box {
  height: 100%;
  background: var(--ds-bg-secondary);
  display: flex;
  align-items: center;
  padding: 0 var(--ds-space-sm);
  border-radius: 2px;
  flex-shrink: 0;
}

.time-display {
  display: flex;
  align-items: center;
  gap: var(--ds-space-xs);
}

.icon-c4 {
  width: 14px;
  height: 14px;
  object-fit: contain;
  filter: brightness(0) saturate(100%) invert(47%) sepia(82%) saturate(3091%) hue-rotate(335deg) brightness(101%) contrast(98%);
}

.time-font {
  color: var(--ds-text-primary);
  font-family: var(--ds-font-mono);
  font-weight: bold;
  font-size: 13px;
}

/* === Timeline Track === */
.timeline-track-main {
  flex: 1;
  min-width: 0;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  position: relative;
  cursor: pointer;
  overflow: visible;
  border-radius: 2px;
  border: 1px solid var(--ds-border-subtle);
}

.dashed-grid-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: linear-gradient(to right, rgba(255, 255, 255, 0.2) 1px, transparent 1px);
  background-size: 20px 100%;
  background-repeat: repeat-x;
  opacity: 0.3;
}

.flat-progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, 
    rgba(78, 204, 163, 0.3) 0%, 
    rgba(78, 204, 163, 0.4) 50%, 
    rgba(78, 204, 163, 0.3) 100%);
  border-right: 2px solid var(--ds-primary);
}

/* === Timeline Markers === */
.decorative-markers {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.kill-marker {
  position: absolute;
  top: 0;
  width: 1px;
  height: 100%;
  z-index: 4;
}

.kill-marker.ct {
  background: var(--ds-team-ct);
  opacity: 0.8;
}

.kill-marker.t {
  background: var(--ds-team-t);
  opacity: 0.8;
}

.throw-marker {
  position: absolute;
  bottom: 0;
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-bottom: 6px solid;
  transform: translateX(-50%);
  z-index: 5;
}

.throw-marker.ct {
  border-bottom-color: var(--ds-team-ct);
}

.throw-marker.t {
  border-bottom-color: var(--ds-team-t);
}

.mark-line {
  position: absolute;
  top: 0;
  width: 1px;
  height: 100%;
  background: var(--ds-text-primary);
  opacity: 0.6;
}

.mark-line.ct {
  background: var(--ds-team-ct);
  opacity: 0.8;
}

.mark-line.t {
  background: var(--ds-team-t);
  opacity: 0.8;
}

/* === Bomb Event Markers === */
.bomb-event-mark {
  position: absolute;
  top: 0;
  width: 3px;
  height: 100%;
  z-index: 3;
  pointer-events: auto;
  cursor: help;
}

.bomb-planted-marker {
  position: absolute;
  top: 0;
  height: 100%;
  width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 6;
  pointer-events: none;
}

.bomb-line {
  position: absolute;
  top: 0;
  height: 100%;
  left: 0;
  width: 2px;
  background-color: rgba(255, 255, 255, 0.8);
  transform: translateX(-50%);
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.3);
}

.bomb-icon-wrapper {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--ds-team-t);
  border-radius: 50%;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid white;
  box-shadow: 0 0 4px rgba(0,0,0,0.5);
}

.bomb-svg-img {
  width: 12px;
  height: 12px;
  filter: drop-shadow(0 0 1px rgba(0,0,0,0.5));
}

.bomb-event-mark.bomb-planted {
  background: var(--ds-danger);
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.7), 0 0 18px rgba(239, 68, 68, 0.4);
}

.bomb-event-mark.bomb-exploded {
  background: linear-gradient(180deg, #ff6b6b 0%, #e03131 100%);
  box-shadow: 0 0 12px rgba(255, 107, 107, 0.8), 0 0 20px rgba(255, 107, 107, 0.4);
  animation: bomb-pulse 1.5s ease-in-out infinite;
}

.bomb-event-mark.round-end {
  background: linear-gradient(180deg, #ffa94d 0%, #fd7e14 100%);
  box-shadow: 0 0 8px rgba(255, 169, 77, 0.6);
}

@keyframes bomb-pulse {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 12px rgba(255, 107, 107, 0.8), 0 0 20px rgba(255, 107, 107, 0.4);
  }
  50% {
    opacity: 0.7;
    box-shadow: 0 0 16px rgba(255, 107, 107, 1), 0 0 28px rgba(255, 107, 107, 0.6);
  }
}

/* === Round End Markers === */
.round-end-marker {
  position: absolute;
  top: 0;
  height: 100%;
  width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 6;
  pointer-events: auto;
  cursor: help;
}

.round-end-line {
  position: absolute;
  top: 0;
  height: 100%;
  left: 0;
  width: 2px;
  background-color: rgba(255, 255, 255, 0.8);
  transform: translateX(-50%);
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.3);
}

.round-end-icon-wrapper {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid white;
  box-shadow: 0 0 4px rgba(0,0,0,0.5);
}

.round-end-marker.ct-win .round-end-icon-wrapper {
  background: var(--ds-team-ct);
}

.round-end-marker.t-win .round-end-icon-wrapper {
  background: var(--ds-team-t);
}

.round-end-icon {
  width: 12px;
  height: 12px;
  object-fit: contain;
  filter: drop-shadow(0 0 1px rgba(0,0,0,0.5));
}

.mark-icon {
  position: absolute;
  bottom: 100%;
  transform: translateX(-50%);
  display: flex;
  pointer-events: none;
  margin-bottom: 2px;
}

.projectile-svg-icon {
  width: 16px;
  height: 16px;
  filter: brightness(0) invert(1);
}

/* === 最小 1024×768 适配 === */
@media (max-width: 1024px) {
  .timeline-widget-container {
    padding: 2px 4px;
    gap: 1px;
  }

  .round-selection-module {
    gap: var(--ds-space-xs);
  }

  .round-nav-wrapper {
    height: 34px;
  }

  .round-square-btn {
    width: 26px;
    height: 26px;
    font-size: 10px;
  }

  .round-number {
    font-size: 9px;
    height: 12px;
  }

  .round-result-icon {
    width: 12px;
    height: 12px;
  }

  .playback-control-module {
    height: 32px;
    gap: var(--ds-space-xs);
  }

  .playback-info-box {
    width: 80px;
    padding: 0 var(--ds-space-xs);
  }

  .speed-tabs {
    height: 75%;
  }

  .speed-tab-btn {
    padding: 0 8px;
    font-size: 11px;
  }

  .time-font {
    font-size: 12px;
  }

  .layer-control-btn {
    width: 90px;
    height: 28px;
    font-size: 10px;
    padding: 0 var(--ds-space-xs);
  }
}

@media (max-height: 768px) {
  .timeline-widget-container {
    padding: 2px 4px;
    gap: 1px;
  }

  .round-selection-module {
    gap: 2px;
  }

  .round-nav-wrapper {
    height: 32px;
  }

  .round-buttons-grid {
    padding: 0 1px;
  }

  .round-square-btn {
    width: 24px;
    height: 24px;
    font-size: 9px;
  }

  .round-number {
    font-size: 9px;
    height: 10px;
  }

  .round-result-icon {
    width: 11px;
    height: 11px;
  }

  .playback-control-module {
    height: 40px;
  }

  .playback-info-box {
    height: 100%;
  }


  .speed-tabs {
    height: 70%;
  }

  .speed-tab-btn {
    padding: 0 6px;
    font-size: 10px;
  }

  .time-font {
    font-size: 11px;
  }
}

</style>
