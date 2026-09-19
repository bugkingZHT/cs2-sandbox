import type { Frame, PlayerState } from '../../types/replay';

/** An observed death, in original Demo world coordinates. */
export interface PlayerDeath {
  readonly playerId: number;
  readonly round: number;
  readonly timeMs: number;
  readonly x: number;
  readonly y: number;
  readonly z?: number;
  readonly yaw: number;
  readonly pitch: number;
}

interface DeathInterval {
  readonly event: PlayerDeath;
  endTimeMs: number;
  includeEnd: boolean;
}

type DeathIndex = ReadonlyMap<number, ReadonlyMap<number, readonly DeathInterval[]>>;

/** Immutable event lookup; playback, pause and seek never change its state. */
export class PlayerDeaths {
  constructor(private readonly deaths: DeathIndex) {}

  get(playerId: number, round: number, timeMs: number): PlayerDeath | undefined {
    if (!Number.isFinite(timeMs)) return undefined;
    const events = this.deaths.get(playerId)?.get(round);
    if (!events) return undefined;
    let low = 0;
    let high = events.length;
    while (low < high) {
      const mid = low + Math.floor((high - low) / 2);
      if (events[mid].event.timeMs <= timeMs) low = mid + 1;
      else high = mid;
    }
    const interval = events[low - 1];
    if (interval && (timeMs < interval.endTimeMs
      || (interval.includeEnd && timeMs === interval.endTimeMs))) return interval.event;
    return undefined;
  }
}

const validPose = (player: PlayerState) => Number.isFinite(player.x) && Number.isFinite(player.y)
  && (player.z === undefined || Number.isFinite(player.z)) && Number.isFinite(player.yaw);

// A missing identity field on one side is also a discontinuity. Names may change
// without replacing the player, so they deliberately do not identify an entity.
const sameIdentity = (before: PlayerState, after: PlayerState) => before.id === after.id
  && before.steamID === after.steamID && before.team === after.team;

/**
 * Index only witnessed alive -> dead transitions. A dead player at a clip start,
 * after a missing sample or beyond a data gap has no event and should render in
 * the settled pose. Events copy the first dead pose, never subsequent corpse data.
 */
export function buildPlayerDeaths(frames: readonly Frame[]): PlayerDeaths {
  const deaths = new Map<number, Map<number, DeathInterval[]>>();
  let active = new Map<number, DeathInterval>();
  let previous: Frame | undefined;

  const close = (interval: DeathInterval, timeMs: number, includeEnd = false) => {
    interval.endTimeMs = timeMs;
    interval.includeEnd = includeEnd;
  };

  for (const frame of frames) {
    if (!Number.isFinite(frame.timeMs)) {
      // There is no usable boundary timestamp; retain only the last known sample.
      for (const interval of active.values()) close(interval, previous!.timeMs, true);
      active.clear();
      previous = undefined;
      continue;
    }
    const gap = previous ? frame.timeMs - previous.timeMs : NaN;
    const continuous = previous !== undefined && frame.round === previous.round
      && gap > 0 && gap <= 500;
    if (!continuous) {
      for (const interval of active.values()) close(interval, frame.timeMs);
      active.clear();
    }

    const nextActive = new Map<number, DeathInterval>();
    for (const key in frame.players) {
      const playerId = Number(key);
      const current = frame.players[key];
      const before = continuous ? previous!.players[key] : undefined;
      if (!Number.isFinite(playerId) || current.alive !== false || !validPose(current)
        || !before || !validPose(before) || !sameIdentity(before, current)) continue;

      let interval = active.get(playerId);
      if (!interval && before.alive === true) {
        interval = {
          event: { playerId, round: frame.round, timeMs: frame.timeMs,
            x: current.x, y: current.y, z: current.z, yaw: current.yaw,
            pitch: Number.isFinite(current.pitch) ? current.pitch! : Number.isFinite(before.pitch) ? before.pitch! : 0 },
          endTimeMs: Infinity,
          includeEnd: false,
        };
        let rounds = deaths.get(playerId);
        if (!rounds) deaths.set(playerId, rounds = new Map());
        let events = rounds.get(frame.round);
        if (!events) rounds.set(frame.round, events = []);
        events.push(interval);
      }
      if (interval) nextActive.set(playerId, interval);
    }
    for (const [playerId, interval] of active) {
      if (!nextActive.has(playerId)) close(interval, frame.timeMs);
    }
    active = nextActive;
    previous = frame;
  }

  // Normally already chronological. Sort sparse events once so a malformed
  // backwards timestamp cannot invalidate binary lookup for unrelated deaths.
  for (const rounds of deaths.values()) {
    for (const events of rounds.values()) events.sort((a, b) => a.event.timeMs - b.event.timeMs);
  }
  return new PlayerDeaths(deaths);
}
