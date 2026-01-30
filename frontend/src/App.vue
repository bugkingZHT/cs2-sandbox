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
        <h3>正在解析 Demo 文件</h3>
        
        <!-- 进度条 -->
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${parsingProgress}%` }"></div>
          </div>
          <div class="progress-text">{{ parsingProgress }}%</div>
        </div>
        
        <!-- 状态文字 -->
        <p class="parsing-status">{{ parsingStatus }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import ReplayPlayer from '@/components/ReplayPlayer/ReplayPlayer.vue';
import DemoLibrary from '@/components/DemoLibrary/DemoLibrary.vue';
import { useReplayData } from '@/composables/useReplayData';

const { 
  parsing, 
  parsingProgress,
  parsingStatus,
  replayList, 
  loading,
  parseDemo,
  loadReplayById,
  deleteReplayById
} = useReplayData();

const currentPage = ref<'library' | 'player'>('library');
const currentDemoId = ref<string | null>(null);

const hasSelectedDemo = computed(() => !!currentDemoId.value);

const onLogoError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
};

const onSelectDemo = async (demoId: string) => {
  currentDemoId.value = demoId;
  await loadReplayById(demoId);
  
  // Auto-switch to player page
  currentPage.value = 'player';
};

const onDeleteDemo = async (demoId: string) => {
  await deleteReplayById(demoId);
  if (currentDemoId.value === demoId) {
    currentDemoId.value = null;
  }
};

const onUploadDemo = async (file: File) => {
  await parseDemo(file);
};

const onExitReplay = () => {
  currentPage.value = 'library';
};
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: #000000;
  color: #eee;
}

.app-top-bar {
  height: 48px;
  background: #0a0a0a;
  border-bottom: 1px solid #333;
  display: flex;
  align-items: center;
  padding: 0 16px;
  flex-shrink: 0;
  gap: 32px;
}

.app-branding {
  display: flex;
  align-items: center;
  gap: 8px;
}

.app-logo {
  width: 24px;
  height: 24px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.app-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  margin: 0;
  letter-spacing: 0.3px;
}

.app-tabs {
  display: flex;
  gap: 8px;
  flex: 1;
}

.tab-btn {
  padding: 8px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #888;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tab-btn svg {
  flex-shrink: 0;
}

.tab-btn:hover:not(:disabled) {
  color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.tab-btn.active {
  color: #4dabf7;
  border-bottom-color: #4dabf7;
}

.tab-btn.active svg {
  stroke: #4dabf7;
}

.tab-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid #333;
  color: #aaa;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.parsing-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.parsing-modal {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 32px;
  width: 500px;
  max-width: 90vw;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.parsing-modal h3 {
  margin: 0 0 24px 0;
  color: #fff;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
}

.progress-container {
  margin: 24px 0;
  display: flex;
  align-items: center;
  gap: 16px;
}

.progress-bar {
  flex: 1;
  height: 12px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, 
    #2563eb 0%, 
    #3b82f6 50%,
    #60a5fa 100%
  );
  background-size: 200% 100%;
  border-radius: 6px;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  animation: gradient-flow 3s ease-in-out infinite;
}

@keyframes gradient-flow {
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

.progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.3) 50%,
    transparent 100%
  );
  animation: shimmer 2s infinite;
  transform: translateX(-100%);
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(200%);
  }
}

.progress-text {
  min-width: 50px;
  text-align: right;
  color: #60a5fa;
  font-weight: 700;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

.parsing-status {
  margin: 8px 0 0 0;
  color: #aaa;
  text-align: center;
  font-size: 14px;
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
