<template>
  <div class="timeline-widget-container">
    <!-- 一、上方：回合选择进度条 -->
    <div class="round-selection-module">
      <!-- 左侧电源菜单按钮 -->
      <div class="power-menu-wrapper">
        <button 
          class="power-menu-btn" 
          @click="togglePowerMenu"
          title="控制菜单"
        >
          <svg class="icon-power" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
            <line x1="12" y1="2" x2="12" y2="12"/>
          </svg>
        </button>
        
        <!-- 下拉菜单 -->
        <div v-if="showPowerMenu" class="power-menu-dropdown" @click.stop>
          <button class="menu-item" @click="exitReplay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span>退出回放</span>
          </button>
        </div>
      </div>

      <!-- 核心进度条主体 -->
      <div class="round-nav-wrapper">
        <div class="round-buttons-grid">
          <template v-for="r in totalRoundsCount" :key="r">
            <div class="round-btn-cell" :class="{ 'active': currentRound === r }">
              <button class="round-square-btn" @click="seekToRound(r)">{{ r }}</button>
              <div class="round-underline-static"></div>
            </div>
            <!-- 12和13号之间的纵向虚线 -->
            <div v-if="r === 12" class="v-dashed-divider"></div>
          </template>
        </div>
      </div>

      <!-- Debug 按钮 -->
      <button 
        v-if="DEBUG_CONFIG.enableFrameDataViewer"
        class="debug-frame-btn-fixed"
        @click="showCurrentFrameData"
        title="View current frame data"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        <span>Frame {{ currentFrameIndex }}</span>
      </button>
    </div>

    <!-- 二、下方：时间轴进度条 -->
    <div class="playback-control-module">
      <!-- 左侧控制区 -->
      <div class="playback-info-box">
        <button class="circle-play-btn" @click="$emit('toggle-play')">
          <svg v-if="isPlaying" width="20" height="20" viewBox="0 0 24 24" fill="white">
            <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M8 5V19L19 12L8 5Z"/>
          </svg>
        </button>
        <div class="status-meta">
          <div class="speed-tag">{{ playbackSpeed }}x</div>
          <div class="time-display">
            <svg class="icon-stopwatch" width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="roundTimeColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 6V12L16 14"/>
            </svg>
            <span class="time-font" :style="{ color: roundTimeColor }">{{ formatRoundTime }}</span>
          </div>
        </div>
      </div>

      <!-- 右侧时间轴主体 -->
      <div class="timeline-track-main" @mousedown="onTimelineMouseDown">
        <!-- 进度填充（平面化） -->
        <div class="flat-progress-fill" :style="{ width: `${(roundRelativeTimeMs / roundDurationMs) * 100}%` }"></div>

        <!-- 动态视觉标记：道具投掷 -->
        <div class="decorative-markers">
          <template v-for="m in throwMarkers" :key="m.id">
            <div 
              class="mark-line" 
              :class="{ 'ct': m.team === 3, 't': m.team === 2 }"
              :style="{ left: `${m.offset}%` }"
            ></div>
          </template>
          
          <!-- 炸弹事件标记 -->
          <template v-for="(bm, idx) in bombEventMarkers" :key="`bomb-${idx}`">
            <div 
              class="bomb-event-mark" 
              :class="{ 
                'bomb-planted': bm.event === 'planted', 
                'bomb-exploded': bm.event === 'exploded',
                'round-end': bm.event === 'roundend'
              }"
              :style="{ left: `${bm.offset}%` }"
              :title="bm.event === 'planted' ? 'Bomb Planted' : bm.event === 'exploded' ? 'Bomb Exploded' : 'Round End'"
            ></div>
          </template>
        </div>

        <!-- 当前位置指示器 -->
        <div class="playhead-line" :style="{ left: `${(roundRelativeTimeMs / roundDurationMs) * 100}%` }"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { EQUIPMENT_ID_MAP } from '@/config/equipment';
import { DEBUG_CONFIG } from '@/config/debug';

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
}>();

const emit = defineEmits<{
  (e: 'seek-seconds', value: number): void;
  (e: 'toggle-play'): void;
  (e: 'update-speed', value: number): void;
  (e: 'exit-replay'): void;
  (e: 'dragging-change', value: boolean): void;
  (e: 'load-round', roundNumber: number): void;
}>();

const isDragging = ref(false);
const showPowerMenu = ref(false);

// Toggle power menu
const togglePowerMenu = () => {
  showPowerMenu.value = !showPowerMenu.value;
};

// Exit replay and return to library
const exitReplay = () => {
  showPowerMenu.value = false;
  emit('exit-replay');
};

// Close power menu when clicking outside
const handleClickOutside = () => {
  showPowerMenu.value = false;
};

// Add click listener to close menu when clicking outside
if (typeof window !== 'undefined') {
  document.addEventListener('click', handleClickOutside);
}

// Debug: show current frame data
const showCurrentFrameData = () => {
  if (!DEBUG_CONFIG.enableFrameDataViewer) return;
  
  const currentFrame = props.frames[props.currentFrameIndex];
  if (!currentFrame) {
    alert('No frame data available');
    return;
  }
  
  // Open frame data in new tab
  const dataWindow = window.open('', '_blank');
  if (dataWindow) {
    const frameData = JSON.stringify(currentFrame, null, 2);
    dataWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Frame Data - Index ${props.currentFrameIndex}</title>
          <style>
            body {
              background: #1a1a1a;
              color: #e0e0e0;
              font-family: 'Courier New', monospace;
              padding: 20px;
              margin: 0;
            }
            pre {
              background: #2a2a2a;
              padding: 20px;
              border-radius: 8px;
              overflow: auto;
              font-size: 14px;
              line-height: 1.5;
            }
            h1 {
              color: #4dabf7;
              font-size: 24px;
              margin-bottom: 20px;
            }
            .meta {
              background: #2a2a2a;
              padding: 15px;
              border-radius: 8px;
              margin-bottom: 20px;
              font-size: 14px;
            }
            .meta span {
              display: inline-block;
              margin-right: 20px;
            }
            .label {
              color: #868e96;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <h1>🔍 Frame Data Viewer</h1>
          <div class="meta">
            <span><span class="label">Frame Index:</span> ${props.currentFrameIndex}</span>
            <span><span class="label">Time:</span> ${currentFrame.timeMs}ms</span>
            <span><span class="label">Tick:</span> ${currentFrame.tick}</span>
            <span><span class="label">Round:</span> ${currentFrame.round}</span>
          </div>
          <pre>${frameData}</pre>
        </body>
      </html>
    `);
    dataWindow.document.close();
  }
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
      // projectiles is now a Record<number, ProjectileState>, iterate through values
      Object.values(f.projectiles).forEach((p: any) => {
        if (!seenIds.has(p.entityID)) {
          seenIds.add(p.entityID);
          const relTime = f.timeMs - props.roundStartTimeMs;
          
          // Find thrower by player ID from players map (direct lookup)
          const thrower = f.players?.[p.throwerID] || null;
          const team = thrower ? thrower.team : 0;

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

// 计算炸弹事件标记（安放和爆炸）
const bombEventMarkers = computed(() => {
  if (!props.roundFrames || props.roundDurationMs === 0) return [];
  const markers: { offset: number; event: 'planted' | 'exploded' | 'roundend' }[] = [];
  
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
      markers.push({ offset, event: 'roundend' });
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
</script>

<style scoped>
.timeline-widget-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 9px;
  background: transparent;
  user-select: none;
}

/* 上方模块 */
.round-selection-module {
  display: flex;
  align-items: center;
  gap: 12px;
}

.power-menu-wrapper {
  position: relative;
  flex-shrink: 0;
}

.power-menu-btn {
  width: 40px;
  height: 40px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  color: white;
}

.power-menu-btn:hover {
  background: rgba(120, 120, 120, 0.4);
  border-color: rgba(255, 255, 255, 0.3);
}

.power-menu-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: #1f1f1f;
  border: 1px solid #444;
  border-radius: 4px;
  min-width: 160px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  z-index: 100;
  overflow: hidden;
}

.menu-item {
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  color: #eee;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: background 0.2s;
  text-align: left;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.menu-item svg {
  flex-shrink: 0;
  color: #888;
}

.menu-item:hover svg {
  color: #fff;
}

.layer-control-btn {
  width: 122px;
  height: 40px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.layer-control-btn:hover {
  background: rgba(120, 120, 120, 0.4);
}
.icon-layer {
  width: 18px;
  height: 18px;
  margin-right: 8px;
}
.btn-text-small {
  color: white;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.debug-frame-btn-fixed {
  height: 40px;
  background: rgba(74, 171, 247, 0.15);
  border: 1px solid rgba(74, 171, 247, 0.4);
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  color: #4dabf7;
  font-size: 11px;
  font-weight: 600;
  margin-left: 8px;
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

.round-nav-wrapper {
  flex: 1;
  height: 54px;
  background: transparent;
  display: flex;
  align-items: center;
  padding: 0;
  border-radius: 2px;
  overflow-x: auto;
  overflow-y: hidden;
}

/* 隐藏滚动条但保留功能 */
.round-nav-wrapper::-webkit-scrollbar {
  height: 2px;
}
.round-nav-wrapper::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
}

.round-buttons-grid {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 1px; /* 进一步缩小间距 */
  padding: 0 2px;
}

.round-btn-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.round-square-btn {
  width: 36px; /* 稍微缩小一点 */
  height: 36px;
  background: transparent;
  border: none;
  color: white;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}
.round-square-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.round-btn-cell.active .round-square-btn {
  background: rgba(255, 255, 255, 0.15);
  font-weight: bold;
}

.round-underline-static {
  width: 100%;
  height: 2px;
  background: #4a4a4a;
}

.v-dashed-divider {
  width: 1px;
  height: 24px;
  border-left: 1px dashed rgba(255, 255, 255, 0.5);
  margin: 0 4px;
  flex-shrink: 0;
}

/* 下方模块 */
.playback-control-module {
  display: flex;
  height: 38px; /* 减小进度条高度 */
  gap: 10px;
}

.playback-info-box {
  width: 140px;
  background: #1f1f1f;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-radius: 2px;
  flex-shrink: 0;
}

.circle-play-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #1f1f1f;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.circle-play-btn:hover {
  background: #3a3a3a;
}

.status-meta {
  margin-left: 10px;
  flex: 1;
  position: relative;
}

.speed-tag {
  color: white;
  font-size: 10px;
  position: absolute;
  top: -4px;
  right: 0;
}

.time-display {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px; /* 从 8px 减小到 4px */
}
.time-font {
  color: white;
  font-family: 'Courier New', Courier, monospace;
  font-weight: bold;
  font-size: 14px;
}

.timeline-track-main {
  flex: 1;
  background: #1f1f1f;
  position: relative;
  cursor: pointer;
  overflow: hidden;
  border-radius: 2px;
}

.dashed-grid-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-image: linear-gradient(to right, white 1px, transparent 1px);
  background-size: 20px 100%; /* 均匀刻度 */
  background-repeat: repeat-x;
  opacity: 0.1;
}

.flat-progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: rgba(255, 255, 255, 0.05);
}

.decorative-markers {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.mark-line {
  position: absolute;
  top: 0;
  width: 1px;
  height: 100%;
  background: white;
  opacity: 0.6; /* 增加透明度让颜色更明显 */
}

.mark-line.ct {
  background: #3b82f6;
  opacity: 0.8;
}

.mark-line.t {
  background: #f97316;
  opacity: 0.8;
}

/* 炸弹事件标记 */
.bomb-event-mark {
  position: absolute;
  top: 0;
  width: 3px;
  height: 100%;
  z-index: 3;
  pointer-events: auto;
  cursor: help;
}

/* 炸弹安放 - 标准红色 */
.bomb-event-mark.bomb-planted {
  background: #ff0000;
  box-shadow: 0 0 10px rgba(255, 0, 0, 0.7), 0 0 18px rgba(255, 0, 0, 0.4);
  
}

/* 炸弹爆炸 - 红色发光 */
.bomb-event-mark.bomb-exploded {
  background: linear-gradient(180deg, #ff6b6b 0%, #e03131 100%);
  box-shadow: 0 0 12px rgba(255, 107, 107, 0.8), 0 0 20px rgba(255, 107, 107, 0.4);
  animation: bomb-pulse 1.5s ease-in-out infinite;
}

/* 回合结束 - 橙色 */
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

.mark-icon {
  position: absolute;
  bottom: 100%; /* 放在进度条之外上方 */
  transform: translateX(-50%);
  display: flex;
  pointer-events: none;
  margin-bottom: 2px; /* 与进度条顶部保持2px间距 */
}

.projectile-svg-icon {
  width: 16px;
  height: 16px;
  filter: brightness(0) invert(1); /* 统一白色 */
}

.playhead-line {
  position: absolute;
  top: 0;
  width: 1px;
  height: 100%;
  background: white;
  z-index: 5;
  box-shadow: none; /* 明确去掉发光 */
}
</style>
