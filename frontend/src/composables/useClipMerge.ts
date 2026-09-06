import { ref, watch, onScopeDispose } from 'vue';
import type { Ref } from 'vue';
import type { Frame, ReplayData, ReplayRound, PlayerInfo, ClipRoundConfig, ProjectileState } from '@/types/replay';
import { fetchLocalRound } from './useReplayData';
import { getDisplayTeam } from '@/config/game';

/** 找到 timeMs <= targetMs 的最后一帧；不把已经结束的回合冻结在时间线上。 */
function frameAt(frames: Frame[], time: number): Frame | undefined {
  if (!frames.length || time < frames[0].timeMs || time > frames[frames.length - 1].timeMs) return;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (frames[mid].timeMs <= time) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo];
}

/** 沿用回合合并的玩家/实体 ID 重映射；反查时每次投掷独立对齐。 */
export function mergeReplayRounds(meta: ReplayData, configs: ClipRoundConfig[], rounds: Map<number, ReplayRound>) {
  const aligned = configs.some(c => c.anchorTimeMs != null);
  const sources = configs.map(c => {
    const frames = rounds.get(c.round)?.frames;
    if (!frames?.length) throw new Error(`第 ${c.round} 回合没有可用帧`);
    return frames;
  });
  const anchors = configs.map((c, i) => c.anchorTimeMs ?? sources[i][0].timeMs);
  const anchorTimeMs = aligned
    ? Math.max(...anchors.map((t, i) => t - sources[i][0].timeMs))
    : sources[0][0].timeMs;
  const serverPlayer: PlayerInfo[] = [];
  let maxPlayerId = 0, maxEntityId = 0;
  const segments = configs.map((cfg, segmentIndex) => {
    const offset = segmentIndex ? maxPlayerId + 1 : 0;
    const entityOffset = segmentIndex ? maxEntityId + 1 : 0;
    const ids = new Set<number>();
    const segment = sources[segmentIndex].map(f => {
      const players: Frame['players'] = {};
      for (const [key, value] of Object.entries(f.players ?? {})) {
        const id = Number(key);
        if (cfg.playerIds && !cfg.playerIds.includes(id)) continue;
        const newId = id + offset;
        players[newId] = { ...value, id: newId };
        ids.add(id);
        maxPlayerId = Math.max(maxPlayerId, newId);
      }
      const projectiles: Record<number, ProjectileState> = {};
      for (const [key, p] of Object.entries(f.projectiles ?? {})) {
        if (cfg.playerIds && !cfg.playerIds.includes(p.throwerID)) continue;
        if (cfg.projectileId != null && Number(key) !== cfg.projectileId && Number(key) !== cfg.effectEntityId) continue;
        const id = (Number(key) === cfg.effectEntityId ? cfg.projectileId! : Number(key)) + entityOffset;
        if (projectiles[id]?.isExploded && !p.isExploded) continue;
        projectiles[id] = { ...p, entityID: id, throwerID: p.throwerID + offset };
        maxEntityId = Math.max(maxEntityId, id);
      }
      const killEvents: NonNullable<Frame['killEvents']> = {};
      for (const [key, event] of Object.entries(f.killEvents ?? {})) {
        if (cfg.playerIds && (!cfg.playerIds.includes(Number(key)) || !cfg.playerIds.includes(event.killerId))) continue;
        killEvents[Number(key) + offset] = { ...event, killerId: event.killerId + offset };
      }
      return {
        ...f, round: 1, timeMs: f.timeMs - anchors[segmentIndex] + anchorTimeMs,
        players, projectiles, sortedProjs: Object.keys(projectiles).map(Number).sort((a, b) => a - b), killEvents,
        bomb: aligned ? undefined : f.bomb,
        droppedEquipment: aligned ? undefined : f.droppedEquipment,
      };
    });
    for (const id of ids) {
      const info = meta.serverPlayer?.find(p => p.id === id);
      serverPlayer.push({
        ...info, id: id + offset,
        name: `${info?.name ?? 'Player ' + id} · R${cfg.round}${cfg.projectileId != null ? ' · #' + cfg.projectileId : ''}`,
        team: getDisplayTeam(info?.team ?? 0, cfg.round), steamID: info?.steamID ?? 0, isBot: info?.isBot ?? false,
      });
    }
    return segment;
  });
  // ponytail: 客户端按所选投掷合并；大规模跨对局检索时再迁移到服务端索引。
  const times = [...new Set(segments.flatMap(s => s.map(f => f.timeMs)))].sort((a, b) => a - b);
  const frames: Frame[] = times.map(timeMs => {
    const current = segments.map(s => frameAt(s, timeMs)).filter((f): f is NonNullable<typeof f> => !!f);
    const base = current[0];
    const projectiles = Object.assign({}, ...current.map(f => f.projectiles));
    return {
      timeMs, tick: base.tick, round: 1, roundTime: base.roundTime,
      players: Object.assign({}, ...current.map(f => f.players)),
      projectiles, sortedProjs: Object.keys(projectiles).map(Number).sort((a, b) => a - b),
      killEvents: Object.assign({}, ...current.map(f => f.killEvents)),
      bomb: base.bomb, droppedEquipment: base.droppedEquipment,
    };
  });
  return { frames, serverPlayer, anchorTimeMs: aligned ? anchorTimeMs : null };
}

export function useClipMerge(replay: Ref<ReplayData | null | undefined>, clipRounds: Ref<ClipRoundConfig[]>) {
  const mergedFrames = ref<Frame[]>([]);
  const mergedServerPlayer = ref<PlayerInfo[]>([]);
  const anchorTimeMs = ref<number | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let request = 0;
  async function loadAndMerge() {
    const revision = ++request;
    const meta = replay.value;
    const configs = clipRounds.value;
    mergedFrames.value = [];
    mergedServerPlayer.value = [];
    anchorTimeMs.value = null;
    error.value = null;
    loading.value = !!meta && configs.length > 0;
    if (!loading.value || !meta) return;
    try {
      const rounds = new Map<number, ReplayRound>();
      for (const round of new Set(configs.map(c => c.round))) {
        rounds.set(round, await fetchLocalRound(meta.uuid, round));
        if (revision !== request) return;
      }
      const result = mergeReplayRounds(meta, configs, rounds);
      anchorTimeMs.value = result.anchorTimeMs;
      mergedServerPlayer.value = result.serverPlayer;
      mergedFrames.value = result.frames;
    } catch (e) {
      if (revision === request) error.value = e instanceof Error ? e.message : '合并回合失败';
    } finally {
      if (revision === request) loading.value = false;
    }
  }
  watch([() => replay.value?.uuid, clipRounds], loadAndMerge, { immediate: true, deep: true });
  onScopeDispose(() => { request++; });
  return { mergedFrames, mergedServerPlayer, anchorTimeMs, loading, error, refresh: loadAndMerge };
}
