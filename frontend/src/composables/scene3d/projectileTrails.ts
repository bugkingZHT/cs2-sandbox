import type { Frame, ProjectileState } from '../../types/replay';
import { demoToScene } from './sampleReplayFrame';

export interface ProjectileTrail {
  readonly round: number;
  readonly times: readonly number[];
  /** Source positions converted once to scene XYZ, before any display interpolation. */
  readonly positions: Float32Array;
}

type PendingTrail = {
  round: number;
  times: number[];
  positions: number[];
  entityID: number;
  type: string;
  throwerID: number;
};

const finitePosition = (p: ProjectileState) =>
  Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

/** Number of recorded points already reached at this playback time. */
export function trailPointCount(trail: ProjectileTrail, timeMs: number): number {
  let low = 0, high = trail.times.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (trail.times[mid] <= timeMs) low = mid + 1;
    else high = mid;
  }
  return low;
}

export class ProjectileTrails {
  constructor(private readonly tracks: ReadonlyMap<number, readonly ProjectileTrail[]>) {}

  /** Lookup uses the sampled frame time, so a held sample in a data gap stays valid. */
  get(entityId: number, round: number, sampleTimeMs: number): ProjectileTrail | undefined {
    const tracks = this.tracks.get(entityId);
    if (!tracks) return;
    let low = 0, high = tracks.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (tracks[mid].times[0] <= sampleTimeMs) low = mid + 1;
      else high = mid;
    }
    const track = tracks[low - 1];
    if (track?.round === round && sampleTimeMs <= track.times[track.times.length - 1]) return track;
  }
}

/**
 * Build once per source frame array. The parser's `trajectory` contains sparse,
 * untimed launch/bounce checkpoints, not every airborne position. Connecting
 * just those checkpoints flattens an entire arc into a chord. These tracks use
 * the actual timed XYZ samples instead, without guessing physics or bounce times.
 */
export function buildProjectileTrails(frames: readonly Frame[]): ProjectileTrails {
  const tracks = new Map<number, PendingTrail[]>();
  let active = new Map<number, PendingTrail>();
  let previous: Frame | undefined;
  for (const frame of frames) {
    if (!Number.isFinite(frame.timeMs)) { active.clear(); previous = undefined; continue; }
    if (!previous || previous.round !== frame.round || frame.timeMs <= previous.timeMs
      || frame.timeMs - previous.timeMs > 500) active.clear();
    const nextActive = new Map<number, PendingTrail>();
    for (const [key, projectile] of Object.entries(frame.projectiles || {})) {
      if (projectile.isExploded || !finitePosition(projectile)) continue;
      const id = Number(key);
      let track = active.get(id);
      if (!track || track.entityID !== projectile.entityID || track.type !== projectile.type
        || track.throwerID !== projectile.throwerID) {
        track = { round: frame.round, times: [], positions: [], entityID: projectile.entityID,
          type: projectile.type, throwerID: projectile.throwerID };
        const occurrences = tracks.get(id) || [];
        occurrences.push(track);
        tracks.set(id, occurrences);
      }
      const p = demoToScene(projectile.x, projectile.y, projectile.z);
      track.times.push(frame.timeMs);
      track.positions.push(p.x, p.y, p.z);
      nextActive.set(id, track);
    }
    active = nextActive;
    previous = frame;
  }
  return new ProjectileTrails(new Map([...tracks].map(([id, occurrences]) => [id,
    occurrences.map(track => ({ round: track.round, times: track.times, positions: new Float32Array(track.positions) })),
  ])));
}
