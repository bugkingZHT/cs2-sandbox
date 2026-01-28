import { Assets, Container, Graphics, Sprite } from 'pixi.js';
import type { Frame, PlayerState, ProjectileState, ProjectileRenderConfig } from '@/types/replay';
import { EQUIPMENT_ID_MAP } from '@/config/equipment';

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
const DEFAULT_LOGIC_CONFIG = {
  explosionRadius: 160,
};

export const clearProjectilesLayer = (projectileLayer: Container | null) => {
  if (!projectileLayer) return;
  projectileLayer.removeChildren();
};

interface RenderContext {
  projectileLayer: Container;
  players: PlayerState[];
  frames: Frame[];
  currentFrameIndex: number;
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
  const { frames, currentFrameIndex, worldToMap, players, projectileLayer } = ctx;
  const points: { x: number; y: number }[] = [];

  // 从当前帧向后查找，直到该投掷物不存在
  for (let i = currentFrameIndex; i >= 0; i--) {
    const f = frames[i];
    // Use direct lookup for Record<number, ProjectileState>
    // Note: proj.entityID must be defined. If frames structure is correct, this should work.
    const p = f.projectiles?.[proj.entityID];
    if (p) {
      points.push({ x: p.x, y: p.y });
    } else {
      break;
    }
  }

  if (points.length > 1) {
    // 逆序以保证时间顺序（从出生到当前）
    points.reverse();

    const thrower = players.find(
      (p) => p.steamID === proj.throwerSteamID || p.name === proj.throwerName,
    );
    let trajColor = 0xff6b6b;
    if (thrower) {
      trajColor = thrower.team === 3 ? 0x4dabf7 : 0xff922b;
    }
    if (colorOverride !== undefined) {
      trajColor = colorOverride;
    }

    const trajectoryG = new Graphics();
    const startMapPos = worldToMap(points[0].x, points[0].y);
    trajectoryG.moveTo(startMapPos.x, startMapPos.y);

    for (let i = 1; i < points.length; i++) {
      const mapPoint = worldToMap(points[i].x, points[i].y);
      trajectoryG.lineTo(mapPoint.x, mapPoint.y);
    }

    // 修改：线条变粗增强可见性 (width: 2)
    trajectoryG.stroke({ width: 2, color: trajColor, alpha: 0.8 });

    // 绘制碰撞点
    if (proj.trajectory && proj.trajectory.length > 0) {
      for (const cp of proj.trajectory) {
        const cpMapPos = worldToMap(cp.x, cp.y);
        // 碰撞点也稍微变小一点
        trajectoryG.circle(cpMapPos.x, cpMapPos.y, 2).fill({ color: trajColor, alpha: 1.0 });
      }
    }

    projectileLayer.addChild(trajectoryG);
  }
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
      (p) => p.steamID === proj.throwerSteamID || p.name === proj.throwerName,
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
  await renderAreaEffect(proj, typeKey, ctx);
};

// 闪光弹渲染逻辑
const renderFlash = async (proj: ProjectileState, typeKey: string, ctx: RenderContext) => {
  // 闪光效果：亮白色
  await renderAreaEffect(proj, typeKey, ctx, {
    fillColor: 0xffffff,
    fillAlpha: 0.8,
    strokeColor: 0xffffff
  });
};

// 诱饵弹渲染逻辑
const renderDecoy = async (proj: ProjectileState, typeKey: string, ctx: RenderContext) => {
  // 诱饵弹效果：亮白色
  await renderAreaEffect(proj, typeKey, ctx, {
    fillColor: 0xffffff,
    fillAlpha: 0.6,
    strokeColor: 0xffffff
  });
};

// 高爆手雷渲染逻辑
const renderHE = async (proj: ProjectileState, typeKey: string, ctx: RenderContext) => {
  // HE 爆炸效果：暗黄色
  await renderAreaEffect(proj, typeKey, ctx, {
    fillColor: 0xccac00, // Dark Yellow
    fillAlpha: 0.6,
    strokeColor: 0xffff00
  });
};

// 燃烧瓶/火瓶渲染逻辑
const renderFire = async (proj: ProjectileState, typeKey: string, ctx: RenderContext) => {
   // 火焰效果：暗红色
   await renderAreaEffect(proj, typeKey, ctx, {
     fillColor: 0x8b0000, // Dark Red
     fillAlpha: 0.5,
     strokeColor: 0xff4500
   });
};

// 默认渲染逻辑（保持原有逻辑）
const renderDefault = async (proj: ProjectileState, typeKey: string, ctx: RenderContext) => {
  const { projectileLayer, worldToMap } = ctx;
  const uiConfig = getUIConfig(typeKey);

  // 1. 绘制轨迹
  drawTrajectory(proj, ctx);

  // 2. 绘制图标
  await drawIcon(proj, typeKey, ctx, uiConfig.iconScale);

  // 3. 如果已爆炸，绘制范围效果（叠加在图标上，或者作为背景）
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
  }
};

export const drawProjectilesForFrame = async (options: {
  projectiles: Record<number, ProjectileState> | undefined;
  players: PlayerState[];
  projectileLayer: Container | null;
  mapSprite: Sprite | null;
  frames: Frame[] | undefined;
  currentFrameIndex: number;
  worldToMap: (x: number, y: number) => { x: number; y: number };
  projectileConfigs?: Record<number, ProjectileRenderConfig>;
}) => {
  const {
    projectiles,
    players,
    projectileLayer,
    mapSprite,
    frames,
    currentFrameIndex,
    worldToMap,
    projectileConfigs,
  } = options;

  if (!projectileLayer || !mapSprite || !frames || !projectiles) return;

  const ctx: RenderContext = {
    projectileLayer,
    players,
    frames,
    currentFrameIndex,
    worldToMap,
    configs: projectileConfigs,
  };

  for (const key in projectiles) {
    const proj = projectiles[key];
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

