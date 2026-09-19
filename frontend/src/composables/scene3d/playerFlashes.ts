import type { Frame, PlayerState } from '../../types/replay';

interface FlashInterval {
  startMs: number;
  endMs: number;
  durationMs: number;
  observedStart: boolean;
}

export const isPlayerBlinded = (player: PlayerState): boolean => player.alive &&
  (player.isBlinded ?? (Number.isFinite(player.flashDuration) && player.flashDuration! > 0));

/** Duration is the parser's total flash time in seconds, not remaining time.
 * Intervals belong to the source replay; pause/seek and observer changes are stateless.
 */
export class PlayerFlashes {
  constructor(private readonly intervals: Map<number, Map<number, FlashInterval[]>>) {}

  opacity(playerId: number, round: number, timeMs: number): number {
    if (!Number.isFinite(timeMs)) return 0;
    const events = this.intervals.get(playerId)?.get(round);
    if (!events) return 0;
    let low = 0, high = events.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (events[mid].startMs <= timeMs) low = mid + 1;
      else high = mid;
    }
    const event = events[low - 1];
    if (!event || timeMs >= event.endMs) return 0;
    // Infer a clip-start flash's earlier onset from its observed ending instead
    // of inventing a full-white flash whenever the observer enters this view.
    const onset = event.observedStart ? event.startMs : event.endMs - event.durationMs;
    const duration = event.endMs - onset;
    if (!(duration > 0)) return 0;
    const hold = Math.min(450, duration * 0.22);
    const progress = Math.max(0, Math.min(1, (timeMs - onset - hold) / (duration - hold)));
    return 1 - progress * progress * (3 - 2 * progress);
  }
}

export function buildPlayerFlashes(source: readonly Frame[]): PlayerFlashes {
  const intervals = new Map<number, Map<number, FlashInterval[]>>();
  const frames: Frame[] = [];
  for (const frame of source) {
    if (frames.length && frames[frames.length - 1].timeMs === frame.timeMs) frames[frames.length - 1] = frame;
    else frames.push(frame);
  }
  let previous: Frame | undefined;
  let active = new Map<number, FlashInterval>();
  const close = (event: FlashInterval, endMs: number) => { event.endMs = Math.min(event.endMs, endMs); };
  for (const frame of frames) {
    const gap = previous ? frame.timeMs - previous.timeMs : NaN;
    const continuous = previous && frame.round === previous.round && gap > 0 && gap <= 500;
    if (!continuous) {
      for (const event of active.values()) close(event, (previous?.timeMs ?? event.startMs) + 1);
      active.clear();
    }
    if (!Number.isFinite(frame.timeMs)) { previous = undefined; continue; }
    const nextActive = new Map<number, FlashInterval>();
    for (const [key, player] of Object.entries(frame.players)) {
      const id = Number(key);
      if (!Number.isFinite(id) || !isPlayerBlinded(player)) continue;
      const before = continuous ? previous!.players[id] : undefined;
      const same = before && before.id === player.id && before.steamID === player.steamID && before.team === player.team;
      const renewed = same && isPlayerBlinded(before) && Number.isFinite(player.flashDuration)
        && player.flashDuration! > 0 && Math.abs(player.flashDuration! - (before.flashDuration ?? 0)) > 0.001;
      let event = same && !renewed ? active.get(id) : undefined;
      if (!event) {
        const durationMs = Number.isFinite(player.flashDuration) && player.flashDuration! > 0
          ? Math.min(20000, player.flashDuration! * 1000) : 1500;
        event = { startMs: frame.timeMs, endMs: frame.timeMs + durationMs, durationMs,
          observedStart: !!same && (!isPlayerBlinded(before) || !!renewed) };
        let rounds = intervals.get(id);
        if (!rounds) intervals.set(id, rounds = new Map());
        let events = rounds.get(frame.round);
        if (!events) rounds.set(frame.round, events = []);
        events.push(event);
      }
      nextActive.set(id, event);
    }
    for (const [id, event] of active) if (nextActive.get(id) !== event) close(event, frame.timeMs);
    active = nextActive;
    previous = frame;
  }
  return new PlayerFlashes(intervals);
}
