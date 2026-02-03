<template>
  <div class="app">
    <!-- Collapsible Sidebar -->
    <aside class="app-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <!-- Sidebar Header -->
      <div class="sidebar-header">
        <div class="app-branding" v-show="!sidebarCollapsed">
          <img src="/logo/logo.png" alt="Snowbo" class="app-logo" @error="onLogoError" />
          <div class="app-title-group">
            <h1 class="app-title">Snowbo 🧀 雪豹</h1>
            <p class="app-subtitle">CS2 Demo Workshop</p>
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
          @click="currentPage = 'library'"
          :title="sidebarCollapsed ? 'Demo 库' : ''"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span v-show="!sidebarCollapsed" class="nav-text">Demo 库</span>
        </button>
        
        <button 
          class="nav-btn" 
          :class="{ active: currentPage === 'player' }"
          @click="currentPage = 'player'"
          :disabled="!hasSelectedDemo"
          :title="sidebarCollapsed ? '2D 播放器' : ''"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span v-show="!sidebarCollapsed" class="nav-text">2D 播放器</span>
        </button>
      </nav>

      <!-- Debug Menu (Bottom Section) -->
      <div v-if="DEBUG_CONFIG.enableFrameDataViewer || DEBUG_CONFIG.enableOPFSStorageViewer" class="sidebar-footer">
        <div class="debug-dropdown" ref="debugDropdownRef">
          <!-- Debug Toggle Button -->
          <button 
            class="debug-toggle-btn"
            @click="toggleDebugMenu"
            :title="sidebarCollapsed ? 'Debug Tools' : 'Debug 工具'"
          >
            <img src="/icons/debug.svg" alt="Debug" class="debug-icon" />
            <span v-show="!sidebarCollapsed" class="debug-label">Debug</span>
          </button>

          <!-- Upward Expanding Menu -->
          <div v-if="showDebugMenu" class="debug-menu-upward">
            <button 
              v-if="DEBUG_CONFIG.enableFrameDataViewer && currentPage === 'player'"
              class="debug-menu-item"
              @click="handleFrameDataViewer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <span v-show="!sidebarCollapsed">帧数据查看器</span>
            </button>

            <button 
              v-if="DEBUG_CONFIG.enableOPFSStorageViewer"
              class="debug-menu-item"
              @click="handleOPFSViewer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <span v-show="!sidebarCollapsed">OPFS 存储查看器</span>
            </button>
          </div>
        </div>
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
      <ReplayPlayer
        v-if="currentPage === 'player'"
        @exit-replay="onExitReplay"
      />
    </main>

    <!-- 解析进度弹窗 -->
    <div v-if="parsing" class="parsing-overlay">
      <div class="parsing-modal">
        <h3>正在提取 Demo 元数据</h3>
        
        <!-- 转圈动画 -->
        <div class="spinner-container">
          <div class="spinner"></div>
        </div>
        
        <!-- 状态文字 -->
        <p class="parsing-status">{{ parsingStatus }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import ReplayPlayer from '@/components/ReplayPlayer/ReplayPlayer.vue';
import DemoLibrary from '@/components/DemoLibrary/DemoLibrary.vue';
import { useReplayData } from '@/composables/useReplayData';
import { DEBUG_CONFIG } from '@/config/debug';
import { showOPFSStorageDetails } from '@/composables/opfsStorageViewer';

const { 
  parsing, 
  parsingProgress,
  parsingStatus,
  replayList, 
  loading,
  parseDemo,
  loadReplayById,
  deleteReplayById,
} = useReplayData();

const currentPage = ref<'library' | 'player'>('library');
const currentDemoId = ref<string | null>(null);
const sidebarCollapsed = ref(false);
const showDebugMenu = ref(false);
const debugDropdownRef = ref<HTMLElement | null>(null);

const hasSelectedDemo = computed(() => !!currentDemoId.value);

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
};

const toggleDebugMenu = () => {
  showDebugMenu.value = !showDebugMenu.value;
};

// Auto-collapse sidebar when switching to player page
watch(currentPage, (newPage) => {
  if (newPage === 'player' && !sidebarCollapsed.value) {
    sidebarCollapsed.value = true;
  }
});

const onLogoError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
};

const onSelectDemo = async (demoId: string) => {
  currentDemoId.value = demoId;
  await loadReplayById(demoId);
  
  // Switch to player page
  currentPage.value = 'player';
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
  currentPage.value = 'library';
};

// Debug menu handlers
const handleFrameDataViewer = () => {
  showDebugMenu.value = false;
  // Emit event to ReplayPlayer to trigger frame data viewer
  window.dispatchEvent(new CustomEvent('debug:show-frame-data'));
};

const handleOPFSViewer = async () => {
  showDebugMenu.value = false;
  await showOPFSStorageDetails();
};

// Close debug menu when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  if (debugDropdownRef.value && !debugDropdownRef.value.contains(event.target as Node)) {
    showDebugMenu.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
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
  width: 260px;
  background: var(--ds-bg-secondary);
  border-right: 2px solid var(--ds-border-accent);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width var(--ds-transition-slow);
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

.collapse-btn svg {
  transition: transform var(--ds-transition-base);
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
  transition: all var(--ds-transition-base);
}

.nav-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity var(--ds-transition-base);
}

.collapsed .nav-text {
  opacity: 0;
  width: 0;
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

/* === Sidebar Footer (Debug Section) === */
.sidebar-footer {
  padding: var(--ds-space-lg) var(--ds-space-md);
  border-top: 1px solid var(--ds-border-subtle);
  flex-shrink: 0;
}

.debug-dropdown {
  position: relative;
}

.debug-toggle-btn {
  width: 100%;
  min-height: 48px;
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
  gap: var(--ds-space-md);
  text-align: left;
}

.collapsed .debug-toggle-btn {
  justify-content: center;
  padding: var(--ds-space-md);
}

.debug-toggle-btn:hover {
  background: rgba(74, 171, 247, 0.2);
  border-color: rgba(74, 171, 247, 0.5);
  box-shadow: 0 2px 8px rgba(74, 171, 247, 0.2);
}

.debug-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  filter: brightness(0) saturate(100%) invert(67%) sepia(46%) saturate(1593%) hue-rotate(179deg) brightness(101%) contrast(93%);
}

.debug-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity var(--ds-transition-base);
}

.collapsed .debug-label {
  opacity: 0;
  width: 0;
}

/* Upward Expanding Menu */
.debug-menu-upward {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  box-shadow: var(--ds-shadow-xl);
  overflow: hidden;
  z-index: var(--ds-z-dropdown);
  animation: slideUp 0.2s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.collapsed .debug-menu-upward {
  min-width: 200px;
  left: auto;
  right: 0;
}

.debug-menu-item {
  width: 100%;
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: transparent;
  border: none;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  text-align: left;
  border-bottom: 1px solid var(--ds-border-subtle);
}

.debug-menu-item:last-child {
  border-bottom: none;
}

.debug-menu-item:hover {
  background: var(--ds-surface-base);
  color: var(--ds-text-primary);
}

.debug-menu-item svg {
  flex-shrink: 0;
  opacity: 0.7;
}

.debug-menu-item:hover svg {
  opacity: 1;
}

.collapsed .debug-menu-item span {
  display: inline;
}

/* === Main Content === */
.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: margin-left var(--ds-transition-slow);
}

/* === Parsing Modal === */
.parsing-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--ds-bg-overlay);
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
</style>
