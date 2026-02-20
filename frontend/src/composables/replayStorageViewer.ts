import { getReplayStorage } from '@/composables/indexdb-storage';

/**
 * Show replay round storage details (IndexedDB) in a new browser window
 */
export async function showReplayStorageDetails() {
  try {
    const storage = await getReplayStorage();
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

    if (platform.includes('mac') || userAgent.includes('mac os')) {
      os = 'macOS';
      const match = userAgent.match(/mac os x (\d+[._]\d+([._]\d+)?)/i);
      if (match) {
        osVersion = match[1].replace(/_/g, '.');
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
    } else if (platform.includes('linux') || userAgent.includes('linux')) {
      os = 'Linux';
    }

    // Build HTML using template literal
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Replay Storage Details - CS Demo Viewer</title>
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
  </style>
</head>
<body>
  <div class="container">
    <h1>🗂️ Replay Round Storage</h1>
    <p class="subtitle">CS2 Demo Viewer - IndexedDB (pb binary)</p>
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
    <div class="storage-path">
      <h3>Browser</h3>
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
    </div>
    <div class="file-list">
      <h3>📁 Round Data (IndexedDB)</h3>
      ${files.length === 0 ? `
        <p class="empty-state">❌ No replay rounds found</p>
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
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.addEventListener('load', () => URL.revokeObjectURL(url));
    }
  } catch (error) {
    console.error('[ReplayStorage] Failed to show storage details:', error);
    alert('Failed to load storage details. See console for details.');
  }
}
