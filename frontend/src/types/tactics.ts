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

/** 战术树节点：在 IndexedDB 单独维护，描述父子关系 */
export interface TacticTreeNode {
  favoriteId: string;
  parentId: string | null;
  order: number;
}

/** 带子节点的树节点（用于渲染） */
export interface TacticTreeItem {
  favorite: TacticFavorite;
  depth: number;
  children: TacticTreeItem[];
  /** 父节点 id，根节点为 null */
  parentId?: string | null;
  /** 在同级中的排序 */
  order?: number;
}
