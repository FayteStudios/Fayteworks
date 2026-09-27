import { blankDrawing, sanitizeSvg } from "../vector/svg";

const SVG_NS = "http://www.w3.org/2000/svg";
const INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape";

function parse(svg: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  return root && root.nodeName === "svg" && !doc.querySelector("parsererror") ? (root as unknown as SVGSVGElement) : null;
}

function layersOf(root: SVGSVGElement): Element[] {
  return Array.from(root.children).filter((el) => el.localName === "g");
}

export function layerLabel(el: Element, index: number): string {
  return el.getAttributeNS(INKSCAPE_NS, "label") || el.getAttribute("inkscape:label") || el.getAttribute("id") || `Layer ${index + 1}`;
}

function renameIds(root: Element, rename: (id: string) => string | null) {
  const map = new Map<string, string>();
  for (const el of [root, ...Array.from(root.querySelectorAll("[id]"))]) {
    const id = el.getAttribute("id");
    const next = id ? rename(id) : null;
    if (id && next && next !== id) {
      map.set(id, next);
      el.setAttribute("id", next);
    }
  }
  if (!map.size) return;
  const swap = (value: string) => value.replace(/url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g, (m, id) => (map.has(id) ? `url(#${map.get(id)})` : m)).replace(/^#(.+)$/, (m, id) => (map.has(id) ? `#${map.get(id)}` : m));
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === "id") continue;
      if (attr.value.includes("#")) el.setAttributeNS(attr.namespaceURI, attr.name, swap(attr.value));
    }
  }
}

export function framesFromLayers(svg: string): { svg: string; label: string }[] {
  const root = parse(svg);
  if (!root) return [];
  const layers = layersOf(root);
  if (layers.length < 2) return [{ svg: sanitizeSvg(svg), label: "Frame 1" }];
  return layers.map((layer, i) => {
    const copy = root.cloneNode(true) as SVGSVGElement;
    const copyLayers = layersOf(copy);
    copyLayers.forEach((g, j) => {
      if (j !== i) g.remove();
    });
    const kept = copyLayers[i];
    const n = /^frame-(\d+)$/.exec(kept.getAttribute("id") ?? "")?.[1];
    if (n) renameIds(kept, (id) => (id.startsWith(`f${n}-`) ? id.slice(`f${n}-`.length) : id === `frame-${n}` ? null : id));
    kept.removeAttribute("display");
    const style = kept.getAttribute("style");
    if (style) kept.setAttribute("style", style.replace(/display\s*:\s*none\s*;?/gi, ""));
    return { svg: sanitizeSvg(new XMLSerializer().serializeToString(copy)), label: layerLabel(layer, i) };
  });
}

export function layersFromFrames(frames: string[]): string {
  const first = parse(frames[0] ?? blankDrawing());
  const doc = document.implementation.createDocument(SVG_NS, "svg", null);
  const root = doc.documentElement;
  root.setAttribute("xmlns:inkscape", INKSCAPE_NS);
  for (const attr of ["viewBox", "width", "height"]) {
    const value = first?.getAttribute(attr);
    if (value) root.setAttribute(attr, value);
  }
  frames.forEach((frame, i) => {
    const svg = parse(frame);
    if (!svg) return;
    const g = doc.createElementNS(SVG_NS, "g");
    g.setAttribute("id", `frame-${i + 1}`);
    g.setAttributeNS(INKSCAPE_NS, "inkscape:groupmode", "layer");
    g.setAttributeNS(INKSCAPE_NS, "inkscape:label", `Frame ${i + 1}`);
    if (i > 0) g.setAttribute("style", "display:none");
    for (const child of Array.from(svg.childNodes)) g.appendChild(doc.importNode(child, true));
    renameIds(g, (id) => (id === `frame-${i + 1}` ? null : `f${i + 1}-${id}`));
    root.appendChild(g);
  });
  return new XMLSerializer().serializeToString(root);
}

export function blankFrameLike(svg: string): string {
  const root = parse(svg);
  const box = root?.getAttribute("viewBox")?.split(/[\s,]+/).map(Number);
  return box && box.length === 4 && box.every(Number.isFinite) ? blankDrawing(box[2], box[3]) : blankDrawing();
}

export function frameAt(step: number, count: number, pingpong: boolean): number {
  if (count < 2) return 0;
  if (!pingpong) return step % count;
  const period = 2 * count - 2;
  const k = step % period;
  return k < count ? k : period - k;
}
