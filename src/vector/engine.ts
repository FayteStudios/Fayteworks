import paper from "paper/dist/paper-core";
import { offset as offsetPath, offsetStroke } from "paperjs-offset";
import { TRACE_MAX_SIDE, traceImageData, type TraceOptions } from "./trace";
import { exportEffects, hasEffects, effectsReach, installEffects, type Effects } from "./effects";
import { layoutEnds, type Ends } from "./ends";
import { outlineText } from "./outlines";
import { exportPaint, importPaint, installPaint, onTileReady, type ExtraPaint, type PaintExport, type PatternFill, type StrokeAlign } from "./paint";
import { mapPath, perspectiveMap, prepareForBend, puckerBloat, roughen, twistMap, warpMap, zigzag, type EffectKind, type EffectParams } from "./pathEffects";
import { layoutBlend, layoutBoolean, layoutRepeat, layoutSymbols, type Blend, type Repeat } from "./live";
import { outlineData, profilePoints, widthAt, widthOutline, type WidthPoint, type WidthProfile } from "./strokes";

export type Tool = "select" | "direct" | "pen" | "curvature" | "pencil" | "scissors" | "knife" | "eraser" | "rect" | "ellipse" | "polygon" | "star" | "shape" | "line" | "arc" | "spiral" | "text" | "eyedropper" | "gradient" | "blob" | "calligraphy" | "distort" | "builder" | "width" | "hand";
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

export interface GradientStop {
  color: string;
  offset: number;
}

export interface Fill {
  kind: "none" | "solid" | "linear" | "radial" | "pattern";
  pattern?: Omit<PatternFill, "color">;
  color: string;
  color2: string;
  angle: number;
  stops?: GradientStop[];
  origin?: [number, number];
  destination?: [number, number];
}

export type BlendMode = "normal" | "multiply" | "screen" | "overlay" | "darken" | "lighten" | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference" | "exclusion" | "hue" | "saturation" | "color" | "luminosity";

export interface LiveShapeInfo {
  kind: "polygon" | "star";
  count: number;
  inner: number;
}

export interface Guides {
  x: number[];
  y: number[];
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
  blendMode: BlendMode;
  strokeAlign: StrokeAlign;
}

export interface TextInfo {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  justification: "left" | "center" | "right";
  lineHeight: number;
  spacing: number;
  wrap: number;
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
const SNAP_COLOUR = "#e0457b";
const GUIDE_COLOUR = "#16b2d6";
const RULER = 18;
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

function guidesOf(svg: string): Guides {
  const match = svg.match(/data-fw-guides="([^"]*)"/);
  if (!match) return { x: [], y: [] };
  try {
    const parsed = JSON.parse(match[1].replace(/&quot;/g, '"'));
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((n): n is number => typeof n === "number" && Number.isFinite(n)) : []);
    return { x: list(parsed.x), y: list(parsed.y) };
  } catch {
    return { x: [], y: [] };
  }
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
  importPaint(root);
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
    alignTo: "selection" as "selection" | "board",
    smartGuides: true,
    snapPoints: true,
    angleStep: 45,
    rulers: false,
    eraser: 12,
    blob: 16,
    nib: 10,
    nibAngle: 35,
    mirror: "off" as "off" | "v" | "h" | "both",
    liveBoolean: true
  };
  tile: { tile: string; tileW: number; tileH: number } | null = null;
  private stopTiles: () => void = () => undefined;
  guides: Guides = { x: [], y: [] };
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
  private snapCache: { xs: number[]; ys: number[]; points: { point: paper.Point; segment: paper.Segment }[]; paths: paper.Path[] } | null = null;
  private snapLines: [paper.Point, paper.Point][] = [];
  private snapMark: paper.Point | null = null;
  private spaceDown = false;
  private penPath: paper.Path | null = null;
  private penCorners = new Set<number>();
  private tempStroke: paper.Path | null = null;
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
    installEffects(this.scope);
    installPaint(this.scope);
    this.stopTiles = onTileReady(() => {
      const view = this.scope.view as unknown as { _needsUpdate: boolean; update(): void };
      view._needsUpdate = true;
      view.update();
    });
    this.box = viewBoxOf(svg);
    this.guides = guidesOf(svg);
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
    this.stopTiles();
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
    while (kids.length === 1 && kids[0] instanceof this.scope.Group && !kids[0].name && !kids[0].clipped && !Object.keys(kids[0].data ?? {}).length) kids = [...kids[0].children];
    for (const kid of kids) {
      if (kid.clipMask) {
        kid.remove();
        continue;
      }
      this.art.addChild(kid);
    }
    for (const group of this.textPathGroups()) this.layoutTextPath(group);
    for (const group of this.endsGroups()) layoutEnds(this.scope, group);
    for (const item of this.art.getItems({ recursive: true, match: (i: paper.Item) => Boolean(i.data?.maskSource || i.data?.paint || i.data?.operand) })) {
      if (item.data.maskSource || item.data.operand) item.visible = true;
      delete item.data.paint;
    }
    this.layoutLive();
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
    const painted = this.art.getItems({ recursive: true, match: (i: paper.Item) => i instanceof this.scope.PathItem && Boolean((i.data?.strokeAlign && i.data.strokeAlign !== "center") || i.data?.pattern || i.data?.widths?.length || i.data?.extra?.length) }) as paper.PathItem[];
    for (const p of painted) {
      const stroke = p.strokeColor;
      const paint: PaintExport = {
        stroke: stroke && !stroke.gradient ? (stroke.convert("rgb") as paper.Color).toCSS(true) : stroke ? toHex(stroke) : null,
        strokeOpacity: stroke?.alpha ?? 1,
        width: p.strokeWidth,
        cap: p.strokeCap,
        join: p.strokeJoin,
        miter: p.miterLimit,
        dash: [...(p.dashArray ?? [])],
        dashOffset: p.dashOffset ?? 0,
        rule: p.fillRule || "nonzero",
        ...(p instanceof this.scope.Path && p.data.widths?.length ? { outline: outlineData(widthOutline(p, p.data.widths, p.strokeWidth)) } : {})
      };
      p.data.paint = paint;
    }
    const ns = "http://www.w3.org/2000/svg";
    const doc = document.implementation.createDocument(ns, "svg", null);
    const root = doc.documentElement;
    const { x, y, w, h } = this.box;
    root.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    root.setAttribute("width", String(w));
    root.setAttribute("height", String(h));
    const layer = this.art.exportSVG({ asString: false, precision: 2 }) as SVGElement;
    for (const t of texts) delete t.data.leading;
    for (const p of painted) delete p.data.paint;
    if (this.art.getItems({ recursive: true, match: (i: paper.Item) => Boolean(i.strokeColor) && i.strokeJoin === "miter" }).length) root.setAttribute("stroke-miterlimit", "10");
    for (const child of Array.from(layer.childNodes)) root.appendChild(doc.importNode(child, true));
    this.exportTextLines(doc, root);
    this.exportTextPaths(doc, root);
    exportPaint(doc, root);
    exportEffects(doc, root);
    if (this.guides.x.length || this.guides.y.length) root.setAttribute("data-fw-guides", JSON.stringify(this.guides));
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
    const json = JSON.stringify({ box: this.box, guides: this.guides, art: this.art.exportJSON({ asString: false }), ref: this.reference ? this.reference.matrix.values : null });
    this.art.opacity = this.outlineView ? 0 : 1;
    this.applyDim();
    return json;
  }

  commit(key = "", label?: string) {
    for (const group of this.textPathGroups()) this.layoutTextPath(group);
    for (const group of this.endsGroups()) layoutEnds(this.scope, group);
    this.layoutLive();
    if (key !== "simplify") this.simplifyBase = null;
    if (!key.startsWith("fx-")) this.effectBase = null;
    if (key !== "distort") this.distortState = null;
    this.builder = null;
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
    const { box, art, ref, guides } = JSON.parse(snap);
    if (ref && this.reference) this.reference.matrix = new this.scope.Matrix(ref);
    this.box = box;
    this.guides = guides ?? { x: [], y: [] };
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
    this.effectBase = null;
    this.distortState = null;
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
    this.ui.activate();
    this.drawGuides(z);
    this.art.activate();
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
    this.ui.activate();
    if (this.tempStroke) this.ui.addChild(this.tempStroke);
    if (this.tool === "gradient") this.drawGradientHandles(z);
    if (this.tool === "distort") this.drawDistortHandles(z);
    if (this.tool === "builder") this.drawBuilder(z);
    if (this.tool === "width") this.drawWidthHandles(z);
    if (this.options.mirror !== "off") {
      const b = this.board.bounds;
      const vb = this.scope.view.bounds;
      const axis = { strokeColor: new this.scope.Color(0.55, 0.36, 0.96, 0.8), strokeWidth: 1 / z, dashArray: [6 / z, 4 / z] };
      if (this.options.mirror !== "h") new this.scope.Path.Line({ from: [b.center.x, vb.top], to: [b.center.x, vb.bottom], ...axis });
      if (this.options.mirror !== "v") new this.scope.Path.Line({ from: [vb.left, b.center.y], to: [vb.right, b.center.y], ...axis });
    }
    this.drawSnapLines(z);
    if (this.options.rulers) this.drawRulers(z);
    this.art.activate();
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
      if (item.data?.effects) delete item.data.effects;
      delete item.data?.pattern;
      delete item.data?.strokeAlign;
      delete item.data?.widths;
      delete item.data?.operand;
      delete item.data?.extra;
      delete item.data?.softMask;
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
    this.snapLines = [];
    this.snapMark = null;
    if (!this.options.snap && !this.options.smartGuides && !this.options.snapPoints) return point;
    if (!this.snapCache) this.buildSnap(this.tool === "select" ? this.selection : []);
    const cache = this.snapCache!;
    const tol = 6 / this.scope.view.zoom;
    if (this.options.snapPoints) {
      let best: paper.Point | null = null;
      let bd = tol;
      for (const c of cache.points) {
        if (this.nodes.includes(c.segment)) continue;
        const d = c.point.getDistance(point);
        if (d < bd) {
          bd = d;
          best = c.point;
        }
      }
      if (best) {
        this.snapMark = best;
        return best.clone();
      }
      const near = this.nearestOutline(point, tol, cache.paths.filter((p) => !this.nodes.some((n) => n.path === p)));
      if (near) {
        this.snapMark = near.location.point;
        return near.location.point.clone();
      }
    }
    let x = point.x;
    let y = point.y;
    let gotX = false;
    let gotY = false;
    if (this.options.smartGuides) {
      const sx = this.nearestValue(cache.xs, x, tol);
      const sy = this.nearestValue(cache.ys, y, tol);
      if (sx !== null) {
        x = sx;
        gotX = true;
        this.snapGuideLine("x", x);
      }
      if (sy !== null) {
        y = sy;
        gotY = true;
        this.snapGuideLine("y", y);
      }
    }
    if (this.options.snap) {
      const g = this.options.grid;
      if (!gotX) x = Math.round(x / g) * g;
      if (!gotY) y = Math.round(y / g) * g;
    }
    return new this.scope.Point(x, y);
  }

  private constrain(from: paper.Point, to: paper.Point): paper.Point {
    const v = to.subtract(from);
    const step = Math.max(1, this.options.angleStep);
    const angle = Math.round(v.angle / step) * step;
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
    let mode: "none" | "move" | "scale" | "rotate" | "marquee" | "pan" | "shape" | "node" | "handle" | "bend" | "pencil" | "pen-drag" | "guide" | "knife" | "gradient" | "distort" | "builder" | "width" = "none";
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
    let guideDrag: { axis: "x" | "y"; index: number } | null = null;
    let gradDrag: string | null = null;
    let corner = -1;
    let builderRemove = false;
    let widthDrag: { path: paper.Path; index: number } | null = null;
    const touchBuilder = (from: paper.Point, to: paper.Point) => {
      const b = this.builder;
      if (!b) return;
      const steps = Math.max(1, Math.ceil(from.getDistance(to) / (3 / this.scope.view.zoom)));
      for (let k = 0; k <= steps; k++) {
        const i = this.builderPieceAt(from.add(to.subtract(from).multiply(k / steps)));
        if (i >= 0) b.touched.add(i);
      }
    };
    let grabbed: { segment: paper.Segment; from: paper.Point } | null = null;
    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const along = (g: { origin: paper.Point; destination: paper.Point }, point: paper.Point) => {
      const d = g.destination.subtract(g.origin);
      const len2 = d.x * d.x + d.y * d.y;
      return len2 ? clamp01(point.subtract(g.origin).dot(d) / len2) : 0;
    };
    let lastClick = { at: 0, point: new this.scope.Point(0, 0) };

    const hitOptions = (extra: object = {}) => ({ fill: true, stroke: true, segments: true, tolerance: 5 / this.scope.view.zoom, ...extra });
    const inScopeHit = (h: paper.HitResult) => this.shown(h.item) && this.inScope(h.item) && (this.tool !== "direct" || !this.isGen(h.item));
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
      grabbed = null;
      this.snapCache = null;
      this.snapLines = [];
      this.snapMark = null;
      if (this.spaceDown || this.tool === "hand" || native?.button === 1) {
        mode = "pan";
        return;
      }
      const ruler = this.inRuler(e.point);
      if (ruler === "corner") {
        mode = "none";
        return;
      }
      if (ruler) {
        this.guides[ruler].push(ruler === "x" ? e.point.x : e.point.y);
        guideDrag = { axis: ruler, index: this.guides[ruler].length - 1 };
        mode = "guide";
        this.refresh();
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
            this.buildSnap(this.selection);
            mode = "move";
          } else {
            const guide = this.guideAt(e.point);
            if (guide) {
              guideDrag = guide;
              mode = "guide";
              return;
            }
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
                grabbed = { segment: hit.segment, from: hit.segment.point.clone() };
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
            const guide = this.guideAt(e.point);
            if (guide) {
              guideDrag = guide;
              mode = "guide";
              return;
            }
            if (!mods(e).shift) this.select([]);
            mode = "marquee";
          }
          return;
        }
        case "width": {
          const uiHit = this.ui.hitTest(e.point, { fill: true, stroke: true, tolerance: 4 / z });
          const handle = uiHit?.item.data.handle as string | undefined;
          const current = this.widthTarget();
          if (handle?.startsWith("w-") && current) {
            const index = Number(handle.slice(2));
            if (mods(e).alt) {
              current.data.widths = (current.data.widths as WidthPoint[]).filter((_, i) => i !== index);
              if (!current.data.widths.length) delete current.data.widths;
              current.data.widthProfile = "custom";
              this.commit("", "Stroke width");
              mode = "none";
              return;
            }
            widthDrag = { path: current, index };
            mode = "width";
            return;
          }
          const stroked = this.scopePaths().filter((p) => p.strokeColor && p.strokeWidth > 0 && !this.isGen(p));
          const near = stroked
            .map((p) => ({ p, hit: this.nearestOutline(e.point, Math.max(6 / z, p.strokeWidth), [p]) }))
            .filter((x) => x.hit)
            .sort((a, b) => a.hit!.location.point.getDistance(e.point) - b.hit!.location.point.getDistance(e.point))[0];
          if (!near?.hit) {
            this.select([]);
            mode = "none";
            return;
          }
          const path = near.p;
          const at = path.length ? near.hit.location.offset / path.length : 0;
          const widths: WidthPoint[] = [...((path.data.widths as WidthPoint[] | undefined) ?? [])];
          if (!widths.length) widths.push({ at: 0, w: path.strokeWidth }, { at: 1, w: path.strokeWidth });
          widths.push({ at, w: widthAt(widths, at, path.strokeWidth) });
          path.data.widths = widths;
          path.data.widthProfile = "custom";
          this.selection = [path];
          this.nodes = [];
          widthDrag = { path, index: widths.length - 1 };
          mode = "width";
          this.refresh();
          return;
        }
        case "builder": {
          const b = this.ensureBuilder();
          const at = b ? this.builderPieceAt(e.point) : -1;
          if (b && at >= 0) {
            b.touched = new Set([at]);
            builderRemove = mods(e).alt;
            mode = "builder";
            this.refresh(true);
            return;
          }
          const hit = this.art.hitTest(e.point, hitOptions({ match: inScopeHit }));
          const target = hit ? this.topLevel(hit.item) : null;
          if (target && mods(e).shift) this.select(this.selection.includes(target) ? this.selection.filter((i) => i !== target) : [...this.selection, target]);
          else this.select(target ? [target] : []);
          mode = "none";
          return;
        }
        case "distort": {
          const uiHit = this.ui.hitTest(e.point, { fill: true, stroke: true, tolerance: 4 / z });
          const handle = uiHit?.item.data.handle as string | undefined;
          if (handle?.startsWith("d-") && this.selection.length) {
            corner = Number(handle.slice(2));
            this.startDistort();
            mode = "distort";
            return;
          }
          const hit = this.art.hitTest(e.point, hitOptions({ match: inScopeHit }));
          this.select(hit ? [this.topLevel(hit.item)] : []);
          mode = "none";
          return;
        }
        case "blob":
        case "calligraphy": {
          const blob = this.tool === "blob";
          this.tempStroke = new this.scope.Path({
            segments: [e.point],
            strokeColor: new this.scope.Color(blob ? (this.defaults.fill ?? this.lineDefaults.stroke) : this.lineDefaults.stroke),
            strokeWidth: blob ? this.options.blob : Math.max(1, this.options.nib * 0.4),
            opacity: 0.6,
            strokeCap: "round",
            strokeJoin: "round",
            insert: false
          });
          mode = "knife";
          this.refresh(true);
          return;
        }
        case "knife":
        case "eraser": {
          const knife = this.tool === "knife";
          this.tempStroke = new this.scope.Path({
            segments: [e.point],
            strokeColor: knife ? new this.scope.Color(SNAP_COLOUR) : new this.scope.Color(0.94, 0.31, 0.43, 0.35),
            strokeWidth: knife ? 1.5 / z : this.options.eraser,
            strokeCap: "round",
            strokeJoin: "round",
            insert: false
          });
          mode = "knife";
          this.refresh(true);
          return;
        }
        case "curvature": {
          const tol = 8 / z;
          if (this.penPath && this.penPath.segments.length > 2 && this.penPath.firstSegment.point.getDistance(e.point) < tol) {
            this.penPath.closed = true;
            if (!this.penPath.fillColor && this.defaults.fill) this.penPath.fillColor = new this.scope.Color(this.defaults.fill);
            this.smoothCurvature(this.penPath);
            this.finishPen();
            mode = "none";
            return;
          }
          if (!this.penPath) {
            const end = this.openEndAt(e.point, tol, null);
            if (end) {
              if (end.first) end.path.reverse();
              this.penPath = end.path;
              this.penCorners = new Set(end.path.segments.filter((s) => !s.hasHandles()).map((s) => s.index));
              this.select([]);
              mode = "none";
              return;
            }
            this.penPath = new this.scope.Path();
            this.applyDefaults(this.penPath, true);
            this.adopt(this.penPath);
            this.penCorners = new Set();
          }
          const seg = this.penPath.add(p) as paper.Segment;
          if (mods(e).alt) this.penCorners.add(seg.index);
          this.smoothCurvature(this.penPath);
          this.previewPath = null;
          mode = "none";
          this.refresh();
          return;
        }
        case "gradient": {
          const uiHit = this.ui.hitTest(e.point, { fill: true, stroke: true, tolerance: 4 / z });
          const handle = uiHit?.item.data.handle as string | undefined;
          const target = this.gradientTarget();
          if (handle?.startsWith("g-") && target) {
            const g = this.gradientOf(target);
            if (handle.startsWith("g-stop-") && mods(e).alt && g && g.stops.length > 2) {
              g.stops.splice(Number(handle.slice(7)), 1);
              this.applyGradient(target, g);
              this.commit("", "Gradient");
              mode = "none";
              return;
            }
            gradDrag = handle;
            mode = "gradient";
            return;
          }
          const g = target ? this.gradientOf(target) : null;
          if (double && target && g) {
            const t = along(g, e.point);
            const proj = g.origin.add(g.destination.subtract(g.origin).multiply(t));
            if (proj.getDistance(e.point) < 8 / z) {
              g.stops.push({ color: this.mixAt(g.stops, t), offset: t });
              this.applyGradient(target, g);
              this.commit("", "Gradient");
              mode = "none";
              return;
            }
          }
          const hit = this.art.hitTest(e.point, hitOptions({ match: inScopeHit }));
          if (hit) {
            const item = hit.item.parent instanceof this.scope.CompoundPath ? hit.item.parent : hit.item;
            if (!(item instanceof this.scope.PathItem || item instanceof this.scope.PointText)) {
              mode = "none";
              return;
            }
            if (!this.selection.includes(item)) this.select([item]);
            gradDrag = "g-new";
            mode = "gradient";
            return;
          }
          if (target) {
            gradDrag = "g-new";
            mode = "gradient";
            return;
          }
          this.select([]);
          mode = "none";
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
      changed = true;
      if (mode === "guide" && guideDrag) {
        const g = this.options.grid;
        const raw = guideDrag.axis === "x" ? e.point.x : e.point.y;
        this.guides[guideDrag.axis][guideDrag.index] = this.options.snap ? Math.round(raw / g) * g : Math.round(raw * 100) / 100;
        this.refresh();
        return;
      }
      if (mode === "knife" && this.tempStroke) {
        if (mods(e).shift) {
          this.tempStroke.removeSegments(1);
          this.tempStroke.add(e.point);
        } else this.tempStroke.add(e.point);
        this.refresh(true);
        return;
      }
      if (mode === "width" && widthDrag) {
        const { path, index } = widthDrag;
        const pt = path.getPointAt(path.length * (path.data.widths[index] as WidthPoint).at);
        if (pt) path.data.widths[index].w = Math.max(0.2, Math.round(pt.getDistance(e.point) * 2 * 10) / 10);
        this.refresh();
        return;
      }
      if (mode === "builder") {
        touchBuilder(last, e.point);
        last = e.point;
        this.refresh(true);
        return;
      }
      if (mode === "distort" && this.distortState && corner >= 0) {
        const quad = this.distortState.quad;
        const to = this.snap(e.point);
        const before = quad[corner];
        quad[corner] = [to.x, to.y];
        if (mods(e).shift) {
          const pair = corner ^ 1;
          quad[pair] = [quad[pair][0] - (to.x - before[0]), quad[pair][1] + (to.y - before[1])];
        }
        this.applyDistort();
        this.refresh();
        return;
      }
      if (mode === "gradient" && gradDrag) {
        const target = this.gradientTarget();
        if (!target) return;
        const p2 = this.snap(e.point);
        if (gradDrag === "g-new") {
          if (e.point.getDistance(start) < 3 / view.zoom) return;
          const base = this.startGradient(target);
          this.applyGradient(target, { ...base, origin: this.snap(start), destination: p2 });
        } else {
          const g = this.gradientOf(target);
          if (!g) return;
          if (gradDrag === "g-origin") g.origin = p2;
          else if (gradDrag === "g-dest") g.destination = p2;
          else g.stops[Number(gradDrag.slice(7))].offset = along(g, e.point);
          this.applyGradient(target, g, false);
        }
        this.refresh();
        return;
      }
      const p = this.snap(e.point);
      if (mode === "move") {
        let target = e.point.subtract(start);
        if (mods(e).shift) target = Math.abs(target.x) > Math.abs(target.y) ? new this.scope.Point(target.x, 0) : new this.scope.Point(0, target.y);
        let delta = target.subtract(last.subtract(start));
        if (startBounds) delta = this.snapMove(delta, startBounds, last.subtract(start));
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
        let delta = e.point.subtract(last);
        if (grabbed && grabbed.segment.path) {
          const to = this.snap(grabbed.from.add(e.point.subtract(start)));
          delta = to.subtract(grabbed.segment.point);
        }
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
      const hadLines = this.snapLines.length > 0 || this.snapMark !== null;
      this.snapCache = null;
      this.snapLines = [];
      this.snapMark = null;
      grabbed = null;
      if (finished === "guide" && guideDrag) {
        const { axis, index } = guideDrag;
        guideDrag = null;
        if (this.inRuler(e.point) || !this.scope.view.bounds.contains(e.point)) this.guides[axis].splice(index, 1);
        this.commit("", "Guide");
        return;
      }
      if (finished === "knife") {
        const stroke = this.tempStroke;
        this.tempStroke = null;
        if (stroke) {
          if (this.tool === "knife") this.knife(stroke);
          else if (this.tool === "eraser") this.erase(stroke);
          else if (this.tool === "blob") this.blobPaint(stroke);
          else this.calligraphy(stroke);
        }
        this.refresh();
        return;
      }
      if (finished === "width") {
        if (widthDrag) (widthDrag.path.data.widths as WidthPoint[]).sort((a, b) => a.at - b.at);
        widthDrag = null;
        this.commit("", "Stroke width");
        return;
      }
      if (finished === "builder") {
        this.applyBuilder(builderRemove);
        return;
      }
      if (finished === "distort") {
        corner = -1;
        if (changed) this.commit("distort", "Distort");
        return;
      }
      if (finished === "gradient") {
        gradDrag = null;
        const target = this.gradientTarget();
        const g = target ? this.gradientOf(target) : null;
        if (changed && target && g) {
          this.applyGradient(target, g);
          this.commit("", "Gradient");
        }
        return;
      }
      if (hadLines && !changed) this.refresh();
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
          this.select([this.mirrorWrap(path)]);
          this.commit("", "Draw");
        }
        shape = null;
        return;
      }
      if (finished === "shape") {
        if (shape && (shape.bounds.width > 1 || shape.bounds.height > 1)) {
          this.adopt(shape);
          this.select([this.mirrorWrap(shape)]);
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
      if (this.tool === "builder") {
        const b = this.ensureBuilder();
        const at = b ? this.builderPieceAt(e.point) : -1;
        if (b && at !== b.hover) {
          b.hover = at;
          this.refresh(true);
        }
        return;
      }
      if (this.tool === "curvature" && this.penPath) {
        this.previewPath?.remove();
        const ghost = this.penPath.clone({ insert: false }) as paper.Path;
        ghost.add(this.snap(e.point));
        this.smoothCurvature(ghost);
        ghost.fillColor = null;
        ghost.strokeColor = new this.scope.Color(ACCENT);
        ghost.strokeWidth = 1 / this.scope.view.zoom;
        ghost.dashArray = [];
        ghost.data = {};
        this.ui.addChild(ghost);
        this.previewPath = ghost;
        return;
      }
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
        const shape = this.tool === "polygon" ? { kind: "polygon" as const, count: Math.max(3, this.options.sides), r: radius } : { kind: "star" as const, count: Math.max(3, this.options.points), r: radius, inner: 0.45 };
        const star = new this.scope.Path({ segments: this.starSegments(shape), closed: true });
        if (!shift) star.rotate(to.subtract(from).angle + 90, new this.scope.Point(0, 0));
        star.translate(from);
        star.data.shape = shape;
        item = star;
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
    this.select([this.mirrorWrap(path)]);
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
    } else if (item.data.wrap) item.data.raw = content;
    else item.content = content;
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
      if (item.data?.gen || item.data?.head) return;
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
    const pattern = item.data?.pattern as PatternFill | undefined;
    if (pattern) {
      const { color, ...rest } = pattern;
      return { kind: "pattern", color, color2: toHex(fillColor) ?? "#ffffff", angle: pattern.angle, pattern: rest };
    }
    if (fillColor?.gradient) {
      const { origin, destination } = fillColor as unknown as { origin: paper.Point; destination: paper.Point };
      const raw = fillColor.gradient.stops;
      const stops = raw.map((st, i) => ({ color: toHex(st.color) ?? "#000000", offset: st.offset ?? i / Math.max(1, raw.length - 1) })).sort((a, b) => a.offset - b.offset);
      return {
        kind: fillColor.gradient.radial ? "radial" : "linear",
        color: stops[0]?.color ?? "#000000",
        color2: stops[stops.length - 1]?.color ?? "#ffffff",
        angle: Math.round(destination.subtract(origin).angle),
        stops,
        origin: [origin.x, origin.y],
        destination: [destination.x, destination.y]
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
    target.blendMode = src.blendMode;
    if (src.data?.effects) target.data.effects = JSON.parse(JSON.stringify(src.data.effects));
    else delete target.data.effects;
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
      const reach = Math.max(0, ...this.selection.map((i) => effectsReach(i.data?.effects as Effects | undefined)));
      if (reach) group.insertChild(0, new this.scope.Path.Rectangle({ rectangle: group.strokeBounds.expand(reach * 2), insert: false }));
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

  private leafShapes(): paper.PathItem[] {
    const pool = this.selection.length ? this.selection : this.scopeRoot.children.filter((i) => this.shown(i));
    const out = new Set<paper.PathItem>();
    const walk = (item: paper.Item) => {
      if (item.locked || !item.visible || item.data?.guide || item.clipMask || item.data?.gen || item.data?.head) return;
      if (item instanceof this.scope.CompoundPath || item instanceof this.scope.Path) out.add(item);
      else if (item instanceof this.scope.Group && !item.data?.textPath) for (const kid of item.children) walk(kid);
    };
    for (const item of pool) walk(item);
    return [...out];
  }

  private styled<T extends paper.Item>(piece: T, from: paper.Item): T {
    const source = new this.scope.Path({ insert: false });
    source.style = from.style;
    piece.style = source.style;
    piece.opacity = from.opacity;
    piece.blendMode = from.blendMode;
    if (from.data?.effects) piece.data.effects = JSON.parse(JSON.stringify(from.data.effects));
    if (piece instanceof this.scope.PathItem && from instanceof this.scope.PathItem) piece.fillRule = from.fillRule;
    return piece;
  }

  private splitDisjoint(item: paper.PathItem, from: paper.Item): paper.PathItem[] {
    const area = (p: paper.PathItem) => Math.abs((p as paper.Path).area ?? 0);
    if (!(item instanceof this.scope.CompoundPath)) return area(item) > 0.01 ? [this.styled(item, from)] : [];
    const kids = ([...item.children] as paper.Path[]).filter((k) => Math.abs(k.area) > 0.01).sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
    const groups: { outer: paper.Path; holes: paper.Path[] }[] = [];
    for (const kid of kids) {
      const inside = groups.find((g) => Math.sign(g.outer.area) !== Math.sign(kid.area) && g.outer.contains(kid.interiorPoint));
      if (inside) inside.holes.push(kid);
      else groups.push({ outer: kid, holes: [] });
    }
    return groups.map((g) => {
      if (!g.holes.length) return this.styled(g.outer.clone({ insert: false }) as paper.Path, from);
      return this.styled(new this.scope.CompoundPath({ children: [g.outer, ...g.holes].map((p) => p.clone({ insert: false })), insert: false }), from);
    });
  }

  private splitOpenAt(path: paper.Path, offsets: number[]): paper.Path[] {
    const L = path.length;
    let list = [...new Set(offsets.map((o) => Math.round(o * 1000) / 1000))].filter((o) => o > 0.01 && o < L - 0.01).sort((a, b) => a - b);
    if (path.closed) {
      const all = [...new Set(offsets.map((o) => Math.round(o * 1000) / 1000))].sort((a, b) => a - b);
      if (!all.length) return [path];
      path.splitAt(all[0]);
      const L2 = path.length;
      list = all
        .slice(1)
        .map((o) => o - all[0])
        .filter((o) => o > 0.01 && o < L2 - 0.01);
    }
    const pieces: paper.Path[] = [path];
    for (const o of [...list].reverse()) {
      const tail = path.splitAt(o);
      if (tail && tail !== path) pieces.push(tail);
    }
    return pieces;
  }

  private knifeRegion(stroke: paper.Path, reach: number): paper.Path {
    const region = stroke.clone({ insert: false }) as paper.Path;
    const first = stroke.firstSegment.point;
    const last = stroke.lastSegment.point;
    const dStart = (stroke.getTangentAt(0) ?? last.subtract(first)).normalize();
    const dEnd = (stroke.getTangentAt(stroke.length) ?? last.subtract(first)).normalize();
    const a = first.subtract(dStart.multiply(reach));
    const b = last.add(dEnd.multiply(reach));
    const chord = b.subtract(a).normalize();
    const n = new this.scope.Point(-chord.y, chord.x).multiply(reach);
    region.insert(0, a);
    region.add(b, b.add(n), a.add(n));
    region.closed = true;
    return region;
  }

  knife(stroke: paper.Path) {
    if (this.refAdjust || stroke.segments.length < 2 || stroke.length < 1) return;
    const targets = this.leafShapes().filter((t) => t.bounds.intersects(stroke.bounds.expand(1)));
    const reach = (this.board.bounds.width + this.board.bounds.height + stroke.bounds.width + stroke.bounds.height) * 4;
    const region = this.knifeRegion(stroke, reach);
    const made: paper.Item[] = [];
    for (const target of targets) {
      const crossings = target instanceof this.scope.CompoundPath ? (target.children as paper.Path[]).flatMap((c) => c.getIntersections(stroke)) : target.getIntersections(stroke);
      if (!crossings.length) continue;
      if (target instanceof this.scope.Path && !target.closed && !target.fillColor) {
        const pieces = this.splitOpenAt(target, crossings.map((c) => c.offset));
        pieces.slice(1).forEach((p) => (p.name = ""));
        made.push(...pieces);
        continue;
      }
      const inside = target.intersect(region, { insert: false }) as paper.PathItem;
      const outside = target.subtract(region, { insert: false }) as paper.PathItem;
      const pieces = [...this.splitDisjoint(inside, target), ...this.splitDisjoint(outside, target)];
      if (pieces.length < 2) continue;
      pieces.forEach((p, i) => {
        p.name = i === 0 ? target.name : "";
        p.insertAbove(target);
      });
      target.remove();
      made.push(...pieces);
    }
    if (!made.length) return;
    this.select(made.filter((m) => m.parent === this.scopeRoot || m.parent === this.art));
    this.commit("", "Knife");
  }

  erase(stroke: paper.Path) {
    if (this.refAdjust || stroke.segments.length < 1) return;
    let region: paper.PathItem;
    const half = Math.max(0.5, this.options.eraser / 2);
    if (stroke.segments.length < 2 || stroke.length < 0.5) region = new this.scope.Path.Circle({ center: stroke.firstSegment.point, radius: half, insert: false });
    else {
      stroke.simplify(1);
      try {
        region = offsetStroke(stroke as never, half, { cap: "round", join: "round", insert: false }) as unknown as paper.PathItem;
      } catch {
        region = strokeOutline(this.scope, Object.assign(stroke, { strokeWidth: half * 2 })) ?? new this.scope.Path.Circle({ center: stroke.firstSegment.point, radius: half, insert: false });
      }
    }
    const targets = this.leafShapes().filter((t) => t.bounds.intersects(region.bounds));
    let changed = false;
    const kept: paper.Item[] = [];
    for (const target of targets) {
      if (target instanceof this.scope.Path && !target.closed && !target.fillColor) {
        const crossings = region instanceof this.scope.CompoundPath ? (region.children as paper.Path[]).flatMap((c) => target.getIntersections(c)) : target.getIntersections(region as paper.Path);
        const whollyInside = !crossings.length && region.contains(target.getPointAt(target.length / 2));
        if (!crossings.length && !whollyInside) continue;
        changed = true;
        const pieces = crossings.length ? this.splitOpenAt(target, crossings.map((c) => c.offset)) : [target];
        for (const piece of pieces) {
          if (piece.length < 0.01 || region.contains(piece.getPointAt(piece.length / 2))) piece.remove();
          else kept.push(piece);
        }
        continue;
      }
      const rest = target.subtract(region, { insert: false }) as paper.PathItem;
      if (Math.abs(Math.abs((rest as paper.Path).area ?? 0) - Math.abs((target as paper.Path).area ?? 0)) < 0.01) continue;
      changed = true;
      const pieces = this.splitDisjoint(rest, target);
      pieces.forEach((p, i) => {
        p.name = i === 0 ? target.name : "";
        p.insertAbove(target);
        kept.push(p);
      });
      target.remove();
    }
    if (!changed) return;
    if (this.selection.length) this.select(kept.filter((k) => k.parent));
    this.commit("", "Erase");
  }

  private divisionPieces(shapes: paper.PathItem[]): { shape: paper.PathItem; from: paper.Item }[] {
    let pieces: { shape: paper.PathItem; from: paper.Item }[] = [];
    for (const shape of shapes) {
      const next: typeof pieces = [];
      let rest: paper.PathItem = shape.clone({ insert: false }) as paper.PathItem;
      for (const piece of pieces) {
        const inter = piece.shape.intersect(shape, { insert: false }) as paper.PathItem;
        const diff = piece.shape.subtract(shape, { insert: false }) as paper.PathItem;
        next.push({ shape: inter, from: shape }, { shape: diff, from: piece.from });
        rest = rest.subtract(piece.shape, { insert: false }) as paper.PathItem;
      }
      next.push({ shape: rest, from: shape });
      pieces = next;
    }
    return pieces.flatMap((p) => this.splitDisjoint(p.shape, p.from).map((part) => ({ shape: part, from: p.from })));
  }

  private builder: { key: paper.Item[]; pieces: { shape: paper.PathItem; from: paper.Item }[]; touched: Set<number>; hover: number } | null = null;

  private ensureBuilder() {
    const shapes = this.selection.filter((i): i is paper.PathItem => i instanceof this.scope.PathItem).sort((a, b) => a.index - b.index);
    if (!shapes.length) {
      this.builder = null;
      return null;
    }
    if (this.builder && sameItems(this.builder.key, shapes)) return this.builder;
    this.builder = { key: shapes, pieces: this.divisionPieces(shapes), touched: new Set(), hover: -1 };
    return this.builder;
  }

  private builderPieceAt(point: paper.Point): number {
    const b = this.builder;
    if (!b) return -1;
    for (let i = b.pieces.length - 1; i >= 0; i--) if (b.pieces[i].shape.contains(point)) return i;
    return -1;
  }

  private widthTarget(): paper.Path | null {
    const item = this.selection[0];
    return this.selection.length === 1 && item instanceof this.scope.Path && item.strokeColor ? item : null;
  }

  private drawWidthHandles(z: number) {
    const path = this.widthTarget();
    const widths = path?.data.widths as WidthPoint[] | undefined;
    if (!path || !widths?.length || !path.length) return;
    widths.forEach((w, i) => {
      const off = path.length * w.at;
      const p = path.getPointAt(off);
      const n = path.getNormalAt(off);
      if (!p || !n) return;
      const a = p.add(n.multiply(w.w / 2));
      const b = p.subtract(n.multiply(w.w / 2));
      new this.scope.Path.Line({ from: a, to: b, strokeColor: ACCENT, strokeWidth: 1 / z });
      for (const at of [a, b]) {
        const dot = new this.scope.Path.Circle({ center: at, radius: 4.5 / z, fillColor: "white", strokeColor: ACCENT, strokeWidth: 1.5 / z });
        dot.data.handle = `w-${i}`;
      }
    });
  }

  widthProfile(): WidthProfile | null {
    const path = this.widthTarget();
    if (!path) return null;
    return path.data.widths?.length ? ((path.data.widthProfile as WidthProfile | undefined) ?? "custom") : "even";
  }

  setWidthProfile(profile: WidthProfile) {
    if (this.refAdjust) return;
    for (const path of this.selectedPaths().filter((p) => p.strokeColor)) {
      if (profile === "even") {
        delete path.data.widths;
        delete path.data.widthProfile;
      } else {
        path.data.widths = profilePoints(profile, path.strokeWidth);
        path.data.widthProfile = profile;
      }
    }
    this.commit("", "Stroke width");
  }

  private drawBuilder(z: number) {
    const b = this.builder;
    if (!b || !sameItems(b.key, this.selection.filter((i) => i instanceof this.scope.PathItem))) return;
    b.pieces.forEach((p, i) => {
      const ghost = p.shape.clone({ insert: false }) as paper.PathItem;
      ghost.fillColor = b.touched.has(i) ? new this.scope.Color(0.31, 0.55, 1, 0.45) : i === b.hover ? new this.scope.Color(0.31, 0.55, 1, 0.22) : null;
      ghost.strokeColor = new this.scope.Color(ACCENT);
      ghost.strokeWidth = 1 / z;
      ghost.dashArray = [4 / z, 3 / z];
      ghost.opacity = 1;
      ghost.blendMode = "normal";
      ghost.data = {};
      this.ui.addChild(ghost);
    });
  }

  private applyBuilder(remove: boolean) {
    const b = this.builder;
    if (!b || !b.touched.size) return;
    const touched = [...b.touched].map((i) => b.pieces[i]);
    const rest = b.pieces.filter((_, i) => !b.touched.has(i));
    const results: paper.Item[] = [];
    const top = b.key[b.key.length - 1];
    for (const orig of b.key) {
      const mine = rest.filter((p) => p.from === orig).map((p) => p.shape);
      if (!mine.length) continue;
      let joined = mine[0];
      for (const next of mine.slice(1)) joined = joined.unite(next, { insert: false }) as paper.PathItem;
      this.styled(joined, orig);
      joined.name = orig.name;
      results.push(joined);
    }
    if (!remove) {
      let merged = touched[0].shape;
      for (const t of touched.slice(1)) merged = merged.unite(t.shape, { insert: false }) as paper.PathItem;
      this.styled(merged, touched[0].from);
      merged.name = results.some((r) => r.name === touched[0].from.name) ? "" : touched[0].from.name;
      results.push(merged);
    }
    let anchor: paper.Item = top;
    for (const r of results) {
      r.insertAbove(anchor);
      anchor = r;
    }
    for (const orig of b.key) orig.remove();
    this.builder = null;
    this.select(results);
    this.commit("", remove ? "Shape builder: remove" : "Shape builder: merge");
  }

  divide() {
    if (this.refAdjust) return;
    const shapes = this.selection.filter((i): i is paper.PathItem => i instanceof this.scope.PathItem).sort((a, b) => a.index - b.index);
    if (shapes.length < 2) return;
    const parts = this.divisionPieces(shapes);
    const top = shapes[shapes.length - 1];
    const group = new this.scope.Group({ insert: false });
    group.insertAbove(top);
    for (const p of parts) group.addChild(p.shape);
    for (const shape of shapes) shape.remove();
    if (!group.children.length) {
      group.remove();
      this.commit("", "Divide");
      return;
    }
    this.select([group]);
    this.commit("", "Divide");
  }

  cutPath() {
    if (this.refAdjust) return;
    const shapes = this.selection.filter((i): i is paper.PathItem => i instanceof this.scope.PathItem).sort((a, b) => a.index - b.index);
    if (shapes.length < 2) return;
    const cutter = shapes[shapes.length - 1];
    const cutters = cutter instanceof this.scope.CompoundPath ? (cutter.children as paper.Path[]) : [cutter as paper.Path];
    const made: paper.Item[] = [];
    for (const shape of shapes.slice(0, -1)) {
      const paths = shape instanceof this.scope.CompoundPath ? ([...shape.children] as paper.Path[]) : [shape as paper.Path];
      for (const path of paths) {
        const offsets = cutters.flatMap((c) => path.getIntersections(c).map((x) => x.offset));
        if (shape instanceof this.scope.CompoundPath) {
          path.insertBelow(shape);
          this.styled(path, shape);
        }
        const pieces = offsets.length ? this.splitOpenAt(path, offsets) : [path];
        for (const piece of pieces) {
          if (!piece.strokeColor) {
            piece.strokeColor = piece.fillColor ? new this.scope.Color(toHex(piece.fillColor) ?? this.lineDefaults.stroke) : new this.scope.Color(this.lineDefaults.stroke);
            piece.strokeWidth = this.lineDefaults.strokeWidth;
          }
          piece.fillColor = null;
          if (piece !== path) piece.name = "";
          made.push(piece);
        }
      }
      if (shape instanceof this.scope.CompoundPath) shape.remove();
    }
    cutter.remove();
    this.select(made);
    this.commit("", "Cut path");
  }

  roundCorners(radius: number) {
    if (this.refAdjust || radius <= 0) return;
    const direct = this.tool === "direct" && this.nodes.length > 0;
    const targets = direct ? this.nodes.filter((s) => s.path) : this.selectedPaths().flatMap((p) => p.segments);
    const plans = targets.map((seg) => this.planCorner(seg, radius)).filter((p): p is NonNullable<typeof p> => p !== null);
    if (!plans.length) return;
    for (const plan of plans) this.applyCorner(plan);
    this.nodes = [];
    this.curve = null;
    this.commit("", "Round corners");
  }

  private planCorner(seg: paper.Segment, r: number): { seg: paper.Segment; t: number; h: number } | null {
    const path = seg.path;
    if (!path || seg.hasHandles()) return null;
    const n = path.segments.length;
    if (!path.closed && (seg.isFirst() || seg.isLast())) return null;
    const cin = path.curves[(seg.index - 1 + n) % n];
    const cout = seg.curve;
    if (!cin || !cout || cin === cout) return null;
    const tin = cin.getTangentAtTime(1);
    const tout = cout.getTangentAtTime(0);
    if (!tin || !tout || tin.isZero() || tout.isZero()) return null;
    const cos = Math.max(-1, Math.min(1, tin.multiply(-1).normalize().dot(tout.normalize())));
    const theta = Math.acos(cos);
    if (theta > Math.PI - 0.02 || theta < 0.02) return null;
    const t = Math.min(r / Math.tan(theta / 2), cin.length * 0.5, cout.length * 0.5);
    if (t < 0.01) return null;
    const h = (4 / 3) * Math.tan((Math.PI - theta) / 4) * t * Math.tan(theta / 2);
    return { seg, t, h };
  }

  private applyCorner({ seg, t, h }: { seg: paper.Segment; t: number; h: number }) {
    const path = seg.path;
    if (!path) return;
    const n = path.segments.length;
    const cin = path.curves[(seg.index - 1 + n) % n];
    const cout = seg.curve;
    if (!cin || !cout) return;
    cout.divideAt(Math.min(t, cout.length - 0.001));
    cin.divideAt(Math.max(0.001, cin.length - t));
    const s1 = seg.previous;
    const s2 = seg.next;
    if (!s1 || !s2) return;
    const d1 = seg.point.subtract(s1.point).normalize();
    const d2 = s2.point.subtract(seg.point).normalize();
    seg.remove();
    s1.handleOut = d1.multiply(h);
    s2.handleIn = d2.multiply(-h);
  }

  private starSegments(shape: { kind: "polygon" | "star"; count: number; r: number; inner?: number }): paper.Segment[] {
    const count = Math.max(3, Math.round(shape.count));
    const steps = shape.kind === "star" ? count * 2 : count;
    const out: paper.Segment[] = [];
    for (let i = 0; i < steps; i++) {
      const radius = shape.kind === "star" && i % 2 ? shape.r * Math.max(0.05, Math.min(1, shape.inner ?? 0.45)) : shape.r;
      out.push(new this.scope.Segment(new this.scope.Point({ angle: -90 + (i * 360) / steps, length: radius })));
    }
    return out;
  }

  private liveStar(item: paper.Item | undefined) {
    const shape = item?.data?.shape as { kind: "polygon" | "star"; count: number; r: number; inner?: number } | undefined;
    if (!(item instanceof this.scope.Path) || !shape || (shape.kind !== "polygon" && shape.kind !== "star") || !item.closed) return null;
    const canon = this.starSegments(shape);
    if (canon.length !== item.segments.length || item.segments.some((s) => s.hasHandles())) return null;
    const m = fitAffine(
      this.scope,
      canon.map((s) => s.point),
      item.segments.map((s) => s.point)
    );
    if (!m || canon.some((s, i) => m.transform(s.point).getDistance(item.segments[i].point) > 0.5)) return null;
    return { path: item, shape, m };
  }

  shapeInfo(): LiveShapeInfo | null {
    if (this.selection.length !== 1) return null;
    const live = this.liveStar(this.selection[0]);
    return live ? { kind: live.shape.kind, count: live.shape.count, inner: Math.round((live.shape.inner ?? 0.45) * 100) } : null;
  }

  setShape(patch: { count?: number; inner?: number }) {
    const live = this.liveStar(this.selection[0]);
    if (!live) return;
    const next = { ...live.shape, count: Math.max(3, Math.min(100, Math.round(patch.count ?? live.shape.count))), inner: patch.inner !== undefined ? Math.max(5, Math.min(100, patch.inner)) / 100 : live.shape.inner };
    const temp = new this.scope.Path({ segments: this.starSegments(next), closed: true, insert: false });
    temp.transform(live.m);
    live.path.removeSegments();
    live.path.addSegments(temp.removeSegments());
    live.path.data.shape = next;
    this.commit("shape", live.shape.kind === "star" ? "Star" : "Polygon");
  }

  offsetCopy(distance: number, join: "miter" | "round" | "bevel") {
    if (this.refAdjust || !distance) return;
    const made: paper.Item[] = [];
    for (const item of this.selection) {
      if (!(item instanceof this.scope.PathItem)) continue;
      let result: paper.PathItem;
      try {
        result = offsetPath(item as never, distance, { join, limit: item.miterLimit, insert: false }) as unknown as paper.PathItem;
      } catch {
        continue;
      }
      if (!result || !(result as paper.Path).bounds?.width) continue;
      this.styled(result, item);
      if (distance > 0) result.insertBelow(item);
      else result.insertAbove(item);
      made.push(result);
    }
    if (!made.length) return;
    this.select(made);
    this.commit("", "Offset path");
  }

  private endsGroups(): paper.Group[] {
    return this.art.getItems({ recursive: true, class: this.scope.Group, match: (g: paper.Item) => Boolean(g.data?.ends) }) as paper.Group[];
  }

  endsInfo(): Ends | null {
    if (this.selection.length !== 1) return null;
    const item = this.selection[0];
    if (item instanceof this.scope.Group && item.data?.ends) return { ...(item.data.ends as Ends) };
    if (item instanceof this.scope.Path && item.parent?.data?.ends) return { ...(item.parent.data.ends as Ends) };
    if (item instanceof this.scope.Path && !item.closed && item.strokeColor) return { start: "none", end: "none", size: 1 };
    return null;
  }

  setEnds(patch: Partial<Ends>) {
    if (this.selection.length !== 1 || this.refAdjust) return;
    let item = this.selection[0];
    if (item instanceof this.scope.Path && item.parent?.data?.ends) item = item.parent;
    let group: paper.Group;
    if (item instanceof this.scope.Group && item.data?.ends) group = item;
    else if (item instanceof this.scope.Path && !item.closed) {
      group = new this.scope.Group({ insert: false });
      group.insertAbove(item);
      group.name = item.name;
      item.name = "";
      group.addChild(item);
      item.data.line = true;
      group.data.ends = { start: "none", end: "none", size: 1 };
    } else return;
    const ends = { ...(group.data.ends as Ends), ...patch };
    const line = group.children.find((c) => c.data.line) as paper.Path | undefined;
    if (line && ends.start === "none" && ends.end === "none") {
      line.insertAbove(group);
      line.name = group.name;
      delete line.data.line;
      group.remove();
      this.select([line]);
    } else {
      group.data.ends = ends;
      layoutEnds(this.scope, group);
      this.select([group]);
    }
    this.commit("ends", "Line ends");
  }

  effectsInfo(): Effects | null {
    if (!this.selection.length) return null;
    return { ...((this.selection[0].data?.effects as Effects | undefined) ?? {}) };
  }

  setEffects(fx: Effects) {
    if (this.refAdjust || !this.selection.length) return;
    for (const item of this.selection) {
      if (hasEffects(fx)) item.data.effects = JSON.parse(JSON.stringify(fx));
      else delete item.data.effects;
    }
    this.commit("effects", "Effects");
  }

  private gradientTarget(): paper.PathItem | paper.PointText | null {
    if (this.selection.length !== 1) return null;
    const item = this.selection[0];
    return item instanceof this.scope.PathItem || item instanceof this.scope.PointText ? item : null;
  }

  private gradientOf(item: paper.Item): { stops: GradientStop[]; origin: paper.Point; destination: paper.Point; radial: boolean } | null {
    const c = item.fillColor;
    if (!c?.gradient) return null;
    const g = c as unknown as { origin: paper.Point; destination: paper.Point };
    const stops = c.gradient.stops;
    return {
      stops: stops.map((s, i) => ({ color: toHex(s.color) ?? "#000000", offset: s.offset ?? i / Math.max(1, stops.length - 1) })),
      origin: g.origin.clone(),
      destination: g.destination.clone(),
      radial: Boolean(c.gradient.radial)
    };
  }

  private applyGradient(item: paper.Item, g: { stops: GradientStop[]; origin: paper.Point; destination: paper.Point; radial: boolean }, sort = true) {
    const ordered = sort ? [...g.stops].sort((a, b) => a.offset - b.offset) : g.stops;
    const stops = ordered.map((s) => [s.color, Math.max(0, Math.min(1, s.offset))]);
    item.fillColor = new this.scope.Color({ gradient: { stops, radial: g.radial }, origin: g.origin, destination: g.destination } as unknown as paper.Color);
  }

  private drawGradientHandles(z: number) {
    const target = this.gradientTarget();
    const g = target ? this.gradientOf(target) : null;
    if (!g) return;
    new this.scope.Path.Line({ from: g.origin, to: g.destination, strokeColor: "white", strokeWidth: 3 / z });
    new this.scope.Path.Line({ from: g.origin, to: g.destination, strokeColor: ACCENT, strokeWidth: 1.2 / z });
    g.stops.forEach((s, i) => {
      const at = g.origin.add(g.destination.subtract(g.origin).multiply(s.offset));
      const dot = new this.scope.Path.Circle({ center: at, radius: 6 / z, fillColor: s.color, strokeColor: "white", strokeWidth: 2 / z });
      dot.data.handle = `g-stop-${i}`;
    });
    for (const [name, at] of [
      ["g-origin", g.origin],
      ["g-dest", g.destination]
    ] as [string, paper.Point][]) {
      const knob = new this.scope.Path.Rectangle({ point: at.subtract(5 / z), size: [10 / z, 10 / z], fillColor: "white", strokeColor: ACCENT, strokeWidth: 1.2 / z });
      knob.data.handle = name;
    }
  }

  private startGradient(item: paper.Item): { stops: GradientStop[]; radial: boolean } {
    const g = this.gradientOf(item);
    if (g) return { stops: g.stops, radial: g.radial };
    const base = toHex(item.fillColor) ?? "#d9d4cc";
    return { stops: [{ color: base, offset: 0 }, { color: "#ffffff", offset: 1 }], radial: false };
  }

  private mixAt(stops: GradientStop[], t: number): string {
    const sorted = [...stops].sort((a, b) => a.offset - b.offset);
    const after = sorted.findIndex((s) => s.offset >= t);
    if (after <= 0) return sorted[Math.max(0, after)].color;
    const a = sorted[after - 1];
    const b = sorted[after];
    const k = b.offset === a.offset ? 0 : (t - a.offset) / (b.offset - a.offset);
    const ca = new this.scope.Color(a.color);
    const cb = new this.scope.Color(b.color);
    return toHex(new this.scope.Color(ca.red + (cb.red - ca.red) * k, ca.green + (cb.green - ca.green) * k, ca.blue + (cb.blue - ca.blue) * k)) ?? a.color;
  }

  async textToOutlines(load: (family: string, weight: number) => Promise<ArrayBuffer | null>): Promise<number> {
    if (this.refAdjust) return 0;
    const texts: paper.PointText[] = [];
    const tpGroups: paper.Group[] = [];
    for (const item of this.selection) {
      if (item instanceof this.scope.PointText) texts.push(item);
      else if (item.data?.textPath) {
        tpGroups.push(item as paper.Group);
        texts.push(...(item.children.filter((c) => c instanceof this.scope.PointText) as paper.PointText[]));
      } else if (item instanceof this.scope.Group) texts.push(...(item.getItems({ recursive: true, class: this.scope.PointText }) as paper.PointText[]));
    }
    if (!texts.length) throw new Error("Select some text first.");
    const made: paper.Item[] = [];
    for (const text of texts) {
      if (!text.content.trim()) continue;
      const d = await outlineText(
        {
          content: text.content,
          fontFamily: String(text.fontFamily),
          fontSize: Number(text.fontSize),
          fontWeight: String(text.fontWeight),
          justification: (text.justification as "left" | "center" | "right") ?? "left",
          leading: Number(text.leading),
          spacing: text.data.letterSpacing ?? 0
        },
        load
      );
      if (this.destroyed || !text.parent) return 0;
      const shape = this.scope.PathItem.create(d || "M0 0");
      shape.remove();
      shape.transform(text.matrix);
      shape.fillColor = text.fillColor ? text.fillColor.clone() : null;
      shape.strokeColor = text.strokeColor ? text.strokeColor.clone() : null;
      shape.strokeWidth = text.strokeWidth;
      shape.opacity = text.opacity;
      shape.blendMode = text.blendMode;
      shape.fillRule = "nonzero";
      if (text.data.effects) shape.data.effects = text.data.effects;
      if (!text.data.glyph) shape.name = text.name;
      shape.insertAbove(text);
      text.remove();
      made.push(shape);
    }
    for (const group of tpGroups) {
      for (const kid of [...group.children]) if (kid.data.guide) kid.remove();
      delete group.data.textPath;
    }
    const top = [...new Set(made.map((m) => this.topLevel(m)))];
    this.select(top.filter((t) => t.parent));
    this.commit("", "Text to shapes");
    return made.length;
  }

  clearGuides() {
    if (!this.guides.x.length && !this.guides.y.length) return;
    this.guides = { x: [], y: [] };
    this.commit("", "Clear guides");
  }

  setSnapOptions(patch: Partial<Pick<DrawingEngine["options"], "snap" | "smartGuides" | "snapPoints" | "angleStep" | "rulers">>) {
    Object.assign(this.options, patch);
    this.refresh();
  }

  private buildSnap(exclude: paper.Item[]) {
    const xs: number[] = [];
    const ys: number[] = [];
    const b = this.board.bounds;
    xs.push(b.left, b.center.x, b.right, ...this.guides.x);
    ys.push(b.top, b.center.y, b.bottom, ...this.guides.y);
    const excluded = (i: paper.Item) => exclude.some((e) => i === e || i.isDescendant(e) || e.isDescendant(i));
    for (const item of this.scopeRoot.children) {
      if (!item.visible || excluded(item)) continue;
      const r = item.bounds;
      xs.push(r.left, r.center.x, r.right);
      ys.push(r.top, r.center.y, r.bottom);
    }
    const points: { point: paper.Point; segment: paper.Segment }[] = [];
    const paths: paper.Path[] = [];
    if (this.options.snapPoints) {
      for (const p of this.scopePaths()) {
        if (excluded(p) || p === this.penPath) continue;
        paths.push(p);
        for (const s of p.segments) if (points.length < 6000) points.push({ point: s.point.clone(), segment: s });
      }
    }
    this.snapCache = { xs, ys, points, paths };
  }

  private nearestValue(values: number[], v: number, tol: number): number | null {
    let best: number | null = null;
    let bd = tol;
    for (const c of values) {
      const d = Math.abs(c - v);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  private snapGuideLine(axis: "x" | "y", v: number) {
    const vb = this.scope.view.bounds;
    this.snapLines.push(axis === "x" ? [new this.scope.Point(v, vb.top), new this.scope.Point(v, vb.bottom)] : [new this.scope.Point(vb.left, v), new this.scope.Point(vb.right, v)]);
  }

  private snapMove(delta: paper.Point, startBounds: paper.Rectangle, travelled: paper.Point): paper.Point {
    this.snapLines = [];
    this.snapMark = null;
    const cache = this.snapCache;
    const tol = 6 / this.scope.view.zoom;
    let dx = delta.x;
    let dy = delta.y;
    let gotX = false;
    let gotY = false;
    if (cache && this.options.smartGuides) {
      const moved = new this.scope.Rectangle(startBounds.point.add(travelled.add(delta)), startBounds.size);
      let best: { d: number; to: number } | null = null;
      for (const v of [moved.left, moved.center.x, moved.right]) {
        const hit = this.nearestValue(cache.xs, v, tol);
        if (hit !== null && (!best || Math.abs(hit - v) < best.d)) best = { d: Math.abs(hit - v), to: hit - v };
      }
      if (best) {
        dx += best.to;
        gotX = true;
      }
      let bestY: { d: number; to: number } | null = null;
      for (const v of [moved.top, moved.center.y, moved.bottom]) {
        const hit = this.nearestValue(cache.ys, v, tol);
        if (hit !== null && (!bestY || Math.abs(hit - v) < bestY.d)) bestY = { d: Math.abs(hit - v), to: hit - v };
      }
      if (bestY) {
        dy += bestY.to;
        gotY = true;
      }
      const final = new this.scope.Rectangle(startBounds.point.add(travelled.add(new this.scope.Point(dx, dy))), startBounds.size);
      if (gotX) for (const v of [final.left, final.center.x, final.right]) if (cache.xs.some((c) => Math.abs(c - v) < 0.01)) this.snapGuideLine("x", v);
      if (gotY) for (const v of [final.top, final.center.y, final.bottom]) if (cache.ys.some((c) => Math.abs(c - v) < 0.01)) this.snapGuideLine("y", v);
    }
    if (this.options.snap && (!gotX || !gotY)) {
      const moved = new this.scope.Rectangle(startBounds.point.add(travelled.add(new this.scope.Point(dx, dy))), startBounds.size);
      const g = this.options.grid;
      if (!gotX) dx += Math.round(moved.left / g) * g - moved.left;
      if (!gotY) dy += Math.round(moved.top / g) * g - moved.top;
    }
    return new this.scope.Point(dx, dy);
  }

  private drawGuides(z: number) {
    const vb = this.scope.view.bounds;
    for (const x of this.guides.x) new this.scope.Path.Line({ from: [x, vb.top], to: [x, vb.bottom], strokeColor: GUIDE_COLOUR, strokeWidth: 1 / z });
    for (const y of this.guides.y) new this.scope.Path.Line({ from: [vb.left, y], to: [vb.right, y], strokeColor: GUIDE_COLOUR, strokeWidth: 1 / z });
  }

  private drawSnapLines(z: number) {
    for (const [from, to] of this.snapLines) new this.scope.Path.Line({ from, to, strokeColor: SNAP_COLOUR, strokeWidth: 1 / z, dashArray: [4 / z, 3 / z] });
    if (this.snapMark) new this.scope.Path.Circle({ center: this.snapMark, radius: 4 / z, strokeColor: SNAP_COLOUR, strokeWidth: 1.5 / z });
  }

  private drawRulers(z: number) {
    const vb = this.scope.view.bounds;
    const t = RULER / z;
    const bg = new this.scope.Color("#23262b");
    new this.scope.Path.Rectangle({ rectangle: new this.scope.Rectangle(vb.left, vb.top, vb.width, t), fillColor: bg });
    new this.scope.Path.Rectangle({ rectangle: new this.scope.Rectangle(vb.left, vb.top, t, vb.height), fillColor: bg });
    const raw = 70 / z;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
    const minor = step / 5;
    const ticks = new this.scope.CompoundPath({ strokeColor: new this.scope.Color("#80858d"), strokeWidth: 1 / z });
    const label = (text: string, at: paper.Point) => new this.scope.PointText({ point: at, content: text, fontSize: 9 / z, fontFamily: "system-ui, sans-serif", fillColor: "#a4a9b0" });
    const fmt = (v: number) => String(Math.round(v * 100) / 100);
    const { x: ox, y: oy } = this.box;
    for (let v = Math.floor((vb.left - ox) / minor) * minor; ox + v <= vb.right; v += minor) {
      const X = ox + v;
      if (X < vb.left + t) continue;
      const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      ticks.addChild(new this.scope.Path.Line({ from: [X, vb.top + t * (major ? 0.15 : 0.65)], to: [X, vb.top + t], insert: false }));
      if (major) label(fmt(v), new this.scope.Point(X + 2 / z, vb.top + t * 0.55));
    }
    for (let v = Math.floor((vb.top - oy) / minor) * minor; oy + v <= vb.bottom; v += minor) {
      const Y = oy + v;
      if (Y < vb.top + t) continue;
      const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
      ticks.addChild(new this.scope.Path.Line({ from: [vb.left + t * (major ? 0.15 : 0.65), Y], to: [vb.left + t, Y], insert: false }));
      if (major) {
        const l = label(fmt(v), new this.scope.Point(vb.left + t * 0.55, Y - 2 / z));
        l.rotate(-90, l.point);
      }
    }
    new this.scope.Path.Rectangle({ rectangle: new this.scope.Rectangle(vb.left, vb.top, t, t), fillColor: bg });
  }

  private inRuler(point: paper.Point): "x" | "y" | "corner" | null {
    if (!this.options.rulers) return null;
    const vb = this.scope.view.bounds;
    const t = RULER / this.scope.view.zoom;
    const top = point.y < vb.top + t;
    const left = point.x < vb.left + t;
    return top && left ? "corner" : top ? "y" : left ? "x" : null;
  }

  private guideAt(point: paper.Point): { axis: "x" | "y"; index: number } | null {
    const tol = 4 / this.scope.view.zoom;
    const ix = this.guides.x.findIndex((x) => Math.abs(x - point.x) < tol);
    if (ix >= 0) return { axis: "x", index: ix };
    const iy = this.guides.y.findIndex((y) => Math.abs(y - point.y) < tol);
    return iy >= 0 ? { axis: "y", index: iy } : null;
  }

  private smoothCurvature(path: paper.Path) {
    if (path.segments.length < 2) return;
    path.smooth({ type: "catmull-rom" });
    for (const s of path.segments) if (this.penCorners.has(s.index)) s.clearHandles();
    if (!path.closed) {
      path.firstSegment.handleIn = new this.scope.Point(0, 0);
      path.lastSegment.handleOut = new this.scope.Point(0, 0);
    }
  }

  private layoutLive() {
    layoutSymbols(this.scope, this.art);
    for (const g of this.art.getItems({ recursive: true, class: this.scope.Group, match: (i: paper.Item) => Boolean(i.data?.repeat) }) as paper.Group[]) layoutRepeat(this.scope, g);
    for (const g of this.art.getItems({ recursive: true, class: this.scope.Group, match: (i: paper.Item) => Boolean(i.data?.boolean) }) as paper.Group[]) layoutBoolean(this.scope, g);
    for (const g of this.art.getItems({ recursive: true, class: this.scope.Group, match: (i: paper.Item) => Boolean(i.data?.blend) }) as paper.Group[]) layoutBlend(this.scope, g);
    for (const t of this.art.getItems({ recursive: true, class: this.scope.PointText, match: (i: paper.Item) => Boolean(i.data?.wrap) }) as paper.PointText[]) this.wrapText(t);
  }

  private liveOwner(item: paper.Item | undefined): paper.Group | null {
    for (let i: paper.Item | null | undefined = item; i && i !== this.art; i = i.parent) if (i instanceof this.scope.Group && (i.data?.repeat || i.data?.blend || i.data?.boolean)) return i;
    return null;
  }

  liveInfo(): { repeat?: Repeat; blend?: Blend; boolean?: BooleanOp; symbol?: "master" | "copy" } | null {
    if (this.selection.length !== 1) return null;
    const item = this.selection[0];
    if (item.data?.boolean) return { boolean: item.data.boolean.op as BooleanOp };
    if (item.data?.repeat) return { repeat: { ...(item.data.repeat as Repeat) } };
    if (item.data?.blend) return { blend: { ...(item.data.blend as Blend) } };
    if (item.data?.instanceOf) return { symbol: "copy" };
    if (item.data?.symbol) return { symbol: "master" };
    return null;
  }

  makeRepeat(kind: Repeat["kind"]) {
    if (this.refAdjust || !this.selection.length) return;
    let source: paper.Item;
    let along: paper.Path | null = null;
    if (kind === "path") {
      if (this.selection.length !== 2) return;
      const sorted = [...this.selection].sort((a, b) => b.index - a.index);
      const paths = sorted.filter((i): i is paper.Path => i instanceof this.scope.Path);
      along = paths.find((p) => !p.closed) ?? paths[0] ?? null;
      if (!along) return;
      source = sorted.find((i) => i !== along)!;
    } else if (this.selection.length === 1) source = this.selection[0];
    else {
      this.group();
      source = this.selection[0];
    }
    const group = new this.scope.Group({ insert: false });
    group.insertAbove(source);
    group.name = source.name;
    source.name = "";
    group.addChild(source);
    source.data.source = true;
    if (along) {
      group.insertChild(0, along);
      along.data.along = true;
    }
    const b = source.bounds;
    const repeat: Repeat =
      kind === "grid"
        ? { kind, cols: 3, rows: 2, gapX: Math.round(b.width * 0.2), gapY: Math.round(b.height * 0.2) }
        : kind === "radial"
          ? { kind, count: 8, radius: Math.round(Math.max(b.width, b.height) * 1.2) }
          : kind === "mirror"
            ? { kind, axis: "v", atX: Math.round(b.right + b.width * 0.1), atY: Math.round(b.bottom + b.height * 0.1) }
            : { kind, count: 8, rotate: true };
    group.data.repeat = repeat;
    this.select([group]);
    this.commit("", "Repeat");
  }

  setRepeat(patch: Partial<Repeat>) {
    const group = this.selection[0];
    if (!group?.data?.repeat) return;
    group.data.repeat = { ...group.data.repeat, ...patch };
    this.commit("repeat", "Repeat");
  }

  private unwrapLive(expand: boolean) {
    const group = this.selection[0];
    if (!(group instanceof this.scope.Group) || !(group.data?.repeat || group.data?.blend || group.data?.boolean)) return;
    const isBoolean = Boolean(group.data.boolean);
    const kids = [...group.children];
    for (const kid of kids) {
      if (isBoolean && expand && kid.data.operand) {
        kid.remove();
        continue;
      }
      if (kid.data.gen && !expand) {
        kid.remove();
        continue;
      }
      delete kid.data.operand;
      delete kid.data.gen;
      delete kid.data.source;
      delete kid.data.along;
      delete kid.data.blendEnd;
    }
    delete group.data.repeat;
    delete group.data.blend;
    delete group.data.boolean;
    if (expand && isBoolean) {
      const result = group.firstChild;
      if (result) {
        result.insertAbove(group);
        result.name = group.name;
        group.remove();
        this.select([result]);
      }
      this.commit("", "Flatten");
      return;
    }
    if (expand) {
      this.select([group]);
      this.commit("", "Expand");
      return;
    }
    const rest = [...group.children];
    for (const kid of rest) kid.insertBelow(group);
    if (rest[0] && group.name) rest[rest.length - 1].name = group.name;
    group.remove();
    this.select(rest);
    this.commit("", "Release");
  }

  expandLive() {
    this.unwrapLive(true);
  }

  releaseLive() {
    this.unwrapLive(false);
  }

  setMirrorDrawing(axis: "off" | "v" | "h" | "both") {
    this.options.mirror = axis;
    this.refresh();
  }

  private mirrorWrap(item: paper.Item): paper.Item {
    if (this.options.mirror === "off" || !item.parent || item.data?.source || this.liveOwner(item)) return item;
    const group = new this.scope.Group({ insert: false });
    group.insertAbove(item);
    group.addChild(item);
    item.data.source = true;
    const b = this.board.bounds;
    group.data.repeat = { kind: "mirror", axis: this.options.mirror, atX: b.center.x, atY: b.center.y } as Repeat;
    layoutRepeat(this.scope, group);
    return group;
  }

  makeBlend() {
    if (this.refAdjust) return;
    const items = [...this.selection].sort((a, b) => a.index - b.index);
    if (items.length !== 2) return;
    const [a, b] = items;
    const group = new this.scope.Group({ insert: false });
    group.insertAbove(b);
    group.addChildren([a, b]);
    a.data.blendEnd = 0;
    b.data.blendEnd = 1;
    group.data.blend = { steps: 5 } as Blend;
    this.select([group]);
    this.commit("", "Blend");
  }

  setBlend(steps: number) {
    const group = this.selection[0];
    if (!group?.data?.blend) return;
    group.data.blend = { steps: Math.max(1, Math.min(200, Math.round(steps))) };
    this.commit("blend", "Blend");
  }

  makeSymbol() {
    if (this.refAdjust || !this.selection.length) return;
    if (this.selection.length > 1) this.group();
    const master = this.selection[0];
    if (master.data?.symbol || master.data?.instanceOf) return;
    master.data.symbol = `s${Date.now().toString(36)}`;
    this.placeSymbol();
  }

  placeSymbol() {
    const item = this.selection[0];
    const id = item?.data?.symbol ?? item?.data?.instanceOf;
    if (!id) return;
    const inst = new this.scope.Group({ insert: false });
    inst.applyMatrix = false;
    inst.data.instanceOf = id;
    inst.insertAbove(item);
    const master = this.art.getItem({ recursive: true, match: (i: paper.Item) => i.data?.symbol === id });
    if (master) inst.addChild(master.clone({ insert: false }));
    const offset = item.data?.instanceOf ? item.matrix.clone() : new this.scope.Matrix();
    inst.matrix = new this.scope.Matrix().translate(24, 24).append(offset);
    layoutSymbols(this.scope, this.art);
    this.select([inst]);
    this.commit("", "Place a copy");
  }

  selectSymbolMaster() {
    const id = this.selection[0]?.data?.instanceOf;
    const master = id ? this.art.getItem({ recursive: true, match: (i: paper.Item) => i.data?.symbol === id }) : null;
    if (master) this.select([master]);
  }

  detachSymbol() {
    const item = this.selection[0];
    if (!item) return;
    if (item.data?.instanceOf) {
      const kids = [...item.children];
      const matrix = item.matrix.clone();
      for (const kid of kids) {
        kid.transform(matrix);
        delete kid.data.gen;
        kid.insertBelow(item);
      }
      item.remove();
      this.select(kids);
    } else if (item.data?.symbol) {
      const id = item.data.symbol;
      delete item.data.symbol;
      delete item.data.symbolAt;
      for (const inst of this.art.getItems({ recursive: true, match: (i: paper.Item) => i.data?.instanceOf === id })) {
        const matrix = inst.matrix.clone();
        for (const kid of [...inst.children]) {
          kid.transform(matrix);
          delete kid.data.gen;
          kid.insertBelow(inst);
        }
        inst.remove();
      }
    } else return;
    this.commit("", "Detach");
  }

  private effectBase: { items: paper.Item[]; kind: string; bounds: paper.Rectangle; saved: Map<paper.Path, { segments: paper.Segment[]; closed: boolean }> } | null = null;

  private effectPaths(kind: string): Map<paper.Path, { segments: paper.Segment[]; closed: boolean }> | null {
    const paths = this.selectedPaths();
    if (!paths.length) return null;
    if (!this.effectBase || this.effectBase.kind !== kind || !sameItems(this.effectBase.items, this.selection)) {
      this.effectBase = { items: [...this.selection], kind, bounds: this.selectionBounds()!, saved: new Map(paths.map((p) => [p, { segments: p.segments.map((s) => s.clone()), closed: p.closed }])) };
    }
    for (const [path, base] of this.effectBase.saved) {
      path.removeSegments();
      path.addSegments(base.segments.map((s) => s.clone()));
      path.closed = base.closed;
    }
    return this.effectBase.saved;
  }

  applyEffect<K extends EffectKind>(kind: K, params: EffectParams[K]) {
    if (this.refAdjust) return;
    const saved = this.effectPaths(kind);
    if (!saved || !this.effectBase) return;
    const b = this.effectBase.bounds;
    const radius = Math.max(b.width, b.height) / 2;
    for (const path of saved.keys()) {
      if (kind === "roughen") roughen(this.scope, path, params as EffectParams["roughen"]);
      else if (kind === "zigzag") zigzag(this.scope, path, params as EffectParams["zigzag"]);
      else if (kind === "pucker") puckerBloat(this.scope, path, (params as EffectParams["pucker"]).amount, path.bounds.center);
      else {
        prepareForBend(path);
        const f = kind === "twist" ? twistMap((params as EffectParams["twist"]).angle, b.center, radius) : warpMap((params as EffectParams["warp"]).style, (params as EffectParams["warp"]).bend, b);
        mapPath(this.scope, path, f);
      }
    }
    this.nodes = [];
    this.curve = null;
    const base = this.effectBase;
    const labels: Record<EffectKind, string> = { roughen: "Roughen", zigzag: "Zig zag", pucker: "Pucker and bloat", twist: "Twist", warp: "Warp" };
    this.commit(`fx-${kind}`, labels[kind]);
    this.effectBase = base;
  }

  private distortState: { items: paper.Item[]; rect: paper.Rectangle; quad: [number, number][]; saved: Map<paper.Path, paper.Segment[]> } | null = null;

  private distortQuad(): [number, number][] | null {
    if (!this.selection.length) return null;
    if (this.distortState && sameItems(this.distortState.items, this.selection)) return this.distortState.quad;
    const b = this.selectionBounds()!;
    return [
      [b.left, b.top],
      [b.right, b.top],
      [b.right, b.bottom],
      [b.left, b.bottom]
    ];
  }

  private startDistort() {
    if (this.distortState && sameItems(this.distortState.items, this.selection)) return;
    const paths = this.selectedPaths();
    for (const p of paths) prepareForBend(p);
    const b = this.selectionBounds()!;
    this.distortState = {
      items: [...this.selection],
      rect: b,
      quad: this.distortQuad()!,
      saved: new Map(paths.map((p) => [p, p.segments.map((s) => s.clone())]))
    };
  }

  private applyDistort() {
    const st = this.distortState;
    if (!st) return;
    const f = perspectiveMap(st.rect, st.quad);
    for (const [path, segs] of st.saved) {
      path.removeSegments();
      path.addSegments(segs.map((s) => s.clone()));
      mapPath(this.scope, path, f);
    }
  }

  private drawDistortHandles(z: number) {
    const quad = this.distortQuad();
    if (!quad) return;
    const pts = quad.map(([x, y]) => new this.scope.Point(x, y));
    new this.scope.Path({ segments: pts, closed: true, strokeColor: ACCENT, strokeWidth: 1 / z, dashArray: [4 / z, 3 / z] });
    pts.forEach((p, i) => {
      const h = new this.scope.Path.Circle({ center: p, radius: 6 / z, fillColor: "white", strokeColor: ACCENT, strokeWidth: 1.5 / z });
      h.data.handle = `d-${i}`;
    });
  }

  extrasInfo(): ExtraPaint[] | null {
    const first = this.leafShapesOfSelection()[0];
    return first ? ((first.data?.extra as ExtraPaint[] | undefined) ?? []).map((x) => ({ ...x })) : null;
  }

  setExtras(list: ExtraPaint[]) {
    if (this.refAdjust) return;
    for (const shape of this.leafShapesOfSelection()) {
      if (list.length) shape.data.extra = list.map((x) => ({ ...x }));
      else delete shape.data.extra;
    }
    this.commit("extras", "Extra fills and outlines");
  }

  setStrokeAlign(align: StrokeAlign) {
    if (this.refAdjust) return;
    for (const path of this.leafShapesOfSelection()) {
      if (align === "center") delete path.data.strokeAlign;
      else path.data.strokeAlign = align;
    }
    this.commit("", "Outline position");
  }

  private leafShapesOfSelection(): paper.PathItem[] {
    const out: paper.PathItem[] = [];
    const walk = (item: paper.Item) => {
      if (item.data?.gen || item.data?.head) return;
      if (item instanceof this.scope.PathItem) out.push(item);
      else if (item instanceof this.scope.Group) for (const kid of item.children) walk(kid);
    };
    for (const item of this.selection) walk(item);
    return out;
  }

  captureTile(): boolean {
    if (!this.selection.length) return false;
    this.clearSelectionFlags();
    const group = new this.scope.Group({ insert: false, children: this.selection.map((i) => i.clone({ insert: false })) });
    const b = group.strokeBounds;
    group.translate(b.topLeft.multiply(-1));
    const svg = group.exportSVG({ asString: true, precision: 2 }) as string;
    this.tile = { tile: svg, tileW: Math.max(1, Math.round(b.width * 100) / 100), tileH: Math.max(1, Math.round(b.height * 100) / 100) };
    this.refresh();
    return true;
  }

  recolor(from: string, to: string) {
    if (this.refAdjust || from === to) return;
    const swap = (c: paper.Color | null): paper.Color | null => {
      if (!c) return c;
      if (c.gradient) {
        const g = c as unknown as { origin: paper.Point; destination: paper.Point };
        const stops = c.gradient.stops.map((s, i, all) => [toHex(s.color) === from ? to : s.color, s.offset ?? i / Math.max(1, all.length - 1)]);
        return new this.scope.Color({ gradient: { stops, radial: c.gradient.radial }, origin: g.origin, destination: g.destination } as unknown as paper.Color);
      }
      if (toHex(c) !== from) return c;
      const next = new this.scope.Color(to);
      next.alpha = c.alpha;
      return next;
    };
    for (const item of this.art.getItems({ recursive: true, match: (i: paper.Item) => !(i.parent instanceof this.scope.CompoundPath) })) {
      if (item.fillColor) item.fillColor = swap(item.fillColor);
      if (item.strokeColor) item.strokeColor = swap(item.strokeColor);
      const pattern = item.data?.pattern as PatternFill | undefined;
      if (pattern && pattern.color === from) item.data.pattern = { ...pattern, color: to };
      const fx = item.data?.effects as Effects | undefined;
      if (fx) {
        for (const key of ["shadow", "inner", "glow"] as const) if (fx[key]?.color === from) fx[key] = { ...fx[key]!, color: to } as never;
      }
      if (item.data?.textPath?.fill === from) item.data.textPath = { ...item.data.textPath, fill: to };
    }
    this.commit(`recolor-${from}`, "Recolour");
  }

  makeSoftMask() {
    if (this.refAdjust) return;
    const items = [...this.selection].sort((a, b) => a.index - b.index);
    if (items.length < 2) return;
    const mask = items[items.length - 1];
    const group = new this.scope.Group({ insert: false });
    group.insertAbove(mask);
    group.addChildren([...items.slice(0, -1), mask]);
    mask.data.maskSource = true;
    group.data.softMask = true;
    this.select([group]);
    this.commit("", "Soft mask");
  }

  get canReleaseSoftMask() {
    return this.selection.some((i) => i.data?.softMask);
  }

  releaseSoftMask() {
    const released: paper.Item[] = [];
    for (const item of this.selection) {
      if (!item.data?.softMask) {
        released.push(item);
        continue;
      }
      const kids = [...item.children];
      for (const kid of kids) {
        delete kid.data.maskSource;
        kid.visible = true;
        kid.insertBelow(item);
      }
      item.remove();
      released.push(...kids);
    }
    this.select(released);
    this.commit("", "Release soft mask");
  }

  private measureCtx: CanvasRenderingContext2D | null = null;

  private wrapText(t: paper.PointText) {
    const width = Number(t.data.wrap);
    const raw = String(t.data.raw ?? t.content);
    if (!width || width <= 0) return;
    this.measureCtx ??= document.createElement("canvas").getContext("2d");
    const ctx = this.measureCtx as CanvasRenderingContext2D & { letterSpacing?: string };
    ctx.font = `${t.fontWeight} ${Number(t.fontSize)}px ${t.fontFamily}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${t.data.letterSpacing ?? 0}px`;
    const lines: string[] = [];
    for (const para of raw.split("\n")) {
      const words = para.split(/(\s+)/);
      let line = "";
      for (const word of words) {
        const next = line + word;
        if (line.trim() && ctx.measureText(next.trimEnd()).width > width) {
          lines.push(line.trimEnd());
          line = word.trimStart();
        } else line = next;
      }
      lines.push(line.trimEnd());
    }
    const content = lines.join("\n");
    if (t.content !== content) t.content = content;
  }

  setWrap(width: number) {
    const t = this.selection[0];
    if (!(t instanceof this.scope.PointText)) return;
    if (width > 0) {
      if (!t.data.wrap) t.data.raw = t.content;
      t.data.wrap = width;
      this.wrapText(t);
    } else if (t.data.wrap) {
      t.content = String(t.data.raw ?? t.content);
      delete t.data.wrap;
      delete t.data.raw;
    }
    this.commit("wrap", "Text box");
  }

  async exportLayers(format: "svg" | "png", scale: number): Promise<{ name: string; blob: Blob }[]> {
    this.finishPen();
    const items = this.art.children.filter((c) => c.visible);
    const used = new Set<string>();
    const files: { name: string; blob: Blob }[] = [];
    for (const [i, item] of items.entries()) {
      let base = (item.name && !GENERATED_ID.test(item.name) ? item.name : `layer-${i + 1}`).replace(/[^\w-]+/g, "-");
      while (used.has(base)) base += "-2";
      used.add(base);
      const others = this.art.children.filter((c) => c !== item && c.visible);
      for (const o of others) o.visible = false;
      try {
        if (format === "svg") {
          const doc = new DOMParser().parseFromString(this.exportSvg(), "image/svg+xml");
          for (const hidden of Array.from(doc.documentElement.querySelectorAll('[visibility="hidden"]'))) if (!hidden.closest("mask")) hidden.remove();
          files.push({ name: `${base}.svg`, blob: new Blob([new XMLSerializer().serializeToString(doc.documentElement)], { type: "image/svg+xml" }) });
        } else files.push({ name: `${base}.png`, blob: await this.exportPng(scale, false, null) });
      } finally {
        for (const o of others) o.visible = true;
      }
    }
    this.refresh();
    return files;
  }

  blobPaint(stroke: paper.Path) {
    if (this.refAdjust || !stroke.segments.length) return;
    const half = Math.max(0.5, this.options.blob / 2);
    let region: paper.PathItem;
    if (stroke.segments.length < 2 || stroke.length < 0.5) region = new this.scope.Path.Circle({ center: stroke.firstSegment.point, radius: half, insert: false });
    else {
      stroke.simplify(1);
      try {
        region = offsetStroke(stroke as never, half, { cap: "round", join: "round", insert: false }) as unknown as paper.PathItem;
      } catch {
        region = strokeOutline(this.scope, Object.assign(stroke, { strokeWidth: half * 2 })) ?? new this.scope.Path.Circle({ center: stroke.firstSegment.point, radius: half, insert: false });
      }
    }
    const colour = new this.scope.Color(this.defaults.fill ?? this.lineDefaults.stroke);
    region.fillColor = colour;
    region.strokeColor = null;
    const hex = toHex(colour);
    const targets = this.scopeRoot.children.filter(
      (i): i is paper.PathItem =>
        i instanceof this.scope.PathItem &&
        this.shown(i) &&
        !i.data?.gen &&
        !i.strokeColor &&
        !i.fillColor?.gradient &&
        toHex(i.fillColor) === hex &&
        i.bounds.intersects(region.bounds) &&
        (region.intersects(i) || i.contains(region.interiorPoint) || region.contains(i.interiorPoint))
    );
    let result: paper.PathItem = region;
    for (const t of targets) result = result.unite(t, { insert: false }) as paper.PathItem;
    result.fillColor = colour;
    result.strokeColor = null;
    if (targets.length) {
      const top = targets.reduce((a, b) => (a.index > b.index ? a : b));
      result.insertAbove(top);
      result.name = targets.find((t) => t.name)?.name ?? "";
      for (const t of targets) t.remove();
    } else {
      (this.isolated ?? this.art).addChild(result);
    }
    const placed = targets.length ? result : this.mirrorWrap(result);
    this.select([placed]);
    this.commit("", "Blob brush");
  }

  calligraphy(stroke: paper.Path) {
    if (this.refAdjust || stroke.segments.length < 2 || stroke.length < 1) return;
    stroke.simplify(1.5);
    const L = stroke.length;
    const steps = Math.max(2, Math.ceil(L / 1.5));
    const pts: paper.Point[] = [];
    for (let i = 0; i <= steps; i++) {
      const p = stroke.getPointAt(Math.min(L, (L * i) / steps));
      if (p) pts.push(p);
    }
    const nib = new this.scope.Point({ angle: this.options.nibAngle, length: 1 });
    const thin = Math.max(0.6, this.options.nib * 0.12);
    const left: paper.Point[] = [];
    const right: paper.Point[] = [];
    pts.forEach((p, i) => {
      const dir = (pts[Math.min(pts.length - 1, i + 1)].subtract(pts[Math.max(0, i - 1)])).normalize();
      if (dir.isZero()) return;
      const normal = new this.scope.Point(-dir.y, dir.x);
      const half = Math.max(thin, this.options.nib * Math.abs(dir.cross(nib))) / 2;
      left.push(p.add(normal.multiply(half)));
      right.push(p.subtract(normal.multiply(half)));
    });
    if (left.length < 2) return;
    const outline = new this.scope.Path({ segments: [...left, ...right.reverse()], closed: true, insert: false });
    let shape = outline.unite(outline, { insert: false }) as paper.PathItem;
    if (shape instanceof this.scope.Path) shape.simplify(0.4);
    else for (const kid of shape.children as paper.Path[]) kid.simplify(0.4);
    shape.fillColor = new this.scope.Color(this.lineDefaults.stroke);
    shape.strokeColor = null;
    (this.isolated ?? this.art).addChild(shape);
    shape = this.mirrorWrap(shape) as paper.PathItem;
    this.select([shape]);
    this.commit("", "Calligraphy");
  }

  private isGen(item: paper.Item) {
    for (let i: paper.Item | null = item; i && i !== this.art; i = i.parent) if (i.data?.gen) return true;
    return false;
  }

  setBooleanOp(op: BooleanOp) {
    const group = this.selection[0];
    if (!group?.data?.boolean) return;
    group.data.boolean = { op };
    this.commit("", "Combine shapes");
  }

  boolean(op: BooleanOp) {
    if (this.refAdjust) return;
    const shapes = [...this.selection].filter((i): i is paper.PathItem => i instanceof this.scope.PathItem).sort((a, b) => a.index - b.index);
    if (shapes.length < 2) return;
    if (this.options.liveBoolean) {
      const group = new this.scope.Group({ insert: false });
      group.insertAbove(shapes[shapes.length - 1]);
      group.addChildren(shapes);
      for (const s of shapes) s.data.operand = true;
      group.data.boolean = { op };
      layoutBoolean(this.scope, group);
      this.select([group]);
      this.commit("", op[0].toUpperCase() + op.slice(1));
      return;
    }
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
      let outline: paper.PathItem | null = null;
      try {
        outline = offsetStroke(item as never, item.strokeWidth / 2, { cap: item.strokeCap as "butt", join: item.strokeJoin as "miter", limit: item.miterLimit, insert: false }) as unknown as paper.PathItem;
      } catch {
        outline = null;
      }
      if (!outline || !outline.bounds.width) outline = strokeOutline(this.scope, item);
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
        opacity: 1,
        blendMode: "normal",
        strokeAlign: "center"
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
      opacity: item.opacity,
      blendMode: (item.blendMode as BlendMode) ?? "normal",
      strokeAlign: (style.data?.strokeAlign as StrokeAlign | undefined) ?? "center"
    };
  }

  private makeFill(item: paper.Item, fill: Fill): paper.Color | null {
    if (fill.kind === "none") return null;
    if (fill.kind === "solid") return new this.scope.Color(fill.color);
    if (fill.kind === "pattern") return new this.scope.Color(fill.color2);
    const b = item.bounds;
    const list = (fill.stops && fill.stops.length >= 2 ? fill.stops.map((st) => ({ ...st })) : [{ color: fill.color, offset: 0 }, { color: fill.color2, offset: 1 }]).sort((p, q) => p.offset - q.offset);
    list[0].color = fill.color;
    list[list.length - 1].color = fill.color2;
    const stops = list.map((st) => [st.color, Math.max(0, Math.min(1, st.offset))]);
    const radial = fill.kind === "radial";
    const current = item.fillColor?.gradient ? (item.fillColor as unknown as { origin: paper.Point; destination: paper.Point; gradient: paper.Gradient }) : null;
    const near = (p: paper.Point, q?: [number, number]) => Boolean(q) && Math.abs(p.x - q![0]) < 0.01 && Math.abs(p.y - q![1]) < 0.01;
    if (current && Boolean(current.gradient.radial) === radial && near(current.origin, fill.origin) && near(current.destination, fill.destination) && (radial || Math.round(current.destination.subtract(current.origin).angle) === fill.angle)) {
      return new this.scope.Color({ gradient: { stops, radial }, origin: current.origin, destination: current.destination } as unknown as paper.Color);
    }
    if (radial) {
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
        for (const kid of item.children) if (!kid.data?.head) apply(kid);
        return;
      }
      if (patch.fill && !(item.data?.line && item.parent?.data?.ends)) {
        item.fillColor = this.makeFill(item, patch.fill);
        if (patch.fill.kind === "pattern") {
          const base = patch.fill.pattern ?? { kind: "stripes" as const, size: 12, angle: 45 };
          item.data.pattern = { ...base, color: patch.fill.color, ...(base.kind === "tile" && !base.tile && this.tile ? this.tile : {}) };
        } else delete item.data.pattern;
      }
      if (patch.stroke !== undefined) item.strokeColor = patch.stroke ? new this.scope.Color(patch.stroke) : null;
      if (patch.strokeWidth !== undefined) {
        const widths = item.data?.widths as WidthPoint[] | undefined;
        if (widths?.length && item.strokeWidth) item.data.widths = widths.map((w) => ({ ...w, w: (w.w * patch.strokeWidth!) / item.strokeWidth }));
        item.strokeWidth = patch.strokeWidth;
      }
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
      if (patch.blendMode) item.blendMode = patch.blendMode;
    }
    this.commit(key);
  }

  textInfo(): TextInfo | null {
    const item = this.selection[0];
    if (!(item instanceof this.scope.PointText) || this.selection.length > 1) return null;
    return {
      content: item.data.wrap ? String(item.data.raw ?? item.content) : item.content,
      wrap: Number(item.data.wrap) || 0,
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
    if (patch.content !== undefined) {
      if (item.data.wrap) item.data.raw = patch.content;
      else item.content = patch.content;
    }
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
        if (item.data?.gen) continue;
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
