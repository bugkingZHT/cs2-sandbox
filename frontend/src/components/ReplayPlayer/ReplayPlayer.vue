<template>
  <div class="viewer-layout">
    <!-- Main Content: Map and Timeline -->
    <section class="map-panel">
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
          :replay-meta="replay"
          :is-playing="isPlaying"
          :is-dragging="isDraggingTimeline"
          :map-name="replay?.mapName"
          :projectile-configs="replay?.projectileRenderConfig"
          :is-drawing-mode="isDrawingMode"
          @close-drawing="isDrawingMode = false"
        />

        <!-- 击杀回传 (Kill Feed) -->
        <div class="kill-feed-container">
          <TransitionGroup name="list">
            <div v-for="k in currentRoundKills" :key="k.victimId" class="kill-feed-item">
              <div class="kill-card">
                <span class="k-killer" :class="getTeamClass(k.killerId)">{{ playerNameMap[k.killerId] || 'Unknown' }}</span>
                <span v-if="k.assistantId" class="k-assist" :class="getTeamClass(k.assistantId)">
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

        <!-- Player Cards Panel (Top Left) -->
        <div class="players-panel top-left">
          <!-- First Half (1-12): T Team on top, Second Half (13+): CT Team on top -->
          
          <!-- First Team (T for rounds 1-12, CT for rounds 13+) -->
          <div v-if="currentRound <= 12" class="team-cards-container t">
            <div v-for="p in teamTPlayers" :key="p.id" class="player-card-bottom t" :class="{ 'is-dead': !p.alive }" :style="getCardBackgroundStyle(p, 't')">
              <div class="player-info-row">
                <span class="p-name">{{ p.name }}</span>
                <span class="p-money">${{ p.money }}</span>
              </div>
              <div class="p-stats-row">
                <div class="p-kda">{{ p.kills || 0 }}/{{ p.assists || 0 }}/{{ p.deaths || 0 }}</div>
                <div class="p-hp-text">{{ Math.round(p.health || 0) }}</div>
              </div>
              <!-- All Equipment -->
              <div class="p-all-equipment">
                <img 
                  v-for="(item, idx) in getAllEquipment(p)" 
                  :key="idx"
                  :src="getWeaponIconPath(item)" 
                  class="equipment-icon"
                  :class="{ 'is-active': isEquipmentActive(p, item, idx) }"
                  :title="getEquipmentName(item)"
                  @error="onWeaponIconError"
                />
              </div>
            </div>
          </div>
          <div v-else class="team-cards-container ct">
            <div v-for="p in teamCTPlayers" :key="p.id" class="player-card-bottom ct" :class="{ 'is-dead': !p.alive }" :style="getCardBackgroundStyle(p, 'ct')">
              <div class="player-info-row">
                <span class="p-name">{{ p.name }}</span>
                <span class="p-money">${{ p.money }}</span>
              </div>
              <div class="p-stats-row">
                <div class="p-kda">{{ p.kills || 0 }}/{{ p.assists || 0 }}/{{ p.deaths || 0 }}</div>
                <div class="p-hp-text">{{ Math.round(p.health || 0) }}</div>
              </div>
              <!-- All Equipment -->
              <div class="p-all-equipment">
                <img 
                  v-for="(item, idx) in getAllEquipment(p)" 
                  :key="idx"
                  :src="getWeaponIconPath(item)" 
                  class="equipment-icon"
                  :class="{ 'is-active': isEquipmentActive(p, item, idx) }"
                  :title="getEquipmentName(item)"
                  @error="onWeaponIconError"
                />
              </div>
            </div>
          </div>

          <!-- Team Divider -->
          <div class="team-divider"></div>

          <!-- Second Team (CT for rounds 1-12, T for rounds 13+) -->
          <div v-if="currentRound <= 12" class="team-cards-container ct">
            <div v-for="p in teamCTPlayers" :key="p.id" class="player-card-bottom ct" :class="{ 'is-dead': !p.alive }" :style="getCardBackgroundStyle(p, 'ct')">
              <div class="player-info-row">
                <span class="p-name">{{ p.name }}</span>
                <span class="p-money">${{ p.money }}</span>
              </div>
              <div class="p-stats-row">
                <div class="p-kda">{{ p.kills || 0 }}/{{ p.assists || 0 }}/{{ p.deaths || 0 }}</div>
                <div class="p-hp-text">{{ Math.round(p.health || 0) }}</div>
              </div>
              <!-- All Equipment -->
              <div class="p-all-equipment">
                <img 
                  v-for="(item, idx) in getAllEquipment(p)" 
                  :key="idx"
                  :src="getWeaponIconPath(item)" 
                  class="equipment-icon"
                  :class="{ 'is-active': isEquipmentActive(p, item, idx) }"
                  :title="getEquipmentName(item)"
                  @error="onWeaponIconError"
                />
              </div>
            </div>
          </div>
          <div v-else class="team-cards-container t">
            <div v-for="p in teamTPlayers" :key="p.id" class="player-card-bottom t" :class="{ 'is-dead': !p.alive }" :style="getCardBackgroundStyle(p, 't')">
              <div class="player-info-row">
                <span class="p-name">{{ p.name }}</span>
                <span class="p-money">${{ p.money }}</span>
              </div>
              <div class="p-stats-row">
                <div class="p-kda">{{ p.kills || 0 }}/{{ p.assists || 0 }}/{{ p.deaths || 0 }}</div>
                <div class="p-hp-text">{{ Math.round(p.health || 0) }}</div>
              </div>
              <!-- All Equipment -->
              <div class="p-all-equipment">
                <img 
                  v-for="(item, idx) in getAllEquipment(p)" 
                  :key="idx"
                  :src="getWeaponIconPath(item)" 
                  class="equipment-icon"
                  :class="{ 'is-active': isEquipmentActive(p, item, idx) }"
                  :title="getEquipmentName(item)"
                  @error="onWeaponIconError"
                />
              </div>
            </div>
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
        :round-results="replay?.roundResults || []"
        :replay-meta="replay"
        :is-drawing-mode="isDrawingMode"
        @seek-seconds="onSeekSeconds"
        @toggle-play="togglePlay"
        @toggle-drawing="onToggleDrawing"
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
import { MATCH_CONFIG, getDisplayTeam } from '@/config/game';

const emit = defineEmits<{
  (e: 'exit-replay'): void;
}>();

const { loading, error, replay, frames, bounds, loadRoundData: loadRoundDataFromDB } = useReplayData();

const currentFrameIndex = ref(0);
const currentPlaybackTimeMs = ref(0);
const isPlaying = ref(false);
const playbackSpeed = ref(1);
const isDraggingTimeline = ref(false);
const wasPlayingBeforeDrag = ref(false);

// Pre-built kill list for current round (optimized for display)
interface KillEventWithFrame {
  frameIndex: number;
  victimId: number;
  killerId: number;
  assistantId: number;
  weaponId: string;
}
const roundKillList = ref<KillEventWithFrame[]>([]);
const isDrawingMode = ref(false);
const mapCanvasRef = ref<any>(null);

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
  };
};

// Build kill list from frames (called when round data is loaded)
const buildKillList = (framesArray: Frame[]) => {
  const killList: KillEventWithFrame[] = [];
  const seenVictims = new Set<number>();
  
  framesArray.forEach((frame, frameIndex) => {
    if (frame.killEvents) {
      for (const victimIdStr in frame.killEvents) {
        const victimId = parseInt(victimIdStr);
        if (!seenVictims.has(victimId)) {
          seenVictims.add(victimId);
          const killEvent = frame.killEvents[victimId];
          killList.push({
            frameIndex,
            victimId,
            killerId: killEvent.killerId,
            assistantId: killEvent.assistantId,
            weaponId: killEvent.weaponId
          });
        }
      }
    }
  });
  
  roundKillList.value = killList;
  console.log(`[ReplayPlayer] Built kill list with ${killList.length} events`);
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
      
      // Build kill list for the round
      buildKillList(data.frames);
      
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
  const frame = currentFrame.value;
  if (!frame?.players || !replay.value?.serverPlayer) return [];
  
  // Use sorted player IDs from replay.serverPlayer
  const result: PlayerState[] = [];
  for (const playerInfo of replay.value.serverPlayer) {
    const displayTeam = getDisplayTeam(playerInfo.team, currentRound.value);
    if (displayTeam !== 3) continue; // Display as CT only
    
    const frameData = frame.players[playerInfo.id];
    if (!frameData) continue; // Skip if player not in this frame
    
    // Merge metadata with frame data, using display team for styling
    result.push({
      ...frameData,
      id: playerInfo.id,
      name: playerInfo.name,
      team: displayTeam, // Use display team
      steamID: playerInfo.steamID,
      isBot: playerInfo.isBot
    });
  }
  return result;
});

const teamTPlayers = computed<PlayerState[]>(() => {
  const frame = currentFrame.value;
  if (!frame?.players || !replay.value?.serverPlayer) return [];
  
  // Use sorted player IDs from replay.serverPlayer
  const result: PlayerState[] = [];
  for (const playerInfo of replay.value.serverPlayer) {
    const displayTeam = getDisplayTeam(playerInfo.team, currentRound.value);
    if (displayTeam !== 2) continue; // Display as T only
    
    const frameData = frame.players[playerInfo.id];
    if (!frameData) continue; // Skip if player not in this frame
    
    // Merge metadata with frame data, using display team for styling
    result.push({
      ...frameData,
      id: playerInfo.id,
      name: playerInfo.name,
      team: displayTeam, // Use display team
      steamID: playerInfo.steamID,
      isBot: playerInfo.isBot
    });
  }
  return result;
});

// 计算所有玩家 ID 到名称的映射，用于击杀信息显示
const playerNameMap = computed(() => {
  const map: Record<number, string> = {};
  
  // Use serverPlayer from replay metadata for player names
  if (replay.value?.serverPlayer) {
    for (const playerInfo of replay.value.serverPlayer) {
      map[playerInfo.id] = playerInfo.name;
    }
  }
  
  return map;
});

// --- 新增：当前回合数据计算 ---
const currentRound = computed(() => {
  if (!safeFrames.value.length) return 0;
  return safeFrames.value[currentFrameIndex.value]?.round || 0;
});

// 判断是否在后半场（使用配置中的常量）
const isSecondHalf = computed(() => {
  return currentRound.value >= MATCH_CONFIG.SECOND_HALF_START_ROUND;
});

const currentRoundFrames = computed(() => {
  if (!safeFrames.value.length || currentRound.value === 0) return [];
  return safeFrames.value.filter(f => f.round === currentRound.value);
});

// 计算当前回合按时间顺序排列的击杀列表（最多显示 100 个，先进先出）
// 优化版本：使用预构建的 roundKillList，只需比较 frameIndex
const currentRoundKills = computed(() => {
  const currentIdx = currentFrameIndex.value;
  
  // 过滤出 frameIndex <= currentFrameIndex 的击杀事件
  const visibleKills = roundKillList.value.filter(kill => kill.frameIndex <= currentIdx);
  
  // 限制最多显示 100 个击杀事件（FIFO 队列：保留最新的 100 个）
  const MAX_KILL_FEED_SIZE = 100;
  if (visibleKills.length > MAX_KILL_FEED_SIZE) {
    return visibleKills.slice(-MAX_KILL_FEED_SIZE);
  }
  
  return visibleKills;
});

// 获取玩家阵营对应的 CSS 类（后半场翻转）
const getTeamClass = (playerId: number) => {
  // Use serverPlayer metadata to get team info
  if (replay.value?.serverPlayer) {
    const playerInfo = replay.value.serverPlayer.find(p => p.id === playerId);
    if (playerInfo) {
      // Get display team (flipped in second half)
      const displayTeam = getDisplayTeam(playerInfo.team, currentRound.value);
      return displayTeam === 3 ? 'ct' : 't';
    }
  }
  return '';
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
  
  // If we are in drawing mode, close it when playing
  if (isDrawingMode.value) {
    isDrawingMode.value = false;
  }

  isPlaying.value = !isPlaying.value;
  if (isPlaying.value) {
    startAnimation();
  } else {
    cancelAnimation();
  }
};

const onToggleDrawing = () => {
  isDrawingMode.value = !isDrawingMode.value;
  if (isDrawingMode.value && isPlaying.value) {
    // Pause when entering drawing mode
    isPlaying.value = false;
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

// Get card background style with health-based progress bar
const getCardBackgroundStyle = (player: PlayerState, team: 'ct' | 't') => {
  if (!player.alive) return {}; // Dead players don't show progress
  
  const healthPercent = hpPercentage(player.health);
  
  // Team colors - more subtle, matching DemoLib style
  const colors = {
    ct: {
      start: 'rgba(59, 130, 246, 0.15)',   // Subtle blue
      end: 'rgba(59, 130, 246, 0.25)',
      dark: 'rgba(0, 0, 0, 0.7)'
    },
    t: {
      start: 'rgba(249, 115, 22, 0.15)',   // Subtle orange
      end: 'rgba(249, 115, 22, 0.25)',
      dark: 'rgba(0, 0, 0, 0.7)'
    }
  };
  
  const teamColors = colors[team];
  
  // Create gradient: team color for health portion, dark for remaining
  return {
    background: `linear-gradient(to right, 
      ${teamColors.start} 0%, 
      ${teamColors.end} ${healthPercent}%, 
      ${teamColors.dark} ${healthPercent}%, 
      ${teamColors.dark} 100%)`
  };
};

const getWeaponIconPath = (weaponId: any) => {
  if (weaponId === undefined || weaponId === null) return '/weapons/default.svg';
  
  const id = Number(weaponId);
  const fileName = EQUIPMENT_ID_MAP[id];
  
  if (!fileName) return '/weapons/default.svg';

  // 只有手雷和C4在 utility 目录下，其他武器（包括刀）都在 weapons 目录下
  const isUtilityFolder = (id >= 501 && id <= 506) || id === 404;
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

const isGrenadeOrBomb = (weaponId: any) => {
  const id = Number(weaponId);
  return (id >= 501 && id <= 506) || id === 404;
};

const getPlayerUtility = (player: PlayerState) => {
  if (!player.inventory) return [];
  return player.inventory
    .filter(id => isGrenadeOrBomb(id))
    .sort((a, b) => Number(b) - Number(a)); // Sort by ID descending typically puts C4/Flash/Smoke in common orders
};

// Get all equipment for a player (weapons + utilities + knife)
const getAllEquipment = (player: PlayerState) => {
  if (!player.inventory) return [];
  return player.inventory; // Show all equipment including knife
};

// Check if equipment at index should be highlighted as active
// Only the first item matching activeWeapon will be highlighted
const isEquipmentActive = (player: PlayerState, item: string, idx: number): boolean => {
  if (!player.activeWeapon) return false;
  const activeId = Number(player.activeWeapon);
  const itemId = Number(item);
  
  if (activeId !== itemId) return false;
  
  // Find the first index of this equipment type in inventory
  const firstMatchIndex = player.inventory?.findIndex(invItem => Number(invItem) === activeId) ?? -1;
  return idx === firstMatchIndex;
};

// Get equipment name for tooltip
const getEquipmentName = (equipmentId: string): string => {
  const id = Number(equipmentId);
  const fileName = EQUIPMENT_ID_MAP[id];
  return fileName || 'Unknown';
};

// Load specific round data from IndexedDB
const loadRoundData = async (roundNumber: number) => {
  if (!replay.value?.uuid) {
    console.warn('[LoadRoundData] No replay UUID available');
    return;
  }
  
  console.log(`[LoadRoundData] Loading round ${roundNumber} data`);
  
  // Pause playback during round switch
  const wasPlaying = isPlaying.value;
  if (wasPlaying) {
    isPlaying.value = false;
    cancelAnimation();
  }
  
  try {
    // Use the centralized loadRoundData from useReplayData
    await loadRoundDataFromDB(replay.value.uuid, roundNumber);
    
    // Reset to first frame of the loaded round
    currentFrameIndex.value = 0;
    currentPlaybackTimeMs.value = frames.value?.[0]?.timeMs || 0;
    
    console.log(`[LoadRoundData] Loaded round ${roundNumber} with ${frames.value?.length || 0} frames`);
    
    // Resume playback if it was playing before
    if (wasPlaying) {
      isPlaying.value = true;
      startAnimation();
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
/* === Layout === */
.viewer-layout {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  width: 100%;
  min-height: 0;
}

/* === Map Panel === */
.map-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* === Player Panels (Bottom Corners) === */
.players-panel {
  position: absolute;
  z-index: var(--ds-z-dropdown);
  pointer-events: none;
}

.players-panel.top-left {
  top: 50%; /* Vertical center */
  left: var(--ds-space-md);
  transform: translateY(-50%); /* Center adjustment */
  display: flex;
  flex-direction: column;
  gap: 0;
}

.team-cards-container {
  display: flex;
  flex-direction: column;
  gap: 4px; /* Reduced gap between cards */
  padding: 6px; /* Reduced padding */
  pointer-events: auto;
}

.team-divider {
  height: 2px;
  background: linear-gradient(
    to right,
    transparent 0%,
    rgba(255, 255, 255, 0.2) 20%,
    rgba(255, 255, 255, 0.2) 80%,
    transparent 100%
  );
  margin: 4px 6px; /* Reduced margin to match padding */
}

.player-card-bottom {
  width: 220px; /* Increased width for better equipment display */
  min-height: 60px; /* Increased height for better spacing */
  max-height: 60px;
  background: rgba(0, 0, 0, 0.7); /* Darker, matching DemoLib cards */
  backdrop-filter: blur(12px);
  border: 1px solid rgba(200, 200, 200, 0.3); /* 2px gray-white border */
  border-radius: var(--ds-radius-sm);
  padding: 6px 10px; /* Increased padding for more breathing room */
  display: flex;
  flex-direction: column;
  gap: 3px; /* Increased gap between rows */
  transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5); /* Deeper shadow like DemoLib */
  position: relative;
  overflow: hidden;
}

/* Remove team-specific border styling - all cards use same gray-white border */
.player-card-bottom.is-dead {
  opacity: 0.5;
  filter: grayscale(0.8);
}

.player-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  line-height: 1; /* Tight line height */
}

.p-name {
  font-weight: 700;
  font-size: 12px; /* Slightly smaller */
  color: var(--ds-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px; /* Increased for wider card */
  line-height: 1; /* Tight line height */
}

.p-money {
  color: var(--ds-primary);
  font-weight: bold;
  font-size: 10px; /* Smaller */
  line-height: 1; /* Tight line height */
  opacity: 0.9; /* Slightly dimmed */
}

.p-kda {
  font-size: 9px; /* Smaller */
  color: var(--ds-text-tertiary);
  font-weight: 500;
  line-height: 1; /* Tight line height */
  opacity: 0.8; /* Slightly dimmed */
}

.p-stats-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0; /* Remove any margin */
  line-height: 1; /* Tight line height */
}

.p-hp-text {
  font-size: 12px; /* Slightly smaller */
  font-weight: 700;
  color: var(--ds-text-primary);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  line-height: 1; /* Tight line height */
}

/* === Equipment Display === */
.p-all-equipment {
  display: flex;
  flex-wrap: wrap;
  gap: 3px; /* Increased gap for better spacing */
  min-height: 20px; /* Slightly increased to match icon size */
  padding: 0;
  align-items: center;
}

.equipment-icon {
  width: 20px; /* Slightly larger icons */
  height: 20px;
  object-fit: contain;
  opacity: 0.6;
  transition: all var(--ds-transition-base);
  filter: brightness(0.8);
  padding: 1px;
}

.equipment-icon.is-active {
  opacity: 1;
  filter: none;
  transform: scale(1.15); /* Slightly reduced scale */
}

/* === Kill Feed === */
.kill-feed-container {
  position: absolute;
  top: var(--ds-space-xl);
  right: var(--ds-space-xl);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--ds-space-xs);
  z-index: var(--ds-z-dropdown);
  pointer-events: none;
}

.kill-card {
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid var(--ds-border-subtle);
  padding: var(--ds-space-xs) var(--ds-space-md);
  border-radius: var(--ds-radius-sm);
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  box-shadow: var(--ds-shadow-lg);
  white-space: nowrap;
}

.k-killer, .k-victim {
  font-weight: 700;
}

.k-killer.ct, .k-victim.ct, .k-assist.ct { color: #60a5fa; }
.k-killer.t, .k-victim.t, .k-assist.t { color: #fb923c; }

.k-assist {
  font-size: var(--ds-text-xs);
  display: flex;
  align-items: center;
  font-weight: 400;
}

.k-assist .plus {
  margin-right: 2px;
  color: var(--ds-text-muted);
  font-size: 9px;
}

.k-weapon-box {
  background: var(--ds-surface-base);
  padding: 2px var(--ds-space-xs);
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

/* === Kill Feed Animation === */
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
  transform: translateY(-30px); /* 向上消失 */
}

.list-leave-active {
  position: absolute; /* 让离开的元素脱离文档流，其他元素可以平滑上移 */
  width: 100%;
}

.list-move {
  transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); /* 平滑移动到新位置 */
}

/* === Map Canvas === */
.map-main {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-width: 0;
  width: 100%;
}

.map-canvas-wrapper {
  flex: 1;
  position: relative;
  min-width: 0;
  width: 100%;
  height: 100%;
}

/* === Timeline === */
.timeline-panel {
  height: 100px;
  flex-shrink: 0;
  padding: var(--ds-space-md);
  border-top: 2px solid var(--ds-border-accent);
  background: var(--ds-bg-secondary);
}

/* === Empty State === */
.empty-state {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-bg-secondary);
}

.empty-state-content {
  text-align: center;
  padding: var(--ds-space-3xl);
  max-width: 400px;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: var(--ds-space-xl);
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
  font-size: var(--ds-text-xl);
  font-weight: 600;
  color: var(--ds-text-secondary);
  margin-bottom: var(--ds-space-md);
}

.empty-state-content p {
  font-size: var(--ds-text-base);
  color: var(--ds-text-tertiary);
  line-height: 1.6;
}
</style>