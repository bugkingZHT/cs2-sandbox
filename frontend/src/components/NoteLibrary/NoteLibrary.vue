<template>
  <div class="note-library-page">
    <Teleport to="#app-page-header">
      <div class="note-library-header">
        <div class="note-library-header-inner">
          <div class="header-content">
            <div class="filter-controls">
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
            <!-- 云存储用量：图标 + 进度条 + 文案 -->
            <div v-if="currentUser" class="quota-block">
              <div class="quota-row">
                <img src="/icons/quota.svg" alt="" class="quota-icon" />
                <span class="quota-label">云存储用量</span>
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
            <!-- 新建笔记按钮（与 DemoLibrary 上传按钮样式一致） -->
            <button type="button" class="ds-btn ds-btn-primary" @click="openCreateNoteModal">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span>新建笔记</span>
            </button>
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
      <div v-else class="note-list-container">
        <div
          v-for="item in filteredNoteList"
          :key="item.id"
          class="note-card cs2-tactics-card ds-card"
          :class="{ 'is-current': replayerSource === 'cloud' && replayerNoteId === item.id }"
        >
          <!-- Card header: title only, no background image -->
          <div class="card-title">
            <div class="card-title-row">
              <div class="card-title-text">{{ item.title }}</div>
              <div class="card-title-actions" @click.stop>
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
            <div v-if="replayerSource === 'cloud' && replayerNoteId === item.id" class="card-title-badges">
              <span class="playing-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                <span>PLAYING</span>
              </span>
            </div>
          </div>

          <!-- Body: 全文 content（富文本用 v-html，纯文本保留换行） + demo attachments -->
          <div class="card-body">
            <!-- Content section -->
            <div v-if="item.content" class="card-content-section">
              <div
                v-if="isContentHtml(item.content)"
                class="card-content card-content-rich"
                v-html="item.content"
              ></div>
              <div v-else class="card-content card-content-plain">{{ item.content }}</div>
            </div>
            
            <!-- Demo attachments section -->
            <div v-if="item.demos?.length" class="card-attachments-section">
              <div class="attachments-header">
                <span class="attachments-title">关联回放</span>
                <span class="attachments-count">({{ item.demos.length }})</span>
              </div>
              <div class="attachments-list">
                <div 
                  v-for="demo in item.demos" 
                  :key="demo.id"
                  class="attachment-item"
                  role="button"
                  tabindex="0"
                  title="播放回合"
                  @click="goToDemo(item, demo)"
                  @keydown.enter.space.prevent="goToDemo(item, demo)"
                >
                  <span class="demo-play-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <polygon points="10 8 16 12 10 16" fill="currentColor" stroke="none"/>
                    </svg>
                  </span>
                  <span class="demo-map-name">{{ getDemoMapName(demo) || 'Unknown Map' }}</span>
                  <span class="demo-teams">{{ getDemoTeamCT(demo) || 'CT' }} vs {{ getDemoTeamT(demo) || 'T' }}</span>
                  <span v-if="getDemoFileName(demo)" class="demo-file-name">{{ getDemoFileName(demo) }}</span>
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
        <button type="button" class="more-menu-item" @click.stop="openShare(openMenuNote); openMenuNoteId = null">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
          <span>分享</span>
        </button>
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { CloudArchiveItem } from '@/composables/useNote';
import { useNote } from '@/composables/useNote';
import { useAuth } from '@/composables/useAuth';
import { MAP_CONFIGS } from '@/config/map';
import { getQuery, replaceLocation, pathRef, searchRef } from '@/location';

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
  (e: 'go', item: CloudArchiveItem | { noteId: string; demoId: number }): void;
  (e: 'reorder', fromIndex: number, toIndex: number): void;
}>();

const { currentUser } = useAuth();
const { noteList, itemsLoading, loadNotes } = useNote();

// 按地图筛选（参考 DemoLibrary），与 URL 同步
const filterMapNames = ref<string[]>([]);

function parseMapFilterFromUrl(): string[] {
  const q = getQuery();
  return (q.map ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function buildNoteFilterSearch(): string {
  if (filterMapNames.value.length === 0) return '';
  const params = new URLSearchParams();
  params.set('map', filterMapNames.value.join(','));
  return '?' + params.toString();
}
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
  // Filter out child items (items with parent_id)
  list = list.filter((item) => !item.parent_id);
  if (filterMapNames.value.length > 0) {
    list = list.filter((item) => {
      const mapName = (item.mapName || '').trim();
      return filterMapNames.value.some((name) => mapName === name);
    });
  }
  return list.sort((a, b) => b.add_time - a.add_time);
});

// Get child demos for a parent item
const getChildDemos = computed(() => {
  const childMap = new Map<string, CloudArchiveItem[]>();
  noteList.value.forEach((item) => {
    if (item.parent_id) {
      if (!childMap.has(item.parent_id)) {
        childMap.set(item.parent_id, []);
      }
      childMap.get(item.parent_id)?.push(item);
    }
  });
  return childMap;
});

/** 判断是否为富文本 HTML（Editor 输出：含 img/span/strong 等），否则按纯文本展示 */
function isContentHtml(content: string): boolean {
  const t = content || '';
  return t.includes('<') && t.includes('>');
}

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

/** 时间格式 YYYY-MM-DD HH:mm:ss */
function formatNoteTime(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
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
  filterMapNames.value = parseMapFilterFromUrl();
  loadNotes();
  document.addEventListener('click', handleClickOutside);
});

watch(
  () => filterMapNames.value.slice(),
  () => {
    replaceLocation(pathRef.value || '/notes', buildNoteFilterSearch());
  },
  { deep: true }
);

// React to browser back/forward (URL changed externally)
watch(searchRef, () => {
  const map = parseMapFilterFromUrl();
  const same =
    map.length === filterMapNames.value.length && map.every((m, i) => m === filterMapNames.value[i]);
  if (same) return;
  filterMapNames.value = map;
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

function openCreateNoteModal() {
  // Emit event to parent component to open create note modal
  // This will be handled in App.vue
  const event = new CustomEvent('open-create-note-modal');
  window.dispatchEvent(event);
}

/** Display file name: prefer fileName from demo meta (original .dem name), else API file_name */
function getDemoFileName(demo: any): string {
  if (demo.demo_meta) {
    try {
      const meta = JSON.parse(demo.demo_meta);
      if (typeof meta.fileName === 'string' && meta.fileName.trim()) return meta.fileName.trim();
    } catch {
      /* ignore */
    }
  }
  return typeof demo.file_name === 'string' && demo.file_name.trim() ? demo.file_name.trim() : '';
}

/** Extract map name from demo meta */
function getDemoMapName(demo: any): string {
  if (demo.demo_meta) {
    try {
      const meta = JSON.parse(demo.demo_meta);
      return meta.mapName || 'Unknown Map';
    } catch {
      return 'Unknown Map';
    }
  }
  return 'Unknown Map';
}

/** Extract CT team name from demo meta */
function getDemoTeamCT(demo: any): string {
  if (demo.demo_meta) {
    try {
      const meta = JSON.parse(demo.demo_meta);
      return meta.teamCT || 'CT';
    } catch {
      return 'CT';
    }
  }
  return 'CT';
}

/** Extract T team name from demo meta */
function getDemoTeamT(demo: any): string {
  if (demo.demo_meta) {
    try {
      const meta = JSON.parse(demo.demo_meta);
      return meta.teamT || 'T';
    } catch {
      return 'T';
    }
  }
  return 'T';
}

/** Extract add time from demo */
function getDemoAddTime(demo: any): number {
  if (demo.created_at) {
    return new Date(demo.created_at).getTime();
  }
  return Date.now();
}

/** Navigate to demo playback: replayer URL will use note_id and demo_id. */
function goToDemo(noteItem: CloudArchiveItem, demo: { id: number }) {
  const noteId = noteItem.id;
  const demoId = demo.id;
  if (noteId && demoId != null) {
    emit('go', { noteId, demoId });
  }
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
  padding: 18px 0 0 0;
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  background: linear-gradient(to bottom, var(--ds-bg-secondary) 0%, var(--ds-bg-primary-solid) 100%);
  min-height: 60px;
}

/* 与 note-library-body 内卡片同宽 */
.note-library-header-inner {
  width: 95%;
  max-width: 85ch;
  min-width: 320px;
  margin: 0 auto;
  box-sizing: border-box;
  padding: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

@media (min-width: 768px) {
  .note-library-header-inner {
    width: 90%;
    max-width: 80ch;
  }
}

@media (min-width: 1200px) {
  .note-library-header-inner {
    width: 85%;
    max-width: 85ch;
  }
}

.header-content {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 新建笔记按钮（与 DemoLibrary 上传按钮一致） */
.library-actions .ds-btn {
  padding: var(--ds-space-sm) var(--ds-space-lg);
  font-size: var(--ds-text-sm);
  height: 38px;
}

.library-actions .ds-btn-primary {
  background: #238636;
  color: #fff;
  border-color: #238636;
}

.library-actions .ds-btn-primary:hover:not(:disabled) {
  background: #2ea043;
  border-color: #2ea043;
  color: #fff;
}

.library-actions .ds-btn-primary:active:not(:disabled) {
  background: #26a641;
  border-color: #26a641;
  color: #fff;
}

.library-actions .ds-btn svg {
  width: 16px;
  height: 16px;
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
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
  margin-bottom: 4px;
}

.quota-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  opacity: 0.9;
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
  padding: 0;
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

/* 单列列表容器，卡片间距 12px */
.note-list-container {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

/* === CS2 战术笔记 Card：文本阅读友好，略宽 + 间距由容器 gap 控制 === */
.note-card.cs2-tactics-card {
  width: 95%;
  max-width: 85ch;
  min-width: 320px;
  margin: 0 auto;
  box-sizing: border-box;
}

@media (min-width: 768px) {
  .note-card.cs2-tactics-card {
    width: 90%;
    max-width: 80ch;
  }
}

@media (min-width: 1200px) {
  .note-card.cs2-tactics-card {
    width: 85%;
    max-width: 85ch;
  }
}

/* === Note Card：无固定高度，hero + body + actions === */
.note-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  border: 1px solid var(--ds-border-default);
  border-radius: 12px;
  overflow: visible;
  transition: all var(--ds-transition-base);
  background: var(--ds-bg-primary-solid, #0d1117);
}

.note-card.is-current {
  box-shadow: 0 0 32px rgba(16, 185, 129, 0.5);
}

/* === Card title：现代博客卡片标题，无背景图、secondary 色 === */
.card-title {
  flex-shrink: 0;
  padding: var(--ds-space-lg) var(--ds-space-xl);
  border-radius: 12px 12px 0 0;
  background-color: var(--ds-bg-secondary);
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card-title-text {
  flex: 1 1 0%;
  min-width: 0;
  font-size: var(--ds-text-base);
  font-weight: 600;
  color: var(--ds-text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-title-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.card-title-actions .card-action-btn {
  color: var(--ds-text-tertiary);
}

.card-title-actions .card-action-btn:hover {
  background: var(--ds-surface-hover);
  border-color: var(--ds-border-strong);
  color: var(--ds-text-primary);
}

.card-title-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: var(--ds-space-sm);
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

/* === Card Body：全文 content，标准背景 === */
.card-body {
  flex: 1;
  padding: var(--ds-space-2xl) var(--ds-space-3xl);
  background: var(--ds-bg-primary);
  border-radius: 0 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  min-height: 0;
}

.card-content {
  font-size: var(--ds-text-base);
  color: var(--ds-text-secondary);
  line-height: 1.6;
  overflow-wrap: break-word;
  flex: 1;
  min-height: 0;
}

.card-content-plain {
  white-space: pre-wrap;
}

/* 富文本展示（与 Editor 输出一致；:deep 使 v-html 内节点也能命中） */
.card-content-rich :deep(strong),
.card-content-rich :deep(b) { font-weight: 600; font-size: calc(1em + 2px); }
.card-content-rich :deep(em),
.card-content-rich :deep(i) { font-style: italic; }
.card-content-rich :deep(u) { text-decoration: underline; }
.card-content-rich :deep(s) { text-decoration: line-through; }
.card-content-rich :deep(.text-color-white) { color: #FFFFFF !important; }
.card-content-rich :deep(.text-color-yellow) { color: #F5C518 !important; }
.card-content-rich :deep(.text-color-green) { color: #00C853 !important; }
.card-content-rich :deep(.text-color-blue) { color: #2196F3 !important; }
.card-content-rich :deep(.text-color-purple) { color: #9C27B0 !important; }
.card-content-rich :deep(.text-color-orange) { color: #FF6D00 !important; }
.card-content-rich :deep(.equipment-inline-icon) {
  width: 18px;
  height: 18px;
  vertical-align: middle;
  margin: 0 2px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
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

/* === Card Action 按钮（位于 card-hero-row 右侧） === */
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
  padding: 6px 10px;
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
  padding: 6px;
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

/* Card attachments styles */
.card-attachments-section {
  border-top: 1px solid var(--ds-border-subtle);
  padding-top: var(--ds-space-md);
  margin-top: var(--ds-space-md);
}

.attachments-header {
  display: flex;
  align-items: center;
  gap: var(--ds-space-xs);
  margin-bottom: var(--ds-space-sm);
}

.attachments-title {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
}

.attachments-count {
  font-size: var(--ds-text-xs);
  color: var(--ds-text-secondary);
  font-weight: 500;
}

.attachments-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-sm) var(--ds-space-md);
  background: var(--ds-bg-secondary);
  border-radius: var(--ds-radius-sm);
  transition: all var(--ds-transition-base);
  cursor: pointer;
  min-width: 0;
}

.attachment-item:hover {
  background: var(--ds-surface-hover);
  border-color: var(--ds-border-default);
}

.attachment-item .demo-play-icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--ds-text-secondary);
}

.attachment-item .demo-play-icon svg {
  width: 100%;
  height: 100%;
}

/* 附件卡片统一：1 mapname 纯白加粗 2 teams 纯白不加粗 3 文件名 灰色小号 4 时间 灰色小号 */
.attachment-item .demo-map-name {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
  white-space: nowrap;
  flex-shrink: 0;
}

.attachment-item .demo-teams {
  font-size: var(--ds-text-sm);
  font-weight: 400;
  color: var(--ds-text-primary);
  white-space: nowrap;
  flex-shrink: 0;
}

.attachment-item .demo-file-name {
  font-size: var(--ds-text-xs);
  font-weight: 400;
  color: var(--ds-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex-shrink: 1;
  margin-left: auto;
}
</style>
