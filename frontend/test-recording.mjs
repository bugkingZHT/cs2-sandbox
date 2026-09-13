import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { Input, BufferSource, MP4 } from 'mediabunny';

const server = await createServer({
  configFile: 'vite.local.config.ts', appType: 'custom',
  server: { host: '127.0.0.1', port: 0 },
});
server.middlewares.use('/recording-test', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><title>Recording test</title><canvas width="640" height="360"></canvas><button id="start">Start</button><button id="stop">Stop</button><button id="download">Download</button><video muted controls></video>');
});
await server.listen();
const executablePath = process.env.CS_TEST_BROWSER || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true, args: [
    '--auto-select-tab-capture-source-by-title=Recording test',
    '--allow-http-screen-capture', '--autoplay-policy=no-user-gesture-required',
  ] });
  console.log(`Browser: ${browser.version()}`);
  const viewport = { width: Number(process.env.CS_TEST_WIDTH || 960), height: Number(process.env.CS_TEST_HEIGHT || 640) };
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/recording-test`);
  await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    const context = canvas.getContext('2d');
    setInterval(() => {
      context.fillStyle = '#164e63'; context.fillRect(0, 0, 640, 360);
      context.fillStyle = '#fbbf24'; context.fillRect((Date.now() / 4) % 500, 120, 80, 80);
      context.fillStyle = 'white'; context.font = '28px sans-serif'; context.fillText('MP4 recording test', 20, 50);
    }, 33);
    window.captureCount = 0;
    const capture = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = async options => {
      window.captureCount++;
      window.captureStream = await capture(options);
      return window.captureStream;
    };
    const { useGetDisplayMediaRecorder } = await import('/src/composables/useGetDisplayMediaRecorder.ts');
    window.recorder = useGetDisplayMediaRecorder();
    document.querySelector('#start').onclick = window.recorder.startRecording;
    document.querySelector('#stop').onclick = window.recorder.stopRecording;
    document.querySelector('#download').onclick = window.recorder.downloadRecording;
  });

  async function recordAndCheck(label, endFromBrowser = false, resize = false) {
    await page.click('#start');
    await page.waitForFunction(() => window.recorder.isRecording.value || window.recorder.lastError.value);
    assert.equal(await page.evaluate(() => window.recorder.lastError.value), null);
    const sourceSize = await page.evaluate(() => window.captureStream.getVideoTracks()[0].getSettings());
    await page.waitForTimeout(1100); // Record real moving frames with the browser's native encoder.
    if (resize) await page.setViewportSize({ width: 1017, height: 697 });
    await page.waitForTimeout(1100);
    await page.evaluate(async endFromBrowser => {
      if (endFromBrowser) {
        const track = window.captureStream.getVideoTracks()[0];
        track.stop();
        track.dispatchEvent(new Event('ended'));
      } else window.recorder.stopRecording();
      const captures = window.captureCount;
      await window.recorder.startRecording();
      if (window.captureCount !== captures) throw new Error('New capture started before finalization');
    }, endFromBrowser);
    await page.waitForFunction(() => !window.recorder.isConverting.value);
    assert.equal(await page.evaluate(() => window.recorder.lastError.value), null);
    assert.ok(await page.evaluate(() => window.captureStream.getTracks().every(track => track.readyState === 'ended')));
    const downloadEvent = page.waitForEvent('download');
    await page.click('#download');
    const download = await downloadEvent;
    assert.match(download.suggestedFilename(), /\.mp4$/);
    const bytes = Buffer.from(await page.evaluate(async () => [...new Uint8Array(await window.recorder.pendingDownload.value.blob.arrayBuffer())]));
    const boxes = [];
    for (let offset = 0; offset < bytes.length;) {
      const size32 = bytes.readUInt32BE(offset);
      const size = size32 === 1 ? Number(bytes.readBigUInt64BE(offset + 8)) : size32 || bytes.length - offset;
      assert.ok(size >= 8 && offset + size <= bytes.length);
      boxes.push(bytes.toString('ascii', offset + 4, offset + 8));
      offset += size;
    }
    assert.ok(!boxes.includes('moof'), 'MP4 must not be fragmented');
    assert.ok(boxes.indexOf('moov') < boxes.indexOf('mdat'), 'Fast Start index must precede video data');
    const input = new Input({ source: new BufferSource(bytes), formats: [MP4] });
    const track = await input.getPrimaryVideoTrack();
    assert.equal(track.codec, 'avc', 'MP4 must contain H.264, not default VP9');
    const scale = Math.min(1, 1920 / sourceSize.width, 1088 / sourceSize.height);
    assert.equal(track.displayWidth, Math.ceil(sourceSize.width * scale / 16) * 16, 'Output width stays fixed after capture resize');
    assert.equal(track.displayHeight, Math.ceil(sourceSize.height * scale / 16) * 16, 'Output height stays fixed after capture resize');
    assert.equal(track.displayWidth % 16, 0);
    assert.equal(track.displayHeight % 16, 0);
    assert.ok(track.displayWidth <= 1920 && track.displayHeight <= 1088);
    const outputSize = `${track.displayWidth}x${track.displayHeight}`;
    const duration = await input.computeDuration();
    assert.ok(duration > 1.5 && duration < 5, `Unexpected duration ${duration}`);
    input.dispose();
    const playback = await page.evaluate(async () => {
      const video = document.querySelector('video');
      const event = name => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Video ${name} timeout`)), 5000);
        video.addEventListener(name, () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      let ready = event('loadeddata');
      video.src = window.recorder.pendingDownload.value.url;
      await ready;
      const duration = video.duration;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      let maxGreenRowFraction = 0;
      for (let frame = 1; frame <= 10; frame++) {
        ready = event('seeked'); video.currentTime = duration * frame / 12; await ready;
        context.drawImage(video, 0, 0);
        const pixels = context.getImageData(0, canvas.height - 32, canvas.width, 32).data;
        for (let row = 0; row < 32; row++) {
          let green = 0;
          for (let col = 0; col < canvas.width; col++) {
            const i = (row * canvas.width + col) * 4;
            if (pixels[i + 1] > 60 && pixels[i + 1] > pixels[i] + 30 && pixels[i + 1] > pixels[i + 2] + 30) green++;
          }
          maxGreenRowFraction = Math.max(maxGreenRowFraction, green / canvas.width);
        }
      }
      for (const position of [0.8, 0.2]) {
        ready = event('seeked'); video.currentTime = duration * position; await ready;
      }
      await video.play();
      await new Promise(resolve => setTimeout(resolve, 150));
      video.pause();
      return { duration, width: video.videoWidth, maxGreenRowFraction, error: video.error?.message };
    });
    assert.ok(Number.isFinite(playback.duration) && playback.width > 0);
    assert.equal(playback.error, undefined);
    // Ignore isolated lossy-compression speckles; a horizontal corruption band affects a row.
    assert.ok(playback.maxGreenRowFraction < 0.01, `Green band in decoded bottom rows: ${playback.maxGreenRowFraction}`);
    if (process.env.CS_RECORDING_TEST_OUTPUT) {
      mkdirSync(process.env.CS_RECORDING_TEST_OUTPUT, { recursive: true });
      writeFileSync(resolve(process.env.CS_RECORDING_TEST_OUTPUT, `${label}.mp4`), bytes);
    }
    console.log(`PASS: ${label}: native tab capture, H.264 ${outputSize}, ${duration.toFixed(2)}s, ${boxes.join('/')}, clean frame edges, playback and bidirectional seeking`);
    await page.evaluate(() => window.recorder.clearPendingDownload());
  }
  await recordAndCheck('recording-first');
  await recordAndCheck('recording-second', true);
  await recordAndCheck('recording-resize', false, true);
  await page.setViewportSize(viewport);
  // Exercise the browser fallback with real VP9 recording and native H.264 transcoding.
  await page.evaluate(() => {
    const supported = MediaRecorder.isTypeSupported.bind(MediaRecorder);
    MediaRecorder.isTypeSupported = mime => !mime.startsWith('video/mp4') && supported(mime);
  });
  await recordAndCheck('recording-webm-fallback');

  await page.evaluate(() => {
    const NativeRecorder = MediaRecorder;
    window.MediaRecorder = class extends NativeRecorder {
      constructor() { throw new Error('Test encoder startup failure'); }
    };
  });
  await page.click('#start');
  await page.waitForFunction(() => window.recorder.lastError.value);
  assert.match(await page.evaluate(() => window.recorder.lastError.value), /Test encoder startup failure/);
  assert.ok(await page.evaluate(() => window.captureStream.getTracks().every(track => track.readyState === 'ended')));
  assert.equal(await page.evaluate(() => window.recorder.isRecording.value), false);
  console.log('PASS: encoder startup failure releases capture tracks');

  assert.ok(await page.evaluate(async () => {
    const { exportRecordingMp4 } = await import('/src/composables/recordingExport.ts');
    try { await exportRecordingMp4(new Blob(['broken MP4']), () => {}); return false; }
    catch { return true; }
  }), 'corrupt data must fail rather than produce a mislabeled MP4');
} finally {
  await browser?.close();
  await server.close();
}
