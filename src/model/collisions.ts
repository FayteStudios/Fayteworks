import { getBlockDefinition } from "../blocks/registry";
import { layerIdOf } from "./layers";
import { hitboxBounds } from "./hitbox";
import { isHiddenAt, rectFor, setRect, type Tier } from "./responsive";
import type { Block, Section } from "./types";

type Rect = { x: number; y: number; w: number; h: number };

export function isFlowBlock(block: Block): boolean {
  return getBlockDefinition(block.type)?.mobileHeight === "content" && block.type !== "divider";
}

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Whether a piece keeps others out of its way while arranging: its hitbox says so, or it's content. */
export function arranges(block: Block): boolean {
  return block.hitbox?.arrange ?? isFlowBlock(block);
}

/** The piece's hitbox in grid cells (fractions allowed). */
export function solidRect(section: Section, block: Block, tier: Tier): Rect {
  const r = rectFor(section, block, tier);
  if (!block.hitbox) return r;
  const b = hitboxBounds(block.hitbox);
  return { x: r.x + (r.w * b.left) / 100, y: r.y + (r.h * b.top) / 100, w: (r.w * (b.right - b.left)) / 100, h: (r.h * (b.bottom - b.top)) / 100 };
}

export function collides(section: Section, tier: Tier, a: Block, b: Block): boolean {
  return (
    a !== b &&
    arranges(a) &&
    arranges(b) &&
    layerIdOf(section, a) === layerIdOf(section, b) &&
    !isHiddenAt(a, tier) &&
    !isHiddenAt(b, tier) &&
    !(a.orientation && b.orientation && a.orientation !== b.orientation) &&
    intersects(solidRect(section, a, tier), solidRect(section, b, tier))
  );
}

const below = (n: number) => Math.max(0, Math.ceil(n - 1e-6));

export function settleBlocks(section: Section, tier: Tier, movedIds: string[], { settle = true } = {}): void {
  const moved = section.blocks.filter((b) => movedIds.includes(b.id));
  const others = section.blocks.filter((b) => !movedIds.includes(b.id));
  if (moved.length === 0) return;

  if (settle) {
    for (let guard = 0; guard < 200; guard++) {
      let shift = 0;
      for (const m of moved) {
        const mh = solidRect(section, m, tier);
        for (const o of others) {
          if (!collides(section, tier, m, o)) continue;
          const oh = solidRect(section, o, tier);
          if (oh.y < mh.y) shift = Math.max(shift, below(oh.y + oh.h - mh.y));
        }
      }
      if (shift === 0) break;
      for (const m of moved) {
        const r = rectFor(section, m, tier);
        setRect(section, m, tier, { ...r, y: r.y + shift });
      }
    }
  }

  const queue = [...moved];
  for (let guard = 0; queue.length > 0 && guard < 5000; guard++) {
    const mover = queue.shift()!;
    for (const b of section.blocks) {
      if (!collides(section, tier, mover, b)) continue;
      const mh = solidRect(section, mover, tier);
      const bh = solidRect(section, b, tier);
      if (moved.includes(b)) {
        if (!moved.includes(mover)) {
          const mr = rectFor(section, mover, tier);
          setRect(section, mover, tier, { ...mr, y: mr.y + below(bh.y + bh.h - mh.y) });
          queue.push(mover);
          break;
        }
        continue;
      }
      if (bh.y < mh.y) continue;
      const r = rectFor(section, b, tier);
      setRect(section, b, tier, { ...r, y: r.y + below(mh.y + mh.h - bh.y) });
      queue.push(b);
    }
  }
}
