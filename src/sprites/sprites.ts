import type { CSSProperties } from "react";
import type { Site, SpriteSet, SpriteState } from "../model/types";

export const frameCount = (set: SpriteSet) => set.columns * set.rows;

export function framePosition(set: SpriteSet, index: number): string {
  const col = index % set.columns;
  const row = Math.floor(index / set.columns);
  const x = set.columns > 1 ? (col / (set.columns - 1)) * 100 : 0;
  const y = set.rows > 1 ? (row / (set.rows - 1)) * 100 : 0;
  return `${x.toFixed(4)}% ${y.toFixed(4)}%`;
}

const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "");
export const stateClass = (set: SpriteSet, state: SpriteState) => `fwsp-${safe(set.id)}-${safe(state.id)}`;

export function spriteStyle(set: SpriteSet, url: string, frame = 0): CSSProperties {
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${set.columns * 100}% ${set.rows * 100}%`,
    backgroundPosition: framePosition(set, frame),
    aspectRatio: `${set.frameW} / ${set.frameH}`,
    imageRendering: set.pixelated ? "pixelated" : undefined
  };
}

export function spriteCss(set: SpriteSet): string {
  return set.states
    .filter((s) => s.frames.length > 0)
    .map((s) => {
      const name = stateClass(set, s);
      const n = s.frames.length;
      const steps = s.frames.map((f, i) => `${((i / n) * 100).toFixed(3)}%{background-position:${framePosition(set, f)}}`).join("");
      const duration = (n / Math.max(1, s.fps)).toFixed(3);
      return `@keyframes ${name}{${steps}100%{background-position:${framePosition(set, s.frames[n - 1])}}}.${name}{animation:${name} ${duration}s steps(1,end) ${s.loop ? "infinite" : "1 forwards"};background-position:${framePosition(set, s.frames[0])}}`;
    })
    .join("\n")
    .concat("\n@media (prefers-reduced-motion: reduce){.fw-sprite{animation-play-state:paused!important}}");
}

const COMMON = [8, 12, 16, 24, 32, 40, 48, 64, 72, 80, 96, 100, 128, 150, 160, 192, 200, 256, 320, 384, 512];

export function guessGrid(width: number, height: number): { frameW: number; frameH: number } {
  const fits = (n: number, total: number) => total % n === 0;
  const square = COMMON.filter((n) => fits(n, width) && fits(n, height) && width / n <= 32 && height / n <= 32);
  if (square.length) {
    const best = square.find((n) => width / n <= 12 && height / n <= 12) ?? square[square.length - 1];
    return { frameW: best, frameH: best };
  }
  if (width > height && fits(height, width)) return { frameW: height, frameH: height };
  if (height > width && fits(width, height)) return { frameW: width, frameH: width };
  return { frameW: width, frameH: height };
}

export interface LooseFrame {
  image: CanvasImageSource & { width: number; height: number };
  name?: string;
}

export async function composeSheet(frames: LooseFrame[]): Promise<{ blob: Blob; frameW: number; frameH: number; columns: number; rows: number }> {
  const frameW = Math.max(...frames.map((f) => f.image.width));
  const frameH = Math.max(...frames.map((f) => f.image.height));
  const columns = Math.min(frames.length, Math.max(1, Math.ceil(Math.sqrt(frames.length))));
  const rows = Math.ceil(frames.length / columns);
  const canvas = document.createElement("canvas");
  canvas.width = frameW * columns;
  canvas.height = frameH * rows;
  const g = canvas.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  frames.forEach((f, i) => {
    const x = (i % columns) * frameW + Math.floor((frameW - f.image.width) / 2);
    const y = Math.floor(i / columns) * frameH + (frameH - f.image.height);
    g.drawImage(f.image, x, y);
  });
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the sheet"))), "image/png"));
  return { blob, frameW, frameH, columns, rows };
}

export function statesFromNames(names: (string | undefined)[]): { name: string; frames: number[] }[] {
  const groups = new Map<string, number[]>();
  names.forEach((raw, i) => {
    const base = (raw ?? "").replace(/\.[a-z0-9]+$/i, "").replace(/[\s_-]*\d+$/, "").trim() || "all";
    groups.set(base, [...(groups.get(base) ?? []), i]);
  });
  return [...groups].map(([name, frames]) => ({ name, frames }));
}

export function spritesInUse(site: Site): SpriteSet[] {
  const sets = site.sprites ?? [];
  if (!sets.length) return [];
  const text = JSON.stringify([site.pages, site.header, site.footer, site.components, site.companions]);
  return sets.filter((s) => text.includes(`"${s.id}"`));
}

export const referenceSprites = (site: Site) => spritesInUse(site).filter((s) => s.licence === "reference");
