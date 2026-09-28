import { createElement } from "react";
import { assertPublishable } from "../catalogue/rights";
import { renderToStaticMarkup } from "react-dom/server";
import { domToCanvas } from "modern-screenshot";
import { sheetContext, sheetSize, unitPx } from "../model/design";
import { fontFaceCss, googleFontsCssUrl, themeGoogleFonts } from "../model/fonts";
import { themeVars } from "../model/theme";
import type { DesignFormat, Page, Site } from "../model/types";
import { desktop } from "../platform/desktop";
import { RenderCtx, type RenderContext } from "../site/renderContext";
import { PageRenderer } from "../site/SiteRenderer";
import siteCss from "../site/site.css?raw";
import { collectMediaRefs, getAsset, isAssetRef } from "../state/assets";
import { slugify } from "../util/slug";

export interface DesignExportOptions {
  format: "png" | "jpg" | "pdf";
  bleed: boolean;
  dpi: number;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function sheetsMarkup(site: Site, page: Page & { design: DesignFormat }): Promise<string> {
  const urls = new Map<string, string>();
  for (const ref of collectMediaRefs(page.sections)) {
    if (isAssetRef(ref)) {
      const asset = await getAsset(ref);
      if (asset) urls.set(ref, await blobToDataUrl(asset.blob));
    }
  }
  const ctx: RenderContext = {
    asset: (src) => urls.get(src) ?? src,
    link: (href) => ({ href: href || "#", external: false }),
    navPages: [],
    homePageId: site.pages[0].id,
    currentPageId: page.id,
    components: site.components,
    sheet: sheetContext(page.design)
  };
  return renderToStaticMarkup(createElement(RenderCtx.Provider, { value: ctx }, createElement(PageRenderer, { site, page })));
}

function imageScale(format: DesignFormat, dpi: number): number {
  const fullWidth = format.width + 2 * format.bleed;
  const px = format.kind === "social" ? format.width * (fullWidth / format.width) : (fullWidth * unitPx(format.unit) * dpi) / 96;
  return px / sheetSize(format).width;
}

async function sheetImages(site: Site, page: Page & { design: DesignFormat }, options: DesignExportOptions): Promise<Blob[]> {
  const markup = await sheetsMarkup(site, page);
  const host = document.createElement("div");
  host.className = "site-root design-export-host";
  for (const [name, value] of Object.entries(themeVars(site.theme))) host.style.setProperty(name, String(value));
  host.style.position = "fixed";
  host.style.left = "-100000px";
  host.style.top = "0";
  host.style.width = `${sheetSize(page.design).width}px`;
  host.innerHTML = markup;
  document.body.appendChild(host);
  try {
    await document.fonts.ready;
    await Promise.all(Array.from(host.querySelectorAll("img")).map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))))));
    const scale = imageScale(page.design, options.dpi);
    const { bleed } = sheetSize(page.design);
    const blobs: Blob[] = [];
    for (const sheet of Array.from(host.querySelectorAll<HTMLElement>(".site-section--sheet"))) {
      let canvas = await domToCanvas(sheet, { scale, backgroundColor: options.format === "jpg" ? "#ffffff" : null });
      const cut = options.bleed || page.design.kind === "social" ? 0 : Math.round(bleed * scale);
      if (cut > 0) {
        const trimmed = document.createElement("canvas");
        trimmed.width = canvas.width - 2 * cut;
        trimmed.height = canvas.height - 2 * cut;
        trimmed.getContext("2d")!.drawImage(canvas, -cut, -cut);
        canvas = trimmed;
      }
      blobs.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image."))), options.format === "jpg" ? "image/jpeg" : "image/png", 0.92)));
    }
    return blobs;
  } finally {
    host.remove();
  }
}

const thumbs = new Map<string, Promise<string>>();

function hashOf(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function designThumbnail(site: Site, page: Page & { design: DesignFormat }, width = 320): Promise<string> {
  const key = `${page.id}:${width}:${hashOf(JSON.stringify([page.sections, page.design, site.theme, site.components]))}`;
  let hit = thumbs.get(key);
  if (hit) return hit;
  hit = (async () => {
    const markup = await sheetsMarkup(site, page);
    const host = document.createElement("div");
    host.className = "site-root design-export-host";
    for (const [name, value] of Object.entries(themeVars(site.theme))) host.style.setProperty(name, String(value));
    host.style.position = "fixed";
    host.style.left = "-100000px";
    host.style.top = "0";
    host.style.width = `${sheetSize(page.design).width}px`;
    host.innerHTML = markup;
    document.body.appendChild(host);
    try {
      await document.fonts.ready;
      await Promise.all(Array.from(host.querySelectorAll("img")).map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))))));
      const sheet = host.querySelector<HTMLElement>(".site-section--sheet");
      if (!sheet) return "";
      const canvas = await domToCanvas(sheet, { scale: width / sheetSize(page.design).width, backgroundColor: "#ffffff" });
      return canvas.toDataURL("image/jpeg", 0.82);
    } finally {
      host.remove();
    }
  })();
  hit.catch(() => thumbs.delete(key));
  thumbs.set(key, hit);
  return hit;
}

export async function designShareImage(site: Site, page: Page & { design: DesignFormat }): Promise<Blob> {
  assertPublishable(site, page);
  const [first] = await sheetImages(site, page, { format: "jpg", bleed: false, dpi: 96 });
  if (!first) throw new Error("The design has no sheets.");
  return first;
}

export async function designPrintHtml(site: Site, page: Page & { design: DesignFormat }, bleed: boolean): Promise<{ html: string; width: string; height: string }> {
  const format = page.design;
  const size = sheetSize(format);
  const markup = await sheetsMarkup(site, page);
  const u = format.unit === "px" ? "px" : format.unit;
  const pageW = bleed ? format.width + 2 * format.bleed : format.width;
  const pageH = bleed ? format.height + 2 * format.bleed : format.height;
  const zoom = ((format.width + 2 * format.bleed) * unitPx(format.unit)) / size.width;
  const cut = bleed ? 0 : size.bleed;
  const fonts = googleFontsCssUrl(themeGoogleFonts(site.theme));
  const inlined = new Map<string, string>();
  for (const f of site.fonts ?? []) {
    const asset = isAssetRef(f.src) ? await getAsset(f.src) : undefined;
    if (asset) inlined.set(f.src, await blobToDataUrl(asset.blob));
  }
  const ownFonts = fontFaceCss(site.fonts, (src) => inlined.get(src) ?? src);
  const vars = Object.entries(themeVars(site.theme))
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${page.title}</title>
${fonts ? `<link rel="stylesheet" href="${fonts}">` : ""}
<style>${ownFonts}
${siteCss}
@page { size: ${pageW}${u} ${pageH}${u}; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.site-root { ${vars} width: ${size.width}px; zoom: ${zoom}; }
.print-page { width: ${size.width - 2 * cut}px; height: ${size.height - 2 * cut}px; overflow: hidden; break-after: page; }
.print-page:last-child { break-after: auto; }
.print-page > .site-section--sheet { margin: -${cut}px 0 0 -${cut}px; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body><div class="site-root">${markup}</div>
<script>
for (const sheet of document.querySelectorAll(".site-section--sheet")) {
  const page = document.createElement("div");
  page.className = "print-page";
  sheet.replaceWith(page);
  page.appendChild(sheet);
}
</script></body></html>`;
  return { html, width: `${pageW}${u}`, height: `${pageH}${u}` };
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportDesign(site: Site, page: Page & { design: DesignFormat }, options: DesignExportOptions): Promise<string> {
  assertPublishable(site, page);
  const base = slugify(page.title) || "design";
  if (options.format === "pdf") {
    const { html } = await designPrintHtml(site, page, options.bleed && page.design.kind === "print");
    if (desktop) {
      const saved = await desktop.printDesignPdf(html, `${base}.pdf`);
      return saved ? `Saved ${saved}` : "Cancelled.";
    }
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const win = window.open(url, "_blank");
    if (!win) throw new Error("Allow pop-ups for this page to print the design.");
    win.addEventListener("load", () => setTimeout(() => win.print(), 600));
    return "Opened the print dialog: choose “Save as PDF”, and no margins.";
  }
  const blobs = await sheetImages(site, page, options);
  const ext = options.format === "jpg" ? "jpg" : "png";
  const names = blobs.map((_, i) => (blobs.length > 1 ? `${base}-${i + 1}.${ext}` : `${base}.${ext}`));
  if (desktop) {
    const files = await Promise.all(blobs.map(async (b, i) => ({ path: names[i], data: new Uint8Array(await b.arrayBuffer()) })));
    const folder = await desktop.exportSite(files, true);
    return folder ? `Saved ${names.length} image${names.length > 1 ? "s" : ""} in ${folder}` : "Cancelled.";
  }
  blobs.forEach((b, i) => download(names[i], b));
  return `Downloaded ${names.join(", ")}.`;
}
