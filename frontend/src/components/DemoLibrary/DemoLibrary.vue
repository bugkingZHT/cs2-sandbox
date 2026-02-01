<<template>
  <div class="demo-library-page">
    <!-- Modern Header -->
    <div class="library-header">
      <div class="header-content">
        <h1 class="library-title">Counter-Strike 2 Demos</h1>
        <p class="library-subtitle">Manage and replay your game recordings</p>
      </div>
      <div class="library-actions">
        <input
          type="file"
          ref="fileInputRef"
          accept=".dem"
          @change="onFileSelected"
          style="display: none"
        />

        <!-- Storage Quota Icon Button -->
        <div class="quota-btn-container">
          <button class="quota-btn" title="Storage Usage">
            <svg width="20" height="20" viewBox="0 0 1024 1024" fill="currentColor">
              <path d="M478.037333 853.674667c-176.469333 0-320.170667-143.701333-320.170666-320.170667S301.397333 213.333333 478.037333 213.333333v-68.266666C263.850667 145.066667 89.6 319.317333 89.6 533.504s174.250667 388.437333 388.437333 388.437333c212.821333 0 387.072-173.226667 388.266667-386.048l-68.266667-0.341333c-1.024 175.445333-144.554667 318.122667-320 318.122667z"/>
              <path d="M520.704 94.208v398.506667h395.946667c0-0.853333 0.170667-1.536 0.170666-2.389334 0-218.794667-177.322667-396.117333-396.117333-396.117333z m68.266667 330.24V169.642667c126.976 26.965333 226.816 127.658667 252.928 254.805333H588.970667z"/>
            </svg>
          </button>
          
          <!-- Hover Tooltip -->
          <div class="quota-tooltip">
            <div class="quota-tooltip-header">
              <span class="quota-tooltip-title">本地存储空间</span>
            </div>
            <div class="quota-tooltip-body">
              <div class="quota-info-row">
                <span class="quota-label">已使用:</span>
                <span class="quota-value">{{ storageUsedText }}</span>
              </div>
              <div class="quota-info-row">
                <span class="quota-label">可用总量:</span>
                <span class="quota-value">{{ storageQuotaText }}</span>
              </div>
              <div class="quota-progress-bar">
                <div 
                  class="quota-progress-fill" 
                  :class="{ 
                    'storage-warning': storageUsagePercent >= 80 && storageUsagePercent < 95,
                    'storage-critical': storageUsagePercent >= 95
                  }"
                  :style="{ width: `${storageUsagePercent}%` }"
                ></div>
              </div>
              <div class="quota-percentage">{{ storageUsagePercent }}%</div>
            </div>
          </div>
        </div>

        <button class="ds-btn ds-btn-primary" @click="triggerFileInput" :disabled="parsing">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>{{ parsing ? 'Parsing...' : 'Upload Demo' }}</span>
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="ds-empty">
      <div class="ds-spinner" style="width: 40px; height: 40px; border-width: 4px;"></div>
      <p class="ds-empty-title" style="margin-top: 24px;">Loading...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="demoList.length === 0" class="ds-empty">
      <div class="ds-empty-icon">📂</div>
      <h3 class="ds-empty-title">暂无 Demo 文件</h3>
      <p class="ds-empty-description">点击"上传"按钮开始解析 Demo</p>
    </div>

    <!-- Demo Grid -->
    <div v-else class="demo-grid-container">
      <div class="demo-grid">
        <div
          v-for="demo in sortedDemoList"
          :key="demo.id"
          class="demo-card ds-card"
          :class="{ 
            'is-current': demo.id === currentDemoId,
            'loading': isLoadingDemo && selectedDemoId === demo.id,
            'is-parsing': demo.isParsing
          }"
          @click="selectDemo(demo)"
        >
          <!-- Card Background -->
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

          <!-- Card Content Overlay -->
          <div class="card-overlay">
            <!-- Top: Map Name + Badge -->
            <div class="card-top">
              <div class="map-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                <span>{{ demo.mapName || 'Unknown Map' }}</span>
              </div>
              
              <!-- Current Playing Badge -->
              <div v-if="demo.id === currentDemoId" class="playing-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                <span>PLAYING</span>
              </div>
            </div>

            <!-- Middle: Match Score -->
            <div class="card-middle">
              <div class="score-display">
                <div class="team-section winner-section">
                  <div class="team-label">{{ getWinnerTeam(demo) }}</div>
                  <div class="team-score winner-score">{{ getWinnerScore(demo) }}</div>
                </div>
                
                <div class="score-divider">
                  <div class="divider-line"></div>
                  <span class="vs-text">VS</span>
                  <div class="divider-line"></div>
                </div>
                
                <div class="team-section loser-section">
                  <div class="team-score loser-score">{{ getLoserScore(demo) }}</div>
                  <div class="team-label">{{ getLoserTeam(demo) }}</div>
                </div>
              </div>
            </div>

            <!-- Bottom: Meta Info -->
            <div class="card-bottom">
              <div class="meta-info">
                <div v-if="demo.fileName" class="info-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                    <polyline points="13 2 13 9 20 9"/>
                  </svg>
                  <span>{{ demo.fileName }}</span>
                </div>
                <div v-if="demo.uploadTime" class="info-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span>{{ formatAbsoluteTime(demo.uploadTime) }}</span>
                </div>
              </div>
              
              <!-- Delete Button -->
              <button 
                class="card-delete-btn"
                @click.stop="confirmDelete(demo)"
                title="Delete this demo"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- Parsing Overlay -->
          <div v-if="demo.isParsing" class="parsing-overlay-card">
            <div class="parsing-progress-container">
              <div class="parsing-progress-label">解析中...</div>
              <div class="parsing-progress-bar">
                <div class="parsing-progress-fill" :style="{ width: `${demo.parsingProgress || 0}%` }"></div>
              </div>
              <div class="parsing-progress-text">{{ demo.parsingProgress || 0 }}%</div>
            </div>
            <div class="parsing-status-tooltip">{{ demo.parsingStatus || 'Processing...' }}</div>
          </div>

          <!-- Failed Overlay -->
          <div v-else-if="demo.hasFailed" class="failed-overlay-card">
            <div class="failed-content">
              <div class="failed-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              </div>
              <div class="failed-message">{{ demo.parsingStatus || 'Parsing failed' }}</div>
            </div>
            
            <!-- Delete button for failed state -->
            <button 
              class="delete-btn-failed"
              @click.stop="confirmDelete(demo)"
              title="Delete this demo"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="delete-modal-overlay" @click="cancelDelete">
      <div class="delete-modal ds-card ds-card-elevated" @click.stop>
        <div class="modal-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 class="modal-title">Confirm Deletion</h3>
        <p class="modal-message">
          Are you sure you want to delete <strong>{{ demoToDelete?.mapName || 'this demo' }}</strong>?
        </p>
        <p class="modal-warning">This action cannot be undone</p>
        <div class="modal-actions">
          <button class="ds-btn ds-btn-secondary" @click="cancelDelete">Cancel</button>
          <button class="ds-btn ds-btn-danger" @click="performDelete">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';
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

// Storage quota tracking
const storageUsed = ref(0);
const storageQuota = ref(0);
const storageUsagePercent = computed(() => {
  if (storageQuota.value === 0) return 0;
  return Math.min(100, Math.round((storageUsed.value / storageQuota.value) * 100));
});

const storageUsedText = computed(() => {
  const mb = storageUsed.value / (1024 * 1024);
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb / 1024).toFixed(2)} GB`;
});

const storageQuotaText = computed(() => {
  const mb = storageQuota.value / (1024 * 1024);
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb / 1024).toFixed(2)} GB`;
});

// Fetch storage quota
const updateStorageQuota = async () => {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      storageUsed.value = estimate.usage || 0;
      storageQuota.value = estimate.quota || 0;
    } catch (error) {
      console.warn('[Storage Quota] Failed to fetch storage estimate:', error);
    }
  }
};

// Update storage quota on mount and when demo list changes
onMounted(() => {
  updateStorageQuota();
});

watch(() => props.demoList.length, () => {
  updateStorageQuota();
});

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
  // Prevent selecting demos that are still parsing or failed
  if (demo.isParsing || demo.hasFailed || isLoadingDemo.value || !demo.id) return;
  
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
/* === Page Layout === */
.demo-library-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--ds-bg-primary);
  overflow: hidden;
}

/* === Empty State Centered === */
.ds-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-lg);
}

.ds-empty-icon {
  font-size: 64px;
  opacity: 0.5;
}

.ds-empty-title {
  font-size: var(--ds-text-2xl);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0;
}

.ds-empty-description {
  font-size: var(--ds-text-base);
  color: var(--ds-text-tertiary);
  margin: 0;
  text-align: center;
}

/* === Header Styles === */
.library-header {
  padding: var(--ds-space-lg) var(--ds-space-xl);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--ds-border-subtle);
  flex-shrink: 0;
  background: var(--ds-bg-secondary);
  min-height: 60px;
}

.header-content {
  flex: 1;
}

.library-title {
  font-size: var(--ds-text-xl);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0 0 var(--ds-space-xs) 0;
  letter-spacing: -0.3px;
}

.library-subtitle {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-tertiary);
  margin: 0;
}

.library-actions {
  display: flex;
  gap: var(--ds-space-md);
  align-items: center;
}

.library-actions .ds-btn {
  padding: var(--ds-space-sm) var(--ds-space-lg);
  font-size: var(--ds-text-sm);
  height: 38px;
}

.library-actions .ds-btn svg {
  width: 16px;
  height: 16px;
}

/* === Storage Quota Button Styles === */
.quota-btn-container {
  position: relative;
}

.quota-btn {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--ds-border-subtle);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.quota-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--ds-primary);
  color: var(--ds-primary);
  transform: translateY(-1px);
}

.quota-btn svg {
  width: 20px;
  height: 20px;
}

/* Quota Tooltip */
.quota-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  background: rgba(20, 20, 30, 0.98);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-lg);
  padding: 12px;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: all 0.2s ease;
  pointer-events: none;
  z-index: 1000;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.quota-btn-container:hover .quota-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.quota-tooltip::after {
  content: '';
  position: absolute;
  bottom: 100%;
  right: 8px;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid rgba(20, 20, 30, 0.98);
}

.quota-tooltip-header {
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ds-border-subtle);
}

.quota-tooltip-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ds-text-primary);
}

.quota-tooltip-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quota-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
}

.quota-label {
  color: var(--ds-text-tertiary);
  font-weight: 500;
}

.quota-value {
  color: var(--ds-text-secondary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.quota-progress-bar {
  width: 100%;
  height: 6px;
  background: var(--ds-surface-base);
  border-radius: var(--ds-radius-full);
  overflow: hidden;
  border: 1px solid var(--ds-border-subtle);
  margin-top: 4px;
}

.quota-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--ds-primary) 0%, var(--ds-secondary) 100%);
  transition: width 0.3s ease, background 0.3s ease;
  border-radius: var(--ds-radius-full);
  box-shadow: 0 0 8px rgba(78, 204, 163, 0.3);
}

.quota-progress-fill.storage-warning {
  background: linear-gradient(90deg, #f59e0b 0%, #fb923c 100%);
  box-shadow: 0 0 8px rgba(251, 146, 60, 0.4);
}

.quota-progress-fill.storage-critical {
  background: linear-gradient(90deg, #ef4444 0%, #dc2626 100%);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
  animation: pulse-critical 2s ease-in-out infinite;
}

@keyframes pulse-critical {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.quota-percentage {
  font-size: 10px;
  font-weight: 700;
  color: var(--ds-text-tertiary);
  text-align: center;
  font-variant-numeric: tabular-nums;
  margin-top: 4px;
}

/* === Demo Grid Container === */
.demo-grid-container {
  flex: 1;
  overflow-y: auto;
  padding: var(--ds-space-3xl) var(--ds-space-xl);
}

.demo-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--ds-space-lg);
  max-width: 100%;
  margin: 0 auto;
}

@media (max-width: 1800px) {
  .demo-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 1400px) {
  .demo-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 1000px) {
  .demo-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .demo-grid {
    grid-template-columns: 1fr;
  }
}

/* === Demo Card Styles === */
.demo-card {
  position: relative;
  height: 240px;
  border-radius: var(--ds-radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  border: 2px solid var(--ds-border-subtle);
  background: var(--ds-surface-base);
}

.demo-card:hover {
  border-color: var(--ds-primary);
  transform: translateY(-6px);
  box-shadow: var(--ds-shadow-glow);
}

.demo-card.is-current {
  border-color: var(--ds-success);
  box-shadow: 0 0 32px rgba(16, 185, 129, 0.5);
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
  border: 3px solid var(--ds-border-subtle);
  border-top-color: var(--ds-primary);
  border-radius: 50%;
  animation: ds-spin 0.8s linear infinite;
  z-index: 10;
}

.demo-card.is-parsing {
  cursor: not-allowed;
  opacity: 0.95;
}

.demo-card.is-parsing:hover {
  border-color: var(--ds-border-default);
  transform: none;
  box-shadow: none;
}

/* === Card Background === */
.card-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.card-background img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.25;
  filter: blur(1px) brightness(0.7);
  transition: all var(--ds-transition-base);
}

.demo-card:hover .card-background img {
  opacity: 0.35;
  filter: blur(0px) brightness(0.8);
  transform: scale(1.05);
}

.placeholder-bg {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--ds-bg-tertiary) 0%, var(--ds-bg-secondary) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ds-text-2xl);
  font-weight: 700;
  color: var(--ds-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 2px;
}

/* === Card Overlay === */
.card-overlay {
  position: relative;
  height: 100%;
  padding: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: transparent;
  z-index: 1;
}

/* === Card Top (Map Name + Badge) === */
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.map-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  border-radius: 6px;
  border: 1px solid var(--ds-border-default);
  font-size: 11px;
  font-weight: 700;
  color: var(--ds-text-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  max-width: 70%;
  overflow: hidden;
}

.map-badge svg {
  color: var(--ds-primary);
  flex-shrink: 0;
  width: 12px;
  height: 12px;
}

.map-badge span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playing-badge {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid var(--ds-success);
  border-radius: 6px;
  font-size: 9px;
  font-weight: 700;
  color: var(--ds-success);
  letter-spacing: 0.5px;
  animation: pulse-badge 2s ease-in-out infinite;
  flex-shrink: 0;
}

.playing-badge svg {
  animation: pulse-icon 1.5s ease-in-out infinite;
}

@keyframes pulse-badge {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 8px rgba(16, 185, 129, 0.3);
  }
  50% {
    opacity: 0.9;
    box-shadow: 0 0 16px rgba(16, 185, 129, 0.5);
  }
}

@keyframes pulse-icon {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
  }
}

/* === Card Middle (Score Display) === */
.card-middle {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  min-height: 0;
}

.score-display {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
  border-radius: 8px;
  border: 1px solid var(--ds-border-default);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.team-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.winner-section {
  align-items: flex-end;
}

.loser-section {
  align-items: flex-start;
}

.team-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.winner-section .team-label {
  color: var(--ds-primary);
}

.loser-section .team-label {
  color: var(--ds-text-tertiary);
}

.team-score {
  font-size: 32px;
  font-weight: 900;
  font-family: var(--ds-font-mono);
  line-height: 1;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
}

.winner-score {
  color: var(--ds-primary);
  text-shadow: 0 0 20px rgba(78, 204, 163, 0.4);
}

.loser-score {
  color: var(--ds-danger);
  opacity: 0.7;
}

.score-divider {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 0 4px;
}

.divider-line {
  width: 1px;
  height: 12px;
  background: var(--ds-border-default);
}

.vs-text {
  font-size: 9px;
  font-weight: 700;
  color: var(--ds-text-tertiary);
  letter-spacing: 0.5px;
  opacity: 0.6;
}

/* === Card Bottom (Meta Info) === */
.card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.meta-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  min-width: 0;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--ds-text-tertiary);
  font-weight: 500;
  opacity: 0.8;
  min-width: 0;
}

.info-item svg {
  flex-shrink: 0;
  opacity: 0.6;
  width: 12px;
  height: 12px;
}

.info-item span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.card-delete-btn {
  padding: 6px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: var(--ds-danger);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  flex-shrink: 0;
}

.demo-card:hover .card-delete-btn {
  opacity: 1;
}

.card-delete-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: var(--ds-danger);
  transform: scale(1.15);
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
}

/* === Parsing Overlay === */
.parsing-overlay-card {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(26, 26, 46, 0.95);
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-lg);
  z-index: 10;
}

.parsing-progress-container {
  width: 80%;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  align-items: center;
}

.parsing-progress-label {
  font-size: var(--ds-text-base);
  font-weight: 600;
  color: var(--ds-primary);
  margin-bottom: var(--ds-space-xs);
}

.parsing-progress-bar {
  width: 100%;
  height: 8px;
  background: var(--ds-surface-base);
  border-radius: var(--ds-radius-full);
  overflow: hidden;
  border: 1px solid var(--ds-border-subtle);
}

.parsing-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--ds-primary) 0%, var(--ds-secondary) 50%, #60a5fa 100%);
  background-size: 200% 100%;
  transition: width 0.3s ease;
  animation: gradient-flow 2s ease-in-out infinite;
  border-radius: var(--ds-radius-full);
  box-shadow: 0 0 10px var(--ds-primary);
}

@keyframes gradient-flow {
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

.parsing-progress-text {
  font-size: var(--ds-text-lg);
  font-weight: 700;
  color: var(--ds-text-primary);
  font-variant-numeric: tabular-nums;
}

.parsing-status-tooltip {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-tertiary);
  text-align: center;
  padding: var(--ds-space-xs) var(--ds-space-md);
  background: rgba(0, 0, 0, 0.5);
  border-radius: var(--ds-radius-sm);
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* === Failed Overlay === */
.failed-overlay-card {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(26, 26, 46, 0.95);
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--ds-space-xl);
  z-index: 10;
}

.failed-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-lg);
}

.failed-icon {
  animation: shake 0.5s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-10px); }
  75% { transform: translateX(10px); }
}

.failed-message {
  font-size: var(--ds-text-base);
  font-weight: 600;
  color: var(--ds-danger);
  text-align: center;
  line-height: 1.4;
}

.delete-btn-failed {
  margin-top: var(--ds-space-xl);
  padding: var(--ds-space-md) var(--ds-space-xl);
  background: var(--ds-danger);
  border: none;
  border-radius: var(--ds-radius-md);
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
}

.delete-btn-failed:hover {
  background: var(--ds-danger-hover);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

/* === Delete Modal === */
.delete-modal-overlay {
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

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.delete-modal {
  max-width: 440px;
  padding: var(--ds-space-3xl);
  text-align: center;
  animation: slideUp 0.3s ease;
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

.modal-icon {
  margin-bottom: var(--ds-space-xl);
  animation: pulse 2s ease-in-out infinite;
}

.modal-title {
  font-size: var(--ds-text-2xl);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0 0 var(--ds-space-lg) 0;
}

.modal-message {
  font-size: var(--ds-text-base);
  color: var(--ds-text-secondary);
  margin: 0 0 var(--ds-space-sm) 0;
  line-height: 1.6;
}

.modal-message strong {
  color: var(--ds-primary);
}

.modal-warning {
  font-size: var(--ds-text-sm);
  color: var(--ds-warning);
  margin: 0 0 var(--ds-space-xl) 0;
}

.modal-actions {
  display: flex;
  gap: var(--ds-space-md);
  justify-content: center;
}
</style>
