import type { ListItem } from "../model/types";
import type { RenderContext } from "./renderContext";

export type SlotKind = "text" | "textarea" | "link" | "image" | "color";

export interface Slot {
  key: string;
  label: string;
  kind: SlotKind;
}

export const SLOT_PREFIX = "v_";

const DROP_ELEMENTS = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "base", "frame", "frameset", "noscript", "template"]);
const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction", "xlink:href", "poster", "srcset"]);
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g;
const HAS_PLACEHOLDER = /\{\{\s*[a-zA-Z0-9_-]+\s*\}\}/;

export function readSlots(value: unknown): Slot[] {
  if (!Array.isArray(value)) return [];
  return (value as ListItem[])
    .filter((s) => typeof s.key === "string" && s.key)
    .map((s) => ({ key: String(s.key), label: String(s.label || s.key), kind: (["text", "textarea", "link", "image", "color"].includes(String(s.kind)) ? s.kind : "text") as SlotKind }));
}

function safeUrl(value: string): boolean {
  const v = value.toLowerCase().replace(/[\s\u0000-\u001f]+/g, "");
  return !(v.startsWith("javascript:") || v.startsWith("vbscript:") || (v.startsWith("data:") && !v.startsWith("data:image/")));
}

function safeCssValue(value: string): string {
  return /^[#a-zA-Z0-9(),.%\s/-]*$/.test(value) && !/url\s*\(/i.test(value) ? value : "";
}

function sanitize(root: Element) {
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (!el.isConnected) continue;
    const tag = el.tagName.toLowerCase();
    if (DROP_ELEMENTS.has(tag) || tag === "foreignobject") {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || (name === "style" && /expression\(|javascript:/i.test(attr.value))) el.removeAttribute(attr.name);
      else if ((URL_ATTRIBUTES.has(name) || name.endsWith(":href")) && !safeUrl(attr.value)) el.removeAttribute(attr.name);
    }
    if (tag === "form") el.removeAttribute("action");
  }
}

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  sanitize(doc.body);
  return doc.body.innerHTML;
}

export function renderCustomHtml(template: string, slots: Slot[], values: Record<string, unknown>, ctx: RenderContext): string {
  const kinds = new Map(slots.map((s) => [s.key, s.kind]));
  const value = (key: string) => String(values[SLOT_PREFIX + key] ?? "");
  const doc = new DOMParser().parseFromString(`<body>${template}</body>`, "text/html");
  const body = doc.body;

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (HAS_PLACEHOLDER.test(n.textContent ?? "")) texts.push(n as Text);
  for (const node of texts) {
    const parts = (node.textContent ?? "").split(PLACEHOLDER);
    const fragment = doc.createDocumentFragment();
    parts.forEach((part, i) => {
      if (i % 2 === 0) {
        if (part) fragment.append(part);
        return;
      }
      value(part)
        .split("\n")
        .forEach((line, j) => {
          if (j > 0) fragment.append(doc.createElement("br"));
          fragment.append(line);
        });
    });
    node.replaceWith(fragment);
  }

  for (const el of Array.from(body.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      if (!attr.value.includes("{{")) continue;
      const whole = attr.value.match(/^\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}$/);
      const kind = whole ? kinds.get(whole[1]) : undefined;
      if (whole && kind === "link") {
        const link = ctx.link(value(whole[1]));
        el.setAttribute(attr.name, link.href);
        if (link.pageId) el.setAttribute("data-page-id", link.pageId);
        if (link.external) el.setAttribute("rel", "noopener noreferrer");
      } else if (whole && kind === "image") {
        const src = value(whole[1]);
        el.setAttribute(attr.name, src ? ctx.asset(src) : "");
      } else {
        el.setAttribute(
          attr.name,
          attr.value.replace(PLACEHOLDER, (_, key: string) => (kinds.get(key) === "color" ? safeCssValue(value(key)) : value(key)))
        );
      }
    }
  }
  sanitize(body);
  return body.innerHTML;
}

export function fillCss(css: string, slots: Slot[], values: Record<string, unknown>, ctx: RenderContext): string {
  const kinds = new Map(slots.map((s) => [s.key, s.kind]));
  return css.replace(PLACEHOLDER, (_, key: string) => {
    const v = String(values[SLOT_PREFIX + key] ?? "");
    if (kinds.get(key) === "image") return v ? `url("${ctx.asset(v).replace(/["\\\n]/g, "")}")` : "none";
    return safeCssValue(v);
  });
}

export function splitSelectors(selectorText: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selectorText.length; i++) {
    const c = selectorText[i];
    if (c === "\\") i++;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      parts.push(selectorText.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(selectorText.slice(start));
  return parts;
}

function scopeSelector(selectorText: string, scope: string): string {
  return splitSelectors(selectorText)
    .map((part) => {
      const s = part.trim();
      if (!s) return s;
      if (/^(:root|:host|html|body)$/i.test(s)) return scope;
      return `${scope} ${s.replace(/^(:root|:host|html|body)\s+/i, "")}`;
    })
    .join(", ");
}

function renameAnimations(style: CSSStyleDeclaration, renames: Map<string, string>) {
  if (!renames.size) return;
  const value = style.getPropertyValue("animation-name");
  if (value) {
    const renamed = value
      .split(",")
      .map((name) => renames.get(name.trim().replace(/^["']|["']$/g, "")) ?? name.trim())
      .join(", ");
    if (renamed !== value) style.setProperty("animation-name", renamed, style.getPropertyPriority("animation-name"));
  }
  for (let i = 0; i < style.length; i++) {
    const prop = style[i];
    if (!prop.startsWith("--")) continue;
    const raw = style.getPropertyValue(prop);
    const renamed = raw.replace(/(^|[\s,])([A-Za-z_][\w-]*)(?=[\s,]|$)/g, (m, lead: string, word: string) => (renames.has(word) ? lead + renames.get(word) : m));
    if (renamed !== raw) style.setProperty(prop, renamed, style.getPropertyPriority(prop));
  }
}

function renameNested(rule: CSSRule, renames: Map<string, string>) {
  if (rule instanceof CSSStyleRule) renameAnimations(rule.style, renames);
  if ("cssRules" in rule) for (const child of Array.from((rule as CSSGroupingRule).cssRules)) renameNested(child, renames);
}

function scopeRules(rules: CSSRuleList, scope: string, renames: Map<string, string>, layers?: Map<string, string[]>): string {
  const out: string[] = [];
  const ownLayers = layers ?? new Map<string, string[]>();
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      renameNested(rule, renames);
      const nested = Array.from(rule.cssRules ?? []).map((r) => r.cssText).join(" ");
      out.push(`${scopeSelector(rule.selectorText, scope)} { ${rule.style.cssText} ${nested} }`);
    } else if (rule instanceof CSSMediaRule) {
      out.push(`@media ${rule.conditionText} { ${scopeRules(rule.cssRules, scope, renames)} }`);
    } else if (rule instanceof CSSSupportsRule) {
      out.push(`@supports ${rule.conditionText} { ${scopeRules(rule.cssRules, scope, renames)} }`);
    } else if (typeof CSSContainerRule !== "undefined" && rule instanceof CSSContainerRule) {
      out.push(`@container ${rule.conditionText} { ${scopeRules(rule.cssRules, scope, renames)} }`);
    } else if (rule instanceof CSSKeyframesRule) {
      const name = renames.get(rule.name);
      if (name) rule.name = name;
      out.push(rule.cssText);
    } else if (rule instanceof CSSLayerStatementRule) {
      for (const name of rule.nameList) if (!ownLayers.has(name)) ownLayers.set(name, []);
    } else if (rule instanceof CSSLayerBlockRule) {
      const name = rule.name || `anonymous-${ownLayers.size}`;
      if (!ownLayers.has(name)) ownLayers.set(name, []);
      ownLayers.get(name)!.push(scopeRules(rule.cssRules, scope, renames, ownLayers));
    } else if (typeof CSSPropertyRule !== "undefined" && rule instanceof CSSPropertyRule) {
      out.push(rule.cssText);
    }
  }
  if (layers) return out.join("\n");
  return [...[...ownLayers.values()].flat(), ...out].filter(Boolean).join("\n");
}

const scopeCache = new Map<string, string>();

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function scopeCss(css: string, scope: string): string {
  const key = `${scope}\u0000${css}`;
  const cached = scopeCache.get(key);
  if (cached !== undefined) return cached;
  let scoped = "";
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css.replace(/@import[^;]+;/g, ""));
    const suffix = hash(scope);
    const renames = new Map<string, string>();
    const collect = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSKeyframesRule) renames.set(rule.name, `${rule.name}-${suffix}`);
        else if (rule instanceof CSSGroupingRule) collect(rule.cssRules);
      }
    };
    collect(sheet.cssRules);
    scoped = scopeRules(sheet.cssRules, scope, renames).replace(/<\/style/gi, "<\\/style");
  } catch {
    scoped = "";
  }
  if (scopeCache.size > 300) scopeCache.clear();
  scopeCache.set(key, scoped);
  return scoped;
}

export interface ExtractedSlot extends Slot {
  value: string;
}

export function extractSlots(html: string): { template: string; slots: ExtractedSlot[] } {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const slots: ExtractedSlot[] = [];
  const counts = { text: 0, link: 0, image: 0 };
  const add = (kind: "text" | "link" | "image", value: string, label: string) => {
    counts[kind] += 1;
    const key = `${kind}${counts[kind]}`;
    slots.push({ key, kind, value, label });
    return `{{${key}}}`;
  };
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (const node of texts) {
    const text = node.textContent ?? "";
    if (!text.trim() || node.parentElement?.closest("svg, style, script")) continue;
    const trimmed = text.trim().replace(/\s+/g, " ");
    const label = trimmed.length > 28 ? `Text ${counts.text + 1}` : trimmed;
    node.textContent = `${text.match(/^\s*/)![0]}${add("text", trimmed, label)}${text.match(/\s*$/)![0]}`;
  }
  for (const a of Array.from(doc.body.querySelectorAll("a[href]"))) a.setAttribute("href", add("link", a.getAttribute("href") ?? "", `Link ${counts.link + 1}`));
  for (const img of Array.from(doc.body.querySelectorAll("img[src]"))) img.setAttribute("src", add("image", img.getAttribute("src") ?? "", `Image ${counts.image + 1}`));
  return { template: doc.body.innerHTML, slots };
}
