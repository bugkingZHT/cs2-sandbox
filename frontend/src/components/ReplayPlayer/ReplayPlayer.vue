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
        :frames="safeFrames"
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


watch(currentPlaybackTimeMs, (newTime) => {
  const framesArr = safeFrames.value;
  if (!framesArr.length) return;


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
  if (!isPlaying.value || !totalFrames.value) {
    if (isPlaying.value) {
      isPlaying.value = false;
    }
    return;
  }

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
  if (rafId != null) {
    return;
  }
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
  const hasFrames = frames.value && frames.value.length > 0;
  if (!hasFrames) {
    return;
  }
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
      
      isPlaying.value = false;
      cancelAnimation();
      currentFrameIndex.value = 0;
      currentPlaybackTimeMs.value = 0;
    }
  },
);


watch(
  () => frames.value,
  (newFrames) => {
    if (newFrames && newFrames.length > 0) {

      isPlaying.value = false;
      cancelAnimation();
      currentFrameIndex.value = 0;
      currentPlaybackTimeMs.value = 0;
      lastTimestamp = 0;
    }
  },
  { deep: true }
);

onBeforeUnmount(() => {
  cancelAnimation();
});
</script>

<style scoped>
.viewer-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.map-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.map-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.map-canvas-wrapper {
  flex: 1;
  position: relative;
}

.side-panel {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  overflow-y: auto;
}

.team-panel {
  flex: 1;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  padding: 8px;
}

.team-panel-title {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 8px;
  text-align: center;
}

.team-panel.ct .team-panel-title {
  color: #3b82f6;
}

.team-panel.t .team-panel-title {
  color: #f97316;
}

.player-row {
  padding: 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  margin-bottom: 4px;
}

.player-row-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 4px;
}

.player-name {
  font-weight: bold;
}

.player-money {
  color: #10b981;
}

.hp-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.hp-bar-fill {
  height: 100%;
  width: 0;
}

.hp-bar-fill.ct {
  background: #3b82f6;
}

.hp-bar-fill.t {
  background: #f97316;
}

.hp-bar-empty {
  font-size: 10px;
  color: #999;
  text-align: center;
}

.timeline-panel {
  height: 100px;
  flex-shrink: 0;
  padding: 12px;
  border-top: 1px solid #333;
  background: rgba(0, 0, 0, 0.3);
}

.map-header {
  padding: 12px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.2);
}

.team-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.team-pill.ct {
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
}

.team-pill.t {
  background: rgba(249, 115, 22, 0.2);
  color: #fdba74;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot::before {
  content: '';
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: currentColor;
}

.team-pill.ct .dot {
  color: #93c5fd;
}

.team-pill.t .dot {
  color: #fdba74;
}
</style>
