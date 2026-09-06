<template>
  <div class="app">
    <!-- Collapsible Sidebar（replayer 纯净模式下隐藏） -->
    <aside v-show="currentPage !== 'player' || !replayerPureMode" class="app-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <!-- Sidebar Header -->
      <div class="sidebar-header">
        <div class="app-branding" v-show="!sidebarCollapsed">
          <img src="/logo/logo.png" alt="cs2-sandbox" class="app-logo" @error="onLogoError" />
          <div class="app-title-group">
            <h1 class="app-title">cs2-sandbox</h1>
            <p class="app-subtitle">CS2 Demo Sandbox</p>
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

      <div class="sidebar-footer">
        <button class="console-toggle-btn" @click="quit">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><path d="M12 2v10"/></svg>
          <span v-show="!sidebarCollapsed" class="nav-label">退出本地工具</span>
        </button>
      </div>
    </aside>

    <!-- 移动端侧栏折叠时：左侧居中浮动按钮，点击展开侧栏 -->
    <button
      v-show="isMobile && sidebarCollapsed && (currentPage !== 'player' || !replayerPureMode)"
      type="button"
      class="sidebar-expand-fab"
      title="展开导航"
      aria-label="展开导航"
      @click="toggleSidebar"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </button>

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
                @open-local="showFilePicker = true"
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
              <ReplayPlayer />
            </main>
          </div>
        </div>
      </template>


    </div>

    <LocalFilePicker v-if="showFilePicker" :start="parseDemo" @close="showFilePicker = false" @accepted="onLocalAccepted" />
    <div v-if="closed" class="local-closed-overlay"><h2>本地服务已退出</h2><p>可以关闭此页面，下次使用请双击 EXE。</p></div>
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
import { ref, computed, watch, onMounted, onBeforeUnmount, provide } from "vue";
import ReplayPlayer from "@/components/ReplayPlayer/ReplayPlayer.vue";
import DemoLibrary from "@/components/DemoLibrary/DemoLibrary.vue";
import LocalFilePicker from "@/local/LocalFilePicker.vue";
import { localAPI } from "@/local/api";
import { useReplayData } from "@/composables/useReplayData";
import {
  pathRef,
  searchRef,
  useLocation,
  navigate,
  getQuery,
  setReplayerPlayingLocal,
  getReplayerPlayingLocal,
} from "@/location";
import { useMobileDetection } from "@/composables/browserUtils";

const {
  replayList,
  loading,
  parseDemo,
  loadRoundData,
  deleteDemoByUuid,
  replay,
  currentRoundNumber,
  waitForInitialLoad,
  error,
} = useReplayData();
useLocation();
const sidebarPath = pathRef;
const currentPage = computed(() =>
  pathRef.value === "/replayer" ? "player" : "library",
);
watch(
  currentPage,
  (page) => {
    document.title = page === "player" ? "Demo 回放 - cs2-sandbox" : "cs2-sandbox";
  },
  { immediate: true },
);
const sidebarCollapsed = ref(
  localStorage.getItem("cs2-sandbox-sidebar-collapsed") === "true",
);
const { isMobile } = useMobileDetection();
const replayerPureMode = ref(false),
  replayerRouteLoading = ref(false);
provide("replayerPureMode", replayerPureMode);
provide("replayerRouteLoading", replayerRouteLoading);
const showFilePicker = ref(false),
  closed = ref(false);
const toast = ref(false),
  toastMessage = ref(""),
  toastType = ref("info");
let toastTimer: ReturnType<typeof setTimeout>;
function showToast(message: string, type = "info") {
  toastMessage.value = message;
  toastType.value = type;
  toast.value = true;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = false), 5000);
}
function onAppToast(e: Event) {
  const d = (e as CustomEvent).detail;
  if (d?.message) showToast(d.message, d.type);
}
function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value;
}
watch(sidebarCollapsed, (v) =>
  localStorage.setItem("cs2-sandbox-sidebar-collapsed", String(v)),
);
function onNavigateToDemolib() {
  navigate("/demolib");
}
function onNavigateToReplayer() {
  const saved = replay.value
    ? { uuid: replay.value.uuid, round: currentRoundNumber.value }
    : getReplayerPlayingLocal();
  navigate(
    "/replayer",
    saved
      ? new URLSearchParams({
          demo_uuid: saved.uuid,
          round: String(saved.round),
          tab: "players",
        }).toString()
      : "",
  );
}
const onSelectDemo = () => {};
async function onDeleteDemo(uuid: string) {
  try {
    await deleteDemoByUuid(uuid);
    showToast("已移除本地记录及缓存，原始 Demo 未删除");
  } catch (e) {
    showToast(String(e), "error");
  }
}
function onLocalAccepted() {
  showFilePicker.value = false;
  navigate("/demolib");
}
let routeRequest = 0;
async function ensureRoute() {
  const request = ++routeRequest;
  if (currentPage.value !== "player") {
    replayerRouteLoading.value = false;
    replayerPureMode.value = false;
    return;
  }
  await waitForInitialLoad();
  if (request !== routeRequest) return;
  const q = getQuery();
  if (!q.demo_uuid) return;
  const n = Number(q.round) || 1;
  if (replay.value?.uuid === q.demo_uuid && currentRoundNumber.value === n)
    return;
  replayerRouteLoading.value = true;
  try {
    await loadRoundData(q.demo_uuid, n);
  } finally {
    if (request === routeRequest) replayerRouteLoading.value = false;
  }
}
watch([pathRef, searchRef], ensureRoute);
watch([() => replay.value?.uuid, currentRoundNumber], ([uuid, n]) => {
  if (uuid) setReplayerPlayingLocal(String(uuid), Number(n));
});
watch(error, (e) => {
  if (e) showToast(e, "error");
});
onMounted(async () => {
  window.addEventListener("app:toast", onAppToast);
  await waitForInitialLoad();
  await ensureRoute();
});
onBeforeUnmount(() => {
  window.removeEventListener("app:toast", onAppToast);
  clearTimeout(toastTimer);
});
function onLogoError(e: Event) {
  (e.target as HTMLImageElement).style.display = "none";
}
async function quit() {
  try {
    await localAPI("quit", {});
    closed.value = true;
  } catch (e) {
    showToast(String(e), "error");
  }
}
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

/* 移动端：折叠时侧栏完全收起（不占位），并显示左侧浮动展开按钮 */
@media (max-width: 768px) {
  .app-sidebar.collapsed {
    width: 0;
    min-width: 0;
    overflow: hidden;
    border-right-width: 0;
    padding: 0;
  }
}

.sidebar-expand-fab {
  display: none;
  position: fixed;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1000;
  width: 40px;
  height: 48px;
  padding: 0;
  background: rgba(var(--ds-primary-rgb), 0.15);
  border: none;
  border-radius: 0 var(--ds-radius-md) var(--ds-radius-md) 0;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.2);
  color: var(--ds-text-secondary);
  cursor: pointer;
  align-items: center;
  justify-content: center;
  transition: background var(--ds-transition-base), color var(--ds-transition-base);
  backdrop-filter: blur(10px);
}

.sidebar-expand-fab:hover {
  background: rgba(255, 255, 255, 0.25);
  color: var(--ds-text-primary);
}

@media (max-width: 768px) {
  .sidebar-expand-fab {
    display: flex;
  }
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


<style>
.local-closed-overlay{position:fixed;inset:0;z-index:4000;background:#17191c;color:white;display:flex;flex-direction:column;align-items:center;justify-content:center}
</style>
