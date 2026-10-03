import type { TierOverride } from "./responsive";
import { COLUMN_GAP, GRID_COLUMNS, ROW_HEIGHT, type Block, type Section } from "./types";

export type GridDensity = 1 | 2 | 3;

export const GRID_DENSITIES: { value: GridDensity; label: string; detail: string }[] = [
  { value: 1, label: "Standard", detail: "12 columns · 24px rows" },
  { value: 2, label: "Fine", detail: "24 columns · 12px rows" },
  { value: 3, label: "Extra fine", detail: "36 columns · 8px rows" }
];

export function densityOf(section: Pick<Section, "grid">): GridDensity {
  return section.grid === 2 || section.grid === 3 ? section.grid : 1;
}

export interface GridMetrics {
  density: GridDensity;
  cols: number;
  rowHeight: number;
  gap: number;
}

export const MAX_SCREENS = 30;

export function screensOf(section: Pick<Section, "screens">): number {
  return Math.max(1, Math.min(MAX_SCREENS, Math.round(section.screens ?? 1)));
}

/** Screens a section needs so every piece fits inside it. */
export function screensNeeded(section: Section): number {
  const perScreen = GRID_COLUMNS * densityOf(section);
  const right = Math.max(0, ...section.blocks.map((b) => b.x + b.w));
  return Math.max(1, Math.ceil(right / perScreen));
}

export function gridOf(section: Pick<Section, "grid" | "screens">, component = false): GridMetrics {
  const density = densityOf(section);
  return {
    density,
    cols: GRID_COLUMNS * density * (component ? 1 : screensOf(section)),
    rowHeight: ROW_HEIGHT / density,
    gap: (component ? COLUMN_GAP / 2 : COLUMN_GAP) / density
  };
}

export function gridVars(section: Pick<Section, "grid" | "screens">, component = false): Record<string, string | number> {
  const g = gridOf(section, component);
  return { "--cols": g.cols, "--row-h": `${g.rowHeight}px`, "--col-gap": `${g.gap}px` };
}

const scaleStart = (n: number, f: number) => Math.round(n * f);
const scaleSpan = (n: number, f: number) => Math.max(1, Math.round(n * f));

export function scaleBlock(block: Block, f: number): Block {
  if (f === 1) return block;
  const scaled: Block = { ...block, x: scaleStart(block.x, f), y: scaleStart(block.y, f), w: scaleSpan(block.w, f), h: scaleSpan(block.h, f) };
  if (block.responsive) {
    const tier = (o: TierOverride | undefined): TierOverride | undefined =>
      o && {
        ...o,
        ...(o.x !== undefined ? { x: scaleStart(o.x, f) } : {}),
        ...(o.y !== undefined ? { y: scaleStart(o.y, f) } : {}),
        ...(o.w !== undefined ? { w: scaleSpan(o.w, f) } : {}),
        ...(o.h !== undefined ? { h: scaleSpan(o.h, f) } : {})
      };
    scaled.responsive = { tablet: tier(block.responsive.tablet), phone: tier(block.responsive.phone) };
  }
  return scaled;
}

export function convertBlocks(blocks: Block[], from: GridDensity, to: GridDensity): Block[] {
  return from === to ? blocks : blocks.map((b) => scaleBlock(b, to / from));
}

export function toSectionSize(size: { w: number; h: number }, section: Pick<Section, "grid">): { w: number; h: number } {
  const d = densityOf(section);
  return { w: size.w * d, h: size.h * d };
}

export function setGridDensity(section: Section, density: GridDensity): void {
  const from = densityOf(section);
  if (from === density) return;
  const f = density / from;
  section.blocks = section.blocks.map((b) => scaleBlock(b, f));
  section.settings = { ...section.settings, minRows: Math.round(section.settings.minRows * f) };
  if (section.layouts) {
    section.layouts = {
      ...section.layouts,
      ...(section.layouts.tabletMinRows !== undefined ? { tabletMinRows: Math.round(section.layouts.tabletMinRows * f) } : {}),
      ...(section.layouts.phoneMinRows !== undefined ? { phoneMinRows: Math.round(section.layouts.phoneMinRows * f) } : {})
    };
  }
  if (density === 1) delete section.grid;
  else section.grid = density;
}
