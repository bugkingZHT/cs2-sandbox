/**
 * 收藏战术条目：与 replayer 当前页 URL 关联，存 IndexedDB
 */
export type TacticTeam = 'CT' | 'T';

export interface TacticFavorite {
  id: string;
  pageUrl: string;
  mapName: string;
  name: string;
  team?: TacticTeam;
  tags: string[];
  content: string;
  createdAt: number;
  updatedAt?: number;
}

/** 预设标签（固定），与自定义标签一起展示 */
export const PRESET_TACTIC_TAGS = ['Full-BUY', 'ECO', 'PISTROL', 'Anti-ECO'] as const;

export type PresetTacticTag = (typeof PRESET_TACTIC_TAGS)[number];
