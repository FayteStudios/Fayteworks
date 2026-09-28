import type paper from "paper/dist/paper-core";

export type WarpStyle = "arc" | "arch" | "bulge" | "flag" | "wave" | "fish" | "rise" | "squeeze" | "inflate";
export type EffectKind = "roughen" | "zigzag" | "pucker" | "twist" | "warp";

export interface EffectParams {
  roughen: { size: number; detail: number; smooth: boolean; seed: number };
  zigzag: { size: number; ridges: number; smooth: boolean };
  pucker: { amount: number };
  twist: { angle: number };
  warp: { style: WarpStyle; bend: number };
}

export const EFFECT_DEFAULTS: EffectParams = {
  roughen: { size: 4, detail: 10, smooth: false, seed: 1 },
  zigzag: { size: 5, ridges: 6, smooth: false },
  pucker: { amount: 30 },
  twist: { angle: 45 },
  warp: { style: "arc", bend: 40 }
};

export const WARP_STYLES: { value: WarpStyle; label: string }[] = [
  { value: "arc", label: "Arc" },
  { value: "arch", label: "Arch" },
  { value: "bulge", label: "Bulge" },
  { value: "flag", label: "Flag" },
  { value: "wave", label: "Wave" },
  { value: "fish", label: "Fish" },
  { value: "rise", label: "Rise" },
  { value: "squeeze", label: "Squeeze" },
  { value: "inflate", label: "Inflate" }
];

type Map2 = (x: number, y: number) => [number, number];

export function prepareForBend(path: paper.Path, maxLength = 24) {
  for (let i = path.curves.length - 1; i >= 0; i--) {
    const c = path.curves[i];
    if (!c.hasHandles()) {
      c.handle1 = c.point2.subtract(c.point1).divide(3);
      c.handle2 = c.point1.subtract(c.point2).divide(3);
    }
    const pieces = Math.min(16, Math.max(1, Math.ceil(c.length / maxLength)));
    for (let k = pieces; k >= 2; k--) c.divideAtTime((k - 1) / k);
  }
}

export function mapPath(scope: paper.PaperScope, path: paper.Path, f: Map2) {
  const P = (x: number, y: number) => new scope.Point(x, y);
  for (const s of path.segments) {
    const p = s.point;
    const [x, y] = f(p.x, p.y);
    const hi = f(p.x + s.handleIn.x, p.y + s.handleIn.y);
    const ho = f(p.x + s.handleOut.x, p.y + s.handleOut.y);
    s.point = P(x, y);
    s.handleIn = P(hi[0] - x, hi[1] - y);
    s.handleOut = P(ho[0] - x, ho[1] - y);
  }
}

export function warpMap(style: WarpStyle, bend: number, b: paper.Rectangle): Map2 {
  const k = bend / 100;
  const { x: l, y: t, width: w, height: h } = b;
  const cx = l + w / 2;
  const cy = t + h / 2;
  return (x, y) => {
    const u = w ? (x - l) / w : 0.5;
    const v = h ? (y - t) / h : 0.5;
    const s = 2 * u - 1;
    const r = 2 * v - 1;
    switch (style) {
      case "arc":
        return [x, y - k * h * 0.5 * (1 - s * s)];
      case "arch":
        return [x, y - k * h * 0.5 * (1 - s * s) * (1 - v)];
      case "bulge":
        return [x, cy + (y - cy) * (1 + k * (1 - s * s))];
      case "flag":
        return [x, y + k * h * 0.25 * Math.sin(Math.PI * 2 * u)];
      case "wave":
        return [x, y + k * h * 0.25 * Math.sin(Math.PI * 2 * u) * r];
      case "fish":
        return [x, cy + (y - cy) * (1 + k * 0.6 * -s)];
      case "rise":
        return [x, y - k * h * 0.5 * u * u];
      case "squeeze":
        return [cx + (x - cx) * (1 - k * 0.5 * (1 - r * r)), y];
      default:
        return [cx + (x - cx) * (1 + k * 0.5 * (1 - r * r)), cy + (y - cy) * (1 + k * 0.5 * (1 - s * s))];
    }
  };
}

export function twistMap(angle: number, center: paper.Point, radius: number): Map2 {
  const a = (angle * Math.PI) / 180;
  return (x, y) => {
    const dx = x - center.x;
    const dy = y - center.y;
    const d = Math.hypot(dx, dy);
    const turn = a * Math.max(0, 1 - d / Math.max(1e-6, radius));
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    return [center.x + dx * cos - dy * sin, center.y + dx * sin + dy * cos];
  };
}

export function perspectiveMap(from: paper.Rectangle, quad: [number, number][]): Map2 {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  let g = 0;
  let hh = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = den ? (sx * dy2 - dx2 * sy) / den : 0;
    hh = den ? (dx1 * sy - sx * dy1) / den : 0;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + hh * x3;
  const c = x0;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + hh * y3;
  const f = y0;
  return (x, y) => {
    const u = from.width ? (x - from.x) / from.width : 0;
    const v = from.height ? (y - from.y) / from.height : 0;
    const w = g * u + hh * v + 1;
    return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
  };
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resample(scope: paper.PaperScope, path: paper.Path, count: number, move: (p: paper.Point, normal: paper.Point, i: number) => paper.Point, smooth: boolean) {
  const L = path.length;
  if (!L) return;
  const n = Math.max(3, count);
  const steps = path.closed ? n : n + 1;
  const pts: paper.Point[] = [];
  for (let i = 0; i < steps; i++) {
    const off = path.closed ? (L * i) / n : Math.min(L, (L * i) / n);
    const p = path.getPointAt(off);
    const nor = path.getNormalAt(off) ?? new scope.Point(0, 0);
    if (p) pts.push(move(p, nor, i));
  }
  path.removeSegments();
  path.addSegments(pts.map((p) => new scope.Segment(p)));
  if (smooth) path.smooth({ type: "catmull-rom" });
}

export function roughen(scope: paper.PaperScope, path: paper.Path, o: EffectParams["roughen"]) {
  const random = rng(o.seed * 7919 + path.segments.length);
  const count = Math.round((path.length * o.detail) / 100);
  resample(scope, path, count, (p) => p.add(new scope.Point((random() * 2 - 1) * o.size, (random() * 2 - 1) * o.size)), o.smooth);
}

export function zigzag(scope: paper.PaperScope, path: paper.Path, o: EffectParams["zigzag"]) {
  const count = Math.max(4, Math.round((path.length * o.ridges) / 100) * 2);
  resample(scope, path, count, (p, nor, i) => p.add(nor.multiply(i % 2 ? o.size : -o.size)), o.smooth);
}

export function puckerBloat(scope: paper.PaperScope, path: paper.Path, amount: number, center: paper.Point) {
  const k = amount / 100;
  const zero = new scope.Point(0, 0);
  for (const s of path.segments) {
    const toCentre = center.subtract(s.point);
    const isEndIn = !path.closed && s.isFirst();
    const isEndOut = !path.closed && s.isLast();
    s.handleIn = isEndIn ? zero : toCentre.multiply(-k);
    s.handleOut = isEndOut ? zero : toCentre.multiply(-k);
  }
}
