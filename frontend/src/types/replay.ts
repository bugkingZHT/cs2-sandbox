export interface PlayerState {
  id: number;
  name: string;
  team: number; // 2 = T, 3 = CT（根据示例数据）
  x: number;
  y: number;
  alive: boolean;
  yaw: number;
  // 可选：后端如果提供血量、护甲、金钱等信息，可以直接挂在这里
  hp?: number;
  armor?: number;
  money?: number;
}
export interface Frame {
  timeMs: number;
  tick: number;
  round: number;
  players: PlayerState[];
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
