import type { ClipRoundConfig, Frame, ProjectileState } from '@/types/replay';

export const GRENADE_TYPES = [
  { id: '505', label: '烟', icon: '/utility/smoke.svg' },
  { id: '504', label: '闪', icon: '/utility/flash.svg' },
  { id: '506', label: '雷', icon: '/utility/hegrenade.svg' },
  { id: '502', label: '火', icon: '/utility/molotov.svg' },
] as const;

export interface MapArea { minX: number; maxX: number; minY: number; maxY: number }
export interface GrenadeMatch extends ClipRoundConfig {
  anchorTimeMs: number;
  projectileId: number;
  playerIds: number[];
  estimated: boolean;
}

/** 每个实体只取首次生效位置；消失但没有事件时，用最后可见位置估计。 */
export function findGrenadeLandings(frames: Frame[], round: number, type: string, contains: (p: ProjectileState) => boolean) {
  const entities = new Map<number, { projectile: ProjectileState; last: number; exploded: number; flying: boolean }>();
  for (let i = 0; i < frames.length; i++) {
    for (const p of Object.values(frames[i].projectiles ?? {})) {
      if (p.type !== type && !(type === '502' && p.type === '503')) continue;
      const previous = entities.get(p.entityID);
      if (previous?.exploded !== undefined && previous.exploded >= 0) continue;
      entities.set(p.entityID, {
        projectile: p, last: i, exploded: p.isExploded ? i : -1,
        flying: previous?.flying || !p.isExploded,
      });
    }
  }
  const effects = new Map<number, number>();
  if (type === '502') {
    // ponytail: 沿用解析器的 200 单位邻近范围；无唯一近邻时保留为估计，不强行关联。
    for (const [effectId, effect] of entities) {
      if (effect.flying || effect.exploded <= 0) continue;
      const p = effect.projectile;
      const candidates = [...entities.entries()].filter(([id, flight]) => {
        const previous = frames[effect.exploded - 1].projectiles?.[id];
        return flight.flying && flight.exploded < 0 && !effects.has(id) && previous &&
          !previous.isExploded && flight.projectile.throwerID === p.throwerID &&
          Math.abs(frames[flight.last].timeMs - frames[effect.exploded].timeMs) <= 250 &&
          Math.hypot(previous.x - p.x, previous.y - p.y, previous.z - p.z) <= 200;
      });
      if (candidates.length === 1) effects.set(candidates[0][0], effectId);
    }
  }
  const matches: GrenadeMatch[] = [];
  let missing = 0;
  for (const [id, flight] of entities) {
    const effectEntityId = effects.get(id);
    const { projectile: p, last, exploded } = effectEntityId != null ? entities.get(effectEntityId)! : flight;
    if (!flight.flying && type === '502') continue; // 燃烧区域不是另一次实际投掷。
    const estimated = exploded < 0;
    const before = estimated ? last : exploded - 1;
    if (!flight.flying || before < 0 || (estimated && last === frames.length - 1) ||
        ![p.x, p.y, p.z].every(Number.isFinite) || !frames[before]?.players?.[p.throwerID]) {
      missing++;
      continue;
    }
    if (contains(p)) matches.push({
      round, playerIds: [p.throwerID], projectileId: id, effectEntityId,
      anchorTimeMs: frames[before].timeMs, estimated,
    });
  }
  return { matches, missing };
}
