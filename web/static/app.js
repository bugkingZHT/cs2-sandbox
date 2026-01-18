(function() {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const playPauseBtn = document.getElementById('playPause');
  const statusEl = document.getElementById('status');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');
  const logOverlay = document.getElementById('logOverlay');
  const logContent = document.getElementById('logContent');
  const demoFileInput = document.getElementById('demoFile');
  const loadDemoBtn = document.getElementById('loadDemo');

  let replay = null;
  let frameIndex = 0;
  let playing = false;
  let timerId = null;
  let db = null;
  const DB_NAME = 'CS2ReplayDB';
  const STORE_NAME = 'replays';
  const CACHE_KEY = 'latest_replay';

  // Initialize IndexedDB
  function initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };
      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  // Save replay to IndexedDB
  function saveReplayToDB(jsonStr) {
    if (!db) return Promise.reject('DB not initialized');
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(jsonStr, CACHE_KEY);
      request.onsuccess = () => {
        console.log('Replay saved to IndexedDB, size:', (jsonStr.length / 1024 / 1024).toFixed(2), 'MB');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Load replay from IndexedDB
  function loadReplayFromDB() {
    if (!db) return Promise.reject('DB not initialized');
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(CACHE_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    drawCurrentFrame();
  }

  window.addEventListener('resize', resizeCanvas);

  function setReplayFromJSON(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      replay = data;
      frameIndex = 0;
      statusEl.textContent = 'Frames: ' + (replay.frames ? replay.frames.length : 0);
      updateProgress();
      resizeCanvas();
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Invalid replay JSON: ' + err.message;
    }
  }

  async function loadReplayFromStorage() {
    try {
      await initDB();
      const stored = await loadReplayFromDB();
      if (stored) {
        console.log('Loading cached replay from IndexedDB...');
        setReplayFromJSON(stored);
        if (replay && replay.frames) {
          statusEl.textContent = 'Loaded cached replay · Frames: ' + replay.frames.length;
        }
      } else {
        statusEl.textContent = 'No replay loaded. Choose a .dem file.';
      }
    } catch (err) {
      console.warn('Failed to load from IndexedDB:', err);
      statusEl.textContent = 'No replay loaded. Choose a .dem file.';
    }
  }

  function parseDemoFile(file) {
    if (!file) {
      statusEl.textContent = 'Please choose a .dem file first.';
      return;
    }
    if (typeof window.parseDemo !== 'function') {
      statusEl.textContent = 'WASM parser not ready yet.';
      return;
    }

    const originalConsoleLog = console.log;
    let logBuffer = [];
    
    // Intercept console.log to capture Go logs and JS logs
    console.log = function(...args) {
      const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
      logBuffer.push({
        msg,
        time: new Date().toLocaleTimeString()
      });
      originalConsoleLog.apply(console, args);
    };

    const flushLogs = () => {
      if (logBuffer.length === 0 || !logContent) return;
      
      const fragment = document.createDocumentFragment();
      logBuffer.forEach(item => {
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.textContent = `[${item.time}] ${item.msg}`;
        fragment.appendChild(div);
      });
      
      logContent.appendChild(fragment);
      logContent.scrollTop = logContent.scrollHeight;
      logBuffer = [];
    };

    let logInterval = null;

    const startLogging = () => {
      if (logOverlay) logOverlay.style.display = 'flex';
      if (logContent) logContent.innerHTML = '';
      logBuffer = [];
      logInterval = setInterval(flushLogs, 1000);
    };

    const stopLogging = (delay = 1000) => {
      setTimeout(() => {
        clearInterval(logInterval);
        flushLogs();
        if (logOverlay) logOverlay.style.display = 'none';
        // Restore console.log
        console.log = originalConsoleLog;
      }, delay);
    };

    startLogging();
    statusEl.textContent = 'Parsing ' + file.name + '···';
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      const bytes = new Uint8Array(buffer);
      console.log('File loaded into memory. Starting WASM parser...');
      
      const onStatus = (msg) => {
        statusEl.textContent = 'Parsing ' + file.name + ' · ' + msg;
        console.log(msg);
      };

      window.parseDemo(bytes, (jsonStr, err) => {
        if (err) {
          console.log('ERROR: ' + err);
          statusEl.textContent = 'Parse error: ' + err;
          stopLogging(3000);
          return;
        }
        
        // Save to IndexedDB
        saveReplayToDB(jsonStr).catch(saveErr => {
          console.warn('Failed to save to IndexedDB:', saveErr);
        });
        
        setReplayFromJSON(jsonStr);
        if (replay && replay.frames) {
          statusEl.textContent = 'Parsed ' + file.name + ' · Frames: ' + replay.frames.length + ' (cached)';
          console.log('Parse successful! Frames: ' + replay.frames.length);
        }

        stopLogging(1000);
      }, onStatus);
    };
    reader.onerror = () => {
      console.error(reader.error);
      statusEl.textContent = 'Failed to read file: ' + reader.error;
      stopLogging(1000);
    };
    reader.readAsArrayBuffer(file);
  }

  function updateProgress() {
    if (!replay || !replay.frames || replay.frames.length === 0 || !progressFill) {
      if (progressFill) {
        progressFill.style.width = '0%';
      }
      return;
    }
    const total = replay.frames.length;
    if (total <= 1) {
      progressFill.style.width = '0%';
      return;
    }
    const clampedIndex = Math.min(frameIndex, total - 1);
    const percent = (clampedIndex / (total - 1)) * 100;
    progressFill.style.width = percent + '%';
  }

  function drawCurrentFrame() {
    if (!replay || !replay.frames || replay.frames.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const frame = replay.frames[Math.min(frameIndex, replay.frames.length - 1)];

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Simple grid background
    ctx.save();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    const step = 64;
    for (let x = 0; x < canvas.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(canvas.width, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();

    if (!frame.players) return;

    // Draw smoke trajectories and blooms first (behind players)
    // COMMENTED OUT: Projectile/Smoke visualization
    /*
    if (frame.smokes && frame.smokes.length > 0) {
      for (const smoke of frame.smokes) {
        const smokeX = smoke.x * canvas.width;
        const smokeY = (1 - smoke.y) * canvas.height;
        
        // Draw trajectory with green color
        if (smoke.trajectory && smoke.trajectory.length > 1) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(50, 200, 50, 0.7)'; // Green trajectory
          ctx.lineWidth = 2;
          const firstPoint = smoke.trajectory[0];
          ctx.moveTo(firstPoint.x * canvas.width, (1 - firstPoint.y) * canvas.height);
          for (let i = 1; i < smoke.trajectory.length; i++) {
            const pt = smoke.trajectory[i];
            ctx.lineTo(pt.x * canvas.width, (1 - pt.y) * canvas.height);
          }
          ctx.stroke();
          
          // Draw small circle at throw start point
          ctx.beginPath();
          ctx.fillStyle = 'rgba(50, 200, 50, 0.8)';
          ctx.arc(firstPoint.x * canvas.width, (1 - firstPoint.y) * canvas.height, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        
        // Draw smoke bloom (circle with gradient-like effect)
        const smokeRadius = 28; // approximate smoke radius in screen pixels
        
        // Outer glow
        ctx.beginPath();
        ctx.fillStyle = 'rgba(200, 200, 200, 0.15)';
        ctx.arc(smokeX, smokeY, smokeRadius + 8, 0, Math.PI * 2);
        ctx.fill();
        
        // Main smoke body
        ctx.beginPath();
        ctx.fillStyle = 'rgba(200, 200, 200, 0.45)';
        ctx.arc(smokeX, smokeY, smokeRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner core (slightly denser)
        ctx.beginPath();
        ctx.fillStyle = 'rgba(220, 220, 220, 0.3)';
        ctx.arc(smokeX, smokeY, smokeRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        
        // Smoke border
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(220, 220, 220, 0.5)';
        ctx.lineWidth = 1;
        ctx.arc(smokeX, smokeY, smokeRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    */

    const radius = 6;
    ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (const p of frame.players) {
      const x = p.x * canvas.width;
      const y = (1 - p.y) * canvas.height; // invert Y so "up" is up

      let color = '#888';
      if (p.team === 2) {
        color = '#ff9933'; // T
      } else if (p.team === 3) {
        color = '#33aaff'; // CT
      }
      if (!p.alive) {
        color = '#555';
      }

      // player circle
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // view direction arrow (using yaw in degrees, if provided)
      if (typeof p.yaw === 'number') {
        const rad = (p.yaw * Math.PI) / 180;
        const dirX = Math.cos(rad);
        const dirY = -Math.sin(rad); // screen Y goes up when value decreases
        const len = radius * 2;
        ctx.beginPath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.moveTo(x, y);
        ctx.lineTo(x + dirX * len, y + dirY * len);
        ctx.stroke();
      }

      // player id and name label
      ctx.fillStyle = '#ffffff';
      let labelY = y + radius + 2;
      if (p.id != null) {
        ctx.fillText(String(p.id), x, labelY);
        labelY += 11; // move down for next line
      }
      if (p.name) {
        ctx.font = 'bold 9px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI"';
        ctx.fillText(p.name, x, labelY);
        ctx.font = '10px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI"'; // restore
      }
    }

    updateProgress();
  }

  function scheduleNextFrame() {
    if (!replay || !replay.frames || replay.frames.length === 0) return;
    if (!playing) return;

    const frames = replay.frames;
    const current = frames[frameIndex];
    const next = frames[Math.min(frameIndex + 1, frames.length - 1)];
    let delay = 50; // fallback
    if (next.timeMs != null && current.timeMs != null) {
      const dt = next.timeMs - current.timeMs;
      if (dt > 0) {
        delay = Math.min(Math.max(dt, 16), 200); // clamp between ~60 FPS and 5 FPS
      }
    }

    timerId = setTimeout(() => {
      if (frameIndex >= frames.length - 1) {
        playing = false;
        playPauseBtn.textContent = 'Play';
        statusEl.textContent = 'Finished replay · Frames: ' + frames.length;
        updateProgress();
        return;
      }
      frameIndex++;
      drawCurrentFrame();
      scheduleNextFrame();
    }, delay);
  }

  function togglePlayPause() {
    if (!replay || !replay.frames || replay.frames.length === 0) return;

    if (playing) {
      playing = false;
      playPauseBtn.textContent = 'Play';
      statusEl.textContent = 'Paused at frame ' + frameIndex + ' / ' + replay.frames.length;
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
    } else {
      if (frameIndex >= replay.frames.length - 1) {
        frameIndex = 0;
      }
      playing = true;
      playPauseBtn.textContent = 'Pause';
      statusEl.textContent = 'Playing···';
      drawCurrentFrame();
      scheduleNextFrame();
    }
  }

  playPauseBtn.addEventListener('click', togglePlayPause);

  if (loadDemoBtn) {
    loadDemoBtn.addEventListener('click', () => {
      const file = demoFileInput && demoFileInput.files ? demoFileInput.files[0] : null;
      parseDemoFile(file);
    });
  }

  if (logOverlay) {
    // Optional: add a close button logic if header had one, but user said "完成后关掉"
  }

  if (progressBar) {
    progressBar.addEventListener('click', (e) => {
      if (!replay || !replay.frames || replay.frames.length === 0) return;
      const rect = progressBar.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const total = replay.frames.length;
      const idx = Math.max(0, Math.min(total - 1, Math.round(ratio * (total - 1))));
      frameIndex = idx;
      drawCurrentFrame();
      if (!playing) {
        statusEl.textContent = 'Seek to frame ' + frameIndex + ' / ' + total;
      }
    });
  }

  loadReplayFromStorage();
})();
