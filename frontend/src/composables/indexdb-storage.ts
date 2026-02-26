import type { ReplayMeta } from '../types/replay';
import { MAX_DEMO_CACHE_NUM_DEFAULT } from '../config/debug';

// Replay meta is no longer stored in IndexedDB; it is always loaded from cloud (GET /api/demos, note item, etc.).
// Only replay-rounds are cached in IndexedDB for faster re-load.

// Database schema
const DB_NAME = 'cs-demobox';
const DB_VERSION = 13; // v12→v13: remove replay-meta store; meta comes from cloud only
const ROUNDS_STORE = 'replay-rounds';
const LEGACY_META_STORE = 'replay-meta';

let sharedDb: IDBDatabase | null = null;
let sharedDbPromise: Promise<IDBDatabase> | null = null;

function ensureDB(): Promise<IDBDatabase> {
  if (sharedDb) return Promise.resolve(sharedDb);
  if (sharedDbPromise) return sharedDbPromise;
  sharedDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      sharedDb = request.result;
      resolve(sharedDb);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (db.objectStoreNames.contains(LEGACY_META_STORE)) {
        db.deleteObjectStore(LEGACY_META_STORE);
        console.log('[IndexedDB] Deleted replay-meta store (meta from cloud only)');
      }
      if (db.objectStoreNames.contains('tactic-favorites')) {
        db.deleteObjectStore('tactic-favorites');
      }
      if (db.objectStoreNames.contains('tactic-tree')) {
        db.deleteObjectStore('tactic-tree');
      }
      if (db.objectStoreNames.contains('cloud-archive')) {
        db.deleteObjectStore('cloud-archive');
      }
      if (!db.objectStoreNames.contains(ROUNDS_STORE)) {
        const roundsStore = db.createObjectStore(ROUNDS_STORE, { autoIncrement: false });
        roundsStore.createIndex('uuid', 'uuid', { unique: false });
        console.log('[IndexedDB] Created replay-rounds store');
      }
    };
  });
  return sharedDbPromise;
}

/** No-op meta storage: replay meta is never persisted locally; all meta comes from cloud. */
export const IndexedDBMetaStorage = {
  isInitialized(): boolean {
    return sharedDb !== null;
  },
  getDb(): IDBDatabase | null {
    return sharedDb;
  },
  async init(): Promise<IDBDatabase> {
    return ensureDB();
  },
  async saveMeta(_meta: ReplayMeta): Promise<void> {},
  async loadMeta(_uuid: string): Promise<ReplayMeta | null> {
    return null;
  },
  async loadAllMetas(): Promise<ReplayMeta[]> {
    return [];
  },
  async updateMetaStatus(_uuid: string, _status: number, _progress?: number, _statusText?: string, _lastTickTime?: number): Promise<void> {},
  async deleteMeta(_uuid: string): Promise<void> {},
  async getParsingMetas(): Promise<ReplayMeta[]> {
    return [];
  },
  async getAllTeamNames(): Promise<string[]> {
    return [];
  },
  async getAllPlayerNames(): Promise<string[]> {
    return [];
  },
};

// ========== IndexedDB Replay Round Storage (pb binary, gzipped) ==========
// Round bytes are stored gzipped when written via encodeReplayRound (proto-converters).
// When loading, decodeReplayRound (proto-converters) decompresses then decodes; legacy uncompressed data is still supported.

export interface CleanupOrphanedResult {
  deleted: string[];
  count: number;
}

function roundKey(uuid: string, roundNum: number): string {
  return `${uuid}::${roundNum}`;
}

export class IndexedDBReplayStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<IDBDatabase> {
    this.db = await ensureDB();
    return this.db;
  }

  async saveRound(uuid: string, roundNum: number, roundBytes: Uint8Array): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    
    // Check cache limit before saving
    const maxCacheNum = this.getMaxCacheNum();
    const currentDemoCount = (await this.listAllReplays()).length;
    for (let i = 0; i < currentDemoCount - maxCacheNum + 1; i++) {
      await this.removeOldestDemo();
    }
    
    const key = roundKey(uuid, roundNum);
    const lastModified = Date.now();
    const value = { uuid, roundNum, bytes: roundBytes, lastModified };

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(ROUNDS_STORE, 'readwrite');
      const store = tx.objectStore(ROUNDS_STORE);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async loadRound(uuid: string, roundNum: number): Promise<Uint8Array | null> {
    if (!this.db) throw new Error('DB not initialized');
    const key = roundKey(uuid, roundNum);

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(ROUNDS_STORE, 'readonly');
      const store = tx.objectStore(ROUNDS_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const row = req.result;
        if (row?.bytes) {
          resolve(row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async listAllReplays(): Promise<string[]> {
    if (!this.db) throw new Error('DB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(ROUNDS_STORE, 'readonly');
      const store = tx.objectStore(ROUNDS_STORE);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        const keys = (req.result || []) as string[];
        const uuids = new Set<string>();
        keys.forEach((k) => {
          const m = String(k).match(/^(.+)::\d+$/);
          if (m) uuids.add(m[1]);
        });
        resolve(Array.from(uuids));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteReplay(uuid: string): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    const index = this.db.transaction(ROUNDS_STORE, 'readwrite').objectStore(ROUNDS_STORE).index('uuid');
    const req = index.openCursor(IDBKeyRange.only(uuid));
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteRound(uuid: string, roundNum: number): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    const key = roundKey(uuid, roundNum);
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(ROUNDS_STORE, 'readwrite');
      const store = tx.objectStore(ROUNDS_STORE);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async cleanupOrphanedReplays(maxSurge?: number): Promise<CleanupOrphanedResult> {
    const roundUuids = await this.listAllReplays();
    const metaStorage = await getMetaStorage();
    const metas = await metaStorage.loadAllMetas();
    if (metas.length === 0) {
      return { deleted: [], count: 0 };
    }
    const metaUuidSet = new Set(metas.map((m) => m.uuid));
    const orphaned = roundUuids.filter((uuid) => !metaUuidSet.has(uuid));
    const deleted: string[] = [];

    if (maxSurge != null && maxSurge >= 0) {
      if (orphaned.length <= maxSurge) {
        return { deleted, count: 0 };
      }
      const toRemove = orphaned.length - maxSurge;
      const withTime: { uuid: string; oldest: number }[] = await Promise.all(
        orphaned.map(async (uuid) => ({ uuid, oldest: await this.getReplayOldestTime(uuid) }))
      );
      withTime.sort((a, b) => a.oldest - b.oldest);
      const toDelete = withTime.slice(0, toRemove).map((x) => x.uuid);
      for (const uuid of toDelete) {
        try {
          await this.deleteReplay(uuid);
          deleted.push(uuid);
        } catch (e) {
          console.error(`[IndexedDB Rounds] Cleanup failed for ${uuid}:`, e);
        }
      }
    } else {
      for (const uuid of orphaned) {
        try {
          await this.deleteReplay(uuid);
          deleted.push(uuid);
        } catch (e) {
          console.error(`[IndexedDB Rounds] Cleanup failed for ${uuid}:`, e);
        }
      }
    }
    return { deleted, count: deleted.length };
  }

  private getMaxCacheNum(): number {
    // Try to get from localStorage, fallback to default
    try {
      const saved = localStorage.getItem('maxDemoCacheNum');
      if (saved !== null) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= 0) {
          return n;
        }
      }
    } catch (e) {
      console.warn('[IndexedDB] Failed to read maxDemoCacheNum from localStorage:', e);
    }
    return MAX_DEMO_CACHE_NUM_DEFAULT;
  }

  private async removeOldestDemo(): Promise<void> {
    const demoUuids = await this.listAllReplays();
    if (demoUuids.length === 0) return;

    // Get the oldest demo (by last modified time)
    const demoAges = await Promise.all(
      demoUuids.map(async (uuid) => ({
        uuid,
        oldestTime: await this.getReplayOldestTime(uuid)
      }))
    );

    // Sort by oldest time (ascending)
    demoAges.sort((a, b) => a.oldestTime - b.oldestTime);
    
    // Remove the oldest demo
    const oldestUuid = demoAges[0].uuid;
    console.log(`[IndexedDB] Cache limit reached, removing oldest demo: ${oldestUuid}`);
    await this.deleteReplay(oldestUuid);
  }

  private async getReplayOldestTime(uuid: string): Promise<number> {
    if (!this.db) return Infinity;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(ROUNDS_STORE, 'readonly');
      const store = tx.objectStore(ROUNDS_STORE);
      const index = store.index('uuid');
      const req = index.openCursor(IDBKeyRange.only(uuid));
      let minTime = Infinity;
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const row = cursor.value;
          if (row?.lastModified != null && row.lastModified < minTime) {
            minTime = row.lastModified;
          }
          cursor.continue();
        } else {
          resolve(minTime);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async debugListAllFiles(): Promise<{ uuid: string; files: string[] }[]> {
    if (!this.db) throw new Error('DB not initialized');
    const tx = this.db.transaction(ROUNDS_STORE, 'readonly');
    const store = tx.objectStore(ROUNDS_STORE);
    const req = store.openCursor();
    const byUuid = new Map<string, string[]>();

    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const key = cursor.key as string;
          const m = String(key).match(/^(.+)::(\d+)$/);
          if (m) {
            const [, uuid, rn] = m;
            const list = byUuid.get(uuid) ?? [];
            const row = cursor.value as { bytes?: ArrayBuffer | Uint8Array };
            const size = row?.bytes?.byteLength ?? 0;
            list.push(`round_${rn}.pb (${size} bytes)`);
            byUuid.set(uuid, list);
          }
          cursor.continue();
        } else {
          resolve(
            Array.from(byUuid.entries()).map(([uuid, files]) => ({ uuid, files: files.sort() }))
          );
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async debugDownloadFile(uuid: string, fileName: string): Promise<void> {
    const m = fileName.match(/^round_(\d+)\.pb$/);
    if (!m) throw new Error(`Invalid file name: ${fileName}`);
    const roundNum = parseInt(m[1], 10);
    const bytes = await this.loadRound(uuid, roundNum);
    if (!bytes) throw new Error(`Round ${roundNum} not found for ${uuid}`);
    const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${uuid}_${fileName}`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Replay storage singleton (IndexedDB-based, replaces OPFS for pb)
let replayStorageInstance: IndexedDBReplayStorage | null = null;
let replayInitPromise: Promise<IndexedDBReplayStorage> | null = null;

export async function getReplayStorage(): Promise<IndexedDBReplayStorage> {
  if (replayStorageInstance) return replayStorageInstance;
  if (replayInitPromise) return replayInitPromise;
  replayInitPromise = (async () => {
    await ensureDB();
    const instance = new IndexedDBReplayStorage();
    await instance.init();
    replayStorageInstance = instance;
    return instance;
  })();
  return replayInitPromise;
}

/** Cleanup round data with no meta in IndexedDB. */
export async function cleanupOrphanedReplayStorage(maxSurge?: number): Promise<CleanupOrphanedResult> {
  const storage = await getReplayStorage();
  return storage.cleanupOrphanedReplays(maxSurge);
}

export async function getMetaStorage(): Promise<typeof IndexedDBMetaStorage> {
  await ensureDB();
  return IndexedDBMetaStorage;
}

// Debug utilities for console (window.debugOPFS for backward compat)
async function debugListReplayFiles() {
  const storage = await getReplayStorage();
  const files = await storage.debugListAllFiles();
  console.log('📁 Replay Round Files (IndexedDB):');
  console.log('='.repeat(60));
  if (files.length === 0) {
    console.log('❌ No replay rounds found');
  } else {
    files.forEach(({ uuid, files: list }) => {
      console.log(`\n📦 UUID: ${uuid}`);
      list.forEach((f) => console.log(`  📄 ${f}`));
    });
    console.log('\n' + '='.repeat(60));
    console.log(`Total: ${files.length} replay(s)`);
  }
  return files;
}

async function debugDownloadReplayFile(uuid: string, fileName: string) {
  const storage = await getReplayStorage();
  await storage.debugDownloadFile(uuid, fileName);
  console.log(`✅ Downloaded: ${uuid}/${fileName}`);
}

async function debugGetStorageUsage() {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const usedMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
    const quotaMB = ((estimate.quota || 0) / (1024 * 1024)).toFixed(2);
    const pct = ((estimate.usage || 0) / (estimate.quota || 1) * 100).toFixed(2);
    console.log('💾 Storage:', `Used ${usedMB} MB`, `Quota ${quotaMB} MB`, `(${pct}%)`);
    return estimate;
  }
  return null;
}

if (typeof window !== 'undefined') {
  (window as any).debugOPFS = {
    listFiles: debugListReplayFiles,
    downloadFile: debugDownloadReplayFile,
    getStorageUsage: debugGetStorageUsage,
  };
}
