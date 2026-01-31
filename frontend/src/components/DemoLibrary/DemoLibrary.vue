<<template>
  <div class="demo-library-page">
    <!-- Modern Header -->
    <div class="library-header">
      <div class="header-content">
        <h1 class="library-title">⚡ Counter-Strike 2 Demos</h1>
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
        
        <!-- OPFS Debug Button -->
        <button 
          v-if="DEBUG_CONFIG.enableOPFSStorageViewer"
          class="ds-btn ds-btn-secondary ds-btn-icon"
          @click="showOPFSDetails"
          title="View OPFS Storage Details"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </button>

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
import { computed, ref } from 'vue';
import type { ReplayData } from '@/types/replay';
import { MAP_CONFIGS } from '@/config/map-config';
import { useReplayData } from '@/composables/useReplayData';
import { DEBUG_CONFIG } from '@/config/debug';
import { getOPFSStorage } from '@/composables/opfs-storage';

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

// OPFS Debug functionality
const showOPFSDetails = async () => {
  if (!DEBUG_CONFIG.enableOPFSStorageViewer) return;
  
  try {
    const storage = await getOPFSStorage();
    const files = await storage.debugListAllFiles();
    
    // Get storage usage
    let storageInfo = '';
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usedMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
      const quotaMB = ((estimate.quota || 0) / (1024 * 1024)).toFixed(2);
      const usagePercent = ((estimate.usage || 0) / (estimate.quota || 1) * 100).toFixed(2);
      
      storageInfo = `
        <div class="storage-info">
          <h3>💾 Storage Usage</h3>
          <div class="info-row">
            <span class="label">Used:</span>
            <span class="value">${usedMB} MB</span>
          </div>
          <div class="info-row">
            <span class="label">Quota:</span>
            <span class="value">${quotaMB} MB</span>
          </div>
          <div class="info-row">
            <span class="label">Usage:</span>
            <span class="value">${usagePercent}%</span>
          </div>
        </div>
      `;
    }
    
    // Get storage path
    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform.toLowerCase();
    
    let browser = 'Unknown';
    let browserVersion = 'Unknown';
    if (userAgent.includes('edg/')) {
      browser = 'Edge';
      const match = userAgent.match(/edg\/(\d+\.\d+\.\d+\.\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
      browser = 'Chrome';
      const match = userAgent.match(/chrome\/(\d+\.\d+\.\d+\.\d+)/);
      browserVersion = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      browser = 'Safari';
      const match = userAgent.match(/version\/(\d+\.\d+(\.\d+)?)/);
      browserVersion = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('firefox')) {
      browser = 'Firefox';
      const match = userAgent.match(/firefox\/(\d+\.\d+(\.\d+)?)/);
      browserVersion = match ? match[1] : 'Unknown';
    }
    
    let os = 'Unknown';
    let osVersion = '';
    let basePath = '';
    
    if (platform.includes('mac') || userAgent.includes('mac os')) {
      os = 'macOS';
      const match = userAgent.match(/mac os x (\d+[._]\d+([._]\d+)?)/i);
      if (match) {
        osVersion = match[1].replace(/_/g, '.');
      }
      if (browser === 'Chrome') basePath = '~/Library/Application Support/Google/Chrome/Default/File System/';
      else if (browser === 'Edge') basePath = '~/Library/Application Support/Microsoft Edge/Default/File System/';
      else if (browser === 'Safari') basePath = '~/Library/Safari/LocalStorage/';
      else if (browser === 'Firefox') basePath = '~/Library/Application Support/Firefox/Profiles/{profile}/storage/default/{origin}/idb/';
    } else if (platform.includes('win') || userAgent.includes('windows')) {
      os = 'Windows';
      const match = userAgent.match(/windows nt (\d+\.\d+)/);
      if (match) {
        const ntVersion = match[1];
        // Map NT version to Windows version
        const versionMap: Record<string, string> = {
          '10.0': '10/11',
          '6.3': '8.1',
          '6.2': '8',
          '6.1': '7',
        };
        osVersion = versionMap[ntVersion] || ntVersion;
      }
      if (browser === 'Chrome') basePath = '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\File System\\';
      else if (browser === 'Edge') basePath = '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\File System\\';
      else if (browser === 'Firefox') basePath = '%APPDATA%\\Mozilla\\Firefox\\Profiles\\{profile}\\storage\\default\\{origin}\\idb\\';
    } else if (platform.includes('linux') || userAgent.includes('linux')) {
      os = 'Linux';
      // Linux version detection is complex, skip for now
      if (browser === 'Chrome') basePath = '~/.config/google-chrome/Default/File System/';
      else if (browser === 'Edge') basePath = '~/.config/microsoft-edge/Default/File System/';
      else if (browser === 'Firefox') basePath = '~/.mozilla/firefox/{profile}/storage/default/{origin}/idb/';
    }
    
    const pathInfo = basePath ? `
      <div class="storage-path">
        <h3>📍 Physical Storage Path (Estimated)</h3>
        <div class="info-row">
          <span class="label">Browser:</span>
          <span class="value">${browser} ${browserVersion}</span>
        </div>
        <div class="info-row">
          <span class="label">OS:</span>
          <span class="value">${os}${osVersion ? ' ' + osVersion : ''}</span>
        </div>
        <div class="info-row">
          <span class="label">User Agent:</span>
          <span class="value" style="font-size: 12px; word-break: break-all;">${navigator.userAgent}</span>
        </div>
        <div class="info-row full-width">
          <span class="label">Path:</span>
          <code class="path-value">${basePath}</code>
        </div>
        <div class="warning">
          ⚠️ This path is an estimation. OPFS data is stored in indexed/encrypted format.
        </div>
      </div>
    ` : '';
    
    // Build file list HTML
    let fileListHtml = '<div class="file-list"><h3>📁 OPFS File Structure</h3>';
    
    if (files.length === 0) {
      fileListHtml += '<p class="empty-state">❌ No files found in OPFS</p>';
    } else {
      fileListHtml += `<p class="total-count">Total: ${files.length} replay(s)</p>`;
      
      files.forEach(({ uuid, files: fileList }) => {
        fileListHtml += `
          <div class="replay-item">
            <div class="replay-uuid">📦 UUID: <code>${uuid}</code></div>
            <ul class="file-items">
        `;
        
        fileList.forEach(file => {
          fileListHtml += `<li>📄 ${file}</li>`;
        });
        
        fileListHtml += '</ul></div>';
      });
    }
    
    fileListHtml += '</div>';
    
    // Create HTML page
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OPFS Storage Details - CS Demo Viewer</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e0e0e0;
      padding: 40px 20px;
      line-height: 1.6;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    h1 {
      font-size: 32px;
      margin-bottom: 10px;
      color: #ffffff;
      text-align: center;
    }
    
    .subtitle {
      text-align: center;
      color: #888;
      margin-bottom: 40px;
      font-size: 14px;
    }
    
    h3 {
      font-size: 20px;
      margin-bottom: 15px;
      color: #ffffff;
      border-bottom: 2px solid #0f3460;
      padding-bottom: 8px;
    }
    
    .storage-info,
    .storage-path,
    .file-list {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 30px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    .info-row:last-child {
      border-bottom: none;
    }
    
    .info-row.full-width {
      flex-direction: column;
      gap: 8px;
    }
    
    .label {
      font-weight: 600;
      color: #aaa;
    }
    
    .value {
      color: #4ecca3;
      font-weight: 500;
    }
    
    code {
      background: rgba(0, 0, 0, 0.3);
      padding: 4px 8px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      color: #ffa07a;
    }
    
    .path-value {
      display: block;
      word-break: break-all;
      padding: 12px;
      background: rgba(0, 0, 0, 0.4);
    }
    
    .warning {
      margin-top: 15px;
      padding: 12px;
      background: rgba(255, 165, 0, 0.1);
      border-left: 3px solid #ffa500;
      border-radius: 4px;
      font-size: 13px;
      color: #ffb84d;
    }
    
    .total-count {
      color: #4ecca3;
      margin-bottom: 20px;
      font-weight: 500;
    }
    
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #666;
      font-size: 16px;
    }
    
    .replay-item {
      margin-bottom: 25px;
      padding: 15px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      border-left: 3px solid #4ecca3;
    }
    
    .replay-uuid {
      font-weight: 600;
      margin-bottom: 10px;
      color: #fff;
    }
    
    .file-items {
      list-style: none;
      padding-left: 20px;
    }
    
    .file-items li {
      padding: 6px 0;
      color: #ccc;
      font-family: 'Courier New', monospace;
      font-size: 14px;
    }
    
    .console-hint {
      background: rgba(255, 193, 7, 0.1);
      border: 1px solid rgba(255, 193, 7, 0.3);
      border-radius: 8px;
      padding: 20px;
      margin-top: 30px;
    }
    
    .console-hint h4 {
      color: #ffc107;
      margin-bottom: 10px;
    }
    
    .console-hint code {
      display: block;
      margin: 8px 0;
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.4);
      color: #4ecca3;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🗂️ OPFS Storage Details</h1>
    <p class="subtitle">CS2 Demo Viewer - Protobuf Binary Storage</p>
    
    ${storageInfo}
    ${pathInfo}
    ${fileListHtml}
    
    <div class="console-hint">
      <h4>💡 Console Commands for Advanced Debugging:</h4>
      <code>await window.debugOPFS.listFiles()</code>
      <code>await window.debugOPFS.downloadFile(uuid, 'meta.pb')</code>
      <code>await window.debugOPFS.downloadFile(uuid, 'round_1.pb')</code>
      <code>await window.debugOPFS.getStorageUsage()</code>
      <code>window.debugOPFS.showStoragePath()</code>
    </div>
  </div>
</body>
</html>`;
    
    // Open in new window
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    
    if (win) {
      win.addEventListener('load', () => {
        URL.revokeObjectURL(url);
      });
    }
  } catch (error) {
    console.error('[OPFS Debug] Failed to show storage details:', error);
    alert('Failed to load OPFS details. See console for details.');
  }
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
