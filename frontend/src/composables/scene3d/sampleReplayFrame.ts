import type { Frame, PlayerState, ProjectileState } from '../../types/replay';

const MAX_SAMPLE_GAP_MS = 500;
const MAX_PLAYER_DISPLACEMENT = 512;

export interface ScenePoint { x: number; y: number; z: number }
export const PLAYER_EYE_HEIGHT = 64;

/** Source uses Z-up. Keep its world-unit scale and handedness in Three's Y-up space. */
export function demoToScene(x: number, y: number, z = 0): ScenePoint {
  return { x, y: z, z: -y };
}

export function sceneToDemo(x: number, y: number, z: number): ScenePoint {
  return { x, y: -z, z: y };
}

/** Source pitch is positive looking down; yaw zero looks along world +X. */
export function demoDirectionToScene(yaw: number, pitch = 0): ScenePoint {
  const radians = Math.PI / 180;
  const horizontal = Math.cos(pitch * radians);
  return {
    x: horizontal * Math.cos(yaw * radians),
    y: -Math.sin(pitch * radians),
    z: -horizontal * Math.sin(yaw * radians),
  };
}

const lerp = (from: number, to: number, alpha: number) => from + (to - from) * alpha;
const optionalLerp = (from: number | undefined, to: number | undefined, alpha: number) =>
  Number.isFinite(from) && Number.isFinite(to) ? lerp(from!, to!, alpha) : from;

const shortestYaw = (from: number, to: number, alpha: number) => {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return from;
  const delta = (((to - from) % 360 + 540) % 360) - 180;
  return from + delta * alpha;
};

const finitePosition = (point: { x: number; y: number; z?: number }) =>
  Number.isFinite(point.x) && Number.isFinite(point.y)
  && (point.z === undefined || Number.isFinite(point.z));

function samplePlayer(current: PlayerState, next: PlayerState, alpha: number): PlayerState {
  if (!current.alive || current.alive !== next.alive
    || (current.id !== undefined && next.id !== undefined && current.id !== next.id)
    || (current.steamID !== undefined && next.steamID !== undefined && current.steamID !== next.steamID)
    || (current.team !== undefined && next.team !== undefined && current.team !== next.team)
    || !finitePosition(current) || !finitePosition(next)) return current;

  const dz = current.z !== undefined && next.z !== undefined ? next.z - current.z : 0;
  if (Math.hypot(next.x - current.x, next.y - current.y, dz) > MAX_PLAYER_DISPLACEMENT) return current;

  const x = lerp(current.x, next.x, alpha);
  const y = lerp(current.y, next.y, alpha);
  const z = optionalLerp(current.z, next.z, alpha);
  const yaw = shortestYaw(current.yaw, next.yaw, alpha);
  const pitch = optionalLerp(current.pitch, next.pitch, alpha);
  if (x === current.x && y === current.y && z === current.z && yaw === current.yaw && pitch === current.pitch) {
    return current;
  }
  // Keep shotYaw, life state, equipment and all other event data at the source sample.
  return { ...current, x, y, z, yaw, pitch };
}

function sampleProjectile(current: ProjectileState, next: ProjectileState, alpha: number): ProjectileState {
  if (current.isExploded || current.entityID !== next.entityID || current.type !== next.type
    || current.throwerID !== next.throwerID || !finitePosition(current) || !finitePosition(next)) return current;

  // Projectiles can travel much farther than players between samples. A final
  // detonation sample supplies its landing point, but never its effect state early.
  const x = lerp(current.x, next.x, alpha);
  const y = lerp(current.y, next.y, alpha);
  const z = optionalLerp(current.z, next.z, alpha) as number;
  if (x === current.x && y === current.y && z === current.z) return current;
  return { ...current, x, y, z };
}

function frameIndexAtTime(frames: Frame[], timeMs: number, hintIndex?: number): number {
  if (Number.isInteger(hintIndex) && hintIndex! >= 0 && hintIndex! < frames.length) {
    const hinted = frames[hintIndex!];
    const following = frames[hintIndex! + 1];
    if (hinted.timeMs <= timeMs && (!following || following.timeMs > timeMs)) return hintIndex!;
  }
  // Upper-bound search makes a seek to an event's exact time take effect now,
  // including repeated timestamps. The input is the existing chronological array.
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (frames[mid].timeMs <= timeMs) low = mid + 1;
    else high = mid;
  }
  return Math.max(0, low - 1);
}

/**
 * A display-only view of the replay at a clock time, independent of play/pause or
 * seek direction. Frame timestamps/ticks and discrete events remain those of the
 * preceding sample. Consumers must treat the result and shared fields as read-only.
 * No sorting, extrapolation, source mutation, or persistent sampling state occurs.
 */
export function sampleReplayFrame(frames: Frame[], timeMs: number, hintIndex?: number): Frame | undefined {
  if (!frames.length || !Number.isFinite(timeMs)) return undefined;
  const index = frameIndexAtTime(frames, timeMs, hintIndex);
  const current = frames[index];
  const next = frames[index + 1];
  if (!next || timeMs <= current.timeMs || current.round !== next.round) return current;
  const gap = next.timeMs - current.timeMs;
  if (!Number.isFinite(gap) || gap <= 0 || gap > MAX_SAMPLE_GAP_MS) return current;
  const alpha = Math.max(0, Math.min(1, (timeMs - current.timeMs) / gap));

  // Clone lazily: stationary maps/objects are shared; trajectories and metadata are
  // never copied per display refresh. The renderer appends its own live trail tip.
  let players = current.players;
  for (const id in current.players) {
    const before = current.players[id];
    const after = next.players[id];
    if (!after) continue;
    const sampled = samplePlayer(before, after, alpha);
    if (sampled !== before) {
      if (players === current.players) players = { ...current.players };
      players[id] = sampled;
    }
  }
  let projectiles = current.projectiles;
  if (current.projectiles && next.projectiles) {
    for (const id in current.projectiles) {
      const before = current.projectiles[id];
      const after = next.projectiles[id];
      if (!after) continue;
      const sampled = sampleProjectile(before, after, alpha);
      if (sampled !== before) {
        if (projectiles === current.projectiles) projectiles = { ...current.projectiles };
        projectiles![id] = sampled;
      }
    }
  }
  // BombFrame has no carrier identity; retain it verbatim. Carried C4 should be
  // attached to its interpolated player by the renderer, not blended across states.
  if (players === current.players && projectiles === current.projectiles) return current;
  return { ...current, players, projectiles };
}
