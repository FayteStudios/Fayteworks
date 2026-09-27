import { GRID_COLUMNS, type Block, type Section } from "./types";
import { gridOf } from "./grid";

export type Tier = "desktop" | "tablet" | "phone";
export type SmallTier = Exclude<Tier, "desktop">;

export const TIERS: Tier[] = ["desktop", "tablet", "phone"];
export const TIER_LABEL: Record<Tier, string> = { desktop: "Desktop", tablet: "Tablet", phone: "Phone" };

export const PHONE_MAX_WIDTH = 700;
export const TABLET_MAX_WIDTH = 1100;

export function tierForWidth(width: number): Tier {
  if (width <= PHONE_MAX_WIDTH) return "phone";
  if (width <= TABLET_MAX_WIDTH) return "tablet";
  return "desktop";
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TierOverride extends Partial<Rect> {
  hidden?: boolean;
}

export function hasCustomLayout(section: Section, tier: Tier): boolean {
  return tier !== "desktop" && Boolean(section.layouts?.[tier]);
}

export function isStacked(section: Section, tier: Tier): boolean {
  return tier === "phone" && !hasCustomLayout(section, "phone");
}

const desktopRect = (b: Block): Rect => ({ x: b.x, y: b.y, w: b.w, h: b.h });

export function rectFor(section: Section, block: Block, tier: Tier): Rect {
  if (tier === "desktop" || !hasCustomLayout(section, tier)) return desktopRect(block);
  const o = block.responsive?.[tier] ?? {};
  const fallback = tier === "phone" ? { x: 0, y: block.y, w: gridOf(section).cols, h: block.h } : desktopRect(block);
  return { x: o.x ?? fallback.x, y: o.y ?? fallback.y, w: o.w ?? fallback.w, h: o.h ?? fallback.h };
}

export function setRect(section: Section, block: Block, tier: Tier, rect: Rect): void {
  if (tier === "desktop" || !hasCustomLayout(section, tier)) {
    Object.assign(block, rect);
    return;
  }
  block.responsive = { ...block.responsive, [tier]: { ...block.responsive?.[tier], ...rect } };
}

export function withRect(section: Section, block: Block, tier: Tier, rect: Rect): Block {
  const copy = structuredClone(block);
  setRect(section, copy, tier, rect);
  return copy;
}

export function isHiddenAt(block: Block, tier: Tier): boolean {
  return tier !== "desktop" && Boolean(block.responsive?.[tier]?.hidden);
}

export function setHiddenAt(block: Block, tier: SmallTier, hidden: boolean): void {
  block.responsive = { ...block.responsive, [tier]: { ...block.responsive?.[tier], hidden } };
}

export function minRowsAt(section: Section, tier: Tier): number {
  if (!hasCustomLayout(section, tier)) return section.settings.minRows;
  return (tier === "tablet" ? section.layouts?.tabletMinRows : section.layouts?.phoneMinRows) ?? 0;
}

export function setMinRowsAt(section: Section, tier: Tier, rows: number): void {
  if (!hasCustomLayout(section, tier)) {
    section.settings.minRows = rows;
  } else {
    section.layouts = { ...section.layouts, [tier === "tablet" ? "tabletMinRows" : "phoneMinRows"]: rows };
  }
}

export function tierRows(section: Section, blocks: Block[], tier: Tier, minRows = minRowsAt(section, tier)): number {
  const bottom = blocks.reduce((max, b) => {
    if (isHiddenAt(b, tier)) return max;
    const r = rectFor(section, b, tier);
    return Math.max(max, r.y + r.h);
  }, 0);
  return Math.max(minRows, bottom, 1);
}

export function enableCustomLayout(section: Section, tier: SmallTier, measuredRows?: Map<string, number>): void {
  if (tier === "tablet") {
    for (const b of section.blocks) b.responsive = { ...b.responsive, tablet: { ...b.responsive?.tablet, ...desktopRect(b) } };
  } else {
    const ordered = [...section.blocks].sort((a, b) => a.y - b.y || a.x - b.x);
    let y = 0;
    for (const b of ordered) {
      if (b.responsive?.phone?.hidden) continue;
      const h = measuredRows?.get(b.id) ?? b.h;
      b.responsive = { ...b.responsive, phone: { ...b.responsive?.phone, x: 0, y, w: gridOf(section).cols, h } };
      y += h + 1;
    }
  }
  section.layouts = { ...section.layouts, [tier]: true };
}

export function resetCustomLayout(section: Section, tier: SmallTier): void {
  section.layouts = { ...section.layouts, [tier]: false };
  for (const b of section.blocks) {
    const hidden = b.responsive?.[tier]?.hidden;
    b.responsive = { ...b.responsive, [tier]: hidden ? { hidden } : undefined };
  }
}

export function setHiddenAndReflow(section: Section, block: Block, tier: SmallTier, hidden: boolean): void {
  if (isHiddenAt(block, tier) === hidden) return;
  setHiddenAt(block, tier, hidden);
  if (!hasCustomLayout(section, tier)) return;

  const r = rectFor(section, block, tier);
  const others = section.blocks.filter((b) => b !== block && !isHiddenAt(b, tier));
  const sharesRows = others.some((b) => {
    const o = rectFor(section, b, tier);
    return o.y < r.y + r.h && o.y + o.h > r.y;
  });

  if (hidden && !sharesRows) {
    for (const b of others) {
      const o = rectFor(section, b, tier);
      if (o.y >= r.y + r.h) setRect(section, b, tier, { ...o, y: o.y - r.h });
    }
  } else if (!hidden && sharesRows) {
    for (const b of others) {
      const o = rectFor(section, b, tier);
      if (o.y >= r.y) setRect(section, b, tier, { ...o, y: o.y + r.h });
    }
  }
}
