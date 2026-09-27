import type { AnimKey, AnimProp, AnimTrack, AnimTrigger, Block, BlockAnimation } from "../model/types";
import { createId } from "../util/id";
import { easeCss, easeFn, isEase } from "./easing";

export const PROPS: Record<AnimProp, { label: string; unit: string; rest: number; min: number; max: number; step: number; cssVar: string; css: (v: number) => string }> = {
  x: { label: "Move across", unit: "px", rest: 0, min: -2000, max: 2000, step: 1, cssVar: "--fw-x", css: (v) => `${v}px` },
  y: { label: "Move down", unit: "px", rest: 0, min: -2000, max: 2000, step: 1, cssVar: "--fw-y", css: (v) => `${v}px` },
  scale: { label: "Size", unit: "%", rest: 100, min: 0, max: 1000, step: 1, cssVar: "--fw-scale", css: (v) => String(v / 100) },
  rotate: { label: "Turn", unit: "°", rest: 0, min: -3600, max: 3600, step: 1, cssVar: "--fw-rotate", css: (v) => `${v}deg` },
  opacity: { label: "Opacity", unit: "%", rest: 100, min: 0, max: 100, step: 1, cssVar: "--fw-opacity", css: (v) => String(v / 100) },
  blur: { label: "Blur", unit: "px", rest: 0, min: 0, max: 100, step: 0.5, cssVar: "--fw-blur", css: (v) => `${v}px` },
  mask: { label: "Cutout", unit: "%", rest: 100, min: 0, max: 100, step: 1, cssVar: "--fw-mask", css: (v) => String(v) }
};

export const PROP_ORDER: AnimProp[] = ["x", "y", "scale", "rotate", "opacity", "blur", "mask"];

export const TRIGGERS: { value: AnimTrigger; label: string; hint: string }[] = [
  { value: "view", label: "Scrolls into view", hint: "Plays when the block comes on screen." },
  { value: "scroll", label: "Follows scrolling", hint: "Scrolling moves it through the timeline, forwards and back." },
  { value: "hover", label: "Hover", hint: "Plays while the pointer is over it (or another block), and runs back when it leaves." },
  { value: "click", label: "Click", hint: "Each click plays it forwards, then back." },
  { value: "load", label: "Page opens", hint: "Plays once when the page loads." },
  { value: "loop", label: "Loops forever", hint: "Plays over and over from when the page opens." }
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function cleanKeys(track: AnimTrack): AnimKey[] {
  const p = PROPS[track.prop];
  return [...track.keys]
    .filter((k) => Number.isFinite(k.t) && Number.isFinite(k.v))
    .map((k) => ({ t: clamp(k.t, 0, 1), v: clamp(k.v, p.min, p.max), ease: k.ease && isEase(k.ease) ? k.ease : undefined }))
    .sort((a, b) => a.t - b.t);
}

export function valueAt(track: AnimTrack, t: number): number {
  const keys = cleanKeys(track);
  if (!keys.length) return PROPS[track.prop].rest;
  if (t <= keys[0].t) return keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (t <= b.t) {
      const span = b.t - a.t || 1;
      return a.v + (b.v - a.v) * easeFn(b.ease)((t - a.t) / span);
    }
  }
  return keys[keys.length - 1].v;
}

export type WaapiFrame = Record<string, string | number>;

export function trackKeyframes(track: AnimTrack): WaapiFrame[] {
  const keys = cleanKeys(track);
  const p = PROPS[track.prop];
  if (!keys.length) return [];
  if (keys[0].t > 0) keys.unshift({ t: 0, v: keys[0].v });
  if (keys[keys.length - 1].t < 1) keys.push({ t: 1, v: keys[keys.length - 1].v });
  return keys.map((k, i) => ({ offset: k.t, [p.cssVar]: p.css(k.v), easing: easeCss(keys[i + 1]?.ease ?? "linear") }));
}

export interface CompiledAnimation {
  t: AnimTrigger;
  s?: string;
  r?: 1;
  sc?: "page";
  d: number;
  dl?: number;
  alt?: 1;
  k: WaapiFrame[][];
}

export function compileAnimation(a: BlockAnimation): CompiledAnimation | null {
  const tracks = a.tracks.map(trackKeyframes).filter((k) => k.length > 1);
  if (!tracks.length) return null;
  return {
    t: a.trigger,
    ...(a.source && /^[\w-]+$/.test(a.source) ? { s: a.source } : {}),
    ...(a.repeat ? { r: 1 as const } : {}),
    ...(a.scroll === "page" ? { sc: "page" as const } : {}),
    d: clamp(Math.round(a.duration) || 600, 50, 120000),
    ...(a.delay ? { dl: clamp(Math.round(a.delay), 0, 60000) } : {}),
    ...(a.alternate ? { alt: 1 as const } : {}),
    k: tracks
  };
}

export function animationMarkup(block: Block): { attrs: Record<string, string>; style: Record<string, string> } | null {
  const anims = (block.animations ?? []).filter((a) => a.tracks.some((t) => t.keys.length > 1));
  const compiled = anims.map(compileAnimation).filter((c): c is CompiledAnimation => Boolean(c));
  if (!compiled.length) return null;
  const used = new Set<AnimProp>();
  const style: Record<string, string> = {};
  for (const a of anims) {
    for (const track of a.tracks) {
      if (track.keys.length < 2) continue;
      used.add(track.prop);
      style[PROPS[track.prop].cssVar] = PROPS[track.prop].css(valueAt(track, 0));
    }
  }
  const mask = anims.find((a) => a.tracks.some((t) => t.prop === "mask" && t.keys.length > 1))?.mask;
  if (mask) Object.assign(style, maskVars(mask));
  const origin = anims.find((a) => a.origin)?.origin;
  if (origin) style.transformOrigin = `${clamp(origin.x, 0, 100)}% ${clamp(origin.y, 0, 100)}%`;
  const attrs: Record<string, string> = {
    "data-anim": JSON.stringify(compiled),
    "data-anim-use": [...used].join(" ")
  };
  if (used.has("mask")) attrs["data-anim-mask"] = mask?.shape ?? "circle";
  return { attrs, style };
}

export function maskVars(mask: NonNullable<BlockAnimation["mask"]>): Record<string, string> {
  const cx = clamp(mask.x, 0, 100) / 100;
  const cy = clamp(mask.y, 0, 100) / 100;
  const far = Math.max(Math.abs(cx - 0.5), Math.abs(cy - 0.5));
  return {
    "--fw-mx": `${cx * 100}%`,
    "--fw-my": `${cy * 100}%`,
    "--fw-mxn": String(cx),
    "--fw-myn": String(cy),
    "--fw-mk": (0.7072 * (1 + 2 * far)).toFixed(4),
    "--fw-mkd": (Math.max(cx, 1 - cx) + Math.max(cy, 1 - cy)).toFixed(4)
  };
}

export function animationSources(blocks: Block[]): Set<string> {
  const ids = new Set<string>();
  for (const b of blocks) for (const a of b.animations ?? []) if (a.source && (a.trigger === "hover" || a.trigger === "click")) ids.add(a.source);
  return ids;
}

const k = (t: number, v: number, ease?: string): AnimKey => ({ t, v, ...(ease ? { ease } : {}) });
const track = (prop: AnimProp, ...keys: AnimKey[]): AnimTrack => ({ prop, keys });

export const ANIMATION_PRESETS: { id: string; label: string; make: () => Omit<BlockAnimation, "id"> }[] = [
  { id: "fade-rise", label: "Rise in", make: () => ({ name: "Rise in", trigger: "view", duration: 700, tracks: [track("opacity", k(0, 0), k(1, 100, "ease-out")), track("y", k(0, 40), k(1, 0, "ease-out"))] }) },
  { id: "pop", label: "Pop in", make: () => ({ name: "Pop in", trigger: "view", duration: 900, tracks: [track("opacity", k(0, 0), k(0.3, 100, "ease-out")), track("scale", k(0, 70), k(1, 100, "spring(170,12)"))] }) },
  { id: "blur-in", label: "Blur in", make: () => ({ name: "Blur in", trigger: "view", duration: 800, tracks: [track("opacity", k(0, 0), k(1, 100, "ease-out")), track("blur", k(0, 14), k(1, 0, "ease-out"))] }) },
  { id: "circle-reveal", label: "Circle reveal", make: () => ({ name: "Circle reveal", trigger: "view", duration: 1100, mask: { shape: "circle", x: 50, y: 50 }, tracks: [track("mask", k(0, 0), k(1, 100, "ease-in-out"))] }) },
  { id: "spin-scroll", label: "Turn while scrolling", make: () => ({ name: "Turn while scrolling", trigger: "scroll", duration: 2000, tracks: [track("rotate", k(0, -90), k(1, 270, "linear"))] }) },
  { id: "drift-scroll", label: "Drift while scrolling", make: () => ({ name: "Drift while scrolling", trigger: "scroll", duration: 2000, tracks: [track("y", k(0, 80), k(1, -80, "linear"))] }) },
  { id: "zoom-scroll", label: "Grow while scrolling", make: () => ({ name: "Grow while scrolling", trigger: "scroll", duration: 2000, tracks: [track("scale", k(0, 80), k(0.5, 110, "ease-out"), k(1, 80, "ease-in"))] }) },
  { id: "hover-grow", label: "Grow on hover", make: () => ({ name: "Grow on hover", trigger: "hover", duration: 500, tracks: [track("scale", k(0, 100), k(1, 108, "spring(170,12)"))] }) },
  { id: "hover-cutout", label: "Cutout grows on hover", make: () => ({ name: "Cutout on hover", trigger: "hover", duration: 700, mask: { shape: "circle", x: 50, y: 50 }, tracks: [track("mask", k(0, 45), k(1, 100, "ease-in-out"))] }) },
  { id: "hover-wiggle", label: "Wiggle on hover", make: () => ({ name: "Wiggle", trigger: "hover", duration: 600, tracks: [track("rotate", k(0, 0), k(0.2, -6, "ease-out"), k(0.45, 5, "ease-in-out"), k(0.7, -3, "ease-in-out"), k(1, 0, "ease-in"))] }) },
  { id: "float", label: "Float", make: () => ({ name: "Float", trigger: "loop", duration: 2400, alternate: true, tracks: [track("y", k(0, 0), k(1, -14, "ease-in-out"))] }) },
  { id: "pulse", label: "Pulse", make: () => ({ name: "Pulse", trigger: "loop", duration: 1400, alternate: true, tracks: [track("scale", k(0, 100), k(1, 106, "ease-in-out"))] }) },
  { id: "spin", label: "Spin", make: () => ({ name: "Spin", trigger: "loop", duration: 6000, tracks: [track("rotate", k(0, 0), k(1, 360, "linear"))] }) },
  { id: "blank", label: "Empty (build your own)", make: () => ({ name: "Animation", trigger: "view", duration: 800, tracks: [] }) }
];

export function newAnimation(presetId: string): BlockAnimation {
  const preset = ANIMATION_PRESETS.find((p) => p.id === presetId) ?? ANIMATION_PRESETS[ANIMATION_PRESETS.length - 1];
  return { id: createId("anim"), ...structuredClone(preset.make()) };
}
