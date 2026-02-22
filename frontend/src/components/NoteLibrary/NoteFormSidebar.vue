<template>
  <!-- 编辑笔记 -->
  <div v-if="editModalOpen" class="note-form-sidebar">
    <button type="button" class="note-sidebar-close" aria-label="关闭" @click="closeEditModal">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
    <div class="note-sidebar-body">
      <h3 class="note-sidebar-title">笔记</h3>
      <NoteFormFields
        v-model:title="editFormTitle"
        v-model:content="editFormContent"
        v-model:permission="editFormPermission"
        :disabled="!isNoteOwner"
        :is-note-owner="isNoteOwner"
      />
      <div v-if="editDemoItems.length > 0" class="demo-items-section">
        <h4 class="section-title">关联回放 ({{ editDemoItems.length }} 个)</h4>
        <div class="demo-items-list">
          <div
            v-for="demo in editDemoItems"
            :key="demo.id"
            class="demo-item-card"
            :class="{ 'marked-for-deletion': demo.markedForDeletion }"
            role="button"
            tabindex="0"
            title="播放回合"
            @click="goToDemo(demo)"
            @keydown.enter.space.prevent="goToDemo(demo)"
          >
              <div class="demo-item-info">
                <div class="demo-meta-line">
                  <span class="demo-map-name">{{ getDemoMapName(demo) }}</span>
                  <span class="demo-teams">{{ getDemoTeamCT(demo) }} vs {{ getDemoTeamT(demo) }}</span>
                  <span v-if="getDemoFileName(demo)" class="demo-file-name">{{ getDemoFileName(demo) }}</span>
                </div>
              </div>
            <button
              v-if="isNoteOwner"
              type="button"
              class="demo-delete-btn"
              :class="{ 'delete-marked': demo.markedForDeletion }"
              @click.stop="toggleDemoDeletion(demo.id)"
              :title="demo.markedForDeletion ? '取消删除' : '标记删除'"
            >
              <svg v-if="!demo.markedForDeletion" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div class="note-sidebar-actions">
        <button v-if="isNoteOwner" type="button" class="ds-btn ds-btn-primary" @click="saveEditNote">保存</button>
      </div>
    </div>
  </div>

  <!-- 新建笔记 -->
  <div v-else-if="createNoteModalOpen" class="note-form-sidebar">
    <button type="button" class="note-sidebar-close" aria-label="关闭" @click="closeCreateNoteModal">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
    <div class="note-sidebar-body">
      <h3 class="note-sidebar-title">新建笔记</h3>
      <NoteFormFields
        v-model:title="createNoteFormTitle"
        v-model:content="createNoteFormContent"
        v-model:permission="createNoteFormPermission"
      />
      <div class="note-sidebar-actions">
        <button type="button" class="ds-btn ds-btn-secondary" @click="closeCreateNoteModal">取消</button>
        <button type="button" class="ds-btn ds-btn-primary" @click="submitCreateNote">创建</button>
      </div>
    </div>
  </div>

  <!-- 发布/归档笔记 -->
  <div v-else-if="uploadModalOpen" class="note-form-sidebar">
    <button
      v-if="uploadModalStep !== 'uploading'"
      type="button"
      class="note-sidebar-close"
      aria-label="关闭"
      @click="closeUploadModal"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
    <div class="note-sidebar-body">
      <template v-if="uploadModalStep === 'form'">
        <h3 class="note-sidebar-title">{{ editingNoteId ? '修改笔记' : '发布笔记' }}</h3>

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
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
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
          </template>
        </div>
        <div class="note-sidebar-actions">
          <button type="button" class="ds-btn ds-btn-secondary" @click="closeUploadModal">取消</button>
          <button type="button" class="ds-btn ds-btn-primary" @click="submitUploadFromModal">
            {{ editingNoteId ? '保存修改' : (uploadTab === 'existing' ? '归档' : '发布') }}
          </button>
        </div>
      </template>
      <!-- 正在上传、上传成功 已移至 NoteModal 以 modal 展示 -->
      <template v-else-if="uploadModalStep === 'error'">
        <div class="note-sidebar-upload-icon error">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h3 class="note-sidebar-title">上传失败</h3>
        <p class="modal-message error">{{ uploadError }}</p>
        <div class="note-sidebar-actions">
          <button type="button" class="ds-btn ds-btn-primary" @click="closeUploadModal">关闭</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useNote } from '@/composables/useNote';
import NoteFormFields from './NoteFormFields.vue';

const emit = defineEmits<{
  (e: 'go', payload: { noteId: string; demoId: number }): void;
}>();

const {
  noteList,
  editModalOpen,
  editNoteItem,
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
  getShareUrlForNoteId,
  copyShareLink,
} = useNote();

const { currentUser } = useAuth();

/** 当前 session 是否为正在编辑的笔记的 owner；非 owner 时禁用编辑并隐藏保存 */
const isNoteOwner = computed(() => {
  const item = editNoteItem.value;
  const user = currentUser.value;
  if (user == null) return false;
  if (!item || !user?.id) return false;
  if (typeof item.owner_id !== 'number') return false;
  return item.owner_id === user.id;
});

const showNoteDropdown = ref(false);

const selectedNote = computed(() => {
  if (!selectedNoteId.value) return null;
  return noteList.value.find((n) => n.id === selectedNoteId.value) ?? null;
});

function getNoteDemoCount(note: { demos?: unknown[] }) {
  return note.demos?.length ?? 0;
}

/** 附件播放：与 NoteLibrary 同逻辑，跳转 replayer 播放该 demo */
function goToDemo(demo: { id: number }) {
  const note = editNoteItem.value;
  if (!note?.id || demo.id == null) return;
  emit('go', { noteId: note.id, demoId: demo.id });
}

/** Display file name: prefer fileName from demo meta (original .dem name), else API file_name */
function getDemoFileName(demo: { demo_meta?: string; file_name?: string }): string {
  if (demo.demo_meta) {
    try {
      const meta = JSON.parse(demo.demo_meta) as { fileName?: string };
      if (typeof meta.fileName === 'string' && meta.fileName.trim()) return meta.fileName.trim();
    } catch {
      /* ignore */
    }
  }
  return typeof demo.file_name === 'string' && demo.file_name.trim() ? demo.file_name.trim() : '';
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

/** 时间格式 YYYY-MM-DD HH:mm:ss */
function formatDemoTime(ms: number) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
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

onMounted(() => {
  document.addEventListener('click', handleNoteDropdownClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleNoteDropdownClickOutside);
});
</script>

<style scoped>
.note-form-sidebar {
  width: 100%;
  height: 100%;
  background: var(--ds-bg-secondary);
  border-left: 1px solid var(--ds-border-default);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.note-sidebar-close {
  position: absolute;
  top: var(--ds-space-lg);
  right: var(--ds-space-lg);
  z-index: 1;
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

.note-sidebar-close:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.note-sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--ds-space-3xl);
  padding-top: calc(var(--ds-space-3xl) + 40px);
}

.note-sidebar-title {
  margin: 0 0 var(--ds-space-xl) 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-xl);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.note-sidebar-actions {
  display: flex;
  gap: var(--ds-space-md);
  justify-content: flex-end;
  margin-top: var(--ds-space-xl);
  padding-top: var(--ds-space-lg);
  border-top: 1px solid var(--ds-border-subtle);
}

.note-sidebar-actions .ds-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.note-sidebar-actions .ds-btn-primary {
  width: auto;
  min-width: 80px;
  transition: all var(--ds-transition-base);
}

.note-sidebar-actions .ds-btn-secondary {
  width: auto;
  min-width: 80px;
  background: transparent;
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-secondary);
  transition: all var(--ds-transition-base);
}

.note-sidebar-actions .ds-btn-secondary:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
  border-color: var(--ds-border-strong);
}

.note-sidebar-upload-icon {
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

.note-sidebar-upload-icon.success {
  color: var(--ds-success);
  background: rgba(63, 185, 80, 0.15);
}

.note-sidebar-upload-icon.error {
  color: var(--ds-danger, #ef4444);
  background: rgba(239, 68, 68, 0.1);
}

.modal-form {
  margin-bottom: var(--ds-space-xl);
}

.note-form-editor-wrap {
  min-height: 220px;
  display: flex;
  flex-direction: column;
}

.note-form-editor-wrap :deep(.doc-editor) {
  flex: 1;
  min-height: 0;
}

.modal-message {
  margin: 0 0 var(--ds-space-xl) 0;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-base);
  line-height: 1.6;
}

.modal-message.success {
  color: var(--ds-success, #10b981);
}

.modal-message.error {
  color: var(--ds-danger, #ef4444);
}

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
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-subtle);
  border-radius: var(--ds-radius-md);
  transition: all var(--ds-transition-base);
  cursor: pointer;
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
  margin: var(--ds-space-md);
}

.demo-meta-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-sm);
}

/* 附件卡片统一：1 mapname 纯白加粗 2 teams 纯白不加粗 3 文件名 灰色小号 4 时间 灰色小号 */
.demo-map-name {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
  white-space: nowrap;
}

.demo-teams {
  font-size: var(--ds-text-sm);
  font-weight: 400;
  color: var(--ds-text-primary);
  white-space: nowrap;
}

.demo-file-name {
  font-size: var(--ds-text-xs);
  font-weight: 400;
  color: var(--ds-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
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
  margin: var(--ds-space-sm);
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

.form-group {
  margin-bottom: var(--ds-space-xl);
}

.form-info p {
  margin: 0 0 var(--ds-space-md);
  font-size: var(--ds-text-sm);
  color: var(--ds-text-tertiary);
  line-height: 1.5;
}
</style>
