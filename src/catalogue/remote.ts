import type { BlockProps } from "../model/types";
import { extractSlots, sanitizeHtml, SLOT_PREFIX } from "../site/customHtml";
import { tailwindKey } from "../tailwind/key";

export interface RemoteSource {
  id: string;
  name: string;
  repository: string;
  commit: string;
  licence: string;
  copyright: string;
  kind: "css" | "tailwind";
  preset?: "on" | "flowbite";
}

export interface RemoteEntry {
  key: string;
  name: string;
  category: string;
  path: string;
  author: string;
  tags: string[];
  dark: boolean;
  hasDark: boolean;
  source: RemoteSource;
}

interface UiverseIndex {
  source: Omit<RemoteSource, "id" | "kind">;
  categories: string[];
  authors: string[];
  items: [number, string, number, string, string, number][];
}

interface TailwindIndex {
  sources: RemoteSource[];
  categories: string[];
  items: [number, number, string, string, number, string][];
}

export interface RemoteCatalogue {
  sources: RemoteSource[];
  entries: RemoteEntry[];
  categories: string[];
}

let uiverse: Promise<RemoteCatalogue> | null = null;
let tailwind: Promise<RemoteCatalogue> | null = null;

export function loadUiverse(): Promise<RemoteCatalogue> {
  uiverse ??= import("./uiverse-index.json").then((module) => {
    const data = (module.default ?? module) as unknown as UiverseIndex;
    const source: RemoteSource = { ...data.source, id: "uiverse", kind: "css" };
    const entries = data.items.map(([category, path, author, tags, name, dark]) => ({
      key: `uv:${path}`,
      name,
      category: data.categories[category],
      path,
      author: data.authors[author],
      tags: tags ? tags.split(",") : [],
      dark: dark === 1,
      hasDark: false,
      source
    }));
    return { sources: [source], entries, categories: data.categories };
  });
  return uiverse;
}

export function loadTailwindLibraries(): Promise<RemoteCatalogue> {
  tailwind ??= import("./tailwind-index.json").then((module) => {
    const data = (module.default ?? module) as unknown as TailwindIndex;
    const entries = data.items.map(([sourceIndex, category, path, name, hasDark, author]) => {
      const source = data.sources[sourceIndex];
      return {
        key: `${source.id}:${path}`,
        name,
        category: data.categories[category],
        path,
        author,
        tags: ["tailwind"],
        dark: false,
        hasDark: hasDark === 1,
        source
      };
    });
    return { sources: data.sources, entries, categories: data.categories };
  });
  return tailwind;
}

const repoPath = (path: string) => path.split("#")[0].split("/").map(encodeURIComponent).join("/");

export function sourceUrl(entry: RemoteEntry): string {
  const { repository, commit } = entry.source;
  return `https://github.com/${repository}/blob/${commit}/${repoPath(entry.path)}`;
}

const files = new Map<string, Promise<string>>();

function download(entry: RemoteEntry, path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${entry.source.repository}/${entry.source.commit}/${repoPath(path)}`;
  let pending = files.get(url);
  if (!pending) {
    pending = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Couldn't download the component (${response.status}).`);
      return response.text();
    });
    pending.catch(() => files.delete(url));
    files.set(url, pending);
  }
  return pending;
}

function bodyOf(page: string): string {
  const body = page.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? page;
  return body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<link[^>]*>/gi, "").trim();
}

function flowbiteExample(md: string, n: number): string {
  const examples = [...md.matchAll(/^\{\{<\s*example\b([^\n]*?)>\}\}\n([\s\S]*?)^\{\{<\s*\/example\s*>\}\}/gm)];
  const match = examples[n];
  if (!match) throw new Error("This example is no longer in the file.");
  const wrapper = match[1].match(/\bclass="([^"]*)"/)?.[1];
  return wrapper ? `<div class="${wrapper}">\n${match[2].trim()}\n</div>` : match[2].trim();
}

export async function fetchComponent(entry: RemoteEntry, dark = false): Promise<{ html: string; css: string }> {
  const { source } = entry;
  if (source.id === "uiverse") {
    const text = await download(entry, entry.path);
    const styles = [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1].trim());
    return { html: text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").trim(), css: styles.join("\n\n") };
  }
  if (source.id === "flowbite") {
    const [file, n] = entry.path.split("#");
    return { html: flowbiteExample(await download(entry, file), Number(n)), css: "" };
  }
  const useDark = dark && entry.hasDark;
  const path = useDark && source.id === "hyperui" ? entry.path.replace(/\.html$/, "-dark.html") : entry.path;
  const html = bodyOf(await download(entry, path));
  return { html: useDark ? `<div class="dark">\n${html}\n</div>` : html, css: "" };
}

export function remoteSize(category: string): { w: number; h: number; fit: "center" | "start" | "stretch" } {
  switch (category) {
    case "Cards":
      return { w: 4, h: 16, fit: "center" };
    case "Forms":
      return { w: 5, h: 18, fit: "center" };
    case "Patterns":
      return { w: 12, h: 12, fit: "stretch" };
    case "Loaders":
      return { w: 2, h: 5, fit: "center" };
    case "Inputs":
    case "Radio buttons":
    case "Notifications":
      return { w: 4, h: 5, fit: "center" };
    case "Checkboxes":
    case "Toggles":
    case "Badges":
      return { w: 2, h: 3, fit: "center" };
    case "Tooltips":
      return { w: 3, h: 4, fit: "center" };
    case "Buttons":
      return { w: 3, h: 3, fit: "center" };
    case "Navigation":
      return { w: 12, h: 4, fit: "stretch" };
    case "Tables":
    case "Modals":
      return { w: 8, h: 14, fit: "center" };
    default:
      return { w: 12, h: 20, fit: "stretch" };
  }
}

export async function remoteBlockProps(entry: RemoteEntry, { html, css }: { html: string; css: string }): Promise<BlockProps> {
  const { source } = entry;
  const doc = new DOMParser().parseFromString(`<body>${sanitizeHtml(html)}</body>`, "text/html");
  let linkified = false;
  for (const button of Array.from(doc.body.querySelectorAll("button"))) {
    if (button.closest("form, a")) continue;
    const link = doc.createElement("a");
    for (const attr of Array.from(button.attributes)) if (attr.name !== "type" && attr.name !== "disabled") link.setAttribute(attr.name, attr.value);
    link.setAttribute("href", "#");
    link.append(...Array.from(button.childNodes));
    button.replaceWith(link);
    linkified = true;
  }
  const { template, slots } = extractSlots(doc.body.innerHTML);
  const size = remoteSize(entry.category);
  const props: BlockProps = {
    html: template,
    css: linkified && source.kind === "css" ? `a { text-decoration: none; }\n\n${css}` : css,
    slots: slots.map(({ key, label, kind }) => ({ key, label, kind })),
    fit: size.fit,
    name: entry.name,
    author: entry.author,
    source: sourceUrl(entry),
    licence: source.licence,
    copyright: source.copyright,
    catalogueId: entry.key
  };
  if (source.kind === "tailwind") {
    const preset = source.preset ?? "on";
    const { compileTailwind } = await import("../tailwind/compile");
    props.tailwind = preset;
    props.tailwindCss = await compileTailwind(template, preset);
    props.tailwindFor = tailwindKey(preset, template);
  }
  for (const slot of slots) props[`${SLOT_PREFIX}${slot.key}`] = slot.value;
  return props;
}
