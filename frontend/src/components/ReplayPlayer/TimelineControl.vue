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
        <el-slider
          :model-value="currentSeconds"
          :max="totalSeconds"
          :step="1"
          :format-tooltip="formatMs"
          @update:model-value="onSliderInput"
        />
      </div>
    </div>
    <div class="timeline-meta">
      <span>帧：{{ currentFrameIndex + 1 }} / {{ totalFrames || 0 }}</span>
      <span>
        时间：{{ formatMs(currentTimeMs) }} / {{ formatMs(totalTimeMs) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { VideoPlay, VideoPause } from '@element-plus/icons-vue';

const props = defineProps<{
  currentFrameIndex: number;
  totalFrames: number;
  isPlaying: boolean;
  currentTimeMs: number;
  totalTimeMs: number;
  playbackSpeed: number;
}>();

const emit = defineEmits<{
  (e: 'seek-seconds', value: number): void;
  (e: 'toggle-play'): void;
  (e: 'update-speed', value: number): void;
}>();

const speeds = [0.5, 1, 2, 4];

const totalSeconds = computed(() => Math.max(0, Math.ceil(props.totalTimeMs / 1000)));
const currentSeconds = computed(() =>
  Math.min(totalSeconds.value, Math.max(0, Math.floor(props.currentTimeMs / 1000))),
);

const onSliderInput = (val: number | number[]) => {
  emit('seek-seconds', val as number);
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
