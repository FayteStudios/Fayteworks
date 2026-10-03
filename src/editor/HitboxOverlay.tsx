import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { HITBOX_LIMIT, hitboxBounds, hitboxPath, outlineOf, seatOf, type Hitbox } from "../model/hitbox";
import { hitboxRoles } from "../model/extras";
import { findSection } from "../model/ops";
import type { Block } from "../model/types";
import { useEditor } from "../state/store";

const clamp = (n: number) => Math.round(Math.max(-HITBOX_LIMIT, Math.min(100 + HITBOX_LIMIT, n)) * 10) / 10;

export function useHitboxEdit(sectionId: string, blockId: string) {
  const { page, commit } = useEditor();
  return (recipe: (hb: Hitbox) => Hitbox, key = "edit") =>
    commit((draft) => {
      const b = findSection(draft, page.id, sectionId)?.blocks.find((x) => x.id === blockId);
      if (!b) return;
      const next = recipe({ ...(b.hitbox ?? {}) });
      if (!next.shape && !next.inset && !next.points && typeof next.seat !== "number" && !next.role) delete b.hitbox;
      else b.hitbox = next;
    }, `${blockId}.hitbox.${key}`);
}

type Grip = { kind: "edge"; side: 0 | 1 | 2 | 3 } | { kind: "seat" } | { kind: "point"; i: number };

export function HitboxOverlay({ block, sectionId, selected }: { block: Block; sectionId: string; selected: boolean }) {
  const { state, setHitboxView } = useEditor();
  const edit = useHitboxEdit(sectionId, block.id);
  const box = useRef<HTMLDivElement>(null);
  const hb = block.hitbox;
  const drawing = state.hitboxDraw === block.id;
  const b = hitboxBounds(hb);
  const seat = seatOf(hb);
  const pts = outlineOf(hb);
  const role = hitboxRoles.find((r) => r.value === hb?.role)?.label;

  const at = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) };
  };

  const grab = (grip: Grip) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (grip.kind === "point" && e.altKey) {
      edit((h) => ({ ...h, points: (h.points ?? []).filter((_, k) => k !== grip.i * 2 && k !== grip.i * 2 + 1) }), "points");
      return;
    }
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const p = at(ev);
      edit((h) => {
        if (grip.kind === "seat") return { ...h, seat: p.y };
        if (grip.kind === "point") {
          const next = [...(h.points ?? [])];
          next[grip.i * 2] = p.x;
          next[grip.i * 2 + 1] = p.y;
          return { ...h, points: next };
        }
        const inset: [number, number, number, number] = [...(h.inset ?? [0, 0, 0, 0])] as [number, number, number, number];
        if (grip.side === 0) inset[0] = p.y;
        if (grip.side === 1) inset[1] = clamp(100 - p.x);
        if (grip.side === 2) inset[2] = clamp(100 - p.y);
        if (grip.side === 3) inset[3] = p.x;
        return { ...h, inset };
      }, grip.kind);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const addPoint = (e: ReactPointerEvent) => {
    if (!drawing) return;
    e.stopPropagation();
    e.preventDefault();
    if (e.detail > 1) {
      setHitboxView(true, null);
      return;
    }
    const p = at(e);
    edit((h) => ({ ...h, shape: "outline", points: [...(h.shape === "outline" ? (h.points ?? []) : []), p.x, p.y] }), "points");
  };

  return (
    <div ref={box} className={`hb-overlay${selected ? " is-selected" : ""}${drawing ? " is-drawing" : ""}`} onPointerDown={drawing ? addPoint : undefined} aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={hitboxPath(hb)} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="hb-seat" style={{ top: `${seat}%`, left: `${b.left}%`, width: `${b.right - b.left}%` }}>
        {selected && !drawing && <span className="hb-grip hb-grip--seat" title="Seat: where it rests. Drag up or down." onPointerDown={grab({ kind: "seat" })} />}
      </span>
      {(role || drawing) && <span className="hb-tag">{drawing ? "Click to add points · double-click to finish" : role}</span>}
      {selected &&
        !drawing &&
        hb?.shape !== "outline" &&
        ([
          [0, (b.left + b.right) / 2, b.top],
          [1, b.right, (b.top + b.bottom) / 2],
          [2, (b.left + b.right) / 2, b.bottom],
          [3, b.left, (b.top + b.bottom) / 2]
        ] as const).map(([side, x, y]) => (
          <span key={side} className="hb-grip" style={{ left: `${x}%`, top: `${y}%` }} title="Drag to move this edge of the hitbox" onPointerDown={grab({ kind: "edge", side })} />
        ))}
      {selected &&
        hb?.shape === "outline" &&
        pts.map(([x, y], i) => (
          <span key={i} className="hb-grip hb-grip--point" style={{ left: `${x}%`, top: `${y}%` }} title="Drag to move · Alt-click to remove" onPointerDown={grab({ kind: "point", i })} />
        ))}
    </div>
  );
}
