<template>
  <div class="app">
    <!-- Collapsible Sidebar（replayer 纯净模式下隐藏） -->
    <aside v-show="currentPage !== 'player' || !replayerPureMode" class="app-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <!-- Sidebar Header -->
      <div class="sidebar-header">
        <div class="app-branding" v-show="!sidebarCollapsed">
          <img src="/logo/logo.png" alt="Snowbo" class="app-logo" @error="onLogoError" />
          <div class="app-title-group">
            <h1 class="app-title">Snowbo | 雪豹</h1>
            <p class="app-subtitle">CS2 Tac-Workshop</p>
          </div>
        </div>
        
        <!-- Collapse Toggle Button -->
        <button class="collapse-btn" @click="toggleSidebar" :title="sidebarCollapsed ? '展开' : '折叠'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline :points="sidebarCollapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6'"/>
          </svg>
        </button>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <button 
          class="nav-btn" 
          :class="{ active: currentPage === 'library' || (currentPage === 'player' && replayerSource === 'local') }"
          @click="onNavigateToDemolib"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span v-show="!sidebarCollapsed" class="nav-label">
            <span class="nav-text">Demo 库</span>
          </span>
        </button>
        <button
          class="nav-btn"
          :class="{ active: currentPage === 'notes' || (currentPage === 'player' && replayerSource === 'cloud') }"
          @click="onNavigateToNotes"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="5" y1="6" x2="5" y2="6"/>
            <line x1="10" y1="6" x2="19" y2="6"/>
            <line x1="5" y1="12" x2="5" y2="12"/>
            <line x1="10" y1="12" x2="19" y2="12"/>
            <line x1="5" y1="18" x2="5" y2="18"/>
            <line x1="10" y1="18" x2="19" y2="18"/>
          </svg>
          <span v-show="!sidebarCollapsed" class="nav-label">
            <span class="nav-text">战术笔记</span>
          </span>
        </button>
      </nav>

      <!-- Spacer: 把下方 Beta / Console 顶到底部 -->
      <div class="sidebar-spacer" aria-hidden="true"></div>

      <!-- Beta Button -->
      <div v-if="DEBUG_CONFIG.enableBetaButton" class="sidebar-beta-section">
        <button 
          class="beta-btn"
          @click="showBetaWarning"
          :title="sidebarCollapsed ? '测试版' : ''"
        >
          <span class="beta-btn-text">BETA</span>
          <span v-show="!sidebarCollapsed" class="nav-label">
            <span class="nav-text">测试版</span>
          </span>
        </button>
      </div>

      <div class="sidebar-footer">


        <button
          class="console-toggle-btn"
          :class="{ 'is-logged-in': currentUser }"
          @click="showConsoleModal = true"
        >
          <!-- 未登录：齿轮/设置风格；已登录：用户头像 -->
          <svg v-if="!currentUser" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
            <line x1="12" y1="2" x2="12" y2="12"></line>
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span v-show="!sidebarCollapsed" class="nav-label">
            <span class="nav-text">{{ currentUser ? truncatedUsername : '系统 / 登录' }}</span>
            <span v-if="currentUser?.role === 'pro'" class="role-badge role-badge-pro">pro</span>
            <span v-else-if="currentUser?.role === 'pro+'" class="role-badge role-badge-proplus">pro+</span>
          </span>
        </button>
      </div>
    </aside>

    <!-- Library / Notes：header 浮于最上方（Teleport 目标），主内容在 app-main 内 -->
    <template v-if="currentPage === 'library' || currentPage === 'notes'">
      <div class="app-main-area" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
        <header class="app-page-header" id="app-page-header"></header>
        <main class="app-main">
          <DemoLibrary
            v-if="currentPage === 'library'"
            :demo-list="replayList || []"
            :loading="loading"
            @select-demo="onSelectDemo"
            @delete-demo="onDeleteDemo"
            @upload-demo="onUploadDemo"
          />
          <NoteLibrary
            v-if="currentPage === 'notes'"
            :quota-used="quotaUsed"
            :quota-limit="quotaLimit"
            :replayer-source="replayerSource"
            :replayer-note-id="replayerNoteId"
            @share="openShareModal"
            @edit="onRequestEditNote"
            @delete="onRequestDeleteNote"
            @go="goToNoteItem"
          />
        </main>
      </div>
    </template>

    <!-- Player Page：与库页同布局，侧边栏 + 主区 -->
    <div v-else-if="currentPage === 'player'" class="app-main-area" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <header class="app-page-header" id="app-page-header"></header>
      <main class="app-main">
        <ReplayPlayer
          :can-add-to-note="canAddToNote"
          :note-uploading="noteUploading"
          :cloud-note="cloudNoteForReplayer"
          @save-current-round="handleAddToNote"
          @clip-publish-available="onClipPublishAvailable"
        />
      </main>
    </div>

    <!-- 解析进度弹窗（阻塞：先「等待解析器加载中」，再「解析中..」+ 进度条，解析完成后关闭） -->
    <div v-if="parsing" class="parsing-overlay">
      <div class="parsing-modal">
        <h3>{{ parsingProgress === 0 ? '等待解析器加载中' : '解析中..' }}</h3>
        <div class="spinner-container">
          <div class="spinner"></div>
        </div>
        <div class="parsing-progress-bar-wrap">
          <div class="parsing-progress-bar-fill" :style="{ width: parsingProgress + '%' }"></div>
        </div>
        <p class="parsing-status">{{ parsingStatus }}</p>
      </div>
    </div>

    <!-- Console Modal -->
    <ConsoleModal 
      :show-modal="showConsoleModal" 
      :current-page="currentPage"
      @close="showConsoleModal = false"
      @open-frame-data-viewer="handleFrameDataViewer"
      @open-storage-viewer="handleStorageViewer"
    />

    <!-- Beta Warning Modal -->
    <div v-if="showBetaModal" class="beta-modal-overlay" @click="showBetaModal = false">
      <div class="beta-modal" @click.stop>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h3 class="modal-title">测试版提醒</h3>
        <p class="modal-message">不保证功能稳定，数据可能随时被清理</p>
        <button class="ds-btn-primary" @click="showBetaModal = false">我知道了</button>
      </div>
    </div>

    <!-- 云存档提示（info/warning/error，样式见 styles/toast.css） -->
    <Transition name="toast-top">
      <div v-if="noteToast" :class="['ds-toast-top', 'ds-toast-' + noteToastType]">
        <span class="ds-toast-icon">
          <!-- info -->
          <svg v-if="noteToastType === 'info'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <!-- warning -->
          <svg v-else-if="noteToastType === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <!-- error -->
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </span>
        <span class="ds-toast-text">{{ noteToastMessage }}</span>
      </div>
    </Transition>

    <NoteModal @close-share="openNoteMenuId = null" @confirm-delete="openNoteMenuId = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, provide, defineAsyncComponent } from 'vue';

const ReplayPlayer = defineAsyncComponent(() => import('@/components/ReplayPlayer/ReplayPlayer.vue'));
const DemoLibrary = defineAsyncComponent(() => import('@/components/DemoLibrary/DemoLibrary.vue'));
const NoteLibrary = defineAsyncComponent(() => import('@/components/NoteLibrary/NoteLibrary.vue'));
import NoteModal from '@/components/NoteLibrary/NoteModal.vue';
const ConsoleModal = defineAsyncComponent(() => import('@/components/Settings/PanelModal.vue'));
import { useReplayData } from '@/composables/useReplayData';
import { useNote, type CloudArchiveItem, type NoteToastType } from '@/composables/useNote';
import { useAuth } from '@/composables/useAuth';
import { resolveTeamDisplayName } from '@/composables/teamDisplay';
import { DEBUG_CONFIG } from '@/config/debug';
import { showReplayStorageDetails } from '@/composables/replayStorageViewer';
import { pathRef, searchRef, useLocation, navigate, replaceLocation, getQuery, saveReplayerReturnUrl } from '@/location';

const { 
  parsing, 
  parsingProgress,
  parsingStatus,
  replayList, 
  loading,
  parseDemo,
  loadReplayById,
  loadRoundData,
  loadReplayByLocal,
  loadReplayByCloud,
  deleteReplayById,
  clearCloudPlaybackState,
  replay,
  currentRoundNumber,
  waitForInitialLoad,
  replayRouteError,
  replayerSource,
  replayerNoteId,
  replayerDemoId,
  cloudNoteDetailFromApi,
} = useReplayData();

const SIDEBAR_COLLAPSED_KEY = 'snowbo-sidebar-collapsed';

useLocation();

const currentPage = computed<'library' | 'player' | 'notes'>(() => {
  const p = pathRef.value;
  if (p === '/replayer') return 'player';
  if (p === '/notes') return 'notes';
  return 'library'; // /demolib or /
});

const currentDemoId = ref<string | null>(null);
const sidebarCollapsed = ref(false);
const replayerPureMode = ref(false); // 播放器内「纯净模式」时隐藏侧边栏
provide('replayerPureMode', replayerPureMode);
const showConsoleModal = ref(false);
const replayerRouteLoading = ref(false);
provide('replayerRouteLoading', replayerRouteLoading);
const showBetaModal = ref(false);

const hasSelectedDemo = computed(() => !!currentDemoId.value);

const { currentUser, truncatedUsername, fetchAuthMe } = useAuth();

const {
  noteList,
  loadNotes,
  addItem: addNoteItem,
  removeItem: removeNoteItemById,
  setItems,
  updateItem: updateNoteItem,
  quotaUsed,
  quotaLimit,
  isQuotaFull,
  noteToast,
  noteToastMessage,
  noteToastType,
  showNoteToast,
  noteUploading,
  openUploadModal,
  openEditModal,
  openEditNoteModal,
  confirmDeleteNoteId,
  confirmDeleteNoteConfirm,
  showQuotaExceededModal,
  openShareModal: openShareModalFromNote,
  openCreateNoteModal,
} = useNote();

const canPublishClip = ref(false);
function onClipPublishAvailable(payload: { available: boolean }) {
  canPublishClip.value = payload.available;
}
const canAddToNote = computed(
  () =>
    currentPage.value === 'player' &&
    replayerSource.value !== 'cloud' &&
    ((!!currentDemoId.value && !!currentRoundNumber.value && !!replay.value) || canPublishClip.value)
);

/** 当前播放的云笔记（source=cloud 时用于 ReplayPlayer 左侧「笔记」tab）。本人笔记用 noteList；公开笔记未登录或他人查看用 GET item 返回的 cloudNoteDetailFromApi */
const cloudNoteForReplayer = computed(() => {
  const id = replayerNoteId.value;
  if (!id) return null;
  const item = noteList.value.find((n) => n.id === id);
  if (item) return { title: item.title, content: item.content ?? '' };
  return cloudNoteDetailFromApi.value;
});

function openShareModal(item: CloudArchiveItem) {
  openNoteMenuId.value = null;
  openShareModalFromNote(item);
}

function onRequestEditNote(item: CloudArchiveItem) {
  openEditNoteModal(item);
  openNoteMenuId.value = null;
}

function onRequestDeleteNote(item: CloudArchiveItem) {
  confirmDeleteNoteId.value = item.id;
  openNoteMenuId.value = null;
}

async function handleAddToNote(forkContext?: import('@/composables/useNote').UploadReplayContext) {
  if (!forkContext) return;
  if (!currentUser.value) {
    showNoteToast('需要登录账户', 'warning');
    return;
  }
  if (isQuotaFull.value) {
    showQuotaExceededModal.value = true;
    return;
  }
  openUploadModal(forkContext);
}

function formatNoteTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function goToNoteItem(payload: CloudArchiveItem | { noteId: string; demoId: number }) {
  saveReplayerReturnUrl();
  const noteId = 'noteId' in payload ? payload.noteId : payload.id;
  const demoId = 'demoId' in payload ? payload.demoId : undefined;
  const params = new URLSearchParams({ source: 'cloud', note_id: noteId, tab: 'note' });
  if (demoId != null) params.set('demo_id', String(demoId));
  navigate('/replayer', params.toString());
}

/** 侧边栏使用刷新跳转，保证完整加载目标页 */
function navigateWithReload(path: string) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  window.location.href = base + path;
}

function onNavigateToDemolib() {
  navigateWithReload('/demolib');
}

function onNavigateToNotes() {
  navigateWithReload('/notes');
}

function onNoteDragEnd() {
  draggedNoteIndex.value = null;
  dragOverIndex.value = null;
  showDragIndicator.value = false;
  // 清理指示器样式
  clearDragIndicatorPosition();
}

function onNoteDragLeave() {
  dragOverIndex.value = null;
  showDragIndicator.value = false;
  // 清理指示器样式
  clearDragIndicatorPosition();
}

function toggleNoteMenu(id: string) {
  if (openNoteMenuId.value === id) {
    openNoteMenuId.value = null;
    return;
  }
  
  openNoteMenuId.value = id;
  
  // 下一帧计算位置
  nextTick(() => {
    const btn = document.querySelector(`[data-item-id="${id}"]`);
    if (btn) {
      const rect = btn.getBoundingClientRect();
      dropdownPosition.value = {
        top: `${rect.top}px`,
        left: `${rect.right + 4}px`
      };
    }
  });
}

function startRenameNote(item: CloudArchiveItem) {
  renamingNoteId.value = item.id;
  renamingTitle.value = item.title;
  openNoteMenuId.value = null;
  // 下次渲染后聚焦输入框
  nextTick(() => {
    const input = document.querySelector(`.cloud-archive-rename-input[data-id="${item.id}"]`) as HTMLInputElement;
    if (input) {
      input.focus();
      input.select();
    }
  });
}

async function saveRenameNote() {
  if (!renamingNoteId.value) return;
  const title = renamingTitle.value.trim();
  if (title === '') {
    cancelRenameNote();
    return;
  }
  if (currentUser.value) {
    await updateNoteItem(renamingNoteId.value, { title });
  } else {
    const item = noteList.value.find(i => i.id === renamingNoteId.value);
    if (item) {
      const index = noteList.value.findIndex(i => i.id === renamingNoteId.value);
      if (index !== -1) {
        const newItems = [...noteList.value];
        newItems[index] = { ...item, title };
        await setItems(newItems);
      }
    }
  }
  cancelRenameNote();
}

function cancelRenameNote() {
  renamingNoteId.value = null;
  renamingTitle.value = '';
}

function updateDragIndicatorPosition(index: number, position: 'before' | 'after') {
  const indicator = document.querySelector('.cloud-archive-drag-indicator') as HTMLElement;
  if (!indicator) return;
  
  const item = document.querySelector(`.cloud-archive-item:nth-child(${index + 1})`) as HTMLElement;
  if (!item) return;
  
  const itemRect = item.getBoundingClientRect();
  const listRect = item.parentElement!.getBoundingClientRect();
  
  const topOffset = itemRect.top - listRect.top;
  
  if (position === 'before') {
    indicator.style.top = `${topOffset}px`;
  } else {
    indicator.style.top = `${topOffset + itemRect.height}px`;
  }
}

function clearDragIndicatorPosition() {
  const indicator = document.querySelector('.cloud-archive-drag-indicator') as HTMLElement;
  if (indicator) {
    indicator.style.top = '';
  }
}

// 点击其他地方关闭菜单
function handleClickOutside() {
  openNoteMenuId.value = null;
  cancelRenameNote();
}

function handleSessionExpired() {
  showNoteToast('用户身份过期，需要重新登录', 'warning');
}

declare global {
  interface WindowEventMap {
    'app:toast': CustomEvent<{ message: string; type?: NoteToastType }>;
  }
}
function handleAppToast(e: CustomEvent<{ message: string; type?: NoteToastType }>) {
  showNoteToast(e.detail.message, e.detail.type ?? 'info');
}

// 监听全局点击事件、session 过期、全局 toast
onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  window.addEventListener('open-create-note-modal', handleOpenCreateNoteModal);
  window.addEventListener('session-expired', handleSessionExpired);
  window.addEventListener('app:toast', handleAppToast as EventListener);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
  window.removeEventListener('open-create-note-modal', handleOpenCreateNoteModal);
  window.removeEventListener('session-expired', handleSessionExpired);
  window.removeEventListener('app:toast', handleAppToast as EventListener);
});

const draggedNoteIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const dragOverPosition = ref<'before' | 'after'>('before');
const showDragIndicator = ref(false);
const openNoteMenuId = ref<string | null>(null);
const renamingNoteId = ref<string | null>(null);
const renamingTitle = ref('');

/** 判断是否为富文本 HTML（Editor 输出：含 img/span/strong 等），否则按纯文本展示 */
function isContentHtml(content: string): boolean {
  const t = content || '';
  return t.includes('<') && t.includes('>');
}

/** Handle open create note modal event from NoteLibrary */
function handleOpenCreateNoteModal() {
  openCreateNoteModal();
}
const dropdownPosition = ref({});

function onNoteDragStart(e: DragEvent, index: number) {
  draggedNoteIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }
}

function onNoteDragOver(e: DragEvent, index: number) {
  e.dataTransfer!.dropEffect = 'move';
  
  // 获取当前拖拽项的元素
  const currentItem = (e.currentTarget as HTMLElement);
  const rect = currentItem.getBoundingClientRect();
  
  if (rect) {
    const mouseY = e.clientY;
    const rectCenter = rect.top + rect.height / 2;
    
    dragOverIndex.value = index;
    dragOverPosition.value = mouseY < rectCenter ? 'before' : 'after';
    showDragIndicator.value = true;
    
    // 更新指示器的位置样式
    nextTick(() => {
      updateDragIndicatorPosition(index, dragOverPosition.value);
    });
  }
}

function onNoteDrop(toIndex: number) {
  const from = draggedNoteIndex.value;
  if (from === null || from === toIndex) return;
  
  // 根据拖拽位置调整目标索引
  let targetIndex = toIndex;
  if (dragOverPosition.value === 'after' && toIndex < noteList.value.length - 1) {
    targetIndex = toIndex + 1;
  }
  
  onNoteDragEnd();
}

// 根据 URL source/uuid/round 或 note_id 加载 replayer 数据
async function ensureReplayerRouteData() {
  const path = pathRef.value || window.location.pathname;
  const search = searchRef.value ?? window.location.search;
  pathRef.value = path;
  searchRef.value = search;

  const query = getQuery(search);
  const source = query.source ?? null;
  const uuid = query.uuid ?? null;
  const roundNum = parseInt(query.round || '', 10) || 1;
  const noteId = query.note_id ?? null;
  const demoIdRaw = query.demo_id != null ? parseInt(String(query.demo_id), 10) : undefined;
  const demoIdValid = demoIdRaw != null && !Number.isNaN(demoIdRaw) ? demoIdRaw : undefined;

  if (path === '/replayer') {
    replayerPureMode.value = (query.pure === '1' || query.pure === 'true');
  } else {
    replayerPureMode.value = false;
  }

  const isCloud = source === 'cloud' || (noteId && source !== 'local');
  const isLocal = !isCloud && (source === 'local' || uuid);

  if (path !== '/replayer') {
    replayerRouteLoading.value = false;
    return;
  }
  if (!isCloud && !isLocal) {
    replayerRouteLoading.value = false;
    if (currentDemoId.value) {
      const q = getQuery();
      const base = `source=local&uuid=${currentDemoId.value}&round=${currentRoundNumber.value || 1}`;
      const pure = (q.pure === '1' || q.pure === 'true') ? '&pure=1' : '';
      const tab = (q.tab && ['players', 'rounds', 'note', 'disable'].includes(q.tab)) ? `&tab=${q.tab}` : '';
      replaceLocation('/replayer', base + pure + tab);
    }
    return;
  }

  if (isCloud) {
    if (!noteId) {
      replayerRouteLoading.value = false;
      return;
    }
    const needLoad =
      !replay.value ||
      replayerSource.value !== 'cloud' ||
      replayerNoteId.value !== noteId ||
      (demoIdValid !== undefined && replayerDemoId.value !== demoIdValid);
    if (!needLoad) {
      replayerRouteLoading.value = false;
      currentDemoId.value = replay.value?.uuid ?? null;
      return;
    }
    replayerRouteLoading.value = true;
    currentDemoId.value = null;
    try {
      await waitForInitialLoad();
      await loadReplayByCloud(noteId, demoIdValid);
      currentDemoId.value = replay.value?.uuid ?? null;
    } finally {
      replayerRouteLoading.value = false;
    }
    return;
  }

  if (!uuid) {
    replayerRouteLoading.value = false;
    return;
  }
  const needLoadReplay = !replay.value || replay.value.uuid !== uuid || replayerSource.value !== 'local';
  const needLoadRound = !needLoadReplay && currentRoundNumber.value !== roundNum;
  if (!needLoadReplay && !needLoadRound) {
    replayerRouteLoading.value = false;
    currentDemoId.value = uuid;
    return;
  }
  replayerRouteLoading.value = true;
  currentDemoId.value = uuid;
  try {
    await waitForInitialLoad();
    if (needLoadReplay) {
      await loadReplayByLocal(uuid, roundNum);
    } else if (needLoadRound) {
      await loadRoundData(uuid, roundNum);
    }
  } finally {
    replayerRouteLoading.value = false;
  }
}

onMounted(async () => {
  const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  if (stored !== null) {
    sidebarCollapsed.value = stored === 'true';
  }
  // session 已在 main.ts 中 initAuth 提前校验，此处不再调用 fetchAuthMe 避免重复请求与闪烁
  // 刷新进入 replayer 时立即根据 URL args 加载对局并定位回合
  ensureReplayerRouteData();
  // 等 IndexedDB 初始化完成后再加载云存档，避免刷新后列表为空
  await waitForInitialLoad();
  loadNotes();
});

watch(
  () => ({ path: pathRef.value, search: searchRef.value }),
  () => ensureReplayerRouteData(),
  { deep: true }
);

watch(currentUser, (user) => {
  if (user) loadNotes();
});

watch(sidebarCollapsed, (val) => {
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(val));
});

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
};

const DEFAULT_PAGE_TITLE = 'Snowbo | 雪豹';
watch(currentPage, (newPage) => {
  if (newPage !== 'player') {
    replayerPureMode.value = false;
  }
  document.title = newPage === 'player' ? 'Demo 回放 - Snowbo' : DEFAULT_PAGE_TITLE;
}, { immediate: true });

const goToPlayer = () => {
  if (hasSelectedDemo.value) {
    saveReplayerReturnUrl();
    const q = getQuery();
    const pure = (q.pure === '1' || q.pure === 'true') ? '&pure=1' : '';
    const tab = (q.tab && ['players', 'rounds', 'note', 'disable'].includes(q.tab)) ? `&tab=${q.tab}` : '';
    navigate('/replayer', `source=local&uuid=${currentDemoId.value}&round=${currentRoundNumber.value || 1}${pure}${tab}`);
  }
};

const onLogoError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
};

/** Demolib 仅通过回合行播放按钮打开 replayer，不再通过卡片点击跳转 */
const onSelectDemo = (_demoId: string) => {
  /* no-op */
};

const onDeleteDemo = async (demoId: string) => {
  console.log('[App] Deleting demo:', demoId);
  await deleteReplayById(demoId);
  if (currentDemoId.value === demoId) {
    currentDemoId.value = null;
  }
  console.log('[App] Demo deleted successfully:', demoId);
};

const onUploadDemo = async (file: File) => {
  await parseDemo(file);
  // No auto-navigation after upload, user must click card to view
};

// Console modal handlers
const handleFrameDataViewer = () => {
  showConsoleModal.value = false;
  // Emit event to ReplayPlayer to trigger frame data viewer
  window.dispatchEvent(new CustomEvent('debug:show-frame-data'));
};

const handleStorageViewer = async () => {
  showConsoleModal.value = false;
  await showReplayStorageDetails();
};

const showBetaWarning = () => {
  showBetaModal.value = true;
};
</script>

<style scoped>
/* === App Layout === */
.app {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--ds-bg-primary-solid);
  color: var(--ds-text-secondary);
}

/* === Sidebar === */
.app-sidebar {
  width: 250px;
  background: var(--ds-bg-secondary);
  border-right: 2px solid var(--ds-border-accent);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.app-sidebar.collapsed {
  width: 72px;
}

/* === Sidebar Header === */
.sidebar-header {
  height: 72px;
  padding: var(--ds-space-lg) var(--ds-space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: var(--ds-space-md);
  border-bottom: 1px solid var(--ds-border-subtle);
}

.collapsed .sidebar-header {
  justify-content: center;
  padding: var(--ds-space-lg) var(--ds-space-md);
}

.app-branding {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  min-width: 0;
  flex: 1;
}

.app-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  flex-shrink: 0;
}

.app-title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.app-title {
  font-size: var(--ds-text-lg);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.app-subtitle {
  font-size: var(--ds-text-xs);
  font-weight: 500;
  color: var(--ds-text-tertiary);
  margin: 0;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
  opacity: 0.8;
}

.collapse-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--ds-surface-base);
  border: none;
  border-radius: var(--ds-radius-sm);
  color: var(--ds-text-secondary);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.collapse-btn:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}


/* === Sidebar Navigation === */
.sidebar-nav {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: var(--ds-space-lg) var(--ds-space-md) var(--ds-space-lg) var(--ds-space-md);
  gap: var(--ds-space-md);
}

/* Demo 本地库 / 云存档：未激活无 border，激活时有 border */
.nav-btn {
  width: 100%;
  min-height: 48px;
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--ds-radius-md);
  color: rgba(255, 255, 255, 0.9);
  font-size: var(--ds-text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  text-align: left;
}

.collapsed .nav-btn {
  justify-content: center;
  padding: var(--ds-space-md);
}

.nav-btn svg,
.nav-btn .nav-btn-icon {
  flex-shrink: 0;
}

.nav-btn .nav-btn-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.nav-label {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.collapsed .nav-label,
.collapsed .nav-text {
  opacity: 0;
  width: 0;
  overflow: hidden;
}

.nav-btn:hover:not(:disabled):not(.active) {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-btn:not(.active) svg {
  stroke: currentColor;
}

.nav-btn.active {
  background: rgba(var(--ds-primary-rgb), 0.12);
  color: var(--ds-primary);
  border-color: var(--ds-border-strong);
  box-shadow: 0 0 0 1px var(--ds-border-default);
}

.nav-btn.active:hover:not(:disabled) {
  background: rgba(var(--ds-primary-rgb), 0.18);
  border-color: var(--ds-border-strong);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  color: var(--ds-primary);
}

.nav-btn.active svg,
.nav-btn.active:hover:not(:disabled) svg {
  stroke: var(--ds-primary);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.role-badge {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px 4px 6px; /* 下边距略大，补偿 pro 的 p 下伸，视觉居中 */
  border-radius: 4px;
}

.role-badge-pro {
  background: rgba(34, 197, 94, 0.35);
  color: #22c55e;
}

.role-badge-proplus {
  background: rgba(234, 179, 8, 0.35);
  color: #eab308;
}

/* 占满中间空间，使 Beta / Console 固定在底部 */
.sidebar-spacer {
  flex: 1;
  min-height: 0;
}

/* === Beta Button Section === */
.sidebar-beta-section {
  padding: var(--ds-space-lg) var(--ds-space-md);
  flex-shrink: 0;
}

.beta-btn {
  width: 100%;
  min-height: 48px;
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: rgba(255, 193, 7, 0.1);
  border: none;
  border-radius: var(--ds-radius-md);
  color: #ffc107;
  font-size: var(--ds-text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  text-align: left;
}

.collapsed .beta-btn {
  justify-content: center;
  padding: var(--ds-space-md);
}

.beta-btn:hover {
  background: rgba(255, 193, 7, 0.2);
  box-shadow: 0 2px 8px rgba(255, 193, 7, 0.2);
}

.beta-btn-text {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #ffc107;
  text-align: center;
}

/* === Sidebar Footer (Debug Section) === */
.sidebar-footer {
  padding: var(--ds-space-lg) var(--ds-space-md);
  border-top: 1px solid var(--ds-border-subtle);
  flex-shrink: 0;
}

/* Console / 设置按钮：白色调 */
/* Console / 设置按钮：蓝色调 */
.console-toggle-btn {
  width: 100%;
  min-height: 48px;
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: rgba(74, 171, 247, 0.1);
  border: 1px solid rgba(74, 171, 247, 0.3);
  border-radius: var(--ds-radius-md);
  color: #4dabf7;
  font-size: var(--ds-text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  text-align: left;
}

.collapsed .console-toggle-btn {
  justify-content: center;
  padding: var(--ds-space-md);
}

.console-toggle-btn:hover {
  background: rgba(74, 171, 247, 0.2);
  border-color: rgba(74, 171, 247, 0.5);
  box-shadow: 0 2px 8px rgba(74, 171, 247, 0.2);
  color: #4dabf7;
}

.console-toggle-btn svg {
  stroke: currentColor;
}

/* === Main Content === */
.app-main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.app-page-header {
  width: 100%;
  flex-shrink: 0;
  box-sizing: border-box;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* === Parsing Modal === */
.parsing-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--ds-bg-primary);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: var(--ds-z-modal);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.parsing-modal {
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-lg);
  padding: var(--ds-space-3xl);
  width: 500px;
  max-width: 90vw;
  box-shadow: var(--ds-shadow-xl);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.parsing-modal h3 {
  margin: 0 0 var(--ds-space-xl) 0;
  color: var(--ds-text-primary);
  text-align: center;
  font-size: var(--ds-text-xl);
  font-weight: 600;
}

.spinner-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: var(--ds-space-2xl) 0;
}

.parsing-progress-bar-wrap {
  width: 100%;
  height: 8px;
  background: var(--ds-border-subtle);
  border-radius: 4px;
  overflow: hidden;
  margin: 0 0 var(--ds-space-lg) 0;
}

.parsing-progress-bar-fill {
  height: 100%;
  background: var(--ds-primary);
  border-radius: 4px;
  transition: width 0.2s ease;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--ds-border-subtle);
  border-top-color: var(--ds-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.parsing-status {
  margin: var(--ds-space-sm) 0 0 0;
  color: var(--ds-text-tertiary);
  text-align: center;
  font-size: var(--ds-text-base);
  min-height: 24px;
  line-height: 24px;
  animation: fade-in 0.3s ease-in;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Demo attachments list */
.demo-attachments-list {
  border: 1px solid var(--ds-border-default);
  border-radius: 6px;
  background: var(--ds-bg-secondary);
  max-height: 200px;
  overflow-y: auto;
}

.demo-attachment-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--ds-border-default);
  transition: background-color 0.2s;
}

.demo-attachment-item:last-child {
  border-bottom: none;
}

.demo-attachment-item:hover {
  background: var(--ds-bg-hover);
}

.demo-attachment-item.marked-for-deletion {
  background: var(--ds-bg-danger-subtle);
  opacity: 0.7;
}

.demo-attachment-item.marked-for-deletion .demo-uuid,
.demo-attachment-item.marked-for-deletion .demo-round {
  text-decoration: line-through;
  color: var(--ds-text-danger);
}

.demo-attachment-info {
  flex: 1;
  min-width: 0;
}

.demo-attachment-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}

.demo-uuid {
  font-family: monospace;
  font-size: 12px;
  color: var(--ds-text-secondary);
  background: var(--ds-bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.demo-round {
  font-size: 13px;
  color: var(--ds-text-primary);
  font-weight: 500;
}

.demo-attachment-size {
  font-size: 12px;
  color: var(--ds-text-secondary);
}

.demo-delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--ds-border-default);
  border-radius: 6px;
  background: var(--ds-bg-primary);
  color: var(--ds-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.demo-delete-btn:hover {
  border-color: var(--ds-border-danger);
  color: var(--ds-text-danger);
  background: var(--ds-bg-danger-subtle);
}

.demo-delete-btn.marked {
  border-color: var(--ds-border-danger);
  background: var(--ds-bg-danger);
  color: var(--ds-text-on-danger);
}

.demo-delete-btn.marked:hover {
  background: var(--ds-bg-danger-emphasis);
}

/* Existing content preview */
.existing-content-preview {
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 20px;
  font-size: 14px;
}

.existing-title {
  margin-bottom: 12px;
  color: var(--ds-text-primary);
}

.existing-content {
  margin-bottom: 16px;
  color: var(--ds-text-primary);
}

.content-preview {
  background: var(--ds-bg-tertiary);
  border-radius: 4px;
  padding: 12px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--ds-text-secondary);
  white-space: pre-wrap;
  max-height: 100px;
  overflow-y: auto;
}

.existing-demos {
  color: var(--ds-text-primary);
}

.demo-list-preview {
  margin-top: 8px;
  max-height: 120px;
  overflow-y: auto;
}

.demo-preview-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--ds-bg-tertiary);
  border-radius: 4px;
  margin-bottom: 6px;
  font-size: 12px;
}

.demo-preview-item:last-child {
  margin-bottom: 0;
}

.demo-preview-item .demo-uuid {
  font-family: monospace;
  background: var(--ds-bg-input);
  padding: 2px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}

.demo-preview-item .demo-round {
  color: var(--ds-text-primary);
  font-weight: 500;
}

.demo-preview-item .demo-size {
  margin-left: auto;
  color: var(--ds-text-secondary);
}

/* New attachment preview */
.new-attachment-preview {
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 20px;
  font-size: 14px;
}

.new-attachment-header {
  margin-bottom: 12px;
  color: var(--ds-text-primary);
}

.new-attachment-item {
  background: var(--ds-bg-tertiary);
  border-radius: 6px;
  padding: 16px;
  border: 2px solid transparent;
}

.new-item-highlight {
  border-bottom: 3px solid var(--ds-success);
  background: linear-gradient(to bottom, var(--ds-bg-tertiary), rgba(63, 185, 80, 0.05));
}

.demo-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

/* Selected Note Preview Styles */
.selected-note-preview {
  margin: 20px 0;
  padding: 16px;
  background: var(--ds-bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--ds-border-default);
}

.preview-section {
  margin-bottom: 16px;
}

.preview-section:last-child {
  margin-bottom: 0;
}

.preview-title {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
  margin: 0 0 8px 0;
}

.preview-content {
  padding: 12px;
  background: var(--ds-bg-primary-solid);
  border-radius: 6px;
  border: 1px solid var(--ds-border-default);
  min-height: 60px;
}

.content-text {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.content-text.content-html {
  white-space: normal;
}

.content-empty {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-tertiary);
  font-style: italic;
}

.demo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.demo-item {
  padding: 12px;
  background: var(--ds-bg-primary-solid);
  border-radius: 6px;
  border: 1px solid var(--ds-border-default);
}

.demo-info {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: var(--ds-text-xs);
}

.demo-map {
  font-weight: 600;
  color: var(--ds-text-primary);
}

.demo-teams {
  color: var(--ds-text-secondary);
}

.demo-time {
  color: var(--ds-text-tertiary);
  margin-left: auto;
}

.demo-map {
  font-weight: 600;
  color: var(--ds-text-primary);
  background: var(--ds-bg-success-subtle);
  padding: 4px 8px;
  border-radius: 4px;
}

.demo-teams {
  color: var(--ds-text-secondary);
}

.demo-round {
  font-weight: 500;
  color: var(--ds-text-primary);
}

.demo-source {
  font-size: 12px;
  color: var(--ds-text-success);
  font-style: italic;
}
</style>
