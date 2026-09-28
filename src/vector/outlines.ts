import type { CustomFont } from "../model/types";
import { getAsset } from "../state/assets";

export interface TextRun {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  justification: "left" | "center" | "right";
  leading: number;
  spacing: number;
}

interface Command {
  command: "moveTo" | "lineTo" | "quadraticCurveTo" | "bezierCurveTo" | "closePath";
  args: number[];
}

interface Glyph {
  path: { commands: Command[] };
}

interface Position {
  xAdvance: number;
  yAdvance: number;
  xOffset: number;
  yOffset: number;
}

interface Font {
  unitsPerEm: number;
  variationAxes?: Record<string, { min: number; max: number }>;
  getVariation?(settings: Record<string, number>): Font;
  layout(text: string): { glyphs: Glyph[]; positions: Position[] };
  fonts?: Font[];
}

const CDN = "https://cdn.jsdelivr.net/fontsource/fonts";
const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "-apple-system", "emoji", "math"]);

const numericWeight = (w: string) => (w === "bold" ? 700 : w === "normal" ? 400 : Number(w) || 400);

export function familyNames(css: string): string[] {
  return css
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter((f) => f && !GENERIC.has(f.toLowerCase()));
}

const fetched = new Map<string, Promise<ArrayBuffer | null>>();

async function tryFetch(url: string): Promise<ArrayBuffer | null> {
  let hit = fetched.get(url);
  if (!hit) {
    hit = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    fetched.set(url, hit);
  }
  return hit;
}

type LocalFont = { family: string; style: string; blob(): Promise<Blob> };

async function localFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  const query = (window as unknown as { queryLocalFonts?: () => Promise<LocalFont[]> }).queryLocalFonts;
  if (!query) return null;
  try {
    const fonts = (await query()).filter((f) => f.family.toLowerCase() === family.toLowerCase() && !/italic|oblique/i.test(f.style));
    if (!fonts.length) return null;
    const bold = weight >= 600;
    const pick = fonts.find((f) => (bold ? /bold/i.test(f.style) : /^(regular|normal|book|roman)$/i.test(f.style))) ?? fonts[0];
    return await (await pick.blob()).arrayBuffer();
  } catch {
    return null;
  }
}

export function fontLoader(custom: CustomFont[]) {
  return async (family: string, weight: number): Promise<ArrayBuffer | null> => {
    const own = custom.filter((f) => f.family.toLowerCase() === family.toLowerCase());
    if (own.length) {
      const pick = own.reduce((best, f) => (Math.abs((f.weight ?? weight) - weight) < Math.abs((best.weight ?? weight) - weight) ? f : best), own[0]);
      const asset = await getAsset(pick.src);
      if (asset) return asset.blob.arrayBuffer();
    }
    const id = family.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    for (const w of [...new Set([weight, 400, 700])]) {
      const buf = await tryFetch(`${CDN}/${id}@latest/latin-${w}-normal.woff`);
      if (buf) return buf;
    }
    return localFont(family, weight);
  };
}

let kit: Promise<{ create(data: Uint8Array): Font }> | null = null;

async function parse(buf: ArrayBuffer, weight: number): Promise<Font> {
  kit ??= import("fontkit") as unknown as Promise<{ create(data: Uint8Array): Font }>;
  const mod = await kit;
  let font = mod.create(new Uint8Array(buf));
  if (font.fonts?.length) font = font.fonts[0];
  if (font.variationAxes?.wght && font.getVariation) {
    const axis = font.variationAxes.wght;
    font = font.getVariation({ wght: Math.max(axis.min, Math.min(axis.max, weight)) });
  }
  return font;
}

const r = (n: number) => String(Math.round(n * 100) / 100);

export async function outlineText(run: TextRun, load: (family: string, weight: number) => Promise<ArrayBuffer | null>): Promise<string> {
  const weight = numericWeight(run.fontWeight);
  let font: Font | null = null;
  for (const family of familyNames(run.fontFamily)) {
    const buf = await load(family, weight);
    if (!buf) continue;
    try {
      font = await parse(buf, weight);
      break;
    } catch {
      font = null;
    }
  }
  if (!font) throw new Error(`The font file for “${familyNames(run.fontFamily)[0] ?? run.fontFamily}” couldn't be found. Use one of the site's fonts, or add the font under Site settings → Fonts.`);
  const scale = run.fontSize / font.unitsPerEm;
  const out: string[] = [];
  run.content.split("\n").forEach((line, i) => {
    const laid = font!.layout(line);
    const width = laid.positions.reduce((sum, p) => sum + p.xAdvance * scale + run.spacing, 0);
    let x = run.justification === "center" ? -width / 2 : run.justification === "right" ? -width : 0;
    const baseline = i * run.leading;
    laid.glyphs.forEach((glyph, g) => {
      const pos = laid.positions[g];
      const ox = x + pos.xOffset * scale;
      const oy = baseline - pos.yOffset * scale;
      const X = (v: number) => r(ox + v * scale);
      const Y = (v: number) => r(oy - v * scale);
      for (const c of glyph.path.commands) {
        const a = c.args;
        if (c.command === "moveTo") out.push(`M${X(a[0])} ${Y(a[1])}`);
        else if (c.command === "lineTo") out.push(`L${X(a[0])} ${Y(a[1])}`);
        else if (c.command === "quadraticCurveTo") out.push(`Q${X(a[0])} ${Y(a[1])} ${X(a[2])} ${Y(a[3])}`);
        else if (c.command === "bezierCurveTo") out.push(`C${X(a[0])} ${Y(a[1])} ${X(a[2])} ${Y(a[3])} ${X(a[4])} ${Y(a[5])}`);
        else out.push("Z");
      }
      x += pos.xAdvance * scale + run.spacing;
    });
  });
  return out.join("");
}
