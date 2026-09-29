import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getBlockDefinition } from "../blocks/registry";
import { thirdPartyNotices } from "../catalogue/notices";
import { assertPublishable } from "../catalogue/rights";
import { createSection } from "../model/factory";
import { googleFontsCssUrl, pieceGoogleFonts, themeGoogleFonts } from "../model/fonts";
import { themeVars } from "../model/theme";
import type { Block, Section, Site } from "../model/types";
import { scopeCss, splitSelectors } from "../site/customHtml";
import { RenderCtx, type RenderContext } from "../site/renderContext";
import { stripRich } from "../site/richText";
import { initSite } from "../site/runtime";
import { StaticSection } from "../site/SiteRenderer";
import siteCss from "../site/site.css?raw";
import { collectMediaRefs, getAsset, isAssetRef } from "../state/assets";
import { slugify } from "../util/slug";

export type Piece = { section: Section; block?: Block };

export interface PieceBundle {
  name: string;
  slug: string;
  markup: string;
  css: string;
  scopedCss: string;
  wrapper: string;
  fontsUrl: string | null;
  runtime: string | null;
  notices: string | null;
}

async function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function pieceSection(piece: Piece): Section {
  if (!piece.block) return piece.section;
  const block = { ...structuredClone(piece.block), x: 0, y: 0, responsive: undefined, overhang: undefined };
  const section = createSection(piece.block.name || "Piece", [block], { paddingY: 0, minRows: block.h, background: "" });
  section.grid = piece.section.grid;
  return section;
}

export function pruneCss(css: string, markup: string): string {
  const present = new Set<string>(["fw-js", "reveal-ready", "is-revealed", "is-current", "is-muted"]);
  for (const m of markup.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c) present.add(c);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css.replace(/@import[^;]+;/g, ""));
  const keepSelector = (sel: string) => [...sel.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].every((m) => present.has(m[1]));
  const walk = (rules: CSSRuleList): string =>
    Array.from(rules)
      .map((rule) => {
        if (rule instanceof CSSStyleRule) {
          const kept = splitSelectors(rule.selectorText).map((s) => s.trim()).filter(keepSelector);
          return kept.length ? `${kept.join(", ")} { ${rule.style.cssText} ${Array.from(rule.cssRules ?? []).map((r) => r.cssText).join(" ")} }` : "";
        }
        if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule || (typeof CSSContainerRule !== "undefined" && rule instanceof CSSContainerRule)) {
          const inner = walk(rule.cssRules);
          const keyword = rule instanceof CSSMediaRule ? "@media" : rule instanceof CSSSupportsRule ? "@supports" : "@container";
          return inner.trim() ? `${keyword} ${rule.conditionText} { ${inner} }` : "";
        }
        if (rule instanceof CSSKeyframesRule) return markup.includes(rule.name) || css.includes(`animation: ${rule.name}`) || /reveal|fw-/.test(rule.name) ? rule.cssText : "";
        return rule.cssText;
      })
      .filter(Boolean)
      .join("\n");
  return walk(sheet.cssRules);
}

export async function buildPiece(site: Site, piece: Piece, tokens?: Map<string, string>): Promise<PieceBundle> {
  assertPublishable({ ...site, pages: [{ ...site.pages[0], sections: [piece.section] }], header: null, footer: null, components: site.components });
  const section = pieceSection(piece);
  const urls = new Map<string, string>();
  for (const ref of collectMediaRefs(section)) {
    if (isAssetRef(ref)) {
      const asset = await getAsset(ref);
      if (asset) urls.set(ref, await toDataUrl(asset.blob));
    }
  }
  const ctx: RenderContext = {
    asset: (src) => urls.get(src) ?? src,
    link: (href) => ({ href: href && !href.startsWith("page:") ? href : "#", external: /^https?:/.test(href) }),
    navPages: [],
    homePageId: site.pages[0].id,
    currentPageId: "",
    components: site.components
  };
  const rendered = renderToStaticMarkup(createElement(RenderCtx.Provider, { value: ctx }, createElement(StaticSection, { section: tokens ? tokenise(section, tokens) : section, role: "page" })));
  const vars = Object.entries(themeVars(site.theme))
    .map(([k, v]) => `${k}: ${String(v).replace(/"/g, "'")}`)
    .join("; ");
  const markup = `<div class="site-root" style="${vars}">${rendered}</div>`;
  const name = piece.block?.name || String(piece.block?.props.name || "") || piece.section.name || "Piece";
  const slug = slugify(name) || "piece";
  const wrapper = `fw-${slug}-${Math.abs(hash(markup)).toString(36).slice(0, 5)}`;
  const css = pruneCss(siteCss, markup);
  const needsRuntime = /data-(js|reveal|parallax|draw-anim|anim|sound)=/.test(markup);
  return {
    name,
    slug,
    markup,
    css,
    scopedCss: scopeCss(css, `.${wrapper}`),
    wrapper,
    fontsUrl: googleFontsCssUrl([...themeGoogleFonts(site.theme), ...pieceGoogleFonts(site)]),
    runtime: needsRuntime ? `(${initSite.toString()})` : null,
    notices: thirdPartyNotices({ ...site, pages: [{ ...site.pages[0], sections: [section] }], header: null, footer: null, components: [] })
  };
}

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h;
}

const credits = (b: PieceBundle) => (b.notices ? `<!--\n${b.notices.replace(/--/g, "- -")}\n-->\n` : "");

export function toSnippet(b: PieceBundle): string {
  const id = `${b.wrapper}-root`;
  return `${credits(b)}${b.fontsUrl ? `<link rel="stylesheet" href="${b.fontsUrl}">\n` : ""}<style>${b.scopedCss}</style>
<div class="${b.wrapper}" id="${id}">${b.markup}</div>
${b.runtime ? `<script>${b.runtime}(document.getElementById("${id}"));</script>\n` : ""}`;
}

export function toWebComponent(b: PieceBundle): { file: string; tag: string; usage: string } {
  const tag = `fw-${b.slug}`.replace(/[^a-z0-9-]/g, "").replace(/^fw-$/, "fw-piece");
  const body = JSON.stringify(`<style>${b.css}</style>${b.markup}`);
  const file = `${credits(b).replace(/<!--/, "/*").replace(/-->/, "*/")}// <${tag}>. Use: <script src="${tag}.js"></script> then <${tag}></${tag}>
(() => {
  const fonts = ${JSON.stringify(b.fontsUrl)};
  // Animated properties must be registered in the page itself (@property doesn't work inside a shadow root).
  const props = ${JSON.stringify((b.css.match(/@property[^{]+\{[^}]*\}/g) ?? []).join("\n"))};
  class Piece extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      // Web fonts have to be declared in the page itself (font faces don't work inside a shadow root).
      if (fonts && !document.querySelector('link[href="' + fonts + '"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = fonts;
        document.head.appendChild(link);
      }
      if (props && !document.getElementById("fw-anim-props")) {
        const style = document.createElement("style");
        style.id = "fw-anim-props";
        style.textContent = props;
        document.head.appendChild(style);
      }
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = ${body};
      ${b.runtime ? `(${b.runtime})(root.querySelector(".site-root"));` : ""}
    }
  }
  if (!customElements.get(${JSON.stringify(tag)})) customElements.define(${JSON.stringify(tag)}, Piece);
})();
`;
  return { file: file.replace(/<\/script/gi, "<\\/script"), tag, usage: `<script src="${tag}.js" defer></script>\n<${tag}></${tag}>` };
}

export function toWordPress(b: PieceBundle): { pattern: string; blockMarkup: string } {
  const blockMarkup = `<!-- wp:html -->\n${toSnippet(b)}\n<!-- /wp:html -->`;
  const pattern = `<?php
/**
 * Title: ${b.name.replace(/\*\//g, "")}
 * Slug: fayteworks/${b.slug}
 * Categories: featured
 * Description: A section pattern.
 */
?>
${blockMarkup}
`;
  return { pattern, blockMarkup };
}

interface ShopifySetting {
  type: "text" | "textarea" | "url" | "image_picker" | "color";
  id: string;
  label: string;
  default?: string;
}

const TOKEN = (n: number) => `SBSETTING${n}X`;

function tokenise(section: Section, tokens: Map<string, string>): Section {
  const copy = structuredClone(section);
  for (const block of copy.blocks) {
    for (const [key, token] of tokens) {
      const [blockId, prop] = key.split("|");
      if (blockId === block.id) block.props[prop] = token;
    }
  }
  return copy;
}

function shopifySettings(section: Section): { key: string; setting: ShopifySetting }[] {
  const out: { key: string; setting: ShopifySetting }[] = [];
  let n = 0;
  const add = (block: Block, prop: string, type: ShopifySetting["type"], label: string, value: string) => {
    const id = `${slugify(label).replace(/-/g, "_").slice(0, 20) || "setting"}_${++n}`;
    out.push({ key: `${block.id}|${prop}`, setting: { type, id, label: label.slice(0, 60), default: type === "image_picker" ? undefined : value } });
  };
  for (const block of section.blocks) {
    const def = getBlockDefinition(block.type);
    if (!def) continue;
    const edit = def.inlineEdit?.[0];
    if (edit && typeof block.props[edit.key] === "string") add(block, edit.key, edit.lines === "single" ? "text" : "textarea", `${def.label} text`, stripRich(String(block.props[edit.key])));
    for (const field of def.fields) {
      const value = block.props[field.key];
      if (typeof value !== "string") continue;
      if (field.kind === "link") add(block, field.key, "url", `${def.label} ${field.label.toLowerCase()}`, value.startsWith("page:") ? "" : value);
      if (field.kind === "image" && !field.accept?.startsWith("video") && !field.accept?.startsWith("audio")) add(block, field.key, "image_picker", `${def.label} ${field.label.toLowerCase()}`, value);
    }
    if (block.type === "code" && Array.isArray(block.props.slots)) {
      for (const slot of block.props.slots as { key: string; label: string; kind: string }[]) {
        const prop = `v_${slot.key}`;
        const value = String(block.props[prop] ?? "");
        const type = slot.kind === "image" ? "image_picker" : slot.kind === "link" ? "url" : slot.kind === "color" ? "color" : slot.kind === "textarea" ? "textarea" : "text";
        add(block, prop, type, slot.label, value);
      }
    }
  }
  return out.slice(0, 40);
}

export async function toShopifySection(site: Site, piece: Piece): Promise<{ file: string; filename: string }> {
  const section = pieceSection(piece);
  const settings = shopifySettings(section);
  const tokens = new Map(settings.map((s, i) => [s.key, TOKEN(i)]));
  const b = await buildPiece(site, { section }, tokens);
  const fallbackSrc = (i: number) => {
    const s = settings[i];
    const [blockId, prop] = s.key.split("|");
    const block = section.blocks.find((x) => x.id === blockId);
    return block ? String(block.props[prop] ?? "") : "";
  };
  let markup = b.markup;
  for (let i = settings.length - 1; i >= 0; i--) {
    const { setting } = settings[i];
    const v = `section.settings.${setting.id}`;
    const liquid =
      setting.type === "image_picker"
        ? `{% if ${v} != blank %}{{ ${v} | image_url: width: 2000 }}{% else %}${fallbackSrc(i).startsWith("asset:") ? "" : fallbackSrc(i)}{% endif %}`
        : setting.type === "textarea"
          ? `{{ ${v} | escape | newline_to_br }}`
          : setting.type === "url" || setting.type === "color"
            ? `{{ ${v} }}`
            : `{{ ${v} | escape }}`;
    markup = markup.split(TOKEN(i)).join(liquid);
  }
  const schema = {
    name: b.name.slice(0, 25),
    tag: "section",
    class: `fw-section ${b.wrapper}`,
    settings: settings.map((s) => s.setting),
    presets: [{ name: b.name.slice(0, 25) }]
  };
  const file = `${credits(b).replace(/<!--/, "{% comment %}").replace(/-->/, "{% endcomment %}")}${b.fontsUrl ? `<link rel="stylesheet" href="${b.fontsUrl}">\n` : ""}<style>${b.scopedCss}</style>
<div class="${b.wrapper}">${markup}</div>
${b.runtime ? `<script>${b.runtime}(document.currentScript.previousElementSibling);</script>\n` : ""}
{% schema %}
${JSON.stringify(schema, null, 2)}
{% endschema %}
`;
  return { file, filename: `fw-${b.slug}.liquid` };
}

export function codePenForm(b: PieceBundle): string {
  const data = {
    title: b.name,
    description: "A section",
    html: `${b.fontsUrl ? `<link rel="stylesheet" href="${b.fontsUrl}">\n` : ""}${b.markup}`,
    css: b.css,
    js: b.runtime ? `${b.runtime}(document.querySelector(".site-root"));` : "",
    editors: "110"
  };
  const value = JSON.stringify(data).replace(/"/g, "&quot;");
  return `<!doctype html><html><body><form id="f" action="https://codepen.io/pen/define" method="POST"><input type="hidden" name="data" value="${value}"></form><p>Opening CodePen…</p><script>document.getElementById("f").submit()</script></body></html>`;
}
