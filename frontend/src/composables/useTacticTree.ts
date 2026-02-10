import { computed } from 'vue';
import type { Ref } from 'vue';
import type { TacticFavorite, TacticTreeNode, TacticTreeItem } from '@/types/tactics';

/**
 * 从扁平收藏列表 + 树节点列表构建树形结构
 * - 树节点中不存在的 favorite 视为根节点，按 updatedAt/createdAt 排序
 * - 有树节点的按 parentId + order 构建
 * - 若 parent 不在 favorites 中（如被过滤掉），则子节点提升为根
 */
export function useTacticTree(
  favorites: Ref<TacticFavorite[]>,
  treeNodes: Ref<TacticTreeNode[]>
) {
  const treeItems = computed<TacticTreeItem[]>(() => {
    const favs = favorites.value;
    const nodes = treeNodes.value;
    const favMap = new Map(favs.map((f) => [f.id, f]));

    function buildChildren(parentId: string | null, parentDepth: number): TacticTreeItem[] {
      const isRoot = (n: TacticTreeNode) =>
        n.parentId === null || !favMap.has(n.parentId);
      const childrenNodes = nodes
        .filter(
          (n) =>
            favMap.has(n.favoriteId) &&
            (parentId === null ? isRoot(n) : n.parentId === parentId)
        )
        .sort((a, b) => a.order - b.order);
      const result: TacticTreeItem[] = [];
      const depth = parentDepth + 1;
      for (const n of childrenNodes) {
        const fav = favMap.get(n.favoriteId)!;
        result.push({
          favorite: fav,
          depth,
          children: buildChildren(n.favoriteId, depth),
          parentId: parentId || null,
          order: n.order,
        });
      }
      return result;
    }

    const rootsFromTree = buildChildren(null, -1);

    // 不在树中的 favorite 作为根节点追加，按时间排序
    const inTreeIds = new Set(nodes.map((n) => n.favoriteId));
    const orphans = favs
      .filter((f) => !inTreeIds.has(f.id))
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));

    const orphanItems: TacticTreeItem[] = orphans.map((f, i) => ({
      favorite: f,
      depth: 0,
      children: [],
      parentId: null,
      order: rootsFromTree.length + i,
    }));

    return [...rootsFromTree, ...orphanItems];
  });

  return { treeItems };
}

/**
 * 将树形结构扁平化为带 depth 的列表，用于顺序渲染
 */
export function flattenTree(items: TacticTreeItem[]): TacticTreeItem[] {
  const out: TacticTreeItem[] = [];
  function walk(list: TacticTreeItem[]) {
    for (const item of list) {
      out.push(item);
      if (item.children.length) walk(item.children);
    }
  }
  walk(items);
  return out;
}
