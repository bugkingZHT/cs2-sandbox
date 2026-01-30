<template>
  <div class="demo-library-page">
    <div class="library-header">
      <h2 class="library-title">Counter-Strike</h2>
      <div class="library-actions">
        <input
          type="file"
          ref="fileInputRef"
          accept=".dem"
          @change="onFileSelected"
          style="display: none"
        />
        <button class="upload-btn" @click="triggerFileInput" :disabled="parsing">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>{{ parsing ? '解析中...' : '上传 Demo' }}</span>
        </button>
      </div>
    </div>

    <div v-if="loading" class="library-loading">
      <div class="spinner"></div>
      <p>加载中...</p>
    </div>

    <div v-else-if="demoList.length === 0" class="library-empty">
      <div class="empty-icon">·</div>
      <h3>暂无 Demo 文件</h3>
      <p>点击"上传 Demo"按钮开始添加</p>
    </div>

    <div v-else class="demo-grid">
      <div
        v-for="demo in sortedDemoList"
        :key="demo.id"
        class="demo-card"
        :class="{ 
          'is-current': demo.id === currentDemoId,
          'loading': isLoadingDemo && selectedDemoId === demo.id 
        }"
        @click="selectDemo(demo)"
      >
        <!-- 卡片背景图 -->
        <div class="card-background">
          <img 
            v-if="getMapLeftSideImage(demo.mapName)"
            :src="getMapLeftSideImage(demo.mapName)" 
            :alt="demo.mapName"
            @error="onImageError"
          />
          <div v-else class="placeholder-bg">
            <span>{{ demo.mapName }}</span>
          </div>
        </div>

        <!-- 卡片信息层 -->
        <div class="card-overlay">
          <div class="card-header">
            <h4 class="map-name">{{ demo.mapName || '未知地图' }}</h4>
            
            <div class="header-actions">
              <!-- 当前选中指示器 -->
              <div v-if="demo.id === currentDemoId" class="active-indicator">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>

              <!-- 删除按钮 -->
              <button 
                class="delete-btn"
                @click.stop="confirmDelete(demo)"
                title="删除此Demo"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>

          <div class="card-content">
            <div class="match-result">
              <div class="team-name winner-name">{{ getWinnerTeam(demo) }}</div>
              
              <div class="score-block">
                <div class="score-value winner-score">{{ getWinnerScore(demo) }}</div>
                <div class="score-separator">:</div>
                <div class="score-value loser-score">{{ getLoserScore(demo) }}</div>
              </div>
              
              <div class="team-name loser-name">{{ getLoserTeam(demo) }}</div>
            </div>
          </div>

          <div class="card-footer">
            <div v-if="demo.uploadTime" class="timestamp">
              {{ formatAbsoluteTime(demo.uploadTime) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <div v-if="showDeleteModal" class="delete-modal-overlay" @click="cancelDelete">
      <div class="delete-modal" @click.stop>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 class="modal-title">确认删除</h3>
        <p class="modal-message">
          确定要删除 <strong>{{ demoToDelete?.mapName || 'Demo' }}</strong> 吗？
        </p>
        <p class="modal-warning">此操作无法撤销</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="cancelDelete">取消</button>
          <button class="btn-confirm" @click="performDelete">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ReplayData } from '@/types/replay';
import { MAP_CONFIGS } from '@/config/map-config';
import { useReplayData } from '@/composables/useReplayData';

const props = defineProps<{
  demoList: ReplayData[];
  currentDemoId: string | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select-demo', id: string): void;
  (e: 'delete-demo', id: string): void;
  (e: 'upload-demo', file: File): void;
}>();

const { parsing } = useReplayData();
const fileInputRef = ref<HTMLInputElement | null>(null);
const isLoadingDemo = ref(false);
const selectedDemoId = ref<string | null>(null);
const showDeleteModal = ref(false);
const demoToDelete = ref<ReplayData | null>(null);

const sortedDemoList = computed(() => {
  return [...props.demoList].sort((a, b) => {
    return (b.timestamp || 0) - (a.timestamp || 0);
  });
});

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const onFileSelected = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    emit('upload-demo', file);
    input.value = ''; // Reset input
  }
};

const selectDemo = async (demo: ReplayData) => {
  if (isLoadingDemo.value || !demo.id) return;
  
  isLoadingDemo.value = true;
  selectedDemoId.value = demo.id;
  
  // Emit select event
  emit('select-demo', demo.id);
  
  // Wait for loading animation
  await new Promise(resolve => setTimeout(resolve, 200));
  
  isLoadingDemo.value = false;
  selectedDemoId.value = null;
};

const confirmDelete = (demo: ReplayData) => {
  demoToDelete.value = demo;
  showDeleteModal.value = true;
};

const cancelDelete = () => {
  showDeleteModal.value = false;
  demoToDelete.value = null;
};

const performDelete = () => {
  if (demoToDelete.value?.id) {
    emit('delete-demo', demoToDelete.value.id);
  }
  cancelDelete();
};

const getMapLeftSideImage = (mapName: string | undefined): string | undefined => {
  if (!mapName) return undefined;
  const config = MAP_CONFIGS[mapName];
  return config?.leftSideGroundMap;
};

const onImageError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
};

const formatDate = (timestamp: number | undefined) => {
  if (!timestamp) return '未知时间';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  
  return date.toLocaleDateString('zh-CN', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatAbsoluteTime = (timestamp: number | undefined) => {
  if (!timestamp) return '未知时间';
  const date = new Date(timestamp);
  
  return date.toLocaleString('zh-CN', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const getWinnerTeam = (demo: ReplayData) => {
  return (demo.scoreCT || 0) > (demo.scoreT || 0) ? demo.teamCT : demo.teamT;
};

const getLoserTeam = (demo: ReplayData) => {
  return (demo.scoreCT || 0) > (demo.scoreT || 0) ? demo.teamT : demo.teamCT;
};

const getWinnerScore = (demo: ReplayData) => {
  return Math.max(demo.scoreCT || 0, demo.scoreT || 0);
};

const getLoserScore = (demo: ReplayData) => {
  return Math.min(demo.scoreCT || 0, demo.scoreT || 0);
};

const getTeamClass = (demo: ReplayData, type: 'winner' | 'loser') => {
  if (type === 'winner') {
    return 'winner';
  }
  return 'loser';
};
</script>

<style scoped>
.demo-library-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #000000;
  overflow: hidden;
}

.library-header {
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #333;
  flex-shrink: 0;
}

.library-title {
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
}

.library-actions {
  display: flex;
  gap: 12px;
}

.upload-btn {
  padding: 10px 20px;
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn:hover:not(:disabled) {
  background: #2563eb;
  transform: translateY(-1px);
}

.upload-btn:disabled {
  background: #4b5563;
  cursor: not-allowed;
  opacity: 0.7;
}

.library-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #aaa;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #4dabf7;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.library-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #666;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.library-empty h3 {
  font-size: 20px;
  color: #aaa;
  margin: 0 0 8px 0;
}

.library-empty p {
  font-size: 14px;
  color: #666;
  margin: 0;
}

.demo-grid {
  flex: 1;
  padding: 24px 32px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
  overflow-y: auto;
  align-content: start;
}

.demo-card {
  position: relative;
  height: 180px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid rgba(255, 255, 255, 0.1);
  background: #000;
}

.demo-card:hover {
  border-color: rgba(59, 130, 246, 0.5);
  transform: translateY(-4px);
  box-shadow: 0 8px 16px rgba(59, 130, 246, 0.2);
}

.demo-card.is-current {
  border-color: #3b82f6;
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
}

.demo-card.loading {
  pointer-events: none;
  opacity: 0.6;
}

.demo-card.loading::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  z-index: 10;
}

.card-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}

.card-background img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.demo-card:hover .card-background img {
  transform: scale(1.1);
}

.placeholder-bg {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  font-size: 16px;
  color: #666;
  font-weight: 600;
}

.card-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.4) 0%,
    rgba(0, 0, 0, 0.85) 100%
  );
  display: flex;
  flex-direction: column;
  padding: 16px;
  transition: background 0.3s ease;
}

.demo-card:hover .card-overlay {
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.5) 0%,
    rgba(0, 0, 0, 0.9) 100%
  );
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.card-footer {
  display: flex;
  justify-content: flex-start;
}

.map-name {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.8);
  letter-spacing: 0.5px;
}

.match-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(8px);
  border-radius: 8px;
  padding: 10px 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 15px;
}

.team-name {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  opacity: 0.95;
}

.winner-name {
  color: #22c55e;
  text-align: left;
}

.loser-name {
  color: #ef4444;
  text-align: right;
}

.score-block {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-shrink: 0;
}

.score-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  min-width: 28px;
  text-align: center;
}

.winner-score {
  color: #22c55e;
}

.loser-score {
  color: #ef4444;
}

.score-separator {
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.25);
}

.timestamp {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 500;
}

.delete-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.8);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.demo-card:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: #ef4444;
  transform: scale(1.1);
}

.active-indicator {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: rgba(34, 197, 94, 0.95);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 12px rgba(34, 197, 94, 0.6);
  animation: pulse 2s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 2px 12px rgba(34, 197, 94, 0.6);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 4px 20px rgba(34, 197, 94, 0.8);
    transform: scale(1.05);
  }
}

/* 删除确认弹窗样式 */
.delete-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.delete-modal {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 32px;
  width: 420px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
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

.modal-icon {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.modal-title {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  text-align: center;
  margin: 0 0 16px 0;
}

.modal-message {
  font-size: 15px;
  color: #aaa;
  text-align: center;
  margin: 0 0 8px 0;
  line-height: 1.5;
}

.modal-message strong {
  color: #fff;
  font-weight: 600;
}

.modal-warning {
  font-size: 13px;
  color: #ef4444;
  text-align: center;
  margin: 0 0 24px 0;
}

.modal-actions {
  display: flex;
  gap: 12px;
}

.btn-cancel,
.btn-confirm {
  flex: 1;
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-1px);
}

.btn-confirm {
  background: #ef4444;
  color: #fff;
}

.btn-confirm:hover {
  background: #dc2626;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

.btn-confirm:active {
  transform: translateY(0);
}
</style>
