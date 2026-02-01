import type { ReplayData } from '@/types/replay';

/**
 * Generate and display frame data in a new browser window
 */
export function showFrameData(currentFrame: any, currentFrameIndex: number, replayMeta?: ReplayData | null) {
  if (!currentFrame) {
    alert('No frame data available');
    return;
  }
  
  // Format frame data as JSON
  const frameData = JSON.stringify(currentFrame, null, 2);
  
  // Format meta data as JSON
  const metaData = replayMeta ? JSON.stringify({
    uuid: replayMeta.uuid,
    uploaderUid: replayMeta.uploaderUid,
    uploadTime: replayMeta.uploadTime,
    mapName: replayMeta.mapName,
    teamCT: replayMeta.teamCT,
    teamT: replayMeta.teamT,
    scoreCT: replayMeta.scoreCT,
    scoreT: replayMeta.scoreT,
    totalRounds: replayMeta.totalRounds,
    roundResults: replayMeta.roundResults,
    fileName: replayMeta.fileName,
  }, null, 2) : 'No meta data available';
  
  // Extract key statistics
  const playerCount = Object.keys(currentFrame.players || {}).length;
  const projectileCount = Object.keys(currentFrame.projectiles || {}).length;
  const killEventCount = Object.keys(currentFrame.killEvents || {}).length;
  const dataSize = new Blob([frameData]).size;
  
  // Build complete HTML document
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Frame ${currentFrameIndex} - Debug Data</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e0e0e0;
      padding: 40px 20px;
      line-height: 1.6;
      min-height: 100vh;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid rgba(78, 204, 163, 0.3);
    }
    
    .header h1 {
      font-size: 36px;
      color: #4ecca3;
      margin-bottom: 8px;
      font-weight: 700;
    }
    
    .header .subtitle {
      font-size: 14px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .action-bar {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-bottom: 30px;
    }
    
    .btn {
      padding: 10px 20px;
      background: rgba(78, 204, 163, 0.15);
      border: 1px solid rgba(78, 204, 163, 0.4);
      border-radius: 6px;
      color: #4ecca3;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .btn:hover {
      background: rgba(78, 204, 163, 0.25);
      border-color: rgba(78, 204, 163, 0.6);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(78, 204, 163, 0.3);
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .stat-card {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      transition: all 0.2s ease;
    }
    
    .stat-card:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(78, 204, 163, 0.3);
      transform: translateY(-4px);
    }
    
    .stat-label {
      font-size: 12px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: #4ecca3;
      font-variant-numeric: tabular-nums;
    }
    
    .data-container {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 30px;
    }
    
    .data-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid rgba(78, 204, 163, 0.2);
    }
    
    .data-header h3 {
      font-size: 20px;
      color: #ffffff;
      font-weight: 600;
    }
    
    .copy-hint {
      font-size: 12px;
      color: #888;
    }
    
    pre {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 20px;
      overflow-x: auto;
      font-family: 'Courier New', 'Consolas', monospace;
      font-size: 13px;
      line-height: 1.6;
      color: #e0e0e0;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    .info-banner {
      background: rgba(74, 171, 247, 0.1);
      border: 1px solid rgba(74, 171, 247, 0.3);
      border-left: 4px solid #4aabf7;
      border-radius: 8px;
      padding: 16px 20px;
      color: #bbb;
      font-size: 14px;
      line-height: 1.6;
      margin-top: 30px;
    }
    
    .info-banner strong {
      color: #4aabf7;
      font-weight: 600;
    }
    
    #toast {
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(78, 204, 163, 0.95);
      color: #1a1a2e;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      opacity: 0;
      transform: translateY(-20px);
      transition: all 0.3s ease;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 1000;
    }
    
    #toast.show {
      opacity: 1;
      transform: translateY(0);
    }
  </style>
</head>
<body>
  <div id="toast"></div>
  <div class="container">
    <div class="header">
      <h1>⚡ Frame ${currentFrameIndex} Debug Data</h1>
      <div class="subtitle">CS2 Demo Frame Inspector</div>
    </div>
    
    <div class="action-bar">
      <button class="btn" onclick="copyToClipboard()">
        <span>📋</span>
        <span>Copy All Data</span>
      </button>
      <button class="btn" onclick="downloadJSON()">
        <span>💾</span>
        <span>Download JSON</span>
      </button>
    </div>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Frame Index</div>
        <div class="stat-value">${currentFrameIndex}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Players</div>
        <div class="stat-value">${playerCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Projectiles</div>
        <div class="stat-value">${projectileCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Kill Events</div>
        <div class="stat-value">${killEventCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Frame Data Size</div>
        <div class="stat-value">${(dataSize / 1024).toFixed(1)} KB</div>
      </div>
    </div>
    
    <div class="data-container">
      <div class="data-header">
        <h3>📝 Frame Data</h3>
        <span class="copy-hint">Frame data information</span>
      </div>
      <pre id="frameData"></pre>
    </div>
    
    <div class="data-container" style="margin-top: 30px;">
      <div class="data-header">
        <h3>🎯 Meta Data</h3>
        <span class="copy-hint">Replay metadata information</span>
      </div>
      <pre id="metaData"></pre>
    </div>
    
    <div class="info-banner">
      <strong>💡 Tip:</strong> This data represents the game state at frame ${currentFrameIndex}. 
      You can use this for debugging rendering issues, analyzing player positions, or verifying projectile trajectories.
    </div>
  </div>
  
  <script>
    const frameDataRaw = ${JSON.stringify(frameData)};
    const metaDataRaw = ${JSON.stringify(metaData)};
    
    // Set text content safely
    document.getElementById('frameData').textContent = frameDataRaw;
    document.getElementById('metaData').textContent = metaDataRaw;
    
    function copyToClipboard() {
      const combined = 'FRAME DATA:\\n\\n' + frameDataRaw + '\\n\\n' + 'META DATA:\\n\\n' + metaDataRaw;
      navigator.clipboard.writeText(combined).then(() => {
        showToast();
      }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard. Please select and copy manually.');
      });
    }
    
    function downloadJSON() {
      const combined = {
        frameData: JSON.parse(frameDataRaw),
        metaData: JSON.parse(metaDataRaw)
      };
      const blob = new Blob([JSON.stringify(combined, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'frame_${currentFrameIndex}_debug_data.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Downloaded!');
    }
    
    function showToast(message) {
      message = message || '✅ Copied to clipboard!';
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2000);
    }
  </script>
</body>
</html>`;
  
  // Open in new window with data URL
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  
  // Clean up the object URL after window opens
  if (win) {
    win.addEventListener('load', () => {
      URL.revokeObjectURL(url);
    });
  }
}
