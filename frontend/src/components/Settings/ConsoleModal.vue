<template>
  <div v-if="showModal" class="console-modal-overlay" @click="closeModal">
    <div class="console-modal" @click.stop>
      <!-- Top Bar with Tabs -->
      <div class="console-topbar">
        <div class="console-tabs">
          <button 
            :class="['tab-btn', { active: activeTab === 'user' }]"
            @click="activeTab = 'user'"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>用户管理</span>
          </button>
          <button 
            :class="['tab-btn', { active: activeTab === 'about' }]"
            @click="activeTab = 'about'"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>关于我们</span>
          </button>
          <button 
            :class="['tab-btn', { active: activeTab === 'debug' }]"
            @click="activeTab = 'debug'"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
            </svg>
            <span>开发工具</span>
          </button>
        </div>
        <button class="modal-close-btn" @click="closeModal" title="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Tab Content -->
      <div class="console-tab-content">
        <!-- User Management Tab -->
        <div v-if="activeTab === 'user'" class="tab-panel">
          <p class="modal-message">暂未上线 Coming Soon...</p>
        </div>

        <!-- About Us Tab -->
        <div v-if="activeTab === 'about'" class="tab-panel">
          <div class="about-content">
            <p class="about-featured">雪豹巨献</p>
            <p class="about-developed-by">Developed by Snowbo</p>
            <div class="title-divider"></div>
            <div class="social-section">
              <h4 class="social-title">关注我们 & 意见反馈</h4>
              <ul class="social-list">
                <li class="social-item">抖音 @2#777</li>
                <li class="social-item">小红书 @2#777</li>
                <li class="social-item">bilibili @2#777</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Debug Tools Tab -->
        <div v-if="activeTab === 'debug'" class="tab-panel">
          <div class="warning-notice">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>不要随意修改此页面中的任何配置，否则可能导致致命错误</span>
          </div>
          <div class="modal-actions-vertical">
            <button 
              v-if="DEBUG_CONFIG.enableFrameDataViewer && currentPage === 'player'"
              class="ds-btn ds-btn-console"
              @click="handleFrameDataViewer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <span>帧数据查看器</span>
            </button>
            <button 
              v-if="DEBUG_CONFIG.enableOPFSStorageViewer"
              class="ds-btn ds-btn-console"
              @click="handleOPFSViewer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <span>OPFS 存储查看器</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { DEBUG_CONFIG } from '@/config/debug';

interface Props {
  showModal: boolean;
  currentPage: 'library' | 'player';
}

interface Emits {
  (e: 'close'): void;
  (e: 'open-frame-data-viewer'): void;
  (e: 'open-opfs-viewer'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

const activeTab = ref<'user' | 'about' | 'debug'>('about');

const closeModal = () => {
  emit('close');
};

const handleFrameDataViewer = () => {
  emit('close');
  emit('open-frame-data-viewer');
};

const handleOPFSViewer = () => {
  emit('close');
  emit('open-opfs-viewer');
};
</script>

<style scoped>
.console-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5); /* More transparent background */
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--ds-z-modal);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.console-modal {
  max-width: 600px;
  width: 90vw;
  min-height: 400px;
  height: 70vh;
  max-height: 600px;
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-xl);
  animation: slideUp 0.3s ease;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

.console-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ds-space-lg) var(--ds-space-xl);
  border-bottom: 1px solid var(--ds-border-default);
  background: var(--ds-bg-elevated);
}

.console-tabs {
  display: flex;
  gap: var(--ds-space-sm);
  flex: 1;
}

.tab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-xs);
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: transparent;
  border: none;
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  min-width: 80px;
}

.tab-btn:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.tab-btn.active {
  background: var(--ds-surface-active);
  color: var(--ds-primary);
  border-radius: var(--ds-radius-md);
}

.tab-btn.active svg {
  stroke: var(--ds-primary);
}

.modal-close-btn {
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
  margin-left: var(--ds-space-md);
}

.modal-close-btn:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.modal-close-btn:active {
  transform: scale(0.95);
}

.console-tab-content {
  flex: 1;
  padding: var(--ds-space-xl);
  overflow-y: auto;
}

.tab-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.title-divider {
  width: 100%;
  height: 1px;
  background: var(--ds-border-default);
  margin: var(--ds-space-md) 0;
}

.warning-notice {
  width: 100%;
  padding: var(--ds-space-md);
  background: rgba(245, 158, 11, 0.15); /* amber with low opacity */
  border: 1px solid var(--ds-warning);
  border-radius: var(--ds-radius-md);
  color: var(--ds-warning);
  font-size: var(--ds-text-sm);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: var(--ds-space-xs);
  margin-bottom: var(--ds-space-lg);
}

.modal-title {
  margin: 0 0 var(--ds-space-md) 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-lg);
  font-weight: 700;
}

.modal-message {
  margin: 0 0 var(--ds-space-2xl) 0;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-base);
  font-weight: 500;
  line-height: 1.6;
  text-align: center;
}

.about-content {
  width: 100%;
  text-align: center;
}

.about-featured {
  font-size: var(--ds-text-lg);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: var(--ds-space-md) 0 var(--ds-space-xs) 0;
}

.about-developed-by {
  font-size: var(--ds-text-base);
  font-weight: 600;
  color: var(--ds-text-primary);
  margin: var(--ds-space-xs) 0 var(--ds-space-lg) 0;
}

.social-section {
  margin-top: var(--ds-space-xl);
}

.social-title {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
  margin: 0 0 var(--ds-space-md) 0;
}

.social-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.social-item {
  padding: var(--ds-space-sm) var(--ds-space-md);
  background: var(--ds-surface-base);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-sm);
  font-weight: 500;
  text-align: center;
}

.modal-actions-vertical {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
  width: 100%;
  max-width: 300px;
}

.ds-btn-console {
  width: 100%;
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
  justify-content: center;
  gap: var(--ds-space-md);
}

.ds-btn-console:hover {
  background: rgba(74, 171, 247, 0.2);
  border-color: rgba(74, 171, 247, 0.5);
  box-shadow: 0 2px 8px rgba(74, 171, 247, 0.2);
}

.ds-btn-console svg {
  flex-shrink: 0;
}
</style>