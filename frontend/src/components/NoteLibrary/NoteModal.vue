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

    <!-- 编辑笔记弹窗 -->
    <div
      v-if="editModalOpen"
      class="beta-modal-overlay"
      @click="closeEditModal()"
    >
      <div class="beta-modal beta-modal--note-form" @click.stop>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="modal-icon-svg">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
          </svg>
        </div>
        <h3 class="modal-title">编辑笔记</h3>

        <NoteFormFields
          v-model:title="editFormTitle"
          v-model:content="editFormContent"
          v-model:permission="editFormPermission"
        />

        <div v-if="editDemoItems.length > 0" class="demo-items-section">
          <h4 class="section-title">附件 ({{ editDemoItems.length }} 个)</h4>
          <div class="demo-items-list">
            <div
              v-for="demo in editDemoItems"
              :key="demo.id"
              class="demo-item-card"
              :class="{ 'marked-for-deletion': demo.markedForDeletion }"
            >
              <div class="demo-item-info">
                <div class="demo-meta-line">
                  <span class="demo-map-name">
                    <img src="/icons/map.svg" alt="" class="demo-icon" />
                    {{ getDemoMapName(demo) }}
                  </span>
                  <span class="demo-teams">
                    {{ getDemoTeamCT(demo) }} vs {{ getDemoTeamT(demo) }}
                  </span>
                  <span class="demo-time">{{ formatDemoTime(getDemoAddTime(demo)) }}</span>
                </div>
              </div>
              <button
                type="button"
                class="demo-delete-btn"
                :class="{ 'delete-marked': demo.markedForDeletion }"
                @click="toggleDemoDeletion(demo.id)"
                :title="demo.markedForDeletion ? '取消删除' : '标记删除'"
              >
                <svg v-if="!demo.markedForDeletion" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="ds-btn ds-btn-secondary" @click="closeEditModal">取消</button>
          <button type="button" class="ds-btn ds-btn-primary" @click="saveEditNote">保存</button>
        </div>
      </div>
    </div>

    <!-- 新建笔记弹窗 -->
    <div
      v-if="createNoteModalOpen"
      class="beta-modal-overlay"
      @click="closeCreateNoteModal()"
    >
      <div class="beta-modal beta-modal--note-form" @click.stop>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="modal-icon-svg">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
        <h3 class="modal-title">新建笔记</h3>

        <NoteFormFields
          v-model:title="createNoteFormTitle"
          v-model:content="createNoteFormContent"
          v-model:permission="createNoteFormPermission"
        />

        <div class="modal-actions">
          <button type="button" class="ds-btn ds-btn-secondary" @click="closeCreateNoteModal">取消</button>
          <button type="button" class="ds-btn ds-btn-primary" @click="submitCreateNote">创建</button>
        </div>
      </div>
    </div>

    <!-- 发布/归档笔记弹窗 -->
    <div
      v-if="uploadModalOpen"
      class="beta-modal-overlay"
      @click="uploadModalStep !== 'uploading' && closeUploadModal()"
    >
      <div class="beta-modal" :class="{ 'beta-modal--note-form': uploadModalStep === 'form' }" @click.stop>
        <template v-if="uploadModalStep === 'form'">
          <div class="modal-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="modal-icon-svg">
              <line x1="5" y1="6" x2="5" y2="6"/><line x1="10" y1="6" x2="19" y2="6"/>
              <line x1="5" y1="12" x2="5" y2="12"/><line x1="10" y1="12" x2="19" y2="12"/>
              <line x1="5" y1="18" x2="5" y2="18"/><line x1="10" y1="18" x2="19" y2="18"/>
            </svg>
          </div>
          <h3 class="modal-title">{{ editingNoteId ? '修改笔记' : '发布笔记' }}</h3>

          <div v-if="!editingNoteId" class="modal-tabs">
            <button
              type="button"
              class="modal-tab"
              :class="{ active: uploadTab === 'new' }"
              @click="uploadTab = 'new'"
            >
              新建笔记
            </button>
            <button
              type="button"
              class="modal-tab"
              :class="{ active: uploadTab === 'existing' }"
              @click="uploadTab = 'existing'"
            >
              归档到已有笔记
            </button>
          </div>
          <div class="modal-form">
            <template v-if="uploadTab === 'new'">
              <NoteFormFields
                v-model:title="uploadFormTitle"
                v-model:content="uploadFormContent"
                v-model:permission="uploadFormPermission"
              />
            </template>

            <template v-else-if="uploadTab === 'existing'">
              <div class="form-group">
                <div class="filter-dropdown-wrapper">
                  <div
                    class="filter-tags-input"
                    :class="{ 'has-selection': selectedNoteId }"
                    @click="showNoteDropdown = true"
                  >
                    <span v-if="selectedNoteId && selectedNote" class="filter-selection-text">
                      {{ selectedNote.title || '无标题' }}
                    </span>
                    <span v-else class="filter-placeholder">请选择要归档到的笔记</span>
                    <span class="filter-icon" @click.stop="handleNoteIconClick">
                      <svg v-if="selectedNoteId" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </span>
                  </div>
                  <div v-if="showNoteDropdown" class="filter-dropdown ds-scrollbar">
                    <div
                      v-for="note in noteList"
                      :key="note.id"
                      class="filter-dropdown-item"
                      :class="{ selected: selectedNoteId === note.id }"
                      @click="selectNote(note.id)"
                    >
                      <span class="dropdown-item-name">{{ note.title || '无标题' }}</span>
                      <span class="dropdown-item-count">({{ getNoteDemoCount(note) }})</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="form-info">
                <p>将当前回合归档到选中的笔记中，不会创建新的笔记条目</p>
              </div>
            </template>
          </div>
          <div class="modal-actions">
            <button type="button" class="ds-btn ds-btn-secondary" @click="closeUploadModal">取消</button>
            <button type="button" class="ds-btn ds-btn-primary" @click="submitUploadFromModal">
              {{ editingNoteId ? '保存修改' : (uploadTab === 'existing' ? '归档' : '发布') }}
            </button>
          </div>
        </template>
        <template v-else-if="uploadModalStep === 'uploading'">
          <div class="modal-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <h3 class="modal-title">正在上传</h3>
          <div class="upload-progress">
            <div class="upload-progress-track">
              <div class="upload-progress-bar" :style="{ width: uploadProgress + '%' }"></div>
            </div>
            <span class="upload-progress-text">{{ uploadProgress }}%</span>
          </div>
        </template>
        <template v-else-if="uploadModalStep === 'success'">
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
        </template>
        <template v-else-if="uploadModalStep === 'error'">
          <div class="modal-icon error">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <h3 class="modal-title">上传失败</h3>
          <p class="modal-message error">{{ uploadError }}</p>
          <div class="modal-actions">
            <button type="button" class="ds-btn ds-btn-primary" @click="closeUploadModal">关闭</button>
          </div>
        </template>
      </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useNote } from '@/composables/useNote';
import NoteFormFields from './NoteFormFields.vue';

const emit = defineEmits<{
  (e: 'close-share'): void;
  (e: 'confirm-delete'): void;
}>();

const {
  noteList,
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
  copyShareLink,
  closeShareModal,
  editModalOpen,
  editDemoItems,
  editFormTitle,
  editFormContent,
  editFormPermission,
  closeEditModal,
  saveEditNote,
  toggleDemoDeletion,
  createNoteModalOpen,
  createNoteFormTitle,
  createNoteFormContent,
  createNoteFormPermission,
  closeCreateNoteModal,
  submitCreateNote,
  uploadModalOpen,
  uploadModalStep,
  uploadFormTitle,
  uploadFormContent,
  uploadFormPermission,
  uploadProgress,
  uploadError,
  createdNoteId,
  copyLinkCopied,
  editingNoteId,
  uploadTab,
  selectedNoteId,
  closeUploadModal,
  submitUploadFromModal,
} = useNote();

const showNoteDropdown = ref(false);

const selectedNote = computed(() => {
  if (!selectedNoteId.value) return null;
  return noteList.value.find((n) => n.id === selectedNoteId.value) ?? null;
});

function getNoteDemoCount(note: { demos?: unknown[] }) {
  return note.demos?.length ?? 0;
}

function getDemoMapName(demo: { demo_meta?: string }) {
  if (demo.demo_meta) {
    try {
      const meta = JSON.parse(demo.demo_meta) as { mapName?: string };
      return meta.mapName ?? 'Unknown Map';
    } catch {
      return 'Unknown Map';
    }
  }
  return 'Unknown Map';
}

function getDemoTeamCT(demo: { demo_meta?: string }) {
  if (demo.demo_meta) {
    try {
      const meta = JSON.parse(demo.demo_meta) as { teamCT?: string };
      return meta.teamCT ?? 'CT';
    } catch {
      return 'CT';
    }
  }
  return 'CT';
}

function getDemoTeamT(demo: { demo_meta?: string }) {
  if (demo.demo_meta) {
    try {
      const meta = JSON.parse(demo.demo_meta) as { teamT?: string };
      return meta.teamT ?? 'T';
    } catch {
      return 'T';
    }
  }
  return 'T';
}

function getDemoAddTime(demo: { created_at?: string }) {
  return demo.created_at ? new Date(demo.created_at).getTime() : Date.now();
}

function formatDemoTime(ms: number) {
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return (
    d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) +
    ' ' +
    d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  );
}

function handleNoteIconClick() {
  if (selectedNoteId.value) {
    selectedNoteId.value = null;
    showNoteDropdown.value = false;
  } else {
    showNoteDropdown.value = !showNoteDropdown.value;
  }
}

function selectNote(noteId: string) {
  selectedNoteId.value = noteId;
  showNoteDropdown.value = false;
}

function handleNoteDropdownClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.filter-dropdown-wrapper')) {
    showNoteDropdown.value = false;
  }
}

async function onConfirmDelete() {
  await confirmDeleteNoteConfirm();
  emit('confirm-delete');
}

function onCloseShare() {
  closeShareModal();
  emit('close-share');
}

onMounted(() => {
  document.addEventListener('click', handleNoteDropdownClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleNoteDropdownClickOutside);
});
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

.beta-modal--note-form {
  max-width: 800px;
  width: 92vw;
  text-align: left;
}

.beta-modal--note-form .modal-title {
  text-align: center;
}

.beta-modal--note-form .modal-form {
  margin-bottom: var(--ds-space-xl);
}

.beta-modal--note-form .note-form-editor-wrap {
  min-height: 220px;
  display: flex;
  flex-direction: column;
}

.beta-modal--note-form .note-form-editor-wrap .doc-editor {
  flex: 1;
  min-height: 0;
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
  border-bottom: 1px solid var(--ds-border-default);
  padding-bottom: var(--ds-space-md);
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

/* Edit modal - demo items */
.demo-items-section {
  margin-top: var(--ds-space-xl);
  padding-top: var(--ds-space-lg);
  border-top: 1px solid var(--ds-border-subtle);
}

.section-title {
  margin: 0 0 var(--ds-space-md) 0;
  font-size: var(--ds-text-lg);
  font-weight: 600;
  color: var(--ds-text-primary);
}

.demo-items-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.demo-item-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ds-space-md);
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-subtle);
  border-radius: var(--ds-radius-md);
  transition: all var(--ds-transition-base);
}

.demo-item-card:hover {
  background: var(--ds-surface-hover);
  border-color: var(--ds-border-default);
}

.demo-item-card.marked-for-deletion {
  background: rgba(239, 68, 68, 0.05);
  border-color: rgba(239, 68, 68, 0.2);
}

.demo-item-card.marked-for-deletion .demo-meta-line {
  text-decoration: line-through;
  color: var(--ds-text-danger, #dc2626);
  opacity: 0.9;
}

.demo-item-info {
  flex: 1;
  min-width: 0;
}

.demo-meta-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-sm);
}

.demo-icon {
  width: 14px;
  height: 14px;
  opacity: 0.7;
}

.demo-map-name {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ds-text-sm);
  font-weight: 500;
  color: var(--ds-text-primary);
  white-space: nowrap;
}

.demo-teams {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  white-space: nowrap;
}

.demo-time {
  font-size: var(--ds-text-xs);
  color: var(--ds-text-tertiary);
  margin-left: auto;
}

.demo-delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-sm);
  background: var(--ds-surface-base);
  color: var(--ds-text-secondary);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  flex-shrink: 0;
}

.demo-delete-btn:hover {
  background: var(--ds-error, #ef4444);
  border-color: var(--ds-error, #ef4444);
  color: white;
}

.demo-delete-btn.delete-marked {
  background: var(--ds-error, #ef4444);
  border-color: var(--ds-error, #ef4444);
  color: white;
}

.demo-delete-btn.delete-marked:hover {
  background: var(--ds-error-dark, #dc2626);
  border-color: var(--ds-error-dark, #dc2626);
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
