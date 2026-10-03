import { getBlockDefinition } from "../blocks/registry";
import { stripRich } from "../site/richText";
import { layerIdOf } from "../model/layers";
import { isHiddenAt, isStacked, rectFor, setRect, type Rect, type Tier } from "../model/responsive";
import { findSection, pageSectionsWithShared } from "../model/ops";
import { arranges, settleBlocks, solidRect } from "../model/collisions";
import { gridOf } from "../model/grid";
import { ROW_HEIGHT, type Block, type Page, type Section, type Site } from "../model/types";

export type LayoutIssue =
  | { kind: "overflow"; key: string; sectionId: string; blockId: string; neededRows: number }
  | { kind: "overlap"; key: string; sectionId: string; blockId: string; otherId: string };

export type FixId = "grow-push" | "grow" | "move-below-push" | "move-below";

export const FIX_LABELS: Record<FixId, string> = {
  "grow-push": "Grow & make room",
  grow: "Grow only",
  "move-below-push": "Move below & make room",
  "move-below": "Move below only"
};

export function fixesFor(issue: LayoutIssue): FixId[] {
  return issue.kind === "overflow" ? ["grow-push", "grow"] : ["move-below-push", "move-below"];
}

function opposite(a: Block, b: Block): boolean {
  return Boolean(a.orientation && b.orientation && a.orientation !== b.orientation);
}

function isContentBlock(block: Block): boolean {
  return getBlockDefinition(block.type)?.mobileHeight === "content" && block.type !== "divider";
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function naturalHeight(content: HTMLElement): number {
  const children = Array.from(content.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
  if (children.length === 0) {
    return content.scrollHeight;
  }
  const bottom = Math.max(
    ...children.map((child) => (child.offsetParent === content ? 0 : -content.offsetTop) + child.offsetTop + child.offsetHeight)
  );
  return bottom + (parseFloat(getComputedStyle(content).paddingBottom) || 0);
}

export function scanLayout(root: HTMLElement, site: Site, page: Page, tier: Tier): LayoutIssue[] {
  const issues: LayoutIssue[] = [];

  for (const el of root.querySelectorAll<HTMLElement>("[data-block-id]")) {
    const sectionId = el.dataset.sectionId!;
    const blockId = el.dataset.blockId!;
    const section = findSection(site, page.id, sectionId);
    const block = section?.blocks.find((b) => b.id === blockId);
    const content = el.querySelector<HTMLElement>(".editor-block-content")?.firstElementChild as HTMLElement | null;
    if (!section || !block || !content || !isContentBlock(block) || isStacked(section, tier) || isHiddenAt(block, tier) || getBlockDefinition(block.type)?.grows) continue;
    const neededRows = Math.ceil((naturalHeight(content) - 2) / gridOf(section).rowHeight);
    if (neededRows > rectFor(section, block, tier).h) {
      issues.push({ kind: "overflow", key: `overflow:${blockId}`, sectionId, blockId, neededRows });
    }
  }

  for (const { section } of pageSectionsWithShared(site, page)) {
    if (isStacked(section, tier)) continue;
    const visible = new Set(Array.from(root.querySelectorAll<HTMLElement>(`[data-section-id="${section.id}"]`), (el) => el.dataset.blockId));
    const blocks = section.blocks.filter((b) => arranges(b) && visible.has(b.id) && !isHiddenAt(b, tier));
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const ri = solidRect(section, blocks[i], tier);
        const rj = solidRect(section, blocks[j], tier);
        const [upper, lower] = ri.y <= rj.y ? [blocks[i], blocks[j]] : [blocks[j], blocks[i]];
        if (layerIdOf(section, upper) === layerIdOf(section, lower) && !opposite(upper, lower) && intersects(ri, rj)) {
          issues.push({
            kind: "overlap",
            key: `overlap:${lower.id}:${upper.id}`,
            sectionId: section.id,
            blockId: lower.id,
            otherId: upper.id
          });
        }
      }
    }
  }
  return issues;
}

function makeRoom(section: Section, start: Block, tier: Tier): void {
  settleBlocks(section, tier, [start.id], { settle: false });
}

export function applyFix(draft: Site, pageId: string, issue: LayoutIssue, fix: FixId, tier: Tier): void {
  const section = findSection(draft, pageId, issue.sectionId);
  const block = section?.blocks.find((b) => b.id === issue.blockId);
  if (!section || !block) return;

  const rect = rectFor(section, block, tier);
  if (issue.kind === "overflow") {
    setRect(section, block, tier, { ...rect, h: Math.max(rect.h, issue.neededRows) });
  } else {
    const other = section.blocks.find((b) => b.id === issue.otherId);
    if (!other) return;
    const o = rectFor(section, other, tier);
    setRect(section, block, tier, { ...rect, y: Math.max(rect.y, o.y + o.h) });
  }
  if (fix === "grow-push" || fix === "move-below-push") makeRoom(section, block, tier);
}

export function describeBlock(block: Block | undefined): string {
  if (!block) return "Missing block";
  if (block.name?.trim()) return block.name.trim();
  const def = getBlockDefinition(block.type);
  const text = stripRich(String(block.props.text ?? block.props.title ?? block.props.label ?? block.props.brand ?? "")).replace(/\s+/g, " ").trim();
  const snippet = text.length > 22 ? `${text.slice(0, 22)}…` : text;
  return snippet ? `${def?.label ?? block.type} “${snippet}”` : (def?.label ?? block.type);
}
