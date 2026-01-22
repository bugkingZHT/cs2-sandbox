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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Application, Assets, Container, Graphics, Sprite, Texture, Text } from 'pixi.js';
import type { Frame, PlayerState, ProjectileState, WorldBounds } from '@/types/replay';
import { MAP_CONFIGS, DEFAULT_MAP } from '@/config/map-config';
import { useMapConfig } from '@/composables/useMapConfig';
import { EQUIPMENT_ID_MAP } from '@/config/equipment';

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

// 投掷物名称映射 (注意这里统一使用大写键名以便于逻辑匹配)
const PROJECTILE_NAME_KEY: Record<string, string> = {
  'hegrenade': 'HE',
  'flash': 'Flash',
  'smoke': 'Smoke',
  'molotov': 'Molotov',
  'incendiary': 'Incendiary',
  'c4': 'C4'
};

// 投掷物类型到SVG文件的映射
const PROJECTILE_ASSETS: Record<string, string> = {
  'HE': '/utility/hegrenade.svg',
  'Flash': '/utility/flash.svg',
  'Smoke': '/utility/smoke.svg',
  'Molotov': '/utility/molotov.svg',
  'Incendiary': '/utility/incendiary.svg',
  'C4': '/utility/c4.svg'
};

const PLAYER_STYLE = {
  aliveRadius:15,
  deadRadius: 7,
  dirLength: 20,
  nameSize: 20
};

const props = defineProps<{
  frames: Frame[] | undefined;
  bounds: WorldBounds | null | undefined;
  currentFrameIndex: number;
  isPlaying?: boolean;
  mapName?: string;
}>();

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
});

const hoverPlayer = ref<PlayerState | null>(null);
const hoverScreenPos = reactive({ x: 0, y: 0 });

const tooltipStyle = computed(() => ({
  left: `${hoverScreenPos.x}px`,
  top: `${hoverScreenPos.y}px`,
}));


const worldToMap = (x: number, y: number) => {
  if (!mapSprite) return { x: 0, y: 0 };
  
  // 使用当前地图的配置
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
  
  // 现在地图精灵的中心是(0,0)，不需要额外偏移
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

  /* 移除中心红点 */
  /*
  const centerMarker = new Graphics();
  centerMarker.circle(0, 0, 10).fill(0xff0000);
  centerMarker.stroke({ width: 2, color: 0xffffff });
  worldContainer.addChild(centerMarker);
  */

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
  const newScale = Math.min(1.5, Math.max(0.15, state.scale + delta));

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
  if (!projectileLayer) return;
  projectileLayer.removeChildren();
};

const onPlayerPointerOver = (e: any, p: PlayerState) => {
  if (props.isPlaying) return;
  hoverPlayer.value = p;
  const global = e.global;
  hoverScreenPos.x = global.x;
  hoverScreenPos.y = global.y;
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
    for (const p of frame.players) {
      const g = new Graphics();
      const color = p.team === 3 ? 0x3b82f6 : 0xf97316;
      const radius = p.alive ? PLAYER_STYLE.aliveRadius : PLAYER_STYLE.deadRadius;
      const mapPos = worldToMap(p.x, p.y);
      const angleRad = (p.yaw * Math.PI) / 180;
      
      if (p.alive) {
        const triLen = 15;
        const triWidth = 10;
        const tipX = Math.cos(angleRad) * (radius + triLen);
        const tipY = Math.sin(angleRad) * (radius + triLen);
        const baseAngle1 = angleRad + Math.PI / 2;
        const baseAngle2 = angleRad - Math.PI / 2;
        const bx1 = Math.cos(angleRad) * radius + Math.cos(baseAngle1) * triWidth;
        const by1 = Math.sin(angleRad) * radius + Math.sin(baseAngle1) * triWidth;
        const bx2 = Math.cos(angleRad) * radius + Math.cos(baseAngle2) * triWidth;
        const by2 = Math.sin(angleRad) * radius + Math.sin(baseAngle2) * triWidth;
        g.moveTo(bx1, by1).lineTo(tipX, tipY).lineTo(bx2, by2).closePath().fill({ color, alpha: 0.9 });
      }

      g.circle(0, 0, radius).fill(p.alive ? color : 0x888888);
      g.circle(0, 0, radius).stroke({ width: 3, color: 0xffffff, alpha: 0.6 });
      
      if (!p.alive) {
        const crossSize = radius * 0.7;
        g.moveTo(-crossSize, -crossSize).lineTo(crossSize, crossSize);
        g.moveTo(crossSize, -crossSize).lineTo(-crossSize, crossSize);
        g.stroke({ width: 3, color: 0xffffff });
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


const drawProjectilesForFrame = async (projectiles: ProjectileState[], players: PlayerState[]) => {
  if (!projectileLayer || !mapSprite) return;

  // 第一步:同步绘制所有轨迹(避免延迟)
  for (const proj of projectiles) {
    if (proj.trajectory && proj.trajectory.length > 1) {
      // 确定投掷者阵营,用于颜色区分
      const thrower = players.find(p => p.steamID === proj.throwerSteamID || p.name === proj.throwerName);
      let trajColor = 0xff6b6b; // 默认红色
      if (thrower) {
        trajColor = thrower.team === 3 ? 0x4dabf7 : 0xff922b; // CT蓝色 / T橙色
      }

      // 绘制轨迹直线
      const trajectoryG = new Graphics();
      
      // 起点
      const startPoint = proj.trajectory[0];
      const startMapPos = worldToMap(startPoint.x, startPoint.y);
      trajectoryG.moveTo(startMapPos.x, startMapPos.y);
      
      // 依次连接所有轨迹点
      for (let i = 1; i < proj.trajectory.length; i++) {
        const point = proj.trajectory[i];
        const mapPoint = worldToMap(point.x, point.y);
        trajectoryG.lineTo(mapPoint.x, mapPoint.y);
      }
      
      // 单层彩色线,清晰明显
      trajectoryG.stroke({ width: 3, color: trajColor, alpha: 1.0 });
      projectileLayer.addChild(trajectoryG);
    }
  }

  // 第二步:异步加载投掷物图标
  for (const proj of projectiles) {
    const typeId = Number(proj.type);
    const fileName = EQUIPMENT_ID_MAP[typeId] || '';
    const typeKey = PROJECTILE_NAME_KEY[fileName] || 'HE';
    const assetPath = PROJECTILE_ASSETS[typeKey];
    
    try {
      const texture = await Assets.load(assetPath);
      const sprite = new Sprite(texture);
      sprite.width = 20;
      sprite.height = 20;
      sprite.anchor.set(0.5);
      
      const mapPos = worldToMap(proj.x, proj.y);
      sprite.x = mapPos.x;
      sprite.y = mapPos.y;
      
      // 根据阵营着色
      const thrower = players.find(p => p.steamID === proj.throwerSteamID || p.name === proj.throwerName);
      if (thrower) {
        sprite.tint = thrower.team === 3 ? 0x4dabf7 : 0xff922b;
      } else {
        sprite.tint = 0xff6b6b;
      }
      
      projectileLayer.addChild(sprite);
    } catch (error) {
      console.warn('[投掷物] 加载图标失败:', assetPath, error);
    }
  }
};

watch(
  () => [props.currentFrameIndex, props.frames],
  async () => {
    drawPlayersForFrame();
  },
);

// 监听地图名称变化，重新加载地图
watch(
  () => props.mapName,
  async (newMapName, oldMapName) => {
    console.log('[MapCanvas] 监听到 mapName 变化:', { oldMapName, newMapName });
    if (newMapName !== oldMapName && app && worldContainer) {
      console.log('[MapCanvas] 地图变化，重新加载:', oldMapName, '->', newMapName);
      // 清除旧的地图精灵
      if (mapSprite) {
        worldContainer.removeChild(mapSprite);
      }
      // 加载新地图
      const texture = await Assets.load(mapTextureUrl.value);
      mapSprite = new Sprite(texture);
      mapSprite.anchor.set(0.5);
      mapSprite.width = currentMapConfig.value.width;
      mapSprite.height = currentMapConfig.value.height;
      mapSprite.position.set(0, 0);
      // 将地图精灵插入到最底层
      worldContainer.addChildAt(mapSprite, 0);
      // 重新居中
      centerWorld();
      // 重绘玩家
      drawPlayersForFrame();
      console.log('[MapCanvas] 地图重新加载完成');
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
  if (app) {
    app.destroy(true, { children: true });
    app = null;
    worldContainer = null;
    playerLayer = null;
    mapSprite = null;
  }
});
</script>
