import { cloneBlock, cloneSection } from "../model/ops";
import { rectFor, setRect, type Rect, type Tier } from "../model/responsive";
import type { Block, Section } from "../model/types";
import { convertBlocks, densityOf, gridOf, type GridDensity } from "../model/grid";

export function removeBlocks(section: Section, ids: string[]): void {
  section.blocks = section.blocks.filter((b) => !ids.includes(b.id));
}

export function moveBlocks(section: Section, ids: string[], tier: Tier, dx: number, dy: number): void {
  const blocks = section.blocks.filter((b) => ids.includes(b.id));
  const rects = blocks.map((b) => rectFor(section, b, tier));
  if (rects.length === 0) return;
  const minX = Math.min(...rects.map((r) => r.x));
  const maxRight = Math.max(...rects.map((r) => r.x + r.w));
  const minY = Math.min(...rects.map((r) => r.y));
  const cdx = Math.max(-minX, Math.min(dx, gridOf(section).cols - maxRight));
  const cdy = Math.max(-minY, dy);
  blocks.forEach((b, i) => setRect(section, b, tier, { ...rects[i], x: rects[i].x + cdx, y: rects[i].y + cdy }));
}

export function copyBlocks(blocks: Block[]): Block[] {
  return blocks.map(cloneBlock);
}

export function insertBlocks(section: Section, copies: Block[], tier: Tier, dx: number, dy: number, fallbackLayer: string, fromDensity: GridDensity = densityOf(section)): void {
  for (const copy of convertBlocks(copies, fromDensity, densityOf(section))) {
    const block = structuredClone(copy);
    if (!section.layers.some((l) => l.id === block.layerId)) block.layerId = fallbackLayer;
    section.blocks.push(block);
  }
  moveBlocks(section, copies.map((c) => c.id), tier, dx, dy);
}

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

export function alignBlocks(section: Section, ids: string[], tier: Tier, mode: AlignMode): void {
  const blocks = section.blocks.filter((b) => ids.includes(b.id));
  const rects = blocks.map((b) => rectFor(section, b, tier));
  if (rects.length < 2) return;
  const left = Math.min(...rects.map((r) => r.x));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const top = Math.min(...rects.map((r) => r.y));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  blocks.forEach((b, i) => {
    const r: Rect = { ...rects[i] };
    if (mode === "left") r.x = left;
    if (mode === "right") r.x = right - r.w;
    if (mode === "center") r.x = Math.round((left + right - r.w) / 2);
    if (mode === "top") r.y = top;
    if (mode === "bottom") r.y = bottom - r.h;
    if (mode === "middle") r.y = Math.round((top + bottom - r.h) / 2);
    setRect(section, b, tier, r);
  });
}

const MARKER = "fayteworks-clipboard";

export type ClipboardContent =
  | { kind: "blocks"; sourceSectionId: string; blocks: Block[]; density?: GridDensity }
  | { kind: "section"; section: Section };

export type ClipboardPayload = ClipboardContent & { [MARKER]: 1 };

export function encodeClipboard(payload: ClipboardContent): string {
  return JSON.stringify({ [MARKER]: 1, ...payload });
}

export function decodeClipboard(text: string): ClipboardPayload | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && parsed[MARKER] === 1 && (parsed.kind === "blocks" || parsed.kind === "section") ? parsed : null;
  } catch {
    return null;
  }
}


export function sectionForPaste(copied: Section): Section {
  return cloneSection(copied);
}
