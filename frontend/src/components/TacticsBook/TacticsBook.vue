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
    <div v-else-if="filteredList.length === 0" class="tactics-book-empty ds-empty">
      <div class="ds-empty-icon">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h3 class="ds-empty-title">暂无收藏战术</h3>
      <p class="ds-empty-description">在 2D 播放器页面点击星标收藏当前回合战术</p>
    </div>
    <div v-else class="tactics-book-list ds-scrollbar">
      <div
        v-for="fav in filteredList"
        :key="fav.id"
        class="tactics-book-row ds-card"
        :class="{ expanded: true }"
        @click.stop="goToReplayer(fav.pageUrl)"
      >
        <div class="tactics-book-row-main">
          <span class="tactics-book-row-title">{{ fav.name }}</span>
          <span v-if="fav.team" class="tactics-book-row-team" :class="fav.team">{{ fav.team }}</span>
          <div v-if="fav.tags.length" class="tactics-book-row-tags">
            <span v-for="t in fav.tags" :key="t" class="tactics-book-row-tag">{{ t }}</span>
          </div>
          <button
            type="button"
            class="ds-btn ds-btn-primary ds-btn-sm tactics-book-goto-btn"
            @click.stop="goToReplayer(fav.pageUrl)"
          >
            跳转到回合
          </button>
        </div>
        <Transition name="tactics-detail">
          <div v-show="true" class="tactics-book-row-detail">
            <div class="tactics-book-row-detail-row">
              <span class="detail-label">地图</span>
              <span class="detail-value">{{ fav.mapName }}</span>
            </div>
            <p v-if="fav.content" class="tactics-book-row-content">{{ fav.content }}</p>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getTacticFavoritesStorage } from '@/composables/indexdb-storage';
import { useTacticTags } from '@/composables/useTacticTags';
import { navigate } from '@/location';
import type { TacticFavorite } from '@/types/tactics';

const loading = ref(true);
const allFavorites = ref<TacticFavorite[]>([]);
const filterMap = ref('');
const filterTags = ref<string[]>([]);
const filterName = ref('');

const { allTags } = useTacticTags();



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

const filteredList = computed(() => {
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

onMounted(async () => {
  try {
    const storage = await getTacticFavoritesStorage();
    const list = await storage.getAll();
    allFavorites.value = list;
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

.tactics-book-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
  overflow-y: auto;
  flex: 1;
  padding: var(--ds-space-md) var(--ds-space-xl) var(--ds-space-xl);
  min-height: 0;
  margin: 0 var(--ds-space-xl) var(--ds-space-xl);
}

.tactics-book-row {
  padding: var(--ds-space-lg);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  border-radius: var(--ds-radius-lg);
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-subtle);
}

.tactics-book-row:hover {
  background: var(--ds-surface-hover);
  border-color: var(--ds-border-default);
}

.tactics-book-row.expanded {
  background: var(--ds-surface-hover);
  border-color: var(--ds-border-default);
}

.tactics-book-row-main {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  flex-wrap: wrap;
}

.tactics-book-row-title {
  font-weight: 600;
  font-size: var(--ds-text-base);
  color: var(--ds-text-primary);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tactics-book-row-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ds-space-xs);
  align-items: center;
  justify-content: flex-start;
}

.tactics-book-row-team {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--ds-radius-sm);
  flex-shrink: 0;
}

.tactics-book-row-team.CT {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.tactics-book-row-team.T {
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
}

.tactics-book-row-tag {
  font-size: var(--ds-text-xs);
  padding: var(--ds-space-xs) var(--ds-space-sm);
  border-radius: var(--ds-radius-full);
  background: rgba(78, 204, 163, 0.15);
  color: var(--ds-primary);
  border: 1px solid rgba(78, 204, 163, 0.3);
}

.tactics-book-goto-btn {
  flex-shrink: 0;
  margin-left: auto;
}

.tactics-book-row-detail {
  margin-top: var(--ds-space-md);
  padding-top: var(--ds-space-md);
  border-top: 1px solid var(--ds-border-subtle);
}

.tactics-book-row-detail-row {
  display: flex;
  gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
}

.detail-label {
  color: var(--ds-text-tertiary);
  min-width: 48px;
}

.detail-value {
  color: var(--ds-text-secondary);
}

.tactics-book-row-content {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  line-height: 1.5;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.tactics-detail-enter-active,
.tactics-detail-leave-active {
  transition: opacity var(--ds-transition-base), transform var(--ds-transition-base);
}

.tactics-detail-enter-from,
.tactics-detail-leave-to {
  opacity: 0;
  transform: translateY(-8px);
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
