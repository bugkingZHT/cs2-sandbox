<template>
  <div ref="host" class="map-canvas-element"></div>
  <div
    v-if="hoverPlayer"
    class="player-tooltip"
    :style="tooltipStyle"
    @mouseenter="onTooltipMouseEnter"
    @mouseleave="onTooltipMouseLeave"
  >
    <div class="name">{{ hoverPlayer.name }}</div>
    <div class="meta">
      <span :class="['team', hoverPlayer.team === 3 ? 'ct' : 't']">
        {{ hoverPlayer.team === 3 ? 'CT' : 'T' }}
      </span>
      <span>{{ hoverPlayer.alive ? '存活' : '已阵亡' }}</span>
    </div>
    <div class="meta">
      <span>HP: {{ hoverPlayer.health ?? '-' }}</span>
      <span>Armor: {{ hoverPlayer.armor ?? '-' }}</span>
    </div>
    <div class="cmd-row" @click="copyText(setposCmd)">
      <code class="cmd-text">{{ setposCmd }}</code>
      <span class="cmd-copy" :class="{ copied: copiedField === 'setpos' }">{{ copiedField === 'setpos' ? '✓' : '复制' }}</span>
    </div>
    <div class="cmd-row" @click="copyText(setangCmd)">
      <code class="cmd-text">{{ setangCmd }}</code>
      <span class="cmd-copy" :class="{ copied: copiedField === 'setang' }">{{ copiedField === 'setang' ? '✓' : '复制' }}</span>
    </div>
  </div>
  <!-- Drawing Board -->
  <DrawingBoard
    :active="isDrawingMode || false"
    :getBackgroundCanvas="getCanvasForDrawing"
    @close="emit('close-drawing')"
  />

  <!-- Right side controls panel -->
  <div class="map-controls-panel">
    <!-- Zoom Controls (Bottom) -->
    <div class="map-zoom-controls">
      <button
        class="zoom-btn brush-btn"
        :class="{ 'active': isDrawingMode || false }"
        @click="emit('toggle-drawing')"
        title="屏幕编辑"
      >
        <img src="/icons/pencil.svg" width="18" height="18" alt="画笔" />
      </button>
      <div v-if="tabRecorderPending || tabRecorderConverting" class="tab-recorder-actions">
        <button
          v-if="tabRecorderConverting"
          class="tab-recorder-btn download-btn converting"
          disabled
        >
          <span class="converting-progress-fill" :style="{ width: `${tabRecorderConvertingProgress ?? 0}%` }"></span>
          <span class="converting-text">正在生成录制文件</span>
        </button>
        <button
          v-else-if="tabRecorderPending"
          class="tab-recorder-btn download-btn"
          @click="emit('tab-recorder-download')"
        >
          下载录制文件
        </button>
        <button
          v-if="tabRecorderPending"
          class="zoom-btn dismiss-btn"
          @click="emit('tab-recorder-clear-pending')"
          title="关闭"
        >
          ×
        </button>
      </div>
      <div v-if="tabRecorderSupported" class="tab-record-wrapper">
        <button
          class="zoom-btn tab-record-btn"
          :class="{ 'recording': tabRecorderRecording, 'converting': tabRecorderConverting }"
          :disabled="tabRecorderConverting"
          @click="tabRecorderRecording ? emit('tab-recorder-stop') : emit('tab-recorder-start')"
          :title="tabRecorderConverting ? '转换 MP4 中...' : tabRecorderRecording ? '停止录制' : '页面录制'"
        >
          <span class="rec-dot"></span>
        </button>
      </div>
      <button
        class="zoom-btn tracking-btn"
        :class="{ 'active': isGrenadeTrackingEnabled || false }"
        @click="emit('toggle-grenade-tracking')"
        title="道具追踪"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>
      <button
        class="zoom-btn share-btn"
        @click="emit('share')"
        title="分享链接（复制带纯净模式的当前链接）"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      </button>
      <div class="controls-divider"></div>
      <div class="zoom-reset-group">
        <button class="zoom-btn zoom-in-btn" @click="zoomIn" title="放大">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button class="zoom-btn zoom-out-btn" @click="zoomOut" title="缩小">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button class="zoom-btn reset-btn" @click="resetZoom" title="重置视图">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="4" width="16" height="16" rx="1" />
          </svg>
        </button>
      </div>
      <button
        class="zoom-btn pure-mode-btn"
        :class="{ 'active': pureMode || false }"
        @click="emit('toggle-pure-mode')"
        title="纯净模式"
      >
        <img src="/icons/scale.svg" width="18" height="18" alt="纯净模式" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Application, Assets, Container, Sprite, type Texture } from 'pixi.js';
import type { Frame, PlayerState, ProjectileState, WorldBounds, ProjectileRenderConfig, DroppedEquipment } from '@/types/replay';
import { MAP_CONFIGS, DEFAULT_MAP, getMapSvgUrl, MAP_IMAGE_SIZE, MAP_SVG_IMAGE_SIZE, SVG_TEXTURE_RESOLUTION } from '@/config/map';
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
import { nextTick } from 'vue';

const props = withDefaults(
  defineProps<{
    frames: Frame[] | undefined;
    bounds: WorldBounds | null | undefined;
    currentFrameIndex: number;
    replayMeta?: any;
    isPlaying?: boolean;
    isDragging?: boolean;
    mapName?: string;
    projectileConfigs?: Record<number, ProjectileRenderConfig>;
    isDrawingMode?: boolean;
    isGrenadeTrackingEnabled?: boolean;
    pureMode?: boolean;
    tabRecorderSupported?: boolean;
    tabRecorderRecording?: boolean;
    tabRecorderConverting?: boolean;
    tabRecorderConvertingProgress?: number;
    tabRecorderPending?: { url: string; filename: string; blob: Blob } | null;
  }>(),
  {}
);

const emit = defineEmits<{
  (e: 'close-drawing'): void;
  (e: 'toggle-drawing'): void;
  (e: 'projectile-click', proj: ProjectileState): void;
  (e: 'toggle-grenade-tracking'): void;
  (e: 'toggle-pure-mode'): void;
  (e: 'share'): void;
  (e: 'tab-recorder-start'): void;
  (e: 'tab-recorder-stop'): void;
  (e: 'tab-recorder-clear-pending'): void;
  (e: 'tab-recorder-download'): void;
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

/** 优先加载 map 下的 SVG（尺寸 MAP_SVG_IMAGE_SIZE），不存在则降级为 config.imageUrl (PNG，尺寸 MAP_IMAGE_SIZE）。 */
async function loadMapTexture(): Promise<{ texture: Texture; isSvg: boolean }> {
  const svgUrl = getMapSvgUrl(currentMapName.value);
  const pngUrl = currentMapConfig.value.imageUrl;
  try {
    const texture = await Assets.load({
      src: svgUrl,
      data: { resolution: SVG_TEXTURE_RESOLUTION },
    });
    return { texture, isSvg: true };
  } catch {
    const texture = await Assets.load(pngUrl);
    return { texture, isSvg: false };
  }
}

function getMapDisplaySize(isSvg: boolean): number {
  return isSvg ? MAP_SVG_IMAGE_SIZE : MAP_IMAGE_SIZE;
}

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
const copiedField = ref<string | null>(null);
let tooltipHovered = false;
let tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;

const tooltipStyle = computed(() => ({
  left: `${hoverScreenPos.x}px`,
  top: `${hoverScreenPos.y}px`,
}));

const setposCmd = computed(() => {
  if (!hoverPlayer.value) return '';
  const p = hoverPlayer.value;
  return `setpos ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${(p.z ?? 0).toFixed(2)}`;
});

const setangCmd = computed(() => {
  if (!hoverPlayer.value) return '';
  const p = hoverPlayer.value;
  return `setang ${(p.pitch ?? 0).toFixed(2)} ${p.yaw.toFixed(2)} 0`;
});

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    copiedField.value = text.startsWith('setpos') ? 'setpos' : 'setang';
    setTimeout(() => { copiedField.value = null; }, 1200);
  } catch {
    // fallback
  }
};

const onTooltipMouseEnter = () => {
  tooltipHovered = true;
  if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
};

const onTooltipMouseLeave = () => {
  tooltipHovered = false;
  tooltipHideTimer = setTimeout(() => { hoverPlayer.value = null; }, 100);
};

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

  const { texture, isSvg } = await loadMapTexture();
  const mapSize = getMapDisplaySize(isSvg);
  mapSprite = new Sprite(texture);
  mapSprite.anchor.set(0.5);
  mapSprite.width = mapSize;
  mapSprite.height = mapSize;

  mapSprite.position.set(0, 0);
  worldContainer.addChild(mapSprite);

  projectileLayer = new Container();
  worldContainer.addChild(projectileLayer);

  playerLayer = new Container();
  worldContainer.addChild(playerLayer);

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
  if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
  hoverPlayer.value = p;
  copiedField.value = null;
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
    // 延迟隐藏，给用户时间移到 tooltip 上
    tooltipHideTimer = setTimeout(() => {
      if (!tooltipHovered) {
        hoverPlayer.value = null;
      }
    }, 200);
  }
};

// 处理投掷物点击事件
const handleProjectileClick = (proj: ProjectileState) => {
  emit('projectile-click', proj);
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
    // 投掷物追踪模式参数
    isTrackingEnabled: props.isGrenadeTrackingEnabled,
    onProjectileClick: handleProjectileClick,
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
      
      const { texture, isSvg } = await loadMapTexture();
      const mapSize = getMapDisplaySize(isSvg);
      mapSprite = new Sprite(texture);
      mapSprite.anchor.set(0.5);
      mapSprite.width = mapSize;
      mapSprite.height = mapSize;
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

.map-controls-panel {
  position: absolute;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  z-index: 100;
}

.map-zoom-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
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

.zoom-btn.brush-btn.active {
  background: rgba(59, 130, 246, 0.5);
  border-color: rgba(59, 130, 246, 0.8);
}

/* + / - / 重置 三合一连体按钮 */
.zoom-reset-group {
  display: flex;
  align-items: stretch;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
}

.zoom-reset-group .zoom-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 0;
  margin: 0;
  box-shadow: none;
  border-right: 1px solid rgba(255, 255, 255, 0.2);
}

.zoom-reset-group .zoom-btn:last-child {
  border-right: none;
}

.zoom-reset-group .zoom-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: none;
}

.zoom-reset-group .zoom-btn.reset-btn {
  background: rgba(59, 130, 246, 0.6);
}

.zoom-reset-group .zoom-btn.reset-btn:hover {
  background: rgba(59, 130, 246, 0.8);
}

.reset-btn img {
  display: block;
  filter: brightness(0) invert(1);
}

.tracking-btn.active {
  background: rgba(74, 171, 247, 0.5);
  border-color: rgba(74, 171, 247, 0.8);
  color: #4aabf7;
}

.pure-mode-btn.active {
  background: rgba(34, 197, 94, 0.5);
  border-color: rgba(34, 197, 94, 0.8);
  color: #22c55e;
}

.tab-record-btn {
  min-width: 36px;
}

.tab-record-btn.recording {
  background: rgba(239, 68, 68, 0.6);
  border-color: rgba(239, 68, 68, 0.9);
  color: #ef4444;
}

.tab-record-btn .rec-dot {
  width: 10px;
  height: 10px;
  background: currentColor;
  border-radius: 50%;
}

.tab-record-btn.recording .rec-dot {
  animation: rec-blink 1s infinite;
}

.tab-record-btn.converting {
  opacity: 0.9;
  cursor: not-allowed;
  pointer-events: none;
}

.tab-record-btn.converting .rec-dot {
  background: transparent;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: rec-spin 0.8s linear infinite;
}

.tab-record-wrapper {
  position: relative;
}

@keyframes rec-spin {
  to { transform: rotate(360deg); }
}

.tab-recorder-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 12px;
}

.tab-recorder-btn {
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  border: none;
  transition: all 0.2s ease;
}

.tab-recorder-btn.download-btn {
  color: white;
  background: rgba(34, 197, 94, 0.8);
  text-decoration: none;
}

.tab-recorder-btn.download-btn:hover {
  background: rgba(34, 197, 94, 1);
}

.tab-recorder-btn.download-btn.converting {
  position: relative;
  overflow: hidden;
  background: rgba(60, 60, 60, 0.5);
  color: rgba(255, 255, 255, 0.9);
  cursor: not-allowed;
}

.tab-recorder-btn.download-btn.converting .converting-progress-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: rgba(100, 100, 100, 0.7);
  transition: width 0.2s ease;
}

.tab-recorder-btn.download-btn.converting .converting-text {
  position: relative;
  z-index: 1;
}

.tab-recorder-btn.download-btn.converting:hover {
  background: rgba(60, 60, 60, 0.5);
}

.tab-recorder-actions .dismiss-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  background: transparent;
  border: none;
}

@keyframes rec-blink {
  50% { opacity: 0.5; }
}

.controls-divider {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.2);
}

.player-tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 8px 12px;
  color: white;
  pointer-events: auto;
  z-index: 1000;
  transform: translate(10px, 10px);
  min-width: 180px;
  max-width: 340px;
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

.player-tooltip .cmd-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 4px;
  padding: 3px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: background 0.15s;
}

.player-tooltip .cmd-row:hover {
  background: rgba(255, 255, 255, 0.14);
}

.player-tooltip .cmd-text {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-tooltip .cmd-copy {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.7);
  transition: all 0.15s;
}

.player-tooltip .cmd-copy:hover {
  background: rgba(59, 130, 246, 0.4);
  color: white;
}

.player-tooltip .cmd-copy.copied {
  background: rgba(34, 197, 94, 0.5);
  color: white;
}

/* === 最小 1024×768 适配 === */
@media (max-width: 1024px), (max-height: 768px) {
  .map-controls-panel {
    bottom: 12px;
    right: 12px;
    gap: 8px;
  }

  .map-zoom-controls {
    gap: 6px;
  }

  .zoom-btn {
    width: 32px;
    height: 32px;
  }

  .zoom-reset-group .zoom-btn {
    width: 32px;
    height: 32px;
  }

  .zoom-btn svg,
  .zoom-btn img {
    width: 16px;
    height: 16px;
  }

  .controls-divider {
    height: 20px;
  }

  .tab-recorder-actions {
    padding: 3px 6px;
    font-size: 11px;
  }

  .tab-recorder-btn {
    padding: 4px 8px;
    font-size: 11px;
  }

  .tab-recorder-actions .dismiss-btn {
    width: 20px;
    height: 20px;
    font-size: 14px;
  }
}

</style>
