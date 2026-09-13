/** Native screen capture followed by local MP4 finalization (no server upload or WASM). */
import { getCurrentScope, onScopeDispose, ref } from 'vue';
import { createRecordingStream } from './recordingStream';

// A bare video/mp4 lets Chromium choose VP9, which many desktop editors cannot import.
const RECORDING_MIMES = [
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function useGetDisplayMediaRecorder() {
  const isRecording = ref(false);
  const isConverting = ref(false);
  const convertingProgress = ref(0);
  const lastError = ref<string | null>(null);
  const pendingDownload = ref<{ url: string; filename: string; blob: Blob } | null>(null);

  let mediaRecorder: MediaRecorder | null = null;
  let isRequestingPermission = false;
  let disposed = false;
  const isSupported = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined';

  async function startRecording() {
    if (disposed || isRequestingPermission || mediaRecorder || isConverting.value) return;
    if (!isSupported) {
      lastError.value = '当前浏览器不支持屏幕录制';
      return;
    }
    isRequestingPermission = true;
    lastError.value = null;
    let stream: MediaStream | null = null;
    let stopRecordingStream: (() => void) | undefined;
    try {
      const mimeType = RECORDING_MIMES.find(mime => MediaRecorder.isTypeSupported(mime));
      if (!mimeType) throw new Error('当前浏览器没有可用的录屏编码器');
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser', cursor: 'always' },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
      } as DisplayMediaStreamOptions);
      if (disposed) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const captureStream = stream;
      const recordingSurface = await createRecordingStream(captureStream);
      stopRecordingStream = recordingSurface.stop;
      if (disposed || captureStream.getVideoTracks().every(track => track.readyState === 'ended')) {
        recordingSurface.stop();
        captureStream.getTracks().forEach(track => track.stop());
        return;
      }
      const recorder = new MediaRecorder(recordingSurface.stream, { mimeType, videoBitsPerSecond: 6_000_000 });
      // Keep chunks and callbacks bound to this session until its final data event arrives.
      const chunks: Blob[] = [];
      mediaRecorder = recorder;
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => { lastError.value = '录屏中断，将尝试保存已录制的内容'; };
      recorder.onstop = async () => {
        isRecording.value = false;
        isConverting.value = true;
        convertingProgress.value = 0;
        recordingSurface.stop();
        captureStream.getTracks().forEach(track => track.stop());
        const raw = new Blob(chunks, { type: recorder.mimeType || mimeType });
        chunks.length = 0;
        try {
          if (disposed) return;
          if (!raw.size) throw new Error('没有录制到画面，请重新录制');
          let blob = raw;
          let extension = raw.type.startsWith('video/mp4') ? '.mp4' : '.webm';
          let original = false;
          try {
            const { exportRecordingMp4 } = await import('./recordingExport');
            blob = await exportRecordingMp4(raw, percent => { convertingProgress.value = percent; });
            extension = '.mp4';
          } catch (error) {
            original = true;
            lastError.value = `MP4 生成失败，已保留原始录屏供下载：${error instanceof Error ? error.message : '封装失败'}`;
          }
          if (disposed) return;
          clearPendingDownload();
          pendingDownload.value = {
            url: URL.createObjectURL(blob), blob,
            filename: `cs2-sandbox-recording-${Date.now()}${original ? '-original' : ''}${extension}`,
          };
        } catch (error) {
          lastError.value = error instanceof Error ? error.message : '生成录屏文件失败';
        } finally {
          mediaRecorder = null;
          isConverting.value = false;
        }
      };
      captureStream.getVideoTracks()[0]?.addEventListener('ended', stopRecording, { once: true });
      recorder.start(200);
      isRecording.value = true;
    } catch (error) {
      stopRecordingStream?.();
      stream?.getTracks().forEach(track => track.stop());
      mediaRecorder = null;
      isRecording.value = false;
      const message = error instanceof Error ? error.message : '启动失败';
      if (!/cancel|denied|abort/i.test(message)) lastError.value = message;
    } finally {
      isRequestingPermission = false;
    }
  }

  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    isRecording.value = false;
    isConverting.value = true;
    convertingProgress.value = 0;
    // stop() flushes the last dataavailable event before onstop.
    mediaRecorder.stop();
  }

  function clearPendingDownload() {
    if (!pendingDownload.value) return;
    URL.revokeObjectURL(pendingDownload.value.url);
    pendingDownload.value = null;
  }

  function downloadRecording() {
    const pending = pendingDownload.value;
    if (!pending) return;
    const anchor = document.createElement('a');
    anchor.href = pending.url;
    anchor.download = pending.filename;
    anchor.click();
    // Retain the URL until the user dismisses this download or leaves the replay.
  }

  if (getCurrentScope()) onScopeDispose(() => {
    disposed = true;
    stopRecording();
    clearPendingDownload();
  });

  return {
    isSupported, isRecording, isConverting, convertingProgress, lastError, pendingDownload,
    startRecording, stopRecording, clearPendingDownload, downloadRecording,
  };
}
