import type { ReplayMeta } from '../types/replay';
import { resolveTeamDisplayName } from './teamDisplay';

// Database schema
const DB_NAME = 'cs-demobox';
const DB_VERSION = 12; // v11→v12: remove unused cloud-archive store
const META_STORE = 'replay-meta';
const ROUNDS_STORE = 'replay-rounds';

export class IndexedDBMetaStorage {
  private db: IDBDatabase | null = null;

  isInitialized(): boolean {
    return this.db !== null;
  }

  getDb(): IDBDatabase | null {
    return this.db;
  }

  async init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create meta store with uuid as key
        if (!db.objectStoreNames.contains(META_STORE)) {
          const store = db.createObjectStore(META_STORE, { keyPath: 'uuid' });
          store.createIndex('uploadTime', 'uploadTime', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          console.log('[IndexedDB] Created meta store with indexes');
        }
        // v9: remove legacy tactic stores if present (cleanup leaked 战术本 data)
        if (db.objectStoreNames.contains('tactic-favorites')) {
          db.deleteObjectStore('tactic-favorites');
          console.log('[IndexedDB] Deleted legacy tactic-favorites store');
        }
        if (db.objectStoreNames.contains('tactic-tree')) {
          db.deleteObjectStore('tactic-tree');
          console.log('[IndexedDB] Deleted legacy tactic-tree store');
        }
        if (db.objectStoreNames.contains('cloud-archive')) {
          db.deleteObjectStore('cloud-archive');
          console.log('[IndexedDB] Deleted unused cloud-archive store');
        }
        if (!db.objectStoreNames.contains(ROUNDS_STORE)) {
          const roundsStore = db.createObjectStore(ROUNDS_STORE, { autoIncrement: false });
          roundsStore.createIndex('uuid', 'uuid', { unique: false });
          console.log('[IndexedDB] Created replay-rounds store');
        }
      };
    });
  }

  // Save meta to IndexedDB
  async saveMeta(meta: ReplayMeta): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    // Structured clone used by put() cannot clone Vue reactive proxies or other non-plain values.
    // Ensure a plain object so put() never fails with "could not be cloned".
    const plain = JSON.parse(JSON.stringify(meta)) as ReplayMeta;

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      const request = store.put(plain);

      request.onsuccess = () => {
        console.log(`[IndexedDB] Saved meta: ${plain.uuid.substring(0, 8)}, status=${plain.status}`);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Load single meta by UUID
  async loadMeta(uuid: string): Promise<ReplayMeta | null> {
    if (!this.db) throw new Error('DB not initialized');
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const request = store.get(uuid);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // Load all metas
  async loadAllMetas(): Promise<ReplayMeta[]> {
    if (!this.db) throw new Error('DB not initialized');
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Update meta status fields
  async updateMetaStatus(
    uuid: string, 
    status: number, 
    progress?: number, 
    statusText?: string,
    lastTickTime?: number
  ): Promise<void> {
    const meta = await this.loadMeta(uuid);
    if (!meta) throw new Error(`Meta not found: ${uuid}`);
    
    meta.status = status;
    if (progress !== undefined) meta.parsingProgress = progress;
    if (statusText !== undefined) meta.parsingStatus = statusText;
    if (lastTickTime !== undefined) meta.lastTickTime = lastTickTime;
    
    await this.saveMeta(meta);
  }

  // Delete meta
  async deleteMeta(uuid: string): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      const request = store.delete(uuid);
      
      request.onsuccess = () => {
        console.log(`[IndexedDB] Deleted meta: ${uuid.substring(0, 8)}`);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Query parsing metas (status = 0)
  async getParsingMetas(): Promise<ReplayMeta[]> {
    if (!this.db) throw new Error('DB not initialized');
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const index = store.index('status');
      const request = index.getAll(0); // status = 0 (parsing)
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Get all unique team names from both teamCT and teamT
  async getAllTeamNames(): Promise<string[]> {
    if (!this.db) throw new Error('DB not initialized');
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const metas = request.result || [];
        const teamNamesSet = new Set<string>();
        
        // Only include metas where fork is not true
        metas.filter((meta: ReplayMeta) => !meta.fork).forEach((meta: ReplayMeta) => {
          const ctName = resolveTeamDisplayName(meta.teamCT ?? '', 3, meta.serverPlayer);
          const tName = resolveTeamDisplayName(meta.teamT ?? '', 2, meta.serverPlayer);
          if (ctName !== '-') teamNamesSet.add(ctName);
          if (tName !== '-') teamNamesSet.add(tName);
        });
        
        // Convert to sorted array
        const teamNames = Array.from(teamNamesSet).sort((a, b) => 
          a.toLowerCase().localeCompare(b.toLowerCase())
        );
        
        resolve(teamNames);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Get all unique player names from serverPlayer
  async getAllPlayerNames(): Promise<string[]> {
    if (!this.db) throw new Error('DB not initialized');
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const metas = request.result || [];
        const playerNamesSet = new Set<string>();
        
        // Only include metas where fork is not true
        metas.filter((meta: ReplayMeta) => !meta.fork).forEach((meta: ReplayMeta) => {
          if (meta.serverPlayer && Array.isArray(meta.serverPlayer)) {
            meta.serverPlayer.forEach(player => {
              if (player.name && player.name.trim()) {
                playerNamesSet.add(player.name.trim());
              }
            });
          }
        });
        
        // Convert to sorted array
        const playerNames = Array.from(playerNamesSet).sort((a, b) => 
          a.toLowerCase().localeCompare(b.toLowerCase())
        );
        
        resolve(playerNames);
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// ========== IndexedDB Replay Round Storage (pb binary) ==========

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
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
    });
  }

  async saveRound(uuid: string, roundNum: number, roundBytes: Uint8Array): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
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
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
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
    await getMetaStorage();
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

// Singleton
let metaStorageInstance: IndexedDBMetaStorage | null = null;
let initPromise: Promise<IndexedDBMetaStorage> | null = null;

export async function getMetaStorage(): Promise<IndexedDBMetaStorage> {
  // If instance exists and is initialized, return it
  if (metaStorageInstance && metaStorageInstance.isInitialized()) {
    return metaStorageInstance;
  }
  
  // If initialization is in progress, wait for it
  if (initPromise) {
    return initPromise;
  }
  
  // Start new initialization
  initPromise = (async () => {
    try {
      metaStorageInstance = new IndexedDBMetaStorage();
      await metaStorageInstance.init();
      return metaStorageInstance;
    } catch (error) {
      console.error('[IndexedDB] Failed to initialize:', error);
      metaStorageInstance = null;
      initPromise = null;
      throw error;
    } finally {
      initPromise = null;
    }
  })();
  
  return initPromise;
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
