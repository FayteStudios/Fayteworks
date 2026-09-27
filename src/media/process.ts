import {
  ALL_FORMATS,
  AudioSample,
  BlobSource,
  BufferTarget,
  canEncodeAudio,
  Conversion,
  Input,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  WavOutputFormat,
  WebMOutputFormat
} from "mediabunny";

export type MediaKind = "video" | "audio";
export type VideoFormat = "mp4" | "webm";
export type AudioFormat = "m4a" | "ogg" | "wav";

export interface MediaEdit {
  start: number;
  end: number;
  aspect: "" | "16:9" | "1:1" | "9:16" | "4:5" | "4:3";
  maxSide: number;
  quality: "high" | "medium" | "low";
  mute: boolean;
  fadeIn: number;
  fadeOut: number;
  format: VideoFormat | AudioFormat;
}

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  hasVideo: boolean;
}

export async function mediaInfo(blob: Blob): Promise<MediaInfo> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  return {
    duration: await input.computeDuration(),
    width: video ? video.displayWidth : 0,
    height: video ? video.displayHeight : 0,
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video)
  };
}

export async function defaultAudioFormat(): Promise<AudioFormat> {
  return (await canEncodeAudio("aac")) ? "m4a" : "ogg";
}

const QUALITY = { high: QUALITY_HIGH, medium: QUALITY_MEDIUM, low: QUALITY_LOW };

function cropFor(aspect: MediaEdit["aspect"], width: number, height: number) {
  if (!aspect || !width || !height) return undefined;
  const [a, b] = aspect.split(":").map(Number);
  const target = a / b;
  const current = width / height;
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  if (Math.abs(current - target) < 0.01) return undefined;
  if (current > target) {
    const w = even(height * target);
    return { left: even((width - w) / 2), top: 0, width: w, height: even(height) };
  }
  const h = even(width / target);
  return { left: 0, top: even((height - h) / 2), width: even(width), height: h };
}

function fader(edit: MediaEdit) {
  const length = edit.end - edit.start;
  if (!(edit.fadeIn > 0) && !(edit.fadeOut > 0)) return undefined;
  let origin: number | null = null;
  return (sample: AudioSample) => {
    origin ??= sample.timestamp;
    const t0 = sample.timestamp - origin;
    const frames = sample.numberOfFrames;
    const channels = sample.numberOfChannels;
    const rate = sample.sampleRate;
    const data = new Float32Array(frames * channels);
    for (let c = 0; c < channels; c++) {
      const plane = data.subarray(c * frames, (c + 1) * frames);
      sample.copyTo(plane, { planeIndex: c, format: "f32-planar" });
      for (let i = 0; i < frames; i++) {
        const t = t0 + i / rate;
        let gain = 1;
        if (edit.fadeIn > 0 && t < edit.fadeIn) gain *= t / edit.fadeIn;
        if (edit.fadeOut > 0 && t > length - edit.fadeOut) gain *= Math.max(0, (length - t) / edit.fadeOut);
        plane[i] *= gain;
      }
    }
    const out = new AudioSample({ data, format: "f32-planar", numberOfChannels: channels, sampleRate: rate, timestamp: sample.timestamp });
    sample.close();
    return out;
  };
}

export async function processMedia(blob: Blob, kind: MediaKind, edit: MediaEdit, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Blob> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  const video = await input.getPrimaryVideoTrack();
  const format =
    edit.format === "webm" ? new WebMOutputFormat() : edit.format === "ogg" ? new OggOutputFormat() : edit.format === "wav" ? new WavOutputFormat() : new Mp4OutputFormat({ fastStart: "in-memory" });
  const output = new Output({ format, target: new BufferTarget() });
  const crop = video ? cropFor(edit.aspect, video.displayWidth, video.displayHeight) : undefined;
  const w = crop?.width ?? video?.displayWidth ?? 0;
  const h = crop?.height ?? video?.displayHeight ?? 0;
  const shrink = edit.maxSide > 0 && Math.max(w, h) > edit.maxSide ? edit.maxSide / Math.max(w, h) : 1;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const conversion = await Conversion.init({
    input,
    output,
    trim: { start: edit.start, end: edit.end },
    video:
      kind === "video"
        ? {
            crop,
            width: shrink < 1 ? even(w * shrink) : undefined,
            height: shrink < 1 ? even(h * shrink) : undefined,
            fit: shrink < 1 ? "fill" : undefined,
            codec: edit.format === "webm" ? "vp9" : "avc",
            bitrate: QUALITY[edit.quality],
            forceTranscode: Boolean(crop) || shrink < 1
          }
        : { discard: true },
    audio: edit.mute
      ? { discard: true }
      : {
          codec: edit.format === "webm" || edit.format === "ogg" ? "opus" : edit.format === "wav" ? "pcm-s16" : "aac",
          bitrate: edit.format === "wav" ? undefined : QUALITY[edit.quality],
          process: fader(edit),
          forceTranscode: Boolean(edit.fadeIn || edit.fadeOut)
        }
  });
  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks.map((t) => t.reason).join(", ");
    throw new Error(`This file can't be converted here${reasons ? ` (${reasons})` : ""}.`);
  }
  if (onProgress) conversion.onProgress = (p) => onProgress(p);
  signal?.addEventListener("abort", () => void conversion.cancel());
  await conversion.execute();
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error("Nothing came out of the conversion.");
  const type = { mp4: "video/mp4", webm: "video/webm", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav" }[edit.format];
  return new Blob([buffer], { type });
}

export async function frameAt(src: string, time: number): Promise<Blob> {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = src;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("The video couldn't be read."));
  });
  video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05));
  await new Promise<void>((resolve) => (video.onseeked = () => resolve()));
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No frame."))), "image/png"));
}
