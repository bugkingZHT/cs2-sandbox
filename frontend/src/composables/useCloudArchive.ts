import { ref } from 'vue';
import { getMetaStorage } from './indexdb-storage';
import { CLOUD_ARCHIVE_STORE } from './indexdb-storage';
import { useAuth } from './useAuth';

const ARCHIVE_LIST_KEY = 'list';

export interface CloudArchiveItem {
  id: string;
  title: string;
  demo_uuid: string;
  demo_round: number;
  add_time: number;
  mapName?: string;
  teamCT?: string;
  teamT?: string;
}

interface CloudArchiveRecord {
  id: string;
  items: CloudArchiveItem[];
}

/** API item shape from GET /api/archive/items */
interface ApiArchiveItem {
  id: string;
  title: string;
  permission?: string;
  demo_uuid: string;
  demo_round: number;
  demo_meta?: string;
  created_at?: string;
}

function mapApiItemToCloud(item: ApiArchiveItem): CloudArchiveItem {
  let mapName: string | undefined;
  let teamCT: string | undefined;
  let teamT: string | undefined;
  if (item.demo_meta) {
    try {
      const meta = JSON.parse(item.demo_meta) as Record<string, unknown>;
      if (typeof meta.mapName === 'string') mapName = meta.mapName;
      if (typeof meta.teamCT === 'string') teamCT = meta.teamCT;
      if (typeof meta.teamT === 'string') teamT = meta.teamT;
    } catch {
      // ignore
    }
  }
  const add_time = item.created_at ? new Date(item.created_at).getTime() : Date.now();
  return {
    id: item.id,
    title: item.title,
    demo_uuid: item.demo_uuid,
    demo_round: item.demo_round,
    add_time,
    mapName,
    teamCT,
    teamT,
  };
}

async function getDb(): Promise<IDBDatabase> {
  const storage = await getMetaStorage();
  const db = storage.getDb();
  if (!db) throw new Error('IndexedDB not initialized');
  return db;
}

function getStore(db: IDBDatabase, mode: IDBTransactionMode = 'readonly') {
  const tx = db.transaction(CLOUD_ARCHIVE_STORE, mode);
  return tx.objectStore(CLOUD_ARCHIVE_STORE);
}

export function useCloudArchive() {
  const { currentUser, handleSessionExpired } = useAuth();
  const archiveList = ref<CloudArchiveItem[]>([]);

  async function loadArchive(): Promise<void> {
    if (currentUser.value) {
      try {
        const res = await fetch('/api/archive/items', { credentials: 'include' });
        const json = await res.json().catch(() => ({}));
        if (res.status === 401) {
          handleSessionExpired();
          archiveList.value = [];
          return;
        }
        if (res.ok && json?.status === 'OK' && json?.data?.items) {
          archiveList.value = (json.data.items as ApiArchiveItem[]).map(mapApiItemToCloud);
        } else {
          archiveList.value = [];
        }
      } catch (e) {
        console.warn('[useCloudArchive] loadArchive API failed:', e);
        archiveList.value = [];
      }
      return;
    }
    try {
      const db = await getDb();
      const record = await new Promise<CloudArchiveRecord | undefined>((resolve, reject) => {
        const store = getStore(db);
        const request = store.get(ARCHIVE_LIST_KEY);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      archiveList.value = record?.items ?? [];
    } catch (e) {
      console.warn('[useCloudArchive] loadArchive failed:', e);
      archiveList.value = [];
    }
  }

  /** Build a plain object so IndexedDB put() does not hit DataCloneError (e.g. Vue proxies). */
  function toPlainRecord(items: CloudArchiveItem[]): CloudArchiveRecord {
    return {
      id: ARCHIVE_LIST_KEY,
      items: items.map((item) => ({
        id: String(item.id),
        title: String(item.title),
        demo_uuid: String(item.demo_uuid),
        demo_round: Number(item.demo_round),
        add_time: Number(item.add_time),
        mapName: item.mapName != null ? String(item.mapName) : undefined,
        teamCT: item.teamCT != null ? String(item.teamCT) : undefined,
        teamT: item.teamT != null ? String(item.teamT) : undefined,
      })),
    };
  }

  async function persistItems(items: CloudArchiveItem[]): Promise<void> {
    const db = await getDb();
    const plain = toPlainRecord(items);
    await new Promise<void>((resolve, reject) => {
      const store = getStore(db, 'readwrite');
      const request = store.put(plain);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    archiveList.value = plain.items;
  }

  /** When logged in, adding is done via upload + loadArchive; this is no-op. */
  async function addItem(item: CloudArchiveItem): Promise<void> {
    if (currentUser.value) return;
    const next = [...archiveList.value, item];
    await persistItems(next);
  }

  async function removeItem(id: string): Promise<void> {
    if (currentUser.value) {
      try {
        const res = await fetch(`/api/archive/items/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (res.status === 401) {
          handleSessionExpired();
          return;
        }
        if (res.ok) {
          archiveList.value = archiveList.value.filter((i) => i.id !== id);
        }
      } catch (e) {
        console.warn('[useCloudArchive] removeItem API failed:', e);
      }
      return;
    }
    const next = archiveList.value.filter((i) => i.id !== id);
    await persistItems(next);
  }

  async function reorderItems(fromIndex: number, toIndex: number): Promise<void> {
    if (fromIndex === toIndex) return;
    const items = [...archiveList.value];
    const [removed] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, removed);
    const order = items.map((i) => i.id);
    if (currentUser.value) {
      try {
        const res = await fetch('/api/archive/tree', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order }),
        });
        if (res.status === 401) {
          handleSessionExpired();
          return;
        }
        if (res.ok) {
          archiveList.value = items;
        }
      } catch (e) {
        console.warn('[useCloudArchive] reorderItems API failed:', e);
      }
      return;
    }
    await persistItems(items);
  }

  /** When logged in, setItems is no-op (use updateItem for single-field updates). */
  async function setItems(items: CloudArchiveItem[]): Promise<void> {
    if (currentUser.value) return;
    await persistItems(items);
  }

  /** Update title (and optionally permission). When logged in calls PATCH; else updates local + IndexedDB. */
  async function updateItem(
    id: string,
    payload: { title?: string; permission?: string }
  ): Promise<void> {
    if (currentUser.value) {
      try {
        const res = await fetch(`/api/archive/items/${encodeURIComponent(id)}`, {
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
          const idx = archiveList.value.findIndex((i) => i.id === id);
          if (idx !== -1) {
            const next = [...archiveList.value];
            next[idx] = mapApiItemToCloud(json.data as ApiArchiveItem);
            archiveList.value = next;
          }
        }
      } catch (e) {
        console.warn('[useCloudArchive] updateItem API failed:', e);
      }
      return;
    }
    const idx = archiveList.value.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const next = [...archiveList.value];
    if (payload.title !== undefined) next[idx] = { ...next[idx], title: payload.title };
    await persistItems(next);
  }

  return {
    archiveList,
    loadArchive,
    addItem,
    removeItem,
    reorderItems,
    setItems,
    updateItem,
  };
}
