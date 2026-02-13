<template>
  <div class="app">
    <!-- Collapsible Sidebar（纯净模式下播放器页不展示） -->
    <aside v-show="!(currentPage === 'player' && replayerPureMode)" class="app-sidebar" :class="{ collapsed: sidebarCollapsed }">
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
          :class="{ active: currentPage === 'library' }"
          @click="navigate('/demolib')"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span v-show="!sidebarCollapsed" class="nav-label">
            <span class="nav-text">Demo 本地库</span>
          </span>
        </button>
        
        <button 
          class="nav-btn" 
          :class="{ active: currentPage === 'player' }"
          @click="goToPlayer"
          :disabled="!hasSelectedDemo"
          :title="sidebarCollapsed ? '2D 播放器' : ''"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span v-show="!sidebarCollapsed" class="nav-label">
            <span class="nav-text">2D 播放器</span>
          </span>
        </button>
      </nav>

      <!-- 云存档（紧接 2D 播放器下边缘） -->
      <div class="cloud-archive-section">
        <div
          class="cloud-archive-header"
          :class="{ 'is-collapsed': sidebarCollapsed, 'is-disabled': sidebarCollapsed && !canAddToArchive }"
          :title="sidebarCollapsed ? (canAddToArchive ? '保存当前回合到云存档' : '请在播放器中选择回合') : undefined"
          @click="sidebarCollapsed && canAddToArchive && handleAddToArchive()"
        >
          <img src="/icons/cloud.svg" alt="" class="cloud-archive-icon" />
          <span v-show="!sidebarCollapsed" class="cloud-archive-title">云存档</span>
          <button
            v-show="!sidebarCollapsed"
            type="button"
            class="cloud-archive-add-btn"
            :title="canAddToArchive ? '保存当前回合到云存档' : '请在播放器中选择回合'"
            :disabled="!canAddToArchive"
            @click="handleAddToArchive"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
        <div v-show="!sidebarCollapsed" class="cloud-archive-list-wrap">
          <div v-if="archiveList.length === 0" class="cloud-archive-empty">暂无存档</div>
          <div v-else class="cloud-archive-list">
            <div
              v-for="(item, index) in archiveList"
              :key="item.id"
              class="cloud-archive-item"
              :class="{
                'is-dragging': draggedArchiveIndex === index,
                'is-current': currentDemoId === item.demo_uuid && currentRoundNumber === item.demo_round,
                'is-drag-over-before': dragOverIndex === index && dragOverPosition === 'before',
                'is-drag-over-after': dragOverIndex === index && dragOverPosition === 'after'
              }"
              draggable="true"
              @dragstart="onArchiveDragStart($event, index)"
              @dragover.prevent="onArchiveDragOver($event, index)"
              @drop="onArchiveDrop(index)"
              @dragend="onArchiveDragEnd"
              @dragleave="onArchiveDragLeave"
            >
              <span class="cloud-archive-item-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polygon points="10 8 16 12 10 16 10 8"/>
                </svg>
              </span>
              <div class="cloud-archive-item-content-wrapper">
                <button
                  v-if="renamingArchiveId !== item.id"
                  type="button"
                  class="cloud-archive-item-content"
                  @click="goToArchiveItem(item)"
                >
                  <span class="cloud-archive-item-title">{{ item.title }}</span>
                </button>
                <input
                  v-else
                  :data-id="item.id"
                  v-model="renamingTitle"
                  type="text"
                  class="cloud-archive-rename-input"
                  @blur="saveRenameArchive"
                  @keydown.enter="saveRenameArchive"
                  @keydown.escape="cancelRenameArchive"
                />
              </div>
              <div class="cloud-archive-item-actions">
                <button
                  :data-item-id="item.id"
                  type="button"
                  class="cloud-archive-menu-btn"
                  title="更多操作"
                  @click.stop="toggleArchiveMenu(item.id)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="1"/>
                    <circle cx="12" cy="5" r="1"/>
                    <circle cx="12" cy="19" r="1"/>
                  </svg>
                </button>
                <div 
                  v-if="openArchiveMenuId === item.id"
                  class="cloud-archive-dropdown"
                  :style="dropdownPosition"
                  @click.stop
                >
                  <button
                    type="button"
                    class="cloud-archive-dropdown-item"
                    @click="startRenameArchive(item)"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                    </svg>
                    重命名
                  </button>
                  <button
                    type="button"
                    class="cloud-archive-dropdown-item"
                    @click="confirmDeleteArchiveId = item.id"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    删除
                  </button>
                </div>
              </div>
            </div>
            <!-- 拖拽目标位置指示器 -->
            <div 
              v-if="showDragIndicator && dragOverIndex !== null"
              class="cloud-archive-drag-indicator"
              :class="{
                'indicator-before': dragOverPosition === 'before',
                'indicator-after': dragOverPosition === 'after'
              }"
              :data-index="dragOverIndex"
            ></div>
          </div>
        </div>
      </div>

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
          @click="showConsoleModal = true"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
            <line x1="12" y1="2" x2="12" y2="12"></line>
          </svg>
          <span v-show="!sidebarCollapsed" class="nav-label">
            <span class="nav-text">{{ currentUser ? truncatedUsername : '系统 / 登录' }}</span>
          </span>
        </button>
      </div>
    </aside>

    <main class="app-main" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <!-- Demo Library Page -->
      <DemoLibrary
        v-if="currentPage === 'library'"
        :demo-list="replayList || []"
        :current-demo-id="currentDemoId"
        :loading="loading"
        @select-demo="onSelectDemo"
        @delete-demo="onDeleteDemo"
        @upload-demo="onUploadDemo"
      />

      <!-- Player Page -->
      <template v-if="currentPage === 'player'">
        <div v-if="replayerRouteLoading" class="replayer-loading-overlay">
          <div class="replayer-loading-modal">
            <div class="spinner-container">
              <div class="spinner"></div>
            </div>
            <p class="replayer-loading-status">正在加载回放…</p>
          </div>
        </div>
        <ReplayPlayer
          v-else
          @exit-replay="onExitReplay"
        />
      </template>

    </main>

    <!-- 解析进度弹窗（仅在上传 demo 后展示：先展示「等待解析器加载中」，再展示解析进度） -->
    <div v-if="parsing" class="parsing-overlay">
      <div class="parsing-modal">
        <h3>{{ parsingProgress === 0 ? '等待解析器加载中' : '正在提取 Demo 元数据' }}</h3>
        <div class="spinner-container">
          <div class="spinner"></div>
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
      @open-opfs-viewer="handleOPFSViewer"
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
      <div v-if="archiveAddToast" :class="['ds-toast-top', 'ds-toast-' + archiveAddToastType]">
        <span class="ds-toast-icon">
          <!-- info -->
          <svg v-if="archiveAddToastType === 'info'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <!-- warning -->
          <svg v-else-if="archiveAddToastType === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <!-- error -->
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </span>
        <span class="ds-toast-text">{{ archiveAddToastMessage }}</span>
      </div>
    </Transition>

    <!-- 云存档删除确认 -->
    <div v-if="confirmDeleteArchiveId !== null" class="beta-modal-overlay" @click="confirmDeleteArchiveId = null">
      <div class="beta-modal" @click.stop>
        <h3 class="modal-title">删除存档</h3>
        <p class="modal-message">确定删除该存档？</p>
        <div class="modal-actions">
          <button type="button" class="ds-btn-secondary" @click="confirmDeleteArchiveId = null">取消</button>
          <button type="button" class="ds-btn-primary" @click="confirmDeleteArchiveConfirm">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, provide, defineAsyncComponent } from 'vue';

const ReplayPlayer = defineAsyncComponent(() => import('@/components/ReplayPlayer/ReplayPlayer.vue'));
const DemoLibrary = defineAsyncComponent(() => import('@/components/DemoLibrary/DemoLibrary.vue'));
const ConsoleModal = defineAsyncComponent(() => import('@/components/Settings/PanelModal.vue'));
import { useReplayData } from '@/composables/useReplayData';
import { useCloudArchive, type CloudArchiveItem } from '@/composables/useCloudArchive';
import { useAuth } from '@/composables/useAuth';
import { DEBUG_CONFIG } from '@/config/debug';
import { showOPFSStorageDetails } from '@/composables/opfsStorageViewer';
import { pathRef, searchRef, useLocation, navigate, replaceLocation, getQuery } from '@/location';

const { 
  parsing, 
  parsingProgress,
  parsingStatus,
  replayList, 
  loading,
  parseDemo,
  loadReplayById,
  loadRoundData,
  deleteReplayById,
  replay,
  currentRoundNumber,
  waitForInitialLoad,
} = useReplayData();

const SIDEBAR_COLLAPSED_KEY = 'snowbo-sidebar-collapsed';

useLocation();

const currentPage = computed<'library' | 'player'>(() => {
  const p = pathRef.value;
  if (p === '/replayer') return 'player';
  return 'library'; // /demolib or /
});

const currentDemoId = ref<string | null>(null);
const sidebarCollapsed = ref(false);
const replayerPureMode = ref(false); // 播放器内「纯净模式」时隐藏侧边栏
provide('replayerPureMode', replayerPureMode);
const showConsoleModal = ref(false);
const replayerRouteLoading = ref(false);
const showBetaModal = ref(false);

const hasSelectedDemo = computed(() => !!currentDemoId.value);

const { currentUser, truncatedUsername, fetchAuthMe } = useAuth();

const {
  archiveList,
  loadArchive,
  addItem: addArchiveItem,
  removeItem: removeArchiveItemById,
  reorderItems: reorderArchiveItems,
  setItems,
} = useCloudArchive();

const canAddToArchive = computed(
  () =>
    currentPage.value === 'player' &&
    !!currentDemoId.value &&
    !!currentRoundNumber.value &&
    !!replay.value
);

type ToastType = 'info' | 'warning' | 'error';

const archiveAddToast = ref(false);
const archiveAddToastMessage = ref('已保存到云存档');
const archiveAddToastType = ref<ToastType>('info');
let archiveAddToastTimer: ReturnType<typeof setTimeout> | null = null;

function showArchiveToast(message: string, type: ToastType = 'info') {
  if (archiveAddToastTimer) clearTimeout(archiveAddToastTimer);
  archiveAddToastMessage.value = message;
  archiveAddToastType.value = type;
  archiveAddToast.value = true;
  archiveAddToastTimer = setTimeout(() => {
    archiveAddToast.value = false;
    archiveAddToastTimer = null;
  }, 2000);
}

async function handleAddToArchive() {
  if (!canAddToArchive.value || !currentDemoId.value || !currentRoundNumber.value || !replay.value) return;
  const uuid = currentDemoId.value;
  const round = currentRoundNumber.value;
  const isDuplicate = archiveList.value.some(
    (i) => i.demo_uuid === uuid && i.demo_round === round
  );
  if (isDuplicate) {
    showArchiveToast('该回合已在云存档中', 'warning');
    return;
  }
  const r = replay.value;
  const title = r.mapName ? `${r.mapName} · 第 ${round} 回合` : `回合 ${round}`;
  const item: CloudArchiveItem = {
    id: crypto.randomUUID(),
    title,
    demo_uuid: uuid,
    demo_round: round,
    add_time: Date.now(),
    mapName: r.mapName,
    teamCT: r.teamCT,
    teamT: r.teamT,
  };
  await addArchiveItem(item);
  showArchiveToast('已保存到云存档', 'info');
}

const confirmDeleteArchiveId = ref<string | null>(null);

function confirmDeleteArchiveConfirm() {
  if (confirmDeleteArchiveId.value !== null) {
    removeArchiveItemById(confirmDeleteArchiveId.value);
    confirmDeleteArchiveId.value = null;
  }
}

function formatArchiveTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function goToArchiveItem(item: CloudArchiveItem) {
  navigate('/replayer', `uuid=${item.demo_uuid}&round=${item.demo_round}`);
}

function onArchiveDragEnd() {
  draggedArchiveIndex.value = null;
  dragOverIndex.value = null;
  showDragIndicator.value = false;
  // 清理指示器样式
  clearDragIndicatorPosition();
}

function onArchiveDragLeave() {
  dragOverIndex.value = null;
  showDragIndicator.value = false;
  // 清理指示器样式
  clearDragIndicatorPosition();
}

function toggleArchiveMenu(id: string) {
  if (openArchiveMenuId.value === id) {
    openArchiveMenuId.value = null;
    return;
  }
  
  openArchiveMenuId.value = id;
  
  // 下一帧计算位置
  nextTick(() => {
    const btn = document.querySelector(`[data-item-id="${id}"] .cloud-archive-menu-btn`);
    if (btn) {
      const rect = btn.getBoundingClientRect();
      dropdownPosition.value = {
        top: `${rect.bottom + window.scrollY}px`,
        left: `${rect.left + window.scrollX}px`
      };
    }
  });
}

function startRenameArchive(item: CloudArchiveItem) {
  renamingArchiveId.value = item.id;
  renamingTitle.value = item.title;
  openArchiveMenuId.value = null;
  // 下次渲染后聚焦输入框
  nextTick(() => {
    const input = document.querySelector(`.cloud-archive-rename-input[data-id="${item.id}"]`) as HTMLInputElement;
    if (input) {
      input.focus();
      input.select();
    }
  });
}

async function saveRenameArchive() {
  if (!renamingArchiveId.value) return;
  
  const item = archiveList.value.find(i => i.id === renamingArchiveId.value);
  if (item && renamingTitle.value.trim() !== '') {
    const updatedItem = { ...item, title: renamingTitle.value.trim() };
    const index = archiveList.value.findIndex(i => i.id === renamingArchiveId.value);
    if (index !== -1) {
      const newItems = [...archiveList.value];
      newItems[index] = updatedItem;
      await setItems(newItems);
    }
  }
  cancelRenameArchive();
}

function cancelRenameArchive() {
  renamingArchiveId.value = null;
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
  openArchiveMenuId.value = null;
  cancelRenameArchive();
}

function handleSessionExpired() {
  showArchiveToast('用户身份过期，需要重新登录', 'warning');
}

declare global {
  interface WindowEventMap {
    'app:toast': CustomEvent<{ message: string; type?: ToastType }>;
  }
}
function handleAppToast(e: CustomEvent<{ message: string; type?: ToastType }>) {
  showArchiveToast(e.detail.message, e.detail.type ?? 'info');
}

// 监听全局点击事件、session 过期、全局 toast
onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  window.addEventListener('session-expired', handleSessionExpired);
  window.addEventListener('app:toast', handleAppToast as EventListener);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
  window.removeEventListener('session-expired', handleSessionExpired);
  window.removeEventListener('app:toast', handleAppToast as EventListener);
});

const draggedArchiveIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const dragOverPosition = ref<'before' | 'after'>('before');
const showDragIndicator = ref(false);
const openArchiveMenuId = ref<string | null>(null);
const renamingArchiveId = ref<string | null>(null);
const renamingTitle = ref('');
const dropdownPosition = ref({});

function onArchiveDragStart(e: DragEvent, index: number) {
  draggedArchiveIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }
}

function onArchiveDragOver(e: DragEvent, index: number) {
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

function onArchiveDrop(toIndex: number) {
  const from = draggedArchiveIndex.value;
  if (from === null || from === toIndex) return;
  
  // 根据拖拽位置调整目标索引
  let targetIndex = toIndex;
  if (dragOverPosition.value === 'after' && toIndex < archiveList.value.length - 1) {
    targetIndex = toIndex + 1;
  }
  
  reorderArchiveItems(from, targetIndex);
  onArchiveDragEnd();
}

// 根据当前 URL 的 uuid/round 加载 replayer 数据，并显示加载态（刷新时从 window.location 读以保证拿到 args）
async function ensureReplayerRouteData() {
  // 刷新场景下 path/search 可能尚未同步，优先用 window.location
  const path = pathRef.value || window.location.pathname;
  const search = searchRef.value ?? window.location.search;
  pathRef.value = path;
  searchRef.value = search;

  const query = getQuery(search);
  const uuid = query.uuid ?? null;
  const roundNum = parseInt(query.round || '', 10) || 1;

  // pure=1 时从进入 replayer 路由起就隐藏侧边栏（含加载过程）
  if (path === '/replayer') {
    replayerPureMode.value = (query.pure === '1' || query.pure === 'true');
  } else {
    replayerPureMode.value = false;
  }

  if (path !== '/replayer' || !uuid) {
    replayerRouteLoading.value = false;
    if (path === '/replayer' && !uuid && currentDemoId.value) {
      const q = getQuery();
      const search = `uuid=${currentDemoId.value}&round=${currentRoundNumber.value || 1}` + (q.pure === '1' || q.pure === 'true' ? '&pure=1' : '');
      replaceLocation('/replayer', search);
    }
    return;
  }

  const needLoadReplay = !replay.value || replay.value.uuid !== uuid;
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
      await loadReplayById(uuid);
    }
    if (roundNum !== 1 && (needLoadReplay || needLoadRound)) {
      await loadRoundData(uuid, roundNum);
    } else if (needLoadReplay && roundNum === 1) {
      // loadReplayById 已加载 round 1
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
  fetchAuthMe();
  // 刷新进入 replayer 时立即根据 URL args 加载对局并定位回合
  ensureReplayerRouteData();
  // 等 IndexedDB 初始化完成后再加载云存档，避免刷新后列表为空
  await waitForInitialLoad();
  loadArchive();
});

watch(
  () => ({ path: pathRef.value, search: searchRef.value }),
  () => ensureReplayerRouteData(),
  { deep: true }
);

watch(sidebarCollapsed, (val) => {
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(val));
});

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
};

// Auto-collapse sidebar when switching to player page
watch(currentPage, (newPage) => {
  if (newPage === 'player' && !sidebarCollapsed.value) {
    sidebarCollapsed.value = true;
  }
  if (newPage !== 'player') {
    replayerPureMode.value = false;
  }
});

const goToPlayer = () => {
  if (hasSelectedDemo.value) {
    navigate('/replayer', `uuid=${currentDemoId.value}&round=${currentRoundNumber.value || 1}`);
  }
};

const onLogoError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
};

const onSelectDemo = (demoId: string) => {
  currentDemoId.value = demoId;
  navigate('/replayer', `uuid=${demoId}&round=1`);
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

const onExitReplay = () => {
  navigate('/demolib');
};

// Console modal handlers
const handleFrameDataViewer = () => {
  showConsoleModal.value = false;
  // Emit event to ReplayPlayer to trigger frame data viewer
  window.dispatchEvent(new CustomEvent('debug:show-frame-data'));
};

const handleOPFSViewer = async () => {
  showConsoleModal.value = false;
  await showOPFSStorageDetails();
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
  background: var(--ds-bg-primary);
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
  border-bottom: 1px solid var(--ds-border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: var(--ds-space-md);
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
  border: 1px solid var(--ds-border-default);
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
  border-color: var(--ds-border-strong);
  color: var(--ds-text-primary);
}


/* === Sidebar Navigation === */
.sidebar-nav {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: var(--ds-space-lg) var(--ds-space-md);
  gap: var(--ds-space-sm);
}

.nav-btn {
  width: 100%;
  min-height: 48px;
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-tertiary);
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

.nav-btn svg {
  flex-shrink: 0;
}

.nav-label {
  min-width: 0;
  flex: 1;
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

.nav-btn:hover:not(:disabled) {
  background: var(--ds-surface-base);
  color: var(--ds-text-primary);
  border-color: var(--ds-border-default);
}

.nav-btn.active {
  background: var(--ds-surface-elevated);
  color: var(--ds-primary);
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 3px rgba(78, 204, 163, 0.1);
}

.nav-btn.active svg {
  stroke: var(--ds-primary);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* === Cloud Archive Section（上边缘与 2D 播放器最下边对齐）=== */
.cloud-archive-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--ds-space-lg) var(--ds-space-md);
  gap: var(--ds-space-sm);
  border-top: 1px solid var(--ds-border-subtle);
  overflow: hidden;
}

.cloud-archive-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-sm);
  min-height: 36px;
}

/* 收起时与 nav-btn 对齐：单一大按钮，仅云 icon，带边框和背景 */
.collapsed .cloud-archive-header.is-collapsed {
  width: 100%;
  min-height: 48px;
  padding: var(--ds-space-md);
  justify-content: center;
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  cursor: pointer;
}

.collapsed .cloud-archive-header.is-collapsed.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.collapsed .cloud-archive-section:hover .cloud-archive-header.is-collapsed:not(.is-disabled) {
  background: var(--ds-surface-hover);
  border-color: var(--ds-border-strong);
}

.collapsed .cloud-archive-section:hover .cloud-archive-header.is-collapsed:not(.is-disabled) .cloud-archive-title {
  color: var(--ds-text-primary);
}

/* 收起时云图标降低不透明度，避免纯白，与侧栏风格一致 */
.collapsed .cloud-archive-header .cloud-archive-icon {
  opacity: 0.72;
}

.collapsed .cloud-archive-section:hover .cloud-archive-header .cloud-archive-icon {
  opacity: 0.88;
  transition: none;
}

.cloud-archive-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  object-fit: contain;
  transition: none;
}

.cloud-archive-title {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  letter-spacing: 0.5px;
  transition: color var(--ds-transition-base);
}

.cloud-archive-add-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-sm);
  color: var(--ds-text-secondary);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
}

.cloud-archive-add-btn:hover:not(:disabled) {
  background: var(--ds-surface-hover);
  border-color: var(--ds-border-strong);
  color: var(--ds-primary);
  transform: scale(1.05);
}

.cloud-archive-add-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.cloud-archive-add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}

.cloud-archive-list-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  padding: var(--ds-space-xs) 0;
}

.cloud-archive-empty {
  font-size: var(--ds-text-xs);
  color: var(--ds-text-tertiary);
  padding: var(--ds-space-xl) var(--ds-space-sm);
  text-align: center;
  background: var(--ds-surface-base);
  border-radius: var(--ds-radius-md);
  border: 1px dashed var(--ds-border-subtle);
  transition: all var(--ds-transition-base);
}

.cloud-archive-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  position: relative;
  min-height: 0;
}

.cloud-archive-item {
  display: flex;
  align-items: center;
  gap: var(--ds-space-xs);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--ds-radius-sm);
  overflow: hidden;
  cursor: grab;
  transition: all var(--ds-transition-base);
  position: relative;
  z-index: 1;
}

.cloud-archive-item:hover {
  background: var(--ds-surface-base);
  border-color: var(--ds-border-default);
}

.cloud-archive-item.is-current {
  background: var(--ds-surface-elevated);
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 1px rgba(78, 204, 163, 0.3), 0 2px 8px rgba(78, 204, 163, 0.15);
  transform: none;
}

.cloud-archive-item:active {
  cursor: grabbing;
}



.cloud-archive-item.is-dragging {
  opacity: 0.7;
  transform: rotate(3deg) scale(0.96);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 10;
  position: relative;
}





.cloud-archive-item-icon {
  flex-shrink: 0;
  padding: var(--ds-space-sm) var(--ds-space-sm);
  color: var(--ds-text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--ds-transition-base);
}

.cloud-archive-item:hover .cloud-archive-item-icon {
  color: var(--ds-primary);
  transform: scale(1.1);
}

.cloud-archive-item.is-current .cloud-archive-item-icon {
  color: var(--ds-primary);
}

.cloud-archive-item-content-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  margin: 0 var(--ds-space-xs);
}

.cloud-archive-item-content {
  flex: 1;
  min-width: 0;
  padding: var(--ds-space-sm) 0;
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-sm);
  text-align: left;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  position: relative;
  overflow: hidden;
}

.cloud-archive-rename-input {
  flex: 1;
  min-width: 0;
  padding: var(--ds-space-sm) 0;
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-primary);
  border-radius: var(--ds-radius-sm);
  color: var(--ds-text-primary);
  font-size: var(--ds-text-sm);
  font-family: var(--ds-font-sans);
  outline: none;
  box-shadow: 0 0 0 2px rgba(78, 204, 163, 0.2);
}

.cloud-archive-rename-input:focus {
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 2px rgba(78, 204, 163, 0.3);
}

/* 悬停时的亮竖条已移除 */

/* 悬停时的亮竖条已移除 */

.cloud-archive-item-title {
  display: block;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cloud-archive-delete-btn {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--ds-radius-xs);
  color: var(--ds-text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color, background var(--ds-transition-base);
}

.cloud-archive-delete-btn:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-error, #e03131);
  transform: scale(1.1);
}

.cloud-archive-item-actions {
  position: relative;
  display: flex;
  align-items: center;
  margin-left: var(--ds-space-xs);
}

.cloud-archive-menu-btn {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--ds-radius-xs);
  color: var(--ds-text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--ds-transition-base);
}

.cloud-archive-menu-btn:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.cloud-archive-menu-btn:active {
  transform: scale(0.95);
}

.cloud-archive-dropdown {
  position: fixed;
  min-width: 120px;
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  box-shadow: var(--ds-shadow-lg);
  z-index: 1000;
  overflow: hidden;
  margin-top: var(--ds-space-xs);
}

.cloud-archive-dropdown-item {
  width: 100%;
  padding: var(--ds-space-sm) var(--ds-space-md);
  background: transparent;
  border: none;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-sm);
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  transition: all var(--ds-transition-base);
}

.cloud-archive-dropdown-item:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.cloud-archive-dropdown-item:active {
  background: var(--ds-surface-active);
}

.cloud-archive-dropdown-item svg {
  flex-shrink: 0;
}

.cloud-archive-delete-btn:active {
  transform: scale(0.95);
}

/* 拖拽指示器 */
.cloud-archive-list {
  position: relative;
  min-height: 0;
}

.cloud-archive-drag-indicator {
  position: absolute;
  left: var(--ds-space-sm);
  right: var(--ds-space-sm);
  height: 2px;
  background: var(--ds-primary);
  border-radius: 1px;
  transition: all var(--ds-transition-base);
  z-index: 100;
  pointer-events: none;
}

/* .cloud-archive-drag-indicator.indicator-before 已移除 */

/* .cloud-archive-drag-indicator.indicator-after 已移除 */

/* 拖拽指示器圆点已移除 */

/* 拖拽指示器圆点已移除 */

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
  border: 1px solid rgba(255, 193, 7, 0.3);
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
  border-color: rgba(255, 193, 7, 0.5);
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
}

/* === Main Content === */
.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* === Replayer 路由加载态 === */
.replayer-loading-overlay {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--ds-bg-primary);
  animation: fadeIn 0.2s ease;
}

.replayer-loading-modal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-lg);
}

.replayer-loading-status {
  margin: 0;
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-base);
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

/* === Beta Warning Modal === */
.beta-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--ds-bg-overlay);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--ds-z-modal);
  animation: fadeIn 0.2s ease;
}

.beta-modal {
  max-width: 400px;
  width: 90vw;
  padding: var(--ds-space-3xl);
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-xl);
  text-align: center;
  animation: slideUp 0.3s ease;
  position: relative;
  backdrop-filter: blur(20px);
}

.beta-modal .modal-icon {
  margin-bottom: var(--ds-space-xl);
  display: flex;
  justify-content: center;
  align-items: center;
  color: #ffc107;
  width: 64px;
  height: 64px;
  background: rgba(255, 193, 7, 0.1);
  border-radius: var(--ds-radius-full);
  margin-left: auto;
  margin-right: auto;
  padding: var(--ds-space-md);
}

.beta-modal .modal-title {
  margin: 0 0 var(--ds-space-md) 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-xl);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.beta-modal .modal-message {
  margin: 0 0 var(--ds-space-2xl) 0;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-base);
  line-height: 1.6;
  background: var(--ds-surface-base);
  padding: var(--ds-space-lg);
  border-radius: var(--ds-radius-md);
  border-left: 3px solid #ffc107;
}

.beta-modal .modal-actions {
  display: flex;
  gap: var(--ds-space-md);
  justify-content: center;
}

.beta-modal .modal-actions .ds-btn-primary {
  width: auto;
  min-width: 80px;
  transition: all var(--ds-transition-base);
}

.beta-modal .modal-actions .ds-btn-secondary {
  width: auto;
  min-width: 80px;
  background: transparent;
  border: 1px solid var(--ds-border-default);
  color: var(--ds-text-secondary);
  transition: all var(--ds-transition-base);
}

.beta-modal .modal-actions .ds-btn-secondary:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
  border-color: var(--ds-border-strong);
  transform: translateY(-2px);
}

.ds-btn-primary {
  width: 100%;
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: var(--ds-primary);
  border: 1px solid var(--ds-primary);
  border-radius: var(--ds-radius-md);
  color: white;
  font-size: var(--ds-text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-md);
}

.ds-btn-primary:hover {
  background: var(--ds-primary-hover);
  border-color: var(--ds-primary-hover);
  box-shadow: 0 2px 8px rgba(78, 204, 163, 0.3);
  transform: translateY(-2px);
}

/* === Debug Modal === */
.debug-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--ds-bg-overlay);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--ds-z-modal);
  animation: fadeIn 0.2s ease;
}

.debug-modal {
  max-width: 440px;
  width: 90vw;
  padding: var(--ds-space-3xl);
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-xl);
  text-align: center;
  animation: slideUp 0.3s ease;
  position: relative;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-close-btn {
  position: absolute;
  top: var(--ds-space-lg);
  right: var(--ds-space-lg);
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--ds-radius-sm);
  color: var(--ds-text-tertiary);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close-btn:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.modal-close-btn:active {
  transform: scale(0.95);
}

.modal-icon {
  margin-bottom: var(--ds-space-xl);
  display: flex;
  justify-content: center;
  align-items: center;
}

.debug-icon-large {
  width: 64px;
  height: 64px;
  filter: brightness(0) saturate(100%) invert(67%) sepia(46%) saturate(1593%) hue-rotate(179deg) brightness(101%) contrast(93%);
}

.modal-title {
  margin: 0 0 var(--ds-space-md) 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-xl);
  font-weight: 600;
}

.modal-message {
  margin: 0 0 var(--ds-space-2xl) 0;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-base);
  line-height: 1.6;
}

.modal-actions-vertical {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
}

.ds-btn-debug {
  width: 100%;
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: rgba(74, 171, 247, 0.1);
  border: 1px solid rgba(74, 171, 247, 0.3);
  border-radius: var(--ds-radius-md);
  color: #4dabf7;
  font-size: var(--ds-text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-md);
}

.ds-btn-debug:hover {
  background: rgba(74, 171, 247, 0.2);
  border-color: rgba(74, 171, 247, 0.5);
  box-shadow: 0 2px 8px rgba(74, 171, 247, 0.2);
}

.ds-btn-debug svg {
  flex-shrink: 0;
}
</style>
