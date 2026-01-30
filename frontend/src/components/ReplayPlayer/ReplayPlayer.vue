<template>
  <div class="viewer-layout">
    <section class="map-panel">
      <header class="map-header">
        <div class="top-players-container">
          <!-- CT 阵营 -->
          <div class="team-horizontal-group ct">
            <div v-for="p in teamCTPlayers" :key="p.id" class="player-card-mini" :class="{ 'is-dead': !p.alive }">
              <div class="player-main-info">
                <div class="p-identity">
                  <span class="p-name">{{ p.name }}</span>
                  <span class="p-kda">{{ p.kills || 0 }}/{{ p.assists || 0 }}/{{ p.deaths || 0 }}</span>
                </div>
                <span class="p-money">${{ p.money }}</span>
              </div>
              <div class="p-status-row">
                <div class="p-hp-bar">
                  <div class="hp-fill ct" :style="{ width: hpPercentage(p.health) + '%' }"></div>
                  <span class="hp-val">{{ Math.round(p.health || 0) }}</span>
                </div>
                <div class="p-equipment-icons">
                  <img 
                    v-if="p.activeWeapon"
                    :src="getWeaponIconPath(p.activeWeapon)" 
                    class="weapon-mini"
                    @error="onWeaponIconError"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 分数/分界 -->
          <div class="match-score-pill">
            <span class="score-val ct">{{ replay?.scoreCT || 0 }}</span>
            <span class="score-divider">:</span>
            <span class="score-val t">{{ replay?.scoreT || 0 }}</span>
          </div>

          <!-- T 阵营 -->
          <div class="team-horizontal-group t">
            <div v-for="p in teamTPlayers" :key="p.id" class="player-card-mini" :class="{ 'is-dead': !p.alive }">
              <div class="player-main-info">
                <div class="p-identity">
                  <span class="p-name">{{ p.name }}</span>
                  <span class="p-kda">{{ p.kills || 0 }}/{{ p.assists || 0 }}/{{ p.deaths || 0 }}</span>
                </div>
                <span class="p-money">${{ p.money }}</span>
              </div>
              <div class="p-status-row">
                <div class="p-hp-bar">
                  <div class="hp-fill t" :style="{ width: hpPercentage(p.health) + '%' }"></div>
                  <span class="hp-val">{{ Math.round(p.health || 0) }}</span>
                </div>
                <div class="p-equipment-icons">
                  <img 
                    v-if="p.activeWeapon"
                    :src="getWeaponIconPath(p.activeWeapon)" 
                    class="weapon-mini"
                    @error="onWeaponIconError"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div class="map-main">
        <!-- 空状态提示 -->
        <div v-if="!replay || !frames || frames.length === 0" class="empty-state">
          <div class="empty-state-content">
            <div class="empty-icon">·</div>
            <h3>暂无回放数据</h3>
            <p>请从 Demo 库选择文件</p>
          </div>
        </div>
        
        <!-- 地图画布 -->
        <div v-else class="map-canvas-wrapper">
          <MapCanvas 
            :frames="frames" 
            :bounds="bounds" 
            :current-frame-index="currentFrameIndex"
            :is-playing="isPlaying"
            :is-dragging="isDraggingTimeline"
            :map-name="replay?.mapName"
            :projectile-configs="replay?.projectileRenderConfig"
          />

          <!-- 击杀回传 (Kill Feed) -->
          <div class="kill-feed-container">
            <TransitionGroup name="list">
              <div v-for="k in currentRoundKills" :key="k.victimId" class="kill-feed-item">
                <div class="kill-card">
                  <span class="k-killer" :class="getTeamClass(k.killerId)">{{ playerNameMap[k.killerId] || 'Unknown' }}</span>
                  <span v-if="k.assistantId" class="k-assist">
                    <span class="plus">+</span>
                    {{ playerNameMap[k.assistantId] }}
                  </span>
                  <div class="k-weapon-box">
                    <img :src="getWeaponIconPath(k.weaponId)" class="k-weapon-icon" @error="onWeaponIconError" />
                  </div>
                  <span class="k-victim" :class="getTeamClass(k.victimId)">{{ playerNameMap[k.victimId] || 'Unknown' }}</span>
                </div>
              </div>
            </TransitionGroup>
          </div>
        </div>
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
        :round-frames="currentRoundFrames"
        :round-start-time-ms="roundStartTimeMs"
        :round-duration-ms="roundDurationMs"
        :score-c-t="replay?.scoreCT || 0"
        :score-t="replay?.scoreT || 0"
        :replay-uuid="replay?.uuid"
        :total-rounds="replay?.totalRounds || 0"
        @seek-seconds="onSeekSeconds"
        @toggle-play="togglePlay"
        @update-speed="onUpdateSpeed"
        @exit-replay="emit('exit-replay')"
        @dragging-change="isDraggingTimeline = $event"
        @load-round="loadRoundData"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MapCanvas from './MapCanvas.vue';
import TimelineControl from './TimelineControl.vue';
import { useReplayData } from '@/composables/useReplayData';
import type { Frame, PlayerState, ReplayData } from '@/types/replay';
import { EQUIPMENT_ID_MAP, isUtilityItem } from '@/config/equipment';

const emit = defineEmits<{
  (e: 'exit-replay'): void;
}>();

const { loading, error, replay, frames, bounds } = useReplayData();

const currentFrameIndex = ref(0);
const currentPlaybackTimeMs = ref(0);
const isPlaying = ref(false);
const playbackSpeed = ref(1);
const isDraggingTimeline = ref(false);
const wasPlayingBeforeDrag = ref(false);

let lastTimestamp = 0;
let rafId: number | null = null;

// Animation control functions (declared early for use in watchers)
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

// Check URL for frameId parameter and seek to it
const checkUrlFrameId = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const frameId = urlParams.get('frameId');
  
  if (frameId) {
    const targetFrame = parseInt(frameId, 10);
    if (!isNaN(targetFrame) && targetFrame >= 0 && targetFrame < (frames.value?.length || 0)) {
      console.log(`[ReplayPlayer] URL contains frameId=${targetFrame}, seeking to frame`);
      currentFrameIndex.value = targetFrame;
      if (frames.value && frames.value[targetFrame]) {
        currentPlaybackTimeMs.value = frames.value[targetFrame].timeMs;
      }
    }
  }
};

// 监听 replay 和 frames 的变化
watch(
  () => ({ replay: replay.value, frames: frames.value }),
  (data) => {
    console.log('[ReplayPlayer] 数据更新:', {
      hasReplay: !!data.replay,
      mapName: data.replay?.mapName,
      frameCount: data.frames?.length || 0
    });
    
    // Reset playback state when new replay is loaded
    if (data.replay && data.frames && data.frames.length > 0) {
      currentFrameIndex.value = 0;
      currentPlaybackTimeMs.value = data.frames[0]?.timeMs ?? 0;
      isPlaying.value = false;
      cancelAnimation();
      lastTimestamp = 0;
      
      // Check URL for frameId after data is loaded
      checkUrlFrameId();
    }
  },
  { immediate: true }
);

// Auto-pause when dragging starts, auto-resume when dragging ends
watch(isDraggingTimeline, (isDragging) => {
  if (isDragging) {
    // Started dragging - pause if playing
    wasPlayingBeforeDrag.value = isPlaying.value;
    if (isPlaying.value) {
      isPlaying.value = false;
      cancelAnimation();
    }
  } else {
    // Stopped dragging - resume if was playing before
    if (wasPlayingBeforeDrag.value) {
      isPlaying.value = true;
      startAnimation();
      wasPlayingBeforeDrag.value = false;
    }
  }
});

const safeFrames = computed<Frame[]>(() => frames.value || []);

const totalFrames = computed(() => safeFrames.value.length);

const currentFrame = computed<Frame | null>(() => {
  if (!safeFrames.value.length) return null;
  return safeFrames.value[currentFrameIndex.value] ?? null;
});

const teamCTPlayers = computed<PlayerState[]>(() => {
  if (!currentFrame.value?.players) return [];
  
  // Use pre-sorted player IDs from engine
  const sortedPlayerIds = currentFrame.value.sortedPlayers || Object.keys(currentFrame.value.players).map(Number);
  
  // Filter and return CT players in sorted order
  return sortedPlayerIds
    .map(id => currentFrame.value!.players[id])
    .filter(p => p && p.team === 3);
});

const teamTPlayers = computed<PlayerState[]>(() => {
  if (!currentFrame.value?.players) return [];
  
  // Use pre-sorted player IDs from engine
  const sortedPlayerIds = currentFrame.value.sortedPlayers || Object.keys(currentFrame.value.players).map(Number);
  
  // Filter and return T players in sorted order
  return sortedPlayerIds
    .map(id => currentFrame.value!.players[id])
    .filter(p => p && p.team === 2);
});

// 计算所有玩家 ID 到名称的映射，用于击杀信息显示
const playerNameMap = computed(() => {
  const map: Record<number, string> = {};
  safeFrames.value.forEach(f => {
    if (f.players) {
      // Iterate through players map
      for (const playerId in f.players) {
        const p = f.players[playerId];
        if (!map[p.id]) map[p.id] = p.name;
      }
    }
  });
  return map;
});

// --- 新增：当前回合数据计算 ---
const currentRound = computed(() => {
  if (!safeFrames.value.length) return 0;
  return safeFrames.value[currentFrameIndex.value]?.round || 0;
});

const currentRoundFrames = computed(() => {
  if (!safeFrames.value.length || currentRound.value === 0) return [];
  return safeFrames.value.filter(f => f.round === currentRound.value);
});

// 计算当前回合按时间顺序排列的击杀列表
const currentRoundKills = computed(() => {
  if (!currentFrame.value?.killEvents) return [];
  
  const killsInOrder: any[] = [];
  const seenVictims = new Set<number>();
  const currentEvents = currentFrame.value.killEvents;
  
  // 遍历当前回合的所有帧，直到当前帧，按出现顺序记录击杀
  for (const f of currentRoundFrames.value) {
    if (f.timeMs > (currentFrame.value?.timeMs || 0)) break;
    if (f.killEvents) {
      for (const victimIdStr in f.killEvents) {
        const victimId = parseInt(victimIdStr);
        // 只有当前帧中存在的击杀才显示
        if (!seenVictims.has(victimId) && currentEvents[victimId]) {
          seenVictims.add(victimId);
          killsInOrder.push({
            victimId,
            ...f.killEvents[victimId]
          });
        }
      }
    }
  }
  return killsInOrder;
});

// 获取玩家阵营对应的 CSS 类
const getTeamClass = (playerId: number) => {
  // 尝试从当前帧找，找不到就从所有帧找（处理离线/结束情况）
  let player = currentFrame.value?.players?.[playerId];
  if (!player) {
    for (const f of safeFrames.value) {
      player = f.players?.[playerId];
      if (player) break;
    }
  }
  if (!player) return '';
  return player.team === 3 ? 'ct' : 't';
};

const roundStartTimeMs = computed(() => {
  if (!currentRoundFrames.value.length) return 0;
  return currentRoundFrames.value[0].timeMs;
});

const roundDurationMs = computed(() => {
  if (!currentRoundFrames.value.length) return 0;
  const lastFrame = currentRoundFrames.value[currentRoundFrames.value.length - 1];
  return lastFrame.timeMs - roundStartTimeMs.value;
});
// ----------------------------

const replayTitle = computed(() => replay.value?.mapName ?? '未知地图');

const currentTimeMs = computed(() => currentPlaybackTimeMs.value);

const totalTimeMs = computed(() => {
  if (!safeFrames.value.length) return 0;
  return safeFrames.value[safeFrames.value.length - 1]?.timeMs ?? 0;
});


watch(currentPlaybackTimeMs, (newTime) => {
  const framesArr = safeFrames.value;
  if (!framesArr.length) return;

  // During dragging, use incremental frame selection for smoother transitions
  if (isDraggingTimeline.value) {
    const currentTime = framesArr[currentFrameIndex.value]?.timeMs ?? 0;
    const timeDiff = newTime - currentTime;
    
    // If time difference is small, search nearby frames instead of binary search
    if (Math.abs(timeDiff) < 5000) { // Within 5 seconds
      if (timeDiff > 0) {
        // Moving forward - search incrementally
        for (let i = currentFrameIndex.value; i < framesArr.length; i++) {
          if (framesArr[i].timeMs > newTime) {
            currentFrameIndex.value = Math.max(0, i - 1);
            return;
          }
        }
        currentFrameIndex.value = framesArr.length - 1;
        return;
      } else if (timeDiff < 0) {
        // Moving backward - search incrementally
        for (let i = currentFrameIndex.value; i >= 0; i--) {
          if (framesArr[i].timeMs <= newTime) {
            currentFrameIndex.value = i;
            return;
          }
        }
        currentFrameIndex.value = 0;
        return;
      }
    }
  }

  // Use binary search for normal playback or large jumps
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

const hpPercentage = (health: number | null | undefined) => {
  if (health == null || Number.isNaN(health)) return 0;
  return Math.max(0, Math.min(100, health));
};

const getWeaponIconPath = (weaponId: any) => {
  if (weaponId === undefined || weaponId === null) return '/weapons/default.svg';
  
  const id = Number(weaponId);
  const fileName = EQUIPMENT_ID_MAP[id];
  
  if (!fileName) return '/weapons/default.svg';

  // 只有手雷、C4和刀在 utility 目录下，其他武器都在 weapons 目录下
  const isUtilityFolder = (id >= 501 && id <= 506) || id === 404 || id === 405;
  const folder = isUtilityFolder ? 'utility' : 'weapons';
  return `/${folder}/${fileName}.svg`;
};

const onWeaponIconError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  // 如果加载失败，使用默认图标
  img.src = '/weapons/default.svg'; // 使用默认图标
};

const onLogoError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  // 如果 logo 加载失败，隐藏图标
  img.style.display = 'none';
};

const onUpdateSpeed = (value: number) => {
  playbackSpeed.value = value;
};

// Load specific round data from IndexedDB
const loadRoundData = async (roundNumber: number) => {
  if (!replay.value?.uuid) {
    console.warn('[LoadRoundData] No replay UUID available');
    return;
  }
  
  console.log(`[LoadRoundData] Loading round ${roundNumber} data`);
  
  try {
    // Open IndexedDB
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('CS2ReplayDB', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    // Load the specific round
    const roundKey = `${replay.value.uuid}_${roundNumber}`;
    const roundData = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction('replayRounds', 'readonly');
      const store = tx.objectStore('replayRounds');
      const request = store.get(roundKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    if (roundData && roundData.frames && roundData.frames.length > 0) {
      // Replace current frames with this round's frames
      frames.value = roundData.frames;
      
      // Reset to first frame of this round
      currentFrameIndex.value = 0;
      currentPlaybackTimeMs.value = roundData.frames[0].timeMs;
      
      // Pause playback
      isPlaying.value = false;
      cancelAnimation();
      
      console.log(`[LoadRoundData] Loaded round ${roundNumber} with ${roundData.frames.length} frames`);
    } else {
      console.warn(`[LoadRoundData] No frames found for round ${roundNumber}`);
    }
  } catch (error) {
    console.error(`[LoadRoundData] Error loading round ${roundNumber}:`, error);
  }
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
  flex: 1;
  height: 100%;
  width: 100%;
  min-height: 0;
}

.map-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.map-header {
  padding: 8px 16px;
  border-bottom: 1px solid #333;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.4);
  height: 60px;
  backdrop-filter: blur(10px);
}

.header-left {
  font-size: 13px;
  color: #aaa;
  width: 120px;
}

.top-players-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.team-horizontal-group {
  display: flex;
  gap: 8px;
}

.player-card-mini {
  width: 110px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  padding: 4px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative; /* 为盖章定位 */
  overflow: hidden;
  transition: all 0.3s ease;
}

.player-card-mini.is-dead {
  opacity: 0.6;
  filter: grayscale(0.8);
}

.player-main-info {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  font-size: 11px;
}

.p-identity {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-width: 70px;
}

.p-name {
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.p-kda {
  font-size: 9px;
  color: #888;
  font-weight: 500;
}

.p-money {
  color: #4ade80;
  font-weight: bold;
}

.p-status-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.p-hp-bar {
  flex: 1;
  height: 10px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 2px;
  position: relative;
  overflow: hidden;
}

.hp-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.hp-fill.ct { background: #3b82f6; }
.hp-fill.t { background: #f97316; }

.hp-val {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 8px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 0 2px #000;
}

.p-equipment-icons {
  display: flex;
  align-items: center;
}

.weapon-mini {
  width: 18px;
  height: 9px;
  object-fit: contain;
}

/* 击杀回传 (Kill Feed) 样式 */
.kill-feed-container {
  position: absolute;
  top: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  z-index: 100;
  pointer-events: none;
}

.kill-card {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 4px 12px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
}

.k-killer.ct, .k-victim.ct { color: #60a5fa; }
.k-killer.t, .k-victim.t { color: #fb923c; }

.k-assist {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
}

.k-assist .plus {
  margin-right: 2px;
  color: #aaa;
  font-size: 9px;
}

.k-weapon-box {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 2px;
  display: flex;
  align-items: center;
}

.k-weapon-icon {
  width: 28px;
  height: 14px;
  object-fit: contain;
  filter: brightness(0) invert(1);
}

/* 动画：从下方入队 */
.list-enter-active,
.list-leave-active {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.list-enter-from {
  opacity: 0;
  transform: translateY(20px);
}
.list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.match-score-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 20px;
  font-weight: 800;
  font-size: 18px;
}

.score-val.ct { color: #60a5fa; }
.score-val.t { color: #fb923c; }
.score-divider { color: #555; }

.map-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.map-canvas-wrapper {
  flex: 1;
  position: relative;
}

.timeline-panel {
  height: 160px;
  flex-shrink: 0;
  padding: 12px;
  border-top: 1px solid #333;
  background: rgba(0, 0, 0, 0.3);
}

.empty-state {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000000;
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