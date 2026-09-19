import type { Frame, ProjectileRenderConfig, ProjectileState } from '../../types/replay';
import { projectileEffectDefaults, projectileKind } from './projectileStyle';

/** Immutable event histories attached to source smoke samples, never playback state. */
export interface SmokeDispersalEvent {
  readonly timeMs: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
}
export type SmokeDispersals = WeakMap<ProjectileState, readonly SmokeDispersalEvent[]>;
const finitePosition = (p: ProjectileState) => [p.x, p.y, p.z].every(Number.isFinite);
const sameEffect = (a: ProjectileState | undefined, b: ProjectileState) => a && a.entityID === b.entityID
  && a.throwerID === b.throwerID && projectileKind(a.type) === projectileKind(b.type);
const live = (p: ProjectileState) => p.isExploded && (p.ttl ?? 0) > 0 && finitePosition(p);
const radius = (config: ProjectileRenderConfig | undefined, kind: string) =>
  Math.min(500, Math.max(20, (config?.explosionRadius ?? 0) > 0 ? config!.explosionRadius : projectileEffectDefaults(kind).radius));

/** Last duplicate sample wins, matching replay sampling. Unknown clip-start blasts
 * and discontinuities cannot invent a fresh clearance or affect another life/round.
 */
export function buildSmokeDispersals(source: readonly Frame[], configs?: Record<number, ProjectileRenderConfig>): SmokeDispersals {
  const histories: SmokeDispersals = new WeakMap();
  const frames: Frame[] = [];
  for (const frame of source) {
    if (frames.length && frames[frames.length - 1].timeMs === frame.timeMs) frames[frames.length - 1] = frame;
    else frames.push(frame);
  }
  const heRadius = radius(configs?.[506], 'hegrenade');
  const smokeRadius = radius(configs?.[505], 'smoke');
  let previous: Frame | undefined;
  for (const frame of frames) {
    if (!Number.isFinite(frame.timeMs)) { previous = undefined; continue; }
    const gap = previous ? frame.timeMs - previous.timeMs : NaN;
    if (previous && previous.round === frame.round && gap > 0 && gap <= 500) {
      const projectiles = Object.entries(frame.projectiles || {});
      const blasts = configs?.[506]?.canClearSmoke === false ? [] : projectiles.filter(([key, p]) => {
        if (projectileKind(p.type) !== 'hegrenade' || !live(p)) return false;
        const before = previous!.projectiles?.[Number(key)];
        return !sameEffect(before, p) || !before!.isExploded || (before!.ttl ?? 0) <= gap
          || p.ttl! > before!.ttl!;
      }).map(([, p]) => p);
      for (const [key, smoke] of projectiles) {
        if (projectileKind(smoke.type) !== 'smoke' || !live(smoke)) continue;
        const before = previous.projectiles?.[Number(key)];
        const continues = sameEffect(before, smoke) && before!.isExploded && (before!.ttl ?? 0) > gap
          && smoke.ttl! <= before!.ttl!;
        let events = continues ? histories.get(before!) : undefined;
        // Approximate the cloud in true XYZ: its volume rises above the ground
        // anchor. A blast must overlap it, not merely share its radar coordinates.
        const hits = blasts.filter(he => Math.hypot(he.x - smoke.x, he.y - smoke.y,
          he.z - (smoke.z + smokeRadius * 0.65)) <= heRadius + smokeRadius);
        if (hits.length) events = [...(events || []), ...hits.map(he => ({
          timeMs: frame.timeMs, x: he.x, y: he.y, z: he.z, radius: heRadius,
        }))];
        if (events) histories.set(smoke, events);
      }
    }
    previous = frame;
  }
  return histories;
}

/** Hold each local hole for one second, then restore it smoothly over two seconds. Once the smoke's
 * own fade starts, freeze restoration and let its natural envelope shrink it.
 * A new blast during that fade still clears immediately, without resurrecting it.
 */
export function smokeRestoration(eventTimeMs: number, timeMs: number, naturalFadeStartMs = Infinity): number {
  if (!Number.isFinite(timeMs) || timeMs < eventTimeMs) return 1;
  const age = Math.min(timeMs, naturalFadeStartMs) - eventTimeMs;
  const progress = Math.max(0, Math.min(1, (age - 1000) / 2000));
  return progress * progress * (3 - 2 * progress);
}

export function smokeHoleRadius(event: SmokeDispersalEvent, timeMs: number, naturalFadeStartMs = Infinity): number {
  return event.radius * (1 - smokeRestoration(event.timeMs, timeMs, naturalFadeStartMs));
}
