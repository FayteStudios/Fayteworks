import { statesFromNames, type LooseFrame } from "./sprites";

export interface Decoded {
  kind: "sheet" | "frames";
  sheet?: Blob;
  frames?: LooseFrame[];
  states?: { name: string; frames: number[]; fps?: number }[];
  name: string;
}

const IMAGE = /\.(png|webp|gif|jpe?g|avif|bmp)$/i;

async function unzip(file: Blob): Promise<File[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("That ZIP file looks damaged.");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out: File[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(buf.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/") || name.includes("__MACOSX")) continue;
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = buf.subarray(dataStart, dataStart + size);
    let data: Uint8Array<ArrayBuffer>;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    else continue;
    const type = /\.png$/i.test(name) ? "image/png" : /\.gif$/i.test(name) ? "image/gif" : /\.webp$/i.test(name) ? "image/webp" : /\.jpe?g$/i.test(name) ? "image/jpeg" : /\.json$/i.test(name) ? "application/json" : "application/octet-stream";
    out.push(new File([data], name.split("/").pop() || name, { type }));
  }
  return out;
}

async function animatedFrames(file: Blob): Promise<LooseFrame[] | null> {
  const Decoder = (globalThis as unknown as { ImageDecoder?: new (init: { data: ReadableStream | ArrayBuffer; type: string }) => { tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null }; decode(o: { frameIndex: number }): Promise<{ image: VideoFrame }>; close(): void } }).ImageDecoder;
  if (!Decoder) return null;
  const decoder = new Decoder({ data: await file.arrayBuffer(), type: file.type });
  await decoder.tracks.ready;
  const count = decoder.tracks.selectedTrack?.frameCount ?? 1;
  if (count < 2) {
    decoder.close();
    return null;
  }
  const frames: LooseFrame[] = [];
  for (let i = 0; i < count; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    const bitmap = await createImageBitmap(image);
    image.close();
    frames.push({ image: bitmap, name: `frame ${i}` });
  }
  decoder.close();
  return frames;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function framesFromAtlas(json: Record<string, unknown>, image: Blob): Promise<{ frames: LooseFrame[]; states: { name: string; frames: number[]; fps?: number }[] }> {
  const bitmap = await createImageBitmap(image);
  const raw = json.frames as Record<string, { frame: Rect; duration?: number }> | { filename: string; frame: Rect; duration?: number }[];
  const list = Array.isArray(raw) ? raw.map((f) => ({ name: f.filename, frame: f.frame, duration: f.duration })) : Object.entries(raw).map(([name, f]) => ({ name, frame: f.frame, duration: f.duration }));
  const frames = await Promise.all(list.map(async (f) => ({ name: f.name, image: await createImageBitmap(bitmap, f.frame.x, f.frame.y, f.frame.w, f.frame.h) })));
  const tags = ((json.meta as { frameTags?: { name: string; from: number; to: number }[] } | undefined)?.frameTags ?? []).filter((t) => t.to >= t.from);
  const ms = list[0]?.duration;
  const fps = ms ? Math.round(1000 / ms) : undefined;
  const states = tags.length ? tags.map((t) => ({ name: t.name, frames: Array.from({ length: t.to - t.from + 1 }, (_, i) => t.from + i), fps })) : statesFromNames(list.map((f) => f.name)).map((s) => ({ ...s, fps }));
  return { frames, states };
}

export async function decodeSprites(files: File[]): Promise<Decoded> {
  let all = [...files];
  for (const zip of files.filter((f) => /\.zip$/i.test(f.name))) all = [...all.filter((f) => f !== zip), ...(await unzip(zip))];
  const jsons = all.filter((f) => /\.json$/i.test(f.name));
  const images = all.filter((f) => IMAGE.test(f.name) || f.type.startsWith("image/"));
  const base = (files[0]?.name ?? "Sprite").replace(/\.[a-z0-9]+$/i, "");
  const name = (files.length > 1 ? base.replace(/[\s_-]*\d+$/, "") || base : base).replace(/[-_]+/g, " ");
  for (const j of jsons) {
    const json = JSON.parse(await j.text()) as Record<string, unknown>;
    if (!json.frames) continue;
    const wanted = String((json.meta as { image?: string } | undefined)?.image ?? "");
    const image = images.find((i) => i.name === wanted.split("/").pop()) ?? images[0];
    if (!image) throw new Error(`The data file names a picture (${wanted}) that wasn't included.`);
    const { frames, states } = await framesFromAtlas(json, image);
    return { kind: "frames", frames, states, name };
  }
  if (images.length === 1) {
    const animated = /gif|webp/.test(images[0].type) ? await animatedFrames(images[0]).catch(() => null) : null;
    if (animated) return { kind: "frames", frames: animated, states: [{ name: "play", frames: animated.map((_, i) => i) }], name };
    return { kind: "sheet", sheet: images[0], name };
  }
  if (images.length > 1) {
    const sorted = [...images].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const frames = await Promise.all(sorted.map(async (f) => ({ name: f.name, image: await createImageBitmap(f) })));
    return { kind: "frames", frames, states: statesFromNames(sorted.map((f) => f.name)), name };
  }
  throw new Error("No pictures found. Use a PNG sheet, a GIF, frames, an Aseprite or TexturePacker file, or a ZIP of those.");
}
