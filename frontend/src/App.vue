<template>
  <div class="app">
    <!-- Top Navigation Bar -->
    <header class="app-top-bar">
      <div class="app-branding">
        <img src="/logo/logo.png" alt="Snowbo" class="app-logo" @error="onLogoError" />
        <h1 class="app-title">Snowbo 🧀 雪豹</h1>
      </div>
      
      <nav class="app-tabs">
        <button 
          class="tab-btn" 
          :class="{ active: currentPage === 'library' }"
          @click="currentPage = 'library'"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span>Demo 库</span>
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: currentPage === 'player' }"
          @click="currentPage = 'player'"
          :disabled="!hasSelectedDemo"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          <span>2D 播放器</span>
        </button>
      </nav>

      <!-- Debug Dropdown Menu -->
      <div v-if="DEBUG_CONFIG.enableFrameDataViewer || DEBUG_CONFIG.enableOPFSStorageViewer" class="debug-dropdown" ref="debugDropdownRef">
        <button class="debug-btn" @click="toggleDebugMenu" title="Debug Tools">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
          <svg class="chevron" :class="{ open: showDebugMenu }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        <div v-if="showDebugMenu" class="debug-menu">
          <button 
            v-if="DEBUG_CONFIG.enableFrameDataViewer && currentPage === 'player'"
            class="debug-menu-item"
            @click="handleFrameDataViewer"
            title="查看当前帧数据"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
            <span>帧数据查看器</span>
          </button>

          <button 
            v-if="DEBUG_CONFIG.enableOPFSStorageViewer"
            class="debug-menu-item"
            @click="handleOPFSViewer"
            title="查看 OPFS 存储详情"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <span>OPFS 存储查看器</span>
          </button>
        </div>
      </div>
    </header>

    <main class="app-main">
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
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
const showDebugMenu = ref(false);
const debugDropdownRef = ref<HTMLElement | null>(null);

const hasSelectedDemo = computed(() => !!currentDemoId.value);

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
const toggleDebugMenu = () => {
  showDebugMenu.value = !showDebugMenu.value;
};

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
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--ds-bg-primary);
  color: var(--ds-text-secondary);
}

/* === Top Bar === */
.app-top-bar {
  height: 64px;
  background: var(--ds-bg-secondary);
  border-bottom: 2px solid var(--ds-border-accent);
  display: flex;
  align-items: center;
  padding: 0 var(--ds-space-2xl);
  flex-shrink: 0;
  gap: var(--ds-space-3xl);
}

.app-branding {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
}

.app-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.app-title {
  font-size: var(--ds-text-xl);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0;
  letter-spacing: 0.5px;
}

/* === Tabs === */
.app-tabs {
  display: flex;
  gap: var(--ds-space-sm);
  flex: 1;
}

.tab-btn {
  padding: var(--ds-space-md) var(--ds-space-xl);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
}

.tab-btn svg {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}

.tab-btn:hover:not(:disabled) {
  color: var(--ds-text-primary);
  background: var(--ds-surface-base);
}

.tab-btn.active {
  color: var(--ds-primary);
  border-bottom-color: var(--ds-primary);
}

.tab-btn.active svg {
  stroke: var(--ds-primary);
}

.tab-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* === Debug Dropdown === */
.debug-dropdown {
  position: relative;
  margin-left: auto;
}

.debug-btn {
  height: 38px;
  padding: 0 var(--ds-space-md);
  background: rgba(74, 171, 247, 0.15);
  border: 1px solid rgba(74, 171, 247, 0.4);
  border-radius: var(--ds-radius-sm);
  color: #4dabf7;
  font-size: var(--ds-text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  white-space: nowrap;
}

.debug-btn:hover {
  background: rgba(74, 171, 247, 0.25);
  border-color: rgba(74, 171, 247, 0.6);
  box-shadow: 0 2px 8px rgba(74, 171, 247, 0.3);
}

.debug-btn svg {
  flex-shrink: 0;
}

.debug-btn .chevron {
  transition: transform var(--ds-transition-base);
}

.debug-btn .chevron.open {
  transform: rotate(180deg);
}

.debug-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 200px;
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  box-shadow: var(--ds-shadow-xl);
  overflow: hidden;
  z-index: 100;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
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

/* === Main Content === */
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
