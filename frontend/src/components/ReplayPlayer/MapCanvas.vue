<template>
  <div class="map-canvas-root">
    <div ref="host" class="map-canvas-element"></div>
    <div
      v-if="hoverPlayer && tooltipPlayer && !(isDrawingMode ?? false)"
      class="player-tooltip"
      :style="tooltipStyle"
      @mouseenter="onTooltipMouseEnter"
      @mouseleave="onTooltipMouseLeave"
    >
      <div class="tooltip-header">
        <span class="name">{{ tooltipPlayer.name ?? hoverPlayer?.name ?? 'UNKNOWN' }}</span>
        <span class="kda">K {{ tooltipPlayer.kills ?? 0 }} / D {{ tooltipPlayer.deaths ?? 0 }} / A {{ tooltipPlayer.assists ?? 0 }}</span>
      </div>
      <div class="meta">
        <span class="money">$ {{ (tooltipPlayer.money ?? 0).toLocaleString() }}</span>
        <span>{{ tooltipPlayer.alive ? '存活' : '已阵亡' }}</span>
      </div>
      <div class="hp-row">
        <span class="hp-label">HP</span>
        <div class="hp-bar-wrap">
          <div class="hp-bar" :style="{ width: `${Math.min(100, Math.max(0, tooltipPlayer.health ?? 0))}%` }"></div>
        </div>
        <span class="hp-value">{{ tooltipPlayer.health ?? 0 }}</span>
      </div>
      <div class="tooltip-equipment">
        <div class="tooltip-weapon">
          <img
            v-if="getPrimaryWeapon(tooltipPlayer)"
            :src="getWeaponIconPath(getPrimaryWeapon(tooltipPlayer))"
            class="tooltip-weapon-icon"
            :class="{
              'is-active': isWeaponActiveForCard(tooltipPlayer, getPrimaryWeapon(tooltipPlayer)),
              'is-rifle': isRifleWeapon(getPrimaryWeapon(tooltipPlayer))
            }"
            @error="onWeaponIconError"
          />
        </div>
        <div class="tooltip-utility">
          <img
            v-for="(item, idx) in getUtilityItems(tooltipPlayer)"
            :key="idx"
            :src="getWeaponIconPath(item)"
            class="tooltip-utility-icon"
            :class="{ 'is-active': isWeaponActiveForCard(tooltipPlayer, item), 'is-c4': item === '404' }"
            @error="onWeaponIconError"
          />
        </div>
        <div class="tooltip-gear">
          <img
            v-for="(item, idx) in getGearItems(tooltipPlayer)"
            :key="idx"
            :src="getWeaponIconPath(item)"
            class="tooltip-gear-icon"
            :class="{ 'is-armor-full': item === 'armor_full' }"
            :title="item === 'armor_full' ? '护甲+头盔' : item === 'armor' ? '护甲' : item === 'defuser' ? '拆弹器' : ''"
            @error="onWeaponIconError"
          />
        </div>
      </div>
      <div class="cmd-row" @click="copyText(mergedPosAngCmd)">
        <code class="cmd-text">{{ mergedPosAngCmd }}</code>
        <span class="cmd-copy" :class="{ copied: copiedField === 'cmd' }" title="复制">
          <svg v-if="copiedField !== 'cmd'" class="cmd-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          <svg v-else class="cmd-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </span>
      </div>
    </div>
    <!-- 投掷物 hover 提示：开启右下角道具追踪后，点击投掷物可解析（画笔模式下不展示） -->
    <div
      v-if="hoverProjectile && !(isDrawingMode ?? false)"
      class="projectile-tip"
      :style="{ left: `${hoverProjectilePos.x}px`, top: `${hoverProjectilePos.y}px` }"
    >
      点击分析投掷动作
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
      <div class="zoom-pure-column">
        <div v-if="replaySource" class="replay-source-wrap">
          <div
            class="replay-source-indicator"
            :class="replaySource === 'cloud' ? 'is-cloud' : 'is-local'"
          >
            <img v-if="replaySource === 'cloud'" src="/icons/cloudsource.svg" width="20" height="20" alt="" />
            <img v-else src="/icons/localsource.svg" width="20" height="20" alt="" />
          </div>
          <div class="replay-source-tooltip">{{ replaySource === 'cloud' ? '云存档' : '本地存档' }}</div>
        </div>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Application, Assets, Container, Sprite, type Texture } from 'pixi.js';
import type { Frame, PlayerState, ProjectileState, WorldBounds, ProjectileRenderConfig, DroppedEquipment } from '@/types/replay';
import { MAP_CONFIGS, DEFAULT_MAP, getMapSvgUrl, MAP_IMAGE_SIZE, MAP_SVG_IMAGE_SIZE, SVG_TEXTURE_RESOLUTION } from '@/config/map';
import { MATCH_CONFIG, getDisplayTeam, isSecondHalf } from '@/config/game';
import { EQUIPMENT_ID_MAP } from '@/config/equipment';
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
    pureMode?: boolean;
    grenadeTrackingEnabled?: boolean;
    tabRecorderSupported?: boolean;
    tabRecorderRecording?: boolean;
    tabRecorderConverting?: boolean;
    tabRecorderConvertingProgress?: number;
    tabRecorderPending?: { url: string; filename: string; blob: Blob } | null;
    /** 当前回放来源：用于在 zoom 区域上方显示本地/云存档图标 */
    replaySource?: 'local' | 'cloud' | null;
  }>(),
  {}
);

const emit = defineEmits<{
  (e: 'close-drawing'): void;
  (e: 'toggle-drawing'): void;
  (e: 'projectile-click', proj: ProjectileState): void;
  (e: 'toggle-pure-mode'): void;
  (e: 'toggle-grenade-tracking'): void;
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

const hoverProjectile = ref<ProjectileState | null>(null);
const hoverProjectilePos = reactive({ x: 0, y: 0 });
const PROJECTILE_TIP_OFFSET = 10;
const HOVER_TOOLTIP_OFFSET = -2;

const tooltipStyle = computed(() => ({
  left: `${hoverScreenPos.x}px`,
  top: `${hoverScreenPos.y}px`,
}));

/** 用于 tooltip 的玩家数据：优先用当前帧的玩家，与左侧大卡片一致 */
const tooltipPlayer = computed(() => {
  const hover = hoverPlayer.value;
  if (!hover || !props.frames || hover.id === undefined) return hover;
  const frame = props.frames[props.currentFrameIndex];
  const current = frame?.players?.[hover.id];
  return current ?? hover;
});

const mergedPosAngCmd = computed(() => {
  if (!hoverPlayer.value) return '';
  const p = tooltipPlayer.value ?? hoverPlayer.value;
  const setpos = `setpos ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${(p.z ?? 0).toFixed(2)}`;
  const setang = `setang ${(p.pitch ?? 0).toFixed(2)} ${p.yaw.toFixed(2)} 0`;
  return `${setpos}; ${setang}`;
});

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    copiedField.value = 'cmd';
    setTimeout(() => { copiedField.value = null; }, 1200);
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '已复制到剪贴板', type: 'info' } }));
  } catch {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '复制失败', type: 'error' } }));
  }
};

function getWeaponIconPath(weaponId: unknown): string {
  if (weaponId === undefined || weaponId === null) return '/weapons/default.svg';
  if (typeof weaponId === 'string') {
    if (weaponId === 'defuser') return '/utility/defuser.svg';
    if (weaponId === 'armor_full') return '/utility/armor_full.svg';
    if (weaponId === 'armor') return '/utility/armor.svg';
  }
  const id = Number(weaponId);
  const fileName = EQUIPMENT_ID_MAP[id];
  if (!fileName) return '/weapons/default.svg';
  const isUtilityFolder = (id >= 501 && id <= 506) || id === 404;
  const folder = isUtilityFolder ? 'utility' : 'weapons';
  return `/${folder}/${fileName}.svg`;
}

function isActiveWeapon(player: PlayerState, itemId: string, idx: number): boolean {
  if (!player.activeWeapon) return false;
  const activeId = Number(player.activeWeapon);
  if (Number(itemId) !== activeId) return false;
  const firstMatch = player.inventory?.findIndex((inv) => Number(inv) === activeId) ?? -1;
  return idx === firstMatch;
}

function getPrimaryWeapon(player: PlayerState): string | null {
  if (!player.inventory) return null;
  const rifle = player.inventory.find(item => { const id = Number(item); return id >= 300 && id < 400; });
  if (rifle) return rifle;
  const smg = player.inventory.find(item => { const id = Number(item); return (id >= 200 && id < 300) || (id >= 100 && id < 200); });
  if (smg) return smg;
  const pistol = player.inventory.find(item => { const id = Number(item); return id >= 1 && id < 100 && id !== 405; });
  return pistol ?? null;
}

function getUtilityItems(player: PlayerState): string[] {
  if (!player.inventory) return [];
  return player.inventory.filter(item => {
    const id = Number(item);
    return (id >= 501 && id <= 506) || id === 404;
  });
}

// 与大卡一致：护甲区分仅护甲 / 护甲+头盔，用 armor_full 表示带头盔
function getGearItems(player: PlayerState): string[] {
  const items: string[] = [];
  if (!player) return items;
  if (player.hasDefuseKit) items.push('defuser');
  if (player.armor && player.armor > 0) {
    if (player.hasHelmet) {
      items.push('armor_full');
    } else {
      items.push('armor');
    }
  }
  return items;
}

function isWeaponActiveForCard(player: PlayerState, weaponId: string | null): boolean {
  if (!weaponId || !player.activeWeapon) return false;
  return Number(player.activeWeapon) === Number(weaponId);
}

function isRifleWeapon(weaponId: string | null): boolean {
  if (!weaponId) return false;
  const id = Number(weaponId);
  return (id >= 200 && id < 400) || (id >= 100 && id < 200);
}

const onWeaponIconError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  img.src = '/weapons/default.svg';
};

/** 将地图坐标转为屏幕 client 坐标（与玩家圆绘制同一套坐标系与缩放） */
function mapToClient(mapX: number, mapY: number): { x: number; y: number } | null {
  if (!app?.view || !worldContainer) return null;
  const screen = app.renderer.screen;
  const scale = worldContainer.scale.x;
  const stageX = worldContainer.position.x + mapX * scale;
  const stageY = worldContainer.position.y + mapY * scale;
  const rect = app.view.getBoundingClientRect();
  const scaleX = rect.width / screen.width;
  const scaleY = rect.height / screen.height;
  return {
    x: rect.left + stageX * scaleX,
    y: rect.top + stageY * scaleY,
  };
}

const onPlayerPointerOver = (e: { clientX: number; clientY: number }, p: PlayerState) => {
  if (props.isPlaying) return;
  if (tooltipHovered) return;
  if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
  hoverPlayer.value = p;
  copiedField.value = null;
  hoverScreenPos.x = e.clientX + HOVER_TOOLTIP_OFFSET;
  hoverScreenPos.y = e.clientY + HOVER_TOOLTIP_OFFSET;
};

// 不随鼠标在圆圈上的移动而更新 tooltip 位置，避免卡片漂移、便于移入卡片内操作
const onPlayerPointerMove = (_e: { clientX: number; clientY: number }, p: PlayerState) => {
  if (!hoverPlayer.value || hoverPlayer.value.id !== p.id || props.isPlaying) return;
  // 位置仅在 pointerover 时设定一次，此处不再更新
};

const onPlayerPointerOut = (p: PlayerState) => {
  if (hoverPlayer.value && hoverPlayer.value.id === p.id) {
    tooltipHideTimer = setTimeout(() => {
      if (!tooltipHovered) hoverPlayer.value = null;
    }, 150);
  }
};

const onTooltipMouseEnter = () => {
  tooltipHovered = true;
  if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
};

const onTooltipMouseLeave = () => {
  tooltipHovered = false;
  tooltipHideTimer = setTimeout(() => { hoverPlayer.value = null; }, 150);
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
  playerLayer = new Container();
  worldContainer.addChild(projectileLayer);
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

const handleProjectileClick = (proj: ProjectileState) => {
  hoverProjectile.value = null;
  emit('projectile-click', proj);
};

const onProjectilePointerOver = (proj: ProjectileState, clientX: number, clientY: number) => {
  hoverProjectile.value = proj;
  hoverProjectilePos.x = clientX + PROJECTILE_TIP_OFFSET;
  hoverProjectilePos.y = clientY + PROJECTILE_TIP_OFFSET;
};

const onProjectilePointerOut = () => {
  hoverProjectile.value = null;
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
    onProjectileClick: handleProjectileClick,
    onProjectilePointerOver,
    onProjectilePointerOut,
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
  align-items: flex-end;
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

/* 缩放 + 纯净 垂直一列：上方来源图标，+ / - / []，下方纯净按钮 */
.zoom-pure-column {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.replay-source-wrap {
  position: relative;
  flex-shrink: 0;
}

.replay-source-indicator {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.replay-source-indicator.is-local {
  background: rgba(120, 120, 120, 0.75);
  backdrop-filter: blur(8px);
}

.replay-source-indicator.is-cloud {
  background: rgba(34, 197, 94, 0.5);
  backdrop-filter: blur(8px);
}

.replay-source-indicator img {
  display: block;
  opacity: 0.95;
}

.replay-source-tooltip {
  position: absolute;
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-right: 8px;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1.3;
  color: rgba(255, 255, 255, 0.95);
  background: rgba(0, 0, 0, 0.85);
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s, visibility 0.15s;
}

.replay-source-wrap:hover .replay-source-tooltip {
  opacity: 1;
  visibility: visible;
}

/* + / - / [] 垂直连体按钮 */
.zoom-reset-group {
  display: flex;
  flex-direction: column;
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.zoom-reset-group .zoom-btn:last-child {
  border-bottom: none;
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

.map-canvas-root {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.player-tooltip {
  position: fixed;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 6px 10px;
  color: white;
  pointer-events: auto;
  z-index: 1000;
  min-width: 150px;
  max-width: 280px;
}

.player-tooltip .tooltip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding-bottom: 4px;
}

.player-tooltip .name {
  font-weight: bold;
  font-size: 13px;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-tooltip .kda {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.75);
  flex-shrink: 0;
}

.player-tooltip .meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 2px;
}

.player-tooltip .hp-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 11px;
}

.player-tooltip .hp-label {
  flex-shrink: 0;
  width: 22px;
  color: rgba(255, 255, 255, 0.8);
}

.player-tooltip .hp-bar-wrap {
  flex: 1;
  height: 5px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
  overflow: hidden;
}

.player-tooltip .hp-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.15s;
  background: #22c55e;
}
.player-tooltip .hp-value {
  flex-shrink: 0;
  min-width: 20px;
  text-align: right;
  color: rgba(255, 255, 255, 0.9);
}

.player-tooltip .tooltip-equipment {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  min-height: 20px;
}

.player-tooltip .tooltip-weapon {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-shrink: 0;
  min-width: 36px;
}

.player-tooltip .tooltip-weapon-icon {
  width: 28px;
  height: 14px;
  object-fit: contain;
  filter: brightness(0) invert(1);
  opacity: 0.85;
}
.player-tooltip .tooltip-weapon-icon.is-rifle {
  width: 32px;
  height: 16px;
}

.player-tooltip .tooltip-utility {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.player-tooltip .tooltip-utility-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  filter: brightness(0) invert(1);
  opacity: 0.85;
}
.player-tooltip .tooltip-utility-icon.is-c4 {
  filter: brightness(0) saturate(1) invert(0.3) sepia(0.8) saturate(5) hue-rotate(330deg);
  opacity: 1;
}

.player-tooltip .tooltip-gear {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.player-tooltip .tooltip-gear-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  filter: brightness(0) invert(1);
  opacity: 0.85;
}

.player-tooltip .money {
  color: #22c55e;
  font-weight: 600;
}

.player-tooltip .cmd-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
  padding: 6px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: background 0.15s;
  min-width: 0;
}

.player-tooltip .cmd-row:hover {
  background: rgba(255, 255, 255, 0.14);
}

.player-tooltip .cmd-text {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  line-height: 1.35;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.player-tooltip .cmd-text::-webkit-scrollbar {
  display: none;
}

.player-tooltip .cmd-copy {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.7);
  transition: all 0.15s;
}
.player-tooltip .cmd-copy-icon {
  width: 14px;
  height: 14px;
}

.player-tooltip .cmd-copy:hover {
  background: rgba(59, 130, 246, 0.4);
  color: white;
}

.player-tooltip .cmd-copy.copied {
  background: rgba(34, 197, 94, 0.5);
  color: white;
}

/* 投掷物 hover 提示 */
.projectile-tip {
  position: fixed;
  padding: 4px 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.95);
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  pointer-events: none;
  z-index: 1001;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
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
