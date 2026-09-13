/** A fixed, fully painted recording surface avoids capture-size/decoder-padding mismatches. */
export async function createRecordingStream(source: MediaStream) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = source;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('无法创建录屏画布');
  let output: MediaStream | undefined;
  let stopped = false;
  let callbackId: number | undefined;
  const useVideoFrames = typeof video.requestVideoFrameCallback === 'function';
  const stop = () => {
    stopped = true;
    if (callbackId !== undefined) {
      if (useVideoFrames) video.cancelVideoFrameCallback(callbackId);
      else cancelAnimationFrame(callbackId);
    }
    output?.getTracks().forEach(track => track.stop());
    video.pause();
    video.srcObject = null;
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('等待录屏画面超时')), 10_000);
      const finish = (error?: Error) => {
        clearTimeout(timer);
        video.onloadeddata = null;
        video.onerror = null;
        if (error) reject(error); else resolve();
      };
      video.onloadeddata = () => finish();
      video.onerror = () => finish(new Error('无法读取录屏画面'));
      void video.play().catch(error => finish(error));
    });
    if (!video.videoWidth || !video.videoHeight) throw new Error('录屏画面尺寸无效');
    // At most 1920 × 1088 (1080p plus macroblock padding). Never crop source content.
    const scale = Math.min(1, 1920 / video.videoWidth, 1088 / video.videoHeight);
    canvas.width = Math.ceil(video.videoWidth * scale / 16) * 16;
    canvas.height = Math.ceil(video.videoHeight * scale / 16) * 16;
    const paint = () => {
      if (stopped) return;
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        const fit = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
        const width = video.videoWidth * fit;
        const height = video.videoHeight * fit;
        context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      }
      callbackId = useVideoFrames ? video.requestVideoFrameCallback(paint) : requestAnimationFrame(paint);
    };
    paint();
    output = canvas.captureStream(30);
    return { stream: output, stop };
  } catch (error) {
    stop();
    throw error;
  }
}
