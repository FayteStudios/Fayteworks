import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { needsDescription } from "../quality/altText";
import { openAltText } from "../quality/AltTextDialog";
import { useClientLock } from "../client/clientMode";
import { createSheet } from "../model/design";
import { getBlockDefinition } from "../blocks/registry";
import { createBlock, createSection } from "../model/factory";
import { cloneSection, findBlock, findPage, findSection, maxBottom, moveItem, removeSection, sectionRows, type SectionRole } from "../model/ops";
import type { Block, Section } from "../model/types";
import { gridOf, screensNeeded, screensOf, toSectionSize } from "../model/grid";
import { settleBlocks } from "../model/collisions";
import { BlockContent, SectionShell, blockStyle, inFlowOrder, mobileHeightOf, sectionRowsByTier, turnMarkup } from "../site/SiteRenderer";
import { createLayer, isBlockVisible, layerOf, targetLayerId } from "../model/layers";
import { isCardShell, shellOf } from "../model/shells";
import { cardLayouts, pieceAttrs } from "../model/extras";
import {
  enableCustomLayout,
  ensureOwnLayout,
  mirrorEdit,
  hasCustomLayout,
  isHiddenAt,
  isStacked,
  rectFor,
  resetCustomLayout,
  setMinRowsAt,
  setRect,
  TIER_LABEL,
  withRect,
  type SmallTier,
  type Tier
} from "../model/responsive";
import { editorOrientation, editorTier, selectedBlockIds, useEditor } from "../state/store";
import { cls } from "../util/cls";
import { InlineMaker } from "./ComponentMaker";
import { HitboxOverlay } from "./HitboxOverlay";
import { describeLink, LinkDialog } from "./LinkPicker";
import { findComponent } from "../model/components";
import { promptSaveComponent } from "./ComponentsGroup";
import { useInlineEditing } from "./InlineEdit";
import { useIssues } from "./issues";
import { activeLibraryDrag, LIBRARY_MIME } from "./libraryDrag";

type Rect = { x: number; y: number; w: number; h: number };
type Edges = { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean };

type DragState =
  | ({ kind: "move"; clickedId: string; origs: Record<string, Rect>; dc: number; dr: number } & BlockGesture)
  | ({ kind: "resize"; blockId: string; edges: Edges; orig: Rect; current: Rect; aspect?: number } & BlockGesture)
  | { kind: "section"; tier: Tier; startY: number; rowStep: number; origRows: number; currentRows: number }
  | { kind: "band"; startX: number; startY: number; x: number; y: number };

interface BlockGesture {
  tier: Tier;
  startX: number;
  scroll0: number;
  startY: number;
  colStep: number;
  rowStep: number;
  grabY: number;
  alt: boolean;
  preview: Record<string, Rect>;
  pushed: boolean;
}

function nearestEdge(edges: number[], px: number, rowStep: number): number {
  const last = edges.length - 1;
  if (px >= edges[last]) return last + Math.round((px - edges[last]) / rowStep);
  let best = 0;
  for (let i = 1; i <= last; i++) if (Math.abs(edges[i] - px) < Math.abs(edges[best] - px)) best = i;
  return best;
}

function rowAt(edges: number[], px: number, rowStep: number): number {
  const last = edges.length - 1;
  if (px >= edges[last]) return last + Math.floor((px - edges[last]) / rowStep);
  for (let i = 0; i < last; i++) if (px < edges[i + 1]) return i;
  return last;
}

const BAND_THRESHOLD = 4;

type Guide = { axis: "v" | "h"; line: number; side: "start" | "end" };

function alignmentGuides(moving: Rect[], others: Rect[]): Guide[] {
  if (moving.length === 0) return [];
  const box = {
    x: Math.min(...moving.map((r) => r.x)),
    y: Math.min(...moving.map((r) => r.y)),
    right: Math.max(...moving.map((r) => r.x + r.w)),
    bottom: Math.max(...moving.map((r) => r.y + r.h))
  };
  const guides = new Map<string, Guide>();
  const add = (g: Guide) => guides.set(`${g.axis}${g.line}${g.side}`, g);
  for (const o of others) {
    if (o.x === box.x) add({ axis: "v", line: box.x, side: "start" });
    if (o.x + o.w === box.right) add({ axis: "v", line: box.right, side: "end" });
    for (const edge of [box.y, box.bottom]) {
      if (edge === o.y || edge === o.y + o.h) add({ axis: "h", line: edge, side: "start" });
    }
  }
  return [...guides.values()];
}

function guideStyle(g: Guide, rows: number): CSSProperties {
  if (g.axis === "v") {
    return g.side === "start"
      ? { gridColumn: `${g.line + 1} / span 1`, gridRow: "1 / -1", borderLeftWidth: 1 }
      : { gridColumn: `${g.line} / span 1`, gridRow: "1 / -1", borderRightWidth: 1 };
  }
  return g.line < rows
    ? { gridRow: `${g.line + 1} / span 1`, gridColumn: "1 / -1", borderTopWidth: 1 }
    : { gridRow: `${g.line} / span 1`, gridColumn: "1 / -1", borderBottomWidth: 1 };
}

const HANDLES: { name: string; edges: Edges }[] = [
  { name: "n", edges: { top: true } },
  { name: "s", edges: { bottom: true } },
  { name: "e", edges: { right: true } },
  { name: "w", edges: { left: true } },
  { name: "ne", edges: { top: true, right: true } },
  { name: "nw", edges: { top: true, left: true } },
  { name: "se", edges: { bottom: true, right: true } },
  { name: "sw", edges: { bottom: true, left: true } }
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function applyDelta(orig: Rect, edges: Edges | null, dc: number, dr: number, cols: number): Rect {
  if (!edges) {
    return { ...orig, x: clamp(orig.x + dc, 0, cols - orig.w), y: Math.max(0, orig.y + dr) };
  }
  let { x, y, w, h } = orig;
  if (edges.right) {
    w = clamp(orig.w + dc, 1, cols - orig.x);
  }
  if (edges.left) {
    x = clamp(orig.x + dc, 0, orig.x + orig.w - 1);
    w = orig.w + orig.x - x;
  }
  if (edges.bottom) {
    h = Math.max(1, orig.h + dr);
  }
  if (edges.top) {
    y = clamp(orig.y + dr, 0, orig.y + orig.h - 1);
    h = orig.h + orig.y - y;
  }
  return { x, y, w, h };
}

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const gridArea = (r: Rect): CSSProperties => ({ gridColumn: `${r.x + 1} / span ${r.w}`, gridRow: `${r.y + 1} / span ${r.h}` });

interface Props {
  section: Section;
  role: SectionRole;
  index: number;
  total: number;
}

export function SectionEditor({ section, role, index, total }: Props) {
  const { state, page, commit, select, focusBlock, editComponent } = useEditor();
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropHint, setDropHint] = useState<Rect | null>(null);
  const { issues } = useIssues();
  const sectionElRef = useRef<HTMLDivElement>(null);
  const getSectionEl = useCallback(() => sectionElRef.current, []);
  const inline = useInlineEditing(section.id, getSectionEl);
  const blocksWithIssues = new Set(issues.filter((i) => i.sectionId === section.id).map((i) => i.blockId));

  const pageId = page.id;
  const sectionId = section.id;
  const grid = gridOf(section, role === "component");
  const tier = editorTier(state);
  const orientation = editorOrientation(state);
  const clientLocked = useClientLock();
  const ownScreen = tier !== "desktop" && state.editScope === "screen";
  const layoutLocked = (isStacked(section, tier) && !ownScreen) || clientLocked;
  const measuredRef = useRef<Map<string, number> | undefined>(undefined);
  const measureRows = () => {
    const measured = new Map<string, number>();
    gridRef.current?.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => {
      measured.set(el.dataset.blockId!, Math.max(1, Math.ceil((el.offsetHeight - 2) / grid.rowHeight)));
    });
    return measured;
  };
  const sideways = role === "page" && shellOf(page).type === "sideways";
  const roomCols = sideways ? grid.cols + grid.cols / screensOf(section) : grid.cols;
  const ownCopy = () => {
    const copy = structuredClone(section);
    ensureOwnLayout(copy, tier, state.editScope, measuredRef.current);
    if (sideways) copy.screens = screensOf(section) + 1;
    return copy;
  };
  const { selection } = state;
  const selectedIds = selection.kind === "block" && selection.sectionId === sectionId ? selectedBlockIds(selection) : [];
  const primaryBlockId = selectedIds.length > 0 && selection.kind === "block" ? selection.blockId : null;
  const isSectionSelected = selection.kind === "section" && selection.sectionId === sectionId;
  const isActive = isSectionSelected || selectedIds.length > 0;

  const lastPointer = useRef({ x: 0, y: 0 });

  function resolveGesture(targets: Record<string, Rect>, isMove: boolean, alt: boolean, gestureTier: Tier): { preview: Record<string, Rect>; pushed: boolean } {
    const base = ownCopy();
    const copy = structuredClone(base);
    for (const [id, r] of Object.entries(targets)) {
      const b = copy.blocks.find((x) => x.id === id);
      if (b) setRect(copy, b, gestureTier, r);
    }
    if (!alt && !state.freeform) settleBlocks(copy, gestureTier, Object.keys(targets), { settle: isMove });
    const preview: Record<string, Rect> = {};
    let pushed = false;
    for (const b of copy.blocks) {
      const now = rectFor(copy, b, gestureTier);
      const before = base.blocks.find((x) => x.id === b.id);
      if (targets[b.id] || (before && !sameRect(now, rectFor(base, before, gestureTier)))) {
        preview[b.id] = now;
        if (!targets[b.id]) pushed = true;
      }
    }
    return { preview, pushed };
  }

  function measureRowEdges(): number[] {
    const grid = gridRef.current;
    const scale = canvasScale();
    const edges = [0];
    if (grid) {
      const gap = (parseFloat(getComputedStyle(grid).rowGap) || 0) * scale;
      for (const track of getComputedStyle(grid).gridTemplateRows.split(/\s+/)) {
        const px = parseFloat(track);
        if (!Number.isNaN(px)) edges.push(edges[edges.length - 1] + px * scale + (edges.length > 1 ? gap : 0));
      }
    }
    return edges;
  }

  function updateDrag(next: DragState | null) {
    dragRef.current = next;
    setDrag(next);
  }

  const isDragging = drag !== null;
  useEffect(() => {
    if (!isDragging) {
      return;
    }
    function onMove(event: PointerEvent) {
      const d = dragRef.current;
      if (!d) {
        return;
      }
      if (d.kind === "band") {
        updateDrag({ ...d, x: event.clientX, y: event.clientY });
        return;
      }
      if (d.kind === "section") {
        const dr = Math.round((event.clientY - d.startY) / d.rowStep);
        updateDrag({ ...d, currentRows: Math.max(1, d.origRows + dr) });
        return;
      }
      lastPointer.current = { x: event.clientX, y: event.clientY };
      step(d, event.clientX, event.clientY, event.altKey);
      if (sideways && !edgeRaf) edgeRaf = requestAnimationFrame(edgeScroll);
    }
    let edgeRaf = 0;
    function edgeScroll() {
      edgeRaf = 0;
      const d = dragRef.current;
      const strip = sectionElRef.current?.closest<HTMLElement>(".editor-strip");
      if (!d || (d.kind !== "move" && d.kind !== "resize") || !strip) return;
      const box = strip.getBoundingClientRect();
      const { x, y } = lastPointer.current;
      const speed = x > box.right - 48 ? 16 : x < box.left + 48 ? -16 : 0;
      if (!speed) return;
      const before = strip.scrollLeft;
      strip.scrollLeft += speed;
      if (strip.scrollLeft !== before) step(d, x, y, d.alt);
      edgeRaf = requestAnimationFrame(edgeScroll);
    }
    function onKey(event: KeyboardEvent) {
      const d = dragRef.current;
      if (event.key !== "Alt" || !d || (d.kind !== "move" && d.kind !== "resize")) return;
      event.preventDefault();
      step(d, lastPointer.current.x, lastPointer.current.y, event.type === "keydown");
    }
    function step(d: DragState & { kind: "move" | "resize" }, clientX: number, clientY: number, alt: boolean) {
      const strip = sideways ? sectionElRef.current?.closest<HTMLElement>(".editor-strip") : null;
      const scrolled = strip ? (strip.scrollLeft - d.scroll0) * canvasScale() : 0;
      const dc = Math.round((clientX - d.startX + scrolled) / d.colStep);
      const edges = measureRowEdges();
      const edgePx = clientY - d.grabY - (gridRef.current?.getBoundingClientRect().top ?? 0);
      const edgeRow = nearestEdge(edges, edgePx, d.rowStep);
      if (d.kind === "move") {
        const anchor = d.origs[d.clickedId];
        const dr = edgeRow - anchor.y;
        const rects = Object.values(d.origs);
        const minX = Math.min(...rects.map((r) => r.x));
        const maxRight = Math.max(...rects.map((r) => r.x + r.w));
        const minY = Math.min(...rects.map((r) => r.y));
        const next = { dc: clamp(dc, -minX, roomCols - maxRight), dr: Math.max(dr, -minY) };
        if (next.dc === d.dc && next.dr === d.dr && alt === d.alt) return;
        const targets = Object.fromEntries(Object.entries(d.origs).map(([id, r]) => [id, { ...r, x: r.x + next.dc, y: r.y + next.dr }]));
        updateDrag({ ...d, ...next, alt, ...resolveGesture(targets, true, alt, d.tier) });
        return;
      }
      const o = d.orig;
      const dr = d.edges.bottom ? edgeRow - (o.y + o.h) : d.edges.top ? edgeRow - o.y : 0;
      let current = applyDelta(o, d.edges, dc, dr, roomCols);
      if (d.aspect) {
        const h = Math.max(1, Math.round((current.w * d.colStep) / d.aspect / d.rowStep));
        current = { ...current, h, y: d.edges.top ? Math.max(0, o.y + o.h - h) : o.y };
      }
      if (sameRect(current, d.current) && alt === d.alt) return;
      updateDrag({ ...d, current, alt, ...resolveGesture({ [d.blockId]: current }, false, alt, d.tier) });
    }
    function onUp() {
      const d = dragRef.current;
      updateDrag(null);
      if (d?.kind === "move" && d.dc === 0 && d.dr === 0 && Object.keys(d.origs).length > 1) {
        select({ kind: "block", sectionId, blockId: d.clickedId });
      }
      if ((d?.kind === "move" && (d.dc !== 0 || d.dr !== 0)) || (d?.kind === "resize" && !sameRect(d.orig, d.current))) {
        const scope = state.editScope;
        const measured = measuredRef.current;
        commit((draft) => {
          const s = findSection(draft, pageId, sectionId);
          if (!s) return;
          ensureOwnLayout(s, d.tier, scope, measured);
          const origs: Record<string, Rect> = d.kind === "move" ? d.origs : { [d.blockId]: d.orig };
          for (const [id, r] of Object.entries(d.preview)) {
            const block = s.blocks.find((b) => b.id === id);
            if (!block) continue;
            setRect(s, block, d.tier, r);
            if (scope === "all" && origs[id]) mirrorEdit(s, block, d.tier, origs[id], r);
          }
          if (sideways && screensNeeded(s) > screensOf(s)) s.screens = screensNeeded(s);
        });
      }
      if (d?.kind === "band" && Math.hypot(d.x - d.startX, d.y - d.startY) > BAND_THRESHOLD) {
        const band = { left: Math.min(d.x, d.startX), right: Math.max(d.x, d.startX), top: Math.min(d.y, d.startY), bottom: Math.max(d.y, d.startY) };
        const ids = Array.from(gridRef.current?.querySelectorAll<HTMLElement>(".editor-block:not(.is-inert)") ?? [])
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.left < band.right && r.right > band.left && r.top < band.bottom && r.bottom > band.top;
          })
          .map((el) => el.dataset.blockId!);
        if (ids.length > 0) select({ kind: "block", sectionId, blockId: ids[0], blockIds: ids });
      }
      if (d?.kind === "section" && d.currentRows !== d.origRows) {
        commit((draft) => {
          const s = findSection(draft, pageId, sectionId);
          if (s) {
            setMinRowsAt(s, d.tier, d.currentRows);
          }
        });
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      cancelAnimationFrame(edgeRaf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [isDragging, commit, select, pageId, sectionId]);

  function previewRect(blockId: string): Rect | null {
    if (drag?.kind === "move" || drag?.kind === "resize") return drag.preview[blockId] ?? null;
    return null;
  }

  const draggedIds = drag?.kind === "move" ? Object.keys(drag.origs) : drag?.kind === "resize" ? [drag.blockId] : [];

  const shown = drag && (drag.kind === "move" || drag.kind === "resize") && (sideways || (ownScreen && !hasCustomLayout(section, tier))) ? ownCopy() : section;
  const blocks = shown.blocks.map((b) => {
    const r = previewRect(b.id);
    return r && (drag?.kind === "move" || drag?.kind === "resize") ? withRect(shown, b, drag.tier, r) : b;
  });

  const guides =
    drag?.kind === "move" || drag?.kind === "resize"
      ? alignmentGuides(
          blocks.filter((b) => draggedIds.includes(b.id)).map((b) => rectFor(section, b, drag.tier)),
          blocks
            .filter((b) => !draggedIds.includes(b.id) && isBlockVisible(section, b) && !isHiddenAt(b, drag.tier))
            .map((b) => rectFor(section, b, drag.tier))
        )
      : [];
  const makingHere = role !== "component" && state.componentAnchor?.sectionId === sectionId ? findComponent(state.site.components, state.componentId) : undefined;
  const rows = sectionRowsByTier(shown, blocks, drag?.kind === "section" ? { tier: drag.tier, minRows: drag.currentRows } : undefined);

  function canvasScale(): number {
    const grid = gridRef.current;
    return grid && grid.offsetWidth ? grid.getBoundingClientRect().width / grid.offsetWidth : 1;
  }

  function columnStep(): number {
    const cols = gridOf(section, role === "component").cols;
    const grid = gridRef.current;
    const width = grid?.getBoundingClientRect().width ?? 0;
    const gap = (grid ? parseFloat(getComputedStyle(grid).columnGap) || 0 : 0) * canvasScale();
    return (width - gap * (cols - 1)) / cols + gap;
  }

  function rowStep(): number {
    return grid.rowHeight * canvasScale();
  }

  function startBlockDrag(event: ReactPointerEvent, blockId: string, edges: Edges | null) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      const ids = selectedIds.includes(blockId) ? selectedIds.filter((id) => id !== blockId) : [...selectedIds, blockId];
      const primary = primaryBlockId && ids.includes(primaryBlockId) ? primaryBlockId : ids[ids.length - 1];
      select(ids.length ? { kind: "block", sectionId, blockId: primary, blockIds: ids } : { kind: "section", sectionId });
      return;
    }

    const group = !edges && selectedIds.length > 1 && selectedIds.includes(blockId);
    const ids = group ? selectedIds : [blockId];
    select(group ? { kind: "block", sectionId, blockId, blockIds: selectedIds } : { kind: "block", sectionId, blockId });
    const block = section.blocks.find((b) => b.id === blockId);
    if (!block || layoutLocked) {
      return;
    }
    event.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
    lastPointer.current = { x: event.clientX, y: event.clientY };
    const blockBox = (event.currentTarget as HTMLElement).closest("[data-block-id]")?.getBoundingClientRect();
    measuredRef.current = ownScreen && !hasCustomLayout(section, tier) ? measureRows() : undefined;
    const base = ownCopy();
    const common = {
      tier,
      startX: event.clientX,
      scroll0: sectionElRef.current?.closest<HTMLElement>(".editor-strip")?.scrollLeft ?? 0,
      startY: event.clientY,
      colStep: columnStep(),
      rowStep: rowStep(),
      grabY: event.clientY - (blockBox ? (edges?.bottom ? blockBox.bottom : blockBox.top) : event.clientY),
      alt: event.altKey,
      preview: {},
      pushed: false
    };
    if (edges) {
      const rect = rectFor(base, base.blocks.find((x) => x.id === blockId) ?? block, tier);
      const img = block.type === "image" ? (event.currentTarget as HTMLElement).closest("[data-block-id]")?.querySelector<HTMLImageElement>("img.b-image") : null;
      const corner = Boolean((edges.left || edges.right) && (edges.top || edges.bottom));
      const aspect = corner && img?.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : undefined;
      updateDrag({ kind: "resize", blockId, edges, orig: rect, current: rect, aspect, ...common });
    } else {
      const origs: Record<string, Rect> = {};
      for (const id of ids) {
        const b = base.blocks.find((x) => x.id === id);
        if (b) origs[id] = rectFor(base, b, tier);
      }
      updateDrag({ kind: "move", clickedId: blockId, origs, dc: 0, dr: 0, ...common });
    }
  }

  function startBand(event: ReactPointerEvent) {
    if (event.button !== 0) return;
    event.stopPropagation();
    select({ kind: "section", sectionId });
    if (layoutLocked) return;
    (document.activeElement as HTMLElement | null)?.blur();
    updateDrag({ kind: "band", startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY });
  }

  function startSectionResize(event: ReactPointerEvent) {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    select({ kind: "section", sectionId });
    updateDrag({ kind: "section", tier, startY: event.clientY, rowStep: rowStep(), origRows: rows[tier], currentRows: rows[tier] });
  }

  function cellAt(clientX: number, clientY: number, w: number, h: number): Rect {
    const bounds = gridRef.current!.getBoundingClientRect();
    if (layoutLocked) {
      return { x: 0, y: maxBottom(section.blocks), w, h };
    }
    const x = clamp(Math.floor((clientX - bounds.left) / columnStep()), 0, grid.cols - w);
    const y = Math.max(0, rowAt(measureRowEdges(), clientY - bounds.top, rowStep()));
    return { x, y, w, h };
  }

  function handleDragOver(event: DragEvent) {
    const type = activeLibraryDrag.type;
    const def = type ? getBlockDefinition(type) : undefined;
    if (!def || !event.dataTransfer.types.includes(LIBRARY_MIME)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const size = toSectionSize(activeLibraryDrag.size ?? def.defaultSize, section);
    const hint = cellAt(event.clientX, event.clientY, size.w, size.h);
    if (!dropHint || !sameRect(hint, dropHint)) {
      setDropHint(hint);
    }
  }

  function handleDragLeave(event: DragEvent) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDropHint(null);
    }
  }

  function handleDrop(event: DragEvent) {
    const type = event.dataTransfer.getData(LIBRARY_MIME);
    const def = getBlockDefinition(type);
    setDropHint(null);
    if (!def) {
      return;
    }
    event.preventDefault();
    const size = toSectionSize(activeLibraryDrag.size ?? def.defaultSize, section);
    const props = activeLibraryDrag.props;
    const into = state.site.components?.find((c) => c.id === props?.componentId);
    if (into && [into.section, ...(into.variants ?? []).map((v) => v.section)].some((s) => s.id === sectionId)) return;
    const cell = cellAt(event.clientX, event.clientY, size.w, size.h);
    const block = { ...createBlock(type, { ...cell, cols: grid.cols }), layerId: targetLayerId(section, state.focusedLayer) };
    if (props) block.props = structuredClone(props);
    if (hasCustomLayout(section, tier)) setRect(section, block, tier, cell);
    const makeRoom = !event.altKey && !state.freeform;
    commit((draft) => {
      const s = findSection(draft, pageId, sectionId);
      if (!s) return;
      if (type === "component" && props?.componentId && role !== "component") {
        const layer = createLayer(draft.components?.find((c) => c.id === props.componentId)?.name ?? "Component");
        s.layers.push(layer);
        block.layerId = layer.id;
      }
      s.blocks.push(block);
      if (makeRoom) settleBlocks(s, tier, [block.id], { settle: false });
    });
    select({ kind: "block", sectionId, blockId: block.id });
  }

  function moveSection(offset: number) {
    commit((draft) => {
      const p = findPage(draft, pageId);
      if (p) {
        moveItem(p.sections, index, index + offset);
      }
    });
  }

  function duplicateSection() {
    const copy = cloneSection(section);
    commit((draft) => {
      findPage(draft, pageId)?.sections.splice(index + 1, 0, copy);
    });
    select({ kind: "section", sectionId: copy.id });
  }

  function customizeLayout(small: SmallTier) {
    const measured = measureRows();
    commit((draft) => {
      const s = findSection(draft, pageId, sectionId);
      if (s) enableCustomLayout(s, small, measured);
    });
  }

  function resetLayout(small: SmallTier) {
    commit((draft) => {
      const s = findSection(draft, pageId, sectionId);
      if (s) resetCustomLayout(s, small);
    });
  }

  function deleteSection() {
    commit((draft) => removeSection(draft, pageId, sectionId));
    select({ kind: "none" });
  }

  return (
    <div
      ref={sectionElRef}
      data-section={sectionId}
      data-shared={role === "header" ? "Header · on every page" : role === "footer" ? "Footer · on every page" : undefined}
      className={cls("editor-section", (role === "header" || role === "footer") && "is-shared", isActive && "is-active", isSectionSelected && "is-selected", drag && "is-dragging", section.blocks.some((b) => selectedIds.includes(b.id) && (b.hang?.x || b.hang?.y)) && "is-showing-hang", state.focusedBlock?.sectionId === sectionId && "is-focus-section")}
      onPointerDown={startBand}
    >
      <SectionShell
        section={shown}
        role={role}
        rows={rows}
        gridRef={gridRef}
        gridProps={{ onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop }}
      >
        {isActive && !layoutLocked && (
          <div className="editor-grid-overlay" aria-hidden>
            {Array.from({ length: grid.cols }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        )}
        {inFlowOrder(section, blocks).map(({ block, z }) => {
          const selected = selectedIds.includes(block.id);
          const onlySelected = selected && selectedIds.length === 1;
          const layer = layerOf(section, block);
          const dimmed = state.focusedLayer?.sectionId === sectionId && state.focusedLayer.layerId !== layer.id;
          const inert = dimmed || layer.locked || Boolean(block.locked);
          const editingText = inline.editingBlockId === block.id;
          const focused = state.focusedBlock?.blockId === block.id;
          const insideHere = Boolean(makingHere) && state.componentAnchor?.blockId === block.id;
          const hiddenNote = isHiddenAt(block, tier)
            ? `Hidden on ${TIER_LABEL[tier].toLowerCase()}`
            : block.orientation && orientation && block.orientation !== orientation
              ? `${block.orientation === "portrait" ? "Portrait" : "Landscape"} only`
              : null;
          return (
            <div
              key={block.id}
              className={cls(
                "site-block",
                "editor-block",
                blocksWithIssues.has(block.id) && "has-issue",
                selected && "is-selected",
                dimmed && "is-dimmed",
                inert && "is-inert",
                hiddenNote && "is-tier-hidden",
                editingText && "is-editing",
                focused && "is-focus-target",
                drag && (drag.kind === "move" || drag.kind === "resize") && drag.preview[block.id] && !draggedIds.includes(block.id) && "is-making-room",
                draggedIds.includes(block.id) && "is-dragged"
              )}
              style={{ ...blockStyle(shown, block, z), ...(insideHere ? undefined : turnMarkup(block)?.style) } as CSSProperties}
              data-turn={!insideHere && turnMarkup(block) ? "" : undefined}
              {...pieceAttrs(block)}
              data-section-id={sectionId}
              data-block-id={block.id}
              data-mobile-height={mobileHeightOf(block)}
              onPointerDown={(event) => (editingText ? event.stopPropagation() : startBlockDrag(event, block.id, null))}
              onDoubleClick={(event) => {
                if (inert || editingText) return;
                const inside = block.type === "component" || block.type === "collection" ? String(block.props.componentId ?? "") : "";
                if (inside && state.focusedBlock?.blockId === block.id && findComponent(state.site.components, inside)) {
                  editComponent(inside, null, { sectionId, blockId: block.id });
                  return;
                }
                focusBlock({ sectionId, blockId: block.id });
                inline.start(event, block, event.currentTarget);
              }}
            >
              <div className="editor-block-content" key={inline.version} data-valign={block.valign}>
                {makingHere && state.componentAnchor?.blockId === block.id ? <InlineMaker def={makingHere} /> : <BlockContent block={block} />}
              </div>
              {drag?.kind === "resize" && drag.blockId === block.id && (
                <span className="editor-block-size">
                  {rectFor(section, block, tier).w} × {rectFor(section, block, tier).h}
                </span>
              )}
              {(drag?.kind === "move" || drag?.kind === "resize") && (drag.kind === "move" ? drag.clickedId : drag.blockId) === block.id && (drag.pushed || drag.alt) && (
                <span className="editor-block-size editor-block-drag-tip">{drag.alt ? "Placing on top (release Alt to make room)" : "Making room · hold Alt to place on top"}</span>
              )}
              {state.hitboxView && <HitboxOverlay block={block} sectionId={sectionId} selected={onlySelected} />}
              {hiddenNote && <span className="editor-block-hidden-tag">{hiddenNote}</span>}
              {onlySelected && !inert && !editingText && <LinkTag block={block} sectionId={sectionId} />}
              {onlySelected && !inert && !editingText && !layoutLocked && <TurnHandle block={block} sectionId={sectionId} />}
              {needsDescription(block) && (
                <button className="editor-alt-tag" title="Screen readers can't describe this picture yet" onPointerDown={(e) => e.stopPropagation()} onClick={() => openAltText(block.id)}>
                  Add a description
                </button>
              )}
              {inline.toolbar(block.id)}
              {focused && !editingText && !makingHere && block.type === "component" && (
                <div className="focus-bar" onPointerDown={(e) => e.stopPropagation()}>
                  <span>
                    <strong>{findComponent(state.site.components, String(block.props.componentId))?.name ?? "Component"}</strong>
                  </span>
                  <button className="is-primary" onClick={() => editComponent(String(block.props.componentId), null, { sectionId, blockId: block.id })} title="Change the pieces inside it; every copy updates">
                    Edit its pieces
                  </button>
                </div>
              )}
              {onlySelected &&
                !layoutLocked &&
                !inert &&
                !editingText &&
                HANDLES.map((handle) => (
                  <span
                    key={handle.name}
                    className={`editor-handle editor-handle--${handle.name}`}
                    onPointerDown={(event) => startBlockDrag(event, block.id, handle.edges)}
                  />
                ))}
            </div>
          );
        })}
        {dropHint && <div className="editor-drop-hint" style={gridArea(dropHint)} />}
        {guides.map((g) => (
          <div key={`${g.axis}${g.line}${g.side}`} className="editor-guide" style={guideStyle(g, rows[tier])} aria-hidden />
        ))}
      </SectionShell>

      {drag?.kind === "band" && sectionElRef.current && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > BAND_THRESHOLD && (() => {
        const box = sectionElRef.current.getBoundingClientRect();
        const scale = canvasScale();
        return (
          <div
            className="editor-band"
            style={{
              left: (Math.min(drag.x, drag.startX) - box.left) / scale,
              top: (Math.min(drag.y, drag.startY) - box.top) / scale,
              width: Math.abs(drag.x - drag.startX) / scale,
              height: Math.abs(drag.y - drag.startY) / scale
            }}
          />
        );
      })()}

      <div className="editor-section-bar" onPointerDown={(event) => event.stopPropagation()}>
        <button className="editor-section-name" onClick={() => select(role === "component" ? { kind: "none" } : { kind: "section", sectionId })}>
          {role === "component" ? "Pieces" : section.name}
          {(role === "header" || role === "footer") && <span className="editor-section-shared"> · on every page</span>}
          {role === "page" && cardLayouts && isCardShell(shellOf(page).type) && <span className="editor-section-shared"> · card {index + 1}</span>}
        </button>
        {role === "page" && !clientLocked && (
          <>
            <button title="Move up" disabled={index === 0} onClick={() => moveSection(-1)}>
              ↑
            </button>
            <button title="Move down" disabled={index === total - 1} onClick={() => moveSection(1)}>
              ↓
            </button>
            <button title="Duplicate section" onClick={duplicateSection}>
              ⧉
            </button>
          </>
        )}
        {tier !== "desktop" &&
          !clientLocked &&
          (hasCustomLayout(section, tier) ? (
            <span className="editor-section-tier">
              Custom {TIER_LABEL[tier].toLowerCase()} layout
              <button title={`Remove the custom layout; ${tier} follows desktop again`} onClick={() => resetLayout(tier)}>
                Reset
              </button>
            </span>
          ) : ownScreen ? null : (
            <button
              className="editor-section-customize"
              title={
                tier === "phone"
                  ? "Phones stack blocks automatically. Customize to arrange this section by hand at phone size."
                  : "Tablets use the desktop arrangement. Customize to arrange this section separately at tablet size."
              }
              onClick={() => customizeLayout(tier)}
            >
              Customize for {TIER_LABEL[tier].toLowerCase()}
            </button>
          ))}
        {role !== "component" && !clientLocked && (
          <>
            <button title="Save a copy of this section" onClick={() => promptSaveComponent(section)}>
              ★
            </button>
            <button title={role === "page" ? "Delete section" : `Remove shared ${role}`} onClick={deleteSection}>
              ✕
            </button>
          </>
        )}
      </div>

      {!layoutLocked && (
        <div className="editor-section-resize" title="Drag to change section height" onPointerDown={startSectionResize}>
          <span />
        </div>
      )}
    </div>
  );
}

export function AddSectionButton({ index }: { index: number }) {
  const { page, commit, select } = useEditor();
  const pageId = page.id;
  return (
    <div className="editor-add-section">
      <button
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          const section = page.design ? createSheet(page.design, `Sheet ${page.sections.length + 1}`) : createSection(`Section ${page.sections.length + 1}`);
          commit((draft) => {
            findPage(draft, pageId)?.sections.splice(index, 0, section);
          });
          select({ kind: "section", sectionId: section.id });
        }}
      >
        {page.design ? "+ Add sheet" : "+ Add section"}
      </button>
    </div>
  );
}

function LinkTag({ block, sectionId }: { block: Block; sectionId: string }) {
  const { state, page, commit } = useEditor();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const field = getBlockDefinition(block.type)?.fields.find((f) => f.kind === "link");
  if (!field) return null;
  const href = String(block.props[field.key] ?? "");
  if (/\{\{/.test(href)) return null;
  const label = String(block.props.label ?? block.props.text ?? "").replace(/<[^>]*>/g, "").trim();
  return (
    <>
      <button
        className="editor-link-tag"
        title="Change where this goes"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ x: r.left, y: r.bottom + 6 });
        }}
      >
        ↗ {describeLink(href, state.site.pages)}
      </button>
      {at && (
        <LinkDialog
          title={label ? `Where “${label.slice(0, 40)}” goes` : "Where this goes"}
          value={href}
          at={at}
          allowBack={Boolean(cardLayouts) && isCardShell(shellOf(page).type)}
          onClose={() => setAt(null)}
          onChange={(next) =>
            commit((draft) => {
              const b = findBlock(draft, page.id, sectionId, block.id);
              if (b) b.props[field.key] = next;
            }, `${block.id}.${field.key}`)
          }
        />
      )}
    </>
  );
}

function TurnHandle({ block, sectionId }: { block: Block; sectionId: string }) {
  const { page, commit } = useEditor();
  const [showing, setShowing] = useState<number | null>(null);
  const start = (e: ReactPointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const host = e.currentTarget.closest(".editor-block");
    if (!host) return;
    const r = host.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const move = (ev: PointerEvent) => {
      let deg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
      if (deg > 180) deg -= 360;
      const step = ev.shiftKey ? 15 : 45;
      const near = Math.round(deg / step) * step;
      deg = ev.shiftKey || Math.abs(near - deg) < 3 ? near : Math.round(deg);
      if (deg === -180) deg = 180;
      setShowing(deg);
      commit((draft) => {
        const b = findBlock(draft, page.id, sectionId, block.id);
        if (!b) return;
        b.turn = { ...(b.turn ?? {}), z: deg };
        if (!b.turn.z && !b.turn.x && !b.turn.y) delete b.turn;
      }, `${block.id}.turn`);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setShowing(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <>
      <span
        className="editor-turn-handle"
        title="Drag to turn (Shift: 15° steps). Double-click to straighten."
        onPointerDown={start}
        onDoubleClick={(e) => {
          e.stopPropagation();
          commit((draft) => {
            const b = findBlock(draft, page.id, sectionId, block.id);
            if (b?.turn) delete b.turn.z;
            if (b?.turn && !b.turn.x && !b.turn.y) delete b.turn;
          });
        }}
      />
      {showing !== null && <span className="editor-block-size">{showing}°</span>}
    </>
  );
}
