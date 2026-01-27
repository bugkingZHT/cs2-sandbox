<template>
  <div class="timeline-widget-container">
    <!-- 一、上方：回合选择进度条 -->
    <div class="round-selection-module">
      <!-- 左侧按钮设计 -->
      <button class="layer-control-btn" @click="$emit('open-demo-drawer')" title="打开Demo列表">
        <svg class="icon-layer" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M2 17L12 22L22 17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="btn-text-small">REPLAY</span>
      </button>

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
            <svg class="icon-stopwatch" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 6V12L16 14"/>
            </svg>
            <span class="time-font">{{ formatMs(roundRelativeTimeMs) }}</span>
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
            <div 
              class="mark-icon"
              :style="{ left: `${m.offset}%` }"
            >
              <img :src="getProjectileIcon(m.type)" class="projectile-svg-icon" />
            </div>
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
}>();

const emit = defineEmits<{
  (e: 'seek-seconds', value: number): void;
  (e: 'toggle-play'): void;
  (e: 'update-speed', value: number): void;
  (e: 'open-demo-drawer'): void;
}>();

const isDragging = ref(false);

// 计算当前回合相对于该局开始的时间
const roundRelativeTimeMs = computed(() => {
  return Math.max(0, props.currentTimeMs - props.roundStartTimeMs);
});

// 计算道具投掷标记
const throwMarkers = computed(() => {
  if (!props.roundFrames || props.roundDurationMs === 0) return [];
  const markers: { offset: number; type: string; id: number; team: number }[] = [];
  const seenIds = new Set<number>();

  props.roundFrames.forEach(f => {
    if (f.projectiles && f.projectiles.length > 0) {
      f.projectiles.forEach((p: any) => {
        if (!seenIds.has(p.entityID)) {
          seenIds.add(p.entityID);
          const relTime = f.timeMs - props.roundStartTimeMs;
          
          // 根据投掷者ID查找阵营
          const thrower = f.players?.find((player: any) => player.steamID === p.throwerSteamID);
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

// 计算回合标记用于跳转
const roundMarkers = computed(() => {
  if (!props.frames || props.frames.length === 0) return [];
  const markers: { time: number; round: number }[] = [];
  let lastR = -1;
  for (let i = 0; i < props.frames.length; i++) {
    const f = props.frames[i];
    if (f.round !== lastR) {
      lastR = f.round;
      markers.push({ time: f.timeMs, round: f.round });
    }
  }
  return markers;
});

const seekToRound = (round: number) => {
  const marker = roundMarkers.value.find(m => m.round === round);
  if (marker) {
    emit('seek-seconds', marker.time / 1000);
  }
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
  handleInteraction(e.clientX, el);
  
  const onMove = (me: MouseEvent) => handleInteraction(me.clientX, el);
  const onUp = () => {
    isDragging.value = false;
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

const getProjectileIcon = (type: string) => {
  const typeId = Number(type);
  const fileName = EQUIPMENT_ID_MAP[typeId] || 'hegrenade';
  return `/utility/${fileName}.svg`;
};
</script>

<style scoped>
.timeline-widget-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 15px;
  background: transparent;
  user-select: none;
}

/* 上方模块 */
.round-selection-module {
  display: flex;
  align-items: center;
  gap: 12px;
}

.layer-control-btn {
  width: 122px;
  height: 40px;
  background: transparent;
  border: 1px solid rgba(173, 216, 230, 0.4);
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
  height: 46px; /* 稍微缩小高度 */
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

.mark-icon {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  pointer-events: none;
}

.projectile-svg-icon {
  width: 14px;
  height: 14px;
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
