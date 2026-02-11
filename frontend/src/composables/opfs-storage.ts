/**
 * OPFS Storage Layer for Binary Replay Data
 * 
 * File Structure:
 * /replays/
 *   /{uuid}/
 *     round_1.pb      - Round 1 frames protobuf
 *     round_2.pb      - Round 2 frames protobuf
 *     ...
 * 
 * Note: Meta data is now stored in IndexedDB, not in OPFS
 */

import { getMetaStorage } from './indexdb-storage';

export interface CleanupOrphanedResult {
  /** UUIDs of deleted replay directories */
  deleted: string[];
  /** Number of deleted directories */
  count: number;
}

export class OPFSReplayStorage {
  private root: FileSystemDirectoryHandle | null = null;

  async init() {
    // OPFS (navigator.storage.getDirectory) is only available in secure contexts:
    // https:// or localhost. Deployed HTTP sites will fail here.
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      throw new Error(
        'OPFS requires a secure context. Please use HTTPS or localhost. ' +
          'Current origin is not secure (e.g. http:// over the network).'
      );
    }
    if (!('storage' in navigator) || !('getDirectory' in (navigator.storage as any))) {
      throw new Error(
        'OPFS not available. Needs: (1) Secure context (HTTPS or localhost), and ' +
          '(2) Chrome 86+, Safari 15.2+, or Firefox 111+. Check that the site is loaded over HTTPS.'
      );
    }
    this.root = await navigator.storage.getDirectory();
  }

  // Meta storage methods removed - use IndexedDB (indexdb-storage.ts) instead

  async saveRound(uuid: string, roundNum: number, roundBytes: Uint8Array): Promise<void> {
    console.log(`[OPFS] 💾 Saving round ${roundNum} for UUID: ${uuid}, size: ${roundBytes.byteLength} bytes`);
    const replayDir = await this.getReplayDir(uuid);
    const fileHandle = await replayDir.getFileHandle(`round_${roundNum}.pb`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(roundBytes as any);
    await writable.close();
    console.log(`[OPFS] ✅ Round ${roundNum} saved successfully`);
  }

  async loadRound(uuid: string, roundNum: number): Promise<Uint8Array | null> {
    try {
      console.log(`[OPFS] 📖 Loading round ${roundNum} for UUID: ${uuid}`);
      const replayDir = await this.getReplayDirForRead(uuid);
      const fileHandle = await replayDir.getFileHandle(`round_${roundNum}.pb`);
      const file = await fileHandle.getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      console.log(`[OPFS] ✅ Round ${roundNum} loaded, size: ${bytes.byteLength} bytes`);
      return bytes;
    } catch (e) {
      console.warn(`[OPFS] ⚠️ Round ${roundNum} not found for UUID: ${uuid}`);
      return null;
    }
  }

  async listAllReplays(): Promise<string[]> {
    const replaysDir = await this.getReplaysDir();
    const uuids: string[] = [];
    // TypeScript types for OPFS may not be complete, use any cast
    for await (const entry of (replaysDir as any).values()) {
      if (entry.kind === 'directory') {
        uuids.push(entry.name);
      }
    }
    return uuids;
  }

  async deleteReplay(uuid: string): Promise<void> {
    const replaysDir = await this.getReplaysDir();
    try {
      await replaysDir.removeEntry(uuid, { recursive: true });
      console.log(`[OPFS] ✅ Successfully deleted replay ${uuid}`);
    } catch (e: any) {
      // If file/directory doesn't exist, consider deletion successful
      if (e.name === 'NotFoundError') {
        console.warn(`[OPFS] ⚠️ Replay ${uuid} not found, treating as already deleted`);
        return;
      }
      console.error(`[OPFS] Failed to delete replay ${uuid}:`, e);
      throw e;
    }
  }

  /**
   * Remove OPFS replay directories that have no corresponding meta in IndexedDB
   * (e.g. parsing started but meta was never saved, or meta was deleted).
   * Also removes any legacy 战术本-related directories if present.
   */
  async cleanupOrphanedReplays(): Promise<CleanupOrphanedResult> {
    const opfsUuids = await this.listAllReplays();
    const metaStorage = await getMetaStorage();
    const metas = await metaStorage.loadAllMetas();
    const metaUuidSet = new Set(metas.map(m => m.uuid));
    const orphaned = opfsUuids.filter(uuid => !metaUuidSet.has(uuid));
    const deleted: string[] = [];
    for (const uuid of orphaned) {
      try {
        await this.deleteReplay(uuid);
        deleted.push(uuid);
      } catch (e) {
        console.error(`[OPFS] Cleanup failed for ${uuid}:`, e);
      }
    }
    await this.cleanupLegacyTacticDirs();
    return { deleted, count: deleted.length };
  }

  /**
   * Remove legacy 战术本-related directories from OPFS root if they exist
   * (cleans up leaked resources from removed feature).
   */
  async cleanupLegacyTacticDirs(): Promise<void> {
    if (!this.root) return;
    const legacyNames = ['tactics', 'tactic-favorites', 'tactic-tree'];
    for (const name of legacyNames) {
      try {
        await this.root.removeEntry(name, { recursive: true });
        console.log(`[OPFS] Removed legacy directory: ${name}`);
      } catch (_) {
        // NotFoundError or not a directory: ignore
      }
    }
  }

  private async getReplaysDir(): Promise<FileSystemDirectoryHandle> {
    if (!this.root) {
      throw new Error('OPFS not initialized. Call init() first.');
    }
    return await this.root.getDirectoryHandle('replays', { create: true });
  }

  private async getReplayDir(uuid: string): Promise<FileSystemDirectoryHandle> {
    const replaysDir = await this.getReplaysDir();
    return await replaysDir.getDirectoryHandle(uuid, { create: true });
  }

  /** 仅读取时使用：不 create，避免误建空目录导致 round 找不到 */
  private async getReplayDirForRead(uuid: string): Promise<FileSystemDirectoryHandle> {
    const replaysDir = await this.getReplaysDir();
    return await replaysDir.getDirectoryHandle(uuid);
  }

  // Debug helper: List all files in OPFS for inspection
  async debugListAllFiles(): Promise<{ uuid: string; files: string[] }[]> {
    const replaysDir = await this.getReplaysDir();
    const result: { uuid: string; files: string[] }[] = [];

    for await (const entry of (replaysDir as any).values()) {
      if (entry.kind === 'directory') {
        const files: string[] = [];
        const replayDir = await replaysDir.getDirectoryHandle(entry.name);
        
        for await (const fileEntry of (replayDir as any).values()) {
          if (fileEntry.kind === 'file') {
            const file = await fileEntry.getFile();
            files.push(`${fileEntry.name} (${file.size} bytes)`);
          }
        }
        
        result.push({ uuid: entry.name, files });
      }
    }

    return result;
  }

  // Debug helper: Download a specific pb file
  async debugDownloadFile(uuid: string, fileName: string): Promise<void> {
    const replayDir = await this.getReplayDir(uuid);
    const fileHandle = await replayDir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const blob = new Blob([await file.arrayBuffer()]);
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${uuid}_${fileName}`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log(`[OPFS Debug] Downloaded ${fileName} for UUID ${uuid}`);
  }
}

// Singleton instance; initPromise ensures concurrent callers all wait for init() before using
let storageInstance: OPFSReplayStorage | null = null;
let initPromise: Promise<OPFSReplayStorage> | null = null;

export async function getOPFSStorage(): Promise<OPFSReplayStorage> {
  if (!initPromise) {
    const instance = new OPFSReplayStorage();
    initPromise = instance.init().then(() => instance);
    storageInstance = instance;
  }
  return initPromise;
}

/** One-click cleanup: delete OPFS replay dirs that have no meta in IndexedDB. */
export async function cleanupOrphanedReplayStorage(): Promise<CleanupOrphanedResult> {
  const storage = await getOPFSStorage();
  return storage.cleanupOrphanedReplays();
}

// ========== Debug Helpers for Browser Console ==========

/**
 * List all OPFS files in the console
 * Usage in browser console:
 *   await window.debugOPFS.listFiles()
 */
export async function debugListOPFSFiles() {
  const storage = await getOPFSStorage();
  const files = await storage.debugListAllFiles();
  
  console.log('📁 OPFS File Structure:');
  console.log('='.repeat(60));
  
  if (files.length === 0) {
    console.log('❌ No files found in OPFS');
    return [];
  }
  
  files.forEach(({ uuid, files: fileList }) => {
    console.log(`\n📦 UUID: ${uuid}`);
    fileList.forEach(file => {
      console.log(`  📄 ${file}`);
    });
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${files.length} replay(s)`);
  
  return files;
}

/**
 * Download a specific pb file
 * Usage in browser console:
 *   await window.debugOPFS.downloadFile('uuid-here', 'meta.pb')
 *   await window.debugOPFS.downloadFile('uuid-here', 'round_1.pb')
 */
export async function debugDownloadOPFSFile(uuid: string, fileName: string) {
  const storage = await getOPFSStorage();
  await storage.debugDownloadFile(uuid, fileName);
  console.log(`✅ Downloaded: ${uuid}/${fileName}`);
}

/**
 * Get storage usage estimate
 * Usage in browser console:
 *   await window.debugOPFS.getStorageUsage()
 */
export async function debugGetStorageUsage() {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const usedMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
    const quotaMB = ((estimate.quota || 0) / (1024 * 1024)).toFixed(2);
    const usagePercent = ((estimate.usage || 0) / (estimate.quota || 1) * 100).toFixed(2);
    
    console.log('💾 Storage Usage:');
    console.log('='.repeat(60));
    console.log(`Used: ${usedMB} MB`);
    console.log(`Quota: ${quotaMB} MB`);
    console.log(`Usage: ${usagePercent}%`);
    console.log('='.repeat(60));
    
    return estimate;
  } else {
    console.warn('⚠️ Storage estimation API not available');
    return null;
  }
}

/**
 * Detect browser and OS, then show probable OPFS physical path
 * Usage in browser console:
 *   window.debugOPFS.showStoragePath()
 */
export function debugShowStoragePath() {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();
  
  // Detect browser and version
  let browser = 'Unknown';
  let browserVersion = 'Unknown';
  let profileHint = '';
  
  if (userAgent.includes('edg/')) {
    browser = 'Edge';
    const match = userAgent.match(/edg\/(\d+\.\d+\.\d+\.\d+)/);
    browserVersion = match ? match[1] : 'Unknown';
  } else if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
    browser = 'Chrome';
    const match = userAgent.match(/chrome\/(\d+\.\d+\.\d+\.\d+)/);
    browserVersion = match ? match[1] : 'Unknown';
  } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
    browser = 'Safari';
    const match = userAgent.match(/version\/(\d+\.\d+(\.\d+)?)/);
    browserVersion = match ? match[1] : 'Unknown';
  } else if (userAgent.includes('firefox')) {
    browser = 'Firefox';
    const match = userAgent.match(/firefox\/(\d+\.\d+(\.\d+)?)/);
    browserVersion = match ? match[1] : 'Unknown';
    profileHint = '/{profile-name}';
  }
  
  // Detect OS and version
  let os = 'Unknown';
  let osVersion = '';
  let basePath = '';
  
  if (platform.includes('mac') || userAgent.includes('mac os')) {
    os = 'macOS';
    const match = userAgent.match(/mac os x (\d+[._]\d+([._]\d+)?)/i);
    if (match) {
      osVersion = match[1].replace(/_/g, '.');
    }
    if (browser === 'Chrome') {
      basePath = '~/Library/Application Support/Google/Chrome/Default/File System/';
    } else if (browser === 'Edge') {
      basePath = '~/Library/Application Support/Microsoft Edge/Default/File System/';
    } else if (browser === 'Safari') {
      basePath = '~/Library/Safari/LocalStorage/';
    } else if (browser === 'Firefox') {
      basePath = `~/Library/Application Support/Firefox/Profiles${profileHint}/storage/default/{origin}/idb/`;
    }
  } else if (platform.includes('win') || userAgent.includes('windows')) {
    os = 'Windows';
    const match = userAgent.match(/windows nt (\d+\.\d+)/);
    if (match) {
      const ntVersion = match[1];
      const versionMap: Record<string, string> = {
        '10.0': '10/11',
        '6.3': '8.1',
        '6.2': '8',
        '6.1': '7',
      };
      osVersion = versionMap[ntVersion] || ntVersion;
    }
    if (browser === 'Chrome') {
      basePath = '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\File System\\';
    } else if (browser === 'Edge') {
      basePath = '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\File System\\';
    } else if (browser === 'Firefox') {
      basePath = `%APPDATA%\\Mozilla\\Firefox\\Profiles${profileHint}\\storage\\default\\{origin}\\idb\\`;
    }
  } else if (platform.includes('linux') || userAgent.includes('linux')) {
    os = 'Linux';
    // Linux version detection is complex, skip for now
    if (browser === 'Chrome') {
      basePath = '~/.config/google-chrome/Default/File System/';
    } else if (browser === 'Edge') {
      basePath = '~/.config/microsoft-edge/Default/File System/';
    } else if (browser === 'Firefox') {
      basePath = `~/.mozilla/firefox${profileHint}/storage/default/{origin}/idb/`;
    }
  }
  
  const origin = window.location.origin;
  const encodedOrigin = encodeURIComponent(origin).replace(/%/g, '');
  
  console.log('📍 OPFS Physical Storage Location (Estimated):');
  console.log('='.repeat(70));
  console.log(`Browser: ${browser} ${browserVersion}`);
  console.log(`OS: ${os}${osVersion ? ' ' + osVersion : ''}`);
  console.log(`Origin: ${origin}`);
  console.log(`User Agent: ${navigator.userAgent}`);
  console.log('');
  
  if (basePath) {
    console.log('Probable Path:');
    console.log(`  ${basePath}`);
    console.log('');
    
    if (browser === 'Firefox' && profileHint) {
      console.log('⚠️  Note: Replace {profile-name} with your actual Firefox profile.');
      console.log('   To find it: about:support → Profile Directory');
    }
    
    console.log('⚠️  WARNING:');
    console.log('   - This path is an ESTIMATION based on browser defaults');
    console.log('   - OPFS data is stored in indexed/encrypted format');
    console.log('   - Direct file access is NOT recommended');
    console.log('   - Use window.debugOPFS.downloadFile() instead!');
  } else {
    console.log('❌ Unable to determine storage path for this browser/OS combination');
  }
  
  console.log('='.repeat(70));
  
  return { browser, browserVersion, os, osVersion, basePath, origin };
}

// Export debug utilities to window for easy console access
if (typeof window !== 'undefined') {
  (window as any).debugOPFS = {
    listFiles: debugListOPFSFiles,
    downloadFile: debugDownloadOPFSFile,
    getStorageUsage: debugGetStorageUsage,
    showStoragePath: debugShowStoragePath,
  };
  
  console.log('🔧 OPFS Debug utilities loaded. Available commands:');
  console.log('  await window.debugOPFS.listFiles()          - List all pb files');
  console.log('  await window.debugOPFS.downloadFile(uuid, fileName) - Download specific file');
  console.log('  await window.debugOPFS.getStorageUsage()    - Show storage usage');
  console.log('  window.debugOPFS.showStoragePath()          - Show physical storage path');
}
