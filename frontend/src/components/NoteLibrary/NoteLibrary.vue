<template>
  <div class="note-library-page">
    <Teleport to="#app-page-header">
      <div class="note-library-header">
      <div class="header-content">
        <div class="filter-controls">
          <div class="filter-group">
            <h1 class="page-title">战术笔记</h1>
          </div>
          <!-- 按地图筛选 -->
          <div class="filter-group">
            <div class="filter-dropdown-wrapper">
              <div
                class="filter-tags-input"
                :class="{ 'has-selection': filterMapNames.length > 0 }"
                @click="handleMapDropdownClick"
              >
                <span v-if="filterMapNames.length > 0" class="filter-selection-text">
                  {{ filterMapNames.join(', ') }}
                </span>
                <input
                  v-else
                  type="text"
                  v-model="filterMapNameInput"
                  @focus="showMapDropdown = true"
                  @input="onMapInputChange"
                  placeholder="按地图筛选"
                  class="filter-tags-input-field"
                  autocomplete="off"
                />
                <span class="filter-icon" @click.stop="handleMapIconClick">
                  <svg v-if="filterMapNames.length === 0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </span>
              </div>
              <div v-if="showMapDropdown && filteredMapOptions.length > 0" class="filter-dropdown ds-scrollbar">
                <div
                  v-for="mapName in filteredMapOptions"
                  :key="mapName"
                  class="filter-dropdown-item"
                  :class="{ selected: filterMapNames.includes(mapName) }"
                  @click="toggleMapName(mapName)"
                >
                  <span class="dropdown-checkbox">
                    <svg v-if="filterMapNames.includes(mapName)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </span>
                  <span class="dropdown-item-name">{{ mapName }}</span>
                  <span class="dropdown-item-count">({{ getMapNoteCount(mapName) }})</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="library-actions">
        <!-- 用量：进度条 + 文案 -->
        <div v-if="currentUser" class="quota-block">
          <div class="quota-row">
            <span class="quota-label">用量</span>
            <span class="quota-text">{{ quotaUsed }} / {{ quotaLimit }}</span>
          </div>
          <div class="quota-track">
            <div
              class="quota-bar"
              :style="{ width: quotaPercent + '%' }"
              :class="{ 'is-full': quotaLimit > 0 && quotaUsed >= quotaLimit }"
            ></div>
          </div>
        </div>
      </div>
    </div>
    </Teleport>

    <div class="note-library-body ds-scrollbar">
      <!-- 请求 items 接口时展示转圈加载 cover -->
      <div v-if="itemsLoading" class="note-library-loading-cover" aria-busy="true">
        <div class="note-library-loading-spinner"></div>
        <p class="note-library-loading-text">加载中…</p>
      </div>
      <div v-if="!currentUser" class="note-library-empty">
        <p>请先登录后查看和管理战术笔记</p>
      </div>
      <div v-else-if="noteList.length === 0" class="note-library-empty">
        <p>暂无笔记</p>
        <p class="hint">在播放器时间轴控制区点击「保存到笔记」上传当前回合</p>
      </div>
      <div v-else-if="filteredNoteList.length === 0" class="note-library-empty">
        <p>当前筛选下无笔记</p>
        <p class="hint">尝试更换或清除地图筛选</p>
      </div>
      <div v-else class="note-grid-container">
        <div class="note-grid">
          <div class="note-column">
            <div
              v-for="item in leftColumnItems"
              :key="item.id"
              class="note-card ds-card"
              :class="{ 'is-current': replayerSource === 'cloud' && replayerNoteId === item.id }"
            >
            <!-- Hero: 固定高度背景图 + 底部渐变 + 标题 -->
            <div class="card-hero">
              <div class="card-background">
                <img
                  v-if="getMapLeftSideImage(item.mapName)"
                  :src="getMapLeftSideImage(item.mapName)"
                  :alt="item.mapName || ''"
                  @error="onImageError"
                />
                <div v-else class="placeholder-bg">
                  <span>{{ item.mapName || 'Unknown' }}</span>
                </div>
              </div>
              <div class="card-hero-cover"></div>
              <div class="card-hero-overlay">
                <div class="card-hero-row">
                  <div class="card-hero-title">{{ item.title }}</div>
                  <div class="card-hero-meta">
                    
                    <span v-if="item.mapName" class="card-hero-map">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      {{ item.mapName }}
                    </span>
                    <span v-if="item.teamCT && item.teamT" class="card-hero-match">{{ item.teamCT }} vs {{ item.teamT }}</span>
                  </div>
                </div>
                <div class="card-hero-badges">
                  <span v-if="replayerSource === 'cloud' && replayerNoteId === item.id" class="playing-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    <span>PLAYING</span>
                  </span>
                </div>
              </div>
            </div>

            <!-- Body: 全文 content -->
            <div v-if="item.content" class="card-body">
              <div class="card-content">{{ item.content }}</div>
            </div>

            <!-- Actions: 左下跳转 + 右侧分享、「...」 -->
            <div class="card-actions" @click.stop>
              <button type="button" class="card-action-btn card-go-btn" title="进入播放" @click.stop="goToItem(item)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                <span>播放</span>
              </button>
              <div class="card-actions-right">
                <button type="button" class="card-action-btn card-share-btn" title="分享" @click.stop="openShare(item)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  <span>分享</span>
                </button>
                <div class="card-more-wrap">
                  <button
                    type="button"
                    class="card-action-btn card-more-btn"
                    title="更多"
                    aria-haspopup="true"
                    :aria-expanded="openMenuNoteId === item.id"
                    @click.stop="toggleMenu(item.id, $event)"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
          </div>
          <div class="note-column">
            <div
              v-for="item in rightColumnItems"
              :key="item.id"
              class="note-card ds-card"
              :class="{ 'is-current': replayerSource === 'cloud' && replayerNoteId === item.id }"
            >
            <div class="card-hero">
              <div class="card-background">
                <img
                  v-if="getMapLeftSideImage(item.mapName)"
                  :src="getMapLeftSideImage(item.mapName)"
                  :alt="item.mapName || ''"
                  @error="onImageError"
                />
                <div v-else class="placeholder-bg">
                  <span>{{ item.mapName || 'Unknown' }}</span>
                </div>
              </div>
              <div class="card-hero-cover"></div>
              <div class="card-hero-overlay">
                <div class="card-hero-row">
                  <div class="card-hero-title">{{ item.title }}</div>
                  <div class="card-hero-meta">
                    
                    <span v-if="item.mapName" class="card-hero-map">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      {{ item.mapName }}
                    </span>
                    <span v-if="item.teamCT && item.teamT" class="card-hero-match">{{ item.teamCT }} vs {{ item.teamT }}</span>
                  </div>
                </div>
                <div class="card-hero-badges">
                  <span v-if="replayerSource === 'cloud' && replayerNoteId === item.id" class="playing-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    <span>PLAYING</span>
                  </span>
                </div>
              </div>
            </div>
            <div v-if="item.content" class="card-body">
              <div class="card-content">{{ item.content }}</div>
            </div>
            <div class="card-actions" @click.stop>
              <button type="button" class="card-action-btn card-go-btn" title="进入播放" @click.stop="goToItem(item)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                <span>播放</span>
              </button>
              <div class="card-actions-right">
                <button type="button" class="card-action-btn card-share-btn" title="分享" @click.stop="openShare(item)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  <span>分享</span>
                </button>
                <div class="card-more-wrap">
                  <button
                    type="button"
                    class="card-action-btn card-more-btn"
                    title="更多"
                    aria-haspopup="true"
                    :aria-expanded="openMenuNoteId === item.id"
                    @click.stop="toggleMenu(item.id, $event)"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 更多菜单 Teleport 到 body，浮于整页最上方 -->
    <Teleport to="body">
      <div
        v-if="openMenuNoteId && openMenuNote"
        class="note-card-more-menu note-card-more-menu-fixed"
        :style="{ top: moreMenuPosition.top + 'px', left: moreMenuPosition.left + 'px' }"
        @click.stop
      >
        <button type="button" class="more-menu-item" @click.stop="openEdit(openMenuNote); openMenuNoteId = null">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
          </svg>
          <span>编辑</span>
        </button>
        <button type="button" class="more-menu-item more-menu-item-delete" @click.stop="confirmDelete(openMenuNote); openMenuNoteId = null">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          <span>删除</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { CloudArchiveItem } from '@/composables/useNote';
import { useNote } from '@/composables/useNote';
import { useAuth } from '@/composables/useAuth';
import { MAP_CONFIGS } from '@/config/map';

const props = withDefaults(
  defineProps<{
    quotaUsed?: number;
    quotaLimit?: number;
    replayerSource?: 'local' | 'cloud' | null;
    replayerNoteId?: string | null;
  }>(),
  { quotaUsed: 0, quotaLimit: 0, replayerSource: null, replayerNoteId: null }
);

const emit = defineEmits<{
  (e: 'share', item: CloudArchiveItem): void;
  (e: 'edit', item: CloudArchiveItem): void;
  (e: 'delete', item: CloudArchiveItem): void;
  (e: 'go', item: CloudArchiveItem): void;
  (e: 'reorder', fromIndex: number, toIndex: number): void;
}>();

const { currentUser } = useAuth();
const { noteList, itemsLoading, loadNotes } = useNote();

// 按地图筛选（参考 DemoLibrary）
const filterMapNames = ref<string[]>([]);
const filterMapNameInput = ref('');
const showMapDropdown = ref(false);
const openMenuNoteId = ref<string | null>(null);
/** 更多菜单的 fixed 定位（Teleport 到 body 时使用） */
const moreMenuPosition = ref({ top: 0, left: 0 });

const filteredMapOptions = computed(() => {
  const mapCounts = new Map<string, number>();
  noteList.value.forEach((item) => {
    const mapName = (item.mapName || '').trim();
    if (mapName) mapCounts.set(mapName, (mapCounts.get(mapName) || 0) + 1);
  });
  let maps = [...mapCounts.keys()];
  if (filterMapNameInput.value.trim()) {
    const search = filterMapNameInput.value.toLowerCase();
    maps = maps.filter((name) => name.toLowerCase().includes(search));
  }
  return maps.sort((a, b) => (mapCounts.get(b) || 0) - (mapCounts.get(a) || 0));
});

function getMapNoteCount(mapName: string): number {
  return noteList.value.filter((item) => (item.mapName || '').trim() === mapName).length;
}

function toggleMapName(mapName: string) {
  const index = filterMapNames.value.indexOf(mapName);
  if (index > -1) {
    filterMapNames.value.splice(index, 1);
  } else {
    filterMapNames.value = [mapName];
  }
  filterMapNameInput.value = '';
  showMapDropdown.value = false;
}

function handleMapDropdownClick() {
  showMapDropdown.value = true;
}

function handleMapIconClick() {
  if (filterMapNames.value.length > 0) {
    filterMapNames.value = [];
    filterMapNameInput.value = '';
  }
}

function onMapInputChange() {
  showMapDropdown.value = true;
}

const filteredNoteList = computed(() => {
  let list = [...noteList.value];
  if (filterMapNames.value.length > 0) {
    list = list.filter((item) => {
      const mapName = (item.mapName || '').trim();
      return filterMapNames.value.some((name) => mapName === name);
    });
  }
  return list.sort((a, b) => b.add_time - a.add_time);
});

/** 左列：索引 0, 2, 4...；右列：索引 1, 3, 5...，两列独立向上对齐 */
/** 逐个放置 item：每次选择左右两侧中「当前总高度更小」的一侧放入，相等时放左侧 */
const balancedColumns = computed(() => {
  const list = filteredNoteList.value;
  if (list.length === 0) return { left: [] as CloudArchiveItem[], right: [] as CloudArchiveItem[] };
  const getEstimatedHeight = (item: CloudArchiveItem) => {
    const base = 140 + 48 + 44; /* hero + card-body + card-actions 近似高度 */
    const content = item.content || '';
    if (!content.trim()) return base;
    const charsPerLine = 32; /* 单行约字符数（与 card-content 宽度、字号一致） */
    const lineHeightPx = 20;
    const lines = content.split(/\r?\n/);
    const visualLines = lines.reduce(
      (acc, line) => acc + Math.max(1, Math.ceil(line.length / charsPerLine)),
      0
    );
    const contentHeight = visualLines * lineHeightPx;
    return base + contentHeight;
  };
  let leftHeight = 0;
  let rightHeight = 0;
  const leftItems: CloudArchiveItem[] = [];
  const rightItems: CloudArchiveItem[] = [];
  for (const item of list) {
    const h = getEstimatedHeight(item);
    const placeOnLeft = leftHeight <= rightHeight;
    if (placeOnLeft) {
      leftItems.push(item);
      leftHeight += h;
    } else {
      rightItems.push(item);
      rightHeight += h;
    }
  }
  return { left: leftItems, right: rightItems };
});
const leftColumnItems = computed(() => balancedColumns.value.left);
const rightColumnItems = computed(() => balancedColumns.value.right);

/** 当前打开「更多」菜单的笔记项（用于 Teleport 下拉） */
const openMenuNote = computed(() => {
  const id = openMenuNoteId.value;
  if (!id) return null;
  return filteredNoteList.value.find((item) => item.id === id) ?? null;
});

// 用量进度条百分比（quotaLimit 为 0 时视为无限制，显示 0）
const quotaPercent = computed(() => {
  const limit = props.quotaLimit || 0;
  if (limit <= 0) return 0;
  const used = Math.max(0, props.quotaUsed || 0);
  return Math.min(100, Math.round((used / limit) * 100));
});


/** 与 DemoLibrary 一致：使用对应地图的 leftSideGroundMap 作为卡片背景 */
function getMapLeftSideImage(mapName: string | undefined): string | undefined {
  if (!mapName) return undefined;
  const key = mapName in MAP_CONFIGS ? mapName : Object.keys(MAP_CONFIGS).find((k) => k.toLowerCase() === mapName.toLowerCase());
  const config = key ? MAP_CONFIGS[key] : undefined;
  return config?.leftSideGroundMap;
}

function onImageError(e: Event) {
  const img = e.target as HTMLImageElement;
  if (img) img.style.display = 'none';
}

/** 与 App.vue 一致：今日显示时间，否则日期+时间 */
function formatNoteTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function toggleMenu(noteId: string, e?: Event) {
  if (openMenuNoteId.value === noteId) {
    openMenuNoteId.value = null;
    return;
  }
  if (e?.currentTarget && typeof (e.currentTarget as HTMLElement).getBoundingClientRect === 'function') {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    moreMenuPosition.value = {
      top: rect.bottom + 4,
      left: Math.max(8, rect.left),
    };
  }
  openMenuNoteId.value = noteId;
}

function goToItem(item: CloudArchiveItem) {
  emit('go', item);
}

onMounted(() => {
  loadNotes();
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest('.filter-dropdown-wrapper')) {
    showMapDropdown.value = false;
  }
  if (!target.closest('.card-more-wrap') && !target.closest('.note-card-more-menu')) {
    openMenuNoteId.value = null;
  }
}

function openShare(item: CloudArchiveItem) {
  emit('share', item);
}

function openEdit(item: CloudArchiveItem) {
  emit('edit', item);
}

function confirmDelete(item: CloudArchiveItem) {
  emit('delete', item);
}
</script>

<style scoped>
.note-library-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--ds-bg-primary-solid);
}

.note-library-header {
  padding: 18px var(--ds-space-xl);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  background: linear-gradient(to bottom, var(--ds-bg-secondary) 0%, var(--ds-bg-primary-solid) 100%);
  min-height: 60px;
}

.header-content {
  flex: 1;
  min-width: 0;
}

.filter-controls {
  display: flex;
  gap: var(--ds-space-xl);
  align-items: center;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
}

.page-title {
  margin: 0;
  font-size: var(--ds-text-xl);
  font-weight: 700;
  color: var(--ds-text-primary);
}

/* 地图筛选下拉（与 DemoLibrary 一致） */
.filter-dropdown-wrapper {
  position: relative;
}

.filter-tags-input {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  width: 200px;
  min-height: 36px;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  box-sizing: border-box;
}

.filter-tags-input.has-selection {
  background: rgba(var(--ds-primary-rgb), 0.15);
  border-color: var(--ds-border-strong);
}

.filter-tags-input.has-selection:hover {
  background: rgba(var(--ds-primary-rgb), 0.2);
  border-color: var(--ds-border-strong);
}

.filter-tags-input:hover {
  border-color: var(--ds-border-strong);
}

.filter-tags-input:focus-within {
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 3px rgba(var(--ds-primary-rgb), 0.12);
}

.filter-selection-text {
  flex: 1;
  color: var(--ds-primary);
  font-size: var(--ds-text-sm);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--ds-text-tertiary);
  transition: all var(--ds-transition-base);
  pointer-events: none;
}

.filter-tags-input.has-selection .filter-icon {
  color: var(--ds-primary);
  cursor: pointer;
  pointer-events: auto;
}

.filter-tags-input-field {
  flex: 1;
  min-width: 0;
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-sm);
  font-weight: 600;
  white-space: nowrap;
}

.filter-tags-input-field::placeholder {
  color: var(--ds-text-tertiary);
  font-weight: 400;
}

.filter-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-width: 260px;
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  box-shadow: var(--ds-shadow-xl);
  max-height: 300px;
  overflow-y: auto;
  z-index: 100;
}

.filter-dropdown-item {
  padding: var(--ds-space-sm) var(--ds-space-md);
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-sm);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  border-bottom: 1px solid var(--ds-border-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-dropdown-item:last-child {
  border-bottom: none;
}

.filter-dropdown-item:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.filter-dropdown-item.selected {
  background: rgba(var(--ds-primary-rgb), 0.1);
  color: var(--ds-primary);
  font-weight: 600;
}

.dropdown-checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid var(--ds-border-default);
  border-radius: var(--ds-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--ds-transition-base);
}

.filter-dropdown-item:hover .dropdown-checkbox {
  border-color: var(--ds-primary);
}

.filter-dropdown-item.selected .dropdown-checkbox {
  background: var(--ds-primary);
  border-color: var(--ds-primary);
}

.dropdown-checkbox svg {
  stroke: var(--ds-primary-text);
}

.dropdown-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-item-count {
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  margin-left: auto;
  padding-left: var(--ds-space-sm);
}

/* 右侧：用量 + 保存按钮 */
.library-actions {
  display: flex;
  gap: var(--ds-space-lg);
  align-items: center;
}

.quota-block {
  min-width: 120px;
}

.quota-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ds-space-sm);
  margin-bottom: 4px;
}

.quota-label {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  color: var(--ds-text-tertiary);
}

.quota-text {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  color: var(--ds-text-secondary);
  font-variant-numeric: tabular-nums;
}

.quota-track {
  height: 6px;
  background: var(--ds-surface-base);
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid var(--ds-border-subtle);
}

.quota-bar {
  height: 100%;
  background: var(--ds-primary);
  border-radius: 2px;
  transition: width var(--ds-transition-base);
}

.quota-bar.is-full {
  background: var(--ds-error, #ef4444);
}

.note-library-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--ds-space-lg) var(--ds-space-xl);
  position: relative;
}

.note-library-loading-cover {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-lg);
  background: var(--ds-bg-primary-solid);
  z-index: 1;
}

.note-library-loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--ds-border-subtle);
  border-top-color: var(--ds-primary);
  border-radius: 50%;
  animation: note-library-spin 0.8s linear infinite;
}

@keyframes note-library-spin {
  to { transform: rotate(360deg); }
}

.note-library-loading-text {
  margin: 0;
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-base);
}

.note-library-empty {
  text-align: center;
  padding: var(--ds-space-2xl);
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-base);
}

.note-library-empty .hint {
  margin-top: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  opacity: 0.8;
}

/* Grid - 左右两列独立，按列拆分、向上对齐，不按行分割 */
.note-grid-container {
  overflow-y: auto;
  padding: 0;
}

.note-grid {
  display: flex;
  gap: var(--ds-space-sm);
  padding: 0 var(--ds-space-md);
  align-items: flex-start;
}

.note-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  min-width: 0;
}

@media (max-width: 768px) {
  .note-grid {
    flex-direction: column;
  }
}

/* === Note Card：无固定高度，hero + body + actions，参考 demolib 卡片白边 === */
.note-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  border: none;
  border-radius: 12px;
  overflow: visible;
  transition: all var(--ds-transition-base);
  background: var(--ds-bg-primary-solid, #0d1117);
}

.note-card.is-current {
  box-shadow: 0 0 32px rgba(16, 185, 129, 0.5);
}

/* === Card Hero：固定高度背景 + 遮罩 + 标题 === */
.card-hero {
  position: relative;
  height: 140px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 12px 12px 0 0;
}

.card-background {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

/* 两层遮罩；过渡在 100% 位置才变化到目标色 */
.card-background::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    to bottom,
    rgba(22, 27, 34, 0.75) 0%,
    rgba(22, 27, 34, 0.90) 100%,
  );
  pointer-events: none;
}

.card-background::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    transparent 99%,
    var(--ds-bg-secondary) 100%
  );
  pointer-events: none;
}

.card-background img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--ds-transition-base);
  opacity: 0.5;
  filter: brightness(0.8) saturate(0.95);
}

.card-hero-cover {
  position: absolute;
  inset: 0;
  background: none;
  z-index: 3;
  pointer-events: none;
}

.card-hero-overlay {
  position: absolute;
  inset: 0;
  background: none;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: var(--ds-space-md) var(--ds-space-xl);
  z-index: 4;
}

.card-hero-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 6px 10px;
}

/* 宽度不足时 title 占满第一行、meta 换行到下方，避免标题在左侧被裁掉 */
.card-hero-title {
  font-size: var(--ds-text-lg);
  font-weight: 600;
  color: #fff;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1 1 100%;
  min-width: 0;
}

.card-hero-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.card-hero-map {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
  padding: 2px 8px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 4px;
}

.card-hero-map svg {
  color: var(--ds-primary);
  flex-shrink: 0;
}


.card-hero-match {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
}

.card-hero-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.playing-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  background: rgba(16, 185, 129, 0.3);
  border: 1px solid var(--ds-success);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  color: var(--ds-success);
  letter-spacing: 0.5px;
  animation: pulse-badge 2s ease-in-out infinite;
}

.playing-badge svg {
  animation: pulse-icon 1.5s ease-in-out infinite;
}

@keyframes pulse-badge {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(16, 185, 129, 0.3); }
  50% { opacity: 0.9; box-shadow: 0 0 16px rgba(16, 185, 129, 0.5); }
}

@keyframes pulse-icon {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}

/* === Card Body：全文 content，使用标准色 === */
.card-body {
  flex: 1;
  padding: var(--ds-space-xl);
  background: var(--ds-bg-secondary);
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  min-height: 0;
}

.card-content {
  font-size: var(--ds-text-base);
  color: var(--ds-text-secondary);
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  flex: 1;
  min-height: 0;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-sm);
  font-size: var(--ds-text-xs);
  color: var(--ds-text-tertiary);
  flex-shrink: 0;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta-item svg {
  flex-shrink: 0;
  color: var(--ds-primary);
}

.meta-time {
  font-variant-numeric: tabular-nums;
}

/* === Card Actions：左下进入 + 右侧分享、更多下拉 === */
.card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: var(--ds-bg-secondary);
  flex-shrink: 0;
  border-radius: 0 0 12px 12px;
  border-top: 1px solid var(--ds-border-subtle);
}

.card-actions-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-action-btn.card-go-btn:hover {
  background: #238636;
  border-color: #238636;
  color: #fff;
}

.card-action-btn.card-share-btn:hover {
  background: #f0c14b;
  border-color: #f0c14b;
  color: #0d1117;
}

.card-action-btn.card-more-btn:hover {
  background: #fff;
  border-color: #fff;
  color: #0d1117;
}

.card-action-btn {
  padding: 8px 12px;
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-secondary);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ds-text-sm);
}

.card-action-btn:hover {
  background: var(--ds-surface-hover);
  border-color: var(--ds-border-strong);
  color: var(--ds-text-primary);
}

.card-more-wrap {
  position: relative;
}

.card-more-btn {
  padding: 8px;
}

.card-more-btn svg {
  flex-shrink: 0;
}

.note-card-more-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  left: auto;
  width: 80px;
  min-width: 80px;
  max-width: 80px;
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  box-shadow: var(--ds-shadow-xl);
  z-index: 9999;
  overflow: hidden;
}

/* Teleport 到 body 时使用 fixed 定位，浮于整页最上方 */
.note-card-more-menu-fixed {
  position: fixed;
  z-index: 99999;
}

.more-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: var(--ds-space-sm) var(--ds-space-md);
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  background: none;
  border: none;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  text-align: left;
}

.more-menu-item:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.more-menu-item-delete:hover {
  color: var(--ds-error, #ef4444);
  background: rgba(239, 68, 68, 0.08);
}
</style>
