/**
 * 使用浏览器原生 getDisplayMedia 录制当前标签页
 * 输出 MP4 格式（Safari 原生支持，Chrome 等通过 ffmpeg.wasm 转换）
 */
import { ref } from 'vue';

const OUTPUT_MIME = 'video/mp4';
const OUTPUT_EXT = '.mp4';

/** 预加载的 FFmpeg 实例，录制开始时后台加载，停止时可直接使用 */
let ffmpegLoadPromise: Promise<{ ffmpeg: import('@ffmpeg/ffmpeg').FFmpeg; fetchFile: (f: Blob) => Promise<Uint8Array> }> | null = null;

async function getFFmpeg() {
  if (ffmpegLoadPromise) return ffmpegLoadPromise;
  const baseURL = '/vedio';
  ffmpegLoadPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { fetchFile } = await import('@ffmpeg/util');
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    });
    console.log('[webmToMp4] FFmpeg 预加载完成');
    return { ffmpeg, fetchFile };
  })();
  return ffmpegLoadPromise;
}

/** 录制开始时调用，后台预加载 FFmpeg */
function preloadFFmpeg() {
  if (!ffmpegLoadPromise) {
    console.log('[webmToMp4] 录制中，后台预加载 FFmpeg...');
    getFFmpeg().catch((e) => console.warn('[webmToMp4] 预加载失败:', e));
  }
}

async function webmToMp4(webmBlob: Blob, onProgress?: (p: number) => void): Promise<Blob> {
  const { ffmpeg, fetchFile } = await getFFmpeg();
  if (onProgress) {
    ffmpeg.on('progress', ({ progress }: { progress: number }) => {
      onProgress(Math.round(Math.min(1, Math.max(0, progress)) * 100));
    });
  }
  const inputData = await fetchFile(webmBlob);
  await ffmpeg.writeFile('input.webm', inputData);

  // 保持清晰度 + 最快编码 + 完全忽略音频：原分辨率，mpeg4 最快
  const commands: { name: string; args: string[] }[] = [
    { name: 'mpeg4 原分辨率 高画质', args: ['-i', 'input.webm', '-map', '0:v:0', '-c:v', 'mpeg4', '-q:v', '3', '-an', 'output.mp4'] },
    { name: 'libx264 ultrafast 原分辨率', args: ['-i', 'input.webm', '-map', '0:v:0', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-an', '-movflags', '+faststart', 'output.mp4'] },
    { name: '默认编码器', args: ['-i', 'input.webm', '-map', '0:v:0', '-an', 'output.mp4'] },
  ];

  console.log('[webmToMp4] 开始转换（原分辨率 无音频）：mpeg4 → libx264 ultrafast → 默认');

  let lastErr: Error | null = null;
  for (let i = 0; i < commands.length; i++) {
    const { name, args } = commands[i];
    console.log(`[webmToMp4] 尝试 ${i + 1}/${commands.length}: ${name}`);
    try {
      await ffmpeg.exec(args);
      const data = await ffmpeg.readFile('output.mp4');
      await ffmpeg.deleteFile('input.webm');
      await ffmpeg.deleteFile('output.mp4');
      const buf = data instanceof Uint8Array ? data : new Uint8Array(0);
      if (buf.length === 0) throw new Error('FFmpeg produced empty output');
      console.log(`[webmToMp4] 转换成功，使用: ${name}`);
      return new Blob([new Uint8Array(buf)], { type: 'video/mp4' });
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      console.warn(`[webmToMp4] ${name} 失败:`, e);
      try {
        await ffmpeg.deleteFile('output.mp4');
      } catch {
        /* ignore */
      }
    }
  }
  console.error('[webmToMp4] 所有编码方式均失败', lastErr);
  throw lastErr ?? new Error('MP4 conversion failed');
}

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
        if (mimeType === OUTPUT_MIME) {
          const url = URL.createObjectURL(blob);
          pendingDownload.value = {
            url,
            filename: `snowbo-recording-${Date.now()}${OUTPUT_EXT}`,
            blob,
          };
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          return;
        }
        isConverting.value = true;
        convertingProgress.value = 0;
        try {
          const mp4Blob = await webmToMp4(blob, (p) => { convertingProgress.value = p; });
          lastError.value = null;
          const url = URL.createObjectURL(mp4Blob);
          pendingDownload.value = {
            url,
            filename: `snowbo-recording-${Date.now()}${OUTPUT_EXT}`,
            blob: mp4Blob,
          };
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (e) {
          console.error('[webmToMp4] MP4 转换失败，将提供 WebM 格式:', e);
          lastError.value = 'MP4 转换失败，已提供 WebM 格式';
          const url = URL.createObjectURL(blob);
          pendingDownload.value = {
            url,
            filename: `snowbo-recording-${Date.now()}.webm`,
            blob,
          };
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } finally {
          isConverting.value = false;
          convertingProgress.value = 0;
        }
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
      preloadFFmpeg(); // 录制期间后台预加载 FFmpeg，停止时可直接转码
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
