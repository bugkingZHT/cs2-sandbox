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
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Application, Assets, Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import type { Frame, PlayerState, ProjectileState, WorldBounds, ProjectileRenderConfig } from '@/types/replay';
import { MAP_CONFIGS, DEFAULT_MAP } from '@/config/map-config';
import { useMapConfig } from '@/composables/useMapConfig';
import { EQUIPMENT_ID_MAP, isUtilityItem } from '@/config/equipment';
import {
  clearProjectilesLayer,
  drawProjectilesForFrame as drawProjectilesForFrameExternal,
} from '../../composables/projectilesRenderer';

const props = defineProps<{
  frames: Frame[] | undefined;
  bounds: WorldBounds | null | undefined;
  currentFrameIndex: number;
  isPlaying?: boolean;
  mapName?: string;
  projectileConfigs?: Record<number, ProjectileRenderConfig>;
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

const PLAYER_STYLE = {
  aliveRadius: 10,
  deadRadius: 5,
  nameSize: 15,
  triLen: 8,
  triWidth: 6,
  attackLen: 40
};

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

  centerWorld();
};

const centerWorld = () => {
  if (!app || !worldContainer || !mapSprite) return;
  const { width, height } = app.renderer.screen;
  const fitScale = Math.min(width / mapSprite.width, height / mapSprite.height);
  state.defaultScale = fitScale; // Store the default scale
  state.scale = fitScale;
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

const clearPlayers = () => {
  if (!playerLayer) return;
  playerLayer.removeChildren();
};

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

const drawProjectilesForFrame = async (projectiles: Record<number, ProjectileState> | undefined, players: PlayerState[]) => {
  await drawProjectilesForFrameExternal({
    projectiles,
    players,
    projectileLayer,
    mapSprite,
    frames: props.frames,
    currentFrameIndex: props.currentFrameIndex,
    worldToMap,
    projectileConfigs: props.projectileConfigs,
  });
};

const drawPlayersForFrame = () => {
  if (!playerLayer || !mapSprite || !props.frames) return;
  const frame = props.frames[props.currentFrameIndex];
  if (!frame) {
    clearPlayers();
    clearProjectiles();
    hoverPlayer.value = null;
    return;
  }

  clearPlayers();
  clearProjectiles();

  if (frame.players) {
    // 按 player id 排序叠放，确保重叠时顺序一致，避免频闪
    const sortedPlayers = [...frame.players].sort((a, b) => a.id - b.id);
    for (const p of sortedPlayers) {
      const g = new Graphics();
      const color = p.team === 3 ? 0x3b82f6 : 0xf97316;
      const radius = p.alive ? PLAYER_STYLE.aliveRadius : PLAYER_STYLE.deadRadius;
      const mapPos = worldToMap(p.x, p.y);
      const angleRad = (p.yaw * Math.PI) / -180;
      
      if (p.alive) {
        // 绘制方向三角形
        const isAttacking = p.buttons?.includes(1); // 1 = common.ButtonAttack
        const triColor = isAttacking ? 0xff0000 : color;
        
        const tipX = Math.cos(angleRad) * (radius + PLAYER_STYLE.triLen);
        const tipY = Math.sin(angleRad) * (radius + PLAYER_STYLE.triLen);
        const baseAngle1 = angleRad + Math.PI / 2;
        const baseAngle2 = angleRad - Math.PI / 2;
        const bx1 = Math.cos(angleRad) * radius + Math.cos(baseAngle1) * PLAYER_STYLE.triWidth;
        const by1 = Math.sin(angleRad) * radius + Math.sin(baseAngle1) * PLAYER_STYLE.triWidth;
        const bx2 = Math.cos(angleRad) * radius + Math.cos(baseAngle2) * PLAYER_STYLE.triWidth;
        const by2 = Math.sin(angleRad) * radius + Math.sin(baseAngle2) * PLAYER_STYLE.triWidth;
        
        // 三角形填充
        g.moveTo(bx1, by1).lineTo(tipX, tipY).lineTo(bx2, by2).closePath().fill({ color: triColor, alpha: 0.95 });

        // 如果正在开火，画一条细红线延伸出去
        const activeWeaponId = p.activeWeapon ? Number(p.activeWeapon) : 0;
        const isUtility = isUtilityItem(activeWeaponId);
        if (isAttacking && !isUtility) {
          const lineLen = PLAYER_STYLE.attackLen * 6;
          const endX = tipX + Math.cos(angleRad) * lineLen;
          const endY = tipY + Math.sin(angleRad) * lineLen;
          g.moveTo(tipX, tipY).lineTo(endX, endY).stroke({ width: 1, color: 0xff0000, alpha: 0.8 });
        }
      }

      // 绘制人物圆圈主体
      g.circle(0, 0, radius).fill(p.alive ? color : 0x888888);
      
      // 深色边框增强对比度
      g.circle(0, 0, radius)
        .stroke({ width: 1.5, color: 0x000000, alpha: 0.5 });
      
      if (!p.alive) {
        const crossSize = radius * 0.7;
        g.moveTo(-crossSize, -crossSize).lineTo(crossSize, crossSize);
        g.moveTo(crossSize, -crossSize).lineTo(-crossSize, crossSize);
        g.stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 });
      }

      g.x = mapPos.x;
      g.y = mapPos.y;
      g.eventMode = 'static';
      g.cursor = 'pointer';

      (g as any).on('pointerover', (e: any) => onPlayerPointerOver(e, p));
      (g as any).on('pointermove', (e: any) => {
        if (!hoverPlayer.value || hoverPlayer.value.id !== p.id || props.isPlaying) return;
        hoverScreenPos.x = e.global.x;
        hoverScreenPos.y = e.global.y;
      });
      (g as any).on('pointerout', () => {
        if (hoverPlayer.value && hoverPlayer.value.id === p.id) hoverPlayer.value = null;
      });

      playerLayer.addChild(g);
      const label = new Text(p.name, {
        fontFamily: 'system-ui',
        fontSize: PLAYER_STYLE.nameSize,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 4 },
      });
      label.anchor.set(0.5, 0);
      label.x = g.x;
      label.y = g.y + radius + 2;
      playerLayer.addChild(label);
    }
  }

  if (frame.projectiles) {
    drawProjectilesForFrame(frame.projectiles, frame.players || []);
  }
};

watch(
  () => props.currentFrameIndex,
  () => {
    // 只在帧索引变化时重绘，不监听frames变化
    if (props.frames && props.frames.length > 0) {
      drawPlayersForFrame();
    }
  },
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
  drawPlayersForFrame();
});

onBeforeUnmount(() => {
  if (host.value) {
    host.value.removeEventListener('wheel', onWheel);
  }
  
  // 清理定时器
  if (framesChangeTimer) {
    clearTimeout(framesChangeTimer);
    framesChangeTimer = null;
  }
  
  if (app) {
    app.destroy(true, { children: true });
    app = null;
    worldContainer = null;
    playerLayer = null;
    mapSprite = null;
  }
});
</script>
