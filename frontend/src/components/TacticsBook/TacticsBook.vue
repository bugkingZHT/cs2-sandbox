<template>
  <div class="tactics-book-page">
    <!-- Filter Controls - Match DemoLibrary exactly -->
    <div class="tactics-book-filters">
      <div class="filter-group">
        <label>地图</label>
        <select v-model="filterMap" class="filter-select">
          <option value="">全部地图</option>
          <option v-for="m in uniqueMaps" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label>标签</label>
        <div class="filter-tags">
          <button
            v-for="tag in allTags"
            :key="tag"
            type="button"
            class="filter-tag-btn"
            :class="{ active: filterTags.includes(tag) }"
            @click="toggleFilterTag(tag)"
          >
            {{ tag }}
          </button>
        </div>
      </div>
      <div class="filter-group filter-search">
        <label>名称</label>
        <input
          v-model="filterName"
          type="text"
          class="filter-input"
          placeholder="模糊搜索名称"
        />
      </div>
    </div>

    <div v-if="loading" class="tactics-book-loading">加载中…</div>
    <div v-else-if="flatTreeList.length === 0" class="tactics-book-empty ds-empty">
      <div class="ds-empty-icon">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h3 class="ds-empty-title">暂无收藏战术</h3>
      <p class="ds-empty-description">在 2D 播放器页面点击星标收藏当前回合战术</p>
    </div>
    <div v-else class="tactics-book-body">
      <!-- 左侧：树形列表 -->
      <div
        class="tactics-book-list ds-scrollbar"
        @dragover.prevent="onListDragOver"
        @drop="onDropToRoot"
      >
        <template v-for="(item, index) in flatTreeList" :key="item.favorite.id">
          <div
            v-if="dropIndicator && dropIndicator.insertIndex === index"
            class="tactics-book-drop-line"
            :style="{ marginLeft: 12 + dropIndicator.depth * 20 + 'px' }"
          />
          <div
            class="tactics-book-row"
            :class="{ selected: selectedId === item.favorite.id }"
            :data-index="index"
            @click="selectTactic(item.favorite)"
            @dragover="onCardDragOver($event, item, index)"
            @drop="onDrop($event)"
          >
            <span
              class="tactics-book-drag-handle"
              draggable="true"
              @dragstart="onDragStart($event, item.favorite.id)"
              @dragend="onDragEnd($event)"
            >⋮⋮</span>
            <div class="tactics-book-row-body" :style="{ paddingLeft: item.depth * 20 + 'px' }">
              <span class="tactics-book-row-title">{{ item.favorite.name }}</span>
              <span v-if="item.favorite.tags.length" class="tactics-book-row-tags">
                <span v-for="t in item.favorite.tags" :key="t" class="tactics-book-row-tag">{{ t }}</span>
              </span>
              <span v-else class="tactics-book-row-no-tags">无标签</span>
              <button
                type="button"
                class="ds-btn ds-btn-primary ds-btn-sm tactics-book-row-btn"
                @click.stop="goToReplayer(item.favorite.pageUrl)"
              >
                跳转
              </button>
            </div>
          </div>
        </template>
        <div
          v-if="dropIndicator && dropIndicator.insertIndex === flatTreeList.length"
          class="tactics-book-drop-line"
          :style="{ marginLeft: 12 + (dropIndicator?.depth ?? 0) * 20 + 'px' }"
        />
      </div>

      <!-- 右侧：选中的战术 content -->
      <div class="tactics-book-detail">
        <template v-if="selectedFavorite">
          <div class="tactics-book-detail-content ds-scrollbar">{{ selectedFavorite.content || '暂无描述' }}</div>
        </template>
        <div v-else class="tactics-book-detail-empty">
          选择左侧战术查看详情
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getTacticFavoritesStorage, getTacticTreeStorage } from '@/composables/indexdb-storage';
import { useTacticTags } from '@/composables/useTacticTags';
import { useTacticTree, flattenTree } from '@/composables/useTacticTree';
import { navigate } from '@/location';
import type { TacticFavorite, TacticTreeNode } from '@/types/tactics';

const loading = ref(true);
const allFavorites = ref<TacticFavorite[]>([]);
const treeNodes = ref<TacticTreeNode[]>([]);
const filterMap = ref('');
const filterTags = ref<string[]>([]);
const filterName = ref('');
const selectedId = ref<string | null>(null);

const { allTags } = useTacticTags();

const selectedFavorite = computed(
  () => (selectedId.value ? allFavorites.value.find((f) => f.id === selectedId.value) ?? null : null)
);

function selectTactic(fav: TacticFavorite) {
  selectedId.value = fav.id;
}

const uniqueMaps = computed(() => {
  const set = new Set<string>();
  allFavorites.value.forEach((f) => {
    if (f.mapName) set.add(f.mapName);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
});

function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
}

const filteredFavorites = computed(() => {
  let list = allFavorites.value;
  if (filterMap.value) {
    list = list.filter((f) => f.mapName === filterMap.value);
  }
  if (filterTags.value.length > 0) {
    const set = new Set(filterTags.value);
    list = list.filter((f) => f.tags.some((t) => set.has(t)));
  }
  if (filterName.value.trim()) {
    const q = normalizeForSearch(filterName.value.trim());
    list = list.filter((f) => normalizeForSearch(f.name).includes(q));
  }
  return list.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
});

const { treeItems } = useTacticTree(filteredFavorites, treeNodes);
const flatTreeList = computed(() => flattenTree(treeItems.value));

function toggleFilterTag(tag: string) {
  const i = filterTags.value.indexOf(tag);
  if (i >= 0) filterTags.value = filterTags.value.filter((_, idx) => idx !== i);
  else filterTags.value = [...filterTags.value, tag];
}

function goToReplayer(pageUrl: string) {
  if (!pageUrl) return;
  const [path = '', search = ''] = pageUrl.split('?');
  const query = search ? search : '';
  navigate(path || '/replayer', query);
}

interface DropTarget {
  parentId: string | null;
  order: number;
  insertIndex: number;
  depth: number;
}

const dropIndicator = ref<{ insertIndex: number; depth: number } | null>(null);

function updateDropIndicator(target: DropTarget | null) {
  if (!target) {
    dropIndicator.value = null;
    return;
  }
  dropIndicator.value = { insertIndex: target.insertIndex, depth: target.depth };
}

function isDescendant(ancestorId: string, nodeId: string): boolean {
  const nodes = treeNodes.value;
  const nodeMap = new Map(nodes.map((n) => [n.favoriteId, n]));
  let cur: string | null = nodeId;
  while (cur) {
    const n = nodeMap.get(cur);
    if (!n) break;
    if (n.parentId === ancestorId) return true;
    cur = n.parentId;
  }
  return false;
}

async function setParentAndOrder(
  draggedId: string,
  parentId: string | null,
  order: number
) {
  if (parentId && isDescendant(draggedId, parentId)) return; // 禁止循环引用
  const nodes = treeNodes.value;
  const siblings = nodes.filter((n) => n.parentId === parentId && n.favoriteId !== draggedId);
  const toSave: TacticTreeNode[] = [
    { favoriteId: draggedId, parentId, order },
  ];
  for (const n of siblings) {
    if (n.order >= order) toSave.push({ ...n, order: n.order + 1 });
  }
  try {
    const treeStorage = await getTacticTreeStorage();
    for (const node of toSave) await treeStorage.save(node);
    const all = await treeStorage.getAll();
    treeNodes.value = all;
  } catch (e) {
    console.error('[TacticsBook] setParentAndOrder failed:', e);
  }
}

let draggedId: string | null = null;
let pendingDropTarget: DropTarget | null = null;

function onDragStart(e: DragEvent, favId: string) {
  draggedId = favId;
  pendingDropTarget = null;
  dropIndicator.value = null;
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', favId);
  const row = (e.target as HTMLElement).closest('.tactics-book-row');
  row?.classList.add('tactics-book-row-dragging');
}

function onDragEnd(e: DragEvent) {
  const row = (e.target as HTMLElement)?.closest('.tactics-book-row');
  row?.classList.remove('tactics-book-row-dragging');
  draggedId = null;
  pendingDropTarget = null;
  dropIndicator.value = null;
}

function onCardDragOver(
  e: DragEvent,
  item: { favorite: TacticFavorite; depth: number; parentId?: string | null; order?: number },
  index: number
) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer!.dropEffect = 'move';
  if (!draggedId || draggedId === item.favorite.id) {
    updateDropIndicator(null);
    return;
  }
  if (isDescendant(draggedId, item.favorite.id)) {
    updateDropIndicator(null);
    return;
  }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const y = e.clientY - rect.top;
  const h = rect.height;
  const parentId = item.parentId ?? null;
  const itemOrder = item.order ?? 0;
  const itemDepth = item.depth;
  if (y < h * 0.25) {
    pendingDropTarget = {
      parentId,
      order: itemOrder,
      insertIndex: index,
      depth: itemDepth,
    };
  } else if (y > h * 0.75) {
    pendingDropTarget = {
      parentId,
      order: itemOrder + 1,
      insertIndex: index + 1,
      depth: itemDepth,
    };
  } else {
    pendingDropTarget = {
      parentId: item.favorite.id,
      order: 0,
      insertIndex: index + 1,
      depth: itemDepth + 1,
    };
  }
  updateDropIndicator(pendingDropTarget);
}

function onListDragOver(e: DragEvent) {
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  if (!draggedId) return;
  const target = e.target as HTMLElement;
  if (target.closest('.tactics-book-row')) return;
  const listEl = target.closest('.tactics-book-list');
  if (!listEl) return;
  const rect = listEl.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const roots = treeNodes.value.filter((n) => n.parentId === null);
  const maxOrder = roots.length ? Math.max(...roots.map((n) => n.order)) : -1;
  if (y < rect.height * 0.2) {
    pendingDropTarget = { parentId: null, order: 0, insertIndex: 0, depth: 0 };
  } else {
    pendingDropTarget = {
      parentId: null,
      order: maxOrder + 1,
      insertIndex: flatTreeList.value.length,
      depth: 0,
    };
  }
  updateDropIndicator(pendingDropTarget);
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  e.stopPropagation();
  if (!draggedId || !pendingDropTarget) return;
  setParentAndOrder(draggedId, pendingDropTarget.parentId, pendingDropTarget.order);
}

function onDropToRoot(e: DragEvent) {
  const target = e.target as HTMLElement;
  if (target.closest('.tactics-book-row')) return;
  e.preventDefault();
  if (!draggedId) return;
  const pt = pendingDropTarget;
  if (pt) {
    setParentAndOrder(draggedId, pt.parentId, pt.order);
  } else {
    const nodes = treeNodes.value;
    const roots = nodes.filter((n) => n.parentId === null);
    const maxOrder = roots.length ? Math.max(...roots.map((n) => n.order)) : -1;
    setParentAndOrder(draggedId, null, maxOrder + 1);
  }
}

onMounted(async () => {
  try {
    const favStorage = await getTacticFavoritesStorage();
    const treeStorage = await getTacticTreeStorage();
    const [list, nodes] = await Promise.all([favStorage.getAll(), treeStorage.getAll()]);
    allFavorites.value = list;
    const favIds = new Set(list.map((f) => f.id));
    const validNodes = nodes.filter((n) => favIds.has(n.favoriteId));
    if (validNodes.length !== nodes.length) {
      for (const n of nodes) {
        if (!favIds.has(n.favoriteId)) await treeStorage.delete(n.favoriteId);
      }
    }
    treeNodes.value = validNodes;
  } catch (e) {
    console.error('[TacticsBook] load failed:', e);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.tactics-book-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--ds-bg-primary);
  overflow: hidden;
}

/* Match DemoLibrary filter controls exactly */
.tactics-book-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-xl);
  align-items: flex-end;
  margin: var(--ds-space-lg) var(--ds-space-xl);
  padding: var(--ds-space-lg) var(--ds-space-xl);
  background: var(--ds-surface-base);
  border-radius: var(--ds-radius-lg);
  border: 1px solid var(--ds-border-default);
  flex-shrink: 0;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  flex: 1;
  min-width: 120px;
}

.filter-group label {
  font-size: var(--ds-text-xs);
  color: var(--ds-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  margin-bottom: var(--ds-space-xs);
}

.filter-select {
  padding: var(--ds-space-sm) var(--ds-space-md);
  border-radius: var(--ds-radius-md);
  border: 1px solid var(--ds-border-default);
  background: var(--ds-bg-secondary);
  color: var(--ds-text-primary);
  font-size: var(--ds-text-sm);
  font-family: var(--ds-font-sans);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  min-width: 120px;
  flex: 1;
}

.filter-select:hover {
  border-color: var(--ds-border-strong);
}

.filter-select:focus {
  outline: none;
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 3px rgba(78, 204, 163, 0.2);
}

.filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-xs);
  margin-top: var(--ds-space-xs);
}

.filter-tag-btn {
  padding: var(--ds-space-xs) var(--ds-space-sm);
  border-radius: var(--ds-radius-full);
  border: 1px solid var(--ds-border-default);
  background: var(--ds-surface-base);
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-xs);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  white-space: nowrap;
}

.filter-tag-btn:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
  border-color: var(--ds-border-strong);
}

.filter-tag-btn.active {
  background: var(--ds-primary);
  color: var(--ds-primary-text);
  border-color: var(--ds-primary);
  box-shadow: 0 2px 8px rgba(78, 204, 163, 0.3);
}

.filter-search {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
}

.filter-search label {
  font-size: var(--ds-text-xs);
  color: var(--ds-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  margin-bottom: var(--ds-space-xs);
}

.filter-search .filter-input {
  padding: var(--ds-space-sm) var(--ds-space-md);
  border-radius: var(--ds-radius-md);
  border: 1px solid var(--ds-border-default);
  background: var(--ds-bg-secondary);
  color: var(--ds-text-primary);
  font-size: var(--ds-text-sm);
  font-family: var(--ds-font-sans);
  transition: all var(--ds-transition-base);
  min-width: 180px;
  flex: 1;
}

.filter-search .filter-input:hover {
  border-color: var(--ds-border-strong);
}

.filter-search .filter-input:focus {
  outline: none;
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 3px rgba(78, 204, 163, 0.2);
}

.tactics-book-loading {
  padding: var(--ds-space-3xl) var(--ds-space-xl);
  text-align: center;
  color: var(--ds-text-tertiary);
  flex: 1;
  margin: var(--ds-space-xl) 0;
}

.tactics-book-body {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 0;
}

.tactics-book-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  flex: 0 0 320px;
  padding: var(--ds-space-sm) 0;
  min-height: 0;
  border-right: 1px solid var(--ds-border-subtle);
}

.tactics-book-row {
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 4px 8px;
  cursor: pointer;
  transition: background var(--ds-transition-base);
  flex-shrink: 0;
}

.tactics-book-row:hover {
  background: var(--ds-surface-hover);
}

.tactics-book-row.selected {
  background: rgba(78, 204, 163, 0.08);
  border-left: 2px solid var(--ds-primary);
  margin-left: -2px;
  padding-left: 10px;
}

.tactics-book-row-dragging {
  opacity: 0.5;
}

.tactics-book-drag-handle {
  flex-shrink: 0;
  width: 20px;
  padding: 4px 2px;
  margin-right: 4px;
  color: var(--ds-text-tertiary);
  font-size: 10px;
  cursor: grab;
  user-select: none;
  line-height: 1;
}

.tactics-book-drag-handle:active {
  cursor: grabbing;
}

.tactics-book-drag-handle:hover {
  color: var(--ds-text-secondary);
}

.tactics-book-row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ds-space-xs) var(--ds-space-sm);
}

.tactics-book-row-title {
  font-size: var(--ds-text-sm);
  font-weight: 500;
  color: var(--ds-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tactics-book-row-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px 6px;
}

.tactics-book-row-tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: var(--ds-radius-full);
  background: rgba(78, 204, 163, 0.12);
  color: var(--ds-primary);
  flex-shrink: 0;
}

.tactics-book-row-no-tags {
  font-size: 10px;
  color: var(--ds-text-tertiary);
}

.tactics-book-row-btn {
  flex-shrink: 0;
  margin-left: auto;
}

.tactics-book-drop-line {
  height: 2px;
  background: var(--ds-primary);
  border-radius: 1px;
  flex-shrink: 0;
  margin: 2px 0;
  box-shadow: 0 0 0 2px rgba(78, 204, 163, 0.3);
}

.tactics-book-detail {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: var(--ds-space-lg);
  background: var(--ds-surface-base);
}

.tactics-book-detail-content {
  flex: 1;
  overflow-y: auto;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.tactics-book-detail-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-sm);
}


/* === Empty State Centered === */
.ds-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-lg);
}

.ds-empty-icon {
  font-size: 64px;
  opacity: 0.5;
}

.ds-empty-icon svg {
  width: 80px;
  height: 80px;
  opacity: 0.5;
  filter: brightness(0.8);
}

.ds-empty-title {
  font-size: var(--ds-text-2xl);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0;
}

.ds-empty-description {
  font-size: var(--ds-text-base);
  color: var(--ds-text-tertiary);
  margin: 0;
  text-align: center;
}
</style>
