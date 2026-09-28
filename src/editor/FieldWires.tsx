import { useEffect, useRef, useState } from "react";
import { getBlockDefinition } from "../blocks/registry";
import { findComponent, variantOf } from "../model/components";
import type { FieldDef } from "../model/fields";
import type { Block, CollectionFieldType } from "../model/types";
import { useEditor } from "../state/store";
import { itemFieldsOf, useCardSource } from "./cardSource";

const TOKEN = /\{\{\s*item\.([\w-]+)\s*\}\}/g;
const TEXT_KEYS = ["text", "title", "heading", "label", "content", "caption", "body", "name", "value", "quote", "alt"];

type Point = { x: number; y: number };

function findBlockAnywhere(root: unknown, id: string): Block | undefined {
  const stack: unknown[] = [root];
  while (stack.length) {
    const v = stack.pop();
    if (!v || typeof v !== "object") continue;
    if (Array.isArray(v)) {
      for (const x of v) stack.push(x);
      continue;
    }
    const o = v as Record<string, unknown>;
    if (o.id === id && typeof o.type === "string" && o.props && typeof o.props === "object") return o as unknown as Block;
    for (const x of Object.values(o)) if (x && typeof x === "object") stack.push(x);
  }
  return undefined;
}

function pickProp(fields: FieldDef[], type: CollectionFieldType | "url" | undefined): FieldDef | undefined {
  if (type === "image") return fields.find((f) => f.kind === "image");
  if (type === "link" || type === "url") return fields.find((f) => f.kind === "link");
  const texts = fields.filter((f) => f.kind === "text" || f.kind === "textarea");
  return TEXT_KEYS.map((k) => texts.find((f) => f.key === k)).find(Boolean) ?? texts[0];
}

function centre(el: Element | null): Point | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function FieldWires() {
  const { state, page, commit } = useEditor();
  const card = useCardSource();
  const making = findComponent(state.site.components, state.componentId);
  const active = Boolean(card && state.mode === "edit" && (making || (page.collectionId && !state.focusedBlock)));
  const [drag, setDrag] = useState<{ key: string; to: Point; target: string | null } | null>(null);
  const [wires, setWires] = useState<{ key: string; from: Point; to: Point }[]>([]);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(true);
  const dock = useRef<HTMLDivElement>(null);

  const blocks: Block[] = making ? variantOf(making, state.componentVariantId).section.blocks : page.sections.flatMap((s) => s.blocks);
  const bound = blocks.flatMap((b) =>
    [...new Set(Object.values(b.props).flatMap((v) => (typeof v === "string" ? [...v.matchAll(TOKEN)].map((m) => m[1]) : [])))].map((key) => ({ key, id: b.id }))
  );
  const boundKey = JSON.stringify(bound);

  useEffect(() => {
    if (!active || !open) return;
    let frame = 0;
    const tick = () => {
      const list = bound
        .map(({ key, id }) => {
          const from = centre(dock.current?.querySelector(`[data-knob="${key}"]`) ?? null);
          const el = document.querySelector(`.editor [data-block-id="${id}"]`);
          if (!from || !el) return null;
          const r = el.getBoundingClientRect();
          return { key, from, to: { x: r.right - 6, y: r.top + Math.min(r.height / 2, 24) } };
        })
        .filter((w): w is { key: string; from: Point; to: Point } => w !== null);
      setWires((prev) => (JSON.stringify(prev) === JSON.stringify(list) ? prev : list));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, open, boundKey]);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(""), 3200);
    return () => window.clearTimeout(t);
  }, [note]);

  if (!active || !card) return null;
  const fields = itemFieldsOf(card.collection);
  const typeOf = (key: string) => (key === "url" ? "url" : card.collection.fields.find((f) => f.key === key)?.type);

  function targetAt(p: Point): string | null {
    const el = document.elementsFromPoint(p.x, p.y).find((e) => e.closest(".editor [data-block-id]"));
    return (el?.closest("[data-block-id]") as HTMLElement | null)?.dataset.blockId ?? null;
  }

  function connect(key: string, blockId: string) {
    const block = findBlockAnywhere(state.site, blockId);
    if (!block) return;
    const def = getBlockDefinition(block.type);
    const fieldDefs = def ? [...(def.extraFields?.(block.props, state.site) ?? []), ...def.fields] : [];
    const prop = pickProp(fieldDefs, typeOf(key));
    const label = fields.find((f) => f.key === key)?.label ?? key;
    if (!prop) {
      setNote(`A ${def?.label ?? block.type} has nothing that can show “${label}”. Try a ${typeOf(key) === "image" ? "picture" : typeOf(key) === "link" || typeOf(key) === "url" ? "button or link" : "text"} piece.`);
      return;
    }
    commit((draft) => {
      const target = findBlockAnywhere(draft, blockId);
      if (target) target.props[prop.key] = `{{item.${key}}}`;
    }, `wire.${blockId}.${prop.key}`);
    setNote(`${def?.label ?? "The piece"} · ${prop.label} now shows each item's ${label}.`);
  }

  function start(key: string, e: React.PointerEvent) {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const to = { x: ev.clientX, y: ev.clientY };
      setDrag({ key, to, target: targetAt(to) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const target = targetAt({ x: ev.clientX, y: ev.clientY });
      setDrag(null);
      if (target) connect(key, target);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    setDrag({ key, to: { x: e.clientX, y: e.clientY }, target: null });
  }

  const dragFrom = drag ? centre(dock.current?.querySelector(`[data-knob="${drag.key}"]`) ?? null) : null;
  const targetRect = drag?.target ? document.querySelector(`.editor [data-block-id="${drag.target}"]`)?.getBoundingClientRect() : null;
  const curve = (a: Point, b: Point) => {
    const dir = b.x >= a.x ? 1 : -1;
    const dx = Math.max(40, Math.abs(b.x - a.x) / 2) * dir;
    return `M${a.x} ${a.y} C${a.x + dx} ${a.y} ${b.x - dx} ${b.y} ${b.x} ${b.y}`;
  };

  return (
    <>
      <div className="field-wires" ref={dock}>
        <button className="field-wires-head" onClick={() => setOpen(!open)} aria-expanded={open}>
          <strong>{card.collection.name} fields</strong>
          <span>{open ? "–" : "+"}</span>
        </button>
        {open && (
          <>
            <p className="field-wires-hint">Drag a dot onto a piece to fill it from that field.</p>
            <ul>
              {fields.map((f) => (
                <li key={f.key} className={bound.some((b) => b.key === f.key) ? "is-bound" : undefined}>
                  <button className="field-knob" data-knob={f.key} aria-label={`Connect ${f.label} to a piece`} title={`Drag onto a piece to show each item's ${f.label}`} onPointerDown={(e) => start(f.key, e)} />
                  <span>{f.label}</span>
                </li>
              ))}
            </ul>
            {note && <p className="field-wires-note">{note}</p>}
          </>
        )}
      </div>
      {open && (
        <svg className="field-wires-lines" aria-hidden>
          {wires.map((w, i) => (
            <g key={`${w.key}-${i}`}>
              <path d={curve(w.from, w.to)} className="field-wire" />
              <circle cx={w.to.x} cy={w.to.y} r={4} className="field-wire-end" />
            </g>
          ))}
          {drag && dragFrom && <path d={curve(dragFrom, drag.to)} className="field-wire is-dragging" />}
          {targetRect && <rect x={targetRect.left} y={targetRect.top} width={targetRect.width} height={targetRect.height} rx={6} className="field-wire-target" />}
        </svg>
      )}
    </>
  );
}
