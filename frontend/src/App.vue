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
          :title="sidebarCollapsed ? 'Demo 库' : ''"
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

      <!-- Debug Button (Bottom Section) -->
      <div v-if="DEBUG_CONFIG.enableFrameDataViewer || DEBUG_CONFIG.enableOPFSStorageViewer" class="sidebar-footer">
        <button 
          class="console-toggle-btn"
          @click="showConsoleModal = true"
          :title="sidebarCollapsed ? 'Dashboard' : '系统管理'"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
            <line x1="12" y1="2" x2="12" y2="12"></line>
          </svg>
          <span v-show="!sidebarCollapsed" class="nav-label">
            <span class="nav-text">系统管理</span>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, provide } from 'vue';
import ReplayPlayer from '@/components/ReplayPlayer/ReplayPlayer.vue';
import DemoLibrary from '@/components/DemoLibrary/DemoLibrary.vue';
import ConsoleModal from '@/components/Settings/PanelModal.vue';
import { useReplayData } from '@/composables/useReplayData';
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
      replaceLocation('/replayer', `uuid=${currentDemoId.value}&round=${currentRoundNumber.value || 1}`);
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

onMounted(() => {
  const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  if (stored !== null) {
    sidebarCollapsed.value = stored === 'true';
  }
  // 刷新进入 replayer 时立即根据 URL args 加载对局并定位回合
  ensureReplayerRouteData();
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
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--ds-space-lg) var(--ds-space-md);
  gap: var(--ds-space-sm);
  overflow-y: auto;
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
}

.beta-modal .modal-icon {
  margin-bottom: var(--ds-space-xl);
  display: flex;
  justify-content: center;
  align-items: center;
  color: #ffc107;
}

.beta-modal .modal-title {
  margin: 0 0 var(--ds-space-md) 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-xl);
  font-weight: 600;
}

.beta-modal .modal-message {
  margin: 0 0 var(--ds-space-2xl) 0;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-base);
  line-height: 1.6;
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
