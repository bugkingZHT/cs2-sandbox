import * as protobuf from 'protobufjs';
import type { ReplayMeta, ReplayRound, Frame, PlayerState, ProjectileState, RoundTimeInfo, KillEvent, ProjectileRenderConfig, Point } from '@/types/replay';

// Load proto definitions at module level
let root: protobuf.Root | null = null;

async function loadProtoDefinitions() {
  if (root) return root;
  
  // Load the proto file
  root = await protobuf.load('/pkg/engine/entity/replay.proto');
  return root;
}

// Helper to get message type
async function getMessageType(typeName: string) {
  const protoRoot = await loadProtoDefinitions();
  return protoRoot.lookupType(`entity.${typeName}`);
}

// Decode ReplayMetaPB from binary
export async function decodeReplayMeta(bytes: Uint8Array): Promise<ReplayMeta> {
  console.log(`[ProtoConverter] 🔓 Decoding ReplayMeta, input size: ${bytes.byteLength} bytes`);
  const ReplayMetaPB = await getMessageType('ReplayMetaPB');
  const decoded = ReplayMetaPB.decode(bytes);
  const obj = ReplayMetaPB.toObject(decoded, {
    longs: Number,
    enums: String,
    bytes: Array,
  });
  
  const result = protoToReplayMeta(obj);
  console.log('[ProtoConverter] ✅ ReplayMeta decoded:', {
    uuid: result.uuid,
    fileName: result.fileName,
    mapName: result.mapName,
    totalRounds: result.totalRounds
  });
  return result;
}

// Decode ReplayRoundPB from binary
export async function decodeReplayRound(bytes: Uint8Array): Promise<ReplayRound> {
  console.log(`[ProtoConverter] 🔓 Decoding ReplayRound, input size: ${bytes.byteLength} bytes`);
  const ReplayRoundPB = await getMessageType('ReplayRoundPB');
  const decoded = ReplayRoundPB.decode(bytes);
  const obj = ReplayRoundPB.toObject(decoded, {
    longs: Number,
    enums: String,
    bytes: Array,
  });
  
  const result = protoToReplayRound(obj);
  console.log(`[ProtoConverter] ✅ ReplayRound decoded:`, {
    uuid: result.uuid,
    round: result.round,
    frameCount: result.frames.length
  });
  return result;
}

// Encode ReplayMeta to binary
export async function encodeReplayMeta(meta: ReplayMeta): Promise<Uint8Array> {
  console.log('[ProtoConverter] 🔒 Encoding ReplayMeta:', {
    uuid: meta.uuid,
    fileName: meta.fileName,
    mapName: meta.mapName,
    totalRounds: meta.totalRounds
  });
  const ReplayMetaPB = await getMessageType('ReplayMetaPB');
  const protoObj = replayMetaToProto(meta);
  const message = ReplayMetaPB.create(protoObj);
  const result = ReplayMetaPB.encode(message).finish();
  console.log(`[ProtoConverter] ✅ ReplayMeta encoded, output size: ${result.byteLength} bytes`);
  return result;
}

// Encode ReplayRound to binary
export async function encodeReplayRound(round: ReplayRound): Promise<Uint8Array> {
  console.log(`[ProtoConverter] 🔒 Encoding ReplayRound:`, {
    uuid: round.uuid,
    round: round.round,
    frameCount: round.frames?.length || 0
  });
  const ReplayRoundPB = await getMessageType('ReplayRoundPB');
  const protoObj = replayRoundToProto(round);
  const message = ReplayRoundPB.create(protoObj);
  const result = ReplayRoundPB.encode(message).finish();
  console.log(`[ProtoConverter] ✅ ReplayRound encoded, output size: ${result.byteLength} bytes`);
  return result;
}

// Convert protobuf object to ReplayMeta
function protoToReplayMeta(proto: any): ReplayMeta {
  return {
    uuid: proto.uuid || '',
    uploaderUid: proto.uploaderUid || '',
    uploadTime: proto.uploadTime || 0,
    mapName: proto.mapName || '',
    teamCT: proto.teamCt || '',
    teamT: proto.teamT || '',
    scoreCT: proto.scoreCt || 0,
    scoreT: proto.scoreT || 0,
    totalRounds: proto.totalRounds || 0,
    totalFrames: 0, // Not stored in proto, will be computed client-side
    totalDurationMs: 0, // Not stored in proto, will be computed client-side
    fileName: proto.fileName || '',
    projectileRenderConfig: convertProjectileRenderConfig(proto.projectileRender || {}),
    originalFilePath: proto.originalFilePath || '',
  };
}

// Convert protobuf object to ReplayRound
function protoToReplayRound(proto: any): ReplayRound {
  return {
    uuid: proto.uuid || '',
    round: proto.round || 1,
    frames: (proto.frames || []).map((f: any) => protoToFrame(f)),
  };
}

// Convert protobuf object to Frame
function protoToFrame(proto: any): Frame {
  const players: Record<number, PlayerState> = {};
  if (proto.players) {
    for (const [key, value] of Object.entries(proto.players)) {
      players[Number(key)] = protoToPlayerState(value as any);
    }
  }

  const projectiles: Record<number, ProjectileState> = {};
  if (proto.projectiles) {
    for (const [key, value] of Object.entries(proto.projectiles)) {
      projectiles[Number(key)] = protoToProjectileState(value as any);
    }
  }

  const killEvents: Record<number, KillEvent> = {};
  if (proto.killEvents) {
    for (const [key, value] of Object.entries(proto.killEvents)) {
      killEvents[Number(key)] = {
        killerId: (value as any).killerId || 0,
        assistantId: (value as any).assistantId || 0,
        weaponId: String((value as any).weaponId || 0),
      };
    }
  }

  return {
    timeMs: proto.timeMs || 0,
    tick: proto.tick || 0,
    round: proto.round || 1,
    roundTime: protoToRoundTimeInfo(proto.roundTime),
    players,
    sortedPlayers: proto.sortedPlayers || [],
    projectiles,
    sortedProjs: proto.sortedProjs || [],
    killEvents,
  };
}

// Convert protobuf object to PlayerState
function protoToPlayerState(proto: any): PlayerState {
  return {
    id: proto.id || 0,
    name: proto.name || '',
    team: proto.team || 0,
    x: proto.x || 0,
    y: proto.y || 0,
    z: proto.z || 0,
    yaw: proto.yaw || 0,
    pitch: proto.pitch || 0,
    alive: proto.alive || false,
    health: proto.health || 0,
    armor: proto.armor || 0,
    money: proto.money || 0,
    hasHelmet: proto.hasHelmet || false,
    hasDefuseKit: proto.hasDefuseKit || false,
    isScoped: proto.isScoped || false,
    flashDuration: proto.flashDuration || 0,
    isBlinded: proto.isBlinded || false,
    inventory: (proto.inventory || []).map(String),
    activeWeapon: String(proto.activeWeapon || 0),
    buttons: proto.buttons || [],
    kills: proto.kills || 0,
    assists: proto.assists || 0,
    deaths: proto.deaths || 0,
    moneySpentTotal: proto.moneySpentTotal || 0,
    moneySpentThisRound: proto.moneySpentThisRound || 0,
    equipmentValue: proto.equipmentValue || 0,
    steamID: proto.steamId || 0,
    isBot: proto.isBot || false,
  };
}

// Convert protobuf object to ProjectileState
function protoToProjectileState(proto: any): ProjectileState {
  return {
    type: String(proto.type || 0),
    x: proto.x || 0,
    y: proto.y || 0,
    z: proto.z || 0,
    throwerName: proto.throwerName || '',
    throwerID: proto.throwerId || 0,
    entityID: proto.entityId || 0,
    trajectory: (proto.trajectory || []).map((p: any) => ({
      x: p.x || 0,
      y: p.y || 0,
      z: p.z || 0,
    })),
    isExploded: proto.isExploded || false,
    ttl: proto.ttl || 0,
  };
}

// Convert protobuf object to RoundTimeInfo
function protoToRoundTimeInfo(proto: any): RoundTimeInfo {
  return {
    phase: proto?.phase || 'freezetime',
    timeRemaining: proto?.timeRemaining || 0,
  };
}

// Convert projectile render config map
function convertProjectileRenderConfig(protoMap: any): Record<number, ProjectileRenderConfig> {
  const result: Record<number, ProjectileRenderConfig> = {};
  for (const [key, value] of Object.entries(protoMap)) {
    result[Number(key)] = {
      explosionRadius: (value as any).explosionRadius || 0,
      durationInMs: (value as any).durationInMs || 0,
      canClearSmoke: (value as any).canClearSmoke,
      canExtinguishFire: (value as any).canExtinguishFire,
    };
  }
  return result;
}

// Convert ReplayMeta to protobuf object
function replayMetaToProto(meta: ReplayMeta): any {
  const projectileRender: any = {};
  if (meta.projectileRenderConfig) {
    for (const [key, value] of Object.entries(meta.projectileRenderConfig)) {
      projectileRender[key] = {
        explosionRadius: value.explosionRadius,
        durationInMs: value.durationInMs,
        canClearSmoke: value.canClearSmoke,
        canExtinguishFire: value.canExtinguishFire,
      };
    }
  }

  return {
    uuid: meta.uuid,
    uploaderUid: meta.uploaderUid,
    uploadTime: meta.uploadTime,
    projectileRender,
    mapName: meta.mapName,
    teamCt: meta.teamCT,
    teamT: meta.teamT,
    scoreCt: meta.scoreCT,
    scoreT: meta.scoreT,
    totalRounds: meta.totalRounds,
    fileName: meta.fileName || '',
    originalFilePath: (meta as any).originalFilePath || '',
  };
}

// Convert ReplayRound to protobuf object
function replayRoundToProto(round: ReplayRound): any {
  return {
    uuid: round.uuid,
    round: round.round,
    frames: round.frames.map(frameToProto),
  };
}

// Convert Frame to protobuf object
function frameToProto(frame: Frame): any {
  const players: any = {};
  for (const [key, value] of Object.entries(frame.players)) {
    players[key] = playerStateToProto(value);
  }

  const projectiles: any = {};
  if (frame.projectiles) {
    for (const [key, value] of Object.entries(frame.projectiles)) {
      projectiles[key] = projectileStateToProto(value);
    }
  }

  const killEvents: any = {};
  if (frame.killEvents) {
    for (const [key, value] of Object.entries(frame.killEvents)) {
      killEvents[key] = {
        killerId: value.killerId,
        assistantId: value.assistantId,
        weaponId: Number(value.weaponId),
      };
    }
  }

  return {
    timeMs: frame.timeMs,
    tick: frame.tick,
    round: frame.round,
    roundTime: {
      phase: frame.roundTime.phase,
      timeRemaining: frame.roundTime.timeRemaining,
    },
    players,
    sortedPlayers: frame.sortedPlayers || [],
    killEvents,
    projectiles,
    sortedProjs: frame.sortedProjs || [],
  };
}

// Convert PlayerState to protobuf object
function playerStateToProto(player: PlayerState): any {
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    x: player.x,
    y: player.y,
    z: player.z || 0,
    yaw: player.yaw,
    pitch: player.pitch || 0,
    alive: player.alive,
    health: player.health || 0,
    armor: player.armor || 0,
    money: player.money || 0,
    hasHelmet: player.hasHelmet || false,
    hasDefuseKit: player.hasDefuseKit || false,
    isScoped: player.isScoped || false,
    flashDuration: player.flashDuration || 0,
    isBlinded: player.isBlinded || false,
    inventory: (player.inventory || []).map(Number),
    activeWeapon: Number(player.activeWeapon || 0),
    buttons: player.buttons || [],
    kills: player.kills || 0,
    assists: player.assists || 0,
    deaths: player.deaths || 0,
    moneySpentTotal: player.moneySpentTotal || 0,
    moneySpentThisRound: player.moneySpentThisRound || 0,
    equipmentValue: player.equipmentValue || 0,
    steamId: player.steamID || 0,
    isBot: player.isBot || false,
  };
}

// Convert ProjectileState to protobuf object
function projectileStateToProto(proj: ProjectileState): any {
  return {
    type: Number(proj.type),
    x: proj.x,
    y: proj.y,
    z: proj.z,
    throwerName: proj.throwerName,
    throwerId: proj.throwerID,
    entityId: proj.entityID,
    trajectory: (proj.trajectory || []).map((p: Point) => ({
      x: p.x,
      y: p.y,
      z: p.z,
    })),
    isExploded: proj.isExploded || false,
    ttl: proj.ttl || 0,
  };
}
