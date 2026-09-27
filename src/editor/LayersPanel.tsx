import { useEffect, useReducer, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from "react";
import { getBlockDefinition } from "../blocks/registry";
import { blocksOnLayer, createLayer, isolateBlock, layerIdOf, pinLayers, placeInStack, ungroup } from "../model/layers";
import { findPage, findSection, pageSectionsWithShared, type SectionRole } from "../model/ops";
import type { Block, Layer, Section, Site } from "../model/types";
import { selectedBlockIds, useEditor } from "../state/store";
import { cls } from "../util/cls";
import { convertBlocks, densityOf } from "../model/grid";
import { findComponent, variantOf } from "../model/components";
import { describeBlock } from "./layoutCheck";

const icon = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg {...icon}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg {...icon}>
      <path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    </svg>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg {...icon}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d={locked ? "M8 11V7a4 4 0 0 1 8 0v4" : "M8 11V7a4 4 0 0 1 7.5-2"} />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg {...icon}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function FocusIcon() {
  return (
    <svg {...icon}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}

function Caret({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      className={cls("lp-caret", open && "is-open")}
      aria-label={open ? "Collapse" : "Expand"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      ▸
    </button>
  );
}

type DragItem = { kind: "section"; sectionId: string } | { kind: "group"; sectionId: string; layerId: string } | { kind: "block"; sectionId: string; blockIds: string[] };
type DropSpot = { key: string; place: "above" | "below" | "inside" };

const openSections = new Set<string>();
const closedGroups = new Set<string>();

function highlight(sectionId: string, blockId: string, on: boolean) {
  document
    .querySelector(`.editor-canvas [data-section-id="${sectionId}"][data-block-id="${blockId}"]`)
    ?.classList.toggle("is-layer-hover", on);
}

function moveBlocks(draft: Site, pageId: string, from: string, ids: string[], to: string, layerId: string, ref?: { blockId: string; place: "front" | "behind" }) {
  const source = findSection(draft, pageId, from);
  const target = findSection(draft, pageId, to);
  if (!source || !target) return;
  let moving = source.blocks.filter((b) => ids.includes(b.id));
  if (from !== to) {
    source.blocks = source.blocks.filter((b) => !ids.includes(b.id));
    moving = convertBlocks(
      moving.map(({ responsive: _old, ...b }) => b),
      densityOf(source),
      densityOf(target)
    );
  }
  let anchor = ref;
  for (const b of moving) {
    placeInStack(target, b, { layerId, blockId: anchor?.blockId, place: anchor?.place });
    anchor = { blockId: b.id, place: "front" };
  }
}

interface RowProps {
  children: ReactNode;
  depth: number;
  rowKey: string;
  selected?: boolean;
  muted?: boolean;
  drag?: DragItem;
  canDrop: (item: DragItem) => DropSpot["place"][] | null;
  onDrop: (item: DragItem, place: DropSpot["place"]) => void;
  onClick?: (e: React.MouseEvent) => void;
  onHover?: (on: boolean) => void;
  dnd: { item: DragItem | null; setItem: (i: DragItem | null) => void; spot: DropSpot | null; setSpot: (s: DropSpot | null) => void };
}

function Row({ children, depth, rowKey, selected, muted, drag, canDrop, onDrop, onClick, onHover, dnd }: RowProps) {
  function placeFor(e: ReactDragEvent<HTMLDivElement>): DropSpot["place"] | null {
    const places = dnd.item ? canDrop(dnd.item) : null;
    if (!places?.length) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (places.includes("inside") && (places.length === 1 || (y > 0.25 && y < 0.75))) return "inside";
    return y < 0.5 ? (places.includes("above") ? "above" : "below") : places.includes("below") ? "below" : "above";
  }
  const spot = dnd.spot?.key === rowKey ? dnd.spot.place : null;
  return (
    <div
      className={cls("lp-row", selected && "is-selected", muted && "is-muted", spot && `is-drop-${spot}`)}
      style={{ paddingLeft: 6 + depth * 14 }}
      draggable={Boolean(drag)}
      onDragStart={(e) => {
        if (!drag) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", rowKey);
        dnd.setItem(drag);
      }}
      onDragEnd={() => {
        dnd.setItem(null);
        dnd.setSpot(null);
      }}
      onDragOver={(e) => {
        const place = placeFor(e);
        if (!place) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dnd.spot?.key !== rowKey || dnd.spot.place !== place) dnd.setSpot({ key: rowKey, place });
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && dnd.spot?.key === rowKey) dnd.setSpot(null);
      }}
      onDrop={(e) => {
        const place = placeFor(e);
        const item = dnd.item;
        dnd.setItem(null);
        dnd.setSpot(null);
        if (!place || !item) return;
        e.preventDefault();
        onDrop(item, place);
      }}
      onClick={onClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      {children}
    </div>
  );
}

function Rename({ value, onDone }: { value: string; onDone: (name: string | null) => void }) {
  return (
    <input
      className="lp-rename"
      autoFocus
      defaultValue={value}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => onDone(e.target.value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") onDone(null);
      }}
    />
  );
}

export function LayersPanel() {
  const { state, page, commit, select, focusLayer } = useEditor();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [item, setItem] = useState<DragItem | null>(null);
  const [spot, setSpot] = useState<DropSpot | null>(null);
  const dnd = { item, setItem, spot, setSpot };
  const panelRef = useRef<HTMLDivElement>(null);
  const pageId = page.id;
  const selection = state.selection;
  const selectedIds = selectedBlockIds(selection);
  const making = findComponent(state.site.components, state.componentId);
  const sections: { section: Section; role: SectionRole }[] = making
    ? [{ section: variantOf(making, state.componentVariantId).section, role: "component" }]
    : pageSectionsWithShared(state.site, page);

  if (selection.kind !== "none") openSections.add(selection.sectionId);
  if (state.focusedLayer) openSections.add(state.focusedLayer.sectionId);
  if (openSections.size === 0 && sections[0]) openSections.add((sections.find((s) => s.role === "page") ?? sections[0]).section.id);
  useEffect(() => {
    panelRef.current?.querySelector(".lp-row.is-selected")?.scrollIntoView({ block: "nearest" });
  }, [selection]);

  function mutate(sectionId: string, recipe: (s: Section) => void, key?: string) {
    commit((draft) => {
      const s = findSection(draft, pageId, sectionId);
      if (s) recipe(s);
    }, key);
  }

  function selectBlock(e: React.MouseEvent, section: Section, block: Block) {
    if ((e.shiftKey || e.ctrlKey || e.metaKey) && selection.kind === "block" && selection.sectionId === section.id) {
      const ids = selectedIds.includes(block.id) ? selectedIds.filter((id) => id !== block.id) : [...selectedIds, block.id];
      select(ids.length ? { kind: "block", sectionId: section.id, blockId: ids[ids.length - 1], blockIds: ids } : { kind: "section", sectionId: section.id });
    } else {
      select({ kind: "block", sectionId: section.id, blockId: block.id });
    }
  }

  function addGroup(section: Section) {
    const layer = createLayer(`Group ${section.layers.length + 1}`);
    mutate(section.id, (s) => void s.layers.push(layer));
    openSections.add(section.id);
    focusLayer({ sectionId: section.id, layerId: layer.id });
  }

  function renderBlock(section: Section, block: Block, depth: number) {
    const key = `b:${section.id}:${block.id}`;
    const selected = selectedIds.includes(block.id) && selection.kind === "block" && selection.sectionId === section.id;
    const dragIds = selected && selectedIds.length > 1 ? selectedIds : [block.id];
    return (
      <Row
        key={key}
        rowKey={key}
        depth={depth}
        selected={selected}
        muted={block.hidden}
        dnd={dnd}
        drag={{ kind: "block", sectionId: section.id, blockIds: dragIds }}
        canDrop={(it) => (it.kind === "block" && !it.blockIds.includes(block.id) ? ["above", "below"] : null)}
        onDrop={(it, place) => {
          if (it.kind !== "block") return;
          commit((draft) => moveBlocks(draft, pageId, it.sectionId, it.blockIds, section.id, layerIdOf(section, block), { blockId: block.id, place: place === "above" ? "front" : "behind" }));
          select({ kind: "block", sectionId: section.id, blockId: it.blockIds[0], blockIds: it.blockIds });
        }}
        onClick={(e) => selectBlock(e, section, block)}
        onHover={(on) => highlight(section.id, block.id, on)}
      >
        <span className="lp-icon lp-icon--block">{getBlockDefinition(block.type)?.icon}</span>
        {renaming === key ? (
          <Rename
            value={describeBlock(block)}
            onDone={(name) => {
              setRenaming(null);
              if (name !== null) mutate(section.id, (s) => {
                const b = s.blocks.find((x) => x.id === block.id);
                if (b) b.name = name === describeBlock({ ...block, name: undefined }) ? undefined : name;
              });
            }}
          />
        ) : (
          <span className="lp-name" title="Double-click to rename" onDoubleClick={() => setRenaming(key)}>
            {describeBlock(block)}
          </span>
        )}
        <span className="lp-tools">
          <button
            className="lp-tool lp-tool--hover"
            title="Put in its own group (it can then overlap others freely, and be focused on its own)"
            onClick={(e) => {
              e.stopPropagation();
              let made: string | null = null;
              mutate(section.id, (s) => void (made = isolateBlock(s, block.id, describeBlock(block))));
              if (made) closedGroups.delete(made);
            }}
          >
            ⧉
          </button>
          <button
            className={cls("lp-tool", block.locked && "is-on")}
            title={block.locked ? "Unlock" : "Lock (can't be selected or moved on the canvas)"}
            onClick={(e) => {
              e.stopPropagation();
              mutate(section.id, (s) => {
                const b = s.blocks.find((x) => x.id === block.id);
                if (b) b.locked = !b.locked || undefined;
              });
            }}
          >
            <LockIcon locked={Boolean(block.locked)} />
          </button>
          <button
            className={cls("lp-tool", block.hidden && "is-on")}
            title={block.hidden ? "Show" : "Hide (everywhere, until shown again)"}
            onClick={(e) => {
              e.stopPropagation();
              mutate(section.id, (s) => {
                const b = s.blocks.find((x) => x.id === block.id);
                if (b) b.hidden = !b.hidden || undefined;
              });
            }}
          >
            <EyeIcon open={!block.hidden} />
          </button>
        </span>
      </Row>
    );
  }

  function renderGroup(section: Section, layer: Layer, index: number, depth: number) {
    const key = `g:${section.id}:${layer.id}`;
    const blocks = blocksOnLayer(section, layer.id).reverse();
    const open = !closedGroups.has(layer.id);
    const focused = state.focusedLayer?.sectionId === section.id && state.focusedLayer.layerId === layer.id;
    const single = section.layers.length === 1;
    return (
      <li key={key} className={cls("lp-group", focused && "is-focused")}>
        <Row
          rowKey={key}
          depth={depth}
          muted={layer.hidden}
          dnd={dnd}
          drag={single ? undefined : { kind: "group", sectionId: section.id, layerId: layer.id }}
          canDrop={(it) =>
            it.kind === "block" ? ["inside"] : it.kind === "group" && it.sectionId === section.id && it.layerId !== layer.id ? ["above", "below"] : null
          }
          onDrop={(it, place) => {
            if (it.kind === "block") {
              commit((draft) => moveBlocks(draft, pageId, it.sectionId, it.blockIds, section.id, layer.id));
              closedGroups.delete(layer.id);
              select({ kind: "block", sectionId: section.id, blockId: it.blockIds[0], blockIds: it.blockIds });
            } else if (it.kind === "group") {
              mutate(section.id, (s) => {
                pinLayers(s);
                const from = s.layers.findIndex((l) => l.id === it.layerId);
                const [moved] = s.layers.splice(from, 1);
                const at = s.layers.findIndex((l) => l.id === layer.id);
                s.layers.splice(place === "above" ? at + 1 : at, 0, moved);
              });
            }
          }}
          onClick={() => focusLayer(focused ? null : { sectionId: section.id, layerId: layer.id })}
        >
          <Caret
            open={open}
            onClick={() => {
              if (open) closedGroups.add(layer.id);
              else closedGroups.delete(layer.id);
              rerender();
            }}
          />
          <span className="lp-icon">
            <FolderIcon />
          </span>
          {renaming === key ? (
            <Rename
              value={layer.name}
              onDone={(name) => {
                setRenaming(null);
                if (name) mutate(section.id, (s) => {
                  const l = s.layers.find((x) => x.id === layer.id);
                  if (l) l.name = name;
                });
              }}
            />
          ) : (
            <span className="lp-name lp-name--group" title="Double-click to rename. Click to focus this group." onDoubleClick={() => setRenaming(key)}>
              {layer.name} <span className="lp-count">{blocks.length}</span>
            </span>
          )}
          <span className="lp-tools">
            <button
              className={cls("lp-tool", focused && "is-on")}
              title={focused ? "Stop focusing" : "Focus: work on just this group (others dim; new blocks land here)"}
              onClick={(e) => {
                e.stopPropagation();
                focusLayer(focused ? null : { sectionId: section.id, layerId: layer.id });
              }}
            >
              <FocusIcon />
            </button>
            {!single && (
              <button
                className="lp-tool lp-tool--hover"
                title="Ungroup: remove the group, keep its blocks"
                onClick={(e) => {
                  e.stopPropagation();
                  mutate(section.id, (s) => ungroup(s, layer.id));
                }}
              >
                ⊟
              </button>
            )}
            <button
              className={cls("lp-tool", layer.locked && "is-on")}
              title={layer.locked ? "Unlock group" : "Lock group"}
              onClick={(e) => {
                e.stopPropagation();
                mutate(section.id, (s) => {
                  const l = s.layers.find((x) => x.id === layer.id);
                  if (l) l.locked = !l.locked;
                });
              }}
            >
              <LockIcon locked={layer.locked} />
            </button>
            <button
              className={cls("lp-tool", layer.hidden && "is-on")}
              title={layer.hidden ? "Show group" : "Hide group"}
              onClick={(e) => {
                e.stopPropagation();
                mutate(section.id, (s) => {
                  const l = s.layers.find((x) => x.id === layer.id);
                  if (l) l.hidden = !l.hidden;
                });
              }}
            >
              <EyeIcon open={!layer.hidden} />
            </button>
          </span>
        </Row>
        {open &&
          (blocks.length ? (
            <ul className="lp-children">{blocks.map((b) => <li key={b.id}>{renderBlock(section, b, depth + 1)}</li>)}</ul>
          ) : (
            <p className="lp-empty" style={{ paddingLeft: 6 + (depth + 1) * 14 }}>
              Empty{focused ? ": blocks you add now land here" : ": drag blocks here"}
            </p>
          ))}
      </li>
    );
  }

  function renderSection(section: Section, role: SectionRole) {
    const key = `s:${section.id}`;
    const open = openSections.has(section.id);
    const single = section.layers.length === 1;
    return (
      <li key={key} className="lp-section">
        <Row
          rowKey={key}
          depth={0}
          selected={selection.kind === "section" && selection.sectionId === section.id}
          dnd={dnd}
          drag={role === "page" ? { kind: "section", sectionId: section.id } : undefined}
          canDrop={(it) => (it.kind === "section" && role === "page" && it.sectionId !== section.id ? ["above", "below"] : it.kind === "block" ? ["inside"] : null)}
          onDrop={(it, place) => {
            if (it.kind === "section") {
              commit((draft) => {
                const p = findPage(draft, pageId);
                if (!p) return;
                const from = p.sections.findIndex((s) => s.id === it.sectionId);
                const [moved] = p.sections.splice(from, 1);
                const at = p.sections.findIndex((s) => s.id === section.id);
                p.sections.splice(place === "above" ? at : at + 1, 0, moved);
              });
            } else if (it.kind === "block") {
              const top = section.layers[section.layers.length - 1].id;
              commit((draft) => moveBlocks(draft, pageId, it.sectionId, it.blockIds, section.id, top));
              openSections.add(section.id);
              select({ kind: "block", sectionId: section.id, blockId: it.blockIds[0], blockIds: it.blockIds });
            }
          }}
          onClick={() => select({ kind: "section", sectionId: section.id })}
        >
          <Caret
            open={open}
            onClick={() => {
              if (open) openSections.delete(section.id);
              else openSections.add(section.id);
              rerender();
            }}
          />
          <span className="lp-icon lp-icon--section">▭</span>
          <span className="lp-name lp-name--section">
            {section.name}
            {role !== "page" && <span className="lp-tag">shared {role}</span>}
          </span>
          <span className="lp-tools">
            <button
              className="lp-tool lp-tool--hover"
              title="Add a group to this section"
              onClick={(e) => {
                e.stopPropagation();
                addGroup(section);
              }}
            >
              +
            </button>
          </span>
        </Row>
        {open && (
          <ul className="lp-children">
            {single
              ? blocksOnLayer(section, section.layers[0].id)
                  .reverse()
                  .map((b) => <li key={b.id}>{renderBlock(section, b, 1)}</li>)
              : section.layers
                  .map((layer, i) => ({ layer, i }))
                  .reverse()
                  .map(({ layer, i }) => renderGroup(section, layer, i, 1))}
            {single && section.blocks.length === 0 && (
              <p className="lp-empty" style={{ paddingLeft: 20 }}>
                No blocks yet
              </p>
            )}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="layers-panel" ref={panelRef}>
      <p className="panel-hint">
        Every block is a layer; the top of the list is in front. Drag to restack, or to move blocks into another group
        or section. Blocks in one group make room for each other; give something its own group (⧉) to let it overlap
        freely.
      </p>
      <ul className="lp-tree">{sections.map(({ section, role }) => renderSection(section, role))}</ul>
    </div>
  );
}
