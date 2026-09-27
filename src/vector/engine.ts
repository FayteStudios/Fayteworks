import paper from "paper/dist/paper-core";
import { TRACE_MAX_SIDE, traceImageData, type TraceOptions } from "./trace";

export type Tool = "select" | "direct" | "pen" | "pencil" | "rect" | "ellipse" | "polygon" | "star" | "line" | "text" | "hand";
export type BooleanOp = "unite" | "subtract" | "intersect" | "exclude";
export type AlignOp = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

export interface Fill {
  kind: "none" | "solid" | "linear" | "radial";
  color: string;
  color2: string;
  angle: number;
}

export interface StyleInfo {
  fill: Fill;
  stroke: string | null;
  strokeWidth: number;
  dash: boolean;
  cap: "butt" | "round" | "square";
  join: "miter" | "round" | "bevel";
  opacity: number;
}

export interface TextInfo {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  justification: "left" | "center" | "right";
}

export interface TextPathInfo {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fill: string;
  offset: number;
  spacing: number;
}

export interface LayerRow {
  id: number;
  name: string;
  label: string;
  kind: string;
  depth: number;
  visible: boolean;
  locked: boolean;
  selected: boolean;
  isGroup: boolean;
}

export interface EngineCallbacks {
  onChange(): void;
  onEditText(item: paper.PointText, rect: { x: number; y: number; w: number; h: number; fontSize: number }): void;
  onZoom(zoom: number): void;
}

const ACCENT = "#4f8cff";
const HANDLE = 8;
const HISTORY_LIMIT = 100;

function viewBoxOf(svg: string): { x: number; y: number; w: number; h: number } {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  const vb = (root.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every((n) => Number.isFinite(n)) && vb[2] > 0 && vb[3] > 0) return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  const w = parseFloat(root.getAttribute("width") ?? "");
  const h = parseFloat(root.getAttribute("height") ?? "");
  return { x: 0, y: 0, w: w > 0 ? w : 400, h: h > 0 ? h : 300 };
}

const INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
const GENERATED_ID = /^(path|g|rect|circle|ellipse|text|tspan|layer|image|use|polygon|polyline|line|a|flowroot)[-_]?\d+$/i;

interface Preserved {
  rootAttributes: [string, string][];
  nodes: string[];
  layerIds: Set<string>;
  labels: Map<string, string>;
}

function prepareForImport(svg: string, box: { x: number; y: number; w: number; h: number }): { svg: string; preserved: Preserved } {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  const preserved: Preserved = { rootAttributes: [], nodes: [], layerIds: new Set(), labels: new Map() };
  for (const attr of Array.from(root.attributes)) {
    if (attr.name.startsWith("xmlns:") || /^(inkscape|sodipodi):/.test(attr.name)) preserved.rootAttributes.push([attr.name, attr.value]);
  }
  root.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
  root.setAttribute("width", String(box.w));
  root.setAttribute("height", String(box.h));
  for (const el of Array.from(root.querySelectorAll("metadata, namedview, title, desc"))) {
    if (el.parentElement === root && (el.localName === "namedview" || el.localName === "metadata")) preserved.nodes.push(new XMLSerializer().serializeToString(el));
    el.remove();
  }
  const taken = new Set(Array.from(root.querySelectorAll("[id]")).map((el) => el.getAttribute("id")!));
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (el.closest("defs")) continue;
    const label = el.getAttributeNS(INKSCAPE_NS, "label") ?? el.getAttribute("inkscape:label");
    let id = el.getAttribute("id");
    if (label && (!id || GENERATED_ID.test(id))) {
      const base = idFromName(label) || "layer";
      let next = base;
      for (let n = 2; taken.has(next); n++) next = `${base}_${n}`;
      if (id) taken.delete(id);
      taken.add(next);
      el.setAttribute("id", next);
      id = next;
    }
    if (id && label && label !== id.replace(/_/g, " ")) preserved.labels.set(id, label);
    if (id && el.localName === "g" && (el.getAttributeNS(INKSCAPE_NS, "groupmode") ?? el.getAttribute("inkscape:groupmode")) === "layer") preserved.layerIds.add(id);
  }
  convertTextPaths(root);
  return { svg: new XMLSerializer().serializeToString(root), preserved };
}

function convertTextPaths(root: Element) {
  for (const text of Array.from(root.querySelectorAll("text"))) {
    const tp = Array.from(text.children).find((c) => c.localName === "textPath");
    if (!tp) continue;
    const ref = (tp.getAttribute("href") ?? tp.getAttribute("xlink:href") ?? "").replace(/^#/, "");
    const guide = ref ? root.querySelector(`[id="${CSS.escape(ref)}"]`) : null;
    const d = guide?.getAttribute("d");
    if (!d) continue;
    const style = (name: string) => text.getAttribute(name) ?? (text.getAttribute("style") ?? "").match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`))?.[1]?.trim() ?? null;
    const offset = tp.getAttribute("startOffset") ?? "0";
    const info: TextPathInfo = {
      content: tp.textContent ?? "",
      fontFamily: style("font-family") ?? "system-ui, sans-serif",
      fontSize: parseFloat(style("font-size") ?? "24") || 24,
      fontWeight: style("font-weight") ?? "normal",
      fill: style("fill") ?? "#1d1b18",
      offset: offset.endsWith("%") ? parseFloat(offset) || 0 : 0,
      spacing: parseFloat(style("letter-spacing") ?? "0") || 0
    };
    const ns = "http://www.w3.org/2000/svg";
    const group = root.ownerDocument.createElementNS(ns, "g");
    group.setAttribute("data-paper-data", JSON.stringify({ textPath: info }));
    if (text.getAttribute("id")) group.setAttribute("id", text.getAttribute("id")!);
    const copy = root.ownerDocument.createElementNS(ns, "path");
    copy.setAttribute("d", d);
    if (guide!.getAttribute("transform")) copy.setAttribute("transform", guide!.getAttribute("transform")!);
    copy.setAttribute("fill", "none");
    copy.setAttribute("data-paper-data", JSON.stringify({ guide: true }));
    group.appendChild(copy);
    text.replaceWith(group);
    if (guide!.closest("defs") || (guide!.getAttribute("fill") === "none" && !guide!.getAttribute("stroke"))) guide!.remove();
  }
}

export function idFromName(name: string): string {
  const id = name.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_-]/g, "");
  return id ? (/^[A-Za-z_]/.test(id) ? id : `_${id}`) : "";
}

const toHex = (color: paper.Color | null | undefined): string | null => {
  if (!color || color.alpha === 0) return null;
  const c = color.convert("rgb") as paper.Color;
  return `#${[c.red, c.green, c.blue].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
};

function mods(e: paper.ToolEvent): { shift: boolean; alt: boolean } {
  const native = (e as unknown as { event?: MouseEvent }).event;
  return { shift: native?.shiftKey ?? e.modifiers.shift, alt: native?.altKey ?? e.modifiers.alt };
}

export class DrawingEngine {
  readonly scope: paper.PaperScope;
  private back: paper.Layer;
  private refLayer: paper.Layer;
  reference: paper.Raster | null = null;
  private onionLayer: paper.Layer;
  refAdjust = false;
  readonly art: paper.Layer;
  private ui: paper.Layer;
  private board!: paper.Path;
  box: { x: number; y: number; w: number; h: number };
  tool: Tool = "select";
  selection: paper.Item[] = [];
  private nodes: paper.Segment[] = [];
  options = { sides: 6, points: 5, snap: false, grid: 8 };
  defaults: { fill: string | null; stroke: string | null; strokeWidth: number } = { fill: "#d9d4cc", stroke: null, strokeWidth: 2 };
  lineDefaults: { stroke: string; strokeWidth: number } = { stroke: "#1d1b18", strokeWidth: 2 };
  fonts: { heading: string; body: string } = { heading: "Georgia, serif", body: "system-ui, sans-serif" };
  private history: string[] = [];
  private future: string[] = [];
  private lastCommit = { key: "", at: 0 };
  private clipboard: paper.Item[] = [];
  private spaceDown = false;
  private penPath: paper.Path | null = null;
  private previewPath: paper.Path | null = null;
  private destroyed = false;
  private preserved: Preserved = { rootAttributes: [], nodes: [], layerIds: new Set(), labels: new Map() };

  constructor(
    private canvas: HTMLCanvasElement,
    svg: string,
    private callbacks: EngineCallbacks
  ) {
    this.scope = new paper.PaperScope();
    this.scope.setup(canvas);
    this.scope.settings.handleSize = 7;
    this.back = new this.scope.Layer();
    this.refLayer = new this.scope.Layer();
    this.refLayer.opacity = 0.5;
    this.onionLayer = new this.scope.Layer();
    this.onionLayer.locked = true;
    this.art = new this.scope.Layer();
    this.ui = new this.scope.Layer();
    this.box = viewBoxOf(svg);
    this.load(svg);
    this.drawBoard();
    this.art.activate();
    this.setupTool();
    canvas.addEventListener("dblclick", this.onDoubleClick);
    this.history = [this.snapshot()];
    this.fit();
  }

  destroy() {
    this.destroyed = true;
    this.canvas.removeEventListener("dblclick", this.onDoubleClick);
    this.scope.tool?.remove();
    this.scope.project?.remove();
  }

  private load(svg: string) {
    let imported: paper.Item | null = null;
    try {
      const prepared = prepareForImport(svg, this.box);
      this.preserved = prepared.preserved;
      imported = this.scope.project.importSVG(prepared.svg, { insert: false, expandShapes: true, applyMatrix: true }) as paper.Item;
    } catch {
      imported = null;
    }
    if (!imported) return;
    let kids = imported.children ? [...imported.children].filter((k) => !k.clipMask) : [imported];
    while (kids.length === 1 && kids[0] instanceof this.scope.Group && !kids[0].name && !kids[0].clipped && !kids[0].data?.textPath) kids = [...kids[0].children];
    for (const kid of kids) {
      if (kid.clipMask) {
        kid.remove();
        continue;
      }
      this.art.addChild(kid);
    }
    for (const group of this.textPathGroups()) this.layoutTextPath(group);
  }

  private drawBoard() {
    this.back.removeChildren();
    this.back.activate();
    this.board = new this.scope.Path.Rectangle({
      point: [this.box.x, this.box.y],
      size: [this.box.w, this.box.h],
      fillColor: "white",
      shadowColor: new this.scope.Color(0, 0, 0, 0.35),
      shadowBlur: 18,
      locked: true
    });
    this.art.activate();
  }

  setSize(w: number, h: number) {
    this.box = { ...this.box, w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
    this.drawBoard();
    this.commit();
  }

  exportSvg(): string {
    this.clearSelectionFlags();
    const ns = "http://www.w3.org/2000/svg";
    const doc = document.implementation.createDocument(ns, "svg", null);
    const root = doc.documentElement;
    const { x, y, w, h } = this.box;
    root.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    root.setAttribute("width", String(w));
    root.setAttribute("height", String(h));
    const layer = this.art.exportSVG({ asString: false, precision: 2 }) as SVGElement;
    for (const child of Array.from(layer.childNodes)) root.appendChild(doc.importNode(child, true));
    this.exportTextPaths(doc, root);
    this.restorePreserved(doc, root);
    const out = new XMLSerializer().serializeToString(root);
    this.refresh();
    return out;
  }

  private snapshot(): string {
    this.clearSelectionFlags();
    const json = JSON.stringify({ box: this.box, art: this.art.exportJSON({ asString: false }), ref: this.reference ? this.reference.matrix.values : null });
    return json;
  }

  commit(key = "") {
    for (const group of this.textPathGroups()) this.layoutTextPath(group);
    const now = Date.now();
    const snap = this.snapshot();
    if (key && key === this.lastCommit.key && now - this.lastCommit.at < 800 && this.history.length > 1) this.history[this.history.length - 1] = snap;
    else this.history.push(snap);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.future = [];
    this.lastCommit = { key, at: now };
    this.refresh();
  }

  private restore(snap: string) {
    const { box, art, ref } = JSON.parse(snap);
    if (ref && this.reference) this.reference.matrix = new this.scope.Matrix(ref);
    this.box = box;
    this.drawBoard();
    this.art.removeChildren();
    this.art.importJSON(art);
    this.art.activate();
    this.selection = [];
    this.nodes = [];
    this.refresh();
  }

  undo() {
    this.finishPen();
    if (this.history.length < 2) return;
    this.future.push(this.history.pop()!);
    this.restore(this.history[this.history.length - 1]);
  }

  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(next);
    this.restore(next);
  }

  markClean() {
    this.history = [this.snapshot()];
    this.future = [];
    this.refresh();
  }

  get canUndo() {
    return this.history.length > 1;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  get dirty() {
    return this.history.length > 1;
  }

  get zoom() {
    return this.scope.view.zoom;
  }

  resize(width: number, height: number) {
    this.scope.view.viewSize = new this.scope.Size(width, height);
    this.refresh();
  }

  zoomTo(zoom: number, anchor?: paper.Point) {
    const view = this.scope.view;
    const z = Math.max(0.05, Math.min(64, zoom));
    const at = anchor ?? view.center;
    const before = at;
    const viewPoint = view.projectToView(before);
    view.zoom = z;
    const after = view.viewToProject(viewPoint);
    view.center = view.center.add(before.subtract(after));
    this.callbacks.onZoom(z);
    this.refresh();
  }

  fit() {
    const view = this.scope.view;
    const { width, height } = view.viewSize;
    if (!width || !height) return;
    const z = Math.min((width - 80) / this.box.w, (height - 80) / this.box.h);
    view.zoom = Math.max(0.05, z);
    view.center = new this.scope.Point(this.box.x + this.box.w / 2, this.box.y + this.box.h / 2);
    this.callbacks.onZoom(view.zoom);
    this.refresh();
  }

  wheel(event: WheelEvent) {
    event.preventDefault();
    const view = this.scope.view;
    const rect = this.canvas.getBoundingClientRect();
    const at = view.viewToProject(new this.scope.Point(event.clientX - rect.left, event.clientY - rect.top));
    if (event.ctrlKey || event.metaKey) {
      this.zoomTo(view.zoom * Math.pow(1.0015, -event.deltaY), at);
    } else {
      const dx = event.shiftKey ? event.deltaY : event.deltaX;
      const dy = event.shiftKey ? 0 : event.deltaY;
      view.center = view.center.add(new this.scope.Point(dx, dy).divide(view.zoom));
      this.refresh();
    }
  }

  private clearSelectionFlags() {
    for (const item of this.art.getItems({ recursive: true })) {
      if (item.selected) item.selected = false;
      if (item instanceof this.scope.Path) for (const s of item.segments) s.selected = false;
    }
  }

  private topLevel(item: paper.Item): paper.Item {
    let current = item;
    while (current.parent && current.parent !== this.art) current = current.parent;
    return current;
  }

  select(items: paper.Item[]) {
    this.selection = items.filter((i) => !i.locked);
    this.nodes = [];
    this.refresh();
  }

  selectById(id: number, add = false) {
    const item = this.art.getItem({ recursive: true, match: (i: paper.Item) => i.id === id });
    if (!item) return;
    this.select(add ? (this.selection.includes(item) ? this.selection.filter((i) => i !== item) : [...this.selection, item]) : [item]);
  }

  selectAll() {
    this.select(this.art.children.filter((i) => i.visible && !i.locked));
  }

  private restorePreserved(doc: XMLDocument, root: Element) {
    const { rootAttributes, nodes, layerIds, labels } = this.preserved;
    const usesInkscape = rootAttributes.some(([name]) => name === "xmlns:inkscape");
    for (const [name, value] of rootAttributes) {
      if (name.startsWith("xmlns:")) root.setAttributeNS(XMLNS_NS, name, value);
      else if (name.startsWith("inkscape:")) root.setAttributeNS(INKSCAPE_NS, name, value);
      else if (name.startsWith("sodipodi:")) root.setAttributeNS("http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd", name, value);
    }
    for (const markup of nodes.slice().reverse()) {
      const wrapper = new DOMParser().parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="${INKSCAPE_NS}" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">${markup}</svg>`,
        "image/svg+xml"
      );
      const node = wrapper.documentElement.firstElementChild;
      if (node && !wrapper.querySelector("parsererror")) root.insertBefore(doc.importNode(node, true), root.firstChild);
    }
    if (!usesInkscape) return;
    for (const el of Array.from(root.querySelectorAll("[id]"))) {
      if (el.namespaceURI !== "http://www.w3.org/2000/svg" || el.closest("defs") || el.localName === "clipPath" || el.localName.endsWith("Gradient")) continue;
      const id = el.getAttribute("id")!;
      if (GENERATED_ID.test(id)) continue;
      el.setAttributeNS(INKSCAPE_NS, "inkscape:label", labels.get(id) ?? id.replace(/_/g, " "));
      if (layerIds.has(id) && el.localName === "g" && el.parentElement === root) el.setAttributeNS(INKSCAPE_NS, "inkscape:groupmode", "layer");
    }
  }

  private refresh() {
    if (this.destroyed) return;
    this.ui.removeChildren();
    this.clearSelectionFlags();
    const z = this.scope.view.zoom;
    if (this.tool === "direct") {
      for (const item of this.selection) {
        item.selected = true;
        item.selectedColor = new this.scope.Color(ACCENT);
      }
      for (const s of this.nodes) if (s.path) s.selected = true;
    } else if (this.selection.length && this.tool === "select") {
      const b = this.selectionBounds()!;
      this.ui.activate();
      new this.scope.Path.Rectangle({ rectangle: b, strokeColor: ACCENT, strokeWidth: 1 / z, dashArray: this.selection.length > 1 ? [4 / z, 3 / z] : undefined });
      const size = HANDLE / z;
      for (const [name, point] of this.handlePoints(b)) {
        const handle = new this.scope.Path.Rectangle({ point: point.subtract(size / 2), size: [size, size], fillColor: "white", strokeColor: ACCENT, strokeWidth: 1 / z });
        handle.data.handle = name;
      }
      const top = b.topCenter;
      const knobAt = top.subtract(new this.scope.Point(0, 22 / z));
      new this.scope.Path.Line({ from: top, to: knobAt, strokeColor: ACCENT, strokeWidth: 1 / z });
      const knob = new this.scope.Path.Circle({ center: knobAt, radius: 5 / z, fillColor: "white", strokeColor: ACCENT, strokeWidth: 1 / z });
      knob.data.handle = "rotate";
      this.art.activate();
    }
    this.callbacks.onChange();
  }

  selectionBounds(): paper.Rectangle | null {
    if (!this.selection.length) return null;
    return this.selection.map((i) => i.bounds).reduce((a, b) => a.unite(b));
  }

  private handlePoints(b: paper.Rectangle): [string, paper.Point][] {
    return [
      ["nw", b.topLeft],
      ["n", b.topCenter],
      ["ne", b.topRight],
      ["e", b.rightCenter],
      ["se", b.bottomRight],
      ["s", b.bottomCenter],
      ["sw", b.bottomLeft],
      ["w", b.leftCenter]
    ];
  }

  setTool(tool: Tool) {
    this.finishPen();
    this.tool = tool;
    this.canvas.dataset.tool = tool;
    this.refresh();
  }

  setSpace(down: boolean) {
    this.spaceDown = down;
    this.canvas.dataset.tool = down ? "hand" : this.tool;
  }

  private snap(point: paper.Point): paper.Point {
    if (!this.options.snap) return point;
    const g = this.options.grid;
    return new this.scope.Point(Math.round(point.x / g) * g, Math.round(point.y / g) * g);
  }

  private constrain(from: paper.Point, to: paper.Point): paper.Point {
    const v = to.subtract(from);
    const angle = Math.round(v.angle / 45) * 45;
    return from.add(new this.scope.Point({ angle, length: v.length }));
  }

  private applyDefaults(item: paper.Item, line = false) {
    if (line) {
      item.strokeColor = new this.scope.Color(this.lineDefaults.stroke);
      item.strokeWidth = this.lineDefaults.strokeWidth;
      item.fillColor = null;
      (item as paper.Path).strokeCap = "round";
      (item as paper.Path).strokeJoin = "round";
    } else {
      item.fillColor = this.defaults.fill ? new this.scope.Color(this.defaults.fill) : null;
      item.strokeColor = this.defaults.stroke ? new this.scope.Color(this.defaults.stroke) : null;
      item.strokeWidth = this.defaults.strokeWidth;
    }
  }

  private onDoubleClick = (event: MouseEvent) => {
    if (this.tool !== "select" || this.spaceDown || this.refAdjust) return;
    const rect = this.canvas.getBoundingClientRect();
    const point = this.scope.view.viewToProject(new this.scope.Point(event.clientX - rect.left, event.clientY - rect.top));
    const hit = this.art.hitTest(point, { fill: true, stroke: true, segments: true, tolerance: 5 / this.scope.view.zoom, match: (h: paper.HitResult) => !h.item.locked && h.item.visible });
    if (!hit) return;
    if (hit.item.parent?.data?.textPath) {
      this.select([hit.item.parent]);
    } else if (hit.item instanceof this.scope.PointText) {
      this.select([hit.item]);
      this.editText(hit.item);
    } else if (hit.item.parent !== this.art) {
      this.select([hit.item]);
    }
  };

  private setupTool() {
    const tool = new this.scope.Tool();
    tool.minDistance = 0;
    let mode: "none" | "move" | "scale" | "rotate" | "marquee" | "pan" | "shape" | "node" | "handle" | "pencil" | "pen-drag" = "none";
    let start: paper.Point;
    let last: paper.Point;
    let handleName = "";
    let startBounds: paper.Rectangle | null = null;
    let shape: paper.Item | null = null;
    let marquee: paper.Path | null = null;
    let dragHandle: { segment: paper.Segment; which: "in" | "out" } | null = null;
    let changed = false;
    let lastClick = { at: 0, point: new this.scope.Point(0, 0) };

    const hitOptions = (extra: object = {}) => ({ fill: true, stroke: true, segments: true, tolerance: 5 / this.scope.view.zoom, ...extra });

    tool.onMouseDown = (e: paper.ToolEvent) => {
      const native = (e as unknown as { event: MouseEvent }).event;
      const now = Date.now();
      const double = now - lastClick.at < 350 && e.point.getDistance(lastClick.point) < 6 / this.scope.view.zoom;
      lastClick = { at: now, point: e.point };
      start = last = e.point;
      changed = false;
      if (this.spaceDown || this.tool === "hand" || native?.button === 1) {
        mode = "pan";
        return;
      }
      const p = this.snap(e.point);
      switch (this.tool) {
        case "select": {
          if (this.refAdjust) {
            const uiHit = this.ui.hitTest(e.point, { fill: true, stroke: true, tolerance: 3 / this.scope.view.zoom });
            if (uiHit?.item.data.handle && this.selection[0] === this.reference) {
              handleName = uiHit.item.data.handle;
              mode = handleName === "rotate" ? "rotate" : "scale";
              startBounds = this.selectionBounds();
              return;
            }
            if (this.reference && this.reference.bounds.contains(e.point)) {
              this.selection = [this.reference];
              this.refresh();
              mode = "move";
            } else {
              this.selection = [];
              this.refresh();
              mode = "none";
            }
            return;
          }
          const uiHit = this.ui.hitTest(e.point, { fill: true, stroke: true, tolerance: 3 / this.scope.view.zoom });
          if (uiHit?.item.data.handle) {
            handleName = uiHit.item.data.handle;
            mode = handleName === "rotate" ? "rotate" : "scale";
            startBounds = this.selectionBounds();
            return;
          }
          const hit = this.art.hitTest(e.point, hitOptions({ match: (h: paper.HitResult) => !h.item.locked && h.item.visible }));
          if (hit) {
            const target = double ? hit.item : this.topLevel(hit.item);
            if (double && target instanceof this.scope.PointText) {
              this.select([target]);
              this.editText(target);
              mode = "none";
              return;
            }
            if (mods(e).shift) {
              this.select(this.selection.includes(target) ? this.selection.filter((i) => i !== target) : [...this.selection, target]);
            } else if (!this.selection.includes(target)) {
              this.select([target]);
            }
            if (mods(e).alt && this.selection.length) {
              this.selection = this.selection.map((i) => i.clone());
            }
            mode = "move";
          } else {
            if (!mods(e).shift) this.select([]);
            mode = "marquee";
          }
          return;
        }
        case "direct": {
          const z = this.scope.view.zoom;
          for (const item of this.selection) {
            if (!(item instanceof this.scope.Path)) continue;
            const hit = item.hitTest(e.point, { segments: true, handles: true, tolerance: 6 / z });
            if (!hit) continue;
            if (hit.type === "handle-in" || hit.type === "handle-out") {
              dragHandle = { segment: hit.segment, which: hit.type === "handle-in" ? "in" : "out" };
              mode = "handle";
              return;
            }
            if (hit.type === "segment") {
              if (double) {
                if (hit.segment.hasHandles()) hit.segment.clearHandles();
                else hit.segment.smooth({ type: "catmull-rom" });
                this.commit();
                mode = "none";
                return;
              }
              if (mods(e).shift) this.nodes = this.nodes.includes(hit.segment) ? this.nodes.filter((s) => s !== hit.segment) : [...this.nodes, hit.segment];
              else if (!this.nodes.includes(hit.segment)) this.nodes = [hit.segment];
              mode = "node";
              this.refresh();
              return;
            }
          }
          const hit = this.art.hitTest(e.point, hitOptions({ match: (h: paper.HitResult) => !h.item.locked && h.item.visible }));
          if (hit && hit.item instanceof this.scope.Path && this.selection.includes(hit.item) && (hit.type === "stroke" || double) && hit.location) {
            const location = hit.location ?? hit.item.getNearestLocation(e.point);
            const segment = hit.item.divideAt(location) ? hit.item.segments[location.index + 1] : null;
            this.nodes = segment ? [segment] : [];
            this.commit();
            mode = "node";
            return;
          }
          if (hit) {
            const tpGroup = hit.item.parent?.data?.textPath ? hit.item.parent : null;
            this.selection = [tpGroup ? (tpGroup.children.find((c) => c.data.guide) ?? hit.item) : hit.item];
            this.nodes = [];
            mode = "none";
            this.refresh();
          } else {
            this.select([]);
          }
          return;
        }
        case "pen": {
          if (this.penPath && this.penPath.segments.length > 1 && this.penPath.firstSegment.point.getDistance(e.point) < 8 / this.scope.view.zoom) {
            this.penPath.closed = true;
            if (!this.penPath.fillColor && this.defaults.fill) this.penPath.fillColor = new this.scope.Color(this.defaults.fill);
            this.finishPen();
            mode = "none";
            return;
          }
          if (!this.penPath) {
            this.penPath = new this.scope.Path();
            this.applyDefaults(this.penPath, true);
            this.penPath.add(p);
          } else {
            const lastPoint = this.penPath.lastSegment.point;
            this.penPath.add(mods(e).shift ? this.constrain(lastPoint, p) : p);
          }
          mode = "pen-drag";
          return;
        }
        case "pencil": {
          shape = new this.scope.Path();
          this.applyDefaults(shape, true);
          (shape as paper.Path).add(e.point);
          mode = "pencil";
          return;
        }
        case "text": {
          const hit = this.art.hitTest(e.point, hitOptions());
          if (hit?.item instanceof this.scope.PointText) {
            this.select([hit.item]);
            this.editText(hit.item);
            return;
          }
          const text = new this.scope.PointText({
            point: p,
            content: "Text",
            fontFamily: this.fonts.heading,
            fontSize: 32,
            fillColor: this.lineDefaults.stroke
          });
          text.point = text.point.add(new this.scope.Point(0, text.bounds.height * 0.75));
          this.select([text]);
          this.commit();
          this.editText(text, true);
          mode = "none";
          return;
        }
        default: {
          mode = "shape";
          shape = null;
        }
      }
    };

    tool.onMouseDrag = (e: paper.ToolEvent) => {
      const view = this.scope.view;
      if (mode === "pan") {
        const native = (e as unknown as { event: MouseEvent }).event;
        view.center = view.center.subtract(new this.scope.Point(native.movementX, native.movementY).divide(view.zoom));
        this.refresh();
        return;
      }
      const p = this.snap(e.point);
      changed = true;
      if (mode === "move") {
        let target = e.point.subtract(start);
        if (mods(e).shift) target = Math.abs(target.x) > Math.abs(target.y) ? new this.scope.Point(target.x, 0) : new this.scope.Point(0, target.y);
        let delta = target.subtract(last.subtract(start));
        if (this.options.snap) {
          const b = this.selectionBounds()!;
          const snapped = this.snap(b.topLeft.add(delta));
          delta = snapped.subtract(b.topLeft);
        }
        for (const item of this.selection) item.translate(delta);
        last = last.add(delta);
        this.refresh();
      } else if (mode === "scale" && startBounds) {
        this.scaleSelection(handleName, p, mods(e).shift, mods(e).alt);
      } else if (mode === "rotate" && startBounds) {
        const c = startBounds.center;
        let angle = e.point.subtract(c).angle - last.subtract(c).angle;
        if (mods(e).shift) {
          const total = e.point.subtract(c).angle - start.subtract(c).angle;
          const snapped = Math.round(total / 15) * 15;
          const done = last.subtract(c).angle - start.subtract(c).angle;
          angle = snapped - done;
          if (angle === 0) return;
          last = c.add(start.subtract(c).rotate(snapped, new this.scope.Point(0, 0)));
        } else {
          last = e.point;
        }
        for (const item of this.selection) {
          item.rotate(angle, c);
          item.data.rotation = (((item.data.rotation ?? 0) + angle + 540) % 360) - 180;
        }
        this.refresh();
      } else if (mode === "marquee") {
        marquee?.remove();
        this.ui.activate();
        marquee = new this.scope.Path.Rectangle({ from: start, to: e.point, strokeColor: ACCENT, strokeWidth: 1 / view.zoom, fillColor: new this.scope.Color(0.31, 0.55, 1, 0.08) });
        this.art.activate();
      } else if (mode === "node") {
        const delta = e.point.subtract(last);
        for (const s of this.nodes) s.point = s.point.add(delta);
        last = e.point;
        this.refresh();
      } else if (mode === "handle" && dragHandle) {
        const { segment, which } = dragHandle;
        const v = e.point.subtract(segment.point);
        const other = which === "in" ? segment.handleOut : segment.handleIn;
        const smooth = !mods(e).alt && !other.isZero() && Math.abs(Math.abs(segment.handleIn.getDirectedAngle(segment.handleOut)) - 180) < 3;
        if (which === "in") segment.handleIn = v;
        else segment.handleOut = v;
        if (smooth) {
          const mirrored = v.normalize(-other.length);
          if (which === "in") segment.handleOut = mirrored;
          else segment.handleIn = mirrored;
        }
        this.refresh();
      } else if (mode === "pen-drag" && this.penPath) {
        const seg = this.penPath.lastSegment;
        const v = e.point.subtract(seg.point);
        seg.handleOut = v;
        if (!mods(e).alt) seg.handleIn = v.multiply(-1);
        this.refresh();
      } else if (mode === "pencil" && shape) {
        (shape as paper.Path).add(e.point);
      } else if (mode === "shape") {
        shape?.remove();
        shape = this.makeShape(this.snap(start), p, mods(e).shift, mods(e).alt);
      }
    };

    tool.onMouseUp = (e: paper.ToolEvent) => {
      const finished = mode;
      mode = "none";
      if (finished === "marquee") {
        const area = marquee?.bounds;
        marquee?.remove();
        marquee = null;
        if (area && area.width > 1) {
          const inside = this.art.children.filter((i) => i.visible && !i.locked && area.intersects(i.bounds));
          this.select(mods(e).shift ? [...new Set([...this.selection, ...inside])] : inside);
        }
        return;
      }
      if (finished === "pencil" && shape) {
        const path = shape as paper.Path;
        if (path.length < 3) path.remove();
        else {
          path.simplify(2.5);
          this.select([path]);
          this.commit();
        }
        shape = null;
        return;
      }
      if (finished === "shape") {
        if (shape && (shape.bounds.width > 1 || shape.bounds.height > 1)) {
          this.select([shape]);
          this.commit();
          this.setTool("select");
        } else shape?.remove();
        shape = null;
        return;
      }
      if (finished === "pen-drag") {
        this.refresh();
        return;
      }
      if (changed && ["move", "scale", "rotate", "node", "handle"].includes(finished)) this.commit();
      dragHandle = null;
      startBounds = null;
    };

    tool.onMouseMove = (e: paper.ToolEvent) => {
      if (this.tool !== "pen" || !this.penPath) return;
      this.previewPath?.remove();
      this.ui.activate();
      const lastSeg = this.penPath.lastSegment;
      const to = mods(e).shift ? this.constrain(lastSeg.point, this.snap(e.point)) : this.snap(e.point);
      this.previewPath = new this.scope.Path({ segments: [new this.scope.Segment(lastSeg.point, undefined, lastSeg.handleOut), to], strokeColor: ACCENT, strokeWidth: 1 / this.scope.view.zoom });
      this.art.activate();
    };
  }

  private makeShape(from: paper.Point, to: paper.Point, shift: boolean, alt: boolean): paper.Item {
    let v = to.subtract(from);
    if (shift && this.tool !== "line") {
      const size = Math.max(Math.abs(v.x), Math.abs(v.y));
      v = new this.scope.Point(Math.sign(v.x || 1) * size, Math.sign(v.y || 1) * size);
    }
    const a = alt ? from.subtract(v) : from;
    const b = from.add(v);
    let item: paper.Item;
    switch (this.tool) {
      case "ellipse":
        item = new this.scope.Path.Ellipse({ rectangle: new this.scope.Rectangle(a, b) });
        break;
      case "polygon":
      case "star": {
        const radius = Math.max(1, to.getDistance(from));
        item =
          this.tool === "polygon"
            ? new this.scope.Path.RegularPolygon({ center: from, sides: Math.max(3, this.options.sides), radius })
            : new this.scope.Path.Star({ center: from, points: Math.max(3, this.options.points), radius1: radius, radius2: radius * 0.45 });
        if (!shift) item.rotate(to.subtract(from).angle + 90, from);
        break;
      }
      case "line":
        item = new this.scope.Path.Line({ from, to: shift ? this.constrain(from, to) : to });
        this.applyDefaults(item, true);
        return item;
      default:
        item = new this.scope.Path.Rectangle({ rectangle: new this.scope.Rectangle(a, b) });
    }
    this.applyDefaults(item);
    return item;
  }

  private scaleSelection(handle: string, point: paper.Point, keepRatio: boolean, fromCenter: boolean) {
    const b = this.selectionBounds();
    if (!b) return;
    const moveLeft = handle.includes("w");
    const moveRight = handle.includes("e");
    const moveTop = handle.includes("n");
    const moveBottom = handle.includes("s");
    let left = b.left,
      right = b.right,
      top = b.top,
      bottom = b.bottom;
    if (moveLeft) left = point.x;
    if (moveRight) right = point.x;
    if (moveTop) top = point.y;
    if (moveBottom) bottom = point.y;
    if (fromCenter) {
      if (moveLeft) right = b.center.x + (b.center.x - left);
      if (moveRight) left = b.center.x - (right - b.center.x);
      if (moveTop) bottom = b.center.y + (b.center.y - top);
      if (moveBottom) top = b.center.y - (bottom - b.center.y);
    }
    let sx = b.width ? (right - left) / b.width : 1;
    let sy = b.height ? (bottom - top) / b.height : 1;
    if (!moveLeft && !moveRight) sx = keepRatio ? sy : 1;
    if (!moveTop && !moveBottom) sy = keepRatio ? sx : 1;
    if (keepRatio && (moveLeft || moveRight) && (moveTop || moveBottom)) {
      const s = Math.max(Math.abs(sx), Math.abs(sy));
      sx = Math.sign(sx || 1) * s;
      sy = Math.sign(sy || 1) * s;
    }
    if (Math.abs(sx) < 0.001 || Math.abs(sy) < 0.001) return;
    const pivot = fromCenter
      ? b.center
      : new this.scope.Point(moveLeft ? b.right : moveRight ? b.left : b.center.x, moveTop ? b.bottom : moveBottom ? b.top : b.center.y);
    for (const item of this.selection) item.scale(sx, sy, pivot);
    this.refresh();
  }

  finishPen() {
    this.previewPath?.remove();
    this.previewPath = null;
    const path = this.penPath;
    this.penPath = null;
    if (!path) return;
    if (path.segments.length < 2) {
      path.remove();
      this.refresh();
      return;
    }
    this.select([path]);
    this.commit();
  }

  editText(item: paper.PointText, isNew = false) {
    const view = this.scope.view;
    const tl = view.projectToView(item.bounds.topLeft);
    const br = view.projectToView(item.bounds.bottomRight);
    this.callbacks.onEditText(item, { x: tl.x, y: tl.y, w: Math.max(80, br.x - tl.x), h: br.y - tl.y, fontSize: item.fontSize as number * view.zoom });
    item.data.isNew = isNew;
  }

  setTextContent(item: paper.PointText, content: string) {
    if (!content.trim()) {
      item.remove();
      this.selection = this.selection.filter((i) => i !== item);
    } else item.content = content;
    this.commit();
  }

  deleteSelection() {
    if (this.refAdjust) return;
    if (this.tool === "direct" && this.nodes.length) {
      for (const s of this.nodes) {
        const path = s.path;
        s.remove();
        if (path && path.segments.length < 2) {
          path.remove();
          this.selection = this.selection.filter((i) => i !== path);
        }
      }
      this.nodes = [];
      this.commit();
      return;
    }
    if (!this.selection.length) return;
    for (const item of this.selection) item.remove();
    this.selection = [];
    this.commit();
  }

  duplicate() {
    if (this.refAdjust) return;
    if (!this.selection.length) return;
    const copies = this.selection.map((i) => {
      const c = i.clone();
      c.translate(new this.scope.Point(10, 10));
      c.name = "";
      return c;
    });
    this.select(copies);
    this.commit();
  }

  copy() {
    if (this.refAdjust) return;
    this.clipboard = this.selection.map((i) => i.clone({ insert: false }));
  }

  cut() {
    this.copy();
    this.deleteSelection();
  }

  paste() {
    if (this.refAdjust) return;
    if (!this.clipboard.length) return;
    const pasted = this.clipboard.map((c) => {
      const item = c.clone({ insert: false });
      this.art.addChild(item);
      item.translate(new this.scope.Point(10, 10));
      return item;
    });
    this.clipboard = pasted.map((p) => p.clone({ insert: false }));
    this.select(pasted);
    this.commit();
  }

  nudge(dx: number, dy: number) {
    if (this.tool === "direct" && this.nodes.length) {
      for (const s of this.nodes) s.point = s.point.add(new this.scope.Point(dx, dy));
    } else {
      for (const item of this.selection) item.translate(new this.scope.Point(dx, dy));
    }
    this.commit("nudge");
  }

  group() {
    if (this.refAdjust) return;
    if (this.selection.length < 2) return;
    const ordered = [...this.selection].sort((a, b) => a.index - b.index);
    const top = ordered[ordered.length - 1];
    const group = new this.scope.Group();
    group.insertAbove(top);
    group.addChildren(ordered);
    this.select([group]);
    this.commit();
  }

  ungroup() {
    if (this.refAdjust) return;
    const released: paper.Item[] = [];
    for (const item of this.selection) {
      if (!(item instanceof this.scope.Group) || item.clipped) {
        released.push(item);
        continue;
      }
      const kids = [...item.children];
      for (const kid of kids) kid.insertBelow(item);
      item.remove();
      released.push(...kids);
    }
    this.select(released);
    this.commit();
  }

  arrange(op: "front" | "forward" | "backward" | "back") {
    if (this.refAdjust) return;
    const ordered = [...this.selection].sort((a, b) => (op === "front" || op === "backward" ? a.index - b.index : b.index - a.index));
    for (const item of ordered) {
      if (op === "front") item.bringToFront();
      else if (op === "back") item.sendToBack();
      else if (op === "forward" && item.nextSibling) item.insertAbove(item.nextSibling);
      else if (op === "backward" && item.previousSibling) item.insertBelow(item.previousSibling);
    }
    this.commit();
  }

  align(op: AlignOp) {
    if (this.refAdjust) return;
    if (!this.selection.length) return;
    const target = this.selection.length === 1 ? this.board.bounds : this.selectionBounds()!;
    for (const item of this.selection) {
      const b = item.bounds;
      const dx = op === "left" ? target.left - b.left : op === "right" ? target.right - b.right : op === "hcenter" ? target.center.x - b.center.x : 0;
      const dy = op === "top" ? target.top - b.top : op === "bottom" ? target.bottom - b.bottom : op === "vcenter" ? target.center.y - b.center.y : 0;
      item.translate(new this.scope.Point(dx, dy));
    }
    this.commit();
  }

  distribute(axis: "x" | "y") {
    if (this.refAdjust) return;
    if (this.selection.length < 3) return;
    const sorted = [...this.selection].sort((a, b) => a.bounds.center[axis] - b.bounds.center[axis]);
    const first = sorted[0].bounds.center[axis];
    const step = (sorted[sorted.length - 1].bounds.center[axis] - first) / (sorted.length - 1);
    sorted.forEach((item, i) => {
      const d = first + step * i - item.bounds.center[axis];
      item.translate(axis === "x" ? new this.scope.Point(d, 0) : new this.scope.Point(0, d));
    });
    this.commit();
  }

  flip(axis: "x" | "y") {
    const b = this.selectionBounds();
    if (!b) return;
    for (const item of this.selection) item.scale(axis === "x" ? -1 : 1, axis === "y" ? -1 : 1, b.center);
    this.commit();
  }

  boolean(op: BooleanOp) {
    if (this.refAdjust) return;
    const shapes = [...this.selection].filter((i): i is paper.PathItem => i instanceof this.scope.PathItem).sort((a, b) => a.index - b.index);
    if (shapes.length < 2) return;
    const [base, ...rest] = shapes;
    let result: paper.PathItem = base;
    for (const other of rest) {
      const next = result[op](other, { insert: false }) as paper.PathItem;
      if (result !== base) result.remove();
      result = next;
    }
    result.style = base.style;
    result.insertAbove(base);
    for (const s of shapes) s.remove();
    this.select([result]);
    this.commit();
  }

  clip() {
    if (this.refAdjust) return;
    const items = [...this.selection].sort((a, b) => a.index - b.index);
    if (items.length < 2) return;
    const mask = items[items.length - 1];
    const group = new this.scope.Group();
    group.insertAbove(mask);
    group.addChildren([mask, ...items.slice(0, -1)]);
    group.clipped = true;
    this.select([group]);
    this.commit();
  }

  unclip() {
    if (this.refAdjust) return;
    const released: paper.Item[] = [];
    for (const item of this.selection) {
      if (!(item instanceof this.scope.Group) || !item.clipped) {
        released.push(item);
        continue;
      }
      const kids = [...item.children];
      const mask = kids[0];
      item.clipped = false;
      mask.clipMask = false;
      mask.fillColor = null;
      mask.strokeColor = new this.scope.Color("#8a8680");
      mask.strokeWidth = 1;
      for (const kid of kids) kid.insertBelow(item);
      item.remove();
      released.push(...kids);
    }
    this.select(released);
    this.commit();
  }

  get canUnclip() {
    return this.selection.some((i) => i instanceof this.scope.Group && i.clipped);
  }

  textOnPath() {
    if (this.refAdjust) return;
    const path = this.selection.find((i): i is paper.Path => i instanceof this.scope.Path);
    const text = this.selection.find((i): i is paper.PointText => i instanceof this.scope.PointText);
    if (!path || !text) return;
    const info: TextPathInfo = {
      content: text.content.replace(/\s*\n\s*/g, " "),
      fontFamily: String(text.fontFamily),
      fontSize: Number(text.fontSize),
      fontWeight: String(text.fontWeight),
      fill: toHex(text.fillColor) ?? "#1d1b18",
      offset: 0,
      spacing: 0
    };
    const group = new this.scope.Group();
    group.insertAbove(path);
    path.fillColor = null;
    path.strokeColor = null;
    path.data.guide = true;
    group.addChild(path);
    group.data.textPath = info;
    group.name = text.name;
    text.remove();
    this.layoutTextPath(group);
    this.select([group]);
    this.commit();
  }

  get canTextOnPath() {
    return this.selection.length === 2 && this.selection.some((i) => i instanceof this.scope.Path) && this.selection.some((i) => i instanceof this.scope.PointText);
  }

  private textPathGroups(): paper.Group[] {
    return this.art.getItems({ recursive: true, class: this.scope.Group, match: (g: paper.Item) => Boolean(g.data?.textPath) }) as paper.Group[];
  }

  private layoutTextPath(group: paper.Group) {
    const info = group.data.textPath as TextPathInfo;
    const guide = group.children.find((c) => c.data.guide) as paper.Path | undefined;
    for (const kid of [...group.children]) if (!kid.data.guide) kid.remove();
    if (!guide || !guide.length) return;
    let at = (guide.length * info.offset) / 100;
    for (const ch of info.content) {
      const glyph = new this.scope.PointText({ content: ch, fontFamily: info.fontFamily, fontSize: info.fontSize, fontWeight: info.fontWeight, fillColor: info.fill, justification: "center", insert: false });
      const width = ch.trim() ? glyph.bounds.width : info.fontSize * 0.28;
      const mid = at + width / 2;
      if (mid > guide.length) break;
      const point = guide.getPointAt(mid);
      const tangent = guide.getTangentAt(mid);
      glyph.point = point;
      glyph.rotate(tangent.angle, point);
      glyph.data.glyph = true;
      group.addChild(glyph);
      at += width + info.spacing;
    }
  }

  textPathInfo(): TextPathInfo | null {
    const item = this.selection[0];
    return this.selection.length === 1 && item?.data?.textPath ? { ...(item.data.textPath as TextPathInfo) } : null;
  }

  setTextPath(patch: Partial<TextPathInfo> & { flip?: boolean }) {
    const group = this.selection[0] as paper.Group;
    if (!group?.data?.textPath) return;
    const { flip, ...rest } = patch;
    group.data.textPath = { ...group.data.textPath, ...rest };
    if (flip) (group.children.find((c) => c.data.guide) as paper.Path | undefined)?.reverse();
    this.layoutTextPath(group);
    this.commit("textpath");
  }

  private exportTextPaths(doc: XMLDocument, root: Element) {
    let n = 0;
    for (const g of Array.from(root.querySelectorAll("[data-paper-data]"))) {
      let data: { textPath?: TextPathInfo };
      try {
        data = JSON.parse(g.getAttribute("data-paper-data")!);
      } catch {
        continue;
      }
      const info = data.textPath;
      if (!info) continue;
      const guide = Array.from(g.children).find((c) => (c.getAttribute("data-paper-data") ?? "").includes('"guide"'));
      if (!guide) continue;
      const ns = "http://www.w3.org/2000/svg";
      const name = g.getAttribute("id");
      const guideId = `${name ?? "textpath"}-path-${++n}`;
      const path = doc.createElementNS(ns, "path");
      path.setAttribute("id", guideId);
      path.setAttribute("d", guide.getAttribute("d") ?? "");
      if (guide.getAttribute("transform")) path.setAttribute("transform", guide.getAttribute("transform")!);
      path.setAttribute("fill", "none");
      const text = doc.createElementNS(ns, "text");
      if (name) text.setAttribute("id", name);
      text.setAttribute("font-family", info.fontFamily);
      text.setAttribute("font-size", String(info.fontSize));
      if (info.fontWeight && info.fontWeight !== "normal") text.setAttribute("font-weight", info.fontWeight);
      text.setAttribute("fill", info.fill);
      if (info.spacing) text.setAttribute("letter-spacing", String(info.spacing));
      const tp = doc.createElementNS(ns, "textPath");
      tp.setAttribute("href", `#${guideId}`);
      if (info.offset) tp.setAttribute("startOffset", `${info.offset}%`);
      tp.textContent = info.content;
      text.appendChild(tp);
      const wrapper = doc.createElementNS(ns, "g");
      wrapper.appendChild(path);
      wrapper.appendChild(text);
      g.replaceWith(wrapper);
    }
  }

  outlineStroke() {
    if (this.refAdjust) return;
    const results: paper.Item[] = [];
    for (const item of this.selection) {
      if (!(item instanceof this.scope.Path) || !item.strokeColor || !item.strokeWidth) {
        results.push(item);
        continue;
      }
      const outline = strokeOutline(this.scope, item);
      if (!outline) {
        results.push(item);
        continue;
      }
      outline.fillColor = item.strokeColor;
      outline.strokeColor = null;
      outline.insertAbove(item);
      if (item.fillColor) {
        item.strokeColor = null;
        results.push(item, outline);
      } else {
        item.remove();
        results.push(outline);
      }
    }
    this.select(results);
    this.commit();
  }

  styleInfo(): StyleInfo {
    const item = this.selection[0];
    if (!item) {
      return {
        fill: { kind: this.defaults.fill ? "solid" : "none", color: this.defaults.fill ?? "#d9d4cc", color2: "#ffffff", angle: 90 },
        stroke: this.defaults.stroke,
        strokeWidth: this.defaults.strokeWidth,
        dash: false,
        cap: "butt",
        join: "miter",
        opacity: 1
      };
    }
    const style = item instanceof this.scope.Group && item.children.length ? item.children[0] : item;
    const fillColor = style.fillColor;
    let fill: Fill = { kind: "none", color: "#d9d4cc", color2: "#ffffff", angle: 90 };
    if (fillColor?.gradient) {
      const stops = fillColor.gradient.stops;
      const { origin, destination } = fillColor as unknown as { origin: paper.Point; destination: paper.Point };
      fill = {
        kind: fillColor.gradient.radial ? "radial" : "linear",
        color: toHex(stops[0]?.color) ?? "#000000",
        color2: toHex(stops[stops.length - 1]?.color) ?? "#ffffff",
        angle: Math.round(destination.subtract(origin).angle)
      };
    } else if (toHex(fillColor)) {
      fill = { kind: "solid", color: toHex(fillColor)!, color2: "#ffffff", angle: 90 };
    }
    return {
      fill,
      stroke: toHex(style.strokeColor),
      strokeWidth: style.strokeWidth ?? 0,
      dash: Boolean(style.dashArray?.length),
      cap: (style.strokeCap as StyleInfo["cap"]) ?? "butt",
      join: (style.strokeJoin as StyleInfo["join"]) ?? "miter",
      opacity: item.opacity
    };
  }

  private makeFill(item: paper.Item, fill: Fill): paper.Color | null {
    if (fill.kind === "none") return null;
    if (fill.kind === "solid") return new this.scope.Color(fill.color);
    const b = item.bounds;
    const stops = [fill.color, fill.color2];
    if (fill.kind === "radial") {
      return new this.scope.Color({ gradient: { stops, radial: true }, origin: b.center, destination: b.center.add(new this.scope.Point(Math.max(b.width, b.height) / 2, 0)) } as unknown as paper.Color);
    }
    const half = new this.scope.Point({ angle: fill.angle, length: Math.max(b.width, b.height) / 2 });
    return new this.scope.Color({ gradient: { stops }, origin: b.center.subtract(half), destination: b.center.add(half) } as unknown as paper.Color);
  }

  setStyle(patch: Partial<StyleInfo>, key = "style") {
    if (this.refAdjust) return;
    if (!this.selection.length) {
      if (patch.fill) this.defaults.fill = patch.fill.kind === "none" ? null : patch.fill.color;
      if (patch.stroke !== undefined) this.defaults.stroke = patch.stroke;
      if (patch.stroke) this.lineDefaults.stroke = patch.stroke;
      if (patch.strokeWidth !== undefined) {
        this.defaults.strokeWidth = patch.strokeWidth;
        this.lineDefaults.strokeWidth = patch.strokeWidth;
      }
      this.callbacks.onChange();
      return;
    }
    const apply = (item: paper.Item) => {
      if (item instanceof this.scope.Group) {
        for (const kid of item.children) apply(kid);
        return;
      }
      if (patch.fill) item.fillColor = this.makeFill(item, patch.fill);
      if (patch.stroke !== undefined) item.strokeColor = patch.stroke ? new this.scope.Color(patch.stroke) : null;
      if (patch.strokeWidth !== undefined) item.strokeWidth = patch.strokeWidth;
      if (patch.dash !== undefined) item.dashArray = patch.dash ? [Math.max(2, item.strokeWidth * 3), Math.max(2, item.strokeWidth * 2)] : [];
      if (patch.cap) item.strokeCap = patch.cap;
      if (patch.join) item.strokeJoin = patch.join;
    };
    for (const item of this.selection) {
      apply(item);
      if (patch.opacity !== undefined) item.opacity = patch.opacity;
    }
    this.commit(key);
  }

  textInfo(): TextInfo | null {
    const item = this.selection[0];
    if (!(item instanceof this.scope.PointText) || this.selection.length > 1) return null;
    return {
      content: item.content,
      fontFamily: String(item.fontFamily),
      fontSize: Number(item.fontSize),
      fontWeight: String(item.fontWeight),
      justification: item.justification as TextInfo["justification"]
    };
  }

  setText(patch: Partial<TextInfo>) {
    if (this.refAdjust) return;
    const item = this.selection[0];
    if (!(item instanceof this.scope.PointText)) return;
    if (patch.content !== undefined) item.content = patch.content;
    if (patch.fontFamily !== undefined) item.fontFamily = patch.fontFamily;
    if (patch.fontSize !== undefined) item.fontSize = patch.fontSize;
    if (patch.fontWeight !== undefined) item.fontWeight = patch.fontWeight;
    if (patch.justification !== undefined) item.justification = patch.justification;
    this.commit("text");
  }

  geometry(): { x: number; y: number; w: number; h: number; rotation: number } | null {
    const b = this.selectionBounds();
    if (!b) return null;
    return { x: b.x, y: b.y, w: b.width, h: b.height, rotation: this.selection.length === 1 ? (this.selection[0].data.rotation ?? 0) : 0 };
  }

  setGeometry(patch: Partial<{ x: number; y: number; w: number; h: number; rotation: number }>) {
    const b = this.selectionBounds();
    if (!b) return;
    if (patch.x !== undefined || patch.y !== undefined) {
      const d = new this.scope.Point((patch.x ?? b.x) - b.x, (patch.y ?? b.y) - b.y);
      for (const item of this.selection) item.translate(d);
    }
    if ((patch.w !== undefined && b.width) || (patch.h !== undefined && b.height)) {
      const sx = patch.w !== undefined && b.width ? Math.max(0.1, patch.w) / b.width : 1;
      const sy = patch.h !== undefined && b.height ? Math.max(0.1, patch.h) / b.height : 1;
      const pivot = this.selectionBounds()!.topLeft;
      for (const item of this.selection) item.scale(sx, sy, pivot);
    }
    if (patch.rotation !== undefined && this.selection.length === 1) {
      const item = this.selection[0];
      const delta = patch.rotation - (item.data.rotation ?? 0);
      item.rotate(delta, item.bounds.center);
      item.data.rotation = patch.rotation;
    }
    this.commit("geometry");
  }

  async setOnion(frames: { url: string; opacity: number }[]) {
    this.onionLayer.removeChildren();
    for (const frame of frames) {
      const raster = new this.scope.Raster({ insert: false });
      try {
        await new Promise<void>((resolve, reject) => {
          raster.onLoad = () => resolve();
          raster.onError = () => reject(new Error("frame"));
          raster.source = frame.url;
        });
      } catch {
        continue;
      }
      if (this.destroyed) return;
      raster.opacity = Math.max(0.05, Math.min(1, frame.opacity));
      raster.scale(this.box.w / raster.width, this.box.h / raster.height);
      raster.position = new this.scope.Point(this.box.x + this.box.w / 2, this.box.y + this.box.h / 2);
      raster.locked = true;
      this.onionLayer.addChild(raster);
    }
    this.refresh();
  }

  setOnionVisible(visible: boolean) {
    this.onionLayer.visible = visible;
    this.refresh();
  }

  async setReference(url: string | null, matrix?: number[] | null) {
    this.reference?.remove();
    this.reference = null;
    this.selection = this.selection.filter((i) => i.layer !== this.refLayer);
    if (!url) {
      this.refAdjust = false;
      this.commit("reference");
      return;
    }
    const raster = new this.scope.Raster({ insert: false });
    await new Promise<void>((resolve, reject) => {
      raster.onLoad = () => resolve();
      raster.onError = () => reject(new Error("That image couldn't be loaded."));
      raster.source = url;
    });
    if (this.destroyed) return;
    this.refLayer.addChild(raster);
    this.reference = raster;
    if (matrix && matrix.length === 6) raster.matrix = new this.scope.Matrix(matrix);
    else this.fitReference(false);
    raster.locked = !this.refAdjust;
    this.commit("reference");
  }

  fitReference(commit = true) {
    const raster = this.reference;
    if (!raster) return;
    raster.matrix = new this.scope.Matrix();
    const scale = Math.min(this.box.w / raster.width, this.box.h / raster.height);
    raster.scale(scale);
    raster.position = new this.scope.Point(this.box.x + this.box.w / 2, this.box.y + this.box.h / 2);
    if (commit) this.commit("reference");
  }

  get referenceState() {
    return {
      has: Boolean(this.reference),
      opacity: this.refLayer.opacity,
      visible: this.refLayer.visible,
      onTop: this.refLayer.index > this.art.index,
      adjust: this.refAdjust,
      matrix: this.reference ? [...this.reference.matrix.values] : null
    };
  }

  setReferenceOpacity(opacity: number) {
    this.refLayer.opacity = Math.max(0.05, Math.min(1, opacity));
    this.refresh();
  }

  setReferenceVisible(visible: boolean) {
    this.refLayer.visible = visible;
    if (!visible) this.setReferenceAdjust(false);
    this.refresh();
  }

  setReferenceOnTop(onTop: boolean) {
    if (onTop) this.refLayer.insertAbove(this.art);
    else this.refLayer.insertBelow(this.art);
    this.refresh();
  }

  setReferenceAdjust(on: boolean) {
    this.finishPen();
    this.refAdjust = on && Boolean(this.reference);
    if (this.reference) this.reference.locked = !this.refAdjust;
    this.selection = this.refAdjust && this.reference ? [this.reference] : [];
    if (this.refAdjust) {
      this.tool = "select";
      this.canvas.dataset.tool = "select";
    }
    this.refresh();
  }

  async traceReference(options: TraceOptions, skipWhite: boolean): Promise<number> {
    const raster = this.reference;
    if (!raster) throw new Error("Add a reference image first.");
    const w = raster.width;
    const h = raster.height;
    const k = Math.min(1, TRACE_MAX_SIDE / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * k));
    const th = Math.max(1, Math.round(h * k));
    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(raster.image as CanvasImageSource, 0, 0, tw, th);
    const svg = await traceImageData(ctx.getImageData(0, 0, tw, th), options);
    if (this.destroyed) return 0;
    const imported = this.scope.project.importSVG(svg, { insert: false, expandShapes: true }) as paper.Item;
    const shapes = (imported.getItems({ recursive: true, class: this.scope.PathItem }) as paper.PathItem[]).filter((item) => {
      if (item.clipMask || item.parent?.clipMask) return false;
      if (item.parent instanceof this.scope.CompoundPath) return false;
      const fill = item.fillColor;
      if (!fill || fill.alpha * item.opacity < 0.05) return false;
      const rgb = fill.convert("rgb") as paper.Color;
      if (skipWhite && rgb.red > 0.94 && rgb.green > 0.94 && rgb.blue > 0.94) return false;
      return true;
    });
    if (!options.corners) {
      for (const shape of shapes) {
        const paths = shape instanceof this.scope.CompoundPath ? (shape.children as paper.Path[]) : [shape as paper.Path];
        for (const path of paths) {
          if (path.segments.length <= 8) continue;
          path.flatten(0.75);
          path.simplify(1.5);
        }
      }
    }
    const minArea = tw * th * 0.0005;
    const kept = shapes.filter((shape) => Math.abs((shape as paper.Path).area ?? 0) >= minArea);
    if (!kept.length) return 0;
    const byColor = new Map<string, paper.PathItem[]>();
    for (const shape of kept) {
      const key = (shape.fillColor!.convert("rgb") as paper.Color).toCSS(true);
      byColor.set(key, [...(byColor.get(key) ?? []), shape]);
    }
    const group = new this.scope.Group({ insert: false });
    const colourGroups = [...byColor.entries()].sort((a, b) => b[1].reduce((n, p) => n + Math.abs((p as paper.Path).area ?? 0), 0) - a[1].reduce((n, p) => n + Math.abs((p as paper.Path).area ?? 0), 0));
    for (const [color, items] of colourGroups) {
      const sub = new this.scope.Group({ insert: false, children: items });
      sub.name = idFromName(`Colour ${color.slice(1)}`);
      group.addChild(sub);
    }
    const shapesCount = kept.length;
    const m = raster.matrix.clone();
    m.translate(-w / 2, -h / 2);
    m.scale(1 / k);
    group.transform(m);
    for (const shape of kept) shape.strokeWidth = Math.max(0.5, shape.strokeWidth);
    group.name = "Traced";
    this.setReferenceAdjust(false);
    this.art.addChild(group);
    this.select([group]);
    this.commit();
    return shapesCount;
  }

  layerRows(): LayerRow[] {
    const rows: LayerRow[] = [];
    const walk = (items: paper.Item[], depth: number) => {
      for (const item of [...items].reverse()) {
        const isGroup = item instanceof this.scope.Group;
        rows.push({
          id: item.id,
          name: item.name && !GENERATED_ID.test(item.name) ? item.name : "",
          label: (item.name && this.preserved.labels.get(item.name)) || (item.name && !GENERATED_ID.test(item.name) ? item.name.replace(/_/g, " ") : ""),
          kind: item instanceof this.scope.PointText ? "Text" : isGroup ? "Group" : item instanceof this.scope.CompoundPath ? "Compound" : item instanceof this.scope.Raster ? "Image" : "Shape",
          depth,
          visible: item.visible,
          locked: item.locked,
          selected: this.selection.includes(item),
          isGroup
        });
        if (isGroup && depth < 3) walk(item.children, depth + 1);
      }
    };
    walk(this.art.children, 0);
    return rows;
  }

  private itemById(id: number) {
    return this.art.getItem({ recursive: true, match: (i: paper.Item) => i.id === id });
  }

  rename(id: number, name: string) {
    const item = this.itemById(id);
    if (!item) return;
    let clean = idFromName(name);
    const taken = new Set(this.art.getItems({ recursive: true }).filter((i) => i !== item).map((i) => i.name));
    if (clean && taken.has(clean)) {
      let n = 2;
      while (taken.has(`${clean}_${n}`)) n++;
      clean = `${clean}_${n}`;
    }
    (item as unknown as { name: string | null }).name = clean || null;
    this.commit();
  }

  toggleVisible(id: number) {
    const item = this.itemById(id);
    if (!item) return;
    item.visible = !item.visible;
    if (!item.visible) this.selection = this.selection.filter((i) => i !== item);
    this.commit();
  }

  toggleLocked(id: number) {
    const item = this.itemById(id);
    if (!item) return;
    item.locked = !item.locked;
    if (item.locked) this.selection = this.selection.filter((i) => i !== item);
    this.commit();
  }

  moveLayer(id: number, direction: 1 | -1) {
    const item = this.itemById(id);
    if (!item) return;
    if (direction === 1 && item.nextSibling) item.insertAbove(item.nextSibling);
    if (direction === -1 && item.previousSibling) item.insertBelow(item.previousSibling);
    this.commit();
  }

  placeImage(dataUrl: string) {
    const raster = new this.scope.Raster({ source: dataUrl, position: new this.scope.Point(this.box.x + this.box.w / 2, this.box.y + this.box.h / 2) });
    raster.onLoad = () => {
      const scale = Math.min(1, (this.box.w * 0.8) / raster.width, (this.box.h * 0.8) / raster.height);
      raster.scale(scale);
      this.select([raster]);
      this.commit();
    };
  }
}

function strokeOutline(scope: paper.PaperScope, path: paper.Path): paper.PathItem | null {
  const half = path.strokeWidth / 2;
  const steps = Math.max(8, Math.ceil(path.length / 4));
  const left: paper.Point[] = [];
  const right: paper.Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const offset = (path.length * i) / steps;
    const point = path.getPointAt(Math.min(offset, path.length));
    const normal = path.getNormalAt(Math.min(offset, path.length));
    if (!point || !normal) continue;
    left.push(point.add(normal.multiply(half)));
    right.push(point.subtract(normal.multiply(half)));
  }
  if (left.length < 2) return null;
  if (path.closed) {
    const outer = new scope.Path({ segments: left, closed: true, insert: false });
    const inner = new scope.Path({ segments: right, closed: true, insert: false });
    outer.simplify(0.5);
    inner.simplify(0.5);
    return outer.exclude(inner, { insert: false }) as paper.PathItem;
  }
  const outline = new scope.Path({ segments: [...left, ...right.reverse()], closed: true, insert: false });
  outline.simplify(0.5);
  return outline;
}
