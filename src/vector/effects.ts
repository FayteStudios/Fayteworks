import type paper from "paper/dist/paper-core";

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  color: string;
  opacity: number;
}

export interface Effects {
  shadow?: Shadow;
  inner?: Shadow;
  glow?: { blur: number; color: string; opacity: number };
  blur?: number;
}

export const DEFAULT_SHADOW: Shadow = { x: 4, y: 6, blur: 8, color: "#000000", opacity: 0.35 };
export const DEFAULT_INNER: Shadow = { x: 2, y: 3, blur: 4, color: "#000000", opacity: 0.4 };
export const DEFAULT_GLOW = { blur: 10, color: "#ffd84d", opacity: 0.9 };

export function hasEffects(fx: Effects | null | undefined): fx is Effects {
  return Boolean(fx && (fx.shadow || fx.inner || fx.glow || fx.blur));
}

export function effectsReach(fx: Effects | null | undefined): number {
  if (!hasEffects(fx)) return 0;
  const s = fx.shadow ? Math.max(Math.abs(fx.shadow.x), Math.abs(fx.shadow.y)) + fx.shadow.blur * 1.5 : 0;
  const g = fx.glow ? fx.glow.blur * 1.5 : 0;
  const b = fx.blur ? fx.blur * 1.5 : 0;
  return Math.ceil(Math.max(s, g, b));
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function effectsId(fx: Effects): string {
  return `fx-${hash(JSON.stringify(fx))}`;
}

const num = (n: number) => String(Math.round(n * 1000) / 1000);

export function filterMarkup(fx: Effects, id: string, scale = 1, canvas = false): string {
  const parts: string[] = [];
  const merge: string[] = [];
  const sd = (blur: number) => num((Math.max(0, blur) / 2) * scale);
  if (fx.shadow) {
    const s = fx.shadow;
    parts.push(
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${sd(s.blur)}"/>`,
      `<feOffset dx="${num(s.x * scale)}" dy="${num(s.y * scale)}" result="fwShadowBlur"/>`,
      `<feFlood flood-color="${s.color}" flood-opacity="${num(s.opacity)}"/>`,
      `<feComposite in2="fwShadowBlur" operator="in" result="fwShadow"/>`
    );
    merge.push("fwShadow");
  }
  if (fx.glow) {
    const g = fx.glow;
    parts.push(
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${sd(g.blur)}" result="fwGlowBlur"/>`,
      `<feFlood flood-color="${g.color}" flood-opacity="${num(g.opacity)}"/>`,
      `<feComposite in2="fwGlowBlur" operator="in" result="fwGlow"/>`
    );
    merge.push("fwGlow", "fwGlow");
  }
  if (fx.blur) {
    parts.push(`<feGaussianBlur in="SourceGraphic" stdDeviation="${sd(fx.blur)}" result="fwBase"/>`);
    merge.push("fwBase");
  } else merge.push("SourceGraphic");
  if (fx.inner) {
    const s = fx.inner;
    parts.push(
      `<feFlood flood-color="${s.color}" flood-opacity="${num(s.opacity)}" result="fwInnerColour"/>`,
      `<feComposite in="fwInnerColour" in2="SourceAlpha" operator="out" result="fwInverse"/>`,
      `<feOffset dx="${num(s.x * scale)}" dy="${num(s.y * scale)}"/>`,
      `<feGaussianBlur stdDeviation="${sd(s.blur)}"/>`,
      `<feComposite in2="SourceAlpha" operator="in" result="fwInner"/>`
    );
    merge.push("fwInner");
  }
  const region = canvas ? `filterUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000"` : `x="-50%" y="-50%" width="200%" height="200%"`;
  return `<filter id="${id}" ${region} color-interpolation-filters="sRGB">${parts.join("")}<feMerge>${merge.map((m) => `<feMergeNode in="${m}"/>`).join("")}</feMerge></filter>`;
}

let host: SVGSVGElement | null = null;
const made = new Map<string, string>();

function canvasFilter(fx: Effects, scale: number): string {
  const key = `${JSON.stringify(fx)}@${Math.round(scale * 1000)}`;
  let id = made.get(key);
  if (id) return id;
  if (!host) {
    host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    document.body.appendChild(host);
  }
  if (made.size > 400) {
    host.innerHTML = "";
    made.clear();
  }
  id = `fw-canvas-${made.size}-${hash(key)}`;
  host.insertAdjacentHTML("beforeend", filterMarkup(fx, id, scale, true));
  made.set(key, id);
  return id;
}

let patched = false;

export function installEffects(scope: paper.PaperScope) {
  if (patched) return;
  patched = true;
  type Drawable = { _data?: { effects?: Effects }; _opacity: number; _visible: boolean; draw(ctx: CanvasRenderingContext2D, ...rest: unknown[]): void };
  const proto = scope.Item.prototype as unknown as Drawable;
  const draw = proto.draw;
  proto.draw = function (this: Drawable, ctx, ...rest) {
    const fx = this._data?.effects;
    if (!hasEffects(fx) || !this._visible || !("filter" in ctx)) return draw.call(this, ctx, ...rest);
    const t = ctx.getTransform();
    const scale = Math.hypot(t.a, t.b) || 1;
    const prevFilter = ctx.filter;
    const opacity = this._opacity;
    ctx.filter = `url(#${canvasFilter(fx, scale)})`;
    if (opacity === 1) this._opacity = 0.99999;
    try {
      draw.call(this, ctx, ...rest);
    } finally {
      this._opacity = opacity;
      ctx.filter = prevFilter;
    }
  };
}

export function exportEffects(doc: XMLDocument, root: Element) {
  const ns = "http://www.w3.org/2000/svg";
  const added = new Set<string>();
  let defs: Element | null = null;
  for (const el of Array.from(root.querySelectorAll("[data-paper-data]"))) {
    let data: { effects?: Effects };
    try {
      data = JSON.parse(el.getAttribute("data-paper-data")!);
    } catch {
      continue;
    }
    if (!hasEffects(data.effects)) continue;
    const id = effectsId(data.effects);
    el.setAttribute("filter", `url(#${id})`);
    if (added.has(id)) continue;
    added.add(id);
    if (!defs) {
      defs = Array.from(root.children).find((c) => c.localName === "defs") ?? null;
      if (!defs) {
        defs = doc.createElementNS(ns, "defs");
        root.insertBefore(defs, root.firstChild);
      }
    }
    const parsed = new DOMParser().parseFromString(`<svg xmlns="${ns}">${filterMarkup(data.effects, id)}</svg>`, "image/svg+xml");
    const filter = parsed.documentElement.firstElementChild;
    if (filter) defs.appendChild(doc.importNode(filter, true));
  }
}
