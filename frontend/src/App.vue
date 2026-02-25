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

      <!-- Navigation: active 仅根据路由 sidebarPath，不等待播放器加载 -->
      <nav class="sidebar-nav">
        <button 
          type="button"
          class="nav-btn" 
          :class="{ active: sidebarPath === '/demolib' || sidebarPath === '/' }"
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
          type="button"
          class="nav-btn"
          :class="{ active: sidebarPath === '/replayer' }"
          @click="onNavigateToReplayer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span v-show="!sidebarCollapsed" class="nav-label">
            <span class="nav-text">2D 播放器</span>
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

    <!-- 主内容区 -->
    <div class="app-main-and-note-row">
      <!-- Library -->
      <template v-if="currentPage === 'library'">
        <div class="app-main-area" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
          <header class="app-page-header" id="app-page-header"></header>
          <div class="app-main-with-sidebar">
            <main class="app-main">
              <DemoLibrary
                v-if="currentPage === 'library'"
                :demo-list="replayList || []"
                :loading="loading"
                @select-demo="onSelectDemo"
                @delete-demo="onDeleteDemo"
                @upload-demo="onUploadDemo"
                @share-demo="onShareDemo"
              />

            </main>
          </div>
        </div>
      </template>

      <!-- Player Page -->
      <template v-else-if="currentPage === 'player'">
        <div class="app-main-area" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
          <header class="app-page-header" id="app-page-header"></header>
          <div class="app-main-with-sidebar">
            <main class="app-main">
              <ReplayPlayer
                @clip-publish-available="onClipPublishAvailable"
              />
            </main>
          </div>
        </div>
      </template>


    </div>

    <!-- Demo 相关弹窗：解析 / 分享（删除/上传阻止/强制删除在 DemoLibrary 内用 DemoModal） -->
    <DemoModal
      :parsing="parsing"
      :parsing-progress="parsingProgress"
      :parsing-status="parsingStatus"
      :share-demo="shareModalDemo"
      :share-permission="shareModalPermission"
      @update-permission="onShareUpdatePermission"
      @close-share="closeDemoShareModal"
      @copied="() => showToast('已复制', 'info')"
      @copy-failed="() => showToast('复制失败', 'error')"
    />

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

    <!-- Toast notification (info/warning/error, styles in styles/toast.css) -->
    <Transition name="toast-top">
      <div v-if="toast" :class="['ds-toast-top', 'ds-toast-' + toastType]">
        <span class="ds-toast-icon">
          <!-- info -->
          <svg v-if="toastType === 'info'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <!-- warning -->
          <svg v-else-if="toastType === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <!-- error -->
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </span>
        <span class="ds-toast-text">{{ toastMessage }}</span>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, provide, defineAsyncComponent } from 'vue';

const ReplayPlayer = defineAsyncComponent(() => import('@/components/ReplayPlayer/ReplayPlayer.vue'));
const DemoLibrary = defineAsyncComponent(() => import('@/components/DemoLibrary/DemoLibrary.vue'));

import DemoModal from '@/components/DemoLibrary/DemoModal.vue';
const ConsoleModal = defineAsyncComponent(() => import('@/components/Settings/PanelModal.vue'));
import type { ReplayData } from '@/types/replay';
import { useReplayData } from '@/composables/useReplayData';

import { useAuth } from '@/composables/useAuth';
import { resolveTeamDisplayName } from '@/composables/teamDisplay';
import { DEBUG_CONFIG } from '@/config/debug';
import { showReplayStorageDetails } from '@/composables/replayStorageViewer';
import { pathRef, searchRef, useLocation, navigate, replaceLocation, getQuery, setReplayerPlayingLocal, getReplayerPlayingLocal } from '@/location';

const { 
  parsing, 
  parsingProgress,
  parsingStatus,
  replayList, 
  loading,
  parseDemo,
  loadReplayByLocal,
  loadReplayByDemosCloud,
  loadReplayListFromServer,
  deleteReplayById,
  replay,
  currentRoundNumber,
  waitForInitialLoad,
  replayRouteError,
} = useReplayData();

const SIDEBAR_COLLAPSED_KEY = 'snowbo-sidebar-collapsed';

useLocation();

/** 侧边栏 active 用：去掉 base 后的 path，保证 /replayer、/demolib 等比较一致 */
const sidebarPath = computed(() => {
  const p = pathRef.value;
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  if (base && p.startsWith(base)) return p.slice(base.length) || '/';
  return p;
});

const currentPage = computed<'library' | 'player'>(() => {
  const p = sidebarPath.value;
  if (p === '/replayer') return 'player';
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

// Toast variables
const toast = ref(false);
const toastMessage = ref('');
const toastType = ref<'info' | 'warning' | 'error'>('info');
let toastTimer: number | null = null;

const hasSelectedDemo = computed(() => !!currentDemoId.value);

const { currentUser, truncatedUsername, fetchAuthMe } = useAuth();





const canPublishClip = ref(false);
function onClipPublishAvailable(payload: { available: boolean }) {
  canPublishClip.value = payload.available;
}


/** 侧边栏使用刷新跳转，保证完整加载目标页 */
function navigateWithReload(path: string) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  window.location.href = base + path;
}

function onNavigateToDemolib() {
  navigateWithReload('/demolib');
}

function onNavigateToReplayer() {
  const saved = getReplayerPlayingLocal();
  if (saved?.uuid != null && saved?.round != null) {
    const search = new URLSearchParams({
      demo_uuid: saved.uuid,
      round: String(saved.round),
      tab: 'players',
    }).toString();
    navigateWithReload('/replayer?' + search);
  } else {
    navigateWithReload('/replayer');
  }
}

function showToast(message: string, type: 'info' | 'warning' | 'error' = 'info') {
    if (toastTimer) clearTimeout(toastTimer);
    toastMessage.value = message;
    toastType.value = type;
    toast.value = true;
    toastTimer = setTimeout(() => {
      toast.value = false;
      toastTimer = null;
    }, 2000);
  }

// 根据 URL demo_uuid/round/tab 加载 replayer 数据；统一先读缓存、再同步云上
async function ensureReplayerRouteData() {
  const path = pathRef.value || window.location.pathname;
  const search = searchRef.value ?? window.location.search;
  pathRef.value = path;
  searchRef.value = search;

  const query = getQuery(search);
  const demoUuid = query.demo_uuid ?? null;
  const roundNum = parseInt(query.round || '', 10) || 1;
  const demoIdRaw = query.demo_id != null ? parseInt(String(query.demo_id), 10) : undefined;
  const demoIdValid = demoIdRaw != null && !Number.isNaN(demoIdRaw) ? demoIdRaw : undefined;

  if (path === '/replayer') {
    replayerPureMode.value = (query.pure === '1' || query.pure === 'true');
  } else {
    replayerPureMode.value = false;
  }

  if (path !== '/replayer') {
    replayerRouteLoading.value = false;
    return;
  }

  // 无 demo_uuid：若当前有播放中的 demo 则规范化 URL 为 demo_uuid
  if (!demoUuid) {
    replayerRouteLoading.value = false;
    if (currentDemoId.value) {
      const q = getQuery();
      const base = `demo_uuid=${encodeURIComponent(currentDemoId.value)}&round=${currentRoundNumber.value || 1}`;
      const pure = (q.pure === '1' || q.pure === 'true') ? '&pure=1' : '';
      const tab = (q.tab && ['players', 'rounds', 'settings', 'disable'].includes(q.tab)) ? `&tab=${q.tab}` : '&tab=players';
      replaceLocation('/replayer', base + pure + tab);
    }
    return;
  }

  // 统一使用 demo_uuid 请求：by-uuid 鉴权并解析出 id 后加载
  if (demoUuid) {
    await waitForInitialLoad();
    replayRouteError.value = null;
    const byUuidRes = await fetch(`/api/demos/by-uuid?demo_uuid=${encodeURIComponent(demoUuid)}`, { credentials: 'include' });
    if (byUuidRes.status === 403) {
      replayerRouteLoading.value = false;
      replayRouteError.value = 'forbidden';
      return;
    }
    if (byUuidRes.status === 404 || !byUuidRes.ok) {
      replayerRouteLoading.value = false;
      replayRouteError.value = 'not_found';
      return;
    }
    const byUuidJson = await byUuidRes.json().catch(() => ({}));
    const byUuidData = (byUuidJson as { data?: { id?: number } })?.data;
    const cloudDemoId = byUuidData?.id;
    if (cloudDemoId == null) {
      replayerRouteLoading.value = false;
      replayRouteError.value = 'not_found';
      return;
    }
    const needLoad =
      !replay.value ||
      currentRoundNumber.value !== roundNum;
    if (!needLoad) {
      replayerRouteLoading.value = false;
      currentDemoId.value = replay.value?.uuid ?? null;
      return;
    }
    replayerRouteLoading.value = true;
    currentDemoId.value = null;
    try {
      await loadReplayByDemosCloud(cloudDemoId, roundNum);
        currentDemoId.value = replay.value?.uuid ?? null;
    } finally {
      replayerRouteLoading.value = false;
    }
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
  // 等 IndexedDB 初始化完成后再 load data
  await waitForInitialLoad();
});

watch(
  () => ({ path: pathRef.value, search: searchRef.value }),
  () => ensureReplayerRouteData(),
  { deep: true }
);

watch(
  () =>
    pathRef.value === '/replayer' && replay.value?.uuid && currentRoundNumber.value
      ? { uuid: replay.value.uuid, round: currentRoundNumber.value }
      : null,
  (payload) => {
    if (payload) setReplayerPlayingLocal(payload.uuid, payload.round);
  },
  { immediate: true }
);

watch(currentUser, (user) => {
  if (user) {
    loadReplayListFromServer();
  }
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

type DemoWithCloud = ReplayData & { cloudDemoId?: number; cloudPermission?: number };
const shareModalDemo = ref<DemoWithCloud | null>(null);
const shareModalPermission = ref<0 | 1>(0);

function closeDemoShareModal() {
  shareModalDemo.value = null;
}

function onShareUpdatePermission(value: 0 | 1) {
  shareModalPermission.value = value;
  saveDemoSharePermission();
}

async function saveDemoSharePermission() {
  const demo = shareModalDemo.value;
  if (!demo || demo.cloudDemoId == null) return;
  try {
    const res = await fetch(`/api/demos/${demo.cloudDemoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ permission: shareModalPermission.value }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && (json as { status?: string }).status === 'OK') {
      showToast('可见范围已修改', 'info');
      if (replayList.value) {
        const item = replayList.value.find((d) => (d as DemoWithCloud).cloudDemoId === demo.cloudDemoId) as DemoWithCloud | undefined;
        if (item) item.cloudPermission = shareModalPermission.value;
      }
    } else {
      showToast((json as { error?: string }).error || '修改失败', 'error');
    }
  } catch {
    showToast('修改失败', 'error');
  }
}

const onShareDemo = (demo: ReplayData) => {
  const d = demo as DemoWithCloud;
  if (d.cloudDemoId == null) {
    showToast('请先上传到云端后再分享', 'warning');
    return;
  }
  shareModalDemo.value = d;
  shareModalPermission.value = (d.cloudPermission === 1 ? 1 : 0) as 0 | 1;
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
  height: 100%;
  width: 100%;
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

/* Demo 本地库 / 云存档：仅 .active 时有可见 border，避免残留描边与 focus 干扰 */
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
  outline: none;
  box-shadow: none;
}

.nav-btn:focus {
  outline: none;
}

.nav-btn:focus-visible {
  outline: 2px solid var(--ds-primary);
  outline-offset: 2px;
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

.nav-btn:not(.active) {
  border-color: transparent;
  box-shadow: none;
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

/* === Main Content：与 note-form-sidebar-slot 并列 === */
.app-main-and-note-row {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: row;
  min-height: 0;
  overflow: hidden;
}

.app-main-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.app-page-header {
  width: 100%;
  min-width: 0;
  flex-shrink: 0;
  box-sizing: border-box;
}

.app-main-with-sidebar {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  overflow: hidden;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  min-width: 0;
}

</style>
