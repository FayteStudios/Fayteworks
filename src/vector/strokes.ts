export interface WidthPoint {
  at: number;
  w: number;
}

export type WidthProfile = "even" | "taper-end" | "taper-start" | "taper-both" | "bulge" | "pinch" | "custom";

export const WIDTH_PROFILES: { value: WidthProfile; label: string }[] = [
  { value: "even", label: "Even width" },
  { value: "taper-end", label: "Taper at the end" },
  { value: "taper-start", label: "Taper at the start" },
  { value: "taper-both", label: "Taper both ends" },
  { value: "bulge", label: "Thick in the middle" },
  { value: "pinch", label: "Thin in the middle" }
];

export function profilePoints(profile: WidthProfile, w: number): WidthPoint[] {
  switch (profile) {
    case "taper-end":
      return [
        { at: 0, w },
        { at: 1, w: w * 0.05 }
      ];
    case "taper-start":
      return [
        { at: 0, w: w * 0.05 },
        { at: 1, w }
      ];
    case "taper-both":
      return [
        { at: 0, w: w * 0.05 },
        { at: 0.5, w },
        { at: 1, w: w * 0.05 }
      ];
    case "bulge":
      return [
        { at: 0, w: w * 0.4 },
        { at: 0.5, w: w * 1.6 },
        { at: 1, w: w * 0.4 }
      ];
    case "pinch":
      return [
        { at: 0, w: w * 1.4 },
        { at: 0.5, w: w * 0.3 },
        { at: 1, w: w * 1.4 }
      ];
    default:
      return [];
  }
}

export function widthAt(points: WidthPoint[], at: number, base: number): number {
  if (!points.length) return base;
  const sorted = [...points].sort((a, b) => a.at - b.at);
  if (at <= sorted[0].at) return sorted[0].w;
  const last = sorted[sorted.length - 1];
  if (at >= last.at) return last.w;
  const i = sorted.findIndex((p) => p.at >= at);
  const a = sorted[i - 1];
  const b = sorted[i];
  const t = b.at === a.at ? 0 : (at - a.at) / (b.at - a.at);
  const k = t * t * (3 - 2 * t);
  return a.w + (b.w - a.w) * k;
}

interface Measured {
  length: number;
  closed: boolean;
  getPointAt(offset: number): { x: number; y: number } | null;
  getNormalAt(offset: number): { x: number; y: number } | null;
}

export function widthOutline(path: Measured, points: WidthPoint[], base: number): { left: [number, number][]; right: [number, number][]; closed: boolean } {
  const L = path.length;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  if (!L) return { left, right, closed: path.closed };
  const n = Math.max(16, Math.min(600, Math.ceil(L / 2)));
  const last = path.closed ? n - 1 : n;
  for (let i = 0; i <= last; i++) {
    const off = Math.min(L, (L * i) / n);
    const p = path.getPointAt(off);
    const nor = path.getNormalAt(off);
    if (!p || !nor) continue;
    const half = Math.max(0.05, widthAt(points, off / L, base)) / 2;
    left.push([p.x + nor.x * half, p.y + nor.y * half]);
    right.push([p.x - nor.x * half, p.y - nor.y * half]);
  }
  return { left, right, closed: path.closed };
}

const f = (v: number) => String(Math.round(v * 100) / 100);

export function outlineData(o: ReturnType<typeof widthOutline>): string {
  if (o.left.length < 2) return "";
  const ring = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`;
  if (o.closed) return ring(o.left) + ring([...o.right].reverse());
  return ring([...o.left, ...[...o.right].reverse()]);
}
