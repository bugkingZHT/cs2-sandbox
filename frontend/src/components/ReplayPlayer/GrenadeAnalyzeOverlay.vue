<template>
  <div class="grenade-analyze-overlay" @click.self="$emit('close')">
    <!-- 右下角区域：投掷者信息 + 投掷标签 + 按键面板 + 微型进度条 -->
    <div class="bottom-right-area">
      <!-- 投掷者信息行 -->
      <div class="thrower-row" v-if="throwerInfo">
        <div class="thrower-info">
          <div class="thrower-avatar" :class="teamClass">
            {{ throwerInfo.name?.charAt(0) || '?' }}
          </div>
          <div class="thrower-details">
            <span class="thrower-name">{{ throwerInfo.name }}</span>
            <span class="projectile-type">{{ projectileTypeName }}</span>
          </div>
        </div>
        <button class="close-btn" @click="$emit('close')" title="关闭分析模式">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <!-- 投掷方式标签 + 复制按钮 -->
      <div class="tag-row">
        <button class="copy-pos-btn" @click="copyPosition" :title="copyTooltip">
          <svg v-if="!copied" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {{ copied ? '已复制' : '复制坐标' }}
        </button>
        <div class="throw-type-tag" :class="throwTypeClass">
          {{ throwType }}
        </div>
      </div>

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
          <span class="time-display">{{ formatRelativeTime(localPlaybackTimeMs) }}</span>

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
          <span class="time-range">{{ formatRelativeTime(totalDuration) }}</span>
        </div>

        <div class="hint-text">
          默认 0.25x 慢速 · 红色标记为投掷时刻 · 点击空白关闭
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue';
import KeyboardOverlay from './KeyboardOverlay.vue';
import type { PlayerState, ProjectileState } from '@/types/replay';
import type { ThrowType } from '@/composables/useGrenadeAnalyzer';
import { EQUIPMENT_ID_MAP } from '@/config/equipment';

const props = defineProps<{
  throwerInfo: PlayerState | null;
  selectedProjectile: ProjectileState | null;
  throwType: ThrowType;
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
  throwMomentPosition: { x: number; y: number; z: number; yaw: number; pitch: number } | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'seek', timeMs: number): void;
}>();

const progressTrackRef = ref<HTMLElement | null>(null);
const isPlaying = ref(false);
const playbackSpeed = ref(0.25);
const speedOptions = [0.25, 0.5, 1] as const;
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

let animationFrameId: number | null = null;
let lastTimestamp = 0;

// --- 计算属性 ---

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

const throwTypeClass = computed(() => {
  const map: Record<string, string> = {
    '跳投': 'type-jump',
    '蹲投': 'type-crouch',
    '跳蹲投': 'type-jumpcrouch',
    '走投': 'type-walk',
    '站投': 'type-stand',
  };
  return map[props.throwType] || '';
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

/**
 * 以投掷时刻为 0 点的相对时间显示
 * 投掷前显示 -x.xs，投掷后显示 +x.xs
 */
function formatRelativeTime(playbackMs: number): string {
  const throwRelMs = props.throwFrameTimeMs - props.analyzeTimeRange.startMs;
  const relMs = playbackMs - throwRelMs;
  const sign = relMs >= 0 ? '+' : '-';
  const abs = Math.abs(relMs);
  const sec = Math.floor(abs / 1000);
  const ms = Math.floor((abs % 1000) / 100);
  return `${sign}${sec}.${ms}s`;
}

// --- 进度条交互 ---

function onProgressMouseDown(e: MouseEvent) {
  updateProgressFromEvent(e);
  const onMove = (me: MouseEvent) => updateProgressFromEvent(me);
  const onUp = () => {
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
  emit('seek', percent * totalDuration.value);
}

// --- 播放控制 ---

function togglePlay() {
  // 如果已到末尾，点击从头播放
  if (!isPlaying.value && props.localPlaybackTimeMs >= totalDuration.value - 1) {
    emit('seek', 0);
  }
  isPlaying.value = !isPlaying.value;
  if (isPlaying.value) {
    lastTimestamp = 0;
    animationFrameId = requestAnimationFrame(playbackLoop);
  } else if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function setSpeed(speed: number) {
  playbackSpeed.value = speed;
}

function playbackLoop(timestamp: number) {
  if (!isPlaying.value) return;
  if (!lastTimestamp) lastTimestamp = timestamp;

  const delta = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  const newTime = props.localPlaybackTimeMs + delta * playbackSpeed.value;
  if (newTime >= totalDuration.value) {
    emit('seek', totalDuration.value);
    isPlaying.value = false;
    return;
  }
  emit('seek', newTime);
  animationFrameId = requestAnimationFrame(playbackLoop);
}

onUnmounted(() => {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  if (copyTimer) clearTimeout(copyTimer);
});

// --- 复制坐标 ---

const copyTooltip = computed(() => {
  if (!props.throwMomentPosition) return '无坐标数据';
  const p = props.throwMomentPosition;
  return `setpos ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}; setang ${p.pitch.toFixed(2)} ${p.yaw.toFixed(2)} 0`;
});

async function copyPosition() {
  if (!props.throwMomentPosition) return;
  const p = props.throwMomentPosition;
  const cmd = `setpos ${p.x.toFixed(6)} ${p.y.toFixed(6)} ${p.z.toFixed(6)}; setang ${p.pitch.toFixed(6)} ${p.yaw.toFixed(6)} 0`;
  try {
    await navigator.clipboard.writeText(cmd);
    copied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    console.warn('[GrenadeAnalyzer] 复制失败');
  }
}
</script>

<style scoped>
.grenade-analyze-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

/* === 投掷者信息行（右下角内） === */
.thrower-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.thrower-info { display: flex; align-items: center; gap: 10px; }

.thrower-avatar {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 600; color: #fff;
  background: rgba(255,255,255,0.2); border: 2px solid rgba(255,255,255,0.3);
}
.thrower-avatar.ct { background: rgba(59,130,246,0.6); border-color: rgba(59,130,246,0.8); }
.thrower-avatar.t  { background: rgba(234,179,8,0.6);  border-color: rgba(234,179,8,0.8); }

.thrower-details { display: flex; flex-direction: column; gap: 1px; }
.thrower-name { font-size: 13px; font-weight: 600; color: #fff; }
.projectile-type { font-size: 11px; color: rgba(255,255,255,0.6); }

/* 投掷方式标签 + 复制按钮行 */
.tag-row {
  display: flex; align-items: center; gap: 8px;
  align-self: flex-end;
}

.copy-pos-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 6px 12px; border-radius: 20px;
  font-size: 12px; font-weight: 500;
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.25);
  color: rgba(255,255,255,0.75); cursor: pointer;
  transition: all 0.2s ease; white-space: nowrap;
}
.copy-pos-btn:hover { background: rgba(255,255,255,0.2); color: #fff; }
.copy-pos-btn:active { transform: scale(0.96); }

/* 投掷方式标签 */
.throw-type-tag {
  padding: 6px 18px; border-radius: 20px;
  font-size: 15px; font-weight: 700; letter-spacing: 2px;
  border: 1.5px solid;
}
.type-jump       { background: rgba(74,171,247,0.25);  border-color: rgba(74,171,247,0.7);  color: #4aabf7; }
.type-crouch     { background: rgba(168,85,247,0.25);  border-color: rgba(168,85,247,0.7);  color: #a855f7; }
.type-jumpcrouch { background: rgba(236,72,153,0.25);  border-color: rgba(236,72,153,0.7);  color: #ec4899; }
.type-walk       { background: rgba(34,197,94,0.25);   border-color: rgba(34,197,94,0.7);   color: #22c55e; }
.type-stand      { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.35); color: rgba(255,255,255,0.75); }

.close-btn {
  width: 28px; height: 28px; border-radius: 50%;
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.7); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: all 0.2s ease;
}
.close-btn:hover { background: rgba(255,255,255,0.2); color: #fff; }

/* === 右下角区域 === */
.bottom-right-area {
  position: absolute; right: 24px; bottom: 24px;
  display: flex; flex-direction: column; align-items: flex-end;
  gap: 16px; z-index: 120;
}

/* === 进度条 === */
.mini-timeline-wrapper { display: flex; flex-direction: column; gap: 8px; }

.mini-timeline {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px;
  background: rgba(0,0,0,0.6); border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.2);
}

.play-btn {
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(74,171,247,0.8); border: none; color: #fff;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s ease; flex-shrink: 0;
}
.play-btn:hover { background: rgba(74,171,247,1); transform: scale(1.05); }

/* 速度选择器 */
.speed-selector { display: flex; gap: 4px; padding: 2px; background: rgba(0,0,0,0.4); border-radius: 6px; }
.speed-btn {
  padding: 4px 8px; font-size: 11px; font-weight: 500;
  background: transparent; border: none; border-radius: 4px;
  color: rgba(255,255,255,0.6); cursor: pointer; transition: all 0.15s ease;
}
.speed-btn:hover { color: rgba(255,255,255,0.9); background: rgba(255,255,255,0.1); }
.speed-btn.active { background: rgba(74,171,247,0.8); color: #fff; }

.time-display, .time-range {
  font-size: 12px; font-family: var(--ds-font-mono, monospace);
  color: rgba(255,255,255,0.8); min-width: 50px; white-space: nowrap;
}

.progress-track {
  flex: 1; min-width: 300px; height: 8px;
  background: rgba(255,255,255,0.2); border-radius: 4px;
  position: relative; cursor: pointer;
}

.progress-fill {
  position: absolute; top: 0; left: 0; height: 100%;
  background: linear-gradient(90deg, #4aabf7, #60a5fa);
  border-radius: 4px; pointer-events: none;
}

.progress-handle {
  position: absolute; top: 50%; width: 14px; height: 14px;
  background: #fff; border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);
  pointer-events: none; transition: transform 0.1s ease;
}
.progress-track:hover .progress-handle { transform: translate(-50%, -50%) scale(1.2); }

.throw-marker {
  position: absolute; top: -4px; bottom: -4px;
  width: 3px; background: #ff6b6b; border-radius: 2px;
  transform: translateX(-50%);
  box-shadow: 0 0 8px rgba(255,107,107,0.6);
}

.hint-text {
  text-align: center; margin-top: 8px;
  font-size: 11px; color: rgba(255,255,255,0.45);
}
</style>
