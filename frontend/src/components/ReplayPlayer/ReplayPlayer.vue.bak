<template>
  <div class="viewer-layout">
    <section class="map-panel">
      <header class="map-header">
        <span>
          地图：<strong>{{ replayTitle }}</strong>
        </span>
        <div>
          <span class="team-pill ct">
            <span class="dot" />CT
          </span>
          <span style="margin: 0 4px" />
          <span class="team-pill t">
            <span class="dot" />T
          </span>
        </div>
      </header>

      <div class="map-main">
        <div class="map-canvas-wrapper">
          <MapCanvas
            :frames="frames"
            :bounds="bounds"
            :current-frame-index="currentFrameIndex"
          />
        </div>
        <aside class="side-panel">
          <div class="team-panel ct">
            <div class="team-panel-title">CT 阵营</div>
            <div v-if="teamCTPlayers.length" class="team-panel-body">
              <div
                v-for="p in teamCTPlayers"
                :key="p.id"
                class="player-row"
              >
                <div class="player-row-header">
                  <span class="player-name">{{ p.name }}</span>
                  <span v-if="p.money != null" class="player-money">
                    ${{ p.money }}
                  </span>
                </div>
                <div v-if="p.hp != null" class="hp-bar">
                  <div
                    class="hp-bar-fill ct"
                    :style="{ width: hpPercentage(p.hp) + '%' }"
                  ></div>
                </div>
                <div v-else class="hp-bar hp-bar-empty">无血量数据</div>
              </div>
            </div>
            <div v-else class="team-panel-body empty">暂无数据</div>
          </div>

          <div class="team-panel t">
            <div class="team-panel-title">T 阵营</div>
            <div v-if="teamTPlayers.length" class="team-panel-body">
              <div
                v-for="p in teamTPlayers"
                :key="p.id"
                class="player-row"
              >
                <div class="player-row-header">
                  <span class="player-name">{{ p.name }}</span>
                  <span v-if="p.money != null" class="player-money">
                    ${{ p.money }}
                  </span>
                </div>
                <div v-if="p.hp != null" class="hp-bar">
                  <div
                    class="hp-bar-fill t"
                    :style="{ width: hpPercentage(p.hp) + '%' }"
                  ></div>
                </div>
                <div v-else class="hp-bar hp-bar-empty">无血量数据</div>
              </div>
            </div>
            <div v-else class="team-panel-body empty">暂无数据</div>
          </div>
        </aside>
      </div>
    </section>

    <section class="timeline-panel">
      <TimelineControl
        :current-frame-index="currentFrameIndex"
        :total-frames="totalFrames"
        :is-playing="isPlaying"
        :current-time-ms="currentTimeMs"
        :total-time-ms="totalTimeMs"
        :playback-speed="playbackSpeed"
        @seek-seconds="onSeekSeconds"
        @toggle-play="togglePlay"
        @update-speed="onUpdateSpeed"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import MapCanvas from './MapCanvas.vue';
import TimelineControl from './TimelineControl.vue';
import { useReplayData } from '@/composables/useReplayData';
import type { Frame, PlayerState } from '@/types/replay';

const { loading, error, replay, frames, bounds } = useReplayData();

// 从父组件或其他地方获取播放控制状态

const currentFrameIndex = ref(0);
const currentPlaybackTimeMs = ref(0);
const isPlaying = ref(false);
const playbackSpeed = ref(1);

let lastTimestamp = 0;
let rafId: number | null = null;

const safeFrames = computed<Frame[]>(() => frames.value || []);

const totalFrames = computed(() => safeFrames.value.length);

const currentFrame = computed<Frame | null>(() => {
  if (!safeFrames.value.length) return null;
  return safeFrames.value[currentFrameIndex.value] ?? null;
});

const teamCTPlayers = computed<PlayerState[]>(() => {
  return (currentFrame.value?.players ?? [])
    .filter((p) => p.team === 3)
    .slice()
    .sort((a, b) => a.id - b.id);
});

const teamTPlayers = computed<PlayerState[]>(() => {
  return (currentFrame.value?.players ?? [])
    .filter((p) => p.team === 2)
    .slice()
    .sort((a, b) => a.id - b.id);
});

const replayTitle = computed(() => replay.value?.mapName ?? '未知地图');

const currentTimeMs = computed(() => currentPlaybackTimeMs.value);

const totalTimeMs = computed(() => {
  if (!safeFrames.value.length) return 0;
  return safeFrames.value[safeFrames.value.length - 1]?.timeMs ?? 0;
});

// 当播放时间改变时，寻找对应的帧索引
watch(currentPlaybackTimeMs, (newTime) => {
  const framesArr = safeFrames.value;
  if (!framesArr.length) return;

  // 简单的二分查找或顺序查找（由于帧数多，二分更好）
  let low = 0;
  let high = framesArr.length - 1;
  let ans = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (framesArr[mid].timeMs <= newTime) {
      ans = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  currentFrameIndex.value = ans;
});

const stepPlayback = (timestamp: number) => {
  if (!isPlaying.value || !totalFrames.value) return;

  if (!lastTimestamp) {
    lastTimestamp = timestamp;
  }

  const realDelta = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  currentPlaybackTimeMs.value += realDelta * playbackSpeed.value;

  if (currentPlaybackTimeMs.value >= totalTimeMs.value) {
    currentPlaybackTimeMs.value = totalTimeMs.value;
    isPlaying.value = false;
    cancelAnimation();
    return;
  }

  rafId = requestAnimationFrame(stepPlayback);
};

const startAnimation = () => {
  if (rafId != null) return;
  lastTimestamp = 0;
  rafId = requestAnimationFrame(stepPlayback);
};

const cancelAnimation = () => {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
};

const togglePlay = () => {
  if (!totalFrames.value) return;
  isPlaying.value = !isPlaying.value;
  if (isPlaying.value) {
    startAnimation();
  } else {
    cancelAnimation();
  }
};

const onSeek = (frameIndex: number) => {
  const clamped = Math.max(0, Math.min(totalFrames.value - 1, frameIndex));
  currentFrameIndex.value = clamped;
  currentPlaybackTimeMs.value = safeFrames.value[clamped]?.timeMs ?? 0;
  lastTimestamp = 0;
};

const onSeekSeconds = (sec: number) => {
  currentPlaybackTimeMs.value = sec * 1000;
  lastTimestamp = 0;
};

const hpPercentage = (hp: number) => {
  if (Number.isNaN(hp)) return 0;
  return Math.max(0, Math.min(100, hp));
};

const onUpdateSpeed = (value: number) => {
  playbackSpeed.value = value;
};

watch(
  () => totalFrames.value,
  (count) => {
    if (!count) {
      isPlaying.value = false;
      cancelAnimation();
      currentFrameIndex.value = 0;
      currentPlaybackTimeMs.value = 0;
    } else {
      // 当帧数发生变化时，重置播放状态
      isPlaying.value = false;
      cancelAnimation();
      currentFrameIndex.value = 0;
      currentPlaybackTimeMs.value = 0;
    }
  },
);

onBeforeUnmount(() => {
  cancelAnimation();
});
</script>
