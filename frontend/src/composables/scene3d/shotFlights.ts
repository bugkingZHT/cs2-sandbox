import type { Frame, PlayerState } from '../../types/replay';
import { demoDirectionToScene, demoToScene, type ScenePoint } from './sampleReplayFrame';

export const SHOT_SPEED = 4.8;
export const SHOT_RANGE = 1800;
export const MUZZLE_OFFSET = 28;
export const MUZZLE_DURATION_MS = 70;
export const IMPACT_DURATION_MS = 60;
const MAX_FLIGHT_MS = (SHOT_RANGE - MUZZLE_OFFSET) / SHOT_SPEED;
const MAX_VISIBLE_MS = MAX_FLIGHT_MS + IMPACT_DURATION_MS;
const TARGET_RADIUS = 18;
const TARGET_HEIGHT = 74;

export interface ShotFlight {
  readonly key: string;
  readonly shooterId: number;
  readonly round: number;
  readonly timeMs: number;
  /** Exclusive visibility boundary, including impact time unless a clip cuts it. */
  readonly endTimeMs: number;
  readonly team: number;
  readonly origin: Readonly<ScenePoint>;
  readonly direction: Readonly<ScenePoint>;
  /** Distance from origin, including the muzzle offset; effects wait for arrival. */
  readonly hit?: { readonly distance: number; readonly playerId: number };
}

const EMPTY: readonly ShotFlight[] = [];

export class ShotFlights {
  constructor(private readonly rounds: ReadonlyMap<number, readonly ShotFlight[]>) {}

  /** At most one short flight window is inspected, independent of seek history. */
  active(round: number, timeMs: number): readonly ShotFlight[] {
    const shots = this.rounds.get(round);
    if (!shots || !Number.isFinite(timeMs)) return EMPTY;
    let low = 0;
    let high = shots.length;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      if (shots[mid].timeMs <= timeMs) low = mid + 1;
      else high = mid;
    }
    const active: ShotFlight[] = [];
    for (let i = low - 1; i >= 0 && shots[i].timeMs >= timeMs - MAX_VISIBLE_MS; i--) {
      if (timeMs < shots[i].endTimeMs) active.push(shots[i]);
    }
    return active.reverse();
  }
}

const validPosition = (player: PlayerState) => Number.isFinite(player.x) && Number.isFinite(player.y)
  && (player.z === undefined || Number.isFinite(player.z));
const sameIdentity = (before: PlayerState, after: PlayerState) => before.id === after.id
  && before.steamID === after.steamID && before.team === after.team;
const continuousPlayer = (before: PlayerState, after: PlayerState | undefined) => after !== undefined
  && validPosition(before) && validPosition(after) && sameIdentity(before, after)
  && Math.hypot(after.x - before.x, after.y - before.y, (after.z ?? 0) - (before.z ?? 0)) <= 512;

/** Earliest intersection of a relative segment with a player's feet-based AABB. */
function intersectPlayer(start: ScenePoint, delta: ScenePoint): number | undefined {
  let enter = 0;
  let exit = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const minimum = axis === 'y' ? 0 : -TARGET_RADIUS;
    const maximum = axis === 'y' ? TARGET_HEIGHT : TARGET_RADIUS;
    if (Math.abs(delta[axis]) < 1e-10) {
      if (start[axis] < minimum || start[axis] > maximum) return undefined;
      continue;
    }
    const a = (minimum - start[axis]) / delta[axis];
    const b = (maximum - start[axis]) / delta[axis];
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (enter > exit) return undefined;
  }
  return enter;
}

function flightBoundary(frames: readonly Frame[], index: number, shooterId: number, endTimeMs: number): number {
  for (let i = index; i < frames.length - 1 && frames[i].timeMs < endTimeMs; i++) {
    const current = frames[i];
    const next = frames[i + 1];
    const gap = next.timeMs - current.timeMs;
    // A known data gap cannot act like the genuine end of a clip.
    if (!Number.isFinite(gap) || gap <= 0 || gap > 500) return current.timeMs;
    if (next.round !== current.round
      || !continuousPlayer(current.players[shooterId], next.players[shooterId])) {
      return Math.min(endTimeMs, next.timeMs);
    }
  }
  return endTimeMs;
}

function playerHit(frames: readonly Frame[], index: number, shooterId: number, origin: ScenePoint,
  direction: ScenePoint, endTimeMs: number): ShotFlight['hit'] {
  const shotTime = frames[index].timeMs;
  const arrivalTime = Math.min(shotTime + MAX_FLIGHT_MS, endTimeMs);
  for (let i = index; i < frames.length && frames[i].timeMs < arrivalTime; i++) {
    const current = frames[i];
    const next = frames[i + 1];
    const startTime = current.timeMs;
    const stopTime = Math.min(arrivalTime, next?.timeMs ?? arrivalTime);
    const duration = stopTime - startTime;
    if (!(duration > 0)) break;
    const startDistance = MUZZLE_OFFSET + SHOT_SPEED * (startTime - shotTime);
    let closest: ShotFlight['hit'];
    for (const key in current.players) {
      const playerId = Number(key);
      const target = current.players[key];
      if (playerId === shooterId || !Number.isFinite(playerId) || !target.alive || !validPosition(target)) continue;
      const feet = demoToScene(target.x, target.y, target.z);
      const after = next?.players[key];
      // Match the display sampler: hold a dying, replaced or teleporting player
      // until its discrete boundary rather than sweeping across the discontinuity.
      const moving = next && next.round === current.round && next.timeMs - current.timeMs <= 500
        && after?.alive && continuousPlayer(target, after);
      const amount = moving ? duration / (next.timeMs - current.timeMs) : 0;
      const destination = moving ? demoToScene(after.x, after.y,
        target.z !== undefined && after.z !== undefined ? after.z : target.z) : feet;
      const start = {
        x: origin.x + direction.x * startDistance - feet.x,
        y: origin.y + direction.y * startDistance - feet.y,
        z: origin.z + direction.z * startDistance - feet.z,
      };
      const delta = {
        x: direction.x * SHOT_SPEED * duration - (destination.x - feet.x) * amount,
        y: direction.y * SHOT_SPEED * duration - (destination.y - feet.y) * amount,
        z: direction.z * SHOT_SPEED * duration - (destination.z - feet.z) * amount,
      };
      const fraction = intersectPlayer(start, delta);
      if (fraction === undefined) continue;
      const hitTime = startTime + fraction * duration;
      // A boundary sample decides whether a target is still alive there. The
      // final range endpoint is inclusive, but a clip/shooter cutoff is not.
      if (hitTime >= stopTime && !(stopTime === shotTime + MAX_FLIGHT_MS && stopTime < endTimeMs)) continue;
      const distance = startDistance + SHOT_SPEED * duration * fraction;
      if (!closest || distance < closest.distance) closest = { distance, playerId };
    }
    if (closest) return closest;
    if (!next) break;
  }
  return undefined;
}

/** One visual flight per actual shotsFired sample; no attack-button inference. */
export function buildShotFlights(source: readonly Frame[]): ShotFlights {
  // Last sample wins at duplicate times, exactly as the replay sampler does.
  const frames: Frame[] = [];
  for (const frame of source) {
    if (frames.length && frames[frames.length - 1].timeMs === frame.timeMs) frames[frames.length - 1] = frame;
    else frames.push(frame);
  }
  const rounds = new Map<number, ShotFlight[]>();
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (!Number.isFinite(frame.timeMs) || !Number.isFinite(frame.round)) continue;
    for (const key in frame.players) {
      const shooterId = Number(key);
      const player = frame.players[key];
      if (!Number.isFinite(shooterId) || !Number.isFinite(player.shotsFired) || !(player.shotsFired! > 0)
        || !validPosition(player)) continue;
      const yaw = player.shotYaw ?? player.yaw;
      const pitch = player.pitch ?? 0;
      if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) continue;
      const origin = demoToScene(player.x, player.y, (player.z ?? 0) + 52);
      const direction = demoDirectionToScene(yaw, pitch);
      const boundary = flightBoundary(frames, i, shooterId, frame.timeMs + MAX_VISIBLE_MS);
      const hit = playerHit(frames, i, shooterId, origin, direction, boundary);
      const arrival = frame.timeMs + ((hit?.distance ?? SHOT_RANGE) - MUZZLE_OFFSET) / SHOT_SPEED;
      const flight: ShotFlight = {
        key: `${frame.round}:${frame.timeMs}:${shooterId}`,
        shooterId, round: frame.round, timeMs: frame.timeMs,
        endTimeMs: Math.min(boundary, Math.max(frame.timeMs + MUZZLE_DURATION_MS, arrival + IMPACT_DURATION_MS)),
        team: player.team ?? 0, origin, direction, hit,
      };
      let shots = rounds.get(frame.round);
      if (!shots) rounds.set(frame.round, shots = []);
      shots.push(flight);
    }
  }
  for (const shots of rounds.values()) shots.sort((a, b) => a.timeMs - b.timeMs || a.shooterId - b.shooterId);
  return new ShotFlights(rounds);
}
