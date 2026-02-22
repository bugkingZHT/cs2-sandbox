<template>
    <!-- 云存档删除确认 -->
    <div v-if="confirmDeleteNoteId !== null" class="beta-modal-overlay" @click="confirmDeleteNoteId = null">
      <div class="beta-modal" @click.stop>
        <div class="modal-icon error">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v4"/>
            <path d="M12 17h.01"/>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          </svg>
        </div>
        <h3 class="modal-title">删除笔记</h3>
        <p class="modal-message">确定要删除此笔记吗？</p>
        <div class="modal-actions">
          <button type="button" class="ds-btn ds-btn-secondary" @click="confirmDeleteNoteId = null">取消</button>
          <button type="button" class="ds-btn ds-btn-primary ds-btn-danger" @click="onConfirmDelete">删除</button>
        </div>
      </div>
    </div>

    <!-- 云存档分享弹窗 -->
    <div
      v-if="shareModalNoteId !== null"
      class="beta-modal-overlay"
      @click="onCloseShare"
    >
      <div class="beta-modal" @click.stop>
        <button type="button" class="modal-close-btn" aria-label="关闭" @click="onCloseShare">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </div>
        <h3 class="modal-title">分享笔记</h3>
        <div class="modal-form">
          <div class="form-group">
            <div class="form-radios">
              <label class="form-radio">
                <input v-model="shareModalPermission" type="radio" value="private" @change="saveShareModalPermission" />
                <span>仅自己可见</span>
              </label>
              <label class="form-radio">
                <input v-model="shareModalPermission" type="radio" value="public" @change="saveShareModalPermission" />
                <span>获得链接即可查看</span>
              </label>
            </div>
          </div>
        </div>
        <div class="share-link-row" @click="copyShareLinkInShareModal">
          <code class="share-link-url">{{ shareModalNoteId ? getShareUrlForNoteId(shareModalNoteId) : '' }}</code>
          <span class="share-link-copy" :class="{ copied: shareModalCopyCopied }" title="复制链接">
            <svg v-if="!shareModalCopyCopied" class="share-link-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            <svg v-else class="share-link-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
        </div>
      </div>
    </div>

    <!-- 云存储用量已达上限 -->
    <div v-if="showQuotaExceededModal" class="beta-modal-overlay" @click="showQuotaExceededModal = false">
      <div class="beta-modal" @click.stop>
        <h3 class="modal-title">战术笔记用量已达上限</h3>
        <p class="modal-message">战术笔记用量 {{ quotaUsed }}/{{ quotaLimit }}，无法继续上传。请升级或清理后再试。</p>
        <div class="modal-actions">
          <button type="button" class="ds-btn ds-btn-primary" @click="showQuotaExceededModal = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 正在上传（replayer 笔记发布时用 modal 展示） -->
    <div
      v-if="uploadModalOpen && uploadModalStep === 'uploading'"
      class="beta-modal-overlay"
    >
      <div class="beta-modal" @click.stop>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <h3 class="modal-title">正在上传</h3>
        <div class="upload-progress upload-progress--modal">
          <div class="upload-progress-track">
            <div class="upload-progress-bar" :style="{ width: uploadProgress + '%' }"></div>
          </div>
          <span class="upload-progress-text">{{ uploadProgress }}%</span>
        </div>
      </div>
    </div>

    <!-- 上传成功（replayer 笔记发布时用 modal 展示） -->
    <div
      v-if="uploadModalOpen && uploadModalStep === 'success'"
      class="beta-modal-overlay"
      @click="closeUploadModal"
    >
      <div class="beta-modal" @click.stop>
        <div class="modal-icon success">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h3 class="modal-title">上传成功</h3>
        <p class="modal-message success">已保存到战术笔记</p>
        <div class="share-link-row" v-if="createdNoteId" @click="copyShareLink">
          <code class="share-link-url">{{ getShareUrlForNoteId(createdNoteId) }}</code>
          <span class="share-link-copy" :class="{ copied: copyLinkCopied }" title="复制链接">
            <svg v-if="!copyLinkCopied" class="share-link-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            <svg v-else class="share-link-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
        </div>
        <div class="modal-actions">
          <button type="button" class="ds-btn ds-btn-primary" @click="closeUploadModal">完成</button>
        </div>
      </div>
    </div>

    <!-- 编辑/新建/发布 笔记表单已移至 App.vue 的 NoteFormSidebar，直接渲染（无 Teleport） -->
</template>

<script setup lang="ts">
import { useNote } from '@/composables/useNote';

const emit = defineEmits<{
  (e: 'close-share'): void;
  (e: 'confirm-delete'): void;
}>();

const {
  quotaUsed,
  quotaLimit,
  confirmDeleteNoteId,
  confirmDeleteNoteConfirm,
  showQuotaExceededModal,
  shareModalNoteId,
  shareModalPermission,
  shareModalCopyCopied,
  getShareUrlForNoteId,
  saveShareModalPermission,
  copyShareLinkInShareModal,
  closeShareModal,
  uploadModalOpen,
  uploadModalStep,
  uploadProgress,
  createdNoteId,
  copyLinkCopied,
  closeUploadModal,
  copyShareLink,
} = useNote();

async function onConfirmDelete() {
  await confirmDeleteNoteConfirm();
  emit('confirm-delete');
}

function onCloseShare() {
  closeShareModal();
  emit('close-share');
}
</script>

<style>
/* Note modal styles - unscoped so they apply to modal overlays rendered in this component */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.beta-modal-overlay {
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

.beta-modal {
  max-width: 400px;
  width: 90vw;
  padding: var(--ds-space-3xl);
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-xl);
  text-align: center;
  animation: slideUp 0.3s ease;
  position: relative;
  backdrop-filter: blur(20px);
}

.beta-modal .modal-icon {
  margin-bottom: var(--ds-space-xl);
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--ds-primary);
  width: 64px;
  height: 64px;
  background: rgba(var(--ds-primary-rgb), 0.12);
  border-radius: var(--ds-radius-full);
  margin-left: auto;
  margin-right: auto;
  padding: var(--ds-space-md);
}

.modal-icon-svg {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.beta-modal .modal-icon.success {
  color: var(--ds-success);
  background: rgba(63, 185, 80, 0.15);
}

.beta-modal .modal-icon.success .modal-icon-svg {
  filter: brightness(0) saturate(100%) invert(58%) sepia(42%) saturate(1200%) hue-rotate(95deg) brightness(95%) contrast(89%);
}

.beta-modal .modal-icon.error {
  color: var(--ds-danger, #ef4444);
  background: rgba(239, 68, 68, 0.1);
}

.beta-modal .modal-icon.error .modal-icon-svg {
  filter: brightness(0) saturate(100%) invert(29%) sepia(88%) saturate(3207%) hue-rotate(342deg) brightness(95%) contrast(97%);
}

.beta-modal .modal-title {
  margin: 0 0 var(--ds-space-md) 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-xl);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.beta-modal .modal-message {
  margin: 0 0 var(--ds-space-xl) 0;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-base);
  line-height: 1.6;
}

.beta-modal .modal-message.success {
  color: var(--ds-success, #10b981);
}

.beta-modal .modal-message.error {
  color: var(--ds-danger, #ef4444);
}

.beta-modal .modal-actions {
  display: flex;
  gap: var(--ds-space-md);
  justify-content: center;
}

.beta-modal .modal-actions .ds-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.beta-modal .modal-actions .ds-btn-primary {
  width: auto;
  min-width: 80px;
  transition: all var(--ds-transition-base);
}

.beta-modal .modal-actions .ds-btn-secondary {
  width: auto;
  min-width: 80px;
  background: transparent;
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-secondary);
  transition: all var(--ds-transition-base);
}

.beta-modal .modal-actions .ds-btn-secondary:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
  border-color: var(--ds-border-strong);
  transform: translateY(-2px);
}

.beta-modal .modal-actions .ds-btn-primary.ds-btn-danger {
  background: var(--ds-danger, #ef4444);
  border-color: var(--ds-danger, #ef4444);
  color: #fff;
}

.beta-modal .modal-actions .ds-btn-primary.ds-btn-danger:hover {
  background: #dc2626;
  border-color: #dc2626;
}

.modal-close-btn {
  position: absolute;
  top: var(--ds-space-lg);
  right: var(--ds-space-lg);
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
}

.modal-close-btn:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.modal-close-btn:active {
  transform: scale(0.95);
}

/* Modal form */
.modal-form {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-lg);
  margin: 0 0 var(--ds-space-xl);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.form-input {
  width: 100%;
  padding: var(--ds-space-sm) var(--ds-space-md);
  font-size: var(--ds-text-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  background: var(--ds-bg-primary);
  color: var(--ds-text-primary);
  box-sizing: border-box;
}

.form-input::placeholder {
  color: var(--ds-text-tertiary);
}

.form-radios {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.form-radio {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  color: var(--ds-text-primary);
  cursor: pointer;
}

.form-radio input {
  margin: 0;
}

.form-label {
  display: block;
  margin-bottom: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  font-weight: 500;
  color: var(--ds-text-primary);
}

.form-select {
  width: 100%;
  padding: var(--ds-space-md);
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-primary);
  font-size: var(--ds-text-base);
  cursor: pointer;
  transition: all var(--ds-transition-base);
}

.form-select:focus {
  outline: none;
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.form-info {
  margin-top: var(--ds-space-md);
  padding: var(--ds-space-md);
  background: var(--ds-surface-subtle);
  border-radius: var(--ds-radius-md);
  border-left: 3px solid var(--ds-primary);
}

.form-info p {
  margin: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  line-height: 1.5;
}

/* Modal tabs */
.modal-tabs {
  display: flex;
  margin: var(--ds-space-xl) 0;
}

.modal-tab {
  padding: var(--ds-space-md) var(--ds-space-xl);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  border-bottom-color: transparent;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-base);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  flex: 1;
  text-align: center;
}

.modal-tab:hover {
  color: var(--ds-text-primary);
  background: var(--ds-surface-hover);
}

.modal-tab.active {
  color: var(--ds-primary);
  border-bottom-color: var(--ds-primary);
  background: var(--ds-surface-active);
}

/* Upload progress */
.upload-progress {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  margin: 0 0 var(--ds-space-xl);
}

.upload-progress-track {
  height: 8px;
  width: 100%;
  background: var(--ds-border-subtle);
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.upload-progress-bar {
  height: 100%;
  min-width: 0;
  background: var(--ds-primary);
  border-radius: 4px;
  transition: width 0.15s ease;
}

.upload-progress-text {
  text-align: center;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* Share link */
.share-link-row {
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

.share-link-row:hover {
  background: var(--ds-surface-hover);
}

.share-link-url {
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

.share-link-url::-webkit-scrollbar {
  display: none;
}

.share-link-copy {
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

.share-link-copy-icon {
  width: 14px;
  height: 14px;
}

.share-link-row:hover .share-link-copy {
  background: var(--ds-accent-primary);
  color: white;
}

.share-link-copy.copied {
  color: var(--ds-success, #10b981);
}

/* Upload modal - archive to existing note dropdown */
.filter-dropdown-wrapper {
  position: relative;
}

.filter-tags-input {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  width: 100%;
  min-height: 36px;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  box-sizing: border-box;
}

.filter-tags-input.has-selection {
  background: rgba(var(--ds-primary-rgb), 0.15);
  border-color: var(--ds-border-strong);
}

.filter-tags-input.has-selection:hover {
  background: rgba(var(--ds-primary-rgb), 0.2);
  border-color: var(--ds-border-strong);
}

.filter-tags-input:hover {
  border-color: var(--ds-border-strong);
}

.filter-tags-input:focus-within {
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 3px rgba(var(--ds-primary-rgb), 0.12);
}

.filter-selection-text {
  flex: 1;
  color: var(--ds-primary);
  font-size: var(--ds-text-sm);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-placeholder {
  flex: 1;
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--ds-text-tertiary);
  transition: color var(--ds-transition-base);
}

.filter-icon:hover {
  color: var(--ds-text-primary);
}

.filter-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  box-shadow: var(--ds-shadow-xl);
  max-height: 300px;
  overflow-y: auto;
  z-index: 100;
}

.filter-dropdown-item {
  padding: var(--ds-space-sm) var(--ds-space-md);
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-sm);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  border-bottom: 1px solid var(--ds-border-subtle);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.filter-dropdown-item:last-child {
  border-bottom: none;
}

.filter-dropdown-item:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.filter-dropdown-item.selected {
  background: rgba(var(--ds-primary-rgb), 0.15);
  color: var(--ds-primary);
  font-weight: 600;
}

.dropdown-item-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-item-count {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  color: var(--ds-text-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
