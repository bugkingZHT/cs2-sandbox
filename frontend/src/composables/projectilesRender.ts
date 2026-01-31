import { Assets, Container, Graphics, Sprite } from 'pixi.js';
import type { Frame, PlayerState, ProjectileState, ProjectileRenderConfig } from '@/types/replay';
import { EQUIPMENT_ID_MAP } from '@/config/equipment';

/**
 * Projectile Renderer Module
 * 
 * Handles rendering of all projectile entities (grenades, smokes, flashes, etc.) on the map canvas.
 * Uses pre-sorted projectile IDs from the engine (frame.sortedProjs) for optimal rendering order
 * (priority by type: Decoy -> HE -> Flash -> Smoke -> Fire, then by time: newest to oldest),
 * eliminating the need for frontend sorting on every frame.
 */

// 投掷物名称映射
const PROJECTILE_NAME_KEY: Record<string, string> = {
  hegrenade: 'HE',
  flash: 'Flash',
  smoke: 'Smoke',
  molotov: 'Molotov',
  incendiary: 'Incendiary',
  decoy: 'Decoy',
  c4: 'C4',
};

// 投掷物类型到SVG文件的映射
const PROJECTILE_ASSETS: Record<string, string> = {
  HE: '/utility/hegrenade.svg',
  Flash: '/utility/flash.svg',
  Smoke: '/utility/smoke.svg',
  Molotov: '/utility/molotov.svg',
  Incendiary: '/utility/incendiary.svg',
  Decoy: '/utility/decoy.svg',
  C4: '/utility/c4.svg',
};

// 投掷物UI渲染配置（颜色、透明度、图标缩放等前端表现属性）
const PROJECTILE_UI_CONFIG = {
  Smoke: {
    color: 0xcccccc,
    alpha: 0.5,
    iconScale: 0.7,
  },
  Molotov: {
    color: 0xff6600,
    alpha: 0.5,
    iconScale: 0.7,
  },
  Incendiary: {
    color: 0xff6600,
    alpha: 0.5,
    iconScale: 0.7,
  },
  HE: {
    color: 0xff3300,
    alpha: 0.5,
    iconScale: 0.7,
  },
  Flash: {
    color: 0xffffcc,
    alpha: 0.5,
    iconScale: 0.7,
  },
  Decoy: {
    color: 0xffffff,
    alpha: 0.5,
    iconScale: 0.7,
  },
  C4: {
    color: 0xff0000,
    alpha: 1.0,
    iconScale: 0.7,
  },
};

// 默认逻辑配置（作为后备）
const DEFAULT_LOGIC_CONFIG: ProjectileRenderConfig = {
  explosionRadius: 160,
  durationInMs: 18000, // 默认烟雾时长
};

export const clearProjectilesLayer = (projectileLayer: Container | null) => {
  if (!projectileLayer) return;
  projectileLayer.removeChildren();
};

interface RenderContext {
  projectileLayer: Container;
  players: PlayerState[];
  worldToMap: (x: number, y: number) => { x: number; y: number };
  configs?: Record<number, ProjectileRenderConfig>;
}

// 获取投掷物类型Key
const getProjectileTypeKey = (typeId: number): string => {
  const fileName = EQUIPMENT_ID_MAP[typeId] || '';
  return PROJECTILE_NAME_KEY[fileName] || 'HE';
};

// 获取逻辑配置
const getLogicConfig = (typeId: number, ctx: RenderContext) => {
  return ctx.configs?.[typeId] || DEFAULT_LOGIC_CONFIG;
};

// 获取UI配置
const getUIConfig = (typeKey: string) => {
  return PROJECTILE_UI_CONFIG[typeKey as keyof typeof PROJECTILE_UI_CONFIG] || PROJECTILE_UI_CONFIG['HE'];
};

// 确定性随机数生成器（基于种子）
const pseudoRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

// 渲染粒子簇效果（模拟烟雾/火焰）
const renderParticles = (
  g: Graphics,
  centerX: number,
  centerY: number,
  radius: number,
  color: number,
  alpha: number,
  seed: number,
  count: number = 50
) => {
  for (let i = 0; i < count; i++) {
    const angle = pseudoRandom(seed + i) * Math.PI * 2;
    // 使用平方根分布使粒子在圆内分布更均匀
    const dist = Math.sqrt(pseudoRandom(seed + i + count)) * radius * 0.95;
    const x = centerX + Math.cos(angle) * dist;
    const y = centerY + Math.sin(angle) * dist;
    // 统一粒子大小 (固定为总半径的 22%)，确保完全覆盖无缝隙
    const particleRadius = radius * 0.22;
    g.circle(x, y, particleRadius).fill({ color, alpha });
  }
};

// 绘制倒计时环形进度条
const drawCountdownRing = (
  g: Graphics,
  centerX: number,
  centerY: number,
  radius: number,
  progress: number, // 0 到 1
  teamColor: number
) => {
  const ringRadius = radius * 0.35; // 倒计时环稍微再大一点
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + progress * Math.PI * 2;

  // 背景环 (深色半透明)
  g.circle(centerX, centerY, ringRadius).stroke({ width: 6, color: 0x000000, alpha: 0.4 });
  
  // 进度环 (阵营颜色)
  if (progress > 0) {
    // 明确起始点，防止从 (0,0) 画出粗线
    const startX = centerX + Math.cos(startAngle) * ringRadius;
    const startY = centerY + Math.sin(startAngle) * ringRadius;
    
    g.moveTo(startX, startY)
     .arc(centerX, centerY, ringRadius, startAngle, endAngle, false)
     .stroke({ width: 6, color: teamColor, alpha: 1.0 });
  }
};

// 计算像素半径
const calculatePixelRadius = (
  gameRadius: number,
  centerGamePos: { x: number; y: number },
  worldToMap: (x: number, y: number) => { x: number; y: number },
): number => {
  const center = worldToMap(centerGamePos.x, centerGamePos.y);
  const edge = worldToMap(centerGamePos.x + gameRadius, centerGamePos.y);
  // 计算两点间距离作为像素半径
  return Math.sqrt(Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2));
};

// 绘制轨迹（通用）
const drawTrajectory = (
  proj: ProjectileState,
  ctx: RenderContext,
  colorOverride?: number,
) => {
  const { worldToMap, players, projectileLayer } = ctx;
  
  // 如果已爆炸，则不显示轨迹
  if (proj.isExploded) {
    return;
  }
  
  // 使用引擎提供的未来碰撞点数据
  // 渲染顺序：trajectory[0] -> trajectory[1] -> ... -> 当前位置(X, Y)
  // trajectory 中存储的是尚未经过的 checkpoints
  if (!proj.trajectory || proj.trajectory.length === 0) {
    return; // 没有未来碰撞点，无需绘制轨迹
  }

  const thrower = players.find(
    (p) => p.id === proj.throwerID || p.name === proj.throwerName,
  );
  let trajColor = 0xff6b6b;
  if (thrower) {
    trajColor = thrower.team === 3 ? 0x4dabf7 : 0xff922b;
  }
  if (colorOverride !== undefined) {
    trajColor = colorOverride;
  }

  const trajectoryG = new Graphics();
  
  // 先顺序连接所有 trajectory 检查点
  if (proj.trajectory.length > 0) {
    const firstPoint = worldToMap(proj.trajectory[0].x, proj.trajectory[0].y);
    trajectoryG.moveTo(firstPoint.x, firstPoint.y);
    
    for (let i = 1; i < proj.trajectory.length; i++) {
      const mapPoint = worldToMap(proj.trajectory[i].x, proj.trajectory[i].y);
      trajectoryG.lineTo(mapPoint.x, mapPoint.y);
    }
    
    // 最后连接到投掷物当前实际位置
    const currentMapPos = worldToMap(proj.x, proj.y);
    trajectoryG.lineTo(currentMapPos.x, currentMapPos.y);
  }

  // 修改：线条变粗增强可见性 (width: 2)
  trajectoryG.stroke({ width: 2, color: trajColor, alpha: 0.8 });

  // 绘制碰撞点（未来的碰撞点）
  for (const cp of proj.trajectory) {
    const cpMapPos = worldToMap(cp.x, cp.y);
    // 碰撞点也稍微变小一点
    trajectoryG.circle(cpMapPos.x, cpMapPos.y, 2).fill({ color: trajColor, alpha: 1.0 });
  }

  projectileLayer.addChild(trajectoryG);
};

// 绘制图标（通用）
const drawIcon = async (
  proj: ProjectileState,
  typeKey: string,
  ctx: RenderContext,
  scale: number = 1.0,
) => {
  const { worldToMap, players, projectileLayer } = ctx;
  const assetPath = PROJECTILE_ASSETS[typeKey];

  try {
    const texture = await Assets.load(assetPath);
    const sprite = new Sprite(texture);
    const baseSize = 20;
    
    // 修改：根据Z轴调整大小 (Z轴越大，图标越大)
    // 假设地面Z约为0，Z越高越接近观察者（或者仅仅是为了视觉区分）
    // 移除 Z 轴缩放效果
    const finalScale = scale;
    
    sprite.width = baseSize * finalScale;
    sprite.height = baseSize * finalScale;
    sprite.anchor.set(0.5);

    const mapPos = worldToMap(proj.x, proj.y);
    sprite.x = mapPos.x;
    sprite.y = mapPos.y;

    const thrower = players.find(
      (p) => p.id === proj.throwerID || p.name === proj.throwerName,
    );
    if (thrower) {
      sprite.tint = thrower.team === 3 ? 0x4dabf7 : 0xff922b;
    } else {
      sprite.tint = 0xff6b6b;
    }

    projectileLayer.addChild(sprite);
  } catch (error) {
    console.warn('[投掷物] 加载图标失败:', assetPath, error);
  }
};

// 通用范围效果渲染（用于烟雾、燃烧瓶等）
const renderAreaEffect = async (
  proj: ProjectileState, 
  typeKey: string, 
  ctx: RenderContext,
  options: {
    strokeColor?: number;
    fillColor?: number;
    fillAlpha?: number;
  } = {}
) => {
  const { projectileLayer, worldToMap } = ctx;
  const typeId = Number(proj.type);
  const logicConfig = getLogicConfig(typeId, ctx);
  const uiConfig = getUIConfig(typeKey);

  if (proj.isExploded) {
    const mapPos = worldToMap(proj.x, proj.y);
    const pixelRadius = calculatePixelRadius(logicConfig.explosionRadius, { x: proj.x, y: proj.y }, worldToMap);

    const explosionG = new Graphics();
    
    const color = options.fillColor !== undefined ? options.fillColor : uiConfig.color;
    const alpha = options.fillAlpha !== undefined ? options.fillAlpha : uiConfig.alpha;
    const strokeColor = options.strokeColor !== undefined ? options.strokeColor : 0xffffff;

    // 绘制实心圆
    explosionG.circle(mapPos.x, mapPos.y, pixelRadius).fill({ 
      color: color, 
      alpha: alpha 
    });
    
    // 绘制边框
    explosionG.circle(mapPos.x, mapPos.y, pixelRadius).stroke({
      width: 1,
      color: strokeColor,
      alpha: 0.5,
    });

    projectileLayer.addChild(explosionG);
  } else {
    // 爆炸前：绘制轨迹和图标
    drawTrajectory(proj, ctx);
    await drawIcon(proj, typeKey, ctx, uiConfig.iconScale);
  }
};

// 烟雾弹渲染逻辑
const renderSmoke = async (proj: ProjectileState, typeKey: string, ctx: RenderContext) => {
  const { projectileLayer, worldToMap, players } = ctx;
  const typeId = Number(proj.type);
  const logicConfig = getLogicConfig(typeId, ctx);
  
  if (proj.isExploded) {
    const mapPos = worldToMap(proj.x, proj.y);
    const pixelRadius = calculatePixelRadius(logicConfig.explosionRadius, { x: proj.x, y: proj.y }, worldToMap);
    const explosionG = new Graphics();
    
    // 奶白色实心小圆圈铺开 (#F5F5F5)
    renderParticles(explosionG, mapPos.x, mapPos.y, pixelRadius, 0xF5F5F5, 0.8, proj.entityID);
    
    // 倒计时进度环
    if (proj.ttl !== undefined && logicConfig.durationInMs > 0) {
      const progress = Math.max(0, Math.min(1, proj.ttl / logicConfig.durationInMs));
      const thrower = players.find(p => p.id === proj.throwerID);
      const teamColor = thrower ? (thrower.team === 3 ? 0x3b82f6 : 0xf97316) : 0xffffff;
      drawCountdownRing(explosionG, mapPos.x, mapPos.y, pixelRadius, progress, teamColor);
    }

    projectileLayer.addChild(explosionG);
  } else {
    drawTrajectory(proj, ctx);
    await drawIcon(proj, typeKey, ctx, 0.7);
  }
};

// 闪光弹渲染逻辑
const renderFlash = async (proj: ProjectileState, typeKey: string, ctx: RenderContext) => {
  const { projectileLayer, worldToMap } = ctx;
  const typeId = Number(proj.type);
  const logicConfig = getLogicConfig(typeId, ctx);
  
  if (proj.isExploded) {
    const mapPos = worldToMap(proj.x, proj.y);
    const explosionG = new Graphics();
    
    // 1. 瞬时扩大的闪烁效果（白光闪过）
    if (proj.ttl !== undefined && logicConfig.durationInMs > 0) {
      const elapsedTime = logicConfig.durationInMs - proj.ttl;
      const flashDuration = 500; // 闪烁持续时间 500ms
      
      if (elapsedTime < flashDuration) {
        const progress = elapsedTime / flashDuration;
        // 半径迅速扩大
        const currentRadius = logicConfig.explosionRadius * Math.pow(progress, 0.3);
        const pixelRadius = calculatePixelRadius(currentRadius, { x: proj.x, y: proj.y }, worldToMap);
        // 透明度衰减
        const alpha = 0.7 * (1 - progress);
        
        explosionG.circle(mapPos.x, mapPos.y, pixelRadius).fill({ 
          color: 0xffffff, 
          alpha: alpha 
        });
      }
    }
    
    // 2. 残留爆点（一直存在直到道具消失）
    explosionG.circle(mapPos.x, mapPos.y, 2.5).fill({ color: 0xffffff, alpha: 0.9 });

    projectileLayer.addChild(explosionG);
  } else {
    drawTrajectory(proj, ctx);
    await drawIcon(proj, typeKey, ctx, 0.7);
  }
};

// 诱饵弹渲染逻辑
const renderDecoy = async (proj: ProjectileState, typeKey: string, ctx: RenderContext) => {
  const { projectileLayer, worldToMap } = ctx;
  const uiConfig = getUIConfig(typeKey);
  
  if (proj.isExploded) {
    const mapPos = worldToMap(proj.x, proj.y);
    const explosionG = new Graphics();
    
    // 诱饵弹表现为一个闪烁的小红点（模拟小地图上的敌人显示）
    const isPulsing = Math.floor(Date.now() / 200) % 2 === 0;
    const color = isPulsing ? 0xff0000 : 0xaa0000;
    
    explosionG.circle(mapPos.x, mapPos.y, 4).fill({ color: color, alpha: 1.0 });
    explosionG.circle(mapPos.x, mapPos.y, 8).stroke({ width: 1, color: 0xffffff, alpha: 0.3 });

    projectileLayer.addChild(explosionG);
  } else {
    drawTrajectory(proj, ctx);
    await drawIcon(proj, typeKey, ctx, 0.7);
  }
};

// 高爆手雷渲染逻辑
const renderHE = async (proj: ProjectileState, typeKey: string, ctx: RenderContext) => {
  const { projectileLayer, worldToMap, players } = ctx;
  const typeId = Number(proj.type);
  const logicConfig = getLogicConfig(typeId, ctx);
  
  if (proj.isExploded) {
    const mapPos = worldToMap(proj.x, proj.y);
    const explosionG = new Graphics();
    
    // 确定颜色：根据阵营区分，并与火（0xFFA500）稍微区分
    const thrower = players.find(p => p.id === proj.throwerID || p.name === proj.throwerName);
    const heColor = 0xFF6347

    // 1. 瞬时扩大的爆炸圈（闪过感）
    if (proj.ttl !== undefined && logicConfig.durationInMs > 0) {
      const elapsedTime = logicConfig.durationInMs - proj.ttl;
      const flashDuration = 800; // 爆炸圈闪烁持续时间增长到 800ms
      
      if (elapsedTime < flashDuration) {
        const progress = elapsedTime / flashDuration;
        // 半径迅速扩大
        const currentRadius = logicConfig.explosionRadius * Math.pow(progress, 0.4);
        const pixelRadius = calculatePixelRadius(currentRadius, { x: proj.x, y: proj.y }, worldToMap);
        // 透明度迅速衰减
        const alpha = 0.8 * (1 - progress);
        
        explosionG.circle(mapPos.x, mapPos.y, pixelRadius).fill({ 
          color: heColor,
          alpha: alpha 
        });
      }
    }
    
    // 2. 保留中心的小点（一直存在直到消失）
    explosionG.circle(mapPos.x, mapPos.y, 3).fill({ color: heColor, alpha: 0.9 });

    projectileLayer.addChild(explosionG);
  } else {
    drawTrajectory(proj, ctx);
    await drawIcon(proj, typeKey, ctx, 0.7);
  }
};

// 燃烧瓶/火瓶渲染逻辑
const renderFire = async (proj: ProjectileState, typeKey: string, ctx: RenderContext) => {
  const { projectileLayer, worldToMap, players } = ctx;
  const typeId = Number(proj.type);
  const logicConfig = getLogicConfig(typeId, ctx);
  
  if (proj.isExploded) {
    const mapPos = worldToMap(proj.x, proj.y);
    const pixelRadius = calculatePixelRadius(logicConfig.explosionRadius, { x: proj.x, y: proj.y }, worldToMap);
    const explosionG = new Graphics();
    
    // 橙色实心小圆圈铺开 (#FFA500)
    renderParticles(explosionG, mapPos.x, mapPos.y, pixelRadius, 0xFFA500, 0.7, proj.entityID);
    
    // 火不再显示倒计时环 (根据用户要求移除)

    projectileLayer.addChild(explosionG);
  } else {
    drawTrajectory(proj, ctx);
    await drawIcon(proj, typeKey, ctx, 0.7);
  }
};

// 默认渲染逻辑（保持原有逻辑）
const renderDefault = async (proj: ProjectileState, typeKey: string, ctx: RenderContext) => {
  const { projectileLayer, worldToMap } = ctx;
  const uiConfig = getUIConfig(typeKey);

  if (proj.isExploded) {
    const mapPos = worldToMap(proj.x, proj.y);
    const explosionG = new Graphics();
    let explosionColor = uiConfig.color;

    // 绘制多层透明圆圈模拟发光效果 (保留原有效果)
    explosionG.circle(mapPos.x, mapPos.y, 80).fill({ color: explosionColor, alpha: 0.1 });
    explosionG.circle(mapPos.x, mapPos.y, 50).fill({ color: explosionColor, alpha: 0.2 });
    explosionG.circle(mapPos.x, mapPos.y, 20).fill({ color: explosionColor, alpha: 0.4 });

    // 添加一个外边框增强可见性
    explosionG.circle(mapPos.x, mapPos.y, 80).stroke({
      width: 2,
      color: explosionColor,
      alpha: 0.3,
    });

    projectileLayer.addChild(explosionG);
  } else {
    // 1. 绘制轨迹
    drawTrajectory(proj, ctx);

    // 2. 绘制图标
    await drawIcon(proj, typeKey, ctx, uiConfig.iconScale);
  }
};

export const drawProjectilesForFrame = async (options: {
  projectiles: Record<number, ProjectileState> | undefined;
  players: PlayerState[];
  projectileLayer: Container | null;
  mapSprite: Sprite | null;
  worldToMap: (x: number, y: number) => { x: number; y: number };
  projectileConfigs?: Record<number, ProjectileRenderConfig>;
  sortedProjs?: number[]; // Pre-sorted projectile entity IDs from engine
}) => {
  const {
    projectiles,
    players,
    projectileLayer,
    mapSprite,
    worldToMap,
    projectileConfigs,
    sortedProjs,
  } = options;

  if (!projectileLayer || !mapSprite || !projectiles) return;

  const ctx: RenderContext = {
    projectileLayer,
    players,
    worldToMap,
    configs: projectileConfigs,
  };

  // Use pre-sorted projectile IDs from engine if available, otherwise iterate through map keys
  const projIds = sortedProjs || Object.keys(projectiles).map(Number);

  for (const entityId of projIds) {
    const proj = projectiles[entityId];
    if (!proj) continue; // Skip if projectile not found
    
    // Filter out projectiles with negative TTL - don't display any information
    if (proj.ttl !== undefined && proj.ttl < 0) {
      continue;
    }
    
    const typeId = Number(proj.type);
    const typeKey = getProjectileTypeKey(typeId);

    switch (typeKey) {
      case 'Smoke':
        await renderSmoke(proj, typeKey, ctx);
        break;
      case 'Molotov':
      case 'Incendiary':
        await renderFire(proj, typeKey, ctx);
        break;
      case 'HE':
        await renderHE(proj, typeKey, ctx);
        break;
      case 'Flash':
        await renderFlash(proj, typeKey, ctx);
        break;
      case 'Decoy':
        await renderDecoy(proj, typeKey, ctx);
        break;
      default:
        await renderDefault(proj, typeKey, ctx);
        break;
    }
  }
};

