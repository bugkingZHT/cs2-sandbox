<template>
  <div class="demo-drawer-wrapper">
    <!-- 触发按钮 -->
    <button 
      class="drawer-trigger" 
      @click="toggleDrawer"
      :title="isOpen ? '关闭列表' : '打开Demo列表'"
    >
      <svg 
        v-if="!isOpen" 
        width="20" 
        height="20" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="3" y="3" width="7" height="7" rx="1"></rect>
        <rect x="14" y="3" width="7" height="7" rx="1"></rect>
        <rect x="14" y="14" width="7" height="7" rx="1"></rect>
        <rect x="3" y="14" width="7" height="7" rx="1"></rect>
      </svg>
      <svg 
        v-else 
        width="20" 
        height="20" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>

    <!-- 遮罩层 -->
    <Transition name="fade">
      <div 
        v-if="isOpen" 
        class="drawer-overlay" 
        @click="closeDrawer"
      ></div>
    </Transition>

    <!-- 抽屉内容 -->
    <Transition name="slide">
      <div v-if="isOpen" class="drawer-panel">
        <div class="drawer-header">
          <h3>Demo 列表</h3>
          <div class="header-actions">
            <input
              type="file"
              accept=".dem"
              style="display: none"
              ref="fileInput"
              @change="onFileChange"
            />
            <button
              class="upload-btn"
              @click="triggerUpload"
              :disabled="parsing"
              :title="parsing ? '正在解析中...' : '上传 .dem 文件进行解析'"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <span>{{ parsing ? '解析中...' : '上传 Demo' }}</span>
            </button>
            <button class="close-btn" @click="closeDrawer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <div class="drawer-body">
          <div v-if="demoList.length === 0" class="empty-list">
            <div class="empty-icon">📦</div>
            <p>暂无Demo数据</p>
            <p class="empty-hint">请上传Demo文件</p>
          </div>

          <div v-else class="demo-grid">
            <div
              v-for="demo in demoList"
              :key="demo.id"
              class="demo-card"
              :class="{ active: currentDemoId === demo.id, loading: isLoading && selectedDemoId === demo.id }"
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
                <div class="card-info">
                  <h4 class="map-name">{{ demo.mapName || '未知地图' }}</h4>
                  <div class="team-info">
                    <span class="team ct">{{ demo.teamCT || 'CT' }}</span>
                    <span class="score">{{ demo.scoreCT || 0 }} : {{ demo.scoreT || 0 }}</span>
                    <span class="team t">{{ demo.teamT || 'T' }}</span>
                  </div>
                  <div v-if="demo.timestamp" class="timestamp">
                    {{ formatTimestamp(demo.timestamp) }}
                  </div>
                </div>

                <!-- 删除按钮 -->
                <button 
                  class="delete-btn"
                  @click.stop="deleteDemo(demo)"
                  title="删除此Demo"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>

              <!-- 当前选中指示器 -->
              <div v-if="currentDemoId === demo.id" class="active-indicator">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

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
import { ref, computed } from 'vue';
import type { ReplayData } from '@/types/replay';
import { MAP_CONFIGS } from '@/config/map-config';
import { useReplayData } from '@/composables/useReplayData';

interface Props {
  demoList: ReplayData[];
  currentDemoId?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  selectDemo: [demo: ReplayData];
  deleteDemo: [demo: ReplayData];
}>();

const { parsing, parseDemo } = useReplayData();
const fileInput = ref<HTMLInputElement | null>(null);
const showDeleteModal = ref(false);
const demoToDelete = ref<ReplayData | null>(null);

const triggerUpload = () => {
  fileInput.value?.click();
};

const onFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    await parseDemo(file);
    target.value = '';
  }
};

const isOpen = ref(false);
const isLoading = ref(false);
const selectedDemoId = ref<string | undefined>();

const toggleDrawer = () => {
  isOpen.value = !isOpen.value;
};

const openDrawer = () => {
  isOpen.value = true;
};

const closeDrawer = () => {
  isOpen.value = false;
};

// 暴露方法供父组件调用
defineExpose({
  openDrawer,
  closeDrawer,
  toggleDrawer
});

const selectDemo = async (demo: ReplayData) => {
  if (isLoading.value) return; // 防止重复点击
  
  isLoading.value = true;
  selectedDemoId.value = demo.id;
  emit('selectDemo', demo);
  
  // 等待一小段时间后关闭抽屉
  await new Promise(resolve => setTimeout(resolve, 150));
  isLoading.value = false;
  
  // 延迟关闭抽屉，让用户看到选中效果
  setTimeout(() => {
    closeDrawer();
    selectedDemoId.value = undefined;
  }, 100);
};

const deleteDemo = (demo: ReplayData) => {
  demoToDelete.value = demo;
  showDeleteModal.value = true;
};

const cancelDelete = () => {
  showDeleteModal.value = false;
  demoToDelete.value = null;
};

const performDelete = () => {
  if (demoToDelete.value) {
    emit('deleteDemo', demoToDelete.value);
  }
  cancelDelete();
};

const getMapLeftSideImage = (mapName: string): string | undefined => {
  const config = MAP_CONFIGS[mapName];
  return config?.leftSideGroundMap;
};

const onImageError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  // 隐藏加载失败的图片
  img.style.display = 'none';
};

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // 小于1分钟
  if (diff < 60000) {
    return '刚刚';
  }
  // 小于1小时
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`;
  }
  // 小于1天
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`;
  }
  // 小于7天
  if (diff < 604800000) {
    return `${Math.floor(diff / 86400000)}天前`;
  }
  
  // 超过7天显示日期
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};
</script>

<style scoped>
.demo-drawer-wrapper {
  position: relative;
}

.drawer-trigger {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 100;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.drawer-trigger:hover {
  background: rgba(59, 130, 246, 0.8);
  border-color: rgba(59, 130, 246, 0.3);
  transform: scale(1.05);
}

.drawer-trigger:active {
  transform: scale(0.95);
}

.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 200;
  backdrop-filter: blur(2px);
}

.drawer-panel {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 420px;
  max-width: 90vw;
  background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%);
  z-index: 300;
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 20px rgba(0, 0, 0, 0.5);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.drawer-header {
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.3);
}

.drawer-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #fff;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.upload-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease;
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

.upload-btn span {
  white-space: nowrap;
}

.close-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: #aaa;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.drawer-body::-webkit-scrollbar {
  width: 8px;
}

.drawer-body::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
}

.drawer-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.drawer-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.empty-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  color: #666;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-list p {
  margin: 4px 0;
  font-size: 16px;
}

.empty-hint {
  font-size: 14px !important;
  color: #888 !important;
}

.demo-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.demo-card {
  position: relative;
  height: 120px;
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

.demo-card.active {
  border-color: #3b82f6;
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
}

.demo-card.loading {
  pointer-events: none;
  opacity: 0.6;
  position: relative;
}

.demo-card.loading::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 32px;
  height: 32px;
  margin: -16px 0 0 -16px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  z-index: 10;
}

@keyframes spin {
  to { transform: rotate(360deg); }
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
  font-size: 14px;
  color: #666;
}

.card-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.3) 0%,
    rgba(0, 0, 0, 0.7) 100%
  );
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px;
  transition: background 0.3s ease;
}

.demo-card:hover .card-overlay {
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.4) 0%,
    rgba(0, 0, 0, 0.8) 100%
  );
}

.card-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.map-name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.team-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  flex-wrap: wrap;
}

.team {
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
  flex-shrink: 1;
}

.team.ct {
  background: rgba(59, 130, 246, 0.3);
  color: #93c5fd;
}

.team.t {
  background: rgba(249, 115, 22, 0.3);
  color: #fdba74;
}

.score {
  color: #fff;
  font-weight: 600;
}

.timestamp {
  font-size: 11px;
  color: #aaa;
}

.delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
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
}

.demo-card:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: #ef4444;
  transform: scale(1.1);
}

.active-indicator {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #3b82f6;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.5);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.5);
  }
  50% {
    box-shadow: 0 2px 16px rgba(59, 130, 246, 0.8);
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
  z-index: 2000;
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

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}
</style>
