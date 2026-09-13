import { BlobSource, BufferTarget, Conversion, Input, MP4, WEBM, Mp4OutputFormat, Output } from 'mediabunny';

/** Produce a seekable H.264 MP4 with macroblock-aligned display and coded dimensions. */
export async function exportRecordingMp4(blob: Blob, onProgress: (percent: number) => void): Promise<Blob> {
  const input = new Input({ source: new BlobSource(blob), formats: [MP4, WEBM] });
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  let conversion: Conversion | undefined;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('录屏没有视频轨道');
    // Arbitrary browser window sizes can require H.264 crop metadata. Some hardware
    // playback paths expose the padding as green bars. Encode a fully initialized,
    // aligned frame instead, keeping the whole picture and its aspect ratio.
    const width = Math.ceil(track.displayWidth / 16) * 16;
    const height = Math.ceil(track.displayHeight / 16) * 16;
    conversion = await Conversion.init({
      input, output,
      video: { codec: 'avc', width, height, fit: 'contain' },
      audio: { discard: true }, // Screen capture currently records video only.
      showWarnings: false,
    });
    if (!conversion.isValid || conversion.discardedTracks.some(({ track }) => track.type === 'video')) {
      throw new Error('当前浏览器无法生成 H.264 视频');
    }
    conversion.onProgress = progress => onProgress(Math.round(progress * 100));
    await conversion.execute();
    if (!output.target.buffer?.byteLength) throw new Error('录屏文件为空');
    return new Blob([output.target.buffer], { type: 'video/mp4' });
  } catch (error) {
    await conversion?.cancel();
    throw error;
  } finally {
    input.dispose();
  }
}
