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
        <!-- 空状态提示 -->
        <div v-if="!replay || !frames || frames.length === 0" class="empty-state">
          <div class="empty-state-content">
            <div class="empty-icon">📁</div>
            <h3>暂无回放数据</h3>
            <p>请点击右上角"上传 Demo"按钮解析 demo 文件</p>
          </div>
        </div>
        
        <!-- 地图画布 -->
        <div v-else class="map-canvas-wrapper">
          <MapCanvas 
            :frames="frames" 
            :bounds="bounds" 
            :current-frame-index="currentFrameIndex"
            :is-playing="isPlaying"
            :map-name="replay?.mapName"
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
                <!-- 血条 -->
                <div v-if="p.health != null" class="hp-bar">
                  <div
                    class="hp-bar-fill ct"
                    :style="{ width: hpPercentage(p.health) + '%' }"
                  ></div>
                </div>
                <div v-else class="hp-bar hp-bar-empty">无血量数据</div>
                <!-- 武器和道具 -->
                <div class="player-equipment">
                  <div v-if="p.activeWeapon" class="weapon-icon main-weapon">
                    <img 
                      :src="getWeaponIconPath(p.activeWeapon)" 
                      :alt="p.activeWeapon"
                      @error="onWeaponIconError"
                    />
                  </div>
                  <div v-if="p.inventory && p.inventory.length > 0" class="inventory">
                    <span
                      v-for="item in sortInventory(p.inventory)"
                      :key="item"
                      class="item-icon"
                    >
                      <img 
                        v-if="EQUIPMENT_ID_MAP[Number(item)]"
                        :src="getWeaponIconPath(item)" 
                        :alt="item"
                        @error="onWeaponIconError"
                      />
                    </span>
                  </div>
                </div>
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
                <!-- 血条 -->
                <div v-if="p.health != null" class="hp-bar">
                  <div
                    class="hp-bar-fill t"
                    :style="{ width: hpPercentage(p.health) + '%' }"
                  ></div>
                </div>
                <div v-else class="hp-bar hp-bar-empty">无血量数据</div>
                <!-- 武器和道具 -->
                <div class="player-equipment">
                  <div v-if="p.activeWeapon" class="weapon-icon main-weapon">
                    <img 
                      :src="getWeaponIconPath(p.activeWeapon)" 
                      :alt="p.activeWeapon"
                      @error="onWeaponIconError"
                    />
                  </div>
                  <div v-if="p.inventory && p.inventory.length > 0" class="inventory">
                    <span
                      v-for="item in sortInventory(p.inventory)"
                      :key="item"
                      class="item-icon"
                    >
                      <img 
                        v-if="EQUIPMENT_ID_MAP[Number(item)]"
                        :src="getWeaponIconPath(item)" 
                        :alt="item"
                        @error="onWeaponIconError"
                      />
                    </span>
                  </div>
                </div>
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
import { EQUIPMENT_ID_MAP, isUtilityItem } from '@/config/equipment';

const { loading, error, replay, frames, bounds } = useReplayData();

// 监听 replay 和 frames 的变化
watch(
  () => ({ replay: replay.value, frames: frames.value }),
  (data) => {
    console.log('[ReplayPlayer] 数据更新:', {
      hasReplay: !!data.replay,
      mapName: data.replay?.mapName,
      frameCount: data.frames?.length || 0
    });
  },
  { immediate: true }
);



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

const hpPercentage = (health: number) => {
  if (Number.isNaN(health)) return 0;
  return Math.max(0, Math.min(100, health));
};

const getWeaponIconPath = (weaponId: any) => {
  if (weaponId === undefined || weaponId === null) return '/weapons/default.svg';
  
  const id = Number(weaponId);
  const fileName = EQUIPMENT_ID_MAP[id];
  
  if (!fileName) return '/weapons/default.svg';

  const folder = isUtilityItem(id) ? 'utility' : 'weapons';
  return `/${folder}/${fileName}.svg`;
};

const onWeaponIconError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  // 如果加载失败，使用默认图标
  img.src = '/weapons/default.svg'; // 使用默认图标
};

const onUpdateSpeed = (value: number) => {
  playbackSpeed.value = value;
};

/**
 * 对道具进行排序，保证位置固定
 * 排序逻辑：按 ID 大小排序
 */
const sortInventory = (inventory: any[]) => {
  if (!inventory) return [];
  return [...inventory].sort((a, b) => Number(a) - Number(b));
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

// 监听地图名称变化，强制更新组件
watch(
  () => replay.value?.mapName,
  (newMapName, oldMapName) => {
    if (newMapName && newMapName !== oldMapName) {
      console.log('[ReplayPlayer] 地图名称变化:', oldMapName, '->', newMapName);
      // 重置播放状态
      isPlaying.value = false;
      cancelAnimation();
      currentFrameIndex.value = 0;
      currentPlaybackTimeMs.value = 0;
      lastTimestamp = 0;
    }
  }
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
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.4);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.team-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.team-panel-title {
  font-size: 11px;
  font-weight: bold;
  padding: 4px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  text-align: center;
  letter-spacing: 1px;
}

.team-panel.ct .team-panel-title {
  color: #60a5fa;
  text-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
}

.team-panel.t .team-panel-title {
  color: #fb923c;
  text-shadow: 0 0 10px rgba(249, 115, 22, 0.4);
}

.team-panel-body {
  flex: 1;
  overflow: hidden;
  padding: 2px;
}

.player-row {
  height: 46px;
  padding: 4px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.03);
  margin-bottom: 2px;
  border: 1px solid rgba(255, 255, 255, 0.02);
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.player-row-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  margin-bottom: 2px;
  line-height: 1.2;
}

.player-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90px;
}

.player-money {
  color: #4ade80;
  font-weight: bold;
  font-size: 10px;
}

.hp-bar {
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 2px;
}

.hp-bar-fill {
  height: 100%;
  transition: width 0.3s ease-out;
}

.hp-bar-fill.ct {
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
  box-shadow: 0 0 5px rgba(59, 130, 246, 0.3);
}

.hp-bar-fill.t {
  background: linear-gradient(90deg, #f97316, #fb923c);
  box-shadow: 0 0 5px rgba(249, 115, 22, 0.3);
}

.player-equipment {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 16px;
  margin-top: 1px;
}

.weapon-icon.main-weapon img {
  width: 30px;
  height: 15px;
  object-fit: contain;
}

.inventory {
  display: flex;
  gap: 2px;
  justify-content: flex-end;
}

.item-icon img {
  width: 14px;
  height: 14px;
  object-fit: contain;
  opacity: 0.8;
}

.item-icon:hover img {
  opacity: 1;
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

.empty-state {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center, rgba(59, 130, 246, 0.05), transparent);
}

.empty-state-content {
  text-align: center;
  padding: 40px;
  max-width: 400px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.6;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
}

.empty-state-content h3 {
  font-size: 20px;
  font-weight: 600;
  color: #e5e7eb;
  margin-bottom: 12px;
}

.empty-state-content p {
  font-size: 14px;
  color: #9ca3af;
  line-height: 1.6;
}
</style>