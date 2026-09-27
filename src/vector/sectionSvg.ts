import { getBlockDefinition } from "../blocks/registry";
import type { Rect } from "../model/responsive";
import type { Section } from "../model/types";
import { escapeRich } from "../site/richText";
import { sanitizeSvg } from "./svg";

const SVG_NS = "http://www.w3.org/2000/svg";
const INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape";
const SODIPODI_NS = "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
const SECTION_NS = "urn:fayteworks:section-svg";

export const SECTION_ART_PROP = "sectionArt";

export interface SectionSvgMeta {
  version: 1;
  sectionId: string;
  width: number;
  height: number;
  grid: { x: number; y: number };
  frames: Record<string, [number, number, number, number]>;
  paragraphs: Record<string, string[]>;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function editorSection(sectionId: string) {
  const wrapper = document.querySelector<HTMLElement>(`.editor-canvas [data-section="${CSS.escape(sectionId)}"]`);
  const sectionEl = wrapper?.querySelector<HTMLElement>(".site-section") ?? wrapper;
  const grid = wrapper?.querySelector<HTMLElement>(".site-grid");
  if (!wrapper || !sectionEl || !grid) throw new Error("This section isn't on the page being edited. Open its page first.");
  const box = sectionEl.getBoundingClientRect();
  const scale = box.width / Math.max(1, sectionEl.offsetWidth);
  return { wrapper, sectionEl, grid, box, scale };
}

function parseColor(value: string): { color: string; opacity: number } | null {
  const m = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (alpha <= 0.01) return null;
  const hex = `#${[m[1], m[2], m[3]].map((n) => Math.round(Number(n)).toString(16).padStart(2, "0")).join("")}`;
  return { color: hex, opacity: alpha };
}

async function dataUrlOf(src: string): Promise<string> {
  if (!src || src.startsWith("data:")) return src;
  try {
    const blob = await (await fetch(src)).blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return src;
  }
}

export async function exportSectionSvg(section: Section, physical?: { width: string; height: string }): Promise<{ svg: string; meta: SectionSvgMeta }> {
  const { sectionEl, grid, box, scale } = editorSection(section.id);
  const local = (r: DOMRect): [number, number, number, number] => [(r.left - box.left) / scale, (r.top - box.top) / scale, r.width / scale, r.height / scale];
  const round = (n: number) => Math.round(n * 100) / 100;
  const width = round(box.width / scale);
  const height = round(box.height / scale);
  const gridBox = local(grid.getBoundingClientRect());
  const meta: SectionSvgMeta = { version: 1, sectionId: section.id, width, height, grid: { x: round(gridBox[0]), y: round(gridBox[1]) }, frames: {}, paragraphs: {} };

  const doc = document.implementation.createDocument(SVG_NS, "svg", null);
  const root = doc.documentElement;
  root.setAttributeNS(XMLNS_NS, "xmlns:inkscape", INKSCAPE_NS);
  root.setAttributeNS(XMLNS_NS, "xmlns:sodipodi", SODIPODI_NS);
  root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  root.setAttribute("width", physical?.width ?? String(width));
  root.setAttribute("height", physical?.height ?? String(height));
  const el = (name: string, attrs: Record<string, string | number | undefined> = {}, parent: Element = root) => {
    const node = doc.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined) continue;
      if (k.startsWith("inkscape:")) node.setAttributeNS(INKSCAPE_NS, k, String(v));
      else if (k.startsWith("sodipodi:")) node.setAttributeNS(SODIPODI_NS, k, String(v));
      else node.setAttribute(k, String(v));
    }
    parent.appendChild(node);
    return node;
  };
  const metadata = el("metadata", { id: "fw-meta" });

  const bgLayer = el("g", { id: "fw-bg", "inkscape:label": "Section background (locked)", "inkscape:groupmode": "layer", "sodipodi:insensitive": "true" });
  const style = getComputedStyle(sectionEl);
  const bg = parseColor(style.backgroundColor) ?? parseColor(getComputedStyle(sectionEl.closest(".site-root") ?? sectionEl).backgroundColor) ?? { color: "#ffffff", opacity: 1 };
  el("rect", { width, height, fill: bg.color, "fill-opacity": bg.opacity < 1 ? bg.opacity : undefined }, bgLayer);
  const bgImage = style.backgroundImage.match(/url\("?([^")]+)"?\)/)?.[1];
  if (bgImage) el("image", { href: await dataUrlOf(bgImage), width, height, preserveAspectRatio: "xMidYMid slice" }, bgLayer);

  const blocksLayer = el("g", { id: "fw-blocks", "inkscape:label": "Blocks (move or resize the dashed frames)", "inkscape:groupmode": "layer" });
  const earlierArt: SVGSVGElement[] = [];
  for (const blockEl of Array.from(grid.querySelectorAll<HTMLElement>(`[data-block-id][data-section-id="${CSS.escape(section.id)}"]`))) {
    const id = blockEl.dataset.blockId!;
    const block = section.blocks.find((b) => b.id === id);
    if (!block || blockEl.offsetParent === null) continue;
    if (block.type === "vector" && block.props[SECTION_ART_PROP]) {
      const drawing = blockEl.querySelector<SVGSVGElement>(".b-vector > svg");
      if (drawing) earlierArt.push(drawing);
      continue;
    }
    const def = getBlockDefinition(block.type);
    const frame = local(blockEl.getBoundingClientRect()).map(round) as [number, number, number, number];
    meta.frames[id] = frame;
    const group = el("g", { id: `sbb-${id}`, "inkscape:label": block.name || def?.label || block.type }, blocksLayer);

    let painted = 0;
    for (const part of [blockEl, ...Array.from(blockEl.querySelectorAll<HTMLElement>("*"))]) {
      if (painted > 60 || part.closest("svg")) continue;
      const cs = getComputedStyle(part);
      const fill = parseColor(cs.backgroundColor);
      if (!fill || cs.visibility === "hidden") continue;
      const [x, y, w, h] = local(part.getBoundingClientRect());
      if (w < 1 || h < 1) continue;
      el("rect", { x: round(x), y: round(y), width: round(w), height: round(h), rx: parseFloat(cs.borderTopLeftRadius) || undefined, fill: fill.color, "fill-opacity": fill.opacity < 1 ? fill.opacity : undefined }, group);
      painted++;
    }
    for (const img of Array.from(blockEl.querySelectorAll<HTMLImageElement>("img"))) {
      if (!img.currentSrc) continue;
      const [x, y, w, h] = local(img.getBoundingClientRect());
      const fit = getComputedStyle(img).objectFit;
      el("image", { href: await dataUrlOf(img.currentSrc), x: round(x), y: round(y), width: round(w), height: round(h), preserveAspectRatio: fit === "cover" ? "xMidYMid slice" : fit === "contain" ? "xMidYMid meet" : "none" }, group);
    }
    for (const drawing of Array.from(blockEl.querySelectorAll<SVGSVGElement>(".b-vector > svg"))) {
      const [x, y, w, h] = local(drawing.getBoundingClientRect());
      const copy = doc.importNode(drawing, true) as Element;
      copy.setAttribute("x", String(round(x)));
      copy.setAttribute("y", String(round(y)));
      copy.setAttribute("width", String(round(w)));
      copy.setAttribute("height", String(round(h)));
      group.appendChild(copy);
    }
    const target = def?.inlineEdit?.[0] ? blockEl.querySelector<HTMLElement>(def.inlineEdit[0].selector) : null;
    const blockChildren = target ? Array.from(target.children).filter((c) => (c.textContent ?? "").trim() && /^(P|LI|DIV|H[1-6]|BLOCKQUOTE)$/.test(c.tagName)) : [];
    const paragraphs: Element[] = target ? (blockChildren.length ? blockChildren : [target]) : [];
    if (paragraphs.length) meta.paragraphs[id] = paragraphs.map((p) => norm(p.textContent ?? ""));
    const counters = new Map<number, number>();
    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      if (!node.data.trim() || !node.parentElement || node.parentElement.closest("svg, style, script, .editor-only")) continue;
      const cs = getComputedStyle(node.parentElement);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const fontSize = parseFloat(cs.fontSize) || 16;
      const color = parseColor(cs.color) ?? { color: "#000000", opacity: 1 };
      const paraIndex = paragraphs.findIndex((p) => p.contains(node));
      const lines: { left: number; bottom: number; words: string[] }[] = [];
      for (const m of node.data.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, m.index!);
        range.setEnd(node, m.index! + m[0].length);
        const r = range.getClientRects()[0];
        if (!r || r.width === 0) continue;
        const [x, y, , h] = local(r);
        const line = lines.find((l) => Math.abs(l.bottom - (y + h)) < fontSize * 0.4);
        if (line) {
          line.words.push(m[0]);
          line.left = Math.min(line.left, x);
        } else lines.push({ left: x, bottom: y + h, words: [m[0]] });
      }
      const transform = cs.textTransform;
      for (const line of lines) {
        let text = line.words.join(" ");
        if (transform === "uppercase") text = text.toUpperCase();
        else if (transform === "lowercase") text = text.toLowerCase();
        let idAttr: string | undefined;
        if (paraIndex >= 0) {
          const n = counters.get(paraIndex) ?? 0;
          counters.set(paraIndex, n + 1);
          idAttr = `sbt-${id}-${paraIndex}-${n}`;
        }
        const t = el(
          "text",
          {
            id: idAttr,
            "inkscape:label": text.length > 32 ? `${text.slice(0, 30)}…` : text,
            x: round(line.left),
            y: round(line.bottom - fontSize * 0.24),
            "font-family": cs.fontFamily,
            "font-size": round(fontSize),
            "font-weight": cs.fontWeight !== "400" ? cs.fontWeight : undefined,
            "font-style": cs.fontStyle !== "normal" ? cs.fontStyle : undefined,
            "letter-spacing": cs.letterSpacing !== "normal" ? cs.letterSpacing : undefined,
            fill: color.color,
            "fill-opacity": color.opacity < 1 ? color.opacity : undefined
          },
          group
        );
        t.textContent = text;
      }
    }
    el("rect", { id: `sbf-${id}`, "inkscape:label": "Frame (move or resize to move the block)", x: frame[0], y: frame[1], width: frame[2], height: frame[3], fill: "none", stroke: "#4f8cff", "stroke-width": 1, "stroke-dasharray": "6 4" }, group);
  }

  const artLayer = el("g", { id: "fw-art", "inkscape:label": "Your artwork (becomes a drawing on the page)", "inkscape:groupmode": "layer" });
  for (const drawing of earlierArt) {
    const [x, y, w, h] = local(drawing.getBoundingClientRect());
    const copy = doc.importNode(drawing, true) as Element;
    copy.setAttribute("x", String(round(x)));
    copy.setAttribute("y", String(round(y)));
    copy.setAttribute("width", String(round(w)));
    copy.setAttribute("height", String(round(h)));
    artLayer.appendChild(copy);
  }

  const info = doc.createElementNS(SECTION_NS, "fw:section");
  info.textContent = JSON.stringify(meta);
  metadata.appendChild(info);
  return { svg: new XMLSerializer().serializeToString(root), meta };
}

export interface SectionChanges {
  moves: { blockId: string; rect: Rect }[];
  texts: { blockId: string; key: string; value: string }[];
  art: { svg: string; rect: Rect } | null;
}

function readMeta(root: Element): SectionSvgMeta | null {
  const node = Array.from(root.getElementsByTagNameNS(SECTION_NS, "section"))[0] ?? Array.from(root.querySelectorAll("metadata *")).find((n) => n.localName === "section");
  try {
    const meta = node ? (JSON.parse(node.textContent ?? "") as SectionSvgMeta) : null;
    return meta?.version === 1 ? meta : null;
  } catch {
    return null;
  }
}

function gridLines(grid: HTMLElement) {
  const cs = getComputedStyle(grid);
  const tracks = (v: string) => v.split(/\s+/).map(parseFloat).filter((n) => !Number.isNaN(n));
  const colGap = parseFloat(cs.columnGap) || 0;
  const rowGap = parseFloat(cs.rowGap) || 0;
  const cols = tracks(cs.gridTemplateColumns);
  const starts: number[] = [];
  const ends: number[] = [];
  let at = 0;
  for (const w of cols) {
    starts.push(at);
    ends.push(at + w);
    at += w + colGap;
  }
  const rows = tracks(cs.gridTemplateRows);
  const edges = [0];
  rows.forEach((h, i) => edges.push(edges[edges.length - 1] + h + (i > 0 ? rowGap : 0)));
  const rowStep = (rows.length ? Math.min(...rows) : 24) + rowGap;
  return { starts, ends, edges, rowStep };
}

function nearestEdge(edges: number[], px: number, step: number): number {
  const last = edges.length - 1;
  if (px >= edges[last]) return last + Math.round((px - edges[last]) / step);
  let best = 0;
  for (let i = 1; i <= last; i++) if (Math.abs(edges[i] - px) < Math.abs(edges[best] - px)) best = i;
  return best;
}

function nearestIndex(values: number[], px: number, from = 0): number {
  let best = from;
  for (let i = from; i < values.length; i++) if (Math.abs(values[i] - px) < Math.abs(values[best] - px)) best = i;
  return best;
}

export function planSectionChanges(section: Section, svgText: string, fallbackMeta: SectionSvgMeta | null = null): SectionChanges {
  const clean = sanitizeSvg(svgText);
  const parsed = new DOMParser().parseFromString(clean, "image/svg+xml").documentElement;
  const meta = readMeta(parsed) ?? fallbackMeta;
  if (!meta || meta.sectionId !== section.id) throw new Error("This SVG wasn't exported from this section.");
  const { grid } = editorSection(section.id);
  const lines = gridLines(grid);

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;";
  host.innerHTML = clean;
  document.body.appendChild(host);
  const svg = host.querySelector("svg")!;
  svg.setAttribute("width", String(meta.width));
  svg.setAttribute("height", String(meta.height));
  svg.setAttribute("viewBox", `0 0 ${meta.width} ${meta.height}`);
  const svgBox = svg.getBoundingClientRect();
  const k = meta.width / Math.max(1, svgBox.width);
  const measure = (node: Element): [number, number, number, number] => {
    const r = node.getBoundingClientRect();
    return [(r.left - svgBox.left) * k, (r.top - svgBox.top) * k, r.width * k, r.height * k];
  };
  const toGrid = ([x, y, w, h]: [number, number, number, number]): Rect => {
    const left = x - meta.grid.x;
    const top = y - meta.grid.y;
    const col = nearestIndex(lines.starts, left);
    const endCol = nearestIndex(lines.ends, left + w, col);
    const row = Math.max(0, nearestEdge(lines.edges, top, lines.rowStep));
    const endRow = Math.max(row + 1, nearestEdge(lines.edges, top + h, lines.rowStep));
    return { x: col, y: row, w: Math.max(1, endCol - col + 1), h: endRow - row };
  };

  const changes: SectionChanges = { moves: [], texts: [], art: null };
  try {
    for (const [blockId, before] of Object.entries(meta.frames)) {
      const block = section.blocks.find((b) => b.id === blockId);
      const frame = svg.querySelector(`[id="sbf-${CSS.escape(blockId)}"]`);
      if (!block || !frame) continue;
      const now = measure(frame);
      if (now.every((v, i) => Math.abs(v - before[i]) < 1.5)) continue;
      changes.moves.push({ blockId, rect: toGrid(now) });
    }
    for (const [blockId, original] of Object.entries(meta.paragraphs)) {
      const block = section.blocks.find((b) => b.id === blockId);
      const target = block && getBlockDefinition(block.type)?.inlineEdit?.[0];
      if (!block || !target) continue;
      const edited = original.map((_, i) =>
        norm(
          Array.from(svg.querySelectorAll(`[id^="sbt-${CSS.escape(blockId)}-${i}-"]`))
            .map((t) => t.textContent ?? "")
            .join(" ")
        )
      );
      if (edited.every((t, i) => t === original[i])) continue;
      const rich = target.mode === "rich";
      const sep = target.lines === "paragraphs" ? "\n\n" : "\n";
      const current = String(block.props[target.key] ?? "");
      const parts = current.split(sep);
      const value =
        parts.length === original.length
          ? parts.map((part, i) => (edited[i] === original[i] ? part : rich ? escapeRich(edited[i]) : edited[i])).join(sep)
          : edited.map((t) => (rich ? escapeRich(t) : t)).join(sep);
      changes.texts.push({ blockId, key: target.key, value });
    }
    const art = svg.querySelector('[id="fw-art"], [id="sb-art"]');
    const layerOf = (node: Element) => /^(fw|sb)-/.test(node.id ?? "") || Boolean(node.querySelector('[id^="fw-"], [id^="sb-"]'));
    const pieces = [
      ...(art ? Array.from(art.children) : []),
      ...Array.from(svg.children).filter((c) => !layerOf(c) && !["metadata", "defs", "style", "namedview", "title", "desc"].includes(c.localName))
    ].filter((p) => {
      const [, , w, h] = measure(p);
      return w > 0.5 || h > 0.5;
    });
    if (pieces.length) {
      const boxes = pieces.map(measure);
      const x = Math.min(...boxes.map((b) => b[0]));
      const y = Math.min(...boxes.map((b) => b[1]));
      const right = Math.max(...boxes.map((b) => b[0] + b[2]));
      const bottom = Math.max(...boxes.map((b) => b[1] + b[3]));
      const doc = document.implementation.createDocument(SVG_NS, "svg", null);
      const out = doc.documentElement;
      out.setAttributeNS(XMLNS_NS, "xmlns:inkscape", INKSCAPE_NS);
      out.setAttributeNS(XMLNS_NS, "xmlns:sodipodi", SODIPODI_NS);
      out.setAttribute("viewBox", `${x} ${y} ${right - x} ${bottom - y}`);
      out.setAttribute("width", String(Math.round(right - x)));
      out.setAttribute("height", String(Math.round(bottom - y)));
      for (const defs of Array.from(svg.querySelectorAll("defs"))) if (!defs.closest("svg svg")) out.appendChild(doc.importNode(defs, true));
      const artPieces = pieces.filter((p) => art?.contains(p));
      const otherPieces = pieces.filter((p) => !art?.contains(p));
      if (artPieces.length) {
        const holder = out.appendChild(doc.createElementNS(SVG_NS, "g"));
        for (const attr of Array.from(art!.attributes)) if (attr.name !== "id" && !attr.name.includes(":")) holder.setAttribute(attr.name, attr.value);
        for (const piece of artPieces) holder.appendChild(doc.importNode(piece, true));
      }
      for (const piece of otherPieces) out.appendChild(doc.importNode(piece, true));
      changes.art = { svg: sanitizeSvg(new XMLSerializer().serializeToString(out)), rect: toGrid([x, y, right - x, bottom - y]) };
    }
  } finally {
    host.remove();
  }
  return changes;
}
