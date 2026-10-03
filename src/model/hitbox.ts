import type { Block } from "./types";

export type HitboxShape = "box" | "oval" | "outline";

/** A piece's hitbox: the part of it that touches things, separate from how it looks. All numbers are % of the piece. */
export interface Hitbox {
  shape?: HitboxShape;
  /** How far each edge is pulled in from the piece: top, right, bottom, left. Negative reaches outside it. */
  inset?: [number, number, number, number];
  /** Outline points as x, y pairs. */
  points?: number[];
  /** Where it rests, from the top. Empty means the bottom of the shape. */
  seat?: number;
  /** What it does: "" is decoration; other behaviours come from the parts that use them (e.g. physics). */
  role?: string;
  /** Whether it keeps other pieces out of its way while arranging (unset: content does, decoration doesn't). */
  arrange?: boolean;
  /** Only the hitbox responds to clicks, grabs and touches (published pages and Preview). */
  clickOnly?: boolean;
}

export interface HitboxBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const HITBOX_LIMIT = 50;

const clampPct = (n: number) => Math.max(-HITBOX_LIMIT, Math.min(100 + HITBOX_LIMIT, n));

export function outlineOf(hb: Hitbox | undefined): [number, number][] {
  const pts = hb?.points ?? [];
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) out.push([pts[i], pts[i + 1]]);
  return out;
}

/** The hitbox's bounding box in % of the piece. */
export function hitboxBounds(hb: Hitbox | undefined): HitboxBounds {
  if (hb?.shape === "outline") {
    const pts = outlineOf(hb);
    if (pts.length >= 3)
      return {
        left: Math.min(...pts.map((p) => p[0])),
        top: Math.min(...pts.map((p) => p[1])),
        right: Math.max(...pts.map((p) => p[0])),
        bottom: Math.max(...pts.map((p) => p[1]))
      };
  }
  const [t, r, b, l] = hb?.inset ?? [0, 0, 0, 0];
  return { left: clampPct(l), top: clampPct(t), right: clampPct(100 - r), bottom: clampPct(100 - b) };
}

/** CSS clip-path of the hitbox, for the area that takes clicks. */
export function hitboxClip(hb: Hitbox | undefined): string {
  if (hb?.shape === "outline") {
    const pts = outlineOf(hb);
    if (pts.length >= 3) return `polygon(${pts.map(([x, y]) => `${x}% ${y}%`).join(", ")})`;
  }
  const b = hitboxBounds(hb);
  if (hb?.shape === "oval") return `ellipse(${(b.right - b.left) / 2}% ${(b.bottom - b.top) / 2}% at ${(b.left + b.right) / 2}% ${(b.top + b.bottom) / 2}%)`;
  const pos = (n: number) => `${Math.max(0, n)}%`;
  return `inset(${pos(b.top)} ${pos(100 - b.right)} ${pos(100 - b.bottom)} ${pos(b.left)})`;
}

export const seatOf = (hb: Hitbox | undefined) => (typeof hb?.seat === "number" ? hb.seat : hitboxBounds(hb).bottom);

export function isPlainHitbox(hb: Hitbox | undefined): boolean {
  if (!hb) return true;
  const inset = hb.inset ?? [0, 0, 0, 0];
  return (!hb.shape || hb.shape === "box") && inset.every((n) => !n) && typeof hb.seat !== "number" && !hb.role && hb.arrange === undefined && !hb.clickOnly;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Attributes a page script reads: data-hb="left top right bottom seat" (%), plus the shape and its outline. */
export function hitboxAttrs(block: Block): Record<string, string> | null {
  const hb = block.hitbox;
  if (!hb || isPlainHitbox({ ...hb, role: "" })) return hb?.role ? { "data-hb-role": hb.role } : null;
  const b = hitboxBounds(hb);
  const attrs: Record<string, string> = { "data-hb": [b.left, b.top, b.right, b.bottom, seatOf(hb)].map(round).join(" ") };
  if (hb.shape && hb.shape !== "box") attrs["data-hb-shape"] = hb.shape;
  if (hb.shape === "outline") attrs["data-hb-pts"] = outlineOf(hb).map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
  if (hb.role) attrs["data-hb-role"] = hb.role;
  return attrs;
}

/** SVG path of the hitbox in a 100 × 100 box (the piece). */
export function hitboxPath(hb: Hitbox | undefined): string {
  if (hb?.shape === "outline") {
    const pts = outlineOf(hb);
    if (pts.length >= 2) return `M${pts.map(([x, y]) => `${x},${y}`).join(" L")}${pts.length >= 3 ? " Z" : ""}`;
  }
  const b = hitboxBounds(hb);
  if (hb?.shape === "oval") {
    const rx = (b.right - b.left) / 2;
    const ry = (b.bottom - b.top) / 2;
    const cx = b.left + rx;
    return `M${cx - rx},${b.top + ry} A${rx},${ry} 0 1 0 ${cx + rx},${b.top + ry} A${rx},${ry} 0 1 0 ${cx - rx},${b.top + ry} Z`;
  }
  return `M${b.left},${b.top} H${b.right} V${b.bottom} H${b.left} Z`;
}

/**
 * Traces the solid (non-transparent) part of a picture into an outline, in % of the drawn picture.
 * Rows are scanned for their leftmost and rightmost solid pixel; the two edges become one loop.
 */
export function traceAlpha(data: Uint8ClampedArray, width: number, height: number, rows = 16): number[] {
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= rows; i++) {
    const y = Math.min(height - 1, Math.round((i / rows) * (height - 1)));
    let lo = -1;
    let hi = -1;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 40) {
        if (lo < 0) lo = x;
        hi = x;
      }
    }
    if (lo < 0) continue;
    left.push([(lo / width) * 100, (y / height) * 100]);
    right.push([((hi + 1) / width) * 100, (y / height) * 100]);
  }
  if (left.length < 2) return [];
  const loop = [...left, ...right.reverse()];
  return loop.flatMap(([x, y]) => [round(x), round(y)]);
}
