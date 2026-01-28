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

// Player sprite management for smooth transitions
interface PlayerSprite {
  graphics: Graphics;
  label: Text;
  targetX: number;
  targetY: number;
  currentX: number;
  currentY: number;
  targetYaw: number;
  currentYaw: number;
  lastUpdateFrame: number;
}

const playerSpriteMap = new Map<number, PlayerSprite>();
const LERP_FACTOR = 0.3; // Smoothing factor (0-1, higher = faster transition)
const HARD_CUT_THRESHOLD = 5; // If frame jump > this, use hard cut instead of smooth
let animationFrameId: number | null = null;
let lastFrameIndex = 0; // Track previous frame for jump detection

const props = defineProps<{
  frames: Frame[] | undefined;
  bounds: WorldBounds | null | undefined;
  currentFrameIndex: number;
  isPlaying?: boolean;
  isDragging?: boolean;
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
  playerSpriteMap.clear();
};

// Linear interpolation helper
const lerp = (start: number, end: number, factor: number): number => {
  return start + (end - start) * factor;
};

// Angle interpolation (handles wrapping around 360°)
const lerpAngle = (start: number, end: number, factor: number): number => {
  let diff = end - start;
  // Normalize to [-180, 180]
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return start + diff * factor;
};

// Start smooth animation loop
const startSmoothAnimation = () => {
  if (animationFrameId !== null) return;
  
  const animate = () => {
    if (!playerLayer || !props.isPlaying) {
      animationFrameId = null;
      return;
    }
    
    let needsUpdate = false;
    
    // Interpolate all player sprites
    playerSpriteMap.forEach((sprite) => {
      const dx = Math.abs(sprite.targetX - sprite.currentX);
      const dy = Math.abs(sprite.targetY - sprite.currentY);
      const dYaw = Math.abs(sprite.targetYaw - sprite.currentYaw);
      
      if (dx > 0.5 || dy > 0.5 || dYaw > 0.5) {
        sprite.currentX = lerp(sprite.currentX, sprite.targetX, LERP_FACTOR);
        sprite.currentY = lerp(sprite.currentY, sprite.targetY, LERP_FACTOR);
        sprite.currentYaw = lerpAngle(sprite.currentYaw, sprite.targetYaw, LERP_FACTOR);
        
        sprite.graphics.x = sprite.currentX;
        sprite.graphics.y = sprite.currentY;
        sprite.label.x = sprite.currentX;
        sprite.label.y = sprite.currentY + (sprite.graphics as any)._radius + 2;
        
        needsUpdate = true;
      }
    });
    
    if (needsUpdate || props.isPlaying) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      animationFrameId = null;
    }
  };
  
  animationFrameId = requestAnimationFrame(animate);
};

// Stop smooth animation
const stopSmoothAnimation = () => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
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

  // Detect if this is a seek (large frame jump) or smooth playback
  const frameJump = Math.abs(props.currentFrameIndex - lastFrameIndex);
  const isSeek = frameJump > HARD_CUT_THRESHOLD && !props.isDragging; // Don't treat as seek if dragging
  lastFrameIndex = props.currentFrameIndex;

  // Track which players exist in current frame
  const currentPlayers = new Set<number>();
  
  // Clear projectiles (they don't need smooth transitions)
  clearProjectiles();

  if (frame.players) {
    // 按 player id 排序叠放，确保重叠时顺序一致，避免频闪
    const sortedPlayers = [...frame.players].sort((a, b) => a.id - b.id);
    
    for (const p of sortedPlayers) {
      currentPlayers.add(p.id);
      const mapPos = worldToMap(p.x, p.y);
      
      // Check if player sprite already exists
      let playerSprite = playerSpriteMap.get(p.id);
      
      if (!playerSprite) {
        // Create new player sprite
        const g = new Graphics();
        const label = new Text(p.name, {
          fontFamily: 'system-ui',
          fontSize: PLAYER_STYLE.nameSize,
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 4 },
        });
        label.anchor.set(0.5, 0);
        
        playerSprite = {
          graphics: g,
          label: label,
          targetX: mapPos.x,
          targetY: mapPos.y,
          currentX: mapPos.x,
          currentY: mapPos.y,
          targetYaw: p.yaw,
          currentYaw: p.yaw,
          lastUpdateFrame: props.currentFrameIndex,
        };
        
        playerSpriteMap.set(p.id, playerSprite);
        playerLayer.addChild(g);
        playerLayer.addChild(label);
        
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
      } else {
        // Update existing player sprite targets
        playerSprite.targetX = mapPos.x;
        playerSprite.targetY = mapPos.y;
        playerSprite.targetYaw = p.yaw;
        playerSprite.lastUpdateFrame = props.currentFrameIndex;
        
        // Hard cut: snap to position immediately if seeking or not playing
        if (isSeek || !props.isPlaying) {
          playerSprite.currentX = mapPos.x;
          playerSprite.currentY = mapPos.y;
          playerSprite.currentYaw = p.yaw;
        }
      }
      
      // Redraw player graphics
      const g = playerSprite.graphics;
      g.clear();
      
      const color = p.team === 3 ? 0x3b82f6 : 0xf97316;
      const radius = p.alive ? PLAYER_STYLE.aliveRadius : PLAYER_STYLE.deadRadius;
      const angleRad = (playerSprite.currentYaw * Math.PI) / -180;
      
      // Store radius for label positioning
      (g as any)._radius = radius;
      
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

      // Set position (either current interpolated or target)
      g.x = playerSprite.currentX;
      g.y = playerSprite.currentY;
      playerSprite.label.x = playerSprite.currentX;
      playerSprite.label.y = playerSprite.currentY + radius + 2;
    }
  }
  
  // Remove players that are no longer in the frame
  if (playerLayer) {
    const toRemove: number[] = [];
    const layer = playerLayer; // Capture for type narrowing
    playerSpriteMap.forEach((sprite, playerId) => {
      if (!currentPlayers.has(playerId)) {
        layer.removeChild(sprite.graphics);
        layer.removeChild(sprite.label);
        sprite.graphics.destroy();
        sprite.label.destroy();
        toRemove.push(playerId);
      }
    });
    toRemove.forEach(id => playerSpriteMap.delete(id));
  }

  if (frame.projectiles) {
    drawProjectilesForFrame(frame.projectiles, frame.players || []);
  }
  
  // Start animation loop only if playing AND not seeking
  if (props.isPlaying && !isSeek) {
    startSmoothAnimation();
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

// Watch isPlaying prop to stop animation when paused
watch(
  () => props.isPlaying,
  (playing) => {
    if (!playing) {
      stopSmoothAnimation();
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
  
  // Stop smooth animation
  stopSmoothAnimation();
  
  // Clear player sprites
  playerSpriteMap.clear();
  
  if (app) {
    app.destroy(true, { children: true });
    app = null;
    worldContainer = null;
    playerLayer = null;
    mapSprite = null;
  }
});
</script>
