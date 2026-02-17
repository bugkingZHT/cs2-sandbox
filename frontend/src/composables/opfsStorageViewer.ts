import { getOPFSStorage } from '@/composables/opfs-storage';

/**
 * Show OPFS storage details in a new browser window
 */
export async function showOPFSStorageDetails() {
  try {
    const storage = await getOPFSStorage();
    const files = await storage.debugListAllFiles();
    
    // Get storage usage
    let storageUsed = 0;
    let storageQuota = 0;
    let storagePercent = 0;
    
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      storageUsed = (estimate.usage || 0) / (1024 * 1024);
      storageQuota = (estimate.quota || 0) / (1024 * 1024);
      storagePercent = ((estimate.usage || 0) / (estimate.quota || 1) * 100);
    }
    
    // Detect browser and OS
    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform.toLowerCase();
    
    let browser = 'Unknown';
    let browserVersion = 'Unknown';
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
    }
    
    let os = 'Unknown';
    let osVersion = '';
    let basePath = '';
    
    if (platform.includes('mac') || userAgent.includes('mac os')) {
      os = 'macOS';
      const match = userAgent.match(/mac os x (\d+[._]\d+([._]\d+)?)/i);
      if (match) {
        osVersion = match[1].replace(/_/g, '.');
      }
      if (browser === 'Chrome') basePath = '~/Library/Application Support/Google/Chrome/Default/File System/';
      else if (browser === 'Edge') basePath = '~/Library/Application Support/Microsoft Edge/Default/File System/';
      else if (browser === 'Safari') basePath = '~/Library/Safari/LocalStorage/';
      else if (browser === 'Firefox') basePath = '~/Library/Application Support/Firefox/Profiles/{profile}/storage/default/{origin}/idb/';
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
      if (browser === 'Chrome') basePath = '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\File System\\';
      else if (browser === 'Edge') basePath = '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\File System\\';
      else if (browser === 'Firefox') basePath = '%APPDATA%\\Mozilla\\Firefox\\Profiles\\{profile}\\storage\\default\\{origin}\\idb\\';
    } else if (platform.includes('linux') || userAgent.includes('linux')) {
      os = 'Linux';
      if (browser === 'Chrome') basePath = '~/.config/google-chrome/Default/File System/';
      else if (browser === 'Edge') basePath = '~/.config/microsoft-edge/Default/File System/';
      else if (browser === 'Firefox') basePath = '~/.mozilla/firefox/{profile}/storage/default/{origin}/idb/';
    }
    
    // Build HTML using template literal
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OPFS Storage Details - CS Demo Viewer</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      background: #0d1117;
      color: #e6edf3;
      padding: 40px 20px;
      line-height: 1.6;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    h1 {
      font-size: 32px;
      margin-bottom: 10px;
      color: #ffffff;
      text-align: center;
    }
    
    .subtitle {
      text-align: center;
      color: #888;
      margin-bottom: 40px;
      font-size: 14px;
    }
    
    h3 {
      font-size: 20px;
      margin-bottom: 15px;
      color: #ffffff;
      border-bottom: 2px solid #30363d;
      padding-bottom: 8px;
    }
    
    .storage-info,
    .storage-path,
    .file-list {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 30px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    .info-row:last-child {
      border-bottom: none;
    }
    
    .info-row.full-width {
      flex-direction: column;
      gap: 8px;
    }
    
    .label {
      font-weight: 600;
      color: #aaa;
    }
    
    .value {
      color: #4ecca3;
      font-weight: 500;
    }
    
    code {
      background: rgba(0, 0, 0, 0.3);
      padding: 4px 8px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      color: #ffa07a;
    }
    
    .path-value {
      display: block;
      word-break: break-all;
      padding: 12px;
      background: rgba(0, 0, 0, 0.4);
    }
    
    .warning {
      margin-top: 15px;
      padding: 12px;
      background: rgba(255, 165, 0, 0.1);
      border-left: 3px solid #ffa500;
      border-radius: 4px;
      font-size: 13px;
      color: #ffb84d;
    }
    
    .total-count {
      color: #e6edf3;
      margin-bottom: 20px;
      font-weight: 500;
    }
    
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #666;
      font-size: 16px;
    }
    
    .replay-item {
      margin-bottom: 25px;
      padding: 15px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      border-left: 3px solid #484f58;
    }
    
    .replay-uuid {
      font-weight: 600;
      margin-bottom: 10px;
      color: #fff;
    }
    
    .file-items {
      list-style: none;
      padding-left: 20px;
    }
    
    .file-items li {
      padding: 6px 0;
      color: #ccc;
      font-family: 'Courier New', monospace;
      font-size: 14px;
    }
    
    .console-hint {
      background: rgba(255, 193, 7, 0.1);
      border: 1px solid rgba(255, 193, 7, 0.3);
      border-radius: 8px;
      padding: 20px;
      margin-top: 30px;
    }
    
    .console-hint h4 {
      color: #ffc107;
      margin-bottom: 10px;
    }
    
    .console-hint code {
      display: block;
      margin: 8px 0;
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.4);
      color: #e6edf3;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🗂️ OPFS Storage Details</h1>
    <p class="subtitle">CS2 Demo Viewer - Protobuf Binary Storage</p>
    
    <div class="storage-info">
      <h3>💾 Storage Usage</h3>
      <div class="info-row">
        <span class="label">Used:</span>
        <span class="value">${storageUsed.toFixed(2)} MB</span>
      </div>
      <div class="info-row">
        <span class="label">Quota:</span>
        <span class="value">${storageQuota.toFixed(2)} MB</span>
      </div>
      <div class="info-row">
        <span class="label">Usage:</span>
        <span class="value">${storagePercent.toFixed(2)}%</span>
      </div>
    </div>
    
    ${basePath ? `
    <div class="storage-path">
      <h3>📍 Physical Storage Path (Estimated)</h3>
      <div class="info-row">
        <span class="label">Browser:</span>
        <span class="value">${browser} ${browserVersion}</span>
      </div>
      <div class="info-row">
        <span class="label">OS:</span>
        <span class="value">${os}${osVersion ? ' ' + osVersion : ''}</span>
      </div>
      <div class="info-row">
        <span class="label">User Agent:</span>
        <span class="value" style="font-size: 12px; word-break: break-all;">${navigator.userAgent}</span>
      </div>
      <div class="info-row full-width">
        <span class="label">Path:</span>
        <code class="path-value">${basePath}</code>
      </div>
      <div class="warning">
        ⚠️ This path is an estimation. OPFS data is stored in indexed/encrypted format.
      </div>
    </div>
    ` : ''}
    
    <div class="file-list">
      <h3>📁 OPFS File Structure</h3>
      ${files.length === 0 ? `
        <p class="empty-state">❌ No files found in OPFS</p>
      ` : `
        <p class="total-count">Total: ${files.length} replay(s)</p>
        ${files.map(({ uuid, files: fileList }: { uuid: string; files: string[] }) => `
          <div class="replay-item">
            <div class="replay-uuid">📦 UUID: <code>${uuid}</code></div>
            <ul class="file-items">
              ${fileList.map((file: string) => `<li>📄 ${file}</li>`).join('')}
            </ul>
          </div>
        `).join('')}
      `}
    </div>
    
    <div class="console-hint">
      <h4>💡 Console Commands for Advanced Debugging:</h4>
      <code>await window.debugOPFS.listFiles()</code>
      <code>await window.debugOPFS.downloadFile(uuid, 'meta.pb')</code>
      <code>await window.debugOPFS.downloadFile(uuid, 'round_1.pb')</code>
      <code>await window.debugOPFS.getStorageUsage()</code>
      <code>window.debugOPFS.showStoragePath()</code>
    </div>
  </div>
</body>
</html>`;
    
    // Open in new window
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    
    if (win) {
      win.addEventListener('load', () => {
        URL.revokeObjectURL(url);
      });
    }
  } catch (error) {
    console.error('[OPFS Debug] Failed to show storage details:', error);
    alert('Failed to load OPFS details. See console for details.');
  }
}
