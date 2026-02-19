/**
 * 剪辑模式发布笔记：将当前拼接的 merged 回合 fork 成新 demo（新 UUID + round_0.pb），
 * 供上传流程使用。
 */
import type { Frame, ReplayData, ReplayMeta, ReplayRound, ReplaySettings } from '@/types/replay';
import { getOPFSStorage } from './opfs-storage';
import { getMetaStorage } from './indexdb-storage';
import { encodeReplayRound } from './proto-converters';
import { resolveTeamDisplayName } from './teamDisplay';
import type { UploadReplayContext } from './useNote';

/**
 * Fork 剪辑结果为新 demo：生成新 UUID，写入 meta 到 IndexedDB（含 replaySettings），将 merged 帧写入 OPFS round_0.pb，
 * 返回上传弹窗所需的上下文。
 */
export async function forkClipToNewDemo(
  mergedFrames: Frame[],
  sourceReplay: ReplayData | null,
  replaySettings?: ReplaySettings
): Promise<UploadReplayContext> {
  const newUuid = crypto.randomUUID();
  if (!sourceReplay) {
    throw new Error('缺少源回放信息，无法 fork');
  }

  // Build meta from ReplayMeta fields only; do not spread sourceReplay (ReplayData has frames/id/timestamp
  // and extra fields that must not be written to IndexedDB — put() fails on non-cloneable or oversized values).
  const meta: ReplayMeta = {
    uuid: newUuid,
    uploaderUid: sourceReplay.uploaderUid ?? '',
    uploadTime: sourceReplay.uploadTime ?? 0,
    engineVersion: sourceReplay.engineVersion,
    serverPlayer: sourceReplay.serverPlayer,
    mapName: sourceReplay.mapName ?? '',
    teamCT: sourceReplay.teamCT ?? '',
    teamT: sourceReplay.teamT ?? '',
    scoreCT: sourceReplay.scoreCT ?? 0,
    scoreT: sourceReplay.scoreT ?? 0,
    totalRounds: 1,
    roundResults: [
      {
        round: 0,
        result: 'ct_win',
        costT: 0,
        costCT: 0,
        countT: 0,
        countCT: 0,
      },
    ],
    totalFrames: mergedFrames.length,
    totalDurationMs:
      mergedFrames.length > 1
        ? (mergedFrames[mergedFrames.length - 1]?.timeMs ?? 0) - (mergedFrames[0]?.timeMs ?? 0)
        : 0,
    status: 1,
    totalRawFrames: sourceReplay.totalRawFrames,
    totalParsedFrames: sourceReplay.totalParsedFrames,
    projectileRenderConfig: sourceReplay.projectileRenderConfig,
    fileName: sourceReplay.fileName,
    originPath: sourceReplay.originPath,
    parsingProgress: sourceReplay.parsingProgress,
    parsingStatus: sourceReplay.parsingStatus,
    lastTickTime: sourceReplay.lastTickTime,
    replaySettings: replaySettings ?? undefined,
    fork: true,
  };

  const metaStorage = await getMetaStorage();
  await metaStorage.saveMeta(meta);

  const round: ReplayRound = {
    uuid: newUuid,
    round: 0,
    frames: mergedFrames,
  };
  const roundBytes = await encodeReplayRound(round);
  const opfs = await getOPFSStorage();
  await opfs.saveRound(newUuid, 0, roundBytes);

  return {
    demoId: newUuid,
    roundNumber: 0,
    replay: {
      mapName: sourceReplay.mapName,
      teamCT: resolveTeamDisplayName(sourceReplay.teamCT ?? '', 3, sourceReplay.serverPlayer),
      teamT: resolveTeamDisplayName(sourceReplay.teamT ?? '', 2, sourceReplay.serverPlayer),
    },
  };
}
