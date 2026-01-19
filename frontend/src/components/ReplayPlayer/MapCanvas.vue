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
import type { Frame, PlayerState, WorldBounds } from '@/types/replay';

const mapTextureUrl = '/backGroundMap/dust2.png';

const PLAYER_STYLE = {
  aliveRadius: 30,
  deadRadius: 30,
  dirLength: 40, // 增加镜头线长度
  nameSize: 40,  // 增加名字大小
};

const props = defineProps<{
  frames: Frame[] | undefined;
  bounds: WorldBounds | null | undefined;
  currentFrameIndex: number;
}>();

const host = ref<HTMLDivElement | null>(null);

let app: Application | null = null;
let worldContainer: Container | null = null;
let playerLayer: Container | null = null;
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
  if (!props.bounds || !mapSprite) return { x: 0, y: 0 };
  const { minX, maxX, minY, maxY } = props.bounds;
  const mapWidth = mapSprite.width;
  const mapHeight = mapSprite.height;

  const nx = (x - minX) / (maxX - minX || 1);
  const ny = (y - minY) / (maxY - minY || 1);

  return {
    x: nx * mapWidth,
    y: (1 - ny) * mapHeight,
  };
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

  const texture = await Assets.load(mapTextureUrl);
  mapSprite = new Sprite(texture);
  mapSprite.anchor.set(0.5);
  mapSprite.width = 2048;
  mapSprite.height = 2048;

  worldContainer.addChild(mapSprite);

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

const drawPlayersForFrame = () => {
  if (!playerLayer || !mapSprite || !props.frames) return;
  const frame = props.frames[props.currentFrameIndex];
  if (!frame || !frame.players) {
    clearPlayers();
    hoverPlayer.value = null;
    return;
  }

  clearPlayers();

  for (const p of frame.players) {
    const g = new Graphics();
    const color = p.team === 3 ? 0x3b82f6 : 0xf97316;
    const radius = p.alive ? PLAYER_STYLE.aliveRadius : PLAYER_STYLE.deadRadius;

    const mapPos = worldToMap(p.x, p.y);

    const angleRad = (p.yaw * Math.PI) / 180;
    const dirLen = PLAYER_STYLE.dirLength;
    const dirX = Math.cos(angleRad) * radius;
    const dirY = Math.sin(angleRad) * radius;

    // 绘制指向三角形
    const triLen = 15; // 三角形长度
    const triWidth = 10; // 三角形底边半宽
    
    const tipX = Math.cos(angleRad) * (radius + triLen);
    const tipY = Math.sin(angleRad) * (radius + triLen);
    
    const baseAngle1 = angleRad + Math.PI / 2;
    const baseAngle2 = angleRad - Math.PI / 2;
    
    const bx1 = Math.cos(angleRad) * radius + Math.cos(baseAngle1) * triWidth;
    const by1 = Math.sin(angleRad) * radius + Math.sin(baseAngle1) * triWidth;
    
    const bx2 = Math.cos(angleRad) * radius + Math.cos(baseAngle2) * triWidth;
    const by2 = Math.sin(angleRad) * radius + Math.sin(baseAngle2) * triWidth;

    g.moveTo(bx1, by1);
    g.lineTo(tipX, tipY);
    g.lineTo(bx2, by2);
    g.closePath();
    g.fill({ color, alpha: 0.9 });

    g.circle(0, 0, radius).fill(color);
    g.circle(0, 0, radius).stroke({ width: 3, color: 0xffffff, alpha: 0.6 });

    g.x = mapPos.x - mapSprite.width / 2;
    g.y = mapPos.y - mapSprite.height / 2;

    g.eventMode = 'static';
    g.cursor = 'pointer';

    (g as any).on('pointerover', (e: any) => {
      hoverPlayer.value = p;
      const global = e.global;
      hoverScreenPos.x = global.x;
      hoverScreenPos.y = global.y;
    });

    (g as any).on('pointermove', (e: any) => {
      if (!hoverPlayer.value || hoverPlayer.value.id !== p.id) return;
      const global = e.global;
      hoverScreenPos.x = global.x;
      hoverScreenPos.y = global.y;
    });

    (g as any).on('pointerout', () => {
      if (hoverPlayer.value && hoverPlayer.value.id === p.id) {
        hoverPlayer.value = null;
      }
    });

    playerLayer.addChild(g);

    const label = new Text(p.name, {
      fontFamily: 'system-ui',
      fontSize: PLAYER_STYLE.nameSize,
      fill: 0xffffff,
      stroke: { color: 0x000000, width: 4 }, // 增加描边提升清晰度
    });
    label.anchor.set(0.5, 0);
    label.x = g.x;
    label.y = g.y + radius + 2;
    playerLayer.addChild(label);
  }
};

watch(
  () => [props.currentFrameIndex, props.frames],
  () => {
    drawPlayersForFrame();
  },
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
