import { contrast } from "../quality/prepublish";
import type { Theme } from "./types";

export type HarmonyId = "complementary" | "analogous" | "triad" | "split" | "tetradic" | "shades";

export const HARMONIES: { id: HarmonyId; label: string; what: string; hues: number[] }[] = [
  { id: "complementary", label: "Opposites", what: "Your colour and its opposite", hues: [0, 180] },
  { id: "analogous", label: "Neighbours", what: "Colours next to yours", hues: [0, 30, -30] },
  { id: "triad", label: "Triad", what: "Three, evenly apart", hues: [0, 120, 240] },
  { id: "split", label: "Split opposites", what: "Softer than opposites", hues: [0, 150, 210] },
  { id: "tetradic", label: "Four corners", what: "Lively and colourful", hues: [0, 90, 180, 270] },
  { id: "shades", label: "Shades", what: "Just your colour, lighter and darker", hues: [0] }
];

export type ThemeColours = Pick<Theme, "background" | "surface" | "text" | "muted" | "accent" | "accentText">;
export const COLOUR_KEYS: (keyof ThemeColours)[] = ["background", "surface", "text", "muted", "accent", "accentText"];

export interface Palette {
  name: string;
  colours: ThemeColours;
  extra: string;
  textContrast: number;
  buttonContrast: number;
}

export function hslHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function hexHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 12, s: 58, l: 40 };
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

const ratio = (a: string, b: string) => contrast(a, b) ?? 1;

function finish(name: string, colours: Omit<ThemeColours, "accentText">, extra: string): Palette {
  const accentText = ratio("#ffffff", colours.accent) >= ratio("#111111", colours.accent) ? "#ffffff" : "#111111";
  return { name, colours: { ...colours, accentText }, extra, textContrast: ratio(colours.text, colours.background), buttonContrast: ratio(accentText, colours.accent) };
}

export function harmonyHues(base: string, id: HarmonyId): number[] {
  const { h } = hexHsl(base);
  return (HARMONIES.find((m) => m.id === id)?.hues ?? [0]).map((d) => h + d);
}

export function buildPalettes(base: string, id: HarmonyId): Palette[] {
  const { h, s } = hexHsl(base);
  const sat = Math.max(35, Math.min(80, s));
  const hues = harmonyHues(base, id);
  const second = hues[1] ?? h;
  const third = hues[2] ?? hues[1] ?? h;
  const shades = id === "shades";
  return [
    finish("Light and calm", { background: hslHex(h, 18, 93), surface: hslHex(h, 22, 97), text: hslHex(h, 22, 13), muted: hslHex(h, 10, 36), accent: hslHex(h, sat, 40) }, hslHex(second, sat * 0.8, shades ? 60 : 45)),
    finish("Dark and rich", { background: hslHex(h, 20, 10), surface: hslHex(h, 18, 15), text: hslHex(h, 15, 93), muted: hslHex(h, 10, 70), accent: hslHex(shades ? h : second, sat, 62) }, hslHex(third, sat * 0.8, 68)),
    finish("Bold", { background: hslHex(second, shades ? 30 : 40, 88), surface: hslHex(second, 30, 96), text: hslHex(h, 35, 12), muted: hslHex(h, 15, 32), accent: hslHex(h, Math.min(90, sat + 10), 42) }, hslHex(third, sat, 38))
  ];
}

export function paletteFromCodes(text: string): Palette | null {
  const codes = [...new Set((text.match(/#?[0-9a-f]{6}\b/gi) ?? []).map((c) => `#${c.replace("#", "").toLowerCase()}`))];
  if (codes.length < 2) return null;
  const byLight = [...codes].sort((a, b) => hexHsl(b).l - hexHsl(a).l);
  const background = byLight[0];
  const text2 = byLight[byLight.length - 1];
  const middle = byLight.slice(1, -1);
  const accent = [...(middle.length ? middle : codes)].sort((a, b) => hexHsl(b).s - hexHsl(a).s)[0];
  const surface = middle.find((c) => c !== accent && hexHsl(c).l > 70) ?? background;
  const muted = middle.find((c) => c !== accent && c !== surface) ?? hslHex(hexHsl(text2).h, 10, 38);
  return finish("Your colours", { background, surface, text: text2, muted, accent }, accent);
}
