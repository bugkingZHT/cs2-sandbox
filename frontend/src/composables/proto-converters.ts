import * as protobuf from 'protobufjs';
import type { ReplayMeta, ReplayRound, Frame, PlayerState, ProjectileState, RoundTimeInfo, KillEvent, ProjectileRenderConfig, Point, BombFrame, DroppedEquipment } from '@/types/replay';

// --- Gzip compress/decompress for pb storage (browser Compression Streams API) ---
const GZIP_MAGIC = new Uint8Array([0x1f, 0x8b]);

function isGzipped(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

export async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([toArrayBuffer(bytes)]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function maybeDecompress(bytes: Uint8Array): Promise<Uint8Array> {
  return isGzipped(bytes) ? gunzipBytes(bytes) : bytes;
}

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

// Decode ReplayMetaPB from binary (supports gzipped input for backward compat)
export async function decodeReplayMeta(bytes: Uint8Array): Promise<ReplayMeta> {
  const raw = await maybeDecompress(bytes);
  console.log(`[ProtoConverter] 🔓 Decoding ReplayMeta, input size: ${bytes.byteLength} bytes${raw !== bytes ? ' (gzipped)' : ''}`);
  const ReplayMetaPB = await getMessageType('ReplayMetaPB');
  const decoded = ReplayMetaPB.decode(raw);
  const obj = ReplayMetaPB.toObject(decoded, {
    longs: Number,
    enums: String,
    bytes: Array,
  });
  
  console.log('[ProtoConverter] Decoded proto object:', {
    hasRoundResults: !!obj.roundResults,
    roundResultsCount: obj.roundResults?.length || 0,
    roundResults: obj.roundResults
  });
  
  const result = protoToReplayMeta(obj);
  console.log('[ProtoConverter] ✅ ReplayMeta decoded:', {
    uuid: result.uuid,
    fileName: result.fileName,
    mapName: result.mapName,
    totalRounds: result.totalRounds,
    hasRoundResults: !!result.roundResults,
    roundResultsCount: result.roundResults?.length || 0
  });
  return result;
}

// Decode ReplayRoundPB from binary (supports gzipped input for backward compat)
export async function decodeReplayRound(bytes: Uint8Array): Promise<ReplayRound> {
  const raw = await maybeDecompress(bytes);
  console.log(`[ProtoConverter] 🔓 Decoding ReplayRound, input size: ${bytes.byteLength} bytes${raw !== bytes ? ' (gzipped)' : ''}`);
  const ReplayRoundPB = await getMessageType('ReplayRoundPB');
  const decoded = ReplayRoundPB.decode(raw);
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
    totalRounds: meta.totalRounds,
    hasRoundResults: !!meta.roundResults,
    roundResultsCount: meta.roundResults?.length || 0,
    roundResults: meta.roundResults
  });
  const ReplayMetaPB = await getMessageType('ReplayMetaPB');
  const protoObj = replayMetaToProto(meta);
  console.log('[ProtoConverter] Proto object before encoding:', {
    hasRoundResults: !!protoObj.roundResults,
    roundResultsCount: protoObj.roundResults?.length || 0
  });
  const message = ReplayMetaPB.create(protoObj);
  const encoded = ReplayMetaPB.encode(message).finish();
  const result = await gzipBytes(encoded);
  console.log(`[ProtoConverter] ✅ ReplayMeta encoded (gzipped), ${encoded.byteLength} → ${result.byteLength} bytes`);
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
  const encoded = ReplayRoundPB.encode(message).finish();
  const result = await gzipBytes(encoded);
  console.log(`[ProtoConverter] ✅ ReplayRound encoded (gzipped), ${encoded.byteLength} → ${result.byteLength} bytes`);
  return result;
}

// Convert protobuf object to ReplayMeta
function protoToReplayMeta(proto: any): ReplayMeta {
  console.log('[ProtoConverter] Converting proto to ReplayMeta:', {
    hasRoundResults: !!proto.roundResults,
    roundResultsLength: proto.roundResults?.length || 0,
    roundResults: proto.roundResults
  });
  
  const meta = {
    uuid: proto.uuid || '',
    uploaderUid: proto.uploaderUid || '',
    uploadTime: proto.uploadTime || 0,
    mapName: proto.mapName || '',
    teamCT: proto.teamCt || '',
    teamT: proto.teamT || '',
    scoreCT: proto.scoreCt || 0,
    scoreT: proto.scoreT || 0,
    totalRounds: proto.totalRounds || 0,
    roundResults: proto.roundResults?.map((rr: any) => ({
      round: rr.round || 0,
      result: rr.result || 'ct_win',
      costT: rr.costT ?? rr.cost_t,
      costCT: rr.costCT ?? rr.cost_ct,
      countT: rr.countT ?? rr.count_t,
      countCT: rr.countCT ?? rr.count_ct,
    })) || [],
    totalFrames: 0, // Not stored in proto, will be computed client-side
    totalDurationMs: 0, // Not stored in proto, will be computed client-side
    fileName: proto.fileName || '',
    originPath: proto.originPath || '',
    projectileRenderConfig: convertProjectileRenderConfig(proto.projectileRender || {}),
    status: proto.status ?? 1, // Default to 1 (complete) when loading from proto
    parsingProgress: proto.parsingProgress,
    parsingStatus: proto.parsingStatus,
    lastTickTime: proto.lastTickTime,
  };
  
  console.log('[ProtoConverter] Converted meta roundResults:', meta.roundResults);
  return meta;
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
    projectiles,
    sortedProjs: proto.sortedProjs || [],
    killEvents,
    droppedEquipment: (proto.droppedEquipment || []).map((de: any) => ({
      type: String(de.type || 0),
      x: de.x || 0,
      y: de.y || 0,
      z: de.z || 0,
    })),
    bomb: proto.bomb ? protoToBombFrame(proto.bomb) : undefined,
  };
}

// Convert protobuf object to BombFrame
function protoToBombFrame(proto: any): BombFrame {
  return {
    x: proto.x || 0,
    y: proto.y || 0,
    z: proto.z || 0,
    isPlanted: proto.isPlanted || false,
    state: proto.state || '',
    site: proto.site || '',
  };
}

// Convert protobuf object to PlayerState
function protoToPlayerState(proto: any): PlayerState {
  // Frame data only - metadata fields will be enriched from serverPlayer when rendering
  return {
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

  // Convert roundResults to proto format
  const roundResults = meta.roundResults?.map(rr => ({
    round: rr.round,
    result: rr.result,
    costT: rr.costT,
    costCT: rr.costCT,
    countT: rr.countT,
    countCT: rr.countCT,
  })) || [];

  console.log('[ReplayMetaToProto] Converting roundResults:', {
    hasRoundResults: !!meta.roundResults,
    count: meta.roundResults?.length || 0,
    roundResults: meta.roundResults
  });

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
    roundResults: roundResults, // Add round results to proto object
    fileName: meta.fileName || '',
    originPath: meta.originPath || '',
    status: meta.status,
    parsingProgress: meta.parsingProgress,
    parsingStatus: meta.parsingStatus,
    lastTickTime: meta.lastTickTime,
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
    killEvents,
    projectiles,
    sortedProjs: frame.sortedProjs || [],
    droppedEquipment: (frame.droppedEquipment || []).map(de => ({
      type: Number(de.type),
      x: de.x,
      y: de.y,
      z: de.z,
    })),
    bomb: frame.bomb ? bombFrameToProto(frame.bomb) : undefined,
  };
}

// Convert BombFrame to protobuf object
function bombFrameToProto(bomb: BombFrame): any {
  return {
    x: bomb.x,
    y: bomb.y,
    z: bomb.z,
    isPlanted: bomb.isPlanted,
    state: bomb.state,
    site: bomb.site,
  };
}

// Convert PlayerState to protobuf object
function playerStateToProto(player: PlayerState): any {
  // Only include frame-varying fields, not metadata (id, name, team)
  // Metadata is stored in serverPlayer in meta
  return {
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
