/**
 * 使用浏览器原生 getDisplayMedia 录制当前标签页
 * 保留浏览器原生录制格式（MP4 或 WebM），不加载 WASM 转码器。
 */
import { ref } from 'vue';

const OUTPUT_MIME = 'video/mp4';
const OUTPUT_EXT = '.mp4';

export function useGetDisplayMediaRecorder() {
  const isRecording = ref(false);
  const isConverting = ref(false);
  /** 转换进度 0-100，用于「正在生成录制文件」按钮的进度条 */
  const convertingProgress = ref(0);
  const lastError = ref<string | null>(null);
  /** 录制完成后的文件信息，供用户选择下载或复制 */
  const pendingDownload = ref<{ url: string; filename: string; blob: Blob } | null>(null);

  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];
  let stream: MediaStream | null = null;
  let isRequestingPermission = false;

  const isSupported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getDisplayMedia &&
    !!window.MediaRecorder;

  async function startRecording() {
    if (!isSupported) {
      lastError.value = '当前浏览器不支持屏幕录制';
      return;
    }
    if (isRequestingPermission || isRecording.value) return;
    isRequestingPermission = true;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          cursor: 'always',
        },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
      } as DisplayMediaStreamOptions);

      const mime = MediaRecorder.isTypeSupported(OUTPUT_MIME)
        ? OUTPUT_MIME
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm';
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 6_000_000, // 6 Mbps 保持清晰度
      });
      recordedChunks = [];

      const finalizeRecording = async () => {
        const rec = mediaRecorder;
        const mimeType = rec?.mimeType || 'video/webm';
        mediaRecorder = null;
        isRecording.value = false;
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
        const blob = new Blob(recordedChunks, { type: mimeType });
        recordedChunks = [];
        if (blob.size === 0) return;
        clearPendingDownload();
        const url = URL.createObjectURL(blob);
        pendingDownload.value = {
          url,
          filename: `cs2-sandbox-recording-${Date.now()}${mimeType.startsWith('video/mp4') ? '.mp4' : '.webm'}`,
          blob,
        };
      };

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        finalizeRecording();
      };
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (mediaRecorder?.state === 'recording') {
          mediaRecorder.requestData();
          mediaRecorder.stop();
        }
      });
      mediaRecorder.start(200); // 200ms 分片，减少开销
      isRecording.value = true;
      lastError.value = null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : '启动失败';
      const isCancel = /cancel|denied|abort/i.test(msg);
      if (!isCancel) {
        lastError.value = msg;
        console.error('[getDisplayMedia]', e);
      }
      // 用户取消或拒绝后不自动重试，等待用户再次点击
    } finally {
      isRequestingPermission = false;
    }
  }

  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    isRecording.value = false;
    mediaRecorder.requestData();
    mediaRecorder.stop();
  }

  function clearPendingDownload() {
    if (pendingDownload.value) {
      URL.revokeObjectURL(pendingDownload.value.url);
      pendingDownload.value = null;
    }
  }

  function downloadRecording() {
    const p = pendingDownload.value;
    if (!p?.blob) return;
    const url = URL.createObjectURL(p.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = p.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    isSupported,
    isRecording,
    isConverting,
    convertingProgress,
    lastError,
    pendingDownload,
    startRecording,
    stopRecording,
    clearPendingDownload,
    downloadRecording,
  };
}
