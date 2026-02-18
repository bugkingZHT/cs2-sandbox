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
            @reorder="(from, to) => reorderNoteItems(from, to)"
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
          :published-note-for-round="publishedNoteForCurrentRound"
          @save-current-round="handleAddToNote"
          @edit-note="onRequestEditNote"
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

    <!-- 云存档删除确认 -->
    <div v-if="confirmDeleteNoteId !== null" class="beta-modal-overlay" @click="confirmDeleteNoteId = null">
      <div class="beta-modal" @click.stop>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v4"/>
            <path d="M12 17h.01"/>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          </svg>
        </div>
        <h3 class="modal-title">删除笔记</h3>
        <p class="modal-message">确定要删除此笔记吗？</p>
        <div class="modal-actions">
          <button type="button" class="ds-btn-secondary" @click="confirmDeleteNoteId = null">取消</button>
          <button type="button" class="ds-btn-primary" @click="onConfirmDeleteNote">删除</button>
        </div>
      </div>
    </div>

    <!-- 云存档分享弹窗 -->
    <div
      v-if="shareModalNoteId !== null"
      class="beta-modal-overlay"
      @click="onCloseShareModal"
    >
      <div class="beta-modal" @click.stop>
        <button type="button" class="modal-close-btn" aria-label="关闭" @click="onCloseShareModal">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </div>
        <h3 class="modal-title">分享笔记</h3>
        <div class="modal-form">
          <div class="form-group">
            <div class="form-radios">
              <label class="form-radio">
                <input v-model="shareModalPermission" type="radio" value="private" @change="saveShareModalPermission" />
                <span>仅自己可见</span>
              </label>
              <label class="form-radio">
                <input v-model="shareModalPermission" type="radio" value="public" @change="saveShareModalPermission" />
                <span>获得链接即可查看</span>
              </label>
            </div>
          </div>
        </div>
        <div class="share-link-row" @click="copyShareLinkInShareModal">
          <code class="share-link-url">{{ getShareUrlForNoteId(shareModalNoteId) }}</code>
          <span class="share-link-copy" :class="{ copied: shareModalCopyCopied }" title="复制链接">
            <svg v-if="!shareModalCopyCopied" class="share-link-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            <svg v-else class="share-link-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
        </div>
      </div>
    </div>

    <!-- 云存储用量已达上限 -->
    <div v-if="showQuotaExceededModal" class="beta-modal-overlay" @click="showQuotaExceededModal = false">
      <div class="beta-modal" @click.stop>
        <h3 class="modal-title">战术笔记用量已达上限</h3>
        <p class="modal-message">战术笔记用量 {{ quotaUsed }}/{{ quotaLimit }}，无法继续上传。请升级或清理后再试。</p>
        <div class="modal-actions">
          <button type="button" class="ds-btn-primary" @click="showQuotaExceededModal = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 云存档上传弹窗 -->
    <div
      v-if="uploadModalOpen"
      class="beta-modal-overlay"
      @click="uploadModalStep !== 'uploading' && closeUploadModal()"
    >
      <div class="beta-modal" :class="{ 'beta-modal--note-form': uploadModalStep === 'form' }" @click.stop>
        <!-- 表单 -->
        <template v-if="uploadModalStep === 'form'">
          <div class="modal-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="modal-icon-svg">
              <line x1="5" y1="6" x2="5" y2="6"/><line x1="10" y1="6" x2="19" y2="6"/>
              <line x1="5" y1="12" x2="5" y2="12"/><line x1="10" y1="12" x2="19" y2="12"/>
              <line x1="5" y1="18" x2="5" y2="18"/><line x1="10" y1="18" x2="19" y2="18"/>
            </svg>
          </div>
          <h3 class="modal-title">{{ editingNoteId ? '修改笔记' : '发布笔记' }}</h3>
          <div class="modal-form">
            <div class="form-group">
              <input
                v-model="uploadFormTitle"
                type="text"
                class="form-input"
                maxlength="32"
                placeholder="笔记名称"
              />
            </div>
            <div class="form-group note-form-editor-wrap">
              <Editor v-model="uploadFormContent" />
            </div>
            <div class="form-group">
              <div class="form-radios">
                <label class="form-radio">
                  <input v-model="uploadFormPermission" type="radio" value="private" />
                  <span>仅自己可见</span>
                </label>
                <label class="form-radio">
                  <input v-model="uploadFormPermission" type="radio" value="public" />
                  <span>公开链接</span>
                </label>
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="ds-btn-secondary" @click="closeUploadModal">取消</button>
            <button type="button" class="ds-btn-primary" @click="submitUploadFromModal">{{ editingNoteId ? '保存修改' : '保存' }}</button>
          </div>
        </template>
        <!-- 上传中 -->
        <template v-else-if="uploadModalStep === 'uploading'">
          <div class="modal-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <h3 class="modal-title">正在上传</h3>
          <div class="upload-progress">
            <div class="upload-progress-track">
              <div class="upload-progress-bar" :style="{ width: uploadProgress + '%' }"></div>
            </div>
            <span class="upload-progress-text">{{ uploadProgress }}%</span>
          </div>
        </template>
        <!-- 成功 -->
        <template v-else-if="uploadModalStep === 'success'">
          <div class="modal-icon success">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <h3 class="modal-title">上传成功</h3>
          <p class="modal-message success">已保存到战术笔记</p>
          <div class="share-link-row" @click="copyShareLink">
            <code class="share-link-url">{{ getShareUrl() }}</code>
            <span class="share-link-copy" :class="{ copied: copyLinkCopied }" title="复制链接">
              <svg v-if="!copyLinkCopied" class="share-link-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              <svg v-else class="share-link-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
          </div>
          <div class="modal-actions">
            <button type="button" class="ds-btn-primary" @click="closeUploadModal">完成</button>
          </div>
        </template>
        <!-- 失败 -->
        <template v-else-if="uploadModalStep === 'error'">
          <div class="modal-icon error">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <h3 class="modal-title">上传失败</h3>
          <p class="modal-message error">{{ uploadError }}</p>
          <div class="modal-actions">
            <button type="button" class="ds-btn-secondary" @click="retryUploadForm">重试</button>
            <button type="button" class="ds-btn-primary" @click="closeUploadModal">关闭</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, provide, defineAsyncComponent } from 'vue';

const ReplayPlayer = defineAsyncComponent(() => import('@/components/ReplayPlayer/ReplayPlayer.vue'));
const DemoLibrary = defineAsyncComponent(() => import('@/components/DemoLibrary/DemoLibrary.vue'));
const NoteLibrary = defineAsyncComponent(() => import('@/components/NoteLibrary/NoteLibrary.vue'));
import Editor from '@/components/NoteLibrary/Editor.vue';
const ConsoleModal = defineAsyncComponent(() => import('@/components/Settings/PanelModal.vue'));
import { useReplayData } from '@/composables/useReplayData';
import { useNote, type CloudArchiveItem, type NoteToastType } from '@/composables/useNote';
import { useAuth } from '@/composables/useAuth';
import { resolveTeamDisplayName } from '@/composables/teamDisplay';
import { DEBUG_CONFIG } from '@/config/debug';
import { showOPFSStorageDetails } from '@/composables/opfsStorageViewer';
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
  reorderItems: reorderNoteItems,
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
  uploadModalOpen,
  uploadModalStep,
  uploadFormTitle,
  uploadFormContent,
  uploadFormPermission,
  uploadProgress,
  uploadError,
  createdNoteId,
  copyLinkCopied,
  openUploadModal,
  openEditModal,
  closeUploadModal,
  retryUploadForm,
  submitUploadFromModal,
  getShareUrl,
  copyShareLink,
  confirmDeleteNoteId,
  confirmDeleteNoteConfirm,
  showQuotaExceededModal,
  shareModalNoteId,
  shareModalPermission,
  shareModalCopyCopied,
  getShareUrlForNoteId,
  openShareModal: openShareModalFromNote,
  closeShareModal,
  saveShareModalPermission,
  copyShareLinkInShareModal,
  editingNoteId,
} = useNote();

const canAddToNote = computed(
  () =>
    currentPage.value === 'player' &&
    replayerSource.value !== 'cloud' &&
    !!currentDemoId.value &&
    !!currentRoundNumber.value &&
    !!replay.value
);

/** 当前播放的云笔记（source=cloud 时用于 ReplayPlayer 左侧「笔记」tab） */
const cloudNoteForReplayer = computed(() => {
  const id = replayerNoteId.value;
  if (!id) return null;
  const item = noteList.value.find((n) => n.id === id);
  return item ? { title: item.title, content: item.content ?? '' } : null;
});

/** 当前回合是否已有发布的笔记（有则按钮绿色、点击为编辑） */
const publishedNoteForCurrentRound = computed(() => {
  if (replayerSource.value === 'cloud' && replayerNoteId.value) {
    return noteList.value.find((n) => n.id === replayerNoteId.value) ?? null;
  }
  if (replayerSource.value === 'local' && currentDemoId.value != null && currentRoundNumber.value != null) {
    return noteList.value.find(
      (n) => n.demo_uuid === currentDemoId.value && n.demo_round === currentRoundNumber.value
    ) ?? null;
  }
  return null;
});

function openShareModal(item: CloudArchiveItem) {
  openNoteMenuId.value = null;
  openShareModalFromNote(item);
}

function onRequestDeleteNote(item: CloudArchiveItem) {
  confirmDeleteNoteId.value = item.id;
  openNoteMenuId.value = null;
}

function onRequestEditNote(item: CloudArchiveItem) {
  openEditModal(item);
}

function onCloseShareModal() {
  closeShareModal();
  openNoteMenuId.value = null;
}

function onConfirmDeleteNote() {
  confirmDeleteNoteConfirm();
  openNoteMenuId.value = null;
}

async function handleAddToNote() {
  if (!canAddToNote.value || !currentDemoId.value || !currentRoundNumber.value || !replay.value) return;
  const uuid = currentDemoId.value;
  const round = currentRoundNumber.value;
  const r = replay.value;

  // 统一使用 modal，让新增时可填写 content（未登录则在 useNote 内走本地存档逻辑）
  if (currentUser.value && isQuotaFull.value) {
    showQuotaExceededModal.value = true;
    return;
  }
  openUploadModal({
    replay: {
      mapName: r.mapName,
      teamCT: resolveTeamDisplayName(r.teamCT ?? '', 3, r.serverPlayer),
      teamT: resolveTeamDisplayName(r.teamT ?? '', 2, r.serverPlayer),
    },
    roundNumber: round,
    demoId: uuid,
  });
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

function goToNoteItem(item: CloudArchiveItem) {
  saveReplayerReturnUrl();
  navigate('/replayer', `source=cloud&note_id=${encodeURIComponent(item.id)}&tab=note`);
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
  window.addEventListener('session-expired', handleSessionExpired);
  window.addEventListener('app:toast', handleAppToast as EventListener);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
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
  
  reorderNoteItems(from, targetIndex);
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
    const needLoad = !replay.value || replayerSource.value !== 'cloud' || replayerNoteId.value !== noteId;
    if (!needLoad) {
      replayerRouteLoading.value = false;
      currentDemoId.value = replay.value?.uuid ?? null;
      return;
    }
    replayerRouteLoading.value = true;
    currentDemoId.value = null;
    try {
      await waitForInitialLoad();
      await loadReplayByCloud(noteId);
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

.nav-source-tag {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1.2;
}
.nav-source-tag--local {
  background: rgba(148, 163, 184, 0.25);
  color: var(--ds-text-secondary);
}
.nav-source-tag--cloud {
  background: var(--ds-surface-elevated);
  color: var(--ds-text-primary);
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

/* 折叠且正在播放云存档：高亮显示，禁止点击（hover 仍有视觉效果） */
.collapsed .cloud-archive-header.is-collapsed.is-playing-cloud {
  background: rgba(var(--ds-primary-rgb), 0.12);
  border-color: var(--ds-border-strong);
  box-shadow: 0 0 0 1px var(--ds-border-default);
  cursor: default;
}

.collapsed .cloud-archive-section:hover .cloud-archive-header.is-collapsed.is-playing-cloud {
  background: rgba(var(--ds-primary-rgb), 0.18);
  border-color: var(--ds-border-strong);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.collapsed .cloud-archive-header.is-playing-cloud .cloud-archive-icon {
  opacity: 1;
  filter: brightness(0) invert(1);
}

.collapsed .cloud-archive-section:hover .cloud-archive-header.is-collapsed:not(.is-disabled):not(.is-playing-cloud) {
  background: var(--ds-surface-hover);
  border-color: var(--ds-border-strong);
}

.collapsed .cloud-archive-section:hover .cloud-archive-header.is-collapsed:not(.is-disabled):not(.is-playing-cloud) .cloud-archive-title {
  color: var(--ds-text-primary);
}

/* 收起时云图标降低不透明度，避免纯白，与侧栏风格一致 */
.collapsed .cloud-archive-header:not(.is-playing-cloud) .cloud-archive-icon {
  opacity: 0.72;
}

.collapsed .cloud-archive-section:hover .cloud-archive-header:not(.is-playing-cloud) .cloud-archive-icon {
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
  min-width: 0;
  letter-spacing: 0.5px;
  transition: color var(--ds-transition-base);
}

.cloud-archive-add-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  margin-left: auto;
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

.cloud-archive-quota-wrap {
  position: relative;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: visible;
}

.cloud-archive-quota-fan {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.cloud-archive-quota-tooltip {
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-left: 6px;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1.3;
  color: var(--ds-text-primary);
  background: var(--ds-bg-tertiary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-sm);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s, visibility 0.15s;
  z-index: 10;
}

.cloud-archive-quota-wrap:hover .cloud-archive-quota-tooltip {
  opacity: 1;
  visibility: visible;
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

.cloud-archive-list-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  padding: var(--ds-space-xs) 0;
}



/* Modal Form */
.modal-form {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-lg);
  margin: 0 0 var(--ds-space-xl);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.form-label {
  font-size: var(--ds-text-sm);
  font-weight: 500;
  color: var(--ds-text-secondary);
}

.form-input {
  width: 100%;
  padding: var(--ds-space-sm) var(--ds-space-md);
  font-size: var(--ds-text-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  background: var(--ds-bg-primary);
  color: var(--ds-text-primary);
  box-sizing: border-box;
}

.form-textarea {
  resize: vertical;
  line-height: 1.4;
  min-height: 92px;
}

.form-input::placeholder {
  color: var(--ds-text-tertiary);
}

.form-radios {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.form-radios-with-button {
  display: flex;
  align-items: center;
  gap: var(--ds-space-lg);
}

.form-radios-with-button .form-radios {
  flex: 1;
  margin: 0;
}

.form-radio {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  color: var(--ds-text-primary);
  cursor: pointer;
}

.form-radio input {
  margin: 0;
}

/* Upload Progress */
.upload-progress {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  margin: 0 0 var(--ds-space-xl);
}

.upload-progress-track {
  height: 8px;
  width: 100%;
  background: var(--ds-border-subtle);
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.upload-progress-bar {
  height: 100%;
  min-width: 0;
  background: var(--ds-primary);
  border-radius: 4px;
  transition: width 0.15s ease;
}

.upload-progress-text {
  text-align: center;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* Share Link */
.share-link-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  margin: 0 0 var(--ds-space-xl);
  padding: var(--ds-space-sm) var(--ds-space-md);
  border-radius: var(--ds-radius-md);
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-subtle);
  cursor: pointer;
  transition: background 0.15s;
  min-width: 0;
}

.share-link-row:hover {
  background: var(--ds-surface-hover);
}

.share-link-url {
  flex: 1;
  min-width: 0;
  font-family: var(--ds-font-mono, 'Consolas', 'Monaco', monospace);
  font-size: var(--ds-text-xs);
  color: var(--ds-text-primary);
  white-space: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.share-link-url::-webkit-scrollbar {
  display: none;
}

.share-link-copy {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ds-radius-sm);
  background: var(--ds-surface-elevated);
  color: var(--ds-text-secondary);
  transition: all 0.15s;
}

.share-link-copy-icon {
  width: 14px;
  height: 14px;
}

.share-link-row:hover .share-link-copy {
  background: var(--ds-accent-primary);
  color: white;
}

.share-link-copy.copied {
  background: var(--ds-accent-success, #22c55e);
  color: white;
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
  min-height: 40px;
  flex-shrink: 0;
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
  background: rgba(var(--ds-primary-rgb), 0.12);
  border-color: var(--ds-border-strong);
  box-shadow: 0 0 0 1px var(--ds-border-default);
  transform: none;
}

.cloud-archive-item.is-current .cloud-archive-item-title,
.cloud-archive-item.is-current .cloud-archive-item-content {
  color: var(--ds-primary);
}

/* active hover 与 BETA/console 一致：仅加强背景、边框、阴影，文字与图标保持主色 */
.cloud-archive-item.is-current:hover {
  background: rgba(var(--ds-primary-rgb), 0.18);
  border-color: var(--ds-border-strong);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.cloud-archive-item.is-current:hover .cloud-archive-item-title,
.cloud-archive-item.is-current:hover .cloud-archive-item-content,
.cloud-archive-item.is-current:hover .cloud-archive-item-icon {
  color: var(--ds-primary);
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

/* 仅非正在播放的 item hover 时 icon 变色、放大；正在播放的 item hover 时 icon 不变 */
.cloud-archive-item:not(.is-current):hover .cloud-archive-item-icon {
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
  margin: 0;
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
  box-shadow: 0 0 0 2px rgba(var(--ds-primary-rgb), 0.25);
}

.cloud-archive-rename-input:focus {
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 2px rgba(var(--ds-primary-rgb), 0.35);
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

.cloud-archive-item:not(.is-current) .cloud-archive-item-title {
  color: var(--ds-text-tertiary);
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
  height: 100%;
}

.cloud-archive-menu-btn {
  width: 26px;
  height: 100%;
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
  z-index: var(--ds-z-modal);
  overflow: hidden;
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

/* 战术笔记发布/编辑页：更大 modal，content 区域做大 */
.beta-modal--note-form {
  max-width: 800px;
  width: 92vw;
  text-align: left;
}

.beta-modal--note-form .modal-title {
  text-align: center;
}

.beta-modal--note-form .modal-form {
  margin-bottom: var(--ds-space-xl);
}

.beta-modal--note-form .note-form-editor-wrap {
  min-height: 220px;
  display: flex;
  flex-direction: column;
}

.beta-modal--note-form .note-form-editor-wrap .doc-editor {
  flex: 1;
  min-height: 0;
}

.beta-modal .modal-icon {
  margin-bottom: var(--ds-space-xl);
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--ds-primary);
  width: 64px;
  height: 64px;
  background: rgba(var(--ds-primary-rgb), 0.12);
  border-radius: var(--ds-radius-full);
  margin-left: auto;
  margin-right: auto;
  padding: var(--ds-space-md);
}

.modal-icon-svg {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.beta-modal .modal-icon.success {
  color: var(--ds-success);
  background: rgba(63, 185, 80, 0.15);
}

.beta-modal .modal-icon.success .modal-icon-svg {
  filter: brightness(0) saturate(100%) invert(58%) sepia(42%) saturate(1200%) hue-rotate(95deg) brightness(95%) contrast(89%);
}

.beta-modal .modal-icon.error {
  color: var(--ds-danger, #ef4444);
  background: rgba(239, 68, 68, 0.1);
}

.beta-modal .modal-icon.error .modal-icon-svg {
  filter: brightness(0) saturate(100%) invert(29%) sepia(88%) saturate(3207%) hue-rotate(342deg) brightness(95%) contrast(97%);
}

.beta-modal .modal-title {
  margin: 0 0 var(--ds-space-md) 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-xl);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.beta-modal .modal-message {
  margin: 0 0 var(--ds-space-xl) 0;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-base);
  line-height: 1.6;
}

.beta-modal .modal-message.success {
  color: var(--ds-success, #10b981);
}

.beta-modal .modal-message.error {
  color: var(--ds-danger, #ef4444);
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
  border-radius: var(--ds-radius-md);
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
  color: var(--ds-primary-text);
  font-size: var(--ds-text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-md);
}

.ds-btn-primary.ds-btn-small {
  width: auto;
  padding: var(--ds-space-sm) var(--ds-space-md);
  font-size: var(--ds-text-xs);
  min-width: 60px;
  border-radius: var(--ds-radius-md);
}

.ds-btn-primary:hover {
  background: var(--ds-primary-hover);
  border-color: var(--ds-primary-hover);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  transform: translateY(-2px);
}

.ds-btn-primary.ds-btn-small:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
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
