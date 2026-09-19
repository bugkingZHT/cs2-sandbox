import type { Frame, ProjectileState } from '../../types/replay';
import { projectileKind } from './projectileStyle';

/** Exploded samples remain shared by sampleReplayFrame; no per-refresh lookup scan. */
export type ProjectileEffectStarts = WeakMap<ProjectileState, number>;

/** Index observed activations, including infernos born with a new entity ID.
 * Already-active effects at clip starts/gaps stay settled instead of bursting again.
 * TTL is only an expiry clock: actual inferno lifetimes can differ from config.
 */
export function buildProjectileEffectStarts(frames: readonly Frame[]): ProjectileEffectStarts {
  const starts: ProjectileEffectStarts = new WeakMap();
  let previous: Frame | undefined;
  for (const frame of frames) {
    if (!Number.isFinite(frame.timeMs)) { previous = undefined; continue; }
    const gap = previous ? frame.timeMs - previous.timeMs : NaN;
    const continuous = previous && previous.round === frame.round && gap > 0 && gap <= 500;
    for (const [id, current] of Object.entries(frame.projectiles || {})) {
      if (!current.isExploded || (current.ttl ?? 0) <= 0 || !continuous) continue;
      const before = previous!.projectiles?.[id];
      const same = before && before.entityID === current.entityID && before.throwerID === current.throwerID
        && projectileKind(before.type) === projectileKind(current.type);
      const start = same && before.isExploded && (before.ttl ?? 0) > 0
        ? starts.get(before) : frame.timeMs;
      if (start !== undefined) starts.set(current, start);
    }
    previous = frame;
  }
  return starts;
}

export function effectGrowth(ageMs: number, durationMs: number, delayMs = 0): number {
  const t = Math.max(0, Math.min(1, (ageMs - delayMs) / Math.max(1, durationMs)));
  return 1 - (1 - t) ** 3;
}
