export interface PlayerState {
  // Frame-specific state (from PlayerFrame)
  x: number;
  y: number;
  z?: number;
  alive: boolean;
  yaw: number;
  pitch?: number;
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
  kills?: number;
  assists?: number;
  deaths?: number;
  buttons?: number[];
  
  // Metadata fields (enriched from PlayerInfo, not in frame)
  id?: number;
  name?: string;
  team?: number; // 2 = T, 3 = CT
  steamID?: number;
  isBot?: boolean;
}

// 投掷物类型定义
export interface Point {
  x: number;
  y: number;
  z: number;
}

// 回合胜负结果类型
export type RoundResult = 'ct_win' | 't_win' | 'bomb_defused' | 'bomb_exploded';

// 经济类型：Eco 人均 <$1600, Half $1600–$4200, Full ≥$4200
export type EconomyType = 'eco' | 'half' | 'full';

// 单回合结果信息（人均与经济类型由前端根据 cost/count 计算）
export interface RoundResultInfo {
  round: number;
  result: RoundResult;
  /** T 队伍本回合总开销 */
  costT?: number;
  /** CT 队伍本回合总开销 */
  costCT?: number;
  /** T 队伍参与统计人数 */
  countT?: number;
  /** CT 队伍参与统计人数 */
  countCT?: number;
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
  weaponId: string;
}

export interface BombFrame {
  x: number;
  y: number;
  z: number;
  isPlanted: boolean;
  state: string; // planting, defusing, planted, exploded, defused
  site: string;
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

export interface DroppedEquipment {
  type: string;
  x: number;
  y: number;
  z: number;
}

export interface Frame {
  timeMs: number;
  tick: number;
  round: number;
  roundTime: RoundTimeInfo; // 回合时间信息
  players: Record<number, PlayerState>; // Player ID -> PlayerState map
  projectiles?: Record<number, ProjectileState>;
  sortedProjs?: number[]; // Pre-sorted projectile entity IDs for rendering order
  killEvents?: Record<number, KillEvent>;
  droppedEquipment?: DroppedEquipment[];
  bomb?: BombFrame;
}

// 录像元数据（地图整体信息）
export interface ReplayMeta {
  uuid: string;
  uploaderUid: string; // 上传用户 UID (6位字符串)
  uploadTime: number; // 上传时间戳 (Unix milliseconds)
  engineVersion?: string; // 引擎版本号
  serverPlayer?: PlayerInfo[]; // 对局中出现的所有玩家信息（按ID排序）
  mapName: string;
  teamCT: string;
  teamT: string;
  scoreCT: number;
  scoreT: number;
  totalRounds: number;
  roundResults?: RoundResultInfo[]; // 每回合胜负结果列表
  totalFrames: number; // Demo 总帧数（来自 header.PlaybackFrames）
  totalDurationMs: number; // Demo 总时长（毫秒，来自 header.PlaybackTime）
  totalRawFrames?: number; // 总游戏帧数（含 round0/freeze 与未采样的帧），backfill 阶段写入
  totalParsedFrames?: number; // 总采样并保存的帧数（实际输出的 replay 帧数），backfill 阶段写入
  projectileRenderConfig?: Record<number, ProjectileRenderConfig>;
  
  // 文件信息字段（必须在 backfill 时保持不变）
  fileName?: string; // 原始上传文件名（不带.dem后缀）
  originPath?: string; // 原始上传文件路径（完整路径）
  
  // 解析状态统一字段
  status: number; // 0=解析中, 1=完成, -1=失败
  parsingProgress?: number; // 0-100
  parsingStatus?: string; // 状态描述
  lastTickTime?: number; // 最后tick时间戳（用于超时检测）
}

// 玩家基础信息（存储在元数据中）
export interface PlayerInfo {
  id: number; // 玩家在服务器中的唯一 ID
  name: string; // 玩家显示的名称
  team: number; // 玩家所属队伍 (2=T, 3=CT, 1=Spectator)
  steamID: number; // 玩家的 64 位 Steam 唯一标识符
  isBot: boolean; // 该玩家是否为机器人 (BOT)
}

// 单个回合的录像数据
export interface ReplayRound {
  uuid: string;
  round: number;
  frames: Frame[];
}

/** 导演剪辑：每段为回合号，可选该回合要保留的玩家 ID；未指定则保留该回合全部玩家 */
export interface ClipRoundConfig {
  round: number;
  playerIds?: number[];
}

// WASM 返回的完整数据结构
export interface ParsedReplayData {
  meta: ReplayMeta;
  rounds: ReplayRound[];
}

// 用于前端显示和兼容的完整数据
export interface ReplayData extends ReplayMeta {
  frames: Frame[];
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
