<template>
  <div ref="host" class="map-canvas-element"></div>
  <div v-if="hoverPlayer" class="player-tooltip" :style="tooltipStyle">
    <div class="name">{{ hoverPlayer.name }}</div>
    <div class="meta">
      <span :class="['team', hoverPlayer.team === 3 ? 'ct' : 't']">
        {{ hoverPlayer.team === 3 ? 'CT' : 'T' }}
      </span>
      <span>{{ hoverPlayer.alive ? '存活' : '已阵亡' }}</span>
    </div>
    <div class="meta">
      <span>X: {{ hoverPlayer.x.toFixed(1) }}</span>
      <span>Y: {{ hoverPlayer.y.toFixed(1) }}</span>
      <span>Yaw: {{ hoverPlayer.yaw.toFixed(1) }}°</span>
    </div>
  </div>
  <!-- Drawing Board -->
  <DrawingBoard
    :active="isDrawingMode || false"
    :getBackgroundCanvas="getCanvasForDrawing"
    @close="emit('close-drawing')"
  />

  <!-- Map Zoom Controls -->
  <div class="map-zoom-controls">
    <button class="zoom-btn" @click="zoomIn" title="放大">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
    <button class="zoom-btn" @click="zoomOut" title="缩小">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
    <button class="zoom-btn reset-btn" @click="resetZoom" title="重置视图">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
        <polyline points="3 3 3 8 8 8"></polyline>
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Application, Assets, Container, Sprite } from 'pixi.js';
import type { Frame, PlayerState, ProjectileState, WorldBounds, ProjectileRenderConfig, DroppedEquipment } from '@/types/replay';
import { MAP_CONFIGS, DEFAULT_MAP } from '@/config/map';
import { MATCH_CONFIG, getDisplayTeam, isSecondHalf } from '@/config/game';
import { useMapConfig } from '@/composables/useMapConfig';
import {
  clearProjectilesLayer,
  drawProjectilesForFrame as drawProjectilesForFrameExternal,
  drawBombForFrame,
  preloadProjectileAssets,
} from '../../composables/projectilesRender';
import {
  drawPlayersForFrame as drawPlayersForFrameExternal,
  stopPlayerAnimation,
  resetPlayerRenderer,
} from '../../composables/playersRender';
import DrawingBoard from './DrawingBoard.vue';

const props = defineProps<{
  frames: Frame[] | undefined;
  bounds: WorldBounds | null | undefined;
  currentFrameIndex: number;
  replayMeta?: any; // Add replayMeta prop
  isPlaying?: boolean;
  isDragging?: boolean;
  mapName?: string;
  projectileConfigs?: Record<number, ProjectileRenderConfig>;
  isDrawingMode?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close-drawing'): void;
}>();

// 根据传入的地图名称动态获取配置
const currentMapName = computed(() => {
  const name = props.mapName || DEFAULT_MAP;
  console.log('[MapCanvas] 当前地图名称:', name);
  return name;
});

const currentMapConfig = computed(() => {
  const config = MAP_CONFIGS[currentMapName.value] || MAP_CONFIGS[DEFAULT_MAP];
  console.log('[MapCanvas] 当前地图配置:', config.name);
  return config;
});

const mapTextureUrl = computed(() => currentMapConfig.value.imageUrl);

const host = ref<HTMLDivElement | null>(null);
let app: Application | null = null;
let worldContainer: Container | null = null;
let playerLayer: Container | null = null;
let projectileLayer: Container | null = null;
let mapSprite: Sprite | null = null;

const state = reactive({
  dragging: false,
  dragStartX: 0,
  dragStartY: 0,
  containerStartX: 0,
  containerStartY: 0,
  scale: 0.3,
  defaultScale: 0.3, // Track the default scale for zoom limits
});

const hoverPlayer = ref<PlayerState | null>(null);
const hoverScreenPos = reactive({ x: 0, y: 0 });

const tooltipStyle = computed(() => ({
  left: `${hoverScreenPos.x}px`,
  top: `${hoverScreenPos.y}px`,
}));

const worldToMap = (x: number, y: number) => {
  if (!mapSprite) return { x: 0, y: 0 };
  
  const { mapRange } = useMapConfig(currentMapName.value);
  const X_MIN = mapRange.value.xMin;
  const X_MAX = mapRange.value.xMax;
  const Y_MIN = mapRange.value.yMin;
  const Y_MAX = mapRange.value.yMax;
  
  const xRange = mapRange.value.xRange;
  const yRange = mapRange.value.yRange;
  
  const mapWidth = mapSprite.width;
  const mapHeight = mapSprite.height;

  const normalizedX = (x - (X_MIN + X_MAX) / 2) / xRange; 
  const normalizedY = (y - (Y_MIN + Y_MAX) / 2) / yRange;
  
  const pixelX = normalizedX * mapWidth;
  const pixelY = -normalizedY * mapHeight;
  
  return { x: pixelX, y: pixelY };
};

const ensureApp = async () => {
  if (!host.value || app) return;

  app = new Application();
  await app.init({
    resizeTo: host.value,
    backgroundAlpha: 0,
    antialias: true,
    preserveDrawingBuffer: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  host.value.appendChild(app.canvas);

  worldContainer = new Container();
  app.stage.addChild(worldContainer);

  const texture = await Assets.load(mapTextureUrl.value);
  mapSprite = new Sprite(texture);
  mapSprite.anchor.set(0.5);
  mapSprite.width = currentMapConfig.value.width;
  mapSprite.height = currentMapConfig.value.height;

  mapSprite.position.set(0, 0);
  worldContainer.addChild(mapSprite);

  playerLayer = new Container();
  worldContainer.addChild(playerLayer);

  projectileLayer = new Container();
  worldContainer.addChild(projectileLayer);

  worldContainer.eventMode = 'static';
  worldContainer.cursor = 'grab';

  (worldContainer as any).on('pointerdown', onPointerDown);
  (worldContainer as any).on('pointerup', onPointerUp);
  (worldContainer as any).on('pointerupoutside', onPointerUp);
  (worldContainer as any).on('pointermove', onPointerMove);

  app.stage.eventMode = 'static';

  host.value.addEventListener('wheel', onWheel, { passive: false });

  // 监听容器大小变化，实现自适应缩放
  setupResizeObserver();

  centerWorld(true);
};

let resizeObserver: ResizeObserver | null = null;
const setupResizeObserver = () => {
  if (!host.value || resizeObserver) return;
  
  resizeObserver = new ResizeObserver(() => {
    // 当容器大小变化时，重新居中地图
    // PIXI 的 resizeTo 会自动调整画布大小，我们这里处理内容的缩放和位置
    if (app && worldContainer && mapSprite) {
      centerWorld(false);
    }
  });
  
  resizeObserver.observe(host.value);
};

const centerWorld = (forceFit = false) => {
  if (!app || !worldContainer || !mapSprite) return;
  const { width, height } = app.renderer.screen;
  
  if (width === 0 || height === 0) return;

  const fitScale = Math.min(width / mapSprite.width, height / mapSprite.height);
  
  // 记录之前的缩放状态
  const wasAtDefault = Math.abs(state.scale - state.defaultScale) < 0.01;
  
  // 更新默认缩放比例（最小缩放比例）
  state.defaultScale = fitScale;
  
  // 如果是强制适配，或者之前处于默认缩放状态，或者当前缩放小于新的最小缩放，则自动调整缩放
  if (forceFit || wasAtDefault || state.scale < fitScale) {
    state.scale = fitScale;
  }
  
  worldContainer.scale.set(state.scale);
  worldContainer.position.set(width / 2, height / 2);
};

const onPointerDown = (event: any) => {
  if (!worldContainer) return;
  state.dragging = true;
  worldContainer.cursor = 'grabbing';
  state.dragStartX = event.global.x;
  state.dragStartY = event.global.y;
  state.containerStartX = worldContainer.position.x;
  state.containerStartY = worldContainer.position.y;
};

const onPointerUp = () => {
  if (!worldContainer) return;
  state.dragging = false;
  worldContainer.cursor = 'grab';
};

const onPointerMove = (event: any) => {
  if (!worldContainer || !state.dragging) return;
  const dx = event.global.x - state.dragStartX;
  const dy = event.global.y - state.dragStartY;
  worldContainer.position.set(state.containerStartX + dx, state.containerStartY + dy);
};

const onWheel = (event: WheelEvent) => {
  if (!worldContainer || !app) return;
  event.preventDefault();

  const delta = event.deltaY > 0 ? -0.1 : 0.1;
  // Prevent zooming below 100% (default scale)
  const newScale = Math.min(1.5, Math.max(state.defaultScale, state.scale + delta));

  const rect = app.canvas.getBoundingClientRect();
  const pivotX = event.clientX - rect.left;
  const pivotY = event.clientY - rect.top;

  const worldPosBefore = {
    x: (pivotX - worldContainer.position.x) / state.scale,
    y: (pivotY - worldContainer.position.y) / state.scale,
  };

  state.scale = newScale;
  worldContainer.scale.set(state.scale);

  const worldPosAfter = {
    x: worldPosBefore.x * state.scale,
    y: worldPosBefore.y * state.scale,
  };

  worldContainer.position.x = pivotX - worldPosAfter.x;
  worldContainer.position.y = pivotY - worldPosAfter.y;
};

const zoomBy = (delta: number) => {
  if (!worldContainer || !app) return;
  
  const newScale = Math.min(1.5, Math.max(state.defaultScale, state.scale + delta));
  if (Math.abs(newScale - state.scale) < 0.001) return;

  // Zoom towards the center of the screen
  const pivotX = app.renderer.screen.width / 2;
  const pivotY = app.renderer.screen.height / 2;

  const worldPosBefore = {
    x: (pivotX - worldContainer.position.x) / state.scale,
    y: (pivotY - worldContainer.position.y) / state.scale,
  };

  state.scale = newScale;
  worldContainer.scale.set(state.scale);

  const worldPosAfter = {
    x: worldPosBefore.x * state.scale,
    y: worldPosBefore.y * state.scale,
  };

  worldContainer.position.x = pivotX - worldPosAfter.x;
  worldContainer.position.y = pivotY - worldPosAfter.y;
};

const zoomIn = () => zoomBy(0.1);
const zoomOut = () => zoomBy(-0.1);
const resetZoom = () => centerWorld(true);

const clearProjectiles = () => {
  clearProjectilesLayer(projectileLayer);
};

const onPlayerPointerOver = (e: any, p: PlayerState) => {
  if (props.isPlaying) return;
  hoverPlayer.value = p;
  const global = e.global;
  hoverScreenPos.x = global.x;
  hoverScreenPos.y = global.y;
};

const onPlayerPointerMove = (e: any, p: PlayerState) => {
  if (!hoverPlayer.value || hoverPlayer.value.id !== p.id || props.isPlaying) return;
  hoverScreenPos.x = e.global.x;
  hoverScreenPos.y = e.global.y;
};

const onPlayerPointerOut = (p: PlayerState) => {
  if (hoverPlayer.value && hoverPlayer.value.id === p.id) {
    hoverPlayer.value = null;
  }
};

const drawProjectilesForFrame = async (
  projectiles: Record<number, ProjectileState> | undefined, 
  players: PlayerState[],
  sortedProjs?: number[],
  droppedEquipment?: DroppedEquipment[],
  timeMs?: number,
  currentRound?: number
) => {
  await drawProjectilesForFrameExternal({
    projectiles,
    players,
    projectileLayer,
    mapSprite,
    worldToMap,
    projectileConfigs: props.projectileConfigs,
    sortedProjs,
    droppedEquipment,
    timeMs,
    currentRound,
  });
};

const drawPlayersForFrame = () => {
  if (!playerLayer || !mapSprite || !props.frames) return;
  const frame = props.frames[props.currentFrameIndex];
  if (!frame) return;

  // Clear projectiles (they don't need smooth transitions)
  clearProjectiles();

  // Draw players using external renderer
  drawPlayersForFrameExternal({
    frame,
    meta: props.replayMeta,
    playerLayer,
    currentFrameIndex: props.currentFrameIndex,
    isPlaying: props.isPlaying || false,
    isDragging: props.isDragging || false,
    worldToMap,
    onPlayerPointerOver,
    onPlayerPointerMove,
    onPlayerPointerOut,
  });

  // Draw projectiles if present
  if (frame.projectiles || frame.droppedEquipment) {
    // Convert players map to array with metadata enrichment for projectiles renderer
    const playersArray: PlayerState[] = [];
    if (frame.players && props.replayMeta?.serverPlayer) {
      // Determine if we're in second half for team flipping
      const currentRound = frame.round;
      const secondHalf = isSecondHalf(currentRound);

      // Enrich frame players with metadata from serverPlayer
      for (const playerInfo of props.replayMeta.serverPlayer) {
        const frameData = frame.players[playerInfo.id];
        if (frameData) {
          // Keep original team, let color functions handle second half flipping
          playersArray.push({
            ...frameData,
            id: playerInfo.id,
            name: playerInfo.name,
            team: playerInfo.team, // Use original team, color functions handle flipping
            steamID: playerInfo.steamID,
            isBot: playerInfo.isBot
          });
        }
      }
    } else if (frame.players) {
      // Fallback for backward compatibility
      playersArray.push(...Object.entries(frame.players).map(([id, frameData]) => ({
        ...frameData,
        id: Number(id)
      })));
    }
    
    drawProjectilesForFrame(
      frame.projectiles, 
      playersArray, 
      frame.sortedProjs,
      frame.droppedEquipment,
      frame.timeMs,
      frame.round // Pass current round for team color flipping
    );
  }

  // Draw planted bomb if present
  if (frame.bomb) {
    drawBombForFrame({
      bomb: frame.bomb,
      roundTime: frame.roundTime,
      projectileLayer,
      worldToMap,
    });
  }
};

const getCanvasForDrawing = () => {
  return app?.canvas || null;
};

// 暴露获取 Canvas 方法供截图使用
defineExpose({
  getCanvas: () => app?.canvas || null
});

watch(
  () => props.currentFrameIndex,
  () => {
    // 只在帧索引变化时重绘，不监听frames变化
    if (props.frames && props.frames.length > 0) {
      drawPlayersForFrame();
    }
  },
);

// Watch isPlaying prop to stop animation when paused
watch(
  () => props.isPlaying,
  (playing) => {
    if (!playing) {
      stopPlayerAnimation();
    }
  }
);

// 单独监听frames变化，但使用防抖
let framesChangeTimer: number | null = null;
watch(
  () => props.frames,
  (newFrames) => {
    if (framesChangeTimer) {
      clearTimeout(framesChangeTimer);
    }
    // 防抖：延迟10ms执行，避免频繁重绘
    framesChangeTimer = setTimeout(() => {
      if (newFrames && newFrames.length > 0) {
        drawPlayersForFrame();
      }
      framesChangeTimer = null;
    }, 10) as unknown as number;
  },
);

watch(
  () => props.mapName,
  async (newMapName, oldMapName) => {
    if (newMapName !== oldMapName && app && worldContainer) {
      console.log('[MapCanvas] 地图切换:', oldMapName, '->', newMapName);
      
      if (mapSprite) {
        worldContainer.removeChild(mapSprite);
      }
      
      // 使用缓存加载纹理，Assets.load 会自动缓存
      const texture = await Assets.load(mapTextureUrl.value);
      mapSprite = new Sprite(texture);
      mapSprite.anchor.set(0.5);
      mapSprite.width = currentMapConfig.value.width;
      mapSprite.height = currentMapConfig.value.height;
      mapSprite.position.set(0, 0);
      worldContainer.addChildAt(mapSprite, 0);
      
      // 使用 requestAnimationFrame 延迟重绘，让地图先显示
      requestAnimationFrame(() => {
        centerWorld();
        drawPlayersForFrame();
      });
    }
  },
  { immediate: false }
);

onMounted(async () => {
  await ensureApp();
  // 预加载 SVG 资源到前端缓存，避免播放过程中频繁请求
  preloadProjectileAssets();
  drawPlayersForFrame();
});

onBeforeUnmount(() => {
  if (host.value) {
    host.value.removeEventListener('wheel', onWheel);
  }
  
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  
  // 清理定时器
  if (framesChangeTimer) {
    clearTimeout(framesChangeTimer);
    framesChangeTimer = null;
  }
  
  // Stop smooth animation and clear player sprites
  stopPlayerAnimation();
  resetPlayerRenderer();
  
  if (app) {
    app.destroy(true, { children: true });
    app = null;
    worldContainer = null;
    playerLayer = null;
    mapSprite = null;
  }
});
</script>

<style scoped>
.map-canvas-element {
  width: 100%;
  height: 100%;
  position: relative;
}

.map-zoom-controls {
  position: absolute;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 100;
}

.zoom-btn {
  width: 36px;
  height: 36px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.zoom-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateY(-2px);
}

.zoom-btn:active {
  transform: translateY(0);
}

.reset-btn {
  margin-top: 4px;
  background: rgba(59, 130, 246, 0.6); /* Blueish for reset */
}

.reset-btn:hover {
  background: rgba(59, 130, 246, 0.8);
}

.player-tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 8px 12px;
  color: white;
  pointer-events: none;
  z-index: 1000;
  transform: translate(10px, 10px);
  min-width: 120px;
}

.player-tooltip .name {
  font-weight: bold;
  font-size: 14px;
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 2px;
}

.player-tooltip .meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 2px;
}

.player-tooltip .team.ct {
  color: #60a5fa;
  font-weight: bold;
}

.player-tooltip .team.t {
  color: #fb923c;
  font-weight: bold;
}
</style>
