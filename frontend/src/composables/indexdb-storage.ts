import type { ReplayMeta } from '../types/replay';
import type { TacticFavorite } from '../types/tactics';

// Database schema
const DB_NAME = 'cs-demobox';
const DB_VERSION = 7; // + tactic-favorites store
const META_STORE = 'replay-meta';
const TACTIC_FAVORITES_STORE = 'tactic-favorites';

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
        // Create tactic-favorites store (v7)
        if (!db.objectStoreNames.contains(TACTIC_FAVORITES_STORE)) {
          const store = db.createObjectStore(TACTIC_FAVORITES_STORE, { keyPath: 'id' });
          store.createIndex('pageUrl', 'pageUrl', { unique: false });
          store.createIndex('mapName', 'mapName', { unique: false });
          console.log('[IndexedDB] Created tactic-favorites store with indexes');
        }
      };
    });
  }

  // Save meta to IndexedDB
  async saveMeta(meta: ReplayMeta): Promise<void> {
    if (!this.db) throw new Error('DB not initialized');
    
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      const request = store.put(meta);
      
      request.onsuccess = () => {
        console.log(`[IndexedDB] Saved meta: ${meta.uuid.substring(0, 8)}, status=${meta.status}`);
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
        
        metas.forEach((meta: ReplayMeta) => {
          if (meta.teamCT && meta.teamCT.trim()) {
            teamNamesSet.add(meta.teamCT.trim());
          }
          if (meta.teamT && meta.teamT.trim()) {
            teamNamesSet.add(meta.teamT.trim());
          }
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
        
        metas.forEach((meta: ReplayMeta) => {
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

/** Tactic favorites CRUD using same DB (tactic-favorites store). */
export class TacticFavoritesStorage {
  constructor(private db: IDBDatabase) {}

  async save(favorite: TacticFavorite): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(TACTIC_FAVORITES_STORE, 'readwrite');
      const store = tx.objectStore(TACTIC_FAVORITES_STORE);
      const request = store.put(favorite);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getByPageUrl(pageUrl: string): Promise<TacticFavorite[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(TACTIC_FAVORITES_STORE, 'readonly');
      const store = tx.objectStore(TACTIC_FAVORITES_STORE);
      const index = store.index('pageUrl');
      const request = index.getAll(pageUrl);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<TacticFavorite[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(TACTIC_FAVORITES_STORE, 'readonly');
      const store = tx.objectStore(TACTIC_FAVORITES_STORE);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(TACTIC_FAVORITES_STORE, 'readwrite');
      const store = tx.objectStore(TACTIC_FAVORITES_STORE);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
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

let tacticStorageInstance: TacticFavoritesStorage | null = null;

export async function getTacticFavoritesStorage(): Promise<TacticFavoritesStorage> {
  const meta = await getMetaStorage();
  const db = meta.getDb();
  if (!db) throw new Error('DB not initialized');
  if (!tacticStorageInstance) {
    tacticStorageInstance = new TacticFavoritesStorage(db);
  }
  return tacticStorageInstance;
}
