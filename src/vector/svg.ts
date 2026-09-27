import { scopeCss } from "../site/customHtml";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

const FORBIDDEN = new Set(["script", "foreignobject", "iframe", "object", "embed", "audio", "video", "canvas", "handler", "listener"]);
const COLOR_PROPS = ["fill", "stroke", "stop-color", "flood-color", "lighting-color", "color"];

const isSafeHref = (value: string) => /^#|^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(value.trim()) || /^https?:\/\//i.test(value.trim());

function parse(svg: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.querySelector("parsererror") || root.localName !== "svg") throw new Error("That file isn't a readable SVG drawing.");
  return root as unknown as SVGSVGElement;
}

const serialize = (el: Element) => new XMLSerializer().serializeToString(el);

export function sanitizeSvg(svg: string): string {
  const root = parse(svg);
  for (const el of Array.from(root.querySelectorAll("*"))) {
    const name = el.localName.toLowerCase();
    if (FORBIDDEN.has(name)) {
      el.remove();
      continue;
    }
    if ((name === "set" || name.startsWith("animate")) && /href/i.test(el.getAttribute("attributeName") ?? "")) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const attrName = attr.name.toLowerCase();
      if (attrName.startsWith("on")) el.removeAttributeNode(attr);
      else if ((attrName === "href" || attrName === "xlink:href") && !isSafeHref(attr.value)) el.removeAttributeNode(attr);
      else if ((attrName === "href" || attrName === "xlink:href") && /^https?:/i.test(attr.value) && name !== "a") el.removeAttributeNode(attr);
    }
    if ((name === "image" || name === "use" || name === "feimage") && !el.getAttribute("href") && !el.getAttribute("xlink:href")) el.remove();
  }
  for (const attr of Array.from(root.attributes)) if (attr.name.toLowerCase().startsWith("on")) root.removeAttributeNode(attr);
  return serialize(root);
}

const NAMED: Record<string, string> = { black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00", gray: "#808080", grey: "#808080", orange: "#ffa500", purple: "#800080" };

export function normalizeColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  const rgb = v.match(/^rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*\)$/);
  if (rgb) return `#${rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`;
  return NAMED[v] ?? null;
}

export function drawingColors(svg: string): { color: string; count: number }[] {
  let root: SVGSVGElement;
  try {
    root = parse(svg);
  } catch {
    return [];
  }
  const counts = new Map<string, number>();
  const note = (value: string | null | undefined) => {
    const c = value ? normalizeColor(value) : null;
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  };
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    if (el.closest("metadata") || el.localName === "namedview") continue;
    for (const prop of COLOR_PROPS) note(el.getAttribute(prop));
    const style = el.getAttribute("style") ?? "";
    for (const m of style.matchAll(/(?:^|;)\s*(fill|stroke|stop-color|flood-color|color)\s*:\s*([^;]+)/gi)) note(m[2]);
  }
  for (const style of Array.from(root.querySelectorAll("style"))) {
    for (const m of (style.textContent ?? "").matchAll(/(?:fill|stroke|stop-color|color)\s*:\s*([^;}]+)/gi)) note(m[1]);
  }
  return [...counts.entries()].map(([color, count]) => ({ color, count })).sort((a, b) => b.count - a.count);
}

export interface DrawingLayer {
  id: string;
  label: string;
  kind: "text" | "shape" | "group";
  text: string;
}

const GENERATED_ID = /^(path|g|rect|circle|ellipse|text|tspan|layer|svg|defs|lineargradient|radialgradient|stop|image|use|polygon|polyline|line|clippath|mask|filter|namedview|metadata|flowroot|flowregion|flowpara|pattern|marker|symbol|title|desc|a|switch|cls|st|fe[a-z]+)[-_]?\d+$/i;

function labelOf(el: Element): string | null {
  const label = el.getAttribute("inkscape:label") ?? el.getAttributeNS("http://www.inkscape.org/namespaces/inkscape", "label");
  if (label) return label;
  const id = el.getAttribute("id");
  return id && !GENERATED_ID.test(id) ? id.replace(/[_-]+/g, " ") : null;
}

export function drawingLayers(svg: string): DrawingLayer[] {
  let root: SVGSVGElement;
  try {
    root = parse(svg);
  } catch {
    return [];
  }
  const layers: DrawingLayer[] = [];
  for (const el of Array.from(root.querySelectorAll("[id]"))) {
    if (el.closest("defs, metadata, clipPath, mask, pattern, marker, symbol") || el.localName === "namedview" || el.localName === "tspan") continue;
    const id = el.getAttribute("id")!;
    const label = labelOf(el);
    if (!label) continue;
    const kind = el.localName === "text" ? "text" : el.localName === "g" ? "group" : "shape";
    layers.push({ id, label, kind, text: kind === "text" ? textLines(el).join("\n") : "" });
  }
  return layers;
}

function textLines(text: Element): string[] {
  const onPath = Array.from(text.children).find((c) => c.localName === "textPath");
  if (onPath) return [onPath.textContent ?? ""];
  const spans = Array.from(text.children).filter((c) => c.localName === "tspan");
  return spans.length ? spans.map((s) => s.textContent ?? "") : [text.textContent ?? ""];
}

function setTextLines(text: Element, value: string) {
  const onPath = Array.from(text.children).find((c) => c.localName === "textPath");
  if (onPath) {
    onPath.textContent = value.replace(/\s*\n\s*/g, " ");
    return;
  }
  const lines = value.split("\n");
  const spans = Array.from(text.children).filter((c) => c.localName === "tspan");
  if (!spans.length) {
    text.textContent = value;
    return;
  }
  spans.forEach((span, i) => {
    span.textContent = i === spans.length - 1 ? lines.slice(i).join(" ") : (lines[i] ?? "");
  });
}

export const layerTextKey = (id: string) => `layer:${id}:text`;
export const layerHiddenKey = (id: string) => `layer:${id}:hidden`;

export type LayerEffect = "draw" | "fade" | "pop" | "spin" | "float" | "pulse" | "sway";
export type LayerTrigger = "view" | "hover" | "loop";

export interface LayerAnimation {
  layer: string;
  effect: LayerEffect;
  trigger: LayerTrigger;
  speed: "fast" | "normal" | "slow";
  delay: number;
}

export const LAYER_EFFECTS: { value: LayerEffect; label: string; entrance: boolean }[] = [
  { value: "draw", label: "Draw on (outlines, then fill)", entrance: true },
  { value: "fade", label: "Fade in", entrance: true },
  { value: "pop", label: "Pop in", entrance: true },
  { value: "spin", label: "Spin", entrance: false },
  { value: "float", label: "Float", entrance: false },
  { value: "pulse", label: "Pulse", entrance: false },
  { value: "sway", label: "Sway", entrance: false }
];

const SPEED = { fast: 0.6, normal: 1.2, slow: 2.4 };
const SHAPES = ":is(path, circle, rect, ellipse, line, polyline, polygon)";

function animationCss(scope: string, animations: LayerAnimation[]): string {
  const rules: string[] = [];
  animations.forEach((a, i) => {
    const effect = LAYER_EFFECTS.find((e) => e.value === a.effect);
    if (!effect) return;
    const root = `[data-vector="${scope}"]`;
    const sel = `${root} [data-fw-anim="${i}"]`;
    const base = SPEED[a.speed] ?? SPEED.normal;
    const duration = effect.entrance ? base : a.effect === "spin" ? base * 4 : base * 2.5;
    const iteration = effect.entrance ? (a.trigger === "loop" ? "infinite" : "1") : "infinite";
    const direction = effect.entrance && a.trigger === "loop" ? "alternate" : a.effect === "float" || a.effect === "pulse" ? "alternate" : "normal";
    const timing = a.effect === "spin" ? "linear" : "ease-in-out";
    const animation = `fw-${a.effect} ${duration}s ${timing} ${Math.max(0, a.delay || 0)}s ${iteration} ${direction} both`;
    const targets = (within: string) => {
      const layer = `${within} [data-fw-anim="${i}"]`;
      return a.effect === "draw" ? `${layer}${SHAPES}, ${layer} ${SHAPES}` : layer;
    };
    rules.push(`${sel} { transform-box: fill-box; transform-origin: center; }`);
    if (a.effect === "draw") rules.push(`${targets(root)} { stroke-dasharray: 1; }`);
    if (a.trigger === "hover") {
      rules.push(`${targets(`${root}:hover`)} { animation: ${animation}; }`);
    } else {
      rules.push(`${targets(root)} { animation: ${animation}; }`);
      if (a.trigger === "view") rules.push(`.anim-ready ${root}:not(.is-playing) [data-fw-anim="${i}"], .anim-ready ${root}:not(.is-playing) [data-fw-anim="${i}"] * { animation-play-state: paused !important; }`);
    }
  });
  if (!rules.length) return "";
  return `${rules.join("\n")}\n@media (prefers-reduced-motion: reduce) { [data-vector="${scope}"] [data-fw-anim], [data-vector="${scope}"] [data-fw-anim] * { animation: none !important; stroke-dasharray: none !important; } }`;
}

export interface RenderOptions {
  scope: string;
  animations?: LayerAnimation[];
  colorMap?: Record<string, string>;
  values?: Record<string, unknown>;
  fit?: "contain" | "cover" | "stretch";
}

const renderCache = new Map<string, string>();

export function renderSvg(svg: string, options: RenderOptions): string {
  const layerValues = Object.entries(options.values ?? {}).filter(([k]) => k.startsWith("layer:"));
  const cacheKey = JSON.stringify([svg, options.scope, options.colorMap, layerValues, options.fit, options.animations]);
  const cached = renderCache.get(cacheKey);
  if (cached !== undefined) return cached;
  let out = "";
  try {
    out = render(svg, options);
  } catch {
    out = "";
  }
  if (renderCache.size > 200) renderCache.clear();
  renderCache.set(cacheKey, out);
  return out;
}

function render(svg: string, { scope, colorMap = {}, values = {}, fit = "contain", animations = [] }: RenderOptions): string {
  const root = parse(sanitizeSvg(svg));
  for (const el of Array.from(root.querySelectorAll("metadata, namedview, title"))) el.remove();

  for (const el of Array.from(root.querySelectorAll("[id]"))) {
    const id = el.getAttribute("id")!;
    const text = values[layerTextKey(id)];
    if (typeof text === "string" && text !== "" && el.localName === "text") setTextLines(el, text);
    if (values[layerHiddenKey(id)] === true) el.setAttribute("display", "none");
  }

  const ns = "http://www.w3.org/2000/svg";
  const playing: LayerAnimation[] = [];
  for (const anim of animations) {
    const index = playing.length;
    let target: Element | null = null;
    if (anim.layer === "*") {
      const wrapper = root.ownerDocument.createElementNS(ns, "g");
      for (const child of Array.from(root.childNodes)) if (!(child instanceof Element && ["defs", "style"].includes(child.localName))) wrapper.appendChild(child);
      root.appendChild(wrapper);
      target = wrapper;
    } else {
      const el = root.querySelector(`[id="${CSS.escape(anim.layer)}"]`);
      if (!el || el.closest("defs")) continue;
      const wrapper = root.ownerDocument.createElementNS(ns, "g");
      el.replaceWith(wrapper);
      wrapper.appendChild(el);
      target = wrapper;
    }
    target.setAttribute("data-fw-anim", String(index));
    if (anim.effect === "draw") {
      for (const shape of Array.from(target.querySelectorAll("path, circle, rect, ellipse, line, polyline, polygon"))) shape.setAttribute("pathLength", "1");
    }
    playing.push(anim);
  }

  const prefix = `v${scope.replace(/[^a-zA-Z0-9_-]/g, "")}-`;
  const ids = new Set(Array.from(root.querySelectorAll("[id]")).map((el) => el.getAttribute("id")!));
  const rewriteRefs = (value: string) =>
    value.replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, (m, q: string, id: string) => (ids.has(id) ? `url(${q}#${prefix}${id}${q})` : m));
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === "id") attr.value = prefix + attr.value;
      else if ((attr.name === "href" || attr.name === "xlink:href") && attr.value.startsWith("#") && ids.has(attr.value.slice(1))) attr.value = `#${prefix}${attr.value.slice(1)}`;
      else if (attr.value.includes("url(")) attr.value = rewriteRefs(attr.value);
    }
  }

  const linked = Object.entries(colorMap).filter(([, token]) => /^var\(--[a-z-]+\)$/.test(token));
  if (linked.length) {
    const tokenFor = (value: string | null) => {
      const c = value ? normalizeColor(value) : null;
      return c ? linked.find(([color]) => color === c)?.[1] : undefined;
    };
    for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
      if (!(el instanceof SVGElement)) continue;
      for (const prop of COLOR_PROPS) {
        const token = tokenFor(el.getAttribute(prop));
        if (token) {
          el.removeAttribute(prop);
          el.style.setProperty(prop, token);
        }
        const styled = tokenFor(el.style.getPropertyValue(prop));
        if (styled) el.style.setProperty(prop, styled);
      }
    }
    for (const style of Array.from(root.querySelectorAll("style"))) {
      style.textContent = (style.textContent ?? "").replace(/(fill|stroke|stop-color|flood-color|color)(\s*:\s*)([^;}]+)/gi, (m, prop: string, sep: string, value: string) => {
        const token = tokenFor(value);
        return token ? `${prop}${sep}${token}` : m;
      });
    }
  }

  for (const style of Array.from(root.querySelectorAll("style"))) {
    let css = style.textContent ?? "";
    for (const id of ids) css = css.split(`#${id}`).join(`#${prefix}${id}`);
    style.textContent = scopeCss(css, `[data-vector="${scope}"]`);
  }

  const motion = animationCss(scope, playing);
  if (motion) {
    const style = root.ownerDocument.createElementNS(ns, "style");
    style.textContent = motion;
    root.appendChild(style);
  }

  if (!root.getAttribute("viewBox")) {
    const w = parseFloat(root.getAttribute("width") ?? "");
    const h = parseFloat(root.getAttribute("height") ?? "");
    if (w > 0 && h > 0) root.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }
  root.setAttribute("width", "100%");
  root.setAttribute("height", "100%");
  root.setAttribute("preserveAspectRatio", fit === "cover" ? "xMidYMid slice" : fit === "stretch" ? "none" : "xMidYMid meet");
  root.setAttribute("focusable", "false");
  root.setAttribute("aria-hidden", "true");
  if (!root.getAttribute("xmlns")) root.setAttribute("xmlns", SVG_NS);
  if (root.querySelector("[*|href]") && !root.getAttribute("xmlns:xlink")) root.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", XLINK_NS);
  return serialize(root);
}

export function blankDrawing(width = 400, height = 300): string {
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"></svg>`;
}

export const STARTER_DRAWING = `<svg xmlns="${SVG_NS}" viewBox="0 0 400 300" width="400" height="300">
  <circle id="Sun" cx="290" cy="110" r="56" fill="#e0633a"/>
  <path id="Hills" d="M0 300 L0 210 Q90 150 180 205 Q260 250 330 190 Q370 160 400 175 L400 300 Z" fill="#1d1b18"/>
  <text id="Caption" x="24" y="56" font-family="Georgia, serif" font-size="32" fill="#1d1b18"><tspan x="24" y="56">Draw anything</tspan></text>
</svg>`;
