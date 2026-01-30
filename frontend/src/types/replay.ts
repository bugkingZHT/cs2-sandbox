export interface PlayerState {
  id: number;
  name: string;
  team: number; // 2 = T, 3 = CT（根据示例数据）
  x: number;
  y: number;
  alive: boolean;
  yaw: number;
  // 根据types.go定义的PlayerFrame结构
  pitch?: number;
  z?: number;
  health?: number;
  armor?: number;
  money?: number;
  hasHelmet?: boolean;
  hasDefuseKit?: boolean;
  isScoped?: boolean;
  flashDuration?: number;
  isBlinded?: boolean;
  inventory?: string[];
  activeWeapon?: string;
  usingItem?: boolean;
  kills?: number;
  assists?: number;
  deaths?: number;
  moneySpentTotal?: number;
  moneySpentThisRound?: number;
  equipmentValue?: number;
  steamID?: number;
  isBot?: boolean;
  buttons?: number[];
}

// 投掷物类型定义
export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface ProjectileState {
  type: string; // EquipmentType
  x: number;
  y: number;
  z: number;
  throwerName: string;
  throwerID: number; // Player's in-game ID (corresponds to PlayerState.id)
  entityID: number;
  trajectory?: Point[];
  isExploded?: boolean; // 投掷物是否已爆炸/生效
  ttl?: number; // Time to live in milliseconds
}

export interface ProjectileRenderConfig {
  explosionRadius: number;
  durationInMs: number;
  canClearSmoke?: boolean;
  canExtinguishFire?: boolean;
}

export interface KillEvent {
  killerId: number;
  assistantId: number;
  weaponId: string;
}

// 回合阶段
export type RoundPhase = 'freezetime' | 'normal' | 'planted' | 'end';

// 回合时间信息
export interface RoundTimeInfo {
  // 当前回合阶段
  phase: RoundPhase;
  // 倒计时剩余秒数
  // freezetime: 冻结时间剩余秒数
  // normal: 回合时间剩余秒数
  // planted: C4 爆炸倒计时剩余秒数
  // end: 0
  timeRemaining: number;
}

export interface Frame {
  timeMs: number;
  tick: number;
  round: number;
  roundTime: RoundTimeInfo; // 回合时间信息
  players: Record<number, PlayerState>; // Player ID -> PlayerState map
  sortedPlayers?: number[]; // Pre-sorted player IDs for rendering order
  projectiles?: Record<number, ProjectileState>;
  sortedProjs?: number[]; // Pre-sorted projectile entity IDs for rendering order
  killEvents?: Record<number, KillEvent>;
}

// 录像元数据（地图整体信息）
export interface ReplayMeta {
  uuid: string;
  uploaderUid: string; // 上传用户 UID (6位字符串)
  uploadTime: number; // 上传时间戳 (Unix milliseconds)
  mapName: string;
  teamCT: string;
  teamT: string;
  scoreCT: number;
  scoreT: number;
  totalRounds: number;
  projectileRenderConfig?: Record<number, ProjectileRenderConfig>;
}

// 单个回合的录像数据
export interface ReplayRound {
  uuid: string;
  round: number;
  frames: Frame[];
}

// WASM 返回的完整数据结构
export interface ParsedReplayData {
  meta: ReplayMeta;
  rounds: ReplayRound[];
}

// 用于前端显示和兼容的完整数据
export interface ReplayData {
  uuid: string;
  uploaderUid: string; // 上传用户 UID
  uploadTime: number; // 上传时间戳
  mapName: string;
  teamCT: string;
  teamT: string;
  scoreCT: number;
  scoreT: number;
  totalRounds: number;
  frames: Frame[];
  projectileRenderConfig?: Record<number, ProjectileRenderConfig>;
  // 额外字段用于列表展示
  id?: string;
  timestamp?: number; // 向后兼容，映射到 uploadTime
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
