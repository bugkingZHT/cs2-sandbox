<template>
  <div class="grenade-analyze-overlay" @click.self="$emit('close')">
    <!-- 顶部信息栏 -->
    <div class="top-bar">
      <div class="thrower-info" v-if="throwerInfo">
        <div class="thrower-avatar" :class="teamClass">
          {{ throwerInfo.name?.charAt(0) || '?' }}
        </div>
        <div class="thrower-details">
          <span class="thrower-name">{{ throwerInfo.name }}</span>
          <span class="projectile-type">{{ projectileTypeName }}</span>
        </div>
      </div>
      <button class="close-btn" @click="$emit('close')" title="关闭分析模式">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <!-- 右下角区域：按键面板 + 微型进度条 -->
    <div class="bottom-right-area">
      <!-- 按键状态面板 -->
      <div class="keyboard-panel">
        <KeyboardOverlay :button-states="buttonStates" />
      </div>

      <!-- 微型进度条 -->
      <div class="mini-timeline-wrapper">
        <div class="mini-timeline">
          <!-- 播放控制 -->
          <button class="play-btn" @click="togglePlay" :title="isPlaying ? '暂停' : '播放'">
            <svg v-if="!isPlaying" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"/>
              <rect x="14" y="4" width="4" height="16"/>
            </svg>
          </button>

          <!-- 速度选择器 -->
          <div class="speed-selector">
            <button 
              v-for="speed in speedOptions" 
              :key="speed"
              class="speed-btn"
              :class="{ active: playbackSpeed === speed }"
              @click="setSpeed(speed)"
            >
              {{ speed }}x
            </button>
          </div>

          <!-- 时间显示 -->
          <span class="time-display">{{ formatTime(localPlaybackTimeMs) }}</span>

          <!-- 进度条 -->
          <div 
            class="progress-track" 
            ref="progressTrackRef"
            @mousedown="onProgressMouseDown"
          >
            <!-- 投掷时刻标记 -->
            <div 
              class="throw-marker" 
              :style="{ left: `${throwMarkerPosition}%` }"
              title="投掷时刻"
            />
            <!-- 进度填充 -->
            <div 
              class="progress-fill" 
              :style="{ width: `${progressPercent}%` }"
            />
            <!-- 拖动手柄 -->
            <div 
              class="progress-handle" 
              :style="{ left: `${progressPercent}%` }"
            />
          </div>

          <!-- 时间范围显示 -->
          <span class="time-range">{{ formatTime(totalDuration) }}</span>
        </div>

        <!-- 提示文字 -->
        <div class="hint-text">
          默认 0.25x 慢速播放，可清晰查看投掷操作细节
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import KeyboardOverlay from './KeyboardOverlay.vue';
import type { PlayerState, ProjectileState } from '@/types/replay';
import { EQUIPMENT_ID_MAP } from '@/config/equipment';

const props = defineProps<{
  throwerInfo: PlayerState | null;
  selectedProjectile: ProjectileState | null;
  buttonStates: {
    forward: boolean;
    back: boolean;
    left: boolean;
    right: boolean;
    attack: boolean;
    attack2: boolean;
    jump: boolean;
    duck: boolean;
  };
  localPlaybackTimeMs: number;
  analyzeTimeRange: { startMs: number; endMs: number };
  throwFrameTimeMs: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'seek', timeMs: number): void;
  (e: 'toggle-play'): void;
}>();

const progressTrackRef = ref<HTMLElement | null>(null);
const isPlaying = ref(false);
const isDragging = ref(false);
const playbackSpeed = ref(0.25); // 默认 0.25x 慢速播放
const speedOptions = [0.25, 0.5, 1] as const;

// 播放动画相关
let animationFrameId: number | null = null;
let lastTimestamp = 0;

// 计算属性
const teamClass = computed(() => {
  if (!props.throwerInfo?.team) return '';
  return props.throwerInfo.team === 3 ? 'ct' : 't';
});

const projectileTypeName = computed(() => {
  if (!props.selectedProjectile) return '';
  const typeId = Number(props.selectedProjectile.type);
  const equipName = EQUIPMENT_ID_MAP[typeId] || '';
  const nameMap: Record<string, string> = {
    'smokegrenade': '烟雾弹',
    'flashbang': '闪光弹',
    'hegrenade': '高爆手雷',
    'molotov': '燃烧弹',
    'incgrenade': '燃烧弹',
    'decoy': '诱饵弹',
  };
  return nameMap[equipName] || equipName;
});

const totalDuration = computed(() => {
  return props.analyzeTimeRange.endMs - props.analyzeTimeRange.startMs;
});

const progressPercent = computed(() => {
  if (totalDuration.value <= 0) return 0;
  return (props.localPlaybackTimeMs / totalDuration.value) * 100;
});

const throwMarkerPosition = computed(() => {
  if (totalDuration.value <= 0) return 50;
  const throwRelativeTime = props.throwFrameTimeMs - props.analyzeTimeRange.startMs;
  return (throwRelativeTime / totalDuration.value) * 100;
});

// 格式化时间
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 100);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds}`;
}

// 进度条交互
function onProgressMouseDown(e: MouseEvent) {
  isDragging.value = true;
  updateProgressFromEvent(e);
  
  const onMove = (me: MouseEvent) => updateProgressFromEvent(me);
  const onUp = () => {
    isDragging.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function updateProgressFromEvent(e: MouseEvent) {
  if (!progressTrackRef.value) return;
  
  const rect = progressTrackRef.value.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
  const percent = x / rect.width;
  const timeMs = percent * totalDuration.value;
  
  emit('seek', timeMs);
}

// 播放控制
function togglePlay() {
  isPlaying.value = !isPlaying.value;
  
  if (isPlaying.value) {
    lastTimestamp = 0;
    animationFrameId = requestAnimationFrame(playbackLoop);
  } else {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }
}

// 设置播放速度
function setSpeed(speed: number) {
  playbackSpeed.value = speed;
}

function playbackLoop(timestamp: number) {
  if (!isPlaying.value) return;
  
  if (!lastTimestamp) {
    lastTimestamp = timestamp;
  }
  
  const delta = timestamp - lastTimestamp;
  lastTimestamp = timestamp;
  
  // 应用播放速度
  const scaledDelta = delta * playbackSpeed.value;
  const newTime = props.localPlaybackTimeMs + scaledDelta;
  
  // 到达末尾时停止
  if (newTime >= totalDuration.value) {
    emit('seek', totalDuration.value);
    isPlaying.value = false;
    return;
  }
  
  emit('seek', newTime);
  animationFrameId = requestAnimationFrame(playbackLoop);
}

// 清理
onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
});
</script>

<style scoped>
.grenade-analyze-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

/* 顶部信息栏 */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent);
}

.thrower-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.thrower-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.thrower-avatar.ct {
  background: rgba(59, 130, 246, 0.6);
  border-color: rgba(59, 130, 246, 0.8);
}

.thrower-avatar.t {
  background: rgba(234, 179, 8, 0.6);
  border-color: rgba(234, 179, 8, 0.8);
}

.thrower-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.thrower-name {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.projectile-type {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.close-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

/* 右下角区域：按键面板 + 进度条 */
.bottom-right-area {
  position: absolute;
  right: 24px;
  bottom: 24px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 16px;
  z-index: 120;
}

/* 微型进度条容器 */
.mini-timeline-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mini-timeline {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.play-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(74, 171, 247, 0.8);
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.play-btn:hover {
  background: rgba(74, 171, 247, 1);
  transform: scale(1.05);
}

/* 速度选择器 */
.speed-selector {
  display: flex;
  gap: 4px;
  padding: 2px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 6px;
}

.speed-btn {
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s ease;
}

.speed-btn:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.1);
}

.speed-btn.active {
  background: rgba(74, 171, 247, 0.8);
  color: #fff;
}

.time-display, .time-range {
  font-size: 12px;
  font-family: var(--ds-font-mono, monospace);
  color: rgba(255, 255, 255, 0.8);
  min-width: 50px;
  white-space: nowrap;
}

.progress-track {
  flex: 1;
  min-width: 300px;
  height: 8px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  position: relative;
  cursor: pointer;
}

.progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, #4aabf7, #60a5fa);
  border-radius: 4px;
  pointer-events: none;
}

.progress-handle {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  transition: transform 0.1s ease;
}

.progress-track:hover .progress-handle {
  transform: translate(-50%, -50%) scale(1.2);
}

.throw-marker {
  position: absolute;
  top: -4px;
  bottom: -4px;
  width: 3px;
  background: #ff6b6b;
  border-radius: 2px;
  transform: translateX(-50%);
  box-shadow: 0 0 8px rgba(255, 107, 107, 0.6);
}

.hint-text {
  text-align: center;
  margin-top: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}
</style>
