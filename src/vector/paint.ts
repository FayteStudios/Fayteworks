import type paper from "paper/dist/paper-core";
import { outlineData, widthOutline, type WidthPoint } from "./strokes";

export type StrokeAlign = "center" | "inside" | "outside";
export type PatternKind = "stripes" | "dots" | "checks" | "grid" | "tile";

export interface PatternFill {
  kind: PatternKind;
  color: string;
  size: number;
  angle: number;
  tile?: string;
  tileW?: number;
  tileH?: number;
}

export interface ExtraPaint {
  kind: "fill" | "stroke";
  color: string;
  opacity: number;
  width: number;
  dx: number;
  dy: number;
}

export interface PaintExport {
  stroke: string | null;
  strokeOpacity: number;
  width: number;
  cap: string;
  join: string;
  miter: number;
  dash: number[];
  dashOffset: number;
  rule: string;
  outline?: string;
}

export const PATTERN_KINDS: { value: PatternKind; label: string }[] = [
  { value: "stripes", label: "Stripes" },
  { value: "dots", label: "Dots" },
  { value: "checks", label: "Checks" },
  { value: "grid", label: "Grid" },
  { value: "tile", label: "Your tile" }
];

const SVG_NS = "http://www.w3.org/2000/svg";
const n = (v: number) => String(Math.round(v * 1000) / 1000);

export function tileSvg(p: PatternFill): { w: number; h: number; body: string } {
  const s = Math.max(1, p.size);
  const c = p.color;
  if (p.kind === "tile" && p.tile) return { w: Math.max(1, p.tileW ?? s), h: Math.max(1, p.tileH ?? s), body: p.tile };
  if (p.kind === "dots") return { w: s, h: s, body: `<circle cx="${n(s / 2)}" cy="${n(s / 2)}" r="${n(s * 0.22)}" fill="${c}"/>` };
  if (p.kind === "checks") return { w: s, h: s, body: `<rect width="${n(s / 2)}" height="${n(s / 2)}" fill="${c}"/><rect x="${n(s / 2)}" y="${n(s / 2)}" width="${n(s / 2)}" height="${n(s / 2)}" fill="${c}"/>` };
  if (p.kind === "grid") return { w: s, h: s, body: `<rect width="${n(s)}" height="${n(s * 0.08)}" fill="${c}"/><rect width="${n(s * 0.08)}" height="${n(s)}" fill="${c}"/>` };
  return { w: s, h: s, body: `<rect width="${n(s)}" height="${n(s / 2)}" fill="${c}"/>` };
}

const images = new Map<string, HTMLImageElement | "loading" | "failed">();
const redraws = new Set<() => void>();

export function onTileReady(fn: () => void): () => void {
  redraws.add(fn);
  return () => redraws.delete(fn);
}

function tileImage(p: PatternFill): HTMLImageElement | null {
  const t = tileSvg(p);
  const markup = `<svg xmlns="${SVG_NS}" width="${n(t.w)}" height="${n(t.h)}" viewBox="0 0 ${n(t.w)} ${n(t.h)}">${t.body}</svg>`;
  const hit = images.get(markup);
  if (hit instanceof HTMLImageElement) return hit;
  if (hit) return null;
  images.set(markup, "loading");
  const img = new Image();
  img.onload = () => {
    images.set(markup, img);
    for (const fn of redraws) fn();
  };
  img.onerror = () => images.set(markup, "failed");
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  return null;
}

const patterns = new Map<string, CanvasPattern>();

function canvasPattern(ctx: CanvasRenderingContext2D, p: PatternFill, scale: number): CanvasPattern | null {
  const key = `${JSON.stringify(p)}@${Math.round(scale * 100)}`;
  const cached = patterns.get(key);
  if (cached) return cached;
  const img = tileImage(p);
  if (!img) return null;
  const t = tileSvg(p);
  const k = Math.min(scale, 2048 / Math.max(t.w, t.h));
  const tile = document.createElement("canvas");
  tile.width = Math.max(1, Math.round(t.w * k));
  tile.height = Math.max(1, Math.round(t.h * k));
  tile.getContext("2d")!.drawImage(img, 0, 0, tile.width, tile.height);
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return null;
  pattern.setTransform(new DOMMatrix().rotateSelf(p.angle || 0).scaleSelf(t.w / tile.width, t.h / tile.height));
  if (patterns.size > 200) patterns.clear();
  patterns.set(key, pattern);
  return pattern;
}

let patched = false;

type Raw = {
  _data?: { strokeAlign?: StrokeAlign; pattern?: PatternFill; softMask?: boolean; maskSource?: boolean; widths?: WidthPoint[]; extra?: ExtraPaint[] };
  _visible: boolean;
  _opacity: number;
  _blendMode: string;
  _children?: Raw[];
  _style: { _values: Record<string, unknown> };
  _matrix: paper.Matrix;
  _project: { _updateVersion: number };
  _updateVersion: number;
  getStrokeColor(): paper.Color | null;
  getStrokeWidth(): number;
  getStrokeCap(): CanvasLineCap;
  getStrokeJoin(): CanvasLineJoin;
  getMiterLimit(): number;
  getDashArray(): number[];
  getDashOffset(): number;
  getFillRule(): CanvasFillRule;
  getPathData(matrix?: paper.Matrix | null, precision?: number): string;
  getStrokeBounds(): paper.Rectangle;
  length: number;
  closed: boolean;
  getPointAt(offset: number): paper.Point | null;
  getNormalAt(offset: number): paper.Point | null;
  draw(ctx: CanvasRenderingContext2D, ...rest: unknown[]): void;
};

export function installPaint(scope: paper.PaperScope) {
  if (patched) return;
  patched = true;
  const proto = scope.Item.prototype as unknown as Raw;
  const prev = proto.draw;
  const Base = (scope as unknown as { Base: new (o: object) => object }).Base;
  const PathItem = scope.PathItem as unknown as { prototype: object };
  const PathClass = scope.Path as unknown as new () => object;

  function drawSoftMask(this: Raw, ctx: CanvasRenderingContext2D, rest: unknown[]) {
    const kids = this._children ?? [];
    const mask = kids.find((k) => k._data?.maskSource);
    const dummy = document.createElement("canvas").getContext("2d")!;
    dummy.setTransform(ctx.getTransform());
    prev.call(this, dummy, ...rest);
    if (!mask) return;
    const t = ctx.getTransform();
    const scale = Math.hypot(t.a, t.b) || 1;
    const b = this.getStrokeBounds();
    if (!b.width || !b.height) return;
    const k = Math.min(scale, 4096 / Math.max(b.width, b.height));
    const w = Math.max(1, Math.ceil(b.width * k));
    const h = Math.max(1, Math.ceil(b.height * k));
    const m = new scope.Matrix().scale(k).translate(-b.x, -b.y);
    const layer = (items: Raw[]) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const c = canvas.getContext("2d")!;
      (m as unknown as { applyToContext(c: CanvasRenderingContext2D): void }).applyToContext(c);
      for (const item of items) {
        const visible = item._visible;
        item._visible = true;
        item.draw(c, new Base({ matrices: [m] }));
        item._visible = visible;
      }
      return canvas;
    };
    const content = layer(kids.filter((kid) => kid !== mask));
    const shades = layer([mask]);
    const cctx = content.getContext("2d")!;
    const cd = cctx.getImageData(0, 0, w, h);
    const md = shades.getContext("2d")!.getImageData(0, 0, w, h).data;
    for (let i = 0; i < cd.data.length; i += 4) {
      const lum = ((0.2126 * md[i] + 0.7152 * md[i + 1] + 0.0722 * md[i + 2]) / 255) * (md[i + 3] / 255);
      cd.data[i + 3] = cd.data[i + 3] * lum;
    }
    cctx.putImageData(cd, 0, 0);
    ctx.save();
    ctx.globalAlpha *= this._opacity;
    ctx.drawImage(content, b.x, b.y, b.width, b.height);
    ctx.restore();
  }

  proto.draw = function (this: Raw, ctx, ...rest) {
    const data = this._data;
    if (data && (data as { operand?: boolean }).operand) {
      const dummy = document.createElement("canvas").getContext("2d")!;
      dummy.setTransform(ctx.getTransform());
      return prev.call(this, dummy, ...rest);
    }
    if (data?.softMask && this._visible && this._opacity > 0) return drawSoftMask.call(this, ctx, rest);
    const align = data?.strokeAlign && data.strokeAlign !== "center" ? data.strokeAlign : null;
    const pattern = data?.pattern;
    const widths = data?.widths?.length && this instanceof PathClass ? data.widths : null;
    const extra = data?.extra?.length && this instanceof (PathItem as unknown as new () => object) && this._visible && this._opacity > 0 ? data.extra : null;
    if (extra) {
      const shape = new Path2D(this.getPathData(null, 3));
      const rule = this.getFillRule() || "nonzero";
      ctx.save();
      (this._matrix as unknown as { applyToContext(c: CanvasRenderingContext2D): void }).applyToContext(ctx);
      const alpha = ctx.globalAlpha * this._opacity;
      for (const x of extra) {
        ctx.save();
        ctx.translate(x.dx || 0, x.dy || 0);
        ctx.globalAlpha = alpha * Math.max(0, Math.min(1, x.opacity));
        if (x.kind === "fill") {
          ctx.fillStyle = x.color;
          ctx.fill(shape, rule);
        } else {
          ctx.strokeStyle = x.color;
          ctx.lineWidth = Math.max(0, x.width);
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.stroke(shape);
        }
        ctx.restore();
      }
      ctx.restore();
    }
    if ((!align && !pattern && !widths) || !(this instanceof (PathItem as unknown as new () => object)) || !this._visible || this._opacity === 0) return prev.call(this, ctx, ...rest);
    const values = this._style._values;
    const stroke = this.getStrokeColor();
    const width = this.getStrokeWidth();
    const saved = values.strokeColor;
    values.strokeColor = null;
    try {
      prev.call(this, ctx, ...rest);
    } finally {
      values.strokeColor = saved;
    }
    const path = new Path2D(this.getPathData(null, 3));
    const rule = this.getFillRule() || "nonzero";
    ctx.save();
    (this._matrix as unknown as { applyToContext(c: CanvasRenderingContext2D): void }).applyToContext(ctx);
    ctx.globalAlpha *= this._opacity;
    if (this._blendMode && this._blendMode !== "normal") ctx.globalCompositeOperation = this._blendMode as GlobalCompositeOperation;
    if (pattern) {
      const t = ctx.getTransform();
      const pat = canvasPattern(ctx, pattern, Math.hypot(t.a, t.b) || 1);
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fill(path, rule);
      }
    }
    if (stroke && width > 0 && widths) {
      const outline = new Path2D(outlineData(widthOutline(this, widths, width)));
      ctx.fillStyle = (stroke as unknown as { toCanvasStyle(c: CanvasRenderingContext2D): string | CanvasGradient }).toCanvasStyle(ctx);
      ctx.fill(outline, this.closed ? "evenodd" : "nonzero");
    } else if (stroke && width > 0) {
      ctx.save();
      if (align === "inside") ctx.clip(path, rule);
      else if (align === "outside") {
        const outside = new Path2D();
        outside.rect(-1e7, -1e7, 2e7, 2e7);
        outside.addPath(path);
        ctx.clip(outside, "evenodd");
      }
      ctx.lineWidth = align ? width * 2 : width;
      ctx.strokeStyle = (stroke as unknown as { toCanvasStyle(c: CanvasRenderingContext2D): string | CanvasGradient }).toCanvasStyle(ctx);
      ctx.lineCap = this.getStrokeCap();
      ctx.lineJoin = this.getStrokeJoin();
      ctx.miterLimit = this.getMiterLimit();
      ctx.setLineDash(this.getDashArray() ?? []);
      ctx.lineDashOffset = this.getDashOffset() ?? 0;
      ctx.stroke(path);
      ctx.restore();
    }
    ctx.restore();
  } as Raw["draw"];
}

let idCount = 0;

function defsOf(doc: XMLDocument, root: Element): Element {
  let defs = Array.from(root.children).find((c) => c.localName === "defs") ?? null;
  if (!defs) {
    defs = doc.createElementNS(SVG_NS, "defs");
    root.insertBefore(defs, root.firstChild);
  }
  return defs;
}

function parseData(el: Element): Record<string, unknown> | null {
  try {
    return JSON.parse(el.getAttribute("data-paper-data") ?? "null");
  } catch {
    return null;
  }
}

export function exportPaint(doc: XMLDocument, root: Element) {
  const stamp = (++idCount).toString(36);
  let k = 0;
  for (const el of Array.from(root.querySelectorAll("[data-paper-data]"))) {
    const data = parseData(el) as { strokeAlign?: StrokeAlign; pattern?: PatternFill; paint?: PaintExport; softMask?: boolean; extra?: ExtraPaint[] } | null;
    if (!data) continue;
    if ((data as { operand?: boolean }).operand) {
      el.setAttribute("visibility", "hidden");
      continue;
    }
    if (data.softMask) {
      const src = Array.from(el.children).find((c) => (parseData(c) as { maskSource?: boolean } | null)?.maskSource);
      if (!src) continue;
      const id = `fw-mask-${stamp}-${++k}`;
      const mask = doc.createElementNS(SVG_NS, "mask");
      mask.setAttribute("id", id);
      mask.setAttribute("maskUnits", "userSpaceOnUse");
      mask.setAttribute("x", "-100000");
      mask.setAttribute("y", "-100000");
      mask.setAttribute("width", "200000");
      mask.setAttribute("height", "200000");
      const copy = src.cloneNode(true) as Element;
      copy.removeAttribute("id");
      copy.removeAttribute("visibility");
      mask.appendChild(copy);
      defsOf(doc, root).appendChild(mask);
      src.setAttribute("visibility", "hidden");
      el.setAttribute("mask", `url(#${id})`);
      continue;
    }
    const align = data.strokeAlign && data.strokeAlign !== "center" ? data.strokeAlign : null;
    const extras = data.extra ?? [];
    if ((!align && !data.pattern && !data.paint?.outline && !extras.length) || !data.paint) continue;
    const paint = data.paint;
    const custom = Boolean(align || data.pattern || paint.outline);
    const group = doc.createElementNS(SVG_NS, "g");
    group.setAttribute("data-fw-paint", "1");
    if (el.getAttribute("id")) {
      group.setAttribute("id", el.getAttribute("id")!);
      el.removeAttribute("id");
    }
    group.setAttribute("data-paper-data", el.getAttribute("data-paper-data")!);
    el.removeAttribute("data-paper-data");
    el.parentNode!.replaceChild(group, el);
    const bare = () => {
      const c = el.cloneNode(false) as Element;
      for (const attr of ["id", "filter", "data-paper-data", "fill-opacity", "data-fw-base"]) c.removeAttribute(attr);
      return c;
    };
    for (const x of extras) {
      const c = bare();
      for (const attr of ["stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "fill", "fill-rule"]) c.removeAttribute(attr);
      if (x.dx || x.dy) c.setAttribute("transform", `translate(${n(x.dx || 0)} ${n(x.dy || 0)})${el.getAttribute("transform") ? ` ${el.getAttribute("transform")}` : ""}`);
      if (x.kind === "fill") {
        c.setAttribute("fill", x.color);
        c.setAttribute("fill-rule", paint.rule);
        if (x.opacity < 1) c.setAttribute("fill-opacity", n(x.opacity));
        c.setAttribute("stroke", "none");
      } else {
        c.setAttribute("fill", "none");
        c.setAttribute("stroke", x.color);
        c.setAttribute("stroke-width", n(x.width));
        c.setAttribute("stroke-linejoin", "round");
        c.setAttribute("stroke-linecap", "round");
        if (x.opacity < 1) c.setAttribute("stroke-opacity", n(x.opacity));
      }
      group.appendChild(c);
    }
    el.setAttribute("data-fw-base", "1");
    group.appendChild(el);
    if (!custom) continue;
    for (const attr of ["stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity"]) el.removeAttribute(attr);
    el.setAttribute("stroke", "none");
    if (data.pattern) {
      const t = tileSvg(data.pattern);
      const id = `fw-pattern-${stamp}-${++k}`;
      const markup = `<svg xmlns="${SVG_NS}"><pattern id="${id}" patternUnits="userSpaceOnUse" width="${n(t.w)}" height="${n(t.h)}"${data.pattern.angle ? ` patternTransform="rotate(${n(data.pattern.angle)})"` : ""}>${t.body}</pattern></svg>`;
      const parsed = new DOMParser().parseFromString(markup, "image/svg+xml").documentElement.firstElementChild;
      if (parsed) defsOf(doc, root).appendChild(doc.importNode(parsed, true));
      const overlay = bare();
      overlay.setAttribute("fill", `url(#${id})`);
      group.appendChild(overlay);
    }
    if (paint.stroke && paint.outline) {
      const shape = bare();
      shape.setAttribute("d", paint.outline);
      shape.setAttribute("fill", paint.stroke);
      if (paint.strokeOpacity < 1) shape.setAttribute("fill-opacity", n(paint.strokeOpacity));
      shape.setAttribute("fill-rule", "evenodd");
      shape.setAttribute("stroke", "none");
      group.appendChild(shape);
    } else if (paint.stroke && paint.width > 0) {
      const line = bare();
      line.setAttribute("fill", "none");
      line.setAttribute("stroke", paint.stroke);
      if (paint.strokeOpacity < 1) line.setAttribute("stroke-opacity", n(paint.strokeOpacity));
      line.setAttribute("stroke-width", n(align ? paint.width * 2 : paint.width));
      line.setAttribute("stroke-linecap", paint.cap);
      line.setAttribute("stroke-linejoin", paint.join);
      line.setAttribute("stroke-miterlimit", n(paint.miter));
      if (paint.dash.length) line.setAttribute("stroke-dasharray", paint.dash.map(n).join(","));
      if (paint.dashOffset) line.setAttribute("stroke-dashoffset", n(paint.dashOffset));
      const outline = el.cloneNode(false) as Element;
      for (const attr of ["id", "filter", "data-paper-data", "fill", "stroke", "opacity", "fill-opacity", "style"]) outline.removeAttribute(attr);
      if (align === "inside") {
        const id = `fw-clip-${stamp}-${++k}`;
        const clip = doc.createElementNS(SVG_NS, "clipPath");
        clip.setAttribute("id", id);
        outline.setAttribute("clip-rule", paint.rule);
        clip.appendChild(outline);
        defsOf(doc, root).appendChild(clip);
        line.setAttribute("clip-path", `url(#${id})`);
      } else if (align === "outside") {
        const id = `fw-out-${stamp}-${++k}`;
        const mask = doc.createElementNS(SVG_NS, "mask");
        mask.setAttribute("id", id);
        mask.setAttribute("maskUnits", "userSpaceOnUse");
        for (const [a, v] of [
          ["x", "-100000"],
          ["y", "-100000"],
          ["width", "200000"],
          ["height", "200000"]
        ])
          mask.setAttribute(a, v);
        const white = doc.createElementNS(SVG_NS, "rect");
        for (const [a, v] of [
          ["x", "-100000"],
          ["y", "-100000"],
          ["width", "200000"],
          ["height", "200000"],
          ["fill", "white"]
        ])
          white.setAttribute(a, v);
        outline.setAttribute("fill", "black");
        outline.setAttribute("fill-rule", paint.rule);
        mask.append(white, outline);
        defsOf(doc, root).appendChild(mask);
        line.setAttribute("mask", `url(#${id})`);
      }
      group.appendChild(line);
    }
  }
}

export function importPaint(root: Element) {
  for (const group of Array.from(root.querySelectorAll("g[data-fw-paint]"))) {
    const base = Array.from(group.children).find((c) => c.hasAttribute("data-fw-base")) ?? group.firstElementChild;
    if (!base) continue;
    base.removeAttribute("data-fw-base");
    const data = parseData(group) as { paint?: PaintExport } | null;
    if (group.getAttribute("id")) base.setAttribute("id", group.getAttribute("id")!);
    if (group.getAttribute("data-paper-data")) base.setAttribute("data-paper-data", group.getAttribute("data-paper-data")!);
    const p = data?.paint;
    if (p?.stroke) {
      base.setAttribute("stroke", p.stroke);
      if (p.strokeOpacity < 1) base.setAttribute("stroke-opacity", n(p.strokeOpacity));
      base.setAttribute("stroke-width", n(p.width));
      base.setAttribute("stroke-linecap", p.cap);
      base.setAttribute("stroke-linejoin", p.join);
      base.setAttribute("stroke-miterlimit", n(p.miter));
      if (p.dash.length) base.setAttribute("stroke-dasharray", p.dash.map(n).join(","));
      if (p.dashOffset) base.setAttribute("stroke-dashoffset", n(p.dashOffset));
    }
    group.replaceWith(base);
  }
  for (const el of Array.from(root.querySelectorAll("[mask]"))) {
    if ((parseData(el) as { softMask?: boolean } | null)?.softMask) el.removeAttribute("mask");
  }
}
