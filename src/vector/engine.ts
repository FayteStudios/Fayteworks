import paper from "paper/dist/paper-core";
import { TRACE_MAX_SIDE, traceImageData, type TraceOptions } from "./trace";

export type Tool = "select" | "direct" | "pen" | "pencil" | "scissors" | "rect" | "ellipse" | "polygon" | "star" | "shape" | "line" | "arc" | "spiral" | "text" | "eyedropper" | "hand";
export type BooleanOp = "unite" | "subtract" | "intersect" | "exclude";
export type AlignOp = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type ShapeKind = "triangle" | "arrow" | "bubble" | "heart" | "cloud" | "gear" | "donut" | "pie";
export type RefPoint = "tl" | "t" | "tr" | "l" | "c" | "r" | "bl" | "b" | "br";
export type PointType = "sharp" | "smooth" | "symmetric" | "auto";
export type SameKind = "fill" | "stroke" | "width" | "kind";
export type PathOp = "reverse" | "smooth" | "addPoints" | "reduce" | "straighten";

export interface Transform {
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
  rotate: number;
  each: boolean;
  ref?: RefPoint;
}

export interface PathInfo {
  paths: number;
  points: number;
  open: number;
  closed: number;
  compound: boolean;
  nodes: number;
  pointType: PointType | null;
  curve: boolean;
  canJoin: boolean;
  canBreak: boolean;
}

export interface HistoryRow {
  label: string;
  state: "past" | "current" | "future";
}

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
  dashArray: number[];
  dashOffset: number;
  cap: "butt" | "round" | "square";
  join: "miter" | "round" | "bevel";
  miterLimit: number;
  fillRule: "nonzero" | "evenodd";
  opacity: number;
}

export interface TextInfo {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  justification: "left" | "center" | "right";
  lineHeight: number;
  spacing: number;
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
  convertTextLines(root);
  return { svg: new XMLSerializer().serializeToString(root), preserved };
}

function convertTextLines(root: Element) {
  for (const text of Array.from(root.querySelectorAll("text"))) {
    const kids = Array.from(text.children);
    if (kids.some((c) => c.localName === "textPath")) continue;
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text.getAttribute("data-paper-data") ?? "{}");
    } catch {
      data = {};
    }
    const spacing = parseFloat(text.getAttribute("letter-spacing") ?? (text.getAttribute("style") ?? "").match(/letter-spacing\s*:\s*([-\d.]+)/)?.[1] ?? "");
    if (spacing) data.letterSpacing = spacing;
    const spans = kids.filter((c) => c.localName === "tspan");
    if (spans.length > 1) {
      if (!text.getAttribute("x") && spans[0].getAttribute("x")) text.setAttribute("x", spans[0].getAttribute("x")!);
      if (!text.getAttribute("y") && spans[0].getAttribute("y")) text.setAttribute("y", spans[0].getAttribute("y")!);
      const dy = parseFloat(spans[1].getAttribute("dy") ?? "");
      const y0 = parseFloat(spans[0].getAttribute("y") ?? "");
      const y1 = parseFloat(spans[1].getAttribute("y") ?? "");
      const leading = dy || (Number.isFinite(y0) && Number.isFinite(y1) ? y1 - y0 : 0);
      if (leading > 0) data.leading = leading;
      text.textContent = spans.map((s) => s.textContent ?? "").join(leading > 0 ? "\n" : "");
    }
    if (Object.keys(data).length) text.setAttribute("data-paper-data", JSON.stringify(data));
  }
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

const KAPPA = 0.5522847498;

const COMMIT_LABELS: Record<string, string> = {
  style: "Style",
  fill: "Fill",
  "fill-theme": "Fill",
  stroke: "Outline colour",
  opacity: "Opacity",
  nudge: "Nudge",
  geometry: "Position and size",
  textpath: "Text on path",
  text: "Text",
  reference: "Reference image",
  simplify: "Simplify",
  radius: "Corner radius",
  dash: "Dashes",
  miter: "Miter limit"
};

const SHAPE_PATHS: Partial<Record<ShapeKind, string>> = {
  triangle: "M50 0 L100 100 L0 100 Z",
  arrow: "M0 32 L58 32 L58 5 L100 50 L58 95 L58 68 L0 68 Z",
  bubble: "M14 0 H86 A14 14 0 0 1 100 14 V58 A14 14 0 0 1 86 72 H44 L22 100 L26 72 H14 A14 14 0 0 1 0 58 V14 A14 14 0 0 1 14 0 Z",
  heart: "M50 28 C50 12 38 0 25 0 C10 0 0 12 0 28 C0 55 30 72 50 100 C70 72 100 55 100 28 C100 12 90 0 75 0 C62 0 50 12 50 28 Z",
  cloud: "M26 88 A20 20 0 0 1 20 50 A22 22 0 0 1 48 28 A26 26 0 0 1 92 46 A24 24 0 0 1 82 88 Z",
  pie: "M50 50 L50 0 A50 50 0 1 1 0 50 Z"
};

export function roundedRectSegments(scope: paper.PaperScope, w: number, h: number, radii: number[]): paper.Segment[] {
  const limit = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = [0, 1, 2, 3].map((i) => Math.max(0, Math.min(limit, radii[i] ?? 0)));
  const pt = (x: number, y: number) => new scope.Point(x, y);
  const seg = (x: number, y: number, hin?: [number, number], hout?: [number, number]) => new scope.Segment(pt(x, y), hin ? pt(...hin) : undefined, hout ? pt(...hout) : undefined);
  const out: paper.Segment[] = [];
  if (tl) out.push(seg(0, tl, undefined, [0, -tl * KAPPA]), seg(tl, 0, [-tl * KAPPA, 0]));
  else out.push(seg(0, 0));
  if (tr) out.push(seg(w - tr, 0, undefined, [tr * KAPPA, 0]), seg(w, tr, [0, -tr * KAPPA]));
  else out.push(seg(w, 0));
  if (br) out.push(seg(w, h - br, undefined, [0, br * KAPPA]), seg(w - br, h, [br * KAPPA, 0]));
  else out.push(seg(w, h));
  if (bl) out.push(seg(bl, h, undefined, [-bl * KAPPA, 0]), seg(0, h - bl, [0, bl * KAPPA]));
  else out.push(seg(0, h));
  return out;
}

function fitAffine(scope: paper.PaperScope, from: paper.Point[], to: paper.Point[]): paper.Matrix | null {
  let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0;
  let xX = 0, yX = 0, X = 0, xY = 0, yY = 0, Y = 0;
  const n = from.length;
  for (let i = 0; i < n; i++) {
    const { x, y } = from[i];
    const t = to[i];
    sxx += x * x;
    sxy += x * y;
    sx += x;
    syy += y * y;
    sy += y;
    xX += x * t.x;
    yX += y * t.x;
    X += t.x;
    xY += x * t.y;
    yY += y * t.y;
    Y += t.y;
  }
  const det3 = (m: number[]) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  const M = [sxx, sxy, sx, sxy, syy, sy, sx, sy, n];
  const d = det3(M);
  if (Math.abs(d) < 1e-9) return null;
  const solve = (r: number[]) => [0, 1, 2].map((col) => det3(M.map((v, i) => (i % 3 === col ? r[Math.floor(i / 3)] : v))) / d);
  const [a, c, tx] = solve([xX, yX, X]);
  const [b, dd, ty] = solve([xY, yY, Y]);
  return new scope.Matrix(a, b, c, dd, tx, ty);
}

let measuringSpacing = 0;
let textPatched = false;

function patchTextSpacing(scope: paper.PaperScope) {
  const view = scope.view as unknown as { getTextWidth(font: string, lines: string[]): number; _context: CanvasRenderingContext2D & { letterSpacing?: string } };
  const measure = view.getTextWidth.bind(view);
  view.getTextWidth = (font, lines) => {
    const ctx = view._context;
    if (!measuringSpacing || !ctx || !("letterSpacing" in ctx)) return measure(font, lines);
    const prev = ctx.letterSpacing!;
    ctx.letterSpacing = `${measuringSpacing}px`;
    try {
      return measure(font, lines);
    } finally {
      ctx.letterSpacing = prev;
    }
  };
  if (textPatched) return;
  textPatched = true;
  type Proto = { _data?: { letterSpacing?: number }; _draw(ctx: CanvasRenderingContext2D, ...rest: unknown[]): void; _getBounds(...rest: unknown[]): unknown };
  const proto = scope.PointText.prototype as unknown as Proto;
  const draw = proto._draw;
  const bounds = proto._getBounds;
  proto._draw = function (this: Proto, ctx, ...rest) {
    const spacing = this._data?.letterSpacing;
    const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if (!spacing || !("letterSpacing" in c)) return draw.call(this, ctx, ...rest);
    const prev = c.letterSpacing!;
    c.letterSpacing = `${spacing}px`;
    try {
      draw.call(this, ctx, ...rest);
    } finally {
      c.letterSpacing = prev;
    }
  };
  proto._getBounds = function (this: Proto, ...rest) {
    measuringSpacing = this._data?.letterSpacing ?? 0;
    try {
      return bounds.apply(this, rest);
    } finally {
      measuringSpacing = 0;
    }
  };
}

const sameItems = (a: paper.Item[], b: paper.Item[]) => a.length === b.length && a.every((i) => b.includes(i));

export class DrawingEngine {
  readonly scope: paper.PaperScope;
  private back: paper.Layer;
  private refLayer: paper.Layer;
  reference: paper.Raster | null = null;
  private onionLayer: paper.Layer;
  private gridLayer: paper.Layer;
  refAdjust = false;
  readonly art: paper.Layer;
  private outlineLayer: paper.Layer;
  private ui: paper.Layer;
  private board!: paper.Path;
  box: { x: number; y: number; w: number; h: number };
  tool: Tool = "select";
  selection: paper.Item[] = [];
  private nodes: paper.Segment[] = [];
  private curve: paper.Curve | null = null;
  key: paper.Item | null = null;
  isolated: paper.Group | null = null;
  private dimmed: [paper.Item, number][] = [];
  outlineView = false;
  options = {
    sides: 6,
    points: 5,
    snap: false,
    grid: 8,
    showGrid: false,
    radius: 0,
    turns: 3,
    shape: "heart" as ShapeKind,
    ref: "tl" as RefPoint,
    alignTo: "selection" as "selection" | "board"
  };
  defaults: { fill: string | null; stroke: string | null; strokeWidth: number } = { fill: "#d9d4cc", stroke: null, strokeWidth: 2 };
  lineDefaults: { stroke: string; strokeWidth: number } = { stroke: "#1d1b18", strokeWidth: 2 };
  fonts: { heading: string; body: string } = { heading: "Georgia, serif", body: "system-ui, sans-serif" };
  private history: { snap: string; label: string }[] = [];
  private future: { snap: string; label: string }[] = [];
  private lastCommit = { key: "", at: 0 };
  private clipboard: paper.Item[] = [];
  private styleClip: paper.Item | null = null;
  private lastAction: { copy: boolean; t: Transform } | null = null;
  private actionItems: paper.Item[] = [];
  private simplifyBase: { items: paper.Item[]; amount: number; saved: Map<paper.Path, paper.Segment[]> } | null = null;
  private colorCache: string[] | null = null;
  private gridKey = "";
  private measureTarget: paper.Rectangle | null = null;
  private altDown = false;
  private pointer: paper.Point | null = null;
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
    this.gridLayer = new this.scope.Layer();
    this.gridLayer.locked = true;
    this.art = new this.scope.Layer();
    this.outlineLayer = new this.scope.Layer();
    this.outlineLayer.locked = true;
    this.ui = new this.scope.Layer();
    patchTextSpacing(this.scope);
    this.box = viewBoxOf(svg);
    this.load(svg);
    this.drawBoard();
    this.art.activate();
    this.setupTool();
    canvas.addEventListener("dblclick", this.onDoubleClick);
    this.history = [{ snap: this.snapshot(), label: "Opened" }];
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
    for (const text of this.art.getItems({ recursive: true, class: this.scope.PointText }) as paper.PointText[]) {
      if (text.data.leading) text.leading = text.data.leading;
      delete text.data.leading;
    }
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
    this.commit("", "Artboard size");
  }

  exportSvg(): string {
    this.clearSelectionFlags();
    this.restoreDim();
    const texts = this.art.getItems({ recursive: true, class: this.scope.PointText, match: (t: paper.PointText) => t.content.includes("\n") }) as paper.PointText[];
    for (const t of texts) t.data.leading = Math.round(Number(t.leading) * 100) / 100;
    const ns = "http://www.w3.org/2000/svg";
    const doc = document.implementation.createDocument(ns, "svg", null);
    const root = doc.documentElement;
    const { x, y, w, h } = this.box;
    root.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    root.setAttribute("width", String(w));
    root.setAttribute("height", String(h));
    const layer = this.art.exportSVG({ asString: false, precision: 2 }) as SVGElement;
    for (const t of texts) delete t.data.leading;
    if (this.art.getItems({ recursive: true, match: (i: paper.Item) => Boolean(i.strokeColor) && i.strokeJoin === "miter" }).length) root.setAttribute("stroke-miterlimit", "10");
    for (const child of Array.from(layer.childNodes)) root.appendChild(doc.importNode(child, true));
    this.exportTextLines(doc, root);
    this.exportTextPaths(doc, root);
    this.restorePreserved(doc, root);
    const out = new XMLSerializer().serializeToString(root);
    this.applyDim();
    this.refresh();
    return out;
  }

  private exportTextLines(doc: XMLDocument, root: Element) {
    const ns = "http://www.w3.org/2000/svg";
    for (const el of Array.from(root.querySelectorAll("text"))) {
      let data: { letterSpacing?: number; leading?: number; glyph?: boolean } = {};
      try {
        data = JSON.parse(el.getAttribute("data-paper-data") ?? "{}");
      } catch {
        data = {};
      }
      if (data.glyph) continue;
      if (data.letterSpacing) el.setAttribute("letter-spacing", String(data.letterSpacing));
      const content = el.textContent ?? "";
      if (!content.includes("\n")) continue;
      const leading = data.leading ?? parseFloat(el.getAttribute("font-size") ?? "12") * 1.2;
      const x = el.getAttribute("x") ?? "0";
      el.textContent = "";
      content.split("\n").forEach((line, i) => {
        const span = doc.createElementNS(ns, "tspan");
        span.setAttribute("x", x);
        if (i) span.setAttribute("dy", String(leading));
        span.textContent = line;
        el.appendChild(span);
      });
    }
  }

  private snapshot(): string {
    this.clearSelectionFlags();
    this.restoreDim();
    this.art.opacity = 1;
    const json = JSON.stringify({ box: this.box, art: this.art.exportJSON({ asString: false }), ref: this.reference ? this.reference.matrix.values : null });
    this.art.opacity = this.outlineView ? 0 : 1;
    this.applyDim();
    return json;
  }

  commit(key = "", label?: string) {
    for (const group of this.textPathGroups()) this.layoutTextPath(group);
    if (key !== "simplify") this.simplifyBase = null;
    this.colorCache = null;
    const now = Date.now();
    const snap = this.snapshot();
    if (key && key === this.lastCommit.key && now - this.lastCommit.at < 800 && this.history.length > 1) this.history[this.history.length - 1].snap = snap;
    else this.history.push({ snap, label: label ?? COMMIT_LABELS[key] ?? "Edit" });
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
    this.dimmed = [];
    this.isolated = null;
    this.art.removeChildren();
    this.art.importJSON(art);
    this.art.opacity = this.outlineView ? 0 : 1;
    this.art.activate();
    this.selection = [];
    this.nodes = [];
    this.curve = null;
    this.key = null;
    this.simplifyBase = null;
    this.colorCache = null;
    this.refresh();
  }

  undo() {
    this.finishPen();
    if (this.history.length < 2) return;
    this.future.push(this.history.pop()!);
    this.restore(this.history[this.history.length - 1].snap);
  }

  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(next);
    this.restore(next.snap);
  }

  historyRows(): HistoryRow[] {
    return [
      ...this.history.map((h, i): HistoryRow => ({ label: h.label, state: i === this.history.length - 1 ? "current" : "past" })),
      ...[...this.future].reverse().map((f): HistoryRow => ({ label: f.label, state: "future" }))
    ];
  }

  goToHistory(index: number) {
    this.finishPen();
    const before = this.history.length;
    while (this.history.length - 1 > index && this.history.length > 1) this.future.push(this.history.pop()!);
    while (this.history.length - 1 < index && this.future.length) this.history.push(this.future.pop()!);
    if (this.history.length !== before) this.restore(this.history[this.history.length - 1].snap);
  }

  markClean() {
    this.history = [{ snap: this.snapshot(), label: "Opened" }];
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

  private get scopeRoot(): paper.Item {
    return this.isolated ?? this.art;
  }

  private inScope(item: paper.Item) {
    return item.isDescendant(this.scopeRoot);
  }

  private shown(item: paper.Item) {
    for (let i: paper.Item | null = item; i && i !== this.art; i = i.parent) if (!i.visible || i.locked) return false;
    return true;
  }

  private topLevel(item: paper.Item): paper.Item {
    const root = this.scopeRoot;
    let current = item;
    while (current.parent && current.parent !== root && current.parent !== this.art) current = current.parent;
    return current;
  }

  private adopt(item: paper.Item) {
    if (this.isolated && item.parent !== this.isolated) this.isolated.addChild(item);
  }

  select(items: paper.Item[]) {
    this.selection = items.filter((i) => !i.locked);
    this.nodes = [];
    this.curve = null;
    if (this.key && !this.selection.includes(this.key)) this.key = null;
    this.refresh();
  }

  selectById(id: number, add = false) {
    const item = this.art.getItem({ recursive: true, match: (i: paper.Item) => i.id === id });
    if (!item) return;
    if (!this.inScope(item)) this.leaveIsolation(true);
    this.select(add ? (this.selection.includes(item) ? this.selection.filter((i) => i !== item) : [...this.selection, item]) : [item]);
  }

  selectAll() {
    this.select(this.scopeRoot.children.filter((i) => i.visible && !i.locked));
  }

  private scopePaths(): paper.Path[] {
    return this.scopeRoot.getItems({ recursive: true, class: this.scope.Path, match: (p: paper.Path) => this.shown(p) && !p.clipMask }) as paper.Path[];
  }

  selectAllPoints() {
    let paths = this.selectedPaths();
    if (!paths.length) paths = this.scopePaths();
    this.selection = [...new Set(paths.map((p) => (p.parent instanceof this.scope.CompoundPath ? p.parent : p)))];
    this.nodes = paths.flatMap((p) => p.segments);
    this.curve = null;
    this.refresh();
  }

  isolate(group: paper.Group) {
    this.restoreDim();
    this.isolated = group;
    this.applyDim();
    this.select([]);
  }

  leaveIsolation(all = false) {
    const group = this.isolated;
    if (!group) return;
    this.restoreDim();
    const parent = group.parent;
    this.isolated = !all && parent instanceof this.scope.Group && parent !== this.art ? parent : null;
    this.applyDim();
    this.select(group.parent ? [this.topLevel(group)] : []);
  }

  private applyDim() {
    this.restoreDim();
    let item: paper.Item | null = this.isolated;
    while (item && item !== this.art && item.parent) {
      for (const sibling of item.parent.children) {
        if (sibling === item) continue;
        this.dimmed.push([sibling, sibling.opacity]);
        sibling.opacity *= 0.25;
      }
      item = item.parent;
    }
  }

  private restoreDim() {
    for (const [item, opacity] of this.dimmed) item.opacity = opacity;
    this.dimmed = [];
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

  private refresh(quiet = false) {
    if (this.destroyed) return;
    this.ui.removeChildren();
    this.clearSelectionFlags();
    const z = this.scope.view.zoom;
    this.drawGrid();
    this.drawOutlines();
    if (this.tool === "direct") {
      for (const item of this.selection) {
        item.selected = true;
        item.selectedColor = new this.scope.Color(ACCENT);
      }
      for (const s of this.nodes) if (s.path) s.selected = true;
      if (this.curve && !this.curve.path) this.curve = null;
      if (this.curve) {
        const c = this.curve;
        this.ui.activate();
        new this.scope.Path({
          segments: [new this.scope.Segment(c.point1, undefined, c.handle1), new this.scope.Segment(c.point2, c.handle2, undefined)],
          strokeColor: ACCENT,
          strokeWidth: 3 / z
        });
        this.art.activate();
      }
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
      if (this.key && this.selection.length > 1) new this.scope.Path.Rectangle({ rectangle: this.key.bounds.expand(4 / z), strokeColor: ACCENT, strokeWidth: 2.5 / z });
      if (this.measureTarget) this.drawMeasure(b, this.measureTarget, z);
      this.art.activate();
    }
    if (!quiet) this.callbacks.onChange();
  }

  private drawGrid() {
    const z = this.scope.view.zoom;
    const { x, y, w, h } = this.box;
    const key = this.options.showGrid ? `${z}|${x},${y},${w},${h}|${this.options.grid}` : "";
    if (key === this.gridKey) return;
    this.gridKey = key;
    this.gridLayer.removeChildren();
    if (!key) return;
    let step = Math.max(1, this.options.grid);
    let every = 8;
    while (step * z < 6) {
      step *= 2;
      every = Math.max(1, every / 2);
    }
    this.gridLayer.activate();
    const minor = new this.scope.CompoundPath({ strokeColor: new this.scope.Color(0.31, 0.55, 1, 0.16), strokeWidth: 1 / z });
    const major = new this.scope.CompoundPath({ strokeColor: new this.scope.Color(0.31, 0.55, 1, 0.38), strokeWidth: 1 / z });
    for (let gx = Math.ceil(x / step) * step; gx <= x + w; gx += step) {
      (Math.round(gx / step) % every === 0 ? major : minor).addChild(new this.scope.Path.Line({ from: [gx, y], to: [gx, y + h], insert: false }));
    }
    for (let gy = Math.ceil(y / step) * step; gy <= y + h; gy += step) {
      (Math.round(gy / step) % every === 0 ? major : minor).addChild(new this.scope.Path.Line({ from: [x, gy], to: [x + w, gy], insert: false }));
    }
    this.art.activate();
  }

  private drawOutlines() {
    this.outlineLayer.removeChildren();
    if (!this.outlineView) return;
    const z = this.scope.view.zoom;
    const ink = new this.scope.Color("#1d1b18");
    for (const child of this.art.children) this.outlineLayer.addChild(child.clone({ insert: false }));
    for (const item of this.outlineLayer.getItems({ recursive: true })) {
      item.opacity = 1;
      item.blendMode = "normal";
      item.shadowColor = null;
      if (item instanceof this.scope.Group && item.clipped) item.clipped = false;
      if (item.clipMask) item.clipMask = false;
      if (item instanceof this.scope.Raster) {
        const box = new this.scope.Path.Rectangle({ rectangle: item.bounds, insert: false });
        const frame = new this.scope.CompoundPath({ insert: false, children: [box, new this.scope.Path.Line({ from: item.bounds.topLeft, to: item.bounds.bottomRight, insert: false }), new this.scope.Path.Line({ from: item.bounds.topRight, to: item.bounds.bottomLeft, insert: false })] });
        frame.strokeColor = ink;
        frame.strokeWidth = 1 / z;
        item.replaceWith(frame);
      } else if (item instanceof this.scope.PathItem) {
        item.fillColor = null;
        item.strokeColor = ink;
        item.strokeWidth = 1 / z;
        item.dashArray = [];
      } else if (item instanceof this.scope.PointText) {
        item.fillColor = ink;
        item.strokeColor = null;
      }
    }
  }

  private drawMeasure(a: paper.Rectangle, b: paper.Rectangle, z: number) {
    const red = new this.scope.Color("#f0506e");
    const line = (from: paper.Point, to: paper.Point) => {
      const value = Math.round(from.getDistance(to) * 10) / 10;
      if (value < 0.05) return;
      new this.scope.Path.Line({ from, to, strokeColor: red, strokeWidth: 1 / z });
      const label = new this.scope.PointText({ content: String(value), fontSize: 11 / z, fontFamily: "system-ui, sans-serif", fillColor: "white", justification: "center" });
      label.position = from.add(to).divide(2);
      const pad = 3 / z;
      const bg = new this.scope.Path.Rectangle({ rectangle: label.bounds.expand(pad * 2), radius: pad, fillColor: red });
      bg.insertBelow(label);
    };
    const pt = (x: number, y: number) => new this.scope.Point(x, y);
    const cy = a.center.y;
    const cx = a.center.x;
    if (b.left <= a.left && a.right <= b.right) {
      line(pt(b.left, cy), pt(a.left, cy));
      line(pt(a.right, cy), pt(b.right, cy));
    } else if (b.left >= a.right) line(pt(a.right, cy), pt(b.left, cy));
    else if (b.right <= a.left) line(pt(b.right, cy), pt(a.left, cy));
    if (b.top <= a.top && a.bottom <= b.bottom) {
      line(pt(cx, b.top), pt(cx, a.top));
      line(pt(cx, a.bottom), pt(cx, b.bottom));
    } else if (b.top >= a.bottom) line(pt(cx, a.bottom), pt(cx, b.top));
    else if (b.bottom <= a.top) line(pt(cx, b.bottom), pt(cx, a.top));
    new this.scope.Path.Rectangle({ rectangle: b, strokeColor: red, strokeWidth: 1 / z, dashArray: [3 / z, 3 / z] });
  }

  private measureAt(point: paper.Point | null): paper.Rectangle | null {
    if (!point || !this.altDown || this.tool !== "select" || !this.selection.length || this.refAdjust) return null;
    const hit = this.art.hitTest(point, { fill: true, stroke: true, segments: true, tolerance: 4 / this.scope.view.zoom, match: (h: paper.HitResult) => this.shown(h.item) && this.inScope(h.item) });
    const target = hit ? this.topLevel(hit.item) : null;
    if (target && !this.selection.includes(target)) return target.bounds;
    return this.isolated ? this.isolated.bounds : this.board.bounds;
  }

  setAlt(down: boolean) {
    this.altDown = down;
    this.updateMeasure();
  }

  private updateMeasure() {
    const next = this.measureAt(this.pointer);
    const same = next && this.measureTarget ? next.equals(this.measureTarget) : next === this.measureTarget;
    if (same) return;
    this.measureTarget = next;
    this.refresh(true);
  }

  setOutlineView(on: boolean) {
    this.outlineView = on;
    this.art.opacity = on ? 0 : 1;
    this.refresh();
  }

  setGrid(patch: { showGrid?: boolean; grid?: number }) {
    if (patch.showGrid !== undefined) this.options.showGrid = patch.showGrid;
    if (patch.grid !== undefined) this.options.grid = Math.max(1, Math.round(patch.grid));
    this.refresh();
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
    const hit = this.art.hitTest(point, { fill: true, stroke: true, segments: true, tolerance: 5 / this.scope.view.zoom, match: (h: paper.HitResult) => this.shown(h.item) && this.inScope(h.item) });
    if (!hit) {
      this.leaveIsolation();
      return;
    }
    if (hit.item.parent?.data?.textPath) {
      this.select([hit.item.parent]);
    } else if (hit.item instanceof this.scope.PointText) {
      this.select([hit.item]);
      this.editText(hit.item);
    } else {
      const top = this.topLevel(hit.item);
      if (top instanceof this.scope.Group && top !== hit.item && !top.data?.textPath) {
        this.isolate(top);
        this.select([this.topLevel(hit.item)]);
      }
    }
  };

  private setupTool() {
    const tool = new this.scope.Tool();
    tool.minDistance = 0;
    let mode: "none" | "move" | "scale" | "rotate" | "marquee" | "pan" | "shape" | "node" | "handle" | "bend" | "pencil" | "pen-drag" = "none";
    let start: paper.Point;
    let last: paper.Point;
    let handleName = "";
    let startBounds: paper.Rectangle | null = null;
    let shape: paper.Item | null = null;
    let marquee: paper.Path | null = null;
    let dragHandle: { segment: paper.Segment; which: "in" | "out"; pull: boolean } | null = null;
    let bend: { curve: paper.Curve; t: number; smooth1: boolean; smooth2: boolean } | null = null;
    let changed = false;
    let copied = false;
    let rotated = 0;
    let keyCandidate: paper.Item | null = null;
    let lastClick = { at: 0, point: new this.scope.Point(0, 0) };

    const hitOptions = (extra: object = {}) => ({ fill: true, stroke: true, segments: true, tolerance: 5 / this.scope.view.zoom, ...extra });
    const inScopeHit = (h: paper.HitResult) => this.shown(h.item) && this.inScope(h.item);
    const isSmooth = (s: paper.Segment) => !s.handleIn.isZero() && !s.handleOut.isZero() && Math.abs(Math.abs(s.handleIn.getDirectedAngle(s.handleOut)) - 180) < 3;

    tool.onMouseDown = (e: paper.ToolEvent) => {
      const native = (e as unknown as { event: MouseEvent }).event;
      const now = Date.now();
      const double = now - lastClick.at < 350 && e.point.getDistance(lastClick.point) < 6 / this.scope.view.zoom;
      lastClick = { at: now, point: e.point };
      start = last = e.point;
      changed = false;
      copied = false;
      rotated = 0;
      keyCandidate = null;
      if (this.spaceDown || this.tool === "hand" || native?.button === 1) {
        mode = "pan";
        return;
      }
      const p = this.snap(e.point);
      const z = this.scope.view.zoom;
      switch (this.tool) {
        case "select": {
          if (this.refAdjust) {
            const uiHit = this.ui.hitTest(e.point, { fill: true, stroke: true, tolerance: 3 / z });
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
          const uiHit = this.ui.hitTest(e.point, { fill: true, stroke: true, tolerance: 3 / z });
          if (uiHit?.item.data.handle) {
            handleName = uiHit.item.data.handle;
            mode = handleName === "rotate" ? "rotate" : "scale";
            startBounds = this.selectionBounds();
            return;
          }
          const hit = this.art.hitTest(e.point, hitOptions({ match: inScopeHit }));
          if (hit) {
            const target = double && hit.item instanceof this.scope.PointText ? hit.item : this.topLevel(hit.item);
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
            } else if (this.selection.length > 1 && !mods(e).alt) {
              keyCandidate = target;
            }
            if (mods(e).alt && this.selection.length) {
              this.selection = this.selection.map((i) => i.clone());
              this.key = null;
              copied = true;
            }
            startBounds = this.selectionBounds();
            mode = "move";
          } else {
            if (!mods(e).shift) this.select([]);
            mode = "marquee";
          }
          return;
        }
        case "direct": {
          for (const item of this.selection) {
            const paths = item instanceof this.scope.CompoundPath ? (item.children as paper.Path[]) : item instanceof this.scope.Path ? [item] : [];
            for (const path of paths) {
              const hit = path.hitTest(e.point, { segments: true, handles: true, tolerance: 6 / z });
              if (!hit) continue;
              if (hit.type === "handle-in" || hit.type === "handle-out") {
                dragHandle = { segment: hit.segment, which: hit.type === "handle-in" ? "in" : "out", pull: false };
                mode = "handle";
                return;
              }
              if (hit.type === "segment") {
                this.curve = null;
                if (double) {
                  if (hit.segment.hasHandles()) hit.segment.clearHandles();
                  else hit.segment.smooth({ type: "catmull-rom" });
                  this.commit("", "Point type");
                  mode = "none";
                  return;
                }
                if (mods(e).alt) {
                  hit.segment.clearHandles();
                  this.nodes = [hit.segment];
                  dragHandle = { segment: hit.segment, which: "out", pull: true };
                  mode = "handle";
                  this.refresh();
                  return;
                }
                if (mods(e).shift) this.nodes = this.nodes.includes(hit.segment) ? this.nodes.filter((s) => s !== hit.segment) : [...this.nodes, hit.segment];
                else if (!this.nodes.includes(hit.segment)) this.nodes = [hit.segment];
                mode = "node";
                this.refresh();
                return;
              }
            }
          }
          const near = this.nearestOutline(e.point, 6 / z, this.selectedPaths());
          if (near) {
            if (double) {
              const segment = near.path.divideAt(near.location) ? near.path.segments[near.location.index + 1] : null;
              this.nodes = segment ? [segment] : [];
              this.curve = null;
              this.commit("", "Add point");
              mode = "node";
              return;
            }
            const curve = near.location.curve;
            this.curve = curve;
            this.nodes = [];
            bend = { curve, t: Math.max(0.08, Math.min(0.92, near.location.time)), smooth1: isSmooth(curve.segment1), smooth2: isSmooth(curve.segment2) };
            mode = "bend";
            this.refresh();
            return;
          }
          const hit = this.art.hitTest(e.point, hitOptions({ match: inScopeHit }));
          if (hit) {
            const tpGroup = hit.item.parent?.data?.textPath ? hit.item.parent : null;
            const target = tpGroup ? (tpGroup.children.find((c) => c.data.guide) ?? hit.item) : hit.item.parent instanceof this.scope.CompoundPath ? hit.item.parent : hit.item;
            this.selection = mods(e).shift && !this.selection.includes(target) ? [...this.selection, target] : [target];
            this.nodes = [];
            this.curve = null;
            mode = "none";
            this.refresh();
          } else {
            if (!mods(e).shift) this.select([]);
            mode = "marquee";
          }
          return;
        }
        case "scissors": {
          const near = this.nearestOutline(e.point, 6 / z, this.scopePaths());
          if (!near) return;
          const piece = near.path.splitAt(near.location);
          this.select(piece && piece !== near.path ? [near.path, piece] : [near.path]);
          this.commit("", "Cut path");
          mode = "none";
          return;
        }
        case "eyedropper": {
          const hit = this.art.hitTest(e.point, hitOptions({ match: inScopeHit }));
          if (hit) this.pickStyle(hit.item);
          mode = "none";
          return;
        }
        case "pen": {
          const tol = 8 / z;
          if (this.penPath && this.penPath.segments.length > 1 && this.penPath.firstSegment.point.getDistance(e.point) < tol) {
            this.penPath.closed = true;
            if (!this.penPath.fillColor && this.defaults.fill) this.penPath.fillColor = new this.scope.Color(this.defaults.fill);
            this.finishPen();
            mode = "none";
            return;
          }
          const end = this.openEndAt(e.point, tol, this.penPath);
          if (!this.penPath && end) {
            if (end.first) end.path.reverse();
            this.penPath = end.path;
            this.select([]);
            mode = "none";
            return;
          }
          if (this.penPath && end) {
            this.penPath.add(end.point);
            this.penPath.join(end.path, 0.01);
            this.finishPen();
            mode = "none";
            return;
          }
          if (!this.penPath) {
            this.penPath = new this.scope.Path();
            this.applyDefaults(this.penPath, true);
            this.penPath.add(p);
            this.adopt(this.penPath);
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
          const hit = this.art.hitTest(e.point, hitOptions({ match: inScopeHit }));
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
          this.adopt(text);
          this.select([text]);
          this.commit("", "Add text");
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
      this.pointer = e.point;
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
        rotated += angle;
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
      } else if (mode === "bend" && bend) {
        const { curve, t } = bend;
        const delta = e.point.subtract(last);
        last = e.point;
        let weight: number;
        if (t <= 1 / 6) weight = 0;
        else if (t <= 0.5) weight = Math.pow((6 * t - 1) / 2, 3) / 2;
        else if (t <= 5 / 6) weight = (1 - Math.pow((6 * (1 - t) - 1) / 2, 3)) / 2 + 0.5;
        else weight = 1;
        curve.handle1 = curve.handle1.add(delta.multiply((1 - weight) / (3 * t * (1 - t) * (1 - t))));
        curve.handle2 = curve.handle2.add(delta.multiply(weight / (3 * t * t * (1 - t))));
        const s1 = curve.segment1;
        const s2 = curve.segment2;
        if (bend.smooth1 && !s1.handleOut.isZero()) s1.handleIn = s1.handleOut.normalize(-s1.handleIn.length);
        if (bend.smooth2 && !s2.handleIn.isZero()) s2.handleOut = s2.handleIn.normalize(-s2.handleOut.length);
        this.refresh();
      } else if (mode === "handle" && dragHandle) {
        const { segment, which, pull } = dragHandle;
        const v = e.point.subtract(segment.point);
        if (pull) {
          segment.handleOut = v;
          segment.handleIn = v.multiply(-1);
          this.refresh();
          return;
        }
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
          if (this.tool === "direct") this.boxSelectPoints(area, mods(e).shift);
          else {
            const inside = this.scopeRoot.children.filter((i) => i.visible && !i.locked && area.intersects(i.bounds));
            this.select(mods(e).shift ? [...new Set([...this.selection, ...inside])] : inside);
          }
        }
        return;
      }
      if (finished === "pencil" && shape) {
        const path = shape as paper.Path;
        if (path.length < 3) path.remove();
        else {
          path.simplify(2.5);
          this.adopt(path);
          this.select([path]);
          this.commit("", "Draw");
        }
        shape = null;
        return;
      }
      if (finished === "shape") {
        if (shape && (shape.bounds.width > 1 || shape.bounds.height > 1)) {
          this.adopt(shape);
          this.select([shape]);
          this.commit("", "Draw shape");
          this.setTool("select");
        } else shape?.remove();
        shape = null;
        return;
      }
      if (finished === "pen-drag") {
        this.refresh();
        return;
      }
      if (finished === "move" && !changed && keyCandidate) {
        this.key = this.key === keyCandidate ? null : keyCandidate;
        this.refresh();
      }
      if (changed && this.selection.length && !this.refAdjust) {
        if (finished === "move") this.recordAction({ dx: last.x - start.x, dy: last.y - start.y, scaleX: 100, scaleY: 100, rotate: 0, each: false }, copied);
        else if (finished === "rotate" && rotated) this.recordAction({ dx: 0, dy: 0, scaleX: 100, scaleY: 100, rotate: rotated, each: false, ref: "c" }, false);
        else if (finished === "scale" && startBounds) {
          const b = this.selectionBounds()!;
          const pivot = (handleName.includes("n") ? "b" : handleName.includes("s") ? "t" : "") + (handleName.includes("w") ? "r" : handleName.includes("e") ? "l" : "");
          const ref = (mods(e).alt ? "c" : pivot || "c") as RefPoint;
          const sx = startBounds.width ? (b.width / startBounds.width) * 100 : 100;
          const sy = startBounds.height ? (b.height / startBounds.height) * 100 : 100;
          this.recordAction({ dx: 0, dy: 0, scaleX: sx, scaleY: sy, rotate: 0, each: false, ref }, false);
        }
      }
      if (changed && ["move", "scale", "rotate", "node", "handle", "bend"].includes(finished)) {
        const labels: Record<string, string> = { move: copied ? "Copy" : "Move", scale: "Resize", rotate: "Rotate", node: "Move points", handle: "Change curve", bend: "Bend curve" };
        this.commit("", labels[finished]);
      }
      dragHandle = null;
      bend = null;
      startBounds = null;
    };

    tool.onMouseMove = (e: paper.ToolEvent) => {
      this.pointer = e.point;
      this.altDown = mods(e).alt;
      if (this.tool === "select") this.updateMeasure();
      if (this.tool !== "pen" || !this.penPath) return;
      this.previewPath?.remove();
      this.ui.activate();
      const lastSeg = this.penPath.lastSegment;
      const to = mods(e).shift ? this.constrain(lastSeg.point, this.snap(e.point)) : this.snap(e.point);
      this.previewPath = new this.scope.Path({ segments: [new this.scope.Segment(lastSeg.point, undefined, lastSeg.handleOut), to], strokeColor: ACCENT, strokeWidth: 1 / this.scope.view.zoom });
      this.art.activate();
    };
  }

  private nearestOutline(point: paper.Point, tolerance: number, paths: paper.Path[]): { path: paper.Path; location: paper.CurveLocation } | null {
    let best: { path: paper.Path; location: paper.CurveLocation; d: number } | null = null;
    for (const path of paths) {
      if (!path.segments.length || !path.bounds.expand(tolerance * 2).contains(point)) continue;
      const location = path.getNearestLocation(point);
      if (!location) continue;
      const d = location.point.getDistance(point);
      if (d <= tolerance && (!best || d < best.d)) best = { path, location, d };
    }
    return best;
  }

  private openEndAt(point: paper.Point, tolerance: number, except: paper.Path | null): { path: paper.Path; first: boolean; point: paper.Point } | null {
    for (const path of this.scopePaths()) {
      if (path === except || path.closed || path.segments.length < 2 || path.parent instanceof this.scope.CompoundPath) continue;
      if (path.firstSegment.point.getDistance(point) < tolerance) return { path, first: true, point: path.firstSegment.point.clone() };
      if (path.lastSegment.point.getDistance(point) < tolerance) return { path, first: false, point: path.lastSegment.point.clone() };
    }
    return null;
  }

  private boxSelectPoints(area: paper.Rectangle, add: boolean) {
    const nodes = add ? [...this.nodes] : [];
    const items = add ? [...this.selection] : [];
    for (const path of this.scopePaths()) {
      const inside = path.segments.filter((s) => area.contains(s.point));
      if (!inside.length) continue;
      const owner = path.parent instanceof this.scope.CompoundPath ? path.parent : path;
      if (!items.includes(owner)) items.push(owner);
      for (const s of inside) if (!nodes.includes(s)) nodes.push(s);
    }
    this.selection = items;
    this.nodes = nodes;
    this.curve = null;
    this.refresh();
  }

  private makeShape(from: paper.Point, to: paper.Point, shift: boolean, alt: boolean): paper.Item {
    let v = to.subtract(from);
    if (shift && this.tool !== "line") {
      const size = Math.max(Math.abs(v.x), Math.abs(v.y));
      v = new this.scope.Point(Math.sign(v.x || 1) * size, Math.sign(v.y || 1) * size);
    }
    const a = alt && this.tool !== "arc" ? from.subtract(v) : from;
    const b = from.add(v);
    let item: paper.Item;
    switch (this.tool) {
      case "arc": {
        const end = shift ? b : to;
        const corner = alt ? new this.scope.Point(end.x, from.y) : new this.scope.Point(from.x, end.y);
        item = new this.scope.Path([new this.scope.Segment(from, undefined, corner.subtract(from).multiply(KAPPA)), new this.scope.Segment(end, corner.subtract(end).multiply(KAPPA), undefined)]);
        this.applyDefaults(item, true);
        return item;
      }
      case "spiral": {
        const radius = Math.max(1, to.getDistance(from));
        const turns = Math.max(0.5, this.options.turns);
        const steps = Math.ceil(turns * 16);
        const points: paper.Point[] = [];
        for (let i = 0; i <= steps; i++) points.push(from.add(new this.scope.Point({ angle: (i / steps) * turns * 360, length: (radius * i) / steps })));
        const spiral = new this.scope.Path(points);
        spiral.smooth({ type: "catmull-rom" });
        spiral.rotate(to.subtract(from).angle - turns * 360, from);
        this.applyDefaults(spiral, true);
        return spiral;
      }
      case "shape":
        item = this.buildShape(this.options.shape, new this.scope.Rectangle(a, b));
        break;
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
      default: {
        const rect = new this.scope.Rectangle(a, b);
        const radii = [0, 1, 2, 3].map(() => this.options.radius);
        const path = new this.scope.Path({ segments: roundedRectSegments(this.scope, rect.width, rect.height, radii), closed: true });
        path.translate(rect.topLeft);
        path.data.shape = { kind: "rect", w: rect.width, h: rect.height, radii };
        item = path;
      }
    }
    this.applyDefaults(item);
    return item;
  }

  private buildShape(kind: ShapeKind, rect: paper.Rectangle): paper.PathItem {
    let item: paper.PathItem;
    const circle = (r: number) => new this.scope.Path.Circle({ center: [50, 50], radius: r, insert: false });
    if (kind === "gear") {
      const points: paper.Point[] = [];
      for (let i = 0; i < 10; i++) {
        const a = i * 36 - 90;
        for (const [da, r] of [[-13, 38], [-7, 50], [7, 50], [13, 38]]) points.push(new this.scope.Point(50, 50).add(new this.scope.Point({ angle: a + da, length: r })));
      }
      const wheel = new this.scope.Path({ segments: points, closed: true, insert: false });
      item = wheel.subtract(circle(15), { insert: false }) as paper.PathItem;
    } else if (kind === "donut") {
      item = circle(50).subtract(circle(24), { insert: false }) as paper.PathItem;
    } else {
      item = this.scope.PathItem.create(SHAPE_PATHS[kind] ?? SHAPE_PATHS.heart!);
      item.remove();
    }
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    item.scale(w / item.bounds.width, h / item.bounds.height, item.bounds.topLeft);
    item.translate(rect.topLeft.subtract(item.bounds.topLeft));
    this.art.addChild(item);
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
    this.commit("", "Draw path");
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
    this.commit("", "Edit text");
  }

  deleteSelection() {
    if (this.refAdjust) return;
    if (this.tool === "direct" && this.curve) {
      this.deleteCurve();
      return;
    }
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
      this.commit("", "Delete points");
      return;
    }
    if (!this.selection.length) return;
    for (const item of this.selection) item.remove();
    this.selection = [];
    this.key = null;
    this.commit("", "Delete");
  }

  deleteCurve() {
    const curve = this.curve;
    const path = curve?.path;
    this.curve = null;
    if (!curve || !path) return;
    const i = curve.index;
    const zero = new this.scope.Point(0, 0);
    const pieces: paper.Path[] = [];
    if (path.closed) {
      path.addSegments(path.removeSegments(0, i + 1));
      path.closed = false;
      path.firstSegment.handleIn = zero;
      path.lastSegment.handleOut = zero;
      pieces.push(path);
    } else {
      const tail = path.removeSegments(i + 1);
      path.lastSegment.handleOut = zero;
      if (tail.length >= 2) {
        const other = path.clone({ insert: false }) as paper.Path;
        other.removeSegments();
        other.addSegments(tail);
        other.firstSegment.handleIn = zero;
        other.name = "";
        other.insertAbove(path);
        pieces.push(other);
      }
      if (path.segments.length < 2) path.remove();
      else pieces.push(path);
    }
    this.selection = this.selection.filter((s) => s.parent).concat(pieces.filter((p) => !this.selection.includes(p) && !(p.parent instanceof this.scope.CompoundPath)));
    this.nodes = [];
    this.commit("", "Delete segment");
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
    this.lastAction = { copy: true, t: { dx: 10, dy: 10, scaleX: 100, scaleY: 100, rotate: 0, each: false } };
    this.actionItems = copies;
    this.commit("", "Duplicate");
  }

  private recordAction(t: Transform, copy: boolean) {
    const prev = this.lastAction;
    if (prev && sameItems(this.actionItems, this.selection) && (prev.copy || copy)) {
      const p = prev.t;
      this.lastAction = {
        copy: true,
        t: { ...p, dx: p.dx + t.dx, dy: p.dy + t.dy, rotate: p.rotate + t.rotate, scaleX: (p.scaleX * t.scaleX) / 100, scaleY: (p.scaleY * t.scaleY) / 100, ref: t.ref ?? p.ref }
      };
    } else this.lastAction = { copy, t };
    this.actionItems = [...this.selection];
  }

  repeat() {
    if (this.refAdjust) return;
    if (!this.lastAction || !this.selection.length) {
      this.duplicate();
      return;
    }
    this.transformBy(this.lastAction.t, this.lastAction.copy, false);
  }

  get canRepeat() {
    return Boolean(this.lastAction && this.selection.length);
  }

  refPoint(b: paper.Rectangle, ref: RefPoint = this.options.ref): paper.Point {
    const x = ref.endsWith("l") ? b.left : ref.endsWith("r") ? b.right : b.center.x;
    const y = ref.startsWith("t") ? b.top : ref.startsWith("b") ? b.bottom : b.center.y;
    return new this.scope.Point(x, y);
  }

  transformBy(t: Transform, copy = false, record = true) {
    if (this.refAdjust || !this.selection.length) return;
    let items = this.selection;
    if (copy) {
      items = items.map((i) => {
        const c = i.clone();
        c.name = "";
        return c;
      });
    }
    const whole = items.map((i) => i.bounds).reduce((a, b) => a.unite(b));
    const pivotAll = this.refPoint(whole, t.ref);
    const sx = t.scaleX / 100;
    const sy = t.scaleY / 100;
    for (const item of items) {
      const pivot = t.each ? this.refPoint(item.bounds, t.ref) : pivotAll;
      if ((sx !== 1 || sy !== 1) && sx && sy) item.scale(sx, sy, pivot);
      if (t.rotate) {
        item.rotate(t.rotate, pivot);
        item.data.rotation = (((item.data.rotation ?? 0) + t.rotate + 540) % 360) - 180;
      }
      if (t.dx || t.dy) item.translate(new this.scope.Point(t.dx, t.dy));
    }
    this.select(items);
    if (record) this.lastAction = { copy, t };
    this.actionItems = [...items];
    this.commit("", copy ? "Transform a copy" : "Transform");
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
      (this.isolated ?? this.art).addChild(item);
      item.translate(new this.scope.Point(10, 10));
      return item;
    });
    this.clipboard = pasted.map((p) => p.clone({ insert: false }));
    this.select(pasted);
    this.commit("", "Paste");
  }

  nudge(dx: number, dy: number) {
    if (this.tool === "direct" && this.nodes.length) {
      for (const s of this.nodes) s.point = s.point.add(new this.scope.Point(dx, dy));
    } else {
      for (const item of this.selection) item.translate(new this.scope.Point(dx, dy));
      if (this.selection.length) this.recordAction({ dx, dy, scaleX: 100, scaleY: 100, rotate: 0, each: false }, false);
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
    this.commit("", "Group");
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
    this.commit("", "Ungroup");
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
    this.commit("", "Arrange");
  }

  align(op: AlignOp) {
    if (this.refAdjust) return;
    if (!this.selection.length) return;
    const toBoard = this.selection.length === 1 || this.options.alignTo === "board";
    const key = !toBoard && this.key && this.selection.includes(this.key) ? this.key : null;
    const target = toBoard ? this.board.bounds : key ? key.bounds : this.selectionBounds()!;
    for (const item of this.selection) {
      if (item === key) continue;
      const b = item.bounds;
      const dx = op === "left" ? target.left - b.left : op === "right" ? target.right - b.right : op === "hcenter" ? target.center.x - b.center.x : 0;
      const dy = op === "top" ? target.top - b.top : op === "bottom" ? target.bottom - b.bottom : op === "vcenter" ? target.center.y - b.center.y : 0;
      item.translate(new this.scope.Point(dx, dy));
    }
    this.commit("", "Align");
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
    this.commit("", "Distribute");
  }

  spaceEvenly(axis: "x" | "y", gap: number | null) {
    if (this.refAdjust) return;
    const n = this.selection.length;
    if (n < (gap === null ? 3 : 2)) return;
    const lo = axis === "x" ? "left" : "top";
    const size = axis === "x" ? "width" : "height";
    const sorted = [...this.selection].sort((a, b) => a.bounds[lo] - b.bounds[lo]);
    const first = sorted[0].bounds;
    let g = gap;
    if (g === null) {
      const end = Math.max(...sorted.map((i) => i.bounds[lo] + i.bounds[size]));
      const total = sorted.reduce((sum, i) => sum + i.bounds[size], 0);
      g = (end - first[lo] - total) / (n - 1);
    }
    let at = first[lo] + first[size] + g;
    for (const item of sorted.slice(1)) {
      const d = at - item.bounds[lo];
      item.translate(axis === "x" ? new this.scope.Point(d, 0) : new this.scope.Point(0, d));
      at += item.bounds[size] + g;
    }
    this.commit("", "Space evenly");
  }

  flip(axis: "x" | "y") {
    const b = this.selectionBounds();
    if (!b) return;
    for (const item of this.selection) item.scale(axis === "x" ? -1 : 1, axis === "y" ? -1 : 1, b.center);
    this.commit("", "Flip");
  }

  selectedPaths(): paper.Path[] {
    const out = new Set<paper.Path>();
    const walk = (item: paper.Item) => {
      if (item instanceof this.scope.Path) out.add(item);
      else if (item.children && !(item instanceof this.scope.PointText)) for (const kid of item.children) walk(kid);
    };
    for (const item of this.selection) walk(item);
    return [...out];
  }

  pathInfo(): PathInfo | null {
    const paths = this.selectedPaths();
    if (!paths.length) return null;
    const ends = this.nodes.filter((s) => s.path && !s.path.closed && (s.isFirst() || s.isLast()));
    const open = paths.filter((p) => !p.closed).length;
    return {
      paths: paths.length,
      points: paths.reduce((n, p) => n + p.segments.length, 0),
      open,
      closed: paths.length - open,
      compound: this.selection.some((i) => i instanceof this.scope.CompoundPath),
      nodes: this.nodes.length,
      pointType: this.pointType(),
      curve: Boolean(this.curve?.path),
      canJoin: (this.tool === "direct" && ends.length === 2) || this.selection.some((i) => i instanceof this.scope.Path && !i.closed),
      canBreak: this.nodes.some((s) => s.path && (s.path.closed || (!s.isFirst() && !s.isLast())))
    };
  }

  private pointType(): PointType | null {
    if (!this.nodes.length) return null;
    const types = this.nodes.map((s): PointType | null => {
      if (!s.hasHandles()) return "sharp";
      const inL = s.handleIn.length;
      const outL = s.handleOut.length;
      if (!inL || !outL) return null;
      if (Math.abs(Math.abs(s.handleIn.getDirectedAngle(s.handleOut)) - 180) > 2) return null;
      return Math.abs(inL - outL) < 0.5 ? "symmetric" : "smooth";
    });
    return types.every((t) => t === types[0]) ? types[0] : null;
  }

  setPointType(type: PointType) {
    if (!this.nodes.length) return;
    for (const s of this.nodes) {
      if (type === "sharp") s.clearHandles();
      else if (type === "auto") s.smooth({ type: "catmull-rom" });
      else {
        if (!s.hasHandles()) s.smooth({ type: "catmull-rom" });
        const hin = s.handleIn;
        const hout = s.handleOut;
        let dir = hout.subtract(hin);
        if (dir.isZero()) dir = hout.isZero() ? hin.multiply(-1) : hout;
        if (dir.isZero()) continue;
        dir = dir.normalize();
        const inL = hin.length || hout.length;
        const outL = hout.length || hin.length;
        const avg = (inL + outL) / 2;
        s.handleIn = dir.multiply(-(type === "symmetric" ? avg : inL));
        s.handleOut = dir.multiply(type === "symmetric" ? avg : outL);
      }
    }
    this.commit("", "Point type");
  }

  lineUpPoints(axis: "x" | "y" | "both") {
    if (this.nodes.length < 2) return;
    const avg = this.nodes.reduce((sum, s) => sum.add(s.point), new this.scope.Point(0, 0)).divide(this.nodes.length);
    for (const s of this.nodes) s.point = new this.scope.Point(axis === "y" ? s.point.x : avg.x, axis === "x" ? s.point.y : avg.y);
    this.commit("", "Line up points");
  }

  breakAtPoints() {
    const byPath = new Map<paper.Path, paper.Point[]>();
    for (const s of this.nodes) if (s.path) byPath.set(s.path, [...(byPath.get(s.path) ?? []), s.point.clone()]);
    const results: paper.Item[] = [];
    for (const [path, points] of byPath) {
      const pieces = [path];
      for (const point of points) {
        for (const piece of pieces) {
          const seg = piece.segments.find((s) => s.point.getDistance(point) < 1e-6 && (piece.closed || (!s.isFirst() && !s.isLast())));
          if (!seg) continue;
          const next = piece.splitAt(seg.location);
          if (next && next !== piece) pieces.push(next);
          break;
        }
      }
      results.push(...pieces.filter((p) => !(p.parent instanceof this.scope.CompoundPath)));
    }
    const owners = this.selection.filter((i) => i.parent);
    this.selection = [...new Set([...owners, ...results])];
    this.nodes = [];
    this.curve = null;
    this.commit("", "Break at points");
  }

  join() {
    if (this.refAdjust) return;
    const ends = this.nodes.filter((s) => s.path && !s.path.closed && (s.isFirst() || s.isLast()));
    if (this.tool === "direct" && ends.length === 2) {
      const [sa, sb] = ends;
      const a = sa.path!;
      const b = sb.path!;
      if (a === b) a.closed = true;
      else {
        if (sa.isFirst()) a.reverse();
        if (sb.isLast()) b.reverse();
        a.join(b, 0.5);
      }
      this.nodes = [];
      this.selection = [a];
      this.commit("", "Join");
      return;
    }
    const open = this.selection.filter((i): i is paper.Path => i instanceof this.scope.Path && !i.closed && i.segments.length > 1);
    if (!open.length) return;
    if (open.length === 1) {
      open[0].closed = true;
      this.select([open[0]]);
      this.commit("", "Close path");
      return;
    }
    const [first, ...rest] = open;
    let pool = rest;
    while (pool.length) {
      let best: { path: paper.Path; d: number; flipA: boolean; flipB: boolean } | null = null;
      for (const path of pool) {
        const options: [number, boolean, boolean][] = [
          [first.lastSegment.point.getDistance(path.firstSegment.point), false, false],
          [first.lastSegment.point.getDistance(path.lastSegment.point), false, true],
          [first.firstSegment.point.getDistance(path.firstSegment.point), true, false],
          [first.firstSegment.point.getDistance(path.lastSegment.point), true, true]
        ];
        for (const [d, flipA, flipB] of options) if (!best || d < best.d) best = { path, d, flipA, flipB };
      }
      const pick = best!;
      if (pick.flipA) first.reverse();
      if (pick.flipB) pick.path.reverse();
      first.join(pick.path, 0.5);
      pool = pool.filter((p) => p !== pick.path);
    }
    this.select([first]);
    this.commit("", "Join");
  }

  openPath() {
    const closed = this.selectedPaths().filter((p) => p.closed);
    if (!closed.length) return;
    for (const path of closed) path.splitAt(0);
    this.nodes = [];
    this.commit("", "Open path");
  }

  pathOp(op: PathOp) {
    const paths = this.selectedPaths();
    if (!paths.length) return;
    const zero = new this.scope.Point(0, 0);
    const nodes = this.tool === "direct" ? this.nodes.filter((s) => s.path) : [];
    for (const path of paths) {
      if (op === "reverse") path.reverse();
      else if (op === "smooth") {
        if (nodes.length) nodes.filter((s) => s.path === path).forEach((s) => s.smooth({ type: "catmull-rom" }));
        else path.smooth({ type: "catmull-rom" });
      } else if (op === "addPoints") {
        const curves = path.curves;
        for (let i = curves.length - 1; i >= 0; i--) curves[i].divideAtTime(0.5);
      } else if (op === "reduce") {
        path.reduce({ simplify: true });
        for (let i = path.segments.length - 1; i > 0; i--) {
          const s = path.segments[i];
          const prev = path.segments[i - 1];
          if (s.point.getDistance(prev.point) < 0.01 && path.segments.length > 2) {
            prev.handleOut = s.handleOut;
            s.remove();
          }
        }
      } else if (op === "straighten") {
        const targets = nodes.length ? nodes.filter((s) => s.path === path) : path.segments;
        for (const s of targets) {
          s.handleIn = zero;
          s.handleOut = zero;
        }
      }
    }
    if (op !== "straighten" && op !== "smooth") this.nodes = [];
    this.curve = null;
    const labels: Record<PathOp, string> = { reverse: "Reverse direction", smooth: "Smooth", addPoints: "Add points", reduce: "Remove extra points", straighten: "Straighten" };
    this.commit("", labels[op]);
  }

  get simplifyAmount() {
    return this.simplifyBase && sameItems(this.simplifyBase.items, this.selection) ? this.simplifyBase.amount : 0;
  }

  simplify(amount: number) {
    const paths = this.selectedPaths();
    if (!paths.length) return;
    if (!this.simplifyBase || !sameItems(this.simplifyBase.items, this.selection)) {
      this.simplifyBase = { items: [...this.selection], amount: 0, saved: new Map(paths.map((p) => [p, p.segments.map((s) => s.clone())])) };
    }
    this.simplifyBase.amount = amount;
    for (const [path, segments] of this.simplifyBase.saved) {
      path.removeSegments();
      path.addSegments(segments.map((s) => s.clone()));
      if (amount > 0 && segments.length > 2) path.simplify(amount);
    }
    this.nodes = [];
    this.curve = null;
    const base = this.simplifyBase;
    this.commit("simplify");
    this.simplifyBase = base;
  }

  breakApart() {
    if (this.refAdjust) return;
    const out: paper.Item[] = [];
    let changed = false;
    for (const item of this.selection) {
      if (!(item instanceof this.scope.CompoundPath)) {
        out.push(item);
        continue;
      }
      changed = true;
      const source = new this.scope.Path({ insert: false });
      source.style = item.style;
      for (const kid of [...item.children] as paper.Path[]) {
        kid.insertBelow(item);
        kid.style = source.style;
        kid.fillRule = item.fillRule;
        kid.opacity = item.opacity;
        out.push(kid);
      }
      item.remove();
    }
    if (!changed) return;
    this.select(out);
    this.commit("", "Break apart");
  }

  combine() {
    if (this.refAdjust) return;
    const shapes = this.selection.filter((i): i is paper.PathItem => i instanceof this.scope.PathItem).sort((a, b) => a.index - b.index);
    if (shapes.length < 2) return;
    const base = shapes[0];
    const compound = new this.scope.CompoundPath({ insert: false });
    compound.insertAbove(shapes[shapes.length - 1]);
    compound.style = base.style;
    compound.opacity = base.opacity;
    for (const shape of shapes) {
      if (shape instanceof this.scope.CompoundPath) {
        compound.addChildren([...shape.children]);
        shape.remove();
      } else compound.addChild(shape);
    }
    compound.fillRule = "evenodd";
    this.select([compound]);
    this.commit("", "Combine");
  }

  private liveRect(item: paper.Item | undefined) {
    if (!(item instanceof this.scope.Path) || item.data?.shape?.kind !== "rect" || !item.closed) return null;
    const { w, h, radii } = item.data.shape as { w: number; h: number; radii: number[] };
    const canon = roundedRectSegments(this.scope, w, h, radii);
    if (canon.length !== item.segments.length) return null;
    const m = fitAffine(
      this.scope,
      canon.map((s) => s.point),
      item.segments.map((s) => s.point)
    );
    if (!m) return null;
    const ok = canon.every((s, i) => {
      const actual = item.segments[i];
      if (m.transform(s.point).getDistance(actual.point) > 0.5) return false;
      const hin = m.transform(s.point.add(s.handleIn)).subtract(m.transform(s.point));
      const hout = m.transform(s.point.add(s.handleOut)).subtract(m.transform(s.point));
      return hin.getDistance(actual.handleIn) < 0.5 && hout.getDistance(actual.handleOut) < 0.5;
    });
    if (!ok) return null;
    const sx = Math.hypot(m.a, m.b);
    const sy = Math.hypot(m.c, m.d);
    if (!sx || !sy) return null;
    return { path: item, w: w * sx, h: h * sy, radii: radii.map((r) => r * Math.min(sx, sy)), rotation: new this.scope.Matrix(m.a / sx, m.b / sx, m.c / sy, m.d / sy, m.tx, m.ty) };
  }

  rectInfo(): { radii: number[]; max: number } | null {
    if (this.selection.length !== 1) return null;
    const live = this.liveRect(this.selection[0]);
    return live ? { radii: live.radii.map((r) => Math.round(r * 10) / 10), max: Math.min(live.w, live.h) / 2 } : null;
  }

  setRadius(radii: number[]) {
    const live = this.liveRect(this.selection[0]);
    if (!live) return;
    const clean = radii.map((r) => Math.max(0, Math.min(Math.min(live.w, live.h) / 2, r)));
    const temp = new this.scope.Path({ segments: roundedRectSegments(this.scope, live.w, live.h, clean), closed: true, insert: false });
    temp.transform(live.rotation);
    live.path.removeSegments();
    live.path.addSegments(temp.removeSegments());
    live.path.data.shape = { kind: "rect", w: live.w, h: live.h, radii: clean };
    this.commit("radius");
  }

  selectSame(what: SameKind) {
    const leaf = (item: paper.Item): paper.Item => (item instanceof this.scope.Group && item.children.length ? leaf(item.children[item.clipped ? Math.min(1, item.children.length - 1) : 0]) : item);
    const first = this.selection[0];
    if (!first) return;
    const src = leaf(first);
    const pool = this.scopeRoot.getItems({
      recursive: true,
      match: (i: paper.Item) => this.shown(i) && !(i instanceof this.scope.Group) && !i.data?.glyph && !i.data?.guide && !i.clipMask && !(i.parent instanceof this.scope.CompoundPath)
    });
    const same = pool.filter((i) => {
      if (what === "kind") return i.className === src.className;
      if (what === "fill") return toHex(i.fillColor) === toHex(src.fillColor) && Boolean(i.fillColor?.gradient) === Boolean(src.fillColor?.gradient);
      if (what === "stroke") return Boolean(src.strokeColor) && toHex(i.strokeColor) === toHex(src.strokeColor);
      return Boolean(src.strokeColor) && Boolean(i.strokeColor) && Math.abs(i.strokeWidth - src.strokeWidth) < 0.01;
    });
    this.select(same.length ? same : [first]);
  }

  private fillOf(item: paper.Item): Fill {
    const fillColor = item.fillColor;
    if (fillColor?.gradient) {
      const stops = fillColor.gradient.stops;
      const { origin, destination } = fillColor as unknown as { origin: paper.Point; destination: paper.Point };
      return {
        kind: fillColor.gradient.radial ? "radial" : "linear",
        color: toHex(stops[0]?.color) ?? "#000000",
        color2: toHex(stops[stops.length - 1]?.color) ?? "#ffffff",
        angle: Math.round(destination.subtract(origin).angle)
      };
    }
    const hex = toHex(fillColor);
    return hex ? { kind: "solid", color: hex, color2: "#ffffff", angle: 90 } : { kind: "none", color: "#d9d4cc", color2: "#ffffff", angle: 90 };
  }

  private styleSource(item: paper.Item): paper.Item {
    return item instanceof this.scope.Group && item.children.length ? this.styleSource(item.children[item.clipped ? Math.min(1, item.children.length - 1) : 0]) : item;
  }

  private applyStyleFrom(src: paper.Item, target: paper.Item) {
    if (target instanceof this.scope.Group) {
      if (target.data?.textPath) {
        target.data.textPath = { ...target.data.textPath, fill: toHex(src.fillColor) ?? target.data.textPath.fill };
        return;
      }
      for (const kid of target.children) if (!kid.clipMask) this.applyStyleFrom(src, kid);
      return;
    }
    if (target instanceof this.scope.Raster) return;
    target.fillColor = this.makeFill(target, this.fillOf(src));
    target.strokeColor = src.strokeColor ? new this.scope.Color(toHex(src.strokeColor) ?? "#000000") : null;
    target.strokeWidth = src.strokeWidth;
    target.dashArray = [...(src.dashArray ?? [])];
    target.dashOffset = src.dashOffset;
    target.strokeCap = src.strokeCap;
    target.strokeJoin = src.strokeJoin;
    target.miterLimit = src.miterLimit;
    target.opacity = src.opacity;
    if (target instanceof this.scope.PathItem && src instanceof this.scope.PathItem) target.fillRule = src.fillRule;
    if (target instanceof this.scope.PointText && src instanceof this.scope.PointText) {
      target.fontFamily = src.fontFamily;
      target.fontSize = src.fontSize;
      target.fontWeight = src.fontWeight;
      target.leading = src.leading;
      target.data.letterSpacing = src.data.letterSpacing;
      target.content = target.content;
    }
  }

  pickStyle(item: paper.Item) {
    const src = this.styleSource(item);
    if (!this.selection.length || this.selection.includes(item) || this.selection.includes(this.topLevel(item))) {
      const fill = this.fillOf(src);
      this.defaults.fill = fill.kind === "none" ? null : fill.color;
      this.defaults.stroke = toHex(src.strokeColor);
      if (src.strokeColor) this.lineDefaults.stroke = toHex(src.strokeColor)!;
      this.defaults.strokeWidth = src.strokeWidth || this.defaults.strokeWidth;
      this.lineDefaults.strokeWidth = src.strokeWidth || this.lineDefaults.strokeWidth;
      this.callbacks.onChange();
      return;
    }
    for (const target of this.selection) this.applyStyleFrom(src, target);
    this.commit("", "Pick up style");
  }

  copyStyle() {
    const first = this.selection[0];
    if (first) this.styleClip = this.styleSource(first).clone({ insert: false });
    this.callbacks.onChange();
  }

  get canPasteStyle() {
    return Boolean(this.styleClip && this.selection.length);
  }

  pasteStyle() {
    if (!this.styleClip || !this.selection.length || this.refAdjust) return;
    for (const target of this.selection) this.applyStyleFrom(this.styleClip, target);
    this.commit("", "Paste style");
  }

  documentColors(): string[] {
    if (this.colorCache) return this.colorCache;
    const counts = new Map<string, number>();
    const note = (c: paper.Color | null | undefined) => {
      if (!c) return;
      const list = c.gradient ? c.gradient.stops.map((s) => toHex(s.color)) : [toHex(c)];
      for (const hex of list) if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
    };
    for (const item of this.art.getItems({ recursive: true, match: (i: paper.Item) => !(i.parent instanceof this.scope.CompoundPath) && !i.data?.glyph })) {
      note(item.fillColor);
      note(item.strokeColor);
    }
    this.colorCache = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([hex]) => hex);
    return this.colorCache;
  }

  async exportPng(scale: number, selectionOnly: boolean, background: string | null): Promise<Blob> {
    this.finishPen();
    this.clearSelectionFlags();
    this.restoreDim();
    const group = new this.scope.Group({ insert: false });
    const only = selectionOnly && this.selection.length > 0;
    if (only) {
      group.addChildren(this.selection.map((i) => i.clone({ insert: false })));
      if (background) group.insertChild(0, new this.scope.Path.Rectangle({ rectangle: group.strokeBounds, fillColor: background, insert: false }));
    } else {
      group.addChild(new this.scope.Path.Rectangle({ rectangle: this.board.bounds, insert: false }));
      if (background) group.addChild(new this.scope.Path.Rectangle({ rectangle: this.board.bounds, fillColor: background, insert: false }));
      group.addChildren(this.art.children.map((c) => c.clone({ insert: false })));
      group.clipped = true;
    }
    const raster = group.rasterize({ resolution: 72 * scale, insert: false });
    this.applyDim();
    this.refresh();
    return new Promise((resolve, reject) => raster.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The picture couldn't be made."))), "image/png"));
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
    this.commit("", op[0].toUpperCase() + op.slice(1));
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
    this.commit("", "Clip");
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
    this.commit("", "Release clip");
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
    this.commit("", "Text on path");
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
    this.commit("", "Outline to shape");
  }

  styleInfo(): StyleInfo {
    const item = this.selection[0];
    if (!item) {
      return {
        fill: { kind: this.defaults.fill ? "solid" : "none", color: this.defaults.fill ?? "#d9d4cc", color2: "#ffffff", angle: 90 },
        stroke: this.defaults.stroke,
        strokeWidth: this.defaults.strokeWidth,
        dash: false,
        dashArray: [],
        dashOffset: 0,
        cap: "butt",
        join: "miter",
        miterLimit: 10,
        fillRule: "nonzero",
        opacity: 1
      };
    }
    const style = this.styleSource(item);
    const dashArray = [...(style.dashArray ?? [])];
    return {
      fill: this.fillOf(style),
      stroke: toHex(style.strokeColor),
      strokeWidth: style.strokeWidth ?? 0,
      dash: dashArray.length > 0,
      dashArray,
      dashOffset: style.dashOffset ?? 0,
      cap: (style.strokeCap as StyleInfo["cap"]) ?? "butt",
      join: (style.strokeJoin as StyleInfo["join"]) ?? "miter",
      miterLimit: style.miterLimit ?? 10,
      fillRule: style instanceof this.scope.PathItem && style.fillRule === "evenodd" ? "evenodd" : "nonzero",
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
      if (patch.dashArray) item.dashArray = patch.dashArray;
      if (patch.dashOffset !== undefined) item.dashOffset = patch.dashOffset;
      if (patch.cap) item.strokeCap = patch.cap;
      if (patch.join) item.strokeJoin = patch.join;
      if (patch.miterLimit !== undefined) item.miterLimit = Math.max(1, patch.miterLimit);
      if (patch.fillRule && item instanceof this.scope.PathItem) item.fillRule = patch.fillRule;
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
      justification: item.justification as TextInfo["justification"],
      lineHeight: Math.round((Number(item.leading) / Number(item.fontSize)) * 100) / 100,
      spacing: item.data.letterSpacing ?? 0
    };
  }

  setText(patch: Partial<TextInfo>) {
    if (this.refAdjust) return;
    const item = this.selection[0];
    if (!(item instanceof this.scope.PointText)) return;
    if (patch.content !== undefined) item.content = patch.content;
    if (patch.fontFamily !== undefined) item.fontFamily = patch.fontFamily;
    const ratio = Number(item.leading) / Number(item.fontSize);
    if (patch.fontSize !== undefined) {
      item.fontSize = patch.fontSize;
      item.leading = ratio * patch.fontSize;
    }
    if (patch.fontWeight !== undefined) item.fontWeight = patch.fontWeight;
    if (patch.justification !== undefined) item.justification = patch.justification;
    if (patch.lineHeight !== undefined) item.leading = Math.max(0.5, patch.lineHeight) * Number(item.fontSize);
    if (patch.spacing !== undefined) {
      if (patch.spacing) item.data.letterSpacing = patch.spacing;
      else delete item.data.letterSpacing;
      item.content = item.content;
    }
    this.commit("text");
  }

  geometry(): { x: number; y: number; w: number; h: number; rotation: number } | null {
    const b = this.selectionBounds();
    if (!b) return null;
    const p = this.refPoint(b);
    return { x: p.x, y: p.y, w: b.width, h: b.height, rotation: this.selection.length === 1 ? (this.selection[0].data.rotation ?? 0) : 0 };
  }

  setGeometry(patch: Partial<{ x: number; y: number; w: number; h: number; rotation: number }>) {
    const b = this.selectionBounds();
    if (!b) return;
    if (patch.x !== undefined || patch.y !== undefined) {
      const p = this.refPoint(b);
      const d = new this.scope.Point((patch.x ?? p.x) - p.x, (patch.y ?? p.y) - p.y);
      for (const item of this.selection) item.translate(d);
    }
    if ((patch.w !== undefined && b.width) || (patch.h !== undefined && b.height)) {
      const sx = patch.w !== undefined && b.width ? Math.max(0.1, patch.w) / b.width : 1;
      const sy = patch.h !== undefined && b.height ? Math.max(0.1, patch.h) / b.height : 1;
      const pivot = this.refPoint(this.selectionBounds()!);
      for (const item of this.selection) item.scale(sx, sy, pivot);
    }
    if (patch.rotation !== undefined && this.selection.length === 1) {
      const item = this.selection[0];
      const delta = patch.rotation - (item.data.rotation ?? 0);
      item.rotate(delta, this.refPoint(item.bounds));
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
    this.commit("", "Image trace");
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
    this.commit("", "Rename");
  }

  toggleVisible(id: number) {
    const item = this.itemById(id);
    if (!item) return;
    item.visible = !item.visible;
    if (!item.visible) this.selection = this.selection.filter((i) => i !== item);
    this.commit("", item.visible ? "Show" : "Hide");
  }

  toggleLocked(id: number) {
    const item = this.itemById(id);
    if (!item) return;
    item.locked = !item.locked;
    if (item.locked) this.selection = this.selection.filter((i) => i !== item);
    this.commit("", item.locked ? "Lock" : "Unlock");
  }

  moveLayer(id: number, direction: 1 | -1) {
    const item = this.itemById(id);
    if (!item) return;
    if (direction === 1 && item.nextSibling) item.insertAbove(item.nextSibling);
    if (direction === -1 && item.previousSibling) item.insertBelow(item.previousSibling);
    this.commit("", "Reorder");
  }

  moveLayerTo(id: number, targetId: number, where: "above" | "below" | "inside") {
    const item = this.itemById(id);
    const target = this.itemById(targetId);
    if (!item || !target || item === target || target.isDescendant(item)) return;
    if (where === "inside" && target instanceof this.scope.Group && !target.data?.textPath) target.addChild(item);
    else if (where === "above" || where === "inside") item.insertAbove(target);
    else item.insertBelow(target);
    this.commit("", "Reorder");
  }

  placeImage(dataUrl: string) {
    const raster = new this.scope.Raster({ source: dataUrl, position: new this.scope.Point(this.box.x + this.box.w / 2, this.box.y + this.box.h / 2) });
    raster.onLoad = () => {
      const scale = Math.min(1, (this.box.w * 0.8) / raster.width, (this.box.h * 0.8) / raster.height);
      raster.scale(scale);
      this.adopt(raster);
      this.select([raster]);
      this.commit("", "Place image");
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
