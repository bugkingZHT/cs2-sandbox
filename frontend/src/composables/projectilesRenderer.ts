import { Assets, Container, Graphics, Sprite } from 'pixi.js';
import type { Frame, PlayerState, ProjectileState } from '@/types/replay';
import { EQUIPMENT_ID_MAP } from '@/config/equipment';

// 投掷物名称映射
const PROJECTILE_NAME_KEY: Record<string, string> = {
  hegrenade: 'HE',
  flash: 'Flash',
  smoke: 'Smoke',
  molotov: 'Molotov',
  incendiary: 'Incendiary',
  c4: 'C4',
};

// 投掷物类型到SVG文件的映射
const PROJECTILE_ASSETS: Record<string, string> = {
  HE: '/utility/hegrenade.svg',
  Flash: '/utility/flash.svg',
  Smoke: '/utility/smoke.svg',
  Molotov: '/utility/molotov.svg',
  Incendiary: '/utility/incendiary.svg',
  C4: '/utility/c4.svg',
};

export const clearProjectilesLayer = (projectileLayer: Container | null) => {
  if (!projectileLayer) return;
  projectileLayer.removeChildren();
};

export const drawProjectilesForFrame = async (options: {
  projectiles: ProjectileState[];
  players: PlayerState[];
  projectileLayer: Container | null;
  mapSprite: Sprite | null;
  frames: Frame[] | undefined;
  currentFrameIndex: number;
  worldToMap: (x: number, y: number) => { x: number; y: number };
}) => {
  const {
    projectiles,
    players,
    projectileLayer,
    mapSprite,
    frames,
    currentFrameIndex,
    worldToMap,
  } = options;

  if (!projectileLayer || !mapSprite || !frames) return;

  // 1. 绘制轨迹：向前追溯
  for (const proj of projectiles) {
    const points: { x: number; y: number }[] = [];

    // 从当前帧向后查找，直到该投掷物不存在
    for (let i = currentFrameIndex; i >= 0; i--) {
      const f = frames[i];
      const p = f.projectiles?.find((item) => item.entityID === proj.entityID);
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

      const trajectoryG = new Graphics();
      const startMapPos = worldToMap(points[0].x, points[0].y);
      trajectoryG.moveTo(startMapPos.x, startMapPos.y);

      for (let i = 1; i < points.length; i++) {
        const mapPoint = worldToMap(points[i].x, points[i].y);
        trajectoryG.lineTo(mapPoint.x, mapPoint.y);
      }

      trajectoryG.stroke({ width: 3, color: trajColor, alpha: 0.8 });

      // 1.1 绘制碰撞点（从 proj.trajectory 获取）
      if (proj.trajectory && proj.trajectory.length > 0) {
        for (const cp of proj.trajectory) {
          const cpMapPos = worldToMap(cp.x, cp.y);
          trajectoryG.circle(cpMapPos.x, cpMapPos.y, 4).fill({ color: trajColor, alpha: 1.0 });
        }
      }

      projectileLayer.addChild(trajectoryG);
    }
  }

  // 2. 绘制当前位置图标
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

      // 2.1 如果已爆炸，绘制范围效果（大发光圆圈）
      if (proj.isExploded) {
        const explosionG = new Graphics();
        let explosionColor = 0xffffff;

        // 根据类型设置不同的爆炸/生效颜色
        if (typeKey === 'Smoke') explosionColor = 0xcccccc;
        else if (typeKey === 'Molotov' || typeKey === 'Incendiary') explosionColor = 0xff6600;
        else if (typeKey === 'HE') explosionColor = 0xff3300;
        else if (typeKey === 'Flash') explosionColor = 0xffffcc;

        // 绘制多层透明圆圈模拟发光效果
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
  }
};

