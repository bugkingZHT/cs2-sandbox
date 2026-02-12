import { ref } from 'vue';
import { getMetaStorage } from './indexdb-storage';
import { CLOUD_ARCHIVE_STORE } from './indexdb-storage';

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
  const archiveList = ref<CloudArchiveItem[]>([]);

  async function loadArchive(): Promise<void> {
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

  async function addItem(item: CloudArchiveItem): Promise<void> {
    const next = [...archiveList.value, item];
    await persistItems(next);
  }

  async function removeItem(id: string): Promise<void> {
    const next = archiveList.value.filter((i) => i.id !== id);
    await persistItems(next);
  }

  async function reorderItems(fromIndex: number, toIndex: number): Promise<void> {
    if (fromIndex === toIndex) return;
    const items = [...archiveList.value];
    const [removed] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, removed);
    await persistItems(items);
  }

  async function setItems(items: CloudArchiveItem[]): Promise<void> {
    await persistItems(items);
  }

  return {
    archiveList,
    loadArchive,
    addItem,
    removeItem,
    reorderItems,
    setItems,
  };
}
