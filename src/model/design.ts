import { createId } from "../util/id";
import { createPage, createSection } from "./factory";
import { slugify } from "../util/slug";
import { convertBlocks, densityOf } from "./grid";
import { pinLayers } from "./layers";
import type { Block, DesignFormat, Page, Section, Site } from "./types";

export const SHEET_WIDTH = 1200;
const ROW_HEIGHT = 24;

export interface DesignPreset {
  id: string;
  label: string;
  group: "Print" | "Social";
  width: number;
  height: number;
  unit: "mm" | "in" | "px";
  bleed: number;
  folds: number;
  sheets: number;
}

export const DESIGN_PRESETS: DesignPreset[] = [
  { id: "a5-flyer", label: "Flyer · A5", group: "Print", width: 148, height: 210, unit: "mm", bleed: 3, folds: 0, sheets: 1 },
  { id: "a4-flyer", label: "Flyer · A4", group: "Print", width: 210, height: 297, unit: "mm", bleed: 3, folds: 0, sheets: 1 },
  { id: "letter-flyer", label: "Flyer · US Letter", group: "Print", width: 8.5, height: 11, unit: "in", bleed: 0.125, folds: 0, sheets: 1 },
  { id: "a4-document", label: "Document · A4 (letters, invoices, proposals)", group: "Print", width: 210, height: 297, unit: "mm", bleed: 0, folds: 0, sheets: 1 },
  { id: "letter-document", label: "Document · US Letter (letters, invoices, proposals)", group: "Print", width: 8.5, height: 11, unit: "in", bleed: 0, folds: 0, sheets: 1 },
  { id: "a3-poster", label: "Poster · A3", group: "Print", width: 297, height: 420, unit: "mm", bleed: 3, folds: 0, sheets: 1 },
  { id: "poster-18x24", label: "Poster · 18 × 24 in", group: "Print", width: 18, height: 24, unit: "in", bleed: 0.125, folds: 0, sheets: 1 },
  { id: "trifold-letter", label: "Tri-fold pamphlet · US Letter", group: "Print", width: 11, height: 8.5, unit: "in", bleed: 0.125, folds: 2, sheets: 2 },
  { id: "trifold-a4", label: "Tri-fold pamphlet · A4", group: "Print", width: 297, height: 210, unit: "mm", bleed: 3, folds: 2, sheets: 2 },
  { id: "bifold-a4", label: "Folded leaflet · A4", group: "Print", width: 297, height: 210, unit: "mm", bleed: 3, folds: 1, sheets: 2 },
  { id: "business-card", label: "Business card · 85 × 55 mm", group: "Print", width: 85, height: 55, unit: "mm", bleed: 2, folds: 0, sheets: 2 },
  { id: "business-card-us", label: "Business card · 3.5 × 2 in", group: "Print", width: 3.5, height: 2, unit: "in", bleed: 0.0625, folds: 0, sheets: 2 },
  { id: "postcard", label: "Postcard · A6", group: "Print", width: 148, height: 105, unit: "mm", bleed: 3, folds: 0, sheets: 2 },
  { id: "sticker-3in", label: "Sticker · 3 × 3 in", group: "Print", width: 3, height: 3, unit: "in", bleed: 0.0625, folds: 0, sheets: 1 },
  { id: "sticker-75mm", label: "Sticker · 75 × 75 mm", group: "Print", width: 75, height: 75, unit: "mm", bleed: 2, folds: 0, sheets: 1 },
  { id: "tshirt-print", label: "T-shirt print · 12 × 16 in (merch)", group: "Print", width: 12, height: 16, unit: "in", bleed: 0, folds: 0, sheets: 1 },
  { id: "instagram-post", label: "Instagram post · 1080 × 1350", group: "Social", width: 1080, height: 1350, unit: "px", bleed: 0, folds: 0, sheets: 1 },
  { id: "instagram-square", label: "Square post · 1080 × 1080", group: "Social", width: 1080, height: 1080, unit: "px", bleed: 0, folds: 0, sheets: 1 },
  { id: "story", label: "Story / Reel cover · 1080 × 1920", group: "Social", width: 1080, height: 1920, unit: "px", bleed: 0, folds: 0, sheets: 1 },
  { id: "facebook-cover", label: "Facebook cover · 1640 × 624", group: "Social", width: 1640, height: 624, unit: "px", bleed: 0, folds: 0, sheets: 1 },
  { id: "link-preview", label: "Link preview (Open Graph) · 1200 × 630", group: "Social", width: 1200, height: 630, unit: "px", bleed: 0, folds: 0, sheets: 1 },
  { id: "youtube-thumb", label: "Video thumbnail · 1280 × 720", group: "Social", width: 1280, height: 720, unit: "px", bleed: 0, folds: 0, sheets: 1 }
];

export const isDesign = (page: Page | undefined): page is Page & { design: DesignFormat } => Boolean(page?.design);

export function unitPx(unit: DesignFormat["unit"]): number {
  return unit === "mm" ? 96 / 25.4 : unit === "in" ? 96 : 1;
}

export function sheetSize(format: DesignFormat): { width: number; height: number; bleed: number; scale: number } {
  const fullW = format.width + 2 * format.bleed;
  const fullH = format.height + 2 * format.bleed;
  const scale = SHEET_WIDTH / fullW;
  return { width: SHEET_WIDTH, height: Math.round(fullH * scale), bleed: format.bleed * scale, scale };
}

export function describeSize(format: DesignFormat): string {
  const n = (v: number) => (Math.round(v * 1000) / 1000).toString();
  return `${n(format.width)} × ${n(format.height)} ${format.unit}`;
}

export function sheetRows(format: DesignFormat, paddingY: number): number {
  return Math.max(4, Math.floor((sheetSize(format).height - 2 * paddingY) / ROW_HEIGHT));
}

export function formatFromPreset(preset: DesignPreset): DesignFormat {
  return { kind: preset.group === "Print" ? "print" : "social", preset: preset.id, width: preset.width, height: preset.height, unit: preset.unit, bleed: preset.bleed, folds: preset.folds };
}

export function createSheet(format: DesignFormat, name: string): Section {
  const { bleed } = sheetSize(format);
  const padding = Math.round(bleed + (format.kind === "print" ? (10 * unitPx("mm") * sheetSize(format).scale) / unitPx(format.unit) : 64));
  return createSection(name, [], { paddingY: padding, minRows: sheetRows(format, padding), background: "var(--bg)" });
}

export function createDesignPage(site: Site, preset: DesignPreset, title: string, from: Section[] = []): Page {
  const format = formatFromPreset(preset);
  const names = format.folds === 2 ? ["Outside", "Inside"] : format.folds === 1 ? ["Outside", "Inside"] : preset.sheets > 1 ? ["Front", "Back"] : ["Sheet"];
  const sheets = Array.from({ length: preset.sheets }, (_, i) => createSheet(format, names[i] ?? `Sheet ${i + 1}`));
  if (from.length) {
    const sheet = sheets[0];
    const target = densityOf(sheet);
    let y = 0;
    for (const section of from) {
      const blocks = convertBlocks(section.blocks, densityOf(section), target) as Block[];
      if (!blocks.length) continue;
      const top = Math.min(...blocks.map((b) => b.y));
      const bottom = Math.max(...blocks.map((b) => b.y + b.h));
      for (const block of blocks) {
        const copy = structuredClone(block);
        copy.id = createId("blk");
        copy.y = block.y - top + y;
        delete copy.responsive;
        delete copy.layerId;
        sheet.blocks.push(copy);
      }
      y += bottom - top + 1;
    }
    pinLayers(sheet);
  }
  let slug = slugify(title) || "design";
  while (site.pages.some((p) => p.slug === slug)) slug += "-1";
  const page = createPage(title, slug, sheets);
  page.hideInNav = true;
  page.design = format;
  return page;
}

export function sheetContext(format: DesignFormat): { width: number; height: number; bleed: number; safe: number; folds: number } {
  const size = sheetSize(format);
  const safe = size.bleed + (format.kind === "print" ? (4 * unitPx("mm") * size.scale) / unitPx(format.unit) : 48);
  return { width: size.width, height: size.height, bleed: size.bleed, safe, folds: format.folds };
}
