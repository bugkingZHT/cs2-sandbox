<template>
  <!-- 1. 解析进度弹窗 -->
  <div v-if="parsing" class="demo-modal-overlay demo-modal-parsing-overlay">
    <div class="demo-modal demo-modal-parsing">
      <h3 class="demo-modal-parsing-title">{{ parsingProgress === 0 ? '等待解析器加载中' : '解析中..' }}</h3>
      <div class="demo-modal-spinner-wrap">
        <div class="demo-modal-spinner"></div>
      </div>
      <div class="demo-modal-progress-wrap">
        <div class="demo-modal-progress-fill" :style="{ width: parsingProgress + '%' }"></div>
      </div>
      <p class="demo-modal-parsing-status">{{ parsingStatus }}</p>
    </div>
  </div>

  <!-- 2. 删除确认弹窗 -->
  <div v-if="showDeleteModal && demoToDelete" class="demo-modal-overlay" @click="$emit('cancel-delete')">
    <div class="demo-modal ds-card ds-card-elevated" @click.stop>
      <div class="demo-modal-icon demo-modal-icon-danger">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h3 class="demo-modal-title">移除本地回放缓存</h3>
      <p class="demo-modal-message">
        Are you sure you want to delete <strong class="demo-modal-filename" :title="demoToDelete?.fileName || demoToDelete?.mapName">{{ demoToDelete?.fileName || demoToDelete?.mapName || 'this demo' }}</strong>?
      </p>
      <p class="demo-modal-warning">移除这条本地记录及解析缓存，不会删除原始 .dem 文件；之后可以重新解析。</p>
      <div class="demo-modal-actions">
        <button type="button" class="ds-btn ds-btn-secondary" @click="$emit('cancel-delete')">Cancel</button>
        <button type="button" class="ds-btn ds-btn-danger" @click="$emit('confirm-delete')">Delete</button>
      </div>
    </div>
  </div>

  <!-- 3. 上传被阻止提示弹窗 -->
  <div v-if="showUploadBlockedModal" class="demo-modal-overlay" @click="$emit('close-upload-blocked')">
    <div class="demo-modal ds-card ds-card-elevated" @click.stop>
      <div class="demo-modal-icon demo-modal-icon-warning">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h3 class="demo-modal-title">Upload Blocked</h3>
      <p class="demo-modal-message">已有解析任务正在进行中，请等待完成后再上传</p>
      <div v-if="uploadBlockedInfo" class="demo-modal-info">
        <div class="demo-modal-info-row">
          <span class="demo-modal-info-label">正在解析:</span>
          <span class="demo-modal-info-value demo-modal-filename" :title="uploadBlockedInfo.fileName">{{ uploadBlockedInfo.fileName }}</span>
        </div>
        <div class="demo-modal-info-row">
          <span class="demo-modal-info-label">解析进度:</span>
          <span class="demo-modal-info-value">{{ uploadBlockedInfo.progress }}%</span>
        </div>
      </div>
      <p class="demo-modal-warning">提示：为避免内存不足，系统限制同时只能解析一个 Demo 文件</p>
      <div class="demo-modal-actions">
        <button type="button" class="ds-btn ds-btn-primary" @click="$emit('close-upload-blocked')">Got it</button>
      </div>
    </div>
  </div>

  <!-- 4. 强制删除解析中 Demo 确认弹窗 -->
  <div v-if="showForceDeleteModal && demoToForceDelete" class="demo-modal-overlay" @click="$emit('cancel-force-delete')">
    <div class="demo-modal ds-card ds-card-elevated" @click.stop>
      <div class="demo-modal-icon demo-modal-icon-warning">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h3 class="demo-modal-title">Force Delete Parsing Demo</h3>
      <p class="demo-modal-message">
        Demo <strong class="demo-modal-filename" :title="demoToForceDelete?.fileName || demoToForceDelete?.mapName">{{ demoToForceDelete?.fileName || demoToForceDelete?.mapName }}</strong> is currently being parsed.
      </p>
      <div class="demo-modal-info">
        <div class="demo-modal-info-row">
          <span class="demo-modal-info-label">Progress:</span>
          <span class="demo-modal-info-value">{{ demoToForceDelete.parsingProgress || 0 }}%</span>
        </div>
        <div class="demo-modal-info-row">
          <span class="demo-modal-info-label">Status:</span>
          <span class="demo-modal-info-value">{{ demoToForceDelete.parsingStatus || 'Processing...' }}</span>
        </div>
      </div>
      <p class="demo-modal-warning">⚠️ Force deleting will terminate the parsing process and clean up all associated memory and storage.</p>
      <div class="demo-modal-actions">
        <button type="button" class="ds-btn ds-btn-secondary" @click="$emit('cancel-force-delete')">Cancel</button>
        <button type="button" class="ds-btn ds-btn-danger" @click="$emit('confirm-force-delete')">Force Delete</button>
      </div>
    </div>
  </div>

  <!-- 5. 分享回放弹窗 -->
  <div v-if="shareDemo" class="demo-modal-overlay" @click="$emit('close-share')">
    <div class="demo-modal demo-modal-share ds-card ds-card-elevated" @click.stop>
      <div class="demo-modal-icon demo-modal-icon-share">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
      </div>
      <h3 class="demo-modal-title">分享回放</h3>
      <div class="demo-modal-share-form">
        <div class="demo-modal-share-radios">
          <label class="demo-modal-share-radio">
            <input :value="0" type="radio" :checked="sharePermission === 0" @change="$emit('update-permission', 0)" />
            <span>仅自己可见</span>
          </label>
          <label class="demo-modal-share-radio">
            <input :value="1" type="radio" :checked="sharePermission === 1" @change="$emit('update-permission', 1)" />
            <span>获得链接即可查看</span>
          </label>
        </div>
      </div>
      <div class="demo-modal-share-link-row" @click="copyShareLink">
        <code class="demo-modal-share-link-url">{{ shareDemo ? getShareUrl(shareDemo) : '' }}</code>
        <span class="demo-modal-share-link-copy" :class="{ copied: shareCopyCopied }" title="复制链接">
          <svg v-if="!shareCopyCopied" class="demo-modal-share-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          <svg v-else class="demo-modal-share-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </span>
      </div>
      <div class="demo-modal-actions">
        <button type="button" class="ds-btn ds-btn-primary" @click="$emit('close-share')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ReplayData } from '@/types/replay';

export type ShareDemo = ReplayData & { cloudDemoId?: number; cloudPermission?: number };

const props = withDefaults(
  defineProps<{
    parsing?: boolean;
    parsingProgress?: number;
    parsingStatus?: string;
    showDeleteModal?: boolean;
    demoToDelete?: ReplayData | null;
    showUploadBlockedModal?: boolean;
    uploadBlockedInfo?: { fileName: string; progress: number } | null;
    showForceDeleteModal?: boolean;
    demoToForceDelete?: ReplayData | null;
    shareDemo?: ShareDemo | null;
    sharePermission?: 0 | 1;
  }>(),
  {
    parsing: false,
    parsingProgress: 0,
    parsingStatus: '',
    showDeleteModal: false,
    demoToDelete: null,
    showUploadBlockedModal: false,
    uploadBlockedInfo: null,
    showForceDeleteModal: false,
    demoToForceDelete: null,
    shareDemo: null,
    sharePermission: 0,
  }
);

const emit = defineEmits<{
  (e: 'cancel-delete'): void;
  (e: 'confirm-delete'): void;
  (e: 'close-upload-blocked'): void;
  (e: 'cancel-force-delete'): void;
  (e: 'confirm-force-delete'): void;
  (e: 'close-share'): void;
  (e: 'update-permission', value: 0 | 1): void;
  (e: 'copied'): void;
  (e: 'copy-failed'): void;
}>();

const shareCopyCopied = ref(false);
let shareCopyTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.shareDemo,
  () => {
    shareCopyCopied.value = false;
    if (shareCopyTimer) {
      clearTimeout(shareCopyTimer);
      shareCopyTimer = null;
    }
  }
);

function getShareUrl(demo: ShareDemo): string {
  return `${window.location.origin}/replayer?demo_uuid=${encodeURIComponent(demo.uuid)}&round=_&tab=player&pure=true`;
}

async function copyShareLink() {
  if (!props.shareDemo) return;
  const url = getShareUrl(props.shareDemo);
  try {
    await navigator.clipboard.writeText(url);
    shareCopyCopied.value = true;
    if (shareCopyTimer) clearTimeout(shareCopyTimer);
    shareCopyTimer = setTimeout(() => {
      shareCopyCopied.value = false;
      shareCopyTimer = null;
    }, 2000);
    emit('copied');
  } catch {
    emit('copy-failed');
  }
}
</script>

<style scoped>
/* === 统一 overlay（与 DemoLibrary delete modal 一致） === */
.demo-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--ds-z-modal);
  animation: demoModalFadeIn 0.2s ease;
}

.demo-modal-parsing-overlay {
  background: var(--ds-bg-primary);
}

@keyframes demoModalFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.demo-modal {
  max-width: 440px;
  padding: var(--ds-space-3xl);
  text-align: center;
  animation: demoModalSlideUp 0.3s ease;
}

@keyframes demoModalSlideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.demo-modal-icon {
  margin-bottom: var(--ds-space-xl);
  animation: demoModalPulse 2s ease-in-out infinite;
  display: flex;
  justify-content: center;
  align-items: center;
}

.demo-modal-icon-danger { color: #ef4444; }
.demo-modal-icon-warning { color: #f59e0b; }
.demo-modal-icon-share { color: var(--ds-primary); }

@keyframes demoModalPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.demo-modal-title {
  font-size: var(--ds-text-2xl);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0 0 var(--ds-space-lg) 0;
}

.demo-modal-message {
  font-size: var(--ds-text-base);
  color: var(--ds-text-secondary);
  margin: 0 0 var(--ds-space-sm) 0;
  line-height: 1.6;
}

.demo-modal-message strong { color: var(--ds-primary); }

.demo-modal-filename {
  display: inline-block;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.demo-modal-warning {
  font-size: var(--ds-text-sm);
  color: var(--ds-warning);
  margin: 0 0 var(--ds-space-xl) 0;
}

.demo-modal-info {
  background: var(--ds-background-subtle);
  border-radius: var(--ds-radius-md);
  padding: var(--ds-space-md);
  margin: var(--ds-space-md) 0;
}

.demo-modal-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--ds-space-xs) 0;
}

.demo-modal-info-row + .demo-modal-info-row {
  border-top: 1px solid var(--ds-border-subtle);
  margin-top: var(--ds-space-xs);
  padding-top: var(--ds-space-sm);
}

.demo-modal-info-label {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-tertiary);
  font-weight: 500;
}

.demo-modal-info-value {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.demo-modal-info-value.demo-modal-filename { max-width: 200px; }

.demo-modal-actions {
  display: flex;
  gap: var(--ds-space-md);
  justify-content: center;
}

/* === 解析弹窗 === */
.demo-modal-parsing {
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-lg);
  width: 500px;
  max-width: 90vw;
  box-shadow: var(--ds-shadow-xl);
}

.demo-modal-parsing-title {
  margin: 0 0 var(--ds-space-xl) 0;
  color: var(--ds-text-primary);
  text-align: center;
  font-size: var(--ds-text-xl);
  font-weight: 600;
}

.demo-modal-spinner-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: var(--ds-space-2xl) 0;
}

.demo-modal-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--ds-border-subtle);
  border-top-color: var(--ds-primary);
  border-radius: 50%;
  animation: demoModalSpin 0.8s linear infinite;
}

@keyframes demoModalSpin {
  to { transform: rotate(360deg); }
}

.demo-modal-progress-wrap {
  width: 100%;
  height: 8px;
  background: var(--ds-border-subtle);
  border-radius: 4px;
  overflow: hidden;
  margin: 0 0 var(--ds-space-lg) 0;
}

.demo-modal-progress-fill {
  height: 100%;
  background: var(--ds-primary);
  border-radius: 4px;
  transition: width 0.2s ease;
}

.demo-modal-parsing-status {
  margin: var(--ds-space-sm) 0 0 0;
  color: var(--ds-text-tertiary);
  text-align: center;
  font-size: var(--ds-text-base);
  min-height: 24px;
  line-height: 24px;
}

/* === 分享弹窗 === */
.demo-modal-share-form { margin: 0 0 var(--ds-space-xl) 0; text-align: left; }

.demo-modal-share-radios {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.demo-modal-share-radio {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  color: var(--ds-text-primary);
  cursor: pointer;
}

.demo-modal-share-radio input { margin: 0; }

.demo-modal-share-link-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  margin: 0 0 var(--ds-space-xl);
  padding: var(--ds-space-sm) var(--ds-space-md);
  border-radius: var(--ds-radius-md);
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-subtle);
  cursor: pointer;
  transition: background 0.15s;
  min-width: 0;
}

.demo-modal-share-link-row:hover { background: var(--ds-surface-hover); }

.demo-modal-share-link-url {
  flex: 1;
  min-width: 0;
  font-family: var(--ds-font-mono, 'Consolas', 'Monaco', monospace);
  font-size: var(--ds-text-xs);
  color: var(--ds-text-primary);
  white-space: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.demo-modal-share-link-url::-webkit-scrollbar { display: none; }

.demo-modal-share-link-copy {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ds-radius-sm);
  background: var(--ds-surface-elevated);
  color: var(--ds-text-secondary);
  transition: all 0.15s;
}

.demo-modal-share-link-icon { width: 14px; height: 14px; }

.demo-modal-share-link-row:hover .demo-modal-share-link-copy {
  background: var(--ds-accent-primary);
  color: white;
}

.demo-modal-share-link-copy.copied { color: var(--ds-success, #10b981); }
</style>
