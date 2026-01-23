<template>
  <div class="timeline-main">
    <div class="timeline-controls">
      <div class="play-speed-group">
        <el-button
          type="primary"
          class="play-btn-large"
          @click="$emit('toggle-play')"
        >
          <el-icon v-if="isPlaying"><VideoPause /></el-icon>
          <el-icon v-else><VideoPlay /></el-icon>
          <span class="btn-text">{{ isPlaying ? '暂停' : '播放' }}</span>
        </el-button>

        <el-button-group class="speed-group-inline">
          <el-button
            v-for="s in speeds"
            :key="s"
            size="default"
            :type="s === playbackSpeed ? 'primary' : 'info'"
            class="speed-btn-rect"
            @click="$emit('update-speed', s)"
          >
            {{ s }}x
          </el-button>
        </el-button-group>
      </div>

      <div class="timeline-range">
        <div class="custom-timeline" @mousedown="onTimelineMouseDown">
          <div class="timeline-track">
            <!-- Round markers -->
            <div
              v-for="round in roundMarkers"
              :key="`round-${round.time}`"
              class="round-marker"
              :style="{ left: `${(round.time / totalTimeMs) * 100}%` }"
            >
              <div class="round-line"></div>
              <div class="round-label">{{ round.label }}</div>
            </div>
            
            <!-- Progress bar -->
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: `${(currentTimeMs / totalTimeMs) * 100}%` }"
              ></div>
            </div>
            
            <!-- Current position indicator (simple vertical line) -->
            <div
              class="position-indicator"
              :style="{ left: `${(currentTimeMs / totalTimeMs) * 100}%` }"
            >
              <div class="position-line"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="timeline-meta">
      <span>帧：{{ currentFrameIndex + 1 }} / {{ totalFrames || 0 }}</span>
      <span>时间：{{ formatMs(currentTimeMs) }} / {{ formatMs(totalTimeMs) }}</span>
      <span>回合：{{ currentRound }} / {{ totalRounds }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue';
import { VideoPlay, VideoPause } from '@element-plus/icons-vue';

const props = defineProps<{
  currentFrameIndex: number;
  totalFrames: number;
  isPlaying: boolean;
  currentTimeMs: number;
  totalTimeMs: number;
  playbackSpeed: number;
  frames: any[]; // 添加frames prop来获取round信息
}>();

const emit = defineEmits<{
  (e: 'seek-seconds', value: number): void;
  (e: 'toggle-play'): void;
  (e: 'update-speed', value: number): void;
}>();

const speeds = [0.5, 1, 2, 4];

// 计算回合标记
const roundMarkers = computed(() => {
  if (!props.frames || props.frames.length === 0) return [];
  
  const markers: { time: number; round: number; label: string }[] = [];
  let currentRound = -1;
  
  for (let i = 0; i < props.frames.length; i++) {
    const frame = props.frames[i];
    if (frame.round !== currentRound) {
      currentRound = frame.round;
      markers.push({
        time: frame.timeMs,
        round: frame.round,
        label: `R${frame.round}`
      });
    }
  }
  
  return markers;
});

// 计算当前回合
const currentRound = computed(() => {
  if (!props.frames || props.frames.length === 0 || props.currentFrameIndex >= props.frames.length) return 0;
  return props.frames[props.currentFrameIndex]?.round || 0;
});

// 计算总回合数
const totalRounds = computed(() => {
  if (!props.frames || props.frames.length === 0) return 0;
  const uniqueRounds = new Set(props.frames.map(frame => frame.round));
  return uniqueRounds.size;
});

const totalSeconds = computed(() => Math.max(0, Math.ceil(props.totalTimeMs / 1000)));
const currentSeconds = computed(() =>
  Math.min(totalSeconds.value, Math.max(0, Math.floor(props.currentTimeMs / 1000))),
);

// 替换原有的slider事件处理
const onSliderInput = (val: number | number[]) => {
  emit('seek-seconds', val as number);
};

const isDragging = ref(false);

const handleTimelineInteraction = (clientX: number, timelineElement: HTMLElement) => {
  if (!timelineElement) return;
  const rect = timelineElement.getBoundingClientRect();
  const position = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const clickedTimeMs = (position / rect.width) * props.totalTimeMs;
  emit('seek-seconds', clickedTimeMs / 1000);
};

const onTimelineMouseDown = (event: MouseEvent) => {
  const timelineElement = event.currentTarget as HTMLElement;
  isDragging.value = true;
  handleTimelineInteraction(event.clientX, timelineElement);
  
  const onMouseMove = (moveEvent: MouseEvent) => {
    if (isDragging.value) {
      handleTimelineInteraction(moveEvent.clientX, timelineElement);
    }
  };
  
  const onMouseUp = () => {
    isDragging.value = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
  
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
};

// 简化版时间轴点击事件处理
const onTimelineClick = (event: MouseEvent) => {
  const timelineElement = event.currentTarget as HTMLElement;
  const rect = timelineElement.getBoundingClientRect();
  const clickPosition = event.clientX - rect.left;
  const timelineWidth = rect.width;
  
  // 计算点击位置对应的时间
  const clickedTimeMs = (clickPosition / timelineWidth) * props.totalTimeMs;
  
  // 寻找最近的帧
  if (props.frames && props.frames.length > 0) {
    let closestFrameIndex = 0;
    let minDiff = Math.abs(props.frames[0].timeMs - clickedTimeMs);
    
    for (let i = 1; i < props.frames.length; i++) {
      const diff = Math.abs(props.frames[i].timeMs - clickedTimeMs);
      if (diff < minDiff) {
        minDiff = diff;
        closestFrameIndex = i;
      }
    }
    
    // 发送跳转到指定帧的事件
    emit('seek-seconds', props.frames[closestFrameIndex].timeMs / 1000);
  }
};

const formatMs = (msOrSec: number) => {
  // 如果是 slider 传进来的，可能是秒
  const ms = msOrSec > 10000 ? msOrSec : msOrSec * 1000;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};
</script>

<style scoped>
.timeline-main {
  padding: 12px;
  border-top: 1px solid #333;
  background: rgba(0, 0, 0, 0.3);
}

.timeline-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.play-speed-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.play-btn-large {
  height: 40px;
}

.btn-text {
  margin-left: 6px;
}

.speed-group-inline {
  margin-left: 8px;
}

.speed-btn-rect {
  min-width: 40px;
}

.timeline-range {
  flex: 1;
  min-width: 200px;
}

.custom-timeline {
  position: relative;
  height: 30px;
  cursor: pointer;
  background: rgba(40, 40, 40, 0.8);
  border-radius: 3px;
}

.timeline-track {
  position: relative;
  height: 100%;
}

.round-marker {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
}

.round-line {
  position: absolute;
  top: 0;
  left: 50%;
  width: 1px;
  height: 6px;
  background: #f97316;
  transform: translateX(-50%);
}

.round-label {
  position: absolute;
  top: -16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: #f97316;
  white-space: nowrap;
}

.position-indicator {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  z-index: 10;
  transform: translateX(-50%);
}

.position-line {
  position: absolute;
  top: 0;
  left: 50%;
  width: 2px;
  height: 100%;
  background: #3b82f6;
  transform: translateX(-50%);
  box-shadow: 0 0 4px rgba(59, 130, 246, 0.8);
}

.progress-bar {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  transform: translateY(-50%);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  border-radius: 2px;
}

.timeline-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #aaa;
}

.timeline-meta span {
  margin-right: 16px;
}
</style>
