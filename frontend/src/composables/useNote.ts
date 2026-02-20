import { ref, computed } from 'vue';
import { getMetaStorage } from './indexdb-storage';
import { getReplayStorage } from './indexdb-storage';
import { useAuth } from './useAuth';
import { resolveTeamDisplayName } from './teamDisplay';
import type { PlayerInfo } from '@/types/replay';

/** 上传弹窗所需的回合上下文（由 App 在打开弹窗时传入） */
export interface UploadReplayContext {
  replay: { mapName?: string; teamCT?: string; teamT?: string };
  roundNumber: number;
  demoId: string;
}

export type NoteToastType = 'info' | 'warning' | 'error';
export type UploadModalStep = 'form' | 'uploading' | 'success' | 'error';

export interface CloudArchiveItem {
  id: string;
  title: string;
  content?: string;
  permission?: string;
  demo_uuid: string;
  demo_round: number;
  add_time: number;
  mapName?: string;
  teamCT?: string;
  teamT?: string;
  parent_id?: string;
  demos?: Array<{
    id: number;
    demo_uuid: string;
    demo_round: number;
    demo_meta?: string;
    file_path?: string;
    file_size: number;
    created_at: string;
    mapName?: string;
    teamCT?: string;
    teamT?: string;
  }>;
}

/** API item shape from GET /api/note/items (note with optional demos array from backend) */
interface ApiNoteItem {
  id: string;
  title: string;
  content?: string;
  permission?: string;
  created_at?: string;
  mapName?: string;
  teamCT?: string;
  teamT?: string;
  demo_uuid?: string;
  demo_round?: number;
  demo_meta?: string;
  parent_id?: string;
  demos?: Array<{
    id: number;
    demo_uuid: string;
    demo_round: number;
    demo_meta?: string;
    file_size: number;
    created_at: string;
  }>;
}

function mapApiItemToCloud(item: ApiNoteItem): CloudArchiveItem {
  let mapName: string | undefined = item.mapName;
  let teamCT: string | undefined = item.teamCT;
  let teamT: string | undefined = item.teamT;
  if ((!mapName || !teamCT || !teamT) && item.demo_meta) {
    try {
      const meta = JSON.parse(item.demo_meta) as Record<string, unknown>;
      if (typeof meta.mapName === 'string') mapName = mapName ?? meta.mapName;
      const rawCT = typeof meta.teamCT === 'string' ? meta.teamCT : '';
      const rawT = typeof meta.teamT === 'string' ? meta.teamT : '';
      const serverPlayer = Array.isArray(meta.serverPlayer) ? (meta.serverPlayer as PlayerInfo[]) : undefined;
      const resolvedCT = resolveTeamDisplayName(rawCT, 3, serverPlayer);
      const resolvedT = resolveTeamDisplayName(rawT, 2, serverPlayer);
      if (teamCT === undefined) teamCT = resolvedCT === '-' ? undefined : resolvedCT;
      if (teamT === undefined) teamT = resolvedT === '-' ? undefined : resolvedT;
    } catch {
      // ignore
    }
  }
  const add_time = item.created_at ? new Date(item.created_at).getTime() : Date.now();
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    permission: item.permission,
    demo_uuid: item.demo_uuid ?? '',
    demo_round: item.demo_round ?? 0,
    add_time,
    mapName,
    teamCT,
    teamT,
    demos: item.demos,
  };
}

/** 共享的笔记列表，保证 App 与 NoteLibrary 等使用同一份数据，loadNotes 后都能看到更新 */
const sharedNoteList = ref<CloudArchiveItem[]>([]);
const sharedItemsLoading = ref(false);

export function useNote() {
  const { currentUser, handleSessionExpired, fetchAuthMe } = useAuth();
  const noteList = sharedNoteList;
  const itemsLoading = sharedItemsLoading;

  const quotaUsed = computed(() => currentUser.value?.quota_used ?? 0);
  const quotaLimit = computed(() => currentUser.value?.quota_limit ?? 5);
  const isQuotaFull = computed(() => quotaUsed.value >= quotaLimit.value && quotaLimit.value > 0);

  // Toast
  const noteToast = ref(false);
  const noteToastMessage = ref('已保存到战术笔记');
  const noteToastType = ref<NoteToastType>('info');
  let noteToastTimer: ReturnType<typeof setTimeout> | null = null;
  function showNoteToast(message: string, type: NoteToastType = 'info') {
    if (noteToastTimer) clearTimeout(noteToastTimer);
    noteToastMessage.value = message;
    noteToastType.value = type;
    noteToast.value = true;
    noteToastTimer = setTimeout(() => {
      noteToast.value = false;
      noteToastTimer = null;
    }, 2000);
  }

  // Upload modal
  const noteUploading = ref(false);
  const uploadModalOpen = ref(false);
  const uploadModalStep = ref<UploadModalStep>('form');
  const uploadFormTitle = ref('');
  const uploadFormContent = ref('');
  const uploadFormPermission = ref<'private' | 'public'>('private');
  const uploadProgress = ref(0);
  const uploadError = ref('');
  const createdNoteId = ref<string | null>(null);
  const copyLinkCopied = ref(false);
  let copyLinkCopiedTimer: ReturnType<typeof setTimeout> | null = null;
  const uploadContext = ref<UploadReplayContext | null>(null);
  const editingNoteId = ref<string | null>(null);
  const uploadTab = ref<'new' | 'existing'>('new');
  const selectedNoteId = ref<string | null>(null);
  
  // Edit modal state
  const editModalOpen = ref(false);
  const editNoteItem = ref<CloudArchiveItem | null>(null);
  const editDemoItems = ref<Array<{
    id: number;
    demo_uuid: string;
    demo_round: number;
    demo_meta?: string;
    file_path?: string;
    file_size: number;
    created_at: string;
    markedForDeletion: boolean;
  }>>([]);
  const editFormTitle = ref('');
  const editFormContent = ref('');
  const editFormPermission = ref<'private' | 'public'>('private');
  
  // Create note modal state
  const createNoteModalOpen = ref(false);
  const createNoteFormTitle = ref('');
  const createNoteFormContent = ref('');
  const createNoteFormPermission = ref<'private' | 'public'>('private');

  function openUploadModal(ctx: UploadReplayContext) {
    uploadContext.value = ctx;
    editingNoteId.value = null;
    uploadTab.value = 'new';
    selectedNoteId.value = null;
    const r = ctx.replay;
    const round = ctx.roundNumber;
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${month}.${day}`;
    const rawName = r.mapName?.startsWith('de_') ? r.mapName.substring(3) : r.mapName;
    const cleanMapName = rawName ? rawName.toUpperCase() : rawName;
    const defaultTitle = cleanMapName ? `${cleanMapName} - ${dateStr}` : dateStr;
    uploadFormTitle.value = defaultTitle.slice(0, 64);
    uploadFormContent.value = '';
    uploadFormPermission.value = 'private';
    uploadModalStep.value = 'form';
    uploadError.value = '';
    createdNoteId.value = null;
    copyLinkCopied.value = false;
    if (copyLinkCopiedTimer) {
      clearTimeout(copyLinkCopiedTimer);
      copyLinkCopiedTimer = null;
    }
    uploadModalOpen.value = true;
  }

  function openEditModal(item: CloudArchiveItem) {
    editingNoteId.value = item.id;
    uploadContext.value = null;
    uploadFormTitle.value = (item.title ?? '').slice(0, 64);
    uploadFormContent.value = item.content ?? '';
    uploadFormPermission.value = (item.permission === 'public' ? 'public' : 'private');
    uploadModalStep.value = 'form';
    uploadError.value = '';
    createdNoteId.value = null;
    copyLinkCopied.value = false;
    if (copyLinkCopiedTimer) {
      clearTimeout(copyLinkCopiedTimer);
      copyLinkCopiedTimer = null;
    }
    uploadModalOpen.value = true;
  }

  async function openEditNoteModal(item: CloudArchiveItem) {
    editNoteItem.value = item;
    editFormTitle.value = (item.title ?? '').slice(0, 64);
    editFormContent.value = item.content ?? '';
    editFormPermission.value = (item.permission === 'public' ? 'public' : 'private');
    
    // Fetch demo items for this note
    try {
      const res = await fetch(`/api/note/items/${encodeURIComponent(item.id)}`, { 
        credentials: 'include' 
      });
      if (res.ok) {
        const json = await res.json();
        const data = json.data;
        if (data?.demos && Array.isArray(data.demos)) {
          editDemoItems.value = data.demos.map((demo: any) => ({
            ...demo,
            markedForDeletion: false
          }));
        }
      }
    } catch (err) {
      console.error('[Note] Failed to fetch demo items:', err);
      editDemoItems.value = [];
    }
    
    editModalOpen.value = true;
  }

  function closeEditModal() {
    editModalOpen.value = false;
    editNoteItem.value = null;
    editDemoItems.value = [];
    editFormTitle.value = '';
    editFormContent.value = '';
    editFormPermission.value = 'private';
  }

  function toggleDemoDeletion(demoId: number) {
    const demo = editDemoItems.value.find(d => d.id === demoId);
    if (demo) {
      demo.markedForDeletion = !demo.markedForDeletion;
    }
  }

  function closeUploadModal() {
    uploadModalOpen.value = false;
    uploadModalStep.value = 'form';
    uploadError.value = '';
    createdNoteId.value = null;
    uploadContext.value = null;
    editingNoteId.value = null;
    uploadTab.value = 'new';
    selectedNoteId.value = null;
    if (copyLinkCopiedTimer) {
      clearTimeout(copyLinkCopiedTimer);
      copyLinkCopiedTimer = null;
    }
  }

  function retryUploadForm() {
    uploadModalStep.value = 'form';
    uploadError.value = '';
  }

  function getShareUrl(): string {
    const id = createdNoteId.value;
    if (!id) return '';
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/replayer?source=cloud&note_id=${encodeURIComponent(id)}&tab=note`;
  }

  async function copyShareLink() {
    const url = getShareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      copyLinkCopied.value = true;
      if (copyLinkCopiedTimer) clearTimeout(copyLinkCopiedTimer);
      copyLinkCopiedTimer = setTimeout(() => {
        copyLinkCopied.value = false;
        copyLinkCopiedTimer = null;
      }, 2000);
    } catch {
      showNoteToast('复制失败', 'error');
    }
  }
  
  // Create note functions
  function openCreateNoteModal() {
    createNoteFormTitle.value = '';
    createNoteFormContent.value = '';
    createNoteFormPermission.value = 'private';
    createNoteModalOpen.value = true;
  }
  
  function closeCreateNoteModal() {
    createNoteModalOpen.value = false;
    createNoteFormTitle.value = '';
    createNoteFormContent.value = '';
    createNoteFormPermission.value = 'private';
  }
  
  async function submitCreateNote() {
    const title = createNoteFormTitle.value.trim();
    if (!title) {
      showNoteToast('请输入笔记标题', 'warning');
      return;
    }
    
    try {
      const form = new FormData();
      form.append('title', title);
      if (createNoteFormContent.value) {
        form.append('content', createNoteFormContent.value);
      }
      form.append('permission', createNoteFormPermission.value);
      // Empty demo data for pure note creation
      form.append('demo_uuid', '');
      form.append('demo_round', '0');
      
      const result = await new Promise<{ id: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/note/items');
        xhr.withCredentials = true;
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const j = JSON.parse(xhr.responseText);
              const id = j?.data?.id;
              if (id) resolve({ id });
              else reject(new Error('Invalid response'));
            } catch {
              reject(new Error('Invalid response'));
            }
          } else {
            try {
              const j = JSON.parse(xhr.responseText || '{}');
              reject(new Error(j?.error || `HTTP ${xhr.status}`));
            } catch {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.send(form);
      });
      
      showNoteToast('笔记创建成功', 'info');
      await loadNotes();
      closeCreateNoteModal();
    } catch (err) {
      showNoteToast(err instanceof Error ? err.message : '创建失败', 'error');
    }
  }

  async function submitArchiveToExistingNote() {
    if (!currentUser.value) {
      showNoteToast('请先登录后查看和管理战术笔记', 'warning');
      return;
    }
    if (isQuotaFull.value) {
      showQuotaExceededModal.value = true;
      return;
    }
    const ctx = uploadContext.value;
    if (!ctx) return;
    const { demoId, roundNumber } = ctx;
    const noteId = selectedNoteId.value;
    if (!noteId) return;

    const replay = await getReplayStorage();
    const roundBytes = await replay.loadRound(demoId, roundNumber);
    if (!roundBytes || roundBytes.length === 0) {
      uploadError.value = '请先加载该回合';
      uploadModalStep.value = 'error';
      return;
    }
    const form = new FormData();
    form.append('file', new Blob([roundBytes as BlobPart], { type: 'application/octet-stream' }), 'round.pb');
    form.append('demo_uuid', demoId);
    form.append('demo_round', String(roundNumber));
    form.append('parent_id', noteId); // Link to existing note
    const metaStorage = await getMetaStorage();
    const fullMeta = await metaStorage.loadMeta(demoId);
    if (fullMeta) form.append('meta', JSON.stringify(fullMeta));

    uploadModalStep.value = 'uploading';
    noteUploading.value = true;
    uploadProgress.value = 0;
    uploadError.value = '';
    try {
      const result = await new Promise<{ id: string | number; note_id?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/note/items');
        xhr.withCredentials = true;
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            uploadProgress.value = Math.round((e.loaded / e.total) * 100);
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const j = JSON.parse(xhr.responseText);
              const data = j?.data;
              if (data) {
                // For archiving to existing note, we get demo item ID
                // For creating new note, we get note item ID
                const id = data.id;
                const returnedNoteId = data.note_id || noteId; // Use returned note_id if provided
                if (id) resolve({ id, note_id: returnedNoteId });
                else reject(new Error('Invalid response'));
              } else {
                reject(new Error('Invalid response'));
              }
            } catch {
              reject(new Error('Invalid response'));
            }
          } else {
            try {
              const j = JSON.parse(xhr.responseText || '{}');
              if (xhr.status === 403 && (j?.error === 'note_quota_exceeded' || j?.code === 'QUOTA_EXCEEDED')) {
                reject({ status: 403, code: 'QUOTA_EXCEEDED', quota: j?.quota });
              } else {
                reject(new Error(j?.error || `HTTP ${xhr.status}`));
              }
            } catch {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.send(form);
      });
      // For archive to existing note, id is demo item id; use note_id for share link
      createdNoteId.value = (result.note_id ?? result.id) != null ? String(result.note_id ?? result.id) : null;
      await loadNotes();
      uploadModalStep.value = 'success';
      await fetchAuthMe();
      showNoteToast('已归档到笔记', 'info');
    } catch (err) {
      const quotaErr = err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'QUOTA_EXCEEDED';
      if (quotaErr) {
        closeUploadModal();
        showQuotaExceededModal.value = true;
      } else {
        uploadError.value = err instanceof Error ? err.message : '上传失败';
        uploadModalStep.value = 'error';
      }
    } finally {
      noteUploading.value = false;
      uploadProgress.value = 0;
    }
  }

  async function submitUploadFromModal() {
    // Handle existing note tab
    if (uploadTab.value === 'existing') {
      if (!selectedNoteId.value) {
        showNoteToast('请选择要归档的笔记', 'warning');
        return;
      }
      await submitArchiveToExistingNote();
      return;
    }
    
    // Handle new note tab (existing logic)
    const title = uploadFormTitle.value.trim();
    if (!title) {
      showNoteToast('请输入存档名称', 'warning');
      return;
    }
    // 编辑：不走上传流程，直接 PATCH
    if (editingNoteId.value) {
      const payload: { title?: string; permission?: string; content?: string } = {
        title,
        permission: uploadFormPermission.value,
        content: uploadFormContent.value,
      };
      await updateItem(editingNoteId.value, payload);
      showNoteToast('已修改战术笔记', 'info');
      await loadNotes();
      closeUploadModal();
      return;
    }

    if (!currentUser.value) {
      showNoteToast('请先登录后查看和管理战术笔记', 'warning');
      return;
    }
    if (isQuotaFull.value) {
      showQuotaExceededModal.value = true;
      return;
    }
    const ctx = uploadContext.value;
    if (!ctx) return;
    const { demoId, roundNumber } = ctx;

    const replay = await getReplayStorage();
    const roundBytes = await replay.loadRound(demoId, roundNumber);
    if (!roundBytes || roundBytes.length === 0) {
      uploadError.value = '请先加载该回合';
      uploadModalStep.value = 'error';
      return;
    }
    const form = new FormData();
    form.append('file', new Blob([roundBytes as BlobPart], { type: 'application/octet-stream' }), 'round.pb');
    form.append('title', title);
    form.append('content', uploadFormContent.value);
    form.append('demo_uuid', demoId);
    form.append('demo_round', String(roundNumber));
    form.append('permission', uploadFormPermission.value);
    const metaStorage = await getMetaStorage();
    const fullMeta = await metaStorage.loadMeta(demoId);
    if (fullMeta) form.append('meta', JSON.stringify(fullMeta));

    uploadModalStep.value = 'uploading';
    noteUploading.value = true;
    uploadProgress.value = 0;
    uploadError.value = '';
    try {
      const result = await new Promise<{ id: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/note/items');
        xhr.withCredentials = true;
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            uploadProgress.value = Math.round((e.loaded / e.total) * 100);
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const j = JSON.parse(xhr.responseText);
              const id = j?.data?.id;
              if (id) resolve({ id });
              else reject(new Error('Invalid response'));
            } catch {
              reject(new Error('Invalid response'));
            }
          } else {
            try {
              const j = JSON.parse(xhr.responseText || '{}');
              if (xhr.status === 403 && (j?.error === 'note_quota_exceeded' || j?.code === 'QUOTA_EXCEEDED')) {
                reject({ status: 403, code: 'QUOTA_EXCEEDED', quota: j?.quota });
              } else {
                reject(new Error(j?.error || `HTTP ${xhr.status}`));
              }
            } catch {
              reject(new Error(`HTTP ${xhr.status}`));
            }
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.send(form);
      });
      createdNoteId.value = result.id;
      await loadNotes();
      uploadModalStep.value = 'success';
      await fetchAuthMe();
    } catch (err) {
      const quotaErr = err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'QUOTA_EXCEEDED';
      if (quotaErr) {
        closeUploadModal();
        showQuotaExceededModal.value = true;
      } else {
        uploadError.value = err instanceof Error ? err.message : '上传失败';
        uploadModalStep.value = 'error';
      }
    } finally {
      noteUploading.value = false;
      uploadProgress.value = 0;
    }
  }

  // Delete confirm modal
  const confirmDeleteNoteId = ref<string | null>(null);
  async function confirmDeleteNoteConfirm() {
    if (confirmDeleteNoteId.value !== null) {
      const id = confirmDeleteNoteId.value;
      confirmDeleteNoteId.value = null;
      await removeItem(id);
    }
  }

  // Quota exceeded modal
  const showQuotaExceededModal = ref(false);

  // Share modal
  const shareModalOpen = ref(false);
  const shareModalNoteId = ref<string | null>(null);
  const shareModalPermission = ref<'private' | 'public'>('private');
  const shareModalCopyCopied = ref(false);
  let shareModalCopyCopiedTimer: ReturnType<typeof setTimeout> | null = null;

  function getShareUrlForNoteId(noteId: string): string {
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/replayer?source=cloud&note_id=${encodeURIComponent(noteId)}&tab=note`;
  }

  function openShareModal(item: CloudArchiveItem) {
    shareModalNoteId.value = item.id;
    shareModalPermission.value = (item.permission === 'public' ? 'public' : 'private');
    shareModalCopyCopied.value = false;
    if (shareModalCopyCopiedTimer) {
      clearTimeout(shareModalCopyCopiedTimer);
      shareModalCopyCopiedTimer = null;
    }
  }

  function closeShareModal() {
    shareModalNoteId.value = null;
    if (shareModalCopyCopiedTimer) {
      clearTimeout(shareModalCopyCopiedTimer);
      shareModalCopyCopiedTimer = null;
    }
  }

  function saveShareModalPermission() {
    if (shareModalNoteId.value === null) return;
    updateItem(shareModalNoteId.value, { permission: shareModalPermission.value });
    showNoteToast('可见范围已修改', 'info');
  }

  async function copyShareLinkInShareModal() {
    if (shareModalNoteId.value === null) return;
    const url = getShareUrlForNoteId(shareModalNoteId.value);
    try {
      await navigator.clipboard.writeText(url);
      shareModalCopyCopied.value = true;
      if (shareModalCopyCopiedTimer) clearTimeout(shareModalCopyCopiedTimer);
      shareModalCopyCopiedTimer = setTimeout(() => {
        shareModalCopyCopied.value = false;
        shareModalCopyCopiedTimer = null;
      }, 2000);
    } catch {
      showNoteToast('复制失败', 'error');
    }
  }

  async function loadNotes(): Promise<void> {
    itemsLoading.value = true;
    try {
      if (currentUser.value) {
        try {
          const res = await fetch('/api/note/items', { credentials: 'include' });
          const json = await res.json().catch(() => ({}));
          if (res.status === 401) {
            handleSessionExpired();
            noteList.value = [];
            return;
          }
          if (res.ok && json?.status === 'OK' && json?.data?.items) {
            noteList.value = (json.data.items as ApiNoteItem[]).map(mapApiItemToCloud);
          } else {
            noteList.value = [];
          }
        } catch (e) {
          console.warn('[useCloudNote] loadNotes API failed:', e);
          noteList.value = [];
        }
        return;
      }
      noteList.value = [];
    } catch (e) {
      console.warn('[useCloudNote] loadNotes failed:', e);
      noteList.value = [];
    } finally {
      itemsLoading.value = false;
    }
  }

  /** When logged in, adding is done via upload + loadNotes; when not logged in, no persistence. */
  async function addItem(item: CloudArchiveItem): Promise<void> {
    if (currentUser.value) return;
  }

  async function removeItem(id: string): Promise<void> {
    if (currentUser.value) {
      try {
        const res = await fetch(`/api/note/items/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (res.status === 401) {
          handleSessionExpired();
          return;
        }
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const deletedChildren = data?.data?.deleted_children || 0;

          // Remove the parent item and all its children from the list
          noteList.value = noteList.value.filter((i) => i.id !== id);
          await loadNotes();

          // Show appropriate toast message
          if (deletedChildren > 0) {
            showNoteToast(`已删除笔记及 ${deletedChildren} 个关联笔记`, 'info');
          } else {
            showNoteToast('已删除笔记', 'info');
          }
        } else {
          const json = await res.json().catch(() => ({}));
          showNoteToast(json?.error || `删除失败 (${res.status})`, 'error');
        }
      } catch (e) {
        console.warn('[useCloudNote] removeItem API failed:', e);
        showNoteToast('删除失败', 'error');
      }
      return;
    }
    noteList.value = noteList.value.filter((i) => i.id !== id);
  }

  /** When logged in, setItems is no-op (use updateItem for single-field updates). */
  async function setItems(items: CloudArchiveItem[]): Promise<void> {
    if (currentUser.value) return;
    noteList.value = items;
  }

  /** Update title (and optionally permission). When logged in calls PATCH; else updates local state only. */
  async function updateItem(
    id: string,
    payload: { title?: string; permission?: string; content?: string }
  ): Promise<void> {
    if (currentUser.value) {
      try {
        const res = await fetch(`/api/note/items/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.status === 401) {
          handleSessionExpired();
          return;
        }
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.status === 'OK' && json?.data) {
          const idx = noteList.value.findIndex((i) => i.id === id);
          if (idx !== -1) {
            const next = [...noteList.value];
            next[idx] = mapApiItemToCloud(json.data as ApiNoteItem);
            noteList.value = next;
          }
        }
      } catch (e) {
        console.warn('[useCloudNote] updateItem API failed:', e);
      }
      return;
    }
    const idx = noteList.value.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const next = [...noteList.value];
    if (payload.title !== undefined) next[idx] = { ...next[idx], title: payload.title };
    if (payload.permission !== undefined) next[idx] = { ...next[idx], permission: payload.permission };
    if (payload.content !== undefined) next[idx] = { ...next[idx], content: payload.content };
    noteList.value = next;
  }

  async function deleteDemoItem(demoId: number): Promise<void> {
    const res = await fetch(`/api/note/demo/${demoId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error('删除失败');
    }
  }

  async function saveEditNote() {
    if (!editNoteItem.value) return;
    
    const title = editFormTitle.value.trim();
    if (!title) {
      showNoteToast('请输入笔记标题', 'warning');
      return;
    }
    
    try {
      // Update note metadata
      const payload: { title?: string; permission?: string; content?: string } = {
        title,
        permission: editFormPermission.value,
        content: editFormContent.value,
      };
      
      await updateItem(editNoteItem.value.id, payload);
      
      // Delete marked demo items
      const itemsToDelete = editDemoItems.value.filter(d => d.markedForDeletion);
      for (const demo of itemsToDelete) {
        try {
          await deleteDemoItem(demo.id);
        } catch (err) {
          console.error(`[Note] Failed to delete demo item ${demo.id}:`, err);
        }
      }
      
      showNoteToast('笔记已更新', 'info');
      await loadNotes();
      closeEditModal();
    } catch (err) {
      showNoteToast(err instanceof Error ? err.message : '更新失败', 'error');
    }
  }

  return {
    noteList,
    itemsLoading,
    loadNotes,
    addItem,
    removeItem,
    setItems,
    updateItem,
    // Quota
    quotaUsed,
    quotaLimit,
    isQuotaFull,
    // Toast
    noteToast,
    noteToastMessage,
    noteToastType,
    showNoteToast,
    // Upload modal
    noteUploading,
    uploadModalOpen,
    uploadModalStep,
    uploadFormTitle,
    uploadFormContent,
    uploadFormPermission,
    uploadProgress,
    uploadError,
    createdNoteId,
    copyLinkCopied,
    uploadContext,
    editingNoteId,
    uploadTab,
    selectedNoteId,
    openUploadModal,
    openEditModal,
    openEditNoteModal,
    closeUploadModal,
    closeEditModal,
    submitUploadFromModal,
    submitArchiveToExistingNote,
    saveEditNote,
    toggleDemoDeletion,
    // Share modal
    shareModalOpen,
    shareModalNoteId,
    shareModalPermission,
    shareModalCopyCopied,
    getShareUrlForNoteId,
    openShareModal,
    closeShareModal,
    saveShareModalPermission,
    copyShareLinkInShareModal,
    // Delete confirm modal
    confirmDeleteNoteId,
    confirmDeleteNoteConfirm,
    // Quota exceeded modal
    showQuotaExceededModal,
    // Edit modal state
    editModalOpen,
    editNoteItem,
    editDemoItems,
    editFormTitle,
    editFormContent,
    editFormPermission,
    // Create note modal (note-only, no demo)
    createNoteModalOpen,
    createNoteFormTitle,
    createNoteFormContent,
    createNoteFormPermission,
    openCreateNoteModal,
    closeCreateNoteModal,
    submitCreateNote,
  };
}
