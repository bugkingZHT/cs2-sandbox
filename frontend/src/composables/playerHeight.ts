import type { Frame } from '@/types/replay';
import { getPlayerHeightReferences, type PlayerHeightReferences } from '@/config/map';

/** Existing replay Z is enough: sustained, nearly level feet positions estimate
 * standing surfaces without requiring a new parser field or treating jumps as ground. */
export function inferGroundHeights(frames: Frame[]): Record<string, number> {
  type LevelRun = { z: number; start: number; end: number; round: number };
  const runs = new Map<string, LevelRun>();
  const histogram: Record<string, number> = {};
  const finish = (run: LevelRun) => {
    const duration = run.end - run.start;
    if (duration < 250) return;
    const z = run.z.toFixed(2);
    histogram[z] = (histogram[z] ?? 0) + duration;
  };
  for (const frame of frames) {
    if (!Number.isFinite(frame.timeMs)) continue;
    const seen = new Set<string>();
    for (const [id, player] of Object.entries(frame.players ?? {})) {
      if (!player.alive || !Number.isFinite(player.z)) continue;
      seen.add(id);
      const z = player.z!;
      const previous = runs.get(id);
      if (previous && previous.round === frame.round && frame.timeMs >= previous.end
        && frame.timeMs - previous.end <= 250 && Math.abs(z - previous.z) <= 4) {
        previous.end = frame.timeMs;
      } else {
        if (previous) finish(previous);
        runs.set(id, { z, start: frame.timeMs, end: frame.timeMs, round: frame.round });
      }
    }
    for (const [id, run] of runs) {
      if (!seen.has(id)) { finish(run); runs.delete(id); }
    }
  }
  for (const run of runs.values()) finish(run);
  return histogram;
}

/** Freeze each floor once calibrated, so playback/visibility/round changes cannot
 * resize everyone. A floor absent from the first loaded round can be filled later. */
export function createPlayerHeightCalibration() {
  let previousKey: string | undefined;
  let previousFrames: Frame[] | undefined;
  let references: PlayerHeightReferences = {};
  return (frames: Frame[] | undefined, key: string | undefined, layerThreshold?: number): PlayerHeightReferences => {
    if (key !== previousKey || layerThreshold !== references.layerThreshold || (!key && frames !== previousFrames)) {
      references = { layerThreshold };
      previousFrames = undefined;
    }
    previousKey = key;
    if (frames !== previousFrames && frames?.length && (references.main == null || (layerThreshold != null && references.lower == null))) {
      const inferred = getPlayerHeightReferences(inferGroundHeights(frames), layerThreshold);
      references = { main: references.main ?? inferred.main, lower: references.lower ?? inferred.lower, layerThreshold };
    }
    previousFrames = frames;
    return references;
  };
}
