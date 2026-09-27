const { ipcRenderer } = require("electron");

const MAX_ELEMENTS = 2500;
const PROPS = [
  "display", "position", "top", "right", "bottom", "left", "z-index", "box-sizing",
  "flex-direction", "flex-wrap", "justify-content", "align-items", "align-content", "align-self", "flex-grow", "flex-shrink", "flex-basis", "order",
  "grid-template-columns", "grid-template-rows", "grid-column", "grid-row", "gap", "row-gap", "column-gap",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "max-width", "min-height",
  "border-top", "border-right", "border-bottom", "border-left", "border-radius", "outline",
  "background-color", "background-image", "background-size", "background-position", "background-repeat",
  "box-shadow", "opacity", "transform", "overflow", "object-fit", "object-position", "filter", "backdrop-filter",
  "color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-transform", "text-align", "text-decoration-line", "text-decoration-color", "white-space", "list-style-type", "vertical-align", "cursor"
];
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "CANVAS"]);
const REPLACED = new Set(["IMG", "VIDEO", "SVG", "PICTURE", "INPUT", "TEXTAREA", "SELECT", "BUTTON"]);
const WORDS = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat".split(" ");

function licenceSignals() {
  const hrefs = Array.from(document.querySelectorAll("a[rel~='license'], link[rel~='license'], a[href*='creativecommons.org/licenses/'], a[href*='creativecommons.org/publicdomain/'], a[href*='opensource.org/licenses/']"))
    .map((el) => el.getAttribute("href") || "")
    .filter(Boolean);
  const meta = (name) => document.querySelector(`meta[name='${name}' i], meta[property='${name}' i]`)?.getAttribute("content") || "";
  const jsonLd = [];
  for (const s of Array.from(document.querySelectorAll("script[type='application/ld+json']"))) {
    try {
      const walk = (v) => {
        if (!v || typeof v !== "object") return;
        if (typeof v.license === "string") jsonLd.push(v.license);
        Object.values(v).forEach(walk);
      };
      walk(JSON.parse(s.textContent || "null"));
    } catch {
    }
  }
  const footer = (document.querySelector("footer")?.innerText || "").slice(0, 2000);
  return {
    hrefs,
    metaLicense: meta("license") || meta("dcterms.license") || meta("dc.rights"),
    metaCopyright: meta("copyright") || meta("dc.rights"),
    author: meta("author") || meta("og:site_name") || document.title,
    jsonLd,
    footer,
    tdmReservation: meta("tdm-reservation"),
    tdmPolicy: meta("tdm-policy")
  };
}

let defaultsFrame = null;
const defaultsCache = new Map();
function defaultsFor(tag) {
  if (defaultsCache.has(tag)) return defaultsCache.get(tag);
  if (!defaultsFrame) {
    defaultsFrame = document.createElement("iframe");
    defaultsFrame.style.cssText = "position:fixed;left:-10000px;width:10px;height:10px;border:0;visibility:hidden;";
    document.documentElement.appendChild(defaultsFrame);
  }
  const doc = defaultsFrame.contentDocument;
  const el = doc.createElement(tag);
  doc.body.appendChild(el);
  const cs = doc.defaultView.getComputedStyle(el);
  const values = {};
  for (const p of PROPS) values[p] = cs.getPropertyValue(p);
  el.remove();
  defaultsCache.set(tag, values);
  return values;
}

function placeholderText(text) {
  return text.replace(/\S+/g, (word) => {
    if (/^\d/.test(word)) return word.replace(/\d/g, "0");
    const w = WORDS.find((x) => x.length >= Math.min(word.length, 9)) || "lorem";
    const pick = WORDS[(word.length * 7 + word.charCodeAt(0)) % WORDS.length];
    const base = Math.abs(pick.length - word.length) < Math.abs(w.length - word.length) ? pick : w;
    return /^[A-Z]/.test(word) ? base[0].toUpperCase() + base.slice(1) : base;
  });
}

function placeholderImage(w, h) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, Math.round(w))}" height="${Math.max(1, Math.round(h))}" viewBox="0 0 100 100" preserveAspectRatio="none"><rect width="100" height="100" fill="#d9d4cc"/><path d="M0 100 L35 55 L55 75 L75 50 L100 80 L100 100 Z" fill="#c2bcb1"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function extract(root, keepContent) {
  let count = 0;
  const rules = [];
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const rootBox = root.getBoundingClientRect();

  function styleFor(el, cls, isRoot) {
    const cs = getComputedStyle(el);
    const defaults = defaultsFor(el.tagName.toLowerCase());
    const decls = [];
    for (const p of PROPS) {
      let v = cs.getPropertyValue(p);
      if (v === defaults[p] && !isRoot) continue;
      if (p === "background-image" && v.includes("url(")) {
        if (!keepContent) {
          v = "none";
          decls.push("background-color: #d9d4cc");
        } else v = v.replace(/url\("?([^")]+)"?\)/g, (_, u) => `url("${new URL(u, location.href).href}")`);
      }
      if (p === "position" && (v === "fixed" || v === "sticky")) v = "relative";
      decls.push(`${p}: ${v}`);
    }
    const box = el.getBoundingClientRect();
    if (isRoot) {
      decls.push(`width: ${Math.round(box.width)}px`, "margin: 0");
    } else if (REPLACED.has(el.tagName) || cs.display === "inline-block" || cs.display === "inline-flex" || cs.position === "absolute" || (cs.flexGrow === "0" && cs.display !== "block" && cs.display !== "flex" && cs.display !== "grid")) {
      decls.push(`width: ${Math.round(box.width)}px`, `height: ${Math.round(box.height)}px`);
    }
    rules.push(`.${cls} { ${decls.join("; ")}; }`);
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      const content = ps.getPropertyValue("content");
      if (!content || content === "none" || content === "normal") continue;
      const pd = [`content: ${keepContent || /^["']\s*["']$/.test(content) ? content : '""'}`];
      for (const p of PROPS) {
        const v = ps.getPropertyValue(p);
        if (v && v !== defaults[p]) pd.push(`${p}: ${p === "background-image" && v.includes("url(") && !keepContent ? "none" : v}`);
      }
      pd.push(`width: ${ps.getPropertyValue("width")}`, `height: ${ps.getPropertyValue("height")}`);
      rules.push(`.${cls}${pseudo} { ${pd.join("; ")}; }`);
    }
  }

  function walk(node, isRoot) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      return esc(keepContent ? text : placeholderText(text));
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node;
    if (SKIP.has(el.tagName) || el.id === "__sb_capture_host") return "";
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return "";
    if (++count > MAX_ELEMENTS) return "";
    const cls = `c${count}`;
    const tag = el.tagName.toLowerCase();
    const box = el.getBoundingClientRect();
    if (tag === "svg") {
      styleFor(el, cls, isRoot);
      if (!keepContent) return `<img class="${cls}" alt="" src="${placeholderImage(box.width, box.height)}">`;
      const copy = el.cloneNode(true);
      copy.setAttribute("class", cls);
      copy.setAttribute("width", String(Math.round(box.width)));
      copy.setAttribute("height", String(Math.round(box.height)));
      return copy.outerHTML;
    }
    styleFor(el, cls, isRoot);
    if (tag === "img") {
      const src = keepContent ? el.currentSrc || el.src : placeholderImage(box.width, box.height);
      return `<img class="${cls}" alt="${esc(keepContent ? el.alt || "" : "")}" src="${esc(src)}">`;
    }
    if (tag === "picture") {
      const img = el.querySelector("img");
      return img ? walk(img, false).replace('class="', `class="${cls} `) : "";
    }
    if (tag === "video") {
      return `<img class="${cls}" alt="" src="${placeholderImage(box.width, box.height)}">`;
    }
    if (tag === "input" || tag === "textarea") {
      const type = el.getAttribute("type") || "text";
      const ph = el.getAttribute("placeholder") || "";
      return tag === "input" ? `<input class="${cls}" type="${esc(type)}" placeholder="${esc(keepContent ? ph : placeholderText(ph))}">` : `<textarea class="${cls}" placeholder="${esc(keepContent ? ph : placeholderText(ph))}"></textarea>`;
    }
    const outTag = ["a", "button", "select", "option", "form", "label", "iframe"].includes(tag) ? (tag === "a" ? "a" : tag === "button" ? "button" : "div") : /^(h[1-6]|p|ul|ol|li|span|strong|em|b|i|small|blockquote|figure|figcaption|section|article|header|footer|nav|aside|main|dl|dt|dd|table|thead|tbody|tr|td|th|hr|br|div)$/.test(tag) ? tag : "div";
    if (outTag === "br" || outTag === "hr") return `<${outTag} class="${cls}">`;
    const attrs = outTag === "a" ? ` href="#"` : outTag === "button" ? ` type="button"` : "";
    let inner = "";
    for (const child of Array.from(el.childNodes)) inner += walk(child, false);
    return `<${outTag} class="${cls}"${attrs}>${inner}</${outTag}>`;
  }

  const html = walk(root, true);
  return { html, css: rules.join("\n"), width: Math.round(rootBox.width), height: Math.round(rootBox.height), elements: Math.min(count, MAX_ELEMENTS), truncated: count > MAX_ELEMENTS };
}

function start() {
  if (document.getElementById("__sb_capture_host")) return;
  const host = document.createElement("div");
  host.id = "__sb_capture_host";
  host.style.cssText = "all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      .bar { position: fixed; left: 50%; top: 12px; transform: translateX(-50%); display: flex; gap: 8px; align-items: center; padding: 8px 12px;
        background: #1a1c20; color: #e8e9ec; border-radius: 10px; font: 13px system-ui, sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.4); pointer-events: auto; max-width: calc(100vw - 40px); }
      .bar button { font: inherit; padding: 5px 10px; border-radius: 6px; border: 1px solid #3a3f48; background: #23262c; color: inherit; cursor: pointer; }
      .bar button.primary { background: #4f8cff; border-color: #4f8cff; color: #fff; }
      .bar label { display: flex; gap: 6px; align-items: center; }
      .box { position: fixed; border: 2px solid #4f8cff; background: rgba(79,140,255,.12); pointer-events: none; transition: all .05s; }
      .box.picked { border-color: #ff8a3d; background: rgba(255,138,61,.12); }
      .tag { position: fixed; background: #4f8cff; color: #fff; font: 11px system-ui; padding: 2px 6px; border-radius: 4px; pointer-events: none; }
    </style>
    <div class="box" hidden></div><div class="tag" hidden></div>
    <div class="bar">
      <span class="msg">Hover a component and click to pick it (↑ / ↓ to widen or narrow, Enter to capture).</span>
      <label><input type="checkbox" class="own"> My own site (or I have permission)</label>
      <button class="whole">Whole page</button>
      <button class="primary go" disabled>Capture</button>
      <button class="cancel">Cancel</button>
    </div>`;
  document.documentElement.appendChild(host);
  const box = shadow.querySelector(".box");
  const tag = shadow.querySelector(".tag");
  const msg = shadow.querySelector(".msg");
  const go = shadow.querySelector(".go");
  let hovered = null;
  let picked = null;

  const show = (el) => {
    if (!el) {
      box.hidden = tag.hidden = true;
      return;
    }
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    box.hidden = tag.hidden = false;
    box.classList.toggle("picked", el === picked);
    tag.textContent = `${el.tagName.toLowerCase()}${el.classList[0] ? "." + el.classList[0] : ""} · ${Math.round(r.width)} × ${Math.round(r.height)}`;
    Object.assign(tag.style, { left: `${r.left}px`, top: `${Math.max(0, r.top - 20)}px` });
  };
  const pick = (el) => {
    picked = el;
    go.disabled = !el;
    msg.textContent = el ? "Picked. ↑ / ↓ to adjust, then Capture." : "Hover a component and click to pick it.";
    show(el);
  };
  const inBar = (e) => e.composedPath().includes(host);

  document.addEventListener("mousemove", (e) => {
    if (picked || inBar(e)) return;
    hovered = document.elementFromPoint(e.clientX, e.clientY);
    if (hovered === host) return;
    show(hovered);
  }, true);
  document.addEventListener("click", (e) => {
    if (inBar(e)) return;
    e.preventDefault();
    e.stopPropagation();
    pick(picked ? null : document.elementFromPoint(e.clientX, e.clientY));
  }, true);
  document.addEventListener("keydown", (e) => {
    const current = picked || hovered;
    if (!current) return;
    if (e.key === "ArrowUp" && current.parentElement && current.parentElement !== document.documentElement) {
      e.preventDefault();
      pick(current.parentElement);
    } else if (e.key === "ArrowDown" && current.firstElementChild) {
      e.preventDefault();
      pick(current.firstElementChild);
    } else if (e.key === "Escape") pick(null);
    else if (e.key === "Enter" && picked) {
      e.preventDefault();
      send(picked);
    }
  }, true);
  window.addEventListener("scroll", () => show(picked || hovered), true);

  const send = (root) => {
    const own = shadow.querySelector(".own").checked;
    const signals = licenceSignals();
    const full = extract(root, true);
    const reference = extract(root, false);
    ipcRenderer.send("capture:result", { url: location.href, title: document.title, own, signals, full, reference });
    msg.textContent = "Captured.";
  };
  go.addEventListener("click", () => picked && send(picked));
  if (ownPreset) shadow.querySelector(".own").checked = true;
  applyOwn = () => (shadow.querySelector(".own").checked = true);
  shadow.querySelector(".whole").addEventListener("click", () => send(document.body));
  shadow.querySelector(".cancel").addEventListener("click", () => ipcRenderer.send("capture:result", null));
}

let ownPreset = false;
let applyOwn = null;
ipcRenderer.on("capture:own", () => {
  ownPreset = true;
  applyOwn?.();
});

window.addEventListener("DOMContentLoaded", () => setTimeout(start, 300));
