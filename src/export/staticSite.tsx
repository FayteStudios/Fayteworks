import { renderToStaticMarkup } from "react-dom/server";
import { serviceTags } from "../services/siteServices";
import { fillTokens, itemValues } from "../data/model";
import { assertPublishable } from "../catalogue/rights";
import { slugify } from "../model/factory";
import { fontFaceCss, googleFontsCssUrl, themeGoogleFonts } from "../model/fonts";
import { themeVars } from "../model/theme";
import { PAGE_LINK_PREFIX, type Collection, type Page, type Site } from "../model/types";
import { Markdown } from "../site/markdown";
import { lockedBody, strongPassword } from "./protect";
import { isLangCode, pageDescription, pageTitle, siteLanguages } from "../i18n/i18n";
import { isExternalHref, RenderCtx, type RenderContext } from "../site/renderContext";
import { PageRenderer } from "../site/SiteRenderer";
import siteCss from "../site/site.css?raw";
import { initSite } from "../site/runtime";
import { cardLayouts, extensionsUsedBy } from "../model/extras";
import { allThemes, styleClass, styleOf, styleSetsCss } from "../model/styles";
import { collectMediaRefs, dataUrlToBlob, EDITOR_ONLY_PROPS, extensionFor, getAsset, hashBlob, isAssetRef } from "../state/assets";
import type { OutputFile } from "./zip";
import { thirdPartyNotices } from "../catalogue/notices";
import { spritesInUse } from "../sprites/sprites";

export type FontHosting = "embed" | "link";

export interface StaticSiteOptions {
  fonts: FontHosting;
  images?: "optimise" | "original";
}

export interface StaticSiteResult {
  files: OutputFile[];
  pageCount: number;
  assetCount: number;
  fontFileCount: number;
  imageSavings?: { before: number; after: number; count: number };
  fontWarning?: string;
  feedWarning?: string;
}

const encoder = new TextEncoder();

interface SearchEntry {
  l?: string;
  u: string;
  t: string;
  d: string;
  h: string;
  x: string;
}

function searchEntry(body: string, dir: string, title: string, description: string): SearchEntry {
  const doc = new DOMParser().parseFromString(`<body>${body}</body>`, "text/html");
  doc.querySelectorAll("script, style, template, noscript, .site-section--header, .site-section--footer, form, nav, .b-search").forEach((el) => el.remove());
  const headings = Array.from(doc.querySelectorAll("h1, h2, h3"), (h) => h.textContent?.trim() ?? "").filter(Boolean);
  const text = (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
  return { u: dir ? `${dir}/` : "", t: title, d: description, h: headings.join(" · ").slice(0, 600), x: text.slice(0, 8000) };
}

function rssFeed(site: Site, feed: { collection: Collection; dir: string; title: string; url: string }, baseUrl: string, assetPaths: Map<string, string>, sizeOf: (path: string) => number | undefined): string {
  const c = feed.collection;
  const podcast = c.podcast;
  const audioKey = podcast ? pickAudioKey(c) : undefined;
  const coverKey = c.fields.find((f) => f.type === "image")?.key;
  const durationKey = c.fields.find((f) => /duration|length/.test(f.key))?.key;
  const absolute = (src: string) => (assetPaths.has(src) ? absoluteUrl(baseUrl, assetPaths.get(src)!) : src);
  const pick = (test: (f: Collection["fields"][number]) => boolean) => c.fields.find(test)?.key;
  const titleKey = pick((f) => f.type === "text" && /title|name|heading/.test(f.key)) ?? pick((f) => f.type === "text");
  const dateKey = pick((f) => f.type === "date");
  const bodyKey = pick((f) => f.type === "markdown");
  const summaryKey = pick((f) => /excerpt|summary|description/.test(f.key));
  const pageUrl = (slug: string) => absoluteUrl(baseUrl, feed.dir ? `${feed.dir}/${slug}/` : `${slug}/`);
  const listUrl = absoluteUrl(baseUrl, feed.dir ? `${feed.dir}/` : "");
  const ctx: RenderContext = {
    asset: (src) => (assetPaths.has(src) ? absoluteUrl(baseUrl, assetPaths.get(src)!) : src),
    link: (href) => ({ href: isExternalHref(href) ? href : listUrl, external: true }),
    navPages: [],
    homePageId: "",
    currentPageId: ""
  };
  const cdata = (s: string) => `<![CDATA[${s.split("]]>").join("]]]]><![CDATA[>")}]]>`;
  const items = [...c.items]
    .sort((a, b) => String(b.values[dateKey ?? ""] ?? "").localeCompare(String(a.values[dateKey ?? ""] ?? "")))
    .slice(0, 50)
    .map((it) => {
      const values = itemValues(c, it);
      const link = pageUrl(it.slug);
      const date = dateKey && /^\d{4}-\d{2}-\d{2}/.test(String(values[dateKey])) ? new Date(`${String(values[dateKey]).slice(0, 10)}T12:00:00Z`) : null;
      const summary = String((summaryKey && values[summaryKey]) || (bodyKey && values[`${bodyKey}_text`]) || "");
      const content = bodyKey ? renderToStaticMarkup(<Markdown text={String(values[bodyKey] ?? "")} ctx={ctx} />) : "";
      return [
        "    <item>",
        `      <title>${escapeHtml(String((titleKey && values[titleKey]) || it.slug))}</title>`,
        `      <link>${escapeHtml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeHtml(link)}</guid>`,
        date && !Number.isNaN(date.getTime()) ? `      <pubDate>${date.toUTCString()}</pubDate>` : "",
        summary ? `      <description>${escapeHtml(summary)}</description>` : "",
        content ? `      <content:encoded>${cdata(content)}</content:encoded>` : "",
        ...(podcast ? podcastItem(values, audioKey, coverKey, durationKey, absolute, (src) => (assetPaths.has(src) ? sizeOf(assetPaths.get(src)!) : undefined)) : []),
        "    </item>"
      ]
        .filter(Boolean)
        .join("\n");
    });
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/"${podcast ? ` xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"` : ""}>`,
    "  <channel>",
    `    <title>${escapeHtml(feed.title)}</title>`,
    `    <link>${escapeHtml(listUrl)}</link>`,
    `    <description>${escapeHtml(podcast?.description?.trim() || `${c.name} from ${site.name}`)}</description>`,
    `    <language>${escapeHtml(site.settings.lang || "en")}</language>`,
    `    <atom:link href="${escapeHtml(feed.url)}" rel="self" type="application/rss+xml"/>`,
    ...(podcast ? podcastChannel(podcast, absolute) : []),
    ...items,
    "  </channel>",
    "</rss>",
    ""
  ].join("\n");
}

function pickAudioKey(c: Collection): string | undefined {
  return c.fields.find((f) => /audio|mp3|episode_file|enclosure|file/.test(f.key) && (f.type === "link" || f.type === "text"))?.key;
}

const AUDIO_TYPES: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/x-m4a", mp4: "video/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", flac: "audio/flac" };

function podcastChannel(p: NonNullable<Collection["podcast"]>, absolute: (src: string) => string): string[] {
  const image = p.image.trim() ? absolute(p.image.trim()) : "";
  return [
    `    <itunes:author>${escapeHtml(p.author)}</itunes:author>`,
    `    <itunes:owner><itunes:name>${escapeHtml(p.author)}</itunes:name><itunes:email>${escapeHtml(p.email)}</itunes:email></itunes:owner>`,
    image ? `    <itunes:image href="${escapeHtml(image)}"/>` : "",
    image ? `    <image><url>${escapeHtml(image)}</url></image>` : "",
    p.category ? `    <itunes:category text="${escapeHtml(p.category)}"/>` : "",
    `    <itunes:explicit>${p.explicit ? "true" : "false"}</itunes:explicit>`,
    `    <itunes:type>episodic</itunes:type>`
  ].filter(Boolean);
}

function podcastItem(values: Record<string, unknown>, audioKey: string | undefined, coverKey: string | undefined, durationKey: string | undefined, absolute: (src: string) => string, sizeOf: (src: string) => number | undefined): string[] {
  const src = audioKey ? String(values[audioKey] ?? "").trim() : "";
  if (!src) return [];
  const url = absolute(src);
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const cover = coverKey ? String(values[coverKey] ?? "").trim() : "";
  const duration = durationKey ? String(values[durationKey] ?? "").trim() : "";
  return [
    `      <enclosure url="${escapeHtml(url)}" length="${sizeOf(src) ?? 0}" type="${AUDIO_TYPES[ext] ?? "audio/mpeg"}"/>`,
    cover && /^(https?:|asset:)/.test(cover) ? `      <itunes:image href="${escapeHtml(absolute(cover))}"/>` : "",
    /^\d+(:\d{1,2}){0,2}$/.test(duration) ? `      <itunes:duration>${duration}</itunes:duration>` : ""
  ].filter(Boolean);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "#39" }[c]};`);
}

export function pageDirectories(pages: Page[], reserved: string[] = []): Map<string, string> {
  const dirs = new Map<string, string>();
  const used = new Set<string>(["assets", ...reserved]);
  const shareable = new Set<string>();
  const order = pages.map((page, index) => ({ page, index })).sort((a, b) => Number(Boolean(a.page.collectionId)) - Number(Boolean(b.page.collectionId)) || a.index - b.index);
  for (const { page, index } of order) {
    if (index === 0) {
      dirs.set(page.id, "");
      continue;
    }
    const base = slugify(page.slug || page.title);
    if (page.collectionId && shareable.has(base)) {
      shareable.delete(base);
      dirs.set(page.id, base);
      continue;
    }
    let dir = base;
    for (let n = 2; used.has(dir); n++) dir = `${base}-${n}`;
    used.add(dir);
    if (!page.collectionId) shareable.add(dir);
    dirs.set(page.id, dir);
  }
  return dirs;
}

const MAX_IMAGE_WIDTH = 2400;

async function optimiseImage(blob: Blob): Promise<Blob | null> {
  if (!/^image\/(png|jpeg|webp)$/.test(blob.type) || typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") return null;
  if (blob.size < 30 * 1024) return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
    if (blob.type === "image/webp" && scale === 1) {
      bitmap.close();
      return null;
    }
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    const g = canvas.getContext("2d");
    if (!g) return null;
    g.imageSmoothingQuality = "high";
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
    return out.type === "image/webp" && out.size < blob.size * 0.95 ? out : null;
  } catch {
    return null;
  }
}

async function collectAssets(site: Site, files: OutputFile[], optimise = true, savings = { before: 0, after: 0, count: 0 }): Promise<Map<string, string>> {
  const paths = new Map<string, string>();
  const sheets = new Set(spritesInUse(site).map((s) => s.sheet));
  for (const ref of collectMediaRefs({ ...site, sprites: undefined }, new Set(sheets), EDITOR_ONLY_PROPS)) {
    const original = isAssetRef(ref) ? (await getAsset(ref))?.blob : await dataUrlToBlob(ref);
    if (!original) continue;
    const smaller = optimise && !sheets.has(ref) ? await optimiseImage(original) : null;
    if (smaller) {
      savings.before += original.size;
      savings.after += smaller.size;
      savings.count++;
    }
    const blob = smaller ?? original;
    const path = `assets/${await hashBlob(blob)}.${extensionFor(blob.type)}`;
    if (!files.some((f) => f.path === path)) {
      files.push({ path, data: new Uint8Array(await blob.arrayBuffer()) });
    }
    paths.set(ref, path);
  }
  return paths;
}

async function embedGoogleFonts(cssUrl: string, files: OutputFile[]): Promise<{ css: string; count: number }> {
  const response = await fetch(cssUrl);
  if (!response.ok) throw new Error(`Google Fonts returned ${response.status}`);
  let css = await response.text();
  const urls = [...new Set(Array.from(css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g), (m) => m[1]))];
  for (const url of urls) {
    const blob = await (await fetch(url)).blob();
    const ext = url.split(".").pop()?.split(/[?#]/)[0] || "woff2";
    const path = `assets/fonts/${await hashBlob(blob)}.${ext}`;
    files.push({ path, data: new Uint8Array(await blob.arrayBuffer()) });
    css = css.split(url).join(path);
  }
  return { css: `/* Fonts from Google Fonts (SIL Open Font License / Apache 2.0), hosted with this site. */\n${css}\n`, count: urls.length };
}

function themeCss(site: Site): string {
  const vars = Object.entries(themeVars(site.theme))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
  return `:root {\n${vars}\n}\n\n${styleSetsCss(site)}\n`;
}

function absoluteUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path}`;
}

export async function buildStaticSite(site: Site, options: StaticSiteOptions = { fonts: "embed" }): Promise<StaticSiteResult> {
  assertPublishable(site);
  const files: OutputFile[] = [];
  const fontsUrl = googleFontsCssUrl(allThemes(site).flatMap(themeGoogleFonts));
  let fontCss = "";
  let fontFileCount = 0;
  let fontWarning: string | undefined;
  let linkFonts = Boolean(fontsUrl) && options.fonts === "link";
  if (fontsUrl && options.fonts === "embed") {
    try {
      const embedded = await embedGoogleFonts(fontsUrl, files);
      fontCss = embedded.css;
      fontFileCount = embedded.count;
    } catch (error) {
      linkFonts = true;
      fontWarning = `Couldn't download the fonts (${error instanceof Error ? error.message : "offline?"}), so pages link to Google Fonts instead.`;
    }
  }
  const imageSavings = { before: 0, after: 0, count: 0 };
  const assetPaths = await collectAssets(site, files, options.images !== "original", imageSavings);
  const dirs = pageDirectories(site.pages, (site.languages ?? []).map((l) => l.code));
  const baseUrl = site.settings.baseUrl.trim();
  const navPages = site.pages.filter((p, i) => i === 0 || !p.hideInNav).map((p) => ({ id: p.id, title: p.title }));
  const homePageId = site.pages[0].id;

  let needsScript = false;
  const searchEntries: SearchEntry[] = [];
  let usesSearch = false;
  const feedCollections = (site.collections ?? []).filter((c) => c.feed && site.pages.some((p) => p.collectionId === c.id && !p.protect?.password));
  const feeds = baseUrl
    ? feedCollections.map((c) => {
        const dir = dirs.get(site.pages.find((p) => p.collectionId === c.id)!.id) ?? "";
        return { collection: c, dir, title: `${site.name} · ${c.name}`, url: absoluteUrl(baseUrl, dir ? `${dir}/feed.xml` : "feed.xml") };
      })
    : [];
  const feedWarning = feedCollections.length && !baseUrl ? `No RSS feed for ${feedCollections.map((c) => c.name).join(", ")}: set the site address in page settings (Help → Guides → “Set your site's address”).` : undefined;
  const templatePages = Object.fromEntries(site.pages.filter((p) => p.collectionId).map((p) => [p.collectionId!, p.id]));
  const languages = siteLanguages(site).filter((l, i) => i === 0 || isLangCode(l.code));
  const mainLang = languages[0].code;
  const weak = site.pages.find((p) => p.protect && !strongPassword(p.protect.password));
  if (weak) throw new Error(`“${weak.title}” is set to need a password, but its password isn't strong enough yet. Page settings → Password.`);
  const renders: { page: (typeof site.pages)[number]; dir: string; base: string; lang: string; item?: { values: Record<string, string | number | boolean>; url: string } }[] = [];
  for (const { code } of languages) {
    const prefix = code === mainLang ? "" : code;
    const at = (base: string) => [prefix, base].filter(Boolean).join("/");
    for (const page of site.pages) {
      if (page.design) continue;
      const dir = dirs.get(page.id)!;
      const collection = page.collectionId ? site.collections?.find((c) => c.id === page.collectionId) : undefined;
      if (collection) {
        for (const it of collection.items) {
          const base = dir ? `${dir}/${it.slug}` : it.slug;
          renders.push({ page, dir: at(base), base, lang: code, item: { values: itemValues(collection, it), url: "" } });
        }
      } else renders.push({ page, dir: at(dir), base: dir, lang: code });
    }
  }
  for (const { page: templatePage, dir, item, lang, base } of renders) {
    const inLang = lang === mainLang ? templatePage : { ...templatePage, title: pageTitle(templatePage, lang), seo: { ...templatePage.seo, description: pageDescription(templatePage, lang) } };
    const page = item
      ? { ...inLang, title: fillTokens(inLang.title, item), seo: { ...inLang.seo, description: fillTokens(inLang.seo.description, item), image: fillTokens(inLang.seo.image, item) } }
      : inLang;
    const langPrefix = lang === mainLang ? "" : `${lang}/`;
    const toRoot = dir ? "../".repeat(dir.split("/").length) : "";
    const pageUrl = baseUrl ? absoluteUrl(baseUrl, dir ? `${dir}/` : "") : "";

    const ctx: RenderContext = {
      pageUrl: pageUrl || undefined,
      asset: (src) => {
        const path = assetPaths.get(src);
        return path ? toRoot + path : src;
      },
      link: (href) => {
        if (href.startsWith(PAGE_LINK_PREFIX)) {
          const target = dirs.get(href.slice(PAGE_LINK_PREFIX.length));
          if (target === undefined) return { href: "#", external: false };
          const full = langPrefix + (target ? `${target}/` : "");
          return { href: full ? `${toRoot}${full}` : toRoot || "./", external: false };
        }
        if (href.startsWith("item:")) {
          const [, pageId, slug] = href.split(":");
          const target = dirs.get(pageId);
          return target === undefined ? { href: "#", external: false } : { href: `${toRoot}${langPrefix}${target ? `${target}/` : ""}${slug}/`, external: false };
        }
        return { href: href || "#", external: isExternalHref(href) };
      },
      navPages: lang === mainLang ? navPages : navPages.map((n) => ({ ...n, title: pageTitle(site.pages.find((p) => p.id === n.id)!, lang) })),
      homePageId,
      currentPageId: page.id,
      lang: lang === mainLang ? undefined : lang,
      alternates: languages.map((l) => {
        const other = [l.code === mainLang ? "" : l.code, base].filter(Boolean).join("/");
        return { code: l.code, label: l.label, href: other ? `${toRoot}${other}/` : toRoot || "./", current: l.code === lang };
      }),
      components: site.components,
      collections: site.collections,
      extras: site.extras,
      sprites: site.sprites,
      templatePages,
      item
    };

    const body = renderToStaticMarkup(
      <RenderCtx.Provider value={ctx}>
        <PageRenderer site={site} page={page} />
      </RenderCtx.Provider>
    );

    const locked = Boolean(templatePage.protect?.password);
    if (!locked) searchEntries.push({ ...searchEntry(body, dir, page.title === site.name || !page.title ? site.name : page.title, page.seo.description), ...(languages.length > 1 ? { l: lang } : {}) });
    usesSearch ||= body.includes('data-js="search"');

    const pageNeedsScript = /data-(js|reveal|parallax|draw-anim|anim|sound)=/.test(body);
    needsScript ||= pageNeedsScript;
    const isHome = page.id === homePageId;
    const title = isHome ? site.name : `${page.title} · ${site.name}`;
    const description = page.seo.description.trim();
    const socialImage = page.seo.image ? assetPaths.get(page.seo.image) ?? page.seo.image : "";
    const favicon = site.settings.favicon ? assetPaths.get(site.settings.favicon) ?? site.settings.favicon : "";

    const services = serviceTags(site.services, body);
    const head = [
      `<meta charset="utf-8">`,
      `<meta name="viewport" content="width=device-width, initial-scale=1">`,
      `<title>${escapeHtml(title)}</title>`,
      description && `<meta name="description" content="${escapeHtml(description)}">`,
      pageUrl && `<link rel="canonical" href="${escapeHtml(pageUrl)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:title" content="${escapeHtml(title)}">`,
      description && `<meta property="og:description" content="${escapeHtml(description)}">`,
      pageUrl && `<meta property="og:url" content="${escapeHtml(pageUrl)}">`,
      socialImage &&
        `<meta property="og:image" content="${escapeHtml(
          isExternalHref(socialImage) ? socialImage : baseUrl ? absoluteUrl(baseUrl, socialImage) : toRoot + socialImage
        )}">`,
      socialImage && `<meta name="twitter:card" content="summary_large_image">`,
      favicon && `<link rel="icon" href="${escapeHtml(isExternalHref(favicon) ? favicon : toRoot + favicon)}">`,
      linkFonts && `<link rel="preconnect" href="https://fonts.googleapis.com">`,
      linkFonts && `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
      linkFonts && `<link rel="stylesheet" href="${escapeHtml(fontsUrl!)}">`,
      `<link rel="stylesheet" href="${toRoot}site.css">`,
      ...feeds.map((f) => `<link rel="alternate" type="application/rss+xml" title="${escapeHtml(f.title)}" href="${escapeHtml(f.url)}">`),
      locked && `<meta name="robots" content="noindex">`,
      ...(languages.length > 1
        ? [...languages.map((l) => ({ code: l.code, rel: [l.code === mainLang ? "" : l.code, base].filter(Boolean).join("/") })), { code: "x-default", rel: base }].map(
            ({ code, rel }) => `<link rel="alternate" hreflang="${escapeHtml(code)}" href="${escapeHtml(baseUrl ? absoluteUrl(baseUrl, rel ? `${rel}/` : "") : rel ? `${toRoot}${rel}/` : toRoot || "./")}">`
          )
        : []),
      pageNeedsScript && `<script src="${toRoot}site.js" defer></script>`,
      ...services.head
    ]
      .filter(Boolean)
      .join("\n    ");

    const pageStyle = styleOf(site, templatePage);
    const shownBody = locked ? await lockedBody(body, templatePage.protect!.password, site.name, templatePage.protect!.hint ?? "") : body;
    const html = `<!doctype html>
<html lang="${escapeHtml(lang)}"${locked ? " data-fw-locked" : ""}>
  <head>
    ${head}
  </head>
  <body class="site-root${pageStyle ? ` ${styleClass(pageStyle)}` : ""}">
${shownBody}${services.bodyEnd.length ? `\n    ${services.bodyEnd.join("\n    ")}` : ""}
  </body>
</html>
`;
    files.push({ path: dir ? `${dir}/index.html` : "index.html", data: encoder.encode(html) });
  }

  const ownFonts = fontFaceCss(site.fonts, (src) => assetPaths.get(src) ?? src);
  files.push({ path: "site.css", data: encoder.encode((ownFonts ? ownFonts + "\n" : "") + fontCss + themeCss(site) + siteCss + (cardLayouts?.css ?? "") + extensionsUsedBy(site).map((e) => e.css ?? "").join("\n")) });
  if (needsScript) {
    files.push({ path: "site.js", data: encoder.encode(`/* Site behaviours: scroll reveal, carousels, lightbox, tabs, video. */
// On a password-protected page it waits until the page has been opened.
(function () {
  var run = function () { (${initSite.toString()})(document);${cardLayouts ? ` (${cardLayouts.runtime.toString()})(document);` : ""}${extensionsUsedBy(site).map((e) => (e.runtime ? ` (${e.runtime.toString()})(document);` : "")).join("")} };
  if (document.documentElement.hasAttribute("data-fw-locked")) document.addEventListener("fw:unlocked", run, { once: true });
  else run();
})();
`) });
  }

  const notices = thirdPartyNotices(site);
  if (notices) files.push({ path: "third-party-notices.txt", data: encoder.encode(notices) });

  const robots = ["User-agent: *", "Allow: /", baseUrl && `Sitemap: ${absoluteUrl(baseUrl, "sitemap.xml")}`];
  files.push({ path: "robots.txt", data: encoder.encode(robots.filter(Boolean).join("\n") + "\n") });

  if (baseUrl) {
    const urls = renders
      .filter(({ page }) => !page.protect?.password)
      .map(({ dir }) => `  <url><loc>${escapeHtml(absoluteUrl(baseUrl, dir ? `${dir}/` : ""))}</loc></url>`)
      .join("\n");
    files.push({
      path: "sitemap.xml",
      data: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
    });
  }

  if (usesSearch) files.push({ path: "search-index.json", data: encoder.encode(JSON.stringify(searchEntries)) });
  for (const feed of feeds) files.push({ path: feed.dir ? `${feed.dir}/feed.xml` : "feed.xml", data: encoder.encode(rssFeed(site, feed, baseUrl, assetPaths, (path) => files.find((f) => f.path === path)?.data.length)) });

  return { files, pageCount: renders.length, assetCount: assetPaths.size, fontFileCount, fontWarning, feedWarning, imageSavings: imageSavings.count ? imageSavings : undefined };
}
