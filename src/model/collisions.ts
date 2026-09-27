import { getBlockDefinition } from "../blocks/registry";
import { layerIdOf } from "./layers";
import { isHiddenAt, rectFor, setRect, type Tier } from "./responsive";
import type { Block, Section } from "./types";

type Rect = { x: number; y: number; w: number; h: number };

export function isFlowBlock(block: Block): boolean {
  return getBlockDefinition(block.type)?.mobileHeight === "content" && block.type !== "divider";
}

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function collides(section: Section, tier: Tier, a: Block, b: Block): boolean {
  return (
    a !== b &&
    isFlowBlock(a) &&
    isFlowBlock(b) &&
    layerIdOf(section, a) === layerIdOf(section, b) &&
    !isHiddenAt(a, tier) &&
    !isHiddenAt(b, tier) &&
    !(a.orientation && b.orientation && a.orientation !== b.orientation) &&
    intersects(rectFor(section, a, tier), rectFor(section, b, tier))
  );
}

export function settleBlocks(section: Section, tier: Tier, movedIds: string[], { settle = true } = {}): void {
  const moved = section.blocks.filter((b) => movedIds.includes(b.id));
  const others = section.blocks.filter((b) => !movedIds.includes(b.id));
  if (moved.length === 0) return;

  if (settle) {
    for (let guard = 0; guard < 200; guard++) {
      let shift = 0;
      for (const m of moved) {
        const mr = rectFor(section, m, tier);
        for (const o of others) {
          if (!collides(section, tier, m, o)) continue;
          const or = rectFor(section, o, tier);
          if (or.y < mr.y) shift = Math.max(shift, or.y + or.h - mr.y);
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
    const mr = rectFor(section, mover, tier);
    for (const b of section.blocks) {
      if (!collides(section, tier, mover, b)) continue;
      const r = rectFor(section, b, tier);
      if (moved.includes(b)) {
        if (!moved.includes(mover)) {
          setRect(section, mover, tier, { ...mr, y: r.y + r.h });
          queue.push(mover);
          break;
        }
        continue;
      }
      if (r.y < mr.y) continue;
      setRect(section, b, tier, { ...r, y: mr.y + mr.h });
      queue.push(b);
    }
  }
}
