import { ref, watch } from 'vue';
import type { Ref } from 'vue';
import type { Frame, ReplayData, ReplayRound, PlayerInfo, ClipRoundConfig, ProjectileState } from '@/types/replay';
import { getReplayStorage } from './indexdb-storage';
import { decodeReplayRound } from './proto-converters';
import { adaptRound } from './replayDataAdapter';

/** 在按 timeMs 升序的帧数组中，找到 timeMs <= targetMs 的最后一帧的索引 */
function frameIndexAtOrBefore(frames: Frame[], targetMs: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  if (hi < 0 || frames[0].timeMs > targetMs) return -1;
  if (frames[hi].timeMs <= targetMs) return hi;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].timeMs <= targetMs) lo = mid;
    else hi = mid;
  }
  return frames[hi].timeMs <= targetMs ? hi : lo;
}

/**
 * 导演剪辑：从 IndexedDB 加载多回合，按选中顺序构成有序结构，以最先选中的回合为 baseRound；
 * 各回合用 timeMs - startMs 对齐后按时间点合并为一条并行时间线。
 */
export function useClipMerge(
  replay: Ref<ReplayData | null | undefined>,
  clipRounds: Ref<ClipRoundConfig[]>
) {
  const mergedFrames = ref<Frame[]>([]);
  const mergedServerPlayer = ref<PlayerInfo[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadAndMerge() {
    const uuid = replay.value?.uuid ?? null;
    const rounds = clipRounds.value;
    if (!uuid || !rounds.length) {
      mergedFrames.value = [];
      mergedServerPlayer.value = [];
      return;
    }

    loading.value = true;
    error.value = null;
    try {
      const storage = await getReplayStorage();
      const engineVersion = replay.value?.engineVersion;
      const serverPlayer = replay.value?.serverPlayer ?? [];

      // 1. 加载所有回合，归一化为 0-based 时间（timeMs - startMs），并做玩家 ID 重映射
      const allSegments: Frame[][] = [];
      const idOffsetsPerSegment: number[] = [];
      let runningMaxPlayerId = 0;
      let runningMaxEntityId = 0;

      for (let roundIdx = 0; roundIdx < rounds.length; roundIdx++) {
        const cfg = rounds[roundIdx];
        const isBaseRound = roundIdx === 0;
        const roundBytes = await storage.loadRound(uuid, cfg.round);
        if (!roundBytes) {
          error.value = `回合 ${cfg.round} 未找到，请先加载该回合`;
          mergedFrames.value = [];
          mergedServerPlayer.value = [];
          return;
        }
        const round: ReplayRound = adaptRound(
          await decodeReplayRound(roundBytes),
          engineVersion
        );
        const sorted = round.frames.sort((a, b) => a.timeMs - b.timeMs);
        const startMs = sorted.length > 0 ? sorted[0].timeMs : 0;

        const playerIdsInSegment = new Set<number>();
        for (const f of sorted) {
          if (f.players) {
            for (const id of Object.keys(f.players).map(Number)) {
              if (cfg.playerIds == null || cfg.playerIds.includes(id)) {
                playerIdsInSegment.add(id);
              }
            }
          }
        }

        const offsetId = allSegments.length === 0 ? 0 : runningMaxPlayerId + 1;
        const idMap = new Map<number, number>();
        for (const oldId of playerIdsInSegment) {
          idMap.set(oldId, oldId + offsetId);
        }
        const segmentMaxId = Math.max(0, ...Array.from(idMap.values()));
        if (allSegments.length > 0) {
          runningMaxPlayerId = Math.max(runningMaxPlayerId, segmentMaxId);
        } else {
          runningMaxPlayerId = segmentMaxId;
        }
        idOffsetsPerSegment.push(offsetId);

        const entityOffset = allSegments.length === 0 ? 0 : runningMaxEntityId + 1;
        let segmentMaxEntityId = 0;

        const normalized: Frame[] = sorted.map((f) => {
          const players: Record<number, typeof f.players[number]> = {};
          if (f.players) {
            for (const [k, v] of Object.entries(f.players)) {
              const oldId = Number(k);
              if (cfg.playerIds != null && !cfg.playerIds.includes(oldId)) continue;
              const newId = idMap.get(oldId) ?? oldId + offsetId;
              players[newId] = { ...v, id: newId };
            }
          }
          let killEvents = f.killEvents;
          if (f.killEvents && Object.keys(f.killEvents).length > 0) {
            killEvents = {};
            for (const [victimKey, ev] of Object.entries(f.killEvents)) {
              const victimOld = Number(victimKey);
              const killerNew = idMap.get(ev.killerId) ?? (ev.killerId + offsetId);
              const victimNew = idMap.get(victimOld) ?? (victimOld + offsetId);
              killEvents[victimNew] = { ...ev, killerId: killerNew };
            }
          }
          let projectiles: Record<number, ProjectileState> | undefined;
          let sortedProjs: number[] | undefined;
          if (f.projectiles && Object.keys(f.projectiles).length > 0) {
            projectiles = {};
            const order: number[] = [];
            for (const [eidStr, proj] of Object.entries(f.projectiles)) {
              const oldEid = Number(eidStr);
              const newEid = oldEid + entityOffset;
              const newThrowerId = idMap.get(proj.throwerID) ?? proj.throwerID + offsetId;
              projectiles[newEid] = { ...proj, entityID: newEid, throwerID: newThrowerId };
              order.push(newEid);
              segmentMaxEntityId = Math.max(segmentMaxEntityId, newEid);
            }
            if (f.sortedProjs?.length) {
              sortedProjs = f.sortedProjs.map((oldEid) => oldEid + entityOffset);
            } else {
              sortedProjs = order.sort((a, b) => a - b);
            }
          } else if (f.sortedProjs?.length) {
            sortedProjs = f.sortedProjs.map((oldEid) => oldEid + entityOffset);
            segmentMaxEntityId = Math.max(segmentMaxEntityId, ...sortedProjs);
          }
          return {
            ...f,
            timeMs: isBaseRound ? f.timeMs : f.timeMs - startMs,
            round: 1,
            players,
            killEvents,
            projectiles,
            sortedProjs,
          };
        });
        runningMaxEntityId = Math.max(runningMaxEntityId, segmentMaxEntityId);

        allSegments.push(normalized);
      }

      const baseSeg = allSegments[0];
      const baseStartMs = baseSeg.length > 0 ? baseSeg[0].timeMs : 0;

      // 2. 时间轴以 baseRound 为准：使用 baseRound 的 timeMs 序列（应用 baseRound 的 start，保持原始时间）
      const sortedTimes = baseSeg.map((f) => f.timeMs);

      // 3. 对每个时间点 T（baseRound 时间），从 base 取该时刻的帧，从其余 segment 取 (T - baseStartMs) 的 0-based 帧并合并
      const merged: Frame[] = [];
      for (const T of sortedTimes) {
        const baseIdx = frameIndexAtOrBefore(baseSeg, T);
        const baseFrame = baseIdx >= 0 ? baseSeg[baseIdx] : null;

        const players: Record<number, NonNullable<Frame['players']>[number]> = {};
        const killEvents: Record<number, NonNullable<Frame['killEvents']>[number]> = {};
        const projectiles: Record<number, ProjectileState> = {};
        const sortedProjs: number[] = [];

        const t0 = T - baseStartMs;
        for (let segIdx = 0; segIdx < allSegments.length; segIdx++) {
          const seg = allSegments[segIdx];
          const idx = frameIndexAtOrBefore(seg, segIdx === 0 ? T : t0);
          if (idx < 0) continue;
          const fr = seg[idx];
          if (fr.players) {
            for (const [idStr, p] of Object.entries(fr.players)) {
              players[Number(idStr)] = p;
            }
          }
          if (fr.killEvents) {
            for (const [vid, ev] of Object.entries(fr.killEvents)) {
              killEvents[Number(vid)] = ev;
            }
          }
          if (fr.projectiles) {
            for (const [eidStr, proj] of Object.entries(fr.projectiles)) {
              projectiles[Number(eidStr)] = proj;
            }
          }
          if (fr.sortedProjs?.length) {
            sortedProjs.push(...fr.sortedProjs);
          }
        }
        sortedProjs.sort((a, b) => a - b);

        merged.push({
          timeMs: T,
          tick: baseFrame?.tick ?? 0,
          round: 1,
          roundTime: baseFrame?.roundTime ?? { phase: 'normal', timeRemaining: 0 },
          players,
          killEvents: Object.keys(killEvents).length > 0 ? killEvents : undefined,
          bomb: baseFrame?.bomb,
          projectiles: Object.keys(projectiles).length > 0 ? projectiles : undefined,
          sortedProjs: sortedProjs.length > 0 ? sortedProjs : undefined,
          droppedEquipment: baseFrame?.droppedEquipment,
        });
      }

      mergedFrames.value = merged;

      const mergedPlayers: PlayerInfo[] = [];
      for (let segIdx = 0; segIdx < rounds.length; segIdx++) {
        const seg = allSegments[segIdx];
        const roundNum = rounds[segIdx].round;
        const offset = idOffsetsPerSegment[segIdx] ?? 0;
        const idsInSeg = new Set<number>();
        for (const f of seg) {
          if (f.players) {
            for (const id of Object.keys(f.players).map(Number)) {
              idsInSeg.add(id);
            }
          }
        }
        for (const newId of idsInSeg) {
          const oldId = newId - offset;
          const info = serverPlayer.find((p) => p.id === oldId);
          const baseName = info?.name ?? `Player ${newId}`;
          mergedPlayers.push(
            info
              ? { ...info, id: newId, name: `${baseName}-${roundNum}` }
              : {
                  id: newId,
                  name: `Player ${newId}-${roundNum}`,
                  team: 0,
                  steamID: 0,
                  isBot: false,
                }
          );
        }
      }
      mergedServerPlayer.value = mergedPlayers;
    } catch (e) {
      console.error('[useClipMerge]', e);
      error.value = e instanceof Error ? e.message : '合并回合失败';
      mergedFrames.value = [];
      mergedServerPlayer.value = [];
    } finally {
      loading.value = false;
    }
  }

  watch(
    [replay, clipRounds] as const,
    ([r, rounds]) => {
      if (r?.uuid && rounds?.length) {
        loadAndMerge();
      } else {
        mergedFrames.value = [];
        mergedServerPlayer.value = [];
        error.value = null;
      }
    },
    { immediate: true, deep: true }
  );

  return {
    mergedFrames,
    mergedServerPlayer,
    loading,
    error,
    refresh: loadAndMerge,
  };
}
