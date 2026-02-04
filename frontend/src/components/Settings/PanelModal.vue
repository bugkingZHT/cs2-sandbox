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
            <span>不要随意修改此页面中的配置，否则可能导致致命错误</span>
          </div>
          
          <!-- Storage Quota Display -->
          <div v-if="DEBUG_CONFIG.enableStorageQuotaDisplay" class="storage-quota-section">
            <div class="storage-quota-container">
              <div class="storage-quota-card">
                <div class="quota-header">
                  <svg class="quota-icon" width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor">
                    <path d="M952.288 697.312l-108.352-467.2a83.424 83.424 0 0 0-26.944-49.344c-14.4-12.8-32.768-20.128-51.968-20.768H257.472c-40.256 1.568-72.768 32.704-78.944 71.68L70.208 697.28c-4.64 12.48-6.208 26.528-6.208 38.976C64 806.368 121.28 864 192.48 864h639.072C902.784 864 960 806.368 960 736.288c0-12.48-3.072-26.496-7.712-38.976z m-120.736 104.384H192.48a62.464 62.464 0 0 1-45.12-18.496 63.168 63.168 0 0 1-18.368-45.344c0-35.84 29.44-63.904 63.488-63.904h639.072c35.616 0 63.456 28.064 63.456 63.904 1.568 34.24-27.84 63.84-63.456 63.84z m-32.48-84.128a21.6 21.6 0 0 0-21.664 18.72 21.76 21.76 0 0 0 18.56 21.76h3.104a20.544 20.544 0 0 0 20.128-20.192c0-12.48-7.744-20.288-20.128-20.288z m-41.792 20.288c0-23.36 18.56-42.048 41.792-42.048 23.2 0 41.792 18.688 41.792 42.048 0 23.36-18.56 42.048-41.792 42.048a41.728 41.728 0 0 1-41.792-42.048z" fill="currentColor"></path>
                  </svg>
                  <h3 class="quota-title">本地存储空间</h3>
                </div>
                
                <div class="quota-details">
                  <div class="quota-info-row">
                    <span class="quota-label">已使用:</span>
                    <span class="quota-value">{{ storageUsedText }}</span>
                  </div>
                  <div class="quota-info-row">
                    <span class="quota-label">可用总量:</span>
                    <span class="quota-value">{{ storageQuotaText }}</span>
                  </div>
                  
                  <div class="quota-progress-container">
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
              
              <!-- WASM Memory Section -->
              <div class="wasm-memory-card">
                <div class="quota-header">
                  <svg class="quota-icon" width="16" height="16" viewBox="0 0 1024 1024">
                    <path d="M863.438 280.125h-704c-17.673 0-32 14.327-32 32v447.059c0 17.673 14.327 32 32 32h127.809c17.673 0 32-14.327 32-32V732.36h42.718v56.375h64V732.36h51.947v56.375h64V732.36h51.947v56.375h64V732.36h45.608v26.823c0 17.673 14.327 32 32 32h127.971c17.673 0 32-14.327 32-32V312.125c0-17.673-14.328-32-32-32z m-32 295.333h-33.559c-17.673 0-32 14.327-32 32s14.327 32 32 32h33.559v87.726h-63.971V700.36c0-17.673-14.327-32-32-32H287.246c-17.673 0-32 14.327-32 32v26.823h-63.809v-87.726h32.559c17.673 0 32-14.327 32-32s-14.327-32-32-32h-32.559V344.125h640v231.333z" fill="currentColor"></path>
                    <path d="M256.477 395.557h80.279v140h-80.279zM400.89 395.557h80.279v140H400.89zM545.302 395.557h80.279v140h-80.279zM689.715 395.557h80.279v140h-80.279z" fill="currentColor"></path>
                  </svg>
                  <h3 class="quota-title">内存解析空间</h3>
                </div>
                
                <div class="quota-details">
                  <div class="quota-info-row">
                    <span class="quota-label">已使用:</span>
                    <span class="quota-value">{{ wasmMemoryUsedText }}</span>
                  </div>
                  <div class="quota-info-row">
                    <span class="quota-label">限制总量:</span>
                    <span class="quota-value">{{ wasmMemoryLimitText }}</span>
                  </div>
                  
                  <!-- Progress bar and percentage (only shown when valid limit exists) -->
                  <div v-if="wasmMemoryLimit && wasmMemoryLimit > 0" class="quota-progress-container">
                    <div class="quota-progress-bar">
                      <div class="quota-progress-fill" :style="{ width: wasmMemoryPercent + '%' }"></div>
                    </div>
                    <div class="quota-percentage">{{ wasmMemoryPercent }}%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Parse options: round limit + frame ratio in one row -->
          <div
            v-if="DEBUG_CONFIG.enableRoundLimitConfig || DEBUG_CONFIG.enableParseFrameRatioConfig"
            class="debug-parse-options-row"
          >
            <div v-if="DEBUG_CONFIG.enableRoundLimitConfig" class="parse-option-cell">
              <div class="input-group">
                <label class="input-label">限制解析回合数</label>
                <input
                  v-model.number="roundLimit"
                  type="number"
                  min="-1"
                  class="ds-input round-limit-input"
                  @change="saveRoundLimit"
                />
              </div>
            </div>
            <div v-if="DEBUG_CONFIG.enableParseFrameRatioConfig" class="parse-option-cell">
              <div class="input-group">
                <label class="input-label">解析帧采样比</label>
                <input
                  v-model.number="parseFrameRatio"
                  type="number"
                  min="1"
                  class="ds-input round-limit-input"
                  @change="saveParseFrameRatio"
                />
              </div>
            </div>
          </div>

          <div class="modal-actions-horizontal">
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
            <button 
              v-if="DEBUG_CONFIG.enableFrameDataViewer"
              class="ds-btn ds-btn-console"
              @click="handleFrameDataViewer"
              :disabled="!(currentPage === 'player')"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <span>帧数据查看器</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
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

// WASM memory tracking
const wasmMemoryUsed = ref(0);
const wasmMemoryLimit = ref(0); // Dynamic limit from browser
const wasmMemorySupported = ref(false);

const wasmMemoryPercent = computed(() => {
  if (wasmMemoryLimit.value === 0) return 0;
  return Math.min(100, Math.round((wasmMemoryUsed.value / wasmMemoryLimit.value) * 100));
});

const wasmMemoryUsedText = computed(() => {
  if (!wasmMemorySupported.value) {
    return 'N/A';
  }
  const mb = wasmMemoryUsed.value / (1024 * 1024);
  if (mb < 1) {
    return `${(mb * 1024).toFixed(0)} KB`;
  }
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb / 1024).toFixed(2)} GB`;
});

const wasmMemoryLimitText = computed(() => {
  if (!wasmMemorySupported.value) {
    return 'N/A';
  }
  const mb = wasmMemoryLimit.value / (1024 * 1024);
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

// Round limit configuration
const roundLimit = ref<number>(-1); // Default value is -1 (no limit)

// Parse frame ratio: 1=1:1, 2=1:2, N=1:N (positive integer >= 1)
const PARSE_FRAME_RATIO_KEY = 'demoParsingFrameRatio';
const parseFrameRatio = ref<number>(1);

// Load round limit and parse frame ratio from localStorage on component mount
onMounted(() => {
  if (DEBUG_CONFIG.enableStorageQuotaDisplay) {
    updateStorageQuota();
    updateWasmMemory();
    
    // Update memory stats every 2 seconds
    memoryUpdateInterval = window.setInterval(() => {
      updateWasmMemory();
    }, 2000);
  }
  
  // Load round limit from localStorage
  if (DEBUG_CONFIG.enableRoundLimitConfig) {
    const savedLimit = localStorage.getItem('demoParsingRoundLimit');
    if (savedLimit !== null) {
      const parsedLimit = parseInt(savedLimit, 10);
      if (!isNaN(parsedLimit)) {
        roundLimit.value = parsedLimit <= 0 ? -1 : parsedLimit;
      }
    }
  }

  // Load parse frame ratio from localStorage
  if (DEBUG_CONFIG.enableParseFrameRatioConfig) {
    const saved = localStorage.getItem(PARSE_FRAME_RATIO_KEY);
    if (saved !== null) {
      const n = parseInt(saved, 10);
      if (!isNaN(n) && n >= 1) {
        parseFrameRatio.value = n;
      }
    }
  }
});

// Update WASM memory usage
const updateWasmMemory = () => {
  try {
    // Check if performance.memory is available (Chrome/Edge only)
    if ('memory' in performance) {
      wasmMemorySupported.value = true;
      const mem = (performance as any).memory;
      
      // Use totalJSHeapSize to include Go WASM memory
      const totalUsed = mem.totalJSHeapSize || mem.usedJSHeapSize || 0;
      const currentLimit = mem.jsHeapSizeLimit;
      
      // Only set values if we have a valid limit (no fallback)
      if (currentLimit && currentLimit > 0) {
        wasmMemoryUsed.value = totalUsed;
        wasmMemoryLimit.value = currentLimit;
        
        // Log warning if memory is high
        const percent = (totalUsed / currentLimit) * 100;
        if (percent >= 75) {
          console.warn(`[WASM Memory] High memory usage: ${(totalUsed / (1024 * 1024)).toFixed(1)} MB (${percent.toFixed(1)}%)`);
        }
      } else {
        // No valid limit - set to 0 to show N/A
        wasmMemoryUsed.value = totalUsed;
        wasmMemoryLimit.value = 0;
      }
    } else {
      wasmMemorySupported.value = false;
      wasmMemoryUsed.value = 0;
      wasmMemoryLimit.value = 0;
      console.debug('[WASM Memory] performance.memory API not available (use Chrome/Edge for accurate measurement)');
    }
  } catch (error) {
    wasmMemorySupported.value = false;
    wasmMemoryUsed.value = 0;
    wasmMemoryLimit.value = 0;
    console.warn('[WASM Memory] Failed to fetch memory stats:', error);
  }
};

// Save round limit to localStorage
const saveRoundLimit = () => {
  if (roundLimit.value <= 0) {
    // Store -1 to indicate no limit
    roundLimit.value = -1;
    localStorage.setItem('demoParsingRoundLimit', '-1');
  } else {
    localStorage.setItem('demoParsingRoundLimit', roundLimit.value.toString());
  }
};

// Clear round limit
const clearRoundLimit = () => {
  roundLimit.value = -1;
  localStorage.setItem('demoParsingRoundLimit', '-1');
};

// Save parse frame ratio to localStorage (ensure >= 1)
const saveParseFrameRatio = () => {
  let v = parseFrameRatio.value;
  if (typeof v !== 'number' || isNaN(v) || v < 1) {
    v = 1;
    parseFrameRatio.value = 1;
  }
  localStorage.setItem(PARSE_FRAME_RATIO_KEY, String(v));
};

let memoryUpdateInterval: number | null = null;

onUnmounted(() => {
  if (memoryUpdateInterval !== null) {
    clearInterval(memoryUpdateInterval);
  }
});

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
  margin: var(--ds-space-xs) 0 var(--ds-space-2xl) 0;
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

/* Storage Quota Styles */
.storage-quota-section {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
  width: 100%;
  margin-bottom: var(--ds-space-lg);
}

.storage-quota-container {
  display: flex;
  gap: var(--ds-space-md);
}

.storage-quota-card,
.wasm-memory-card {
  flex: 1;
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  padding: var(--ds-space-md);
}

.modal-actions-horizontal {
  display: flex;
  gap: var(--ds-space-md);
  width: 100%;
}

.modal-actions-horizontal .ds-btn-console {
  flex: 1;
  max-width: none;
}

.quota-header {
  display: flex;
  align-items: center;
  gap: var(--ds-space-xs);
  margin-bottom: var(--ds-space-md);
}

.quota-icon {
  flex-shrink: 0;
}

.quota-title {
  margin: 0;
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
}

.quota-details {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  padding-left: calc(16px + var(--ds-space-xs)); /* Account for icon width */
}

.quota-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
}

.quota-label {
  font-weight: 500;
}

.quota-value {
  font-weight: 600;
  color: var(--ds-text-primary);
  margin-left: var(--ds-space-sm);
}

.quota-progress-container {
  display: flex;
  align-items: center;
  gap: var(--ds-space-xs);
  margin-top: var(--ds-space-xs);
}

.quota-progress-bar {
  flex: 1;
  height: 8px;
  background: var(--ds-surface-base);
  border-radius: 4px;
  overflow: hidden;
}

.quota-progress-fill {
  height: 100%;
  background: var(--ds-success);
  transition: width 0.3s ease;
  border-radius: 4px;
}

.storage-warning {
  background: var(--ds-warning);
}

.storage-critical {
  background: var(--ds-danger);
}

.quota-percentage {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  color: var(--ds-text-secondary);
  min-width: 30px;
  text-align: right;
}

/* Parse options row: same layout as storage-quota-container above (50% each, same gap) */
.debug-parse-options-row {
  width: 100%;
  display: flex;
  gap: var(--ds-space-md);
  margin-bottom: var(--ds-space-lg);
}

.parse-option-cell {
  flex: 0 0 calc(50% - var(--ds-space-md) / 2);
  min-width: 0;
  padding: var(--ds-space-md);
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
}

.parse-option-cell .ds-input {
  width: 100%;
  box-sizing: border-box;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
}

.input-label {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
  margin-bottom: var(--ds-space-xs);
}

.ds-input {
  padding: var(--ds-space-sm) var(--ds-space-md);
  background: var(--ds-bg-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-primary);
  font-size: var(--ds-text-base);
  outline: none;
  transition: border-color var(--ds-transition-base);
}

.ds-input:focus {
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 2px rgba(var(--ds-primary-rgb), 0.2);
}

/* 回合限制输入框：隐藏数字上下箭头，仅允许用户手动输入 */
.round-limit-input::-webkit-inner-spin-button,
.round-limit-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.round-limit-input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
}

</style>