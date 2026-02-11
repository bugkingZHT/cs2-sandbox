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
    <!-- Tactics Panel (Top) -->
    <div v-if="tacticPropsReady" class="tactic-panel">
      <!-- 编辑/新建：表单 -->
      <template v-if="tacticFormVisible">
        <div class="tactic-form-inner">
          <div class="tactic-form-row">
            <label>地图</label>
            <input type="text" :value="tacticFormMap" readonly class="tactic-input readonly" />
          </div>
          <div class="tactic-form-row">
            <label>名称</label>
            <input v-model="tacticFormName" type="text" class="tactic-input" placeholder="战术名称" />
          </div>
          <div class="tactic-form-row tactic-form-row-team">
            <div class="tactic-team-tabs">
              <button type="button" class="tactic-team-tab" :class="{ active: tacticFormTeam === 'CT' }" @click="tacticFormTeam = 'CT'">CT</button>
              <button type="button" class="tactic-team-tab" :class="{ active: tacticFormTeam === 'T' }" @click="tacticFormTeam = 'T'">T</button>
            </div>
          </div>
          <div class="tactic-form-row">
            <label>归档到</label>
            <select v-model="tacticFormParentId" class="tactic-input">
              <option value="">无（根级）</option>
              <option
                v-for="f in parentOptions"
                :key="f.id"
                :value="f.id"
              >
                {{ f.name }}{{ f.mapName ? ` (${f.mapName})` : '' }}
              </option>
            </select>
          </div>
          <div class="tactic-form-row">
            <label>标签</label>
            <div class="tactic-tags-row">
              <button
                v-for="tag in allTags"
                :key="tag"
                type="button"
                class="tactic-tag-btn"
                :class="{ active: tacticFormTags.includes(tag) }"
                @click="toggleTacticTag(tag)"
              >
                {{ tag }}
              </button>
              <button type="button" class="tactic-tag-add" title="添加自定义标签" @click="showAddTagInput = true">
                +
              </button>
              <input
                v-if="showAddTagInput"
                ref="addTagInputRef"
                v-model="addTagValue"
                type="text"
                class="tactic-add-tag-input"
                placeholder="新标签"
                @keydown.enter="confirmAddTag"
                @blur="confirmAddTag"
              />
            </div>
          </div>
          <div class="tactic-form-row">
            <label>内容</label>
            <textarea v-model="tacticFormContent" class="tactic-input tactic-textarea" placeholder="备注内容" rows="3" />
          </div>
          <div class="tactic-form-actions">
            <button type="button" class="tactic-btn primary" @click="submitTacticForm">保存</button>
            <button type="button" class="tactic-btn" @click="closeTacticForm">取消</button>
            <button
              v-if="editingTacticFavorite"
              type="button"
              class="tactic-btn danger"
              @click="unfavoriteTactic"
            >
              取消收藏
            </button>
          </div>
        </div>
      </template>
      <!-- 锁定后：展示本页收藏列表 -->
      <template v-else>
        <div v-if="pageFavoritesForDisplay.length > 0" class="tactic-page-list">
          <div class="tactic-page-list-title">本页收藏</div>
          <div class="tactic-page-list-items ds-scrollbar">
            <div
              v-for="fav in pageFavoritesForDisplay"
              :key="fav.id"
              class="tactic-page-list-item"
            >
              <div class="tactic-page-list-row">
                <span class="tactic-page-list-name" :title="fav.name">{{ fav.name }}</span>
                <span v-if="fav.team" class="tactic-page-list-team" :class="fav.team">{{ fav.team }}</span>
                <div v-if="fav.tags.length" class="tactic-page-list-tags">
                  <span v-for="t in fav.tags" :key="t" class="tactic-page-list-tag">{{ t }}</span>
                </div>
              </div>
              <p v-if="fav.content" class="tactic-page-list-content">{{ fav.content }}</p>
              <div class="tactic-page-list-actions">
                <button type="button" class="tactic-list-btn" title="编辑" @click.stop="startEditTactic(fav)">编辑</button>
                <button type="button" class="tactic-list-btn danger" title="取消收藏" @click.stop="onDeleteTactic(fav.id)">取消收藏</button>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="tactic-panel-hint">本页暂无收藏，点击 ★ 添加</div>
      </template>
    </div>

    <!-- Zoom Controls (Bottom) -->
    <div class="map-zoom-controls">
      <button
        v-if="tacticPropsReady"
        class="zoom-btn star-btn"
        :class="{ active: tacticFormVisible || pageFavoritesForDisplay.length > 0 }"
        title="收藏战术"
        @click="toggleTacticForm"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" :fill="pageFavoritesForDisplay.length > 0 ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </button>
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
      <div class="controls-divider"></div>
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
        <img src="/icons/scale.svg" width="18" height="18" alt="重置" />
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
import type { TacticFavorite } from '@/types/tactics';
import { useTacticTags } from '@/composables/useTacticTags';
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
    tabRecorderSupported?: boolean;
    tabRecorderRecording?: boolean;
    tabRecorderConverting?: boolean;
    tabRecorderConvertingProgress?: number;
    tabRecorderPending?: { url: string; filename: string; blob: Blob } | null;
    pageUrl?: string;
    pageFavorites?: TacticFavorite[];
    allFavoritesForParent?: TacticFavorite[];
    parentMap?: Record<string, string | null>;
    onTacticSave?: (f: TacticFavorite, options?: { parentId?: string | null }) => void;
    onTacticDelete?: (id: string) => void;
  }>(),
  { pageFavorites: () => [], allFavoritesForParent: () => [], parentMap: () => ({}) }
);

const emit = defineEmits<{
  (e: 'close-drawing'): void;
  (e: 'toggle-drawing'): void;
  (e: 'projectile-click', proj: ProjectileState): void;
  (e: 'toggle-grenade-tracking'): void;
  (e: 'tab-recorder-start'): void;
  (e: 'tab-recorder-stop'): void;
  (e: 'tab-recorder-clear-pending'): void;
  (e: 'tab-recorder-download'): void;
}>();

// 收藏战术：仅当传入 pageUrl 时启用
const tacticPropsReady = computed(() => !!props.pageUrl && typeof props.onTacticSave === 'function');
const tacticFormVisible = ref(false);
const editingTacticFavorite = ref<TacticFavorite | null>(null);
const tacticFormName = ref('');
const tacticFormTeam = ref<'CT' | 'T'>('CT');
const tacticFormTags = ref<string[]>([]);
const tacticFormContent = ref('');
const tacticFormParentId = ref<string>('');

const parentOptions = computed(() => {
  const all = props.allFavoritesForParent ?? [];
  const editingId = editingTacticFavorite.value?.id;
  return all.filter((f) => f.id !== editingId);
});
const showAddTagInput = ref(false);
const addTagValue = ref('');
const addTagInputRef = ref<HTMLInputElement | null>(null);

const { allTags, addCustomTag } = useTacticTags();

const tacticFormMap = computed(() => editingTacticFavorite.value?.mapName ?? props.mapName ?? '');

function openTacticForm(edit?: TacticFavorite) {
  editingTacticFavorite.value = edit ?? null;
  tacticFormName.value = edit?.name ?? '';
  tacticFormTeam.value = edit?.team === 'T' ? 'T' : 'CT';
  tacticFormTags.value = edit?.tags ? [...edit.tags] : [];
  tacticFormContent.value = edit?.content ?? '';
  tacticFormParentId.value = edit?.id ? (props.parentMap?.[edit.id] ?? '') : '';
  tacticFormVisible.value = true;
  showAddTagInput.value = false;
  addTagValue.value = '';
}

function closeTacticForm() {
  tacticFormVisible.value = false;
  editingTacticFavorite.value = null;
}

function toggleTacticForm() {
  if (tacticFormVisible.value) closeTacticForm();
  else openTacticForm();
}

function toggleTacticTag(tag: string) {
  const i = tacticFormTags.value.indexOf(tag);
  if (i >= 0) tacticFormTags.value = tacticFormTags.value.filter((_, idx) => idx !== i);
  else tacticFormTags.value = [...tacticFormTags.value, tag];
}

function confirmAddTag() {
  const v = addTagValue.value.trim();
  if (v && addCustomTag(v)) {
    if (!tacticFormTags.value.includes(v)) tacticFormTags.value = [...tacticFormTags.value, v];
  }
  showAddTagInput.value = false;
  addTagValue.value = '';
}

function submitTacticForm() {
  const pageUrl = props.pageUrl ?? '';
  const mapName = tacticFormMap.value || (props.mapName ?? '');
  if (!pageUrl || !mapName) return;
  const now = Date.now();
  const existing = editingTacticFavorite.value;
  const favorite: TacticFavorite = existing
    ? {
        ...existing,
        name: tacticFormName.value.trim() || existing.name,
        team: tacticFormTeam.value,
        tags: [...tacticFormTags.value],
        content: tacticFormContent.value.trim(),
        updatedAt: now,
      }
    : {
        id: crypto.randomUUID(),
        pageUrl,
        mapName,
        name: tacticFormName.value.trim() || '未命名',
        team: tacticFormTeam.value,
        tags: [...tacticFormTags.value],
        content: tacticFormContent.value.trim(),
        createdAt: now,
      };
  props.onTacticSave?.(favorite, {
    parentId: tacticFormParentId.value || null,
  });
  closeTacticForm();
}

function unfavoriteTactic() {
  if (editingTacticFavorite.value) {
    props.onTacticDelete?.(editingTacticFavorite.value.id);
    closeTacticForm();
  }
}

const pageFavoritesForDisplay = computed(() => props.pageFavorites ?? []);

function startEditTactic(fav: TacticFavorite) {
  openTacticForm(fav);
}

function onDeleteTactic(id: string) {
  props.onTacticDelete?.(id);
}

// 添加标签输入框获得焦点
watch(showAddTagInput, (visible) => {
  if (visible) nextTick(() => addTagInputRef.value?.focus());
});

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

.tactic-panel {
  background: var(--ds-surface-elevated, rgba(0, 0, 0, 0.85));
  backdrop-filter: blur(8px);
  border: 1px solid var(--ds-border-default, rgba(255, 255, 255, 0.2));
  border-radius: var(--ds-radius-md, 8px);
  padding: var(--ds-space-sm, 8px);
  min-width: 280px;
  max-width: 320px;
  max-height: 320px;
  overflow-y: auto;
}

.tactic-panel-hint {
  font-size: 12px;
  color: var(--ds-text-tertiary, rgba(255, 255, 255, 0.6));
  padding: var(--ds-space-md);
  text-align: center;
}

.tactic-page-list {
  padding: 0;
}

.tactic-page-list-title {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
}

.tactic-page-list-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tactic-page-list-item {
  font-size: 12px;
  color: white;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.tactic-page-list-item:last-child {
  border-bottom: none;
}

.tactic-page-list-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tactic-page-list-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  font-size: 12px;
}

.tactic-page-list-team {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.tactic-page-list-team.CT {
  background: rgba(59, 130, 246, 0.25);
  color: #60a5fa;
}

.tactic-page-list-team.T {
  background: rgba(249, 115, 22, 0.25);
  color: #fb923c;
}

.tactic-page-list-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.tactic-page-list-tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(78, 204, 163, 0.2);
  color: rgba(78, 204, 163, 1);
  border: 1px solid rgba(78, 204, 163, 0.35);
}

.tactic-page-list-content {
  font-size: 12px;
  color: var(--ds-text-secondary, #e0e0e0);
  margin: 6px 0 0 0;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

.tactic-page-list-actions {
  margin-top: 4px;
  display: flex;
  gap: 6px;
}

.tactic-list-btn {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  cursor: pointer;
}

.tactic-list-btn.danger {
  background: rgba(239, 68, 68, 0.3);
  border-color: rgba(239, 68, 68, 0.5);
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

.reset-btn {
  background: rgba(59, 130, 246, 0.6); /* Blueish for reset */
}

.reset-btn img {
  display: block;
  filter: brightness(0) invert(1);
}

.reset-btn:hover {
  background: rgba(59, 130, 246, 0.8);
}

.tracking-btn.active {
  background: rgba(74, 171, 247, 0.5);
  border-color: rgba(74, 171, 247, 0.8);
  color: #4aabf7;
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

/* 收藏战术表单（与展示同处于 .tactic-panel 内） */

.tactic-form-inner {
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 12px;
  color: white;
}

.tactic-form-row {
  margin-bottom: 10px;
}

.tactic-form-row label {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 4px;
}

.tactic-form-row-team .tactic-team-tabs {
  display: flex;
  gap: 0;
  border-radius: var(--ds-radius-sm, 6px);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.25);
}

.tactic-team-tab {
  flex: 1;
  padding: 6px 12px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.tactic-team-tab:hover {
  background: rgba(255, 255, 255, 0.12);
}

.tactic-team-tab.active {
  color: white;
}

.tactic-team-tab:first-child.active {
  background: rgba(59, 130, 246, 0.55);
  color: #93c5fd;
}

.tactic-team-tab:last-child.active {
  background: rgba(249, 115, 22, 0.55);
  color: #fdba74;
}

.tactic-input {
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: white;
  font-size: 13px;
  box-sizing: border-box;
}

.tactic-input.readonly {
  opacity: 0.9;
  cursor: default;
}

.tactic-textarea {
  resize: vertical;
  min-height: 56px;
}

.tactic-tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.tactic-tag-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
  color: white;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.tactic-tag-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.tactic-tag-btn.active {
  background: rgba(59, 130, 246, 0.5);
  border-color: rgba(59, 130, 246, 0.8);
}

.tactic-tag-add {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px dashed rgba(255, 255, 255, 0.4);
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
}

.tactic-tag-add:hover {
  background: rgba(255, 255, 255, 0.1);
}

.tactic-add-tag-input {
  width: 80px;
  padding: 4px 6px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(0, 0, 0, 0.5);
  color: white;
}

.tactic-form-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.tactic-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 12px;
  cursor: pointer;
}

.tactic-btn.primary {
  background: rgba(59, 130, 246, 0.6);
  border-color: rgba(59, 130, 246, 0.8);
}

.tactic-btn.danger {
  background: rgba(239, 68, 68, 0.4);
  border-color: rgba(239, 68, 68, 0.7);
}

.zoom-btn.star-btn.active {
  background: rgba(234, 179, 8, 0.45);
  border-color: rgba(234, 179, 8, 0.85);
  color: #facc15;
}

.zoom-btn.star-btn.active svg {
  color: #facc15;
}
</style>
