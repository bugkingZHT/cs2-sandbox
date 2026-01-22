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
  throwerSteamID: number;
  entityID: number;
  trajectory?: Point[];
  isExploded?: boolean; // 投掷物是否已爆炸/生效
}

export interface Frame {
  timeMs: number;
  tick: number;
  round: number;
  players: PlayerState[];
  projectiles?: ProjectileState[];
}

export interface ReplayData {
  mapName: string;
  teamCT: string;
  teamT: string;
  scoreCT: number;
  scoreT: number;
  frames: Frame[];
  // 额外字段用于列表展示
  id?: string;
  timestamp?: number;
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
