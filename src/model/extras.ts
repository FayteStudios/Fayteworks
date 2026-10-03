import type { ComponentType, ReactNode } from "react";
import type { BlockDefinition } from "../blocks/types";
import type { Block, Page, PageShell, Section, ShellType, Site } from "./types";

export interface ShellOption {
  value: ShellType;
  label: string;
  description: string;
}

export interface PageOutlineNode {
  key: string;
  label: string;
  note?: string;
  pageId: string;
  sectionId?: string;
  link?: { pageId: string; sectionId: string; href: string };
  children: PageOutlineNode[];
}

export interface PageOutline {
  heading: string;
  hint?: string;
  nodes: PageOutlineNode[];
  pageIds: string[];
}

export interface CardLayouts {
  options: ShellOption[];
  Shell: ComponentType<{ page: Page; sections: Section[]; pages: Page[]; renderSection?: (section: Section) => ReactNode }>;
  split<T>(shell: PageShell, sections: T[]): { intro: T | null; cards: T[] };
  cardTitle(section: Section, index: number, numbers: boolean): string;
  CardAside: ComponentType<{ page: Page; section: Section; index: number; children: ReactNode }>;
  PageSettings: ComponentType<{ page: Page; mutatePage: (recipe: (p: Page) => void, key: string) => void }>;
  SectionSettings: ComponentType<{ page: Page; section: Section; mutateSection: (recipe: (s: Section) => void, key: string) => void }>;
  css: string;
  runtime: (root: Document | HTMLElement) => () => void;
  /** More page scripts. Each is sent to the published site as its own text, so it must not use anything from outside its own body. */
  runtimes?: ((root: Document | HTMLElement) => () => void)[];
  outline?: (pages: Page[]) => PageOutline | null;
  fixedLayout?: (page: Page) => boolean;
  /** Layouts the editor shows whole, with each section edited where it sits (the Shell gets renderSection). */
  editInPlace?: (page: Page) => boolean;
}

const found = import.meta.glob<{ default: CardLayouts }>("/private/cards/index.tsx", { eager: true });

export const cardLayouts: CardLayouts | null = Object.values(found)[0]?.default ?? null;

export interface ExtensionScene {
  title: string;
  Scene: ComponentType<{ params: Record<string, string>; onClose: () => void }>;
}

type Runtime = (root: Document | HTMLElement) => () => void;

export interface ExtensionPart {
  blocks: string[];
  css?: string;
  runtime?: Runtime;
  /** The script also runs on pages without these pieces (it remembers visits, fills forms…). */
  everyPage?: boolean;
  uses?: (site: Site) => boolean;
}

export interface PieceTool {
  id: string;
  title: (block: Block) => string;
  Panel: ComponentType<{ block: Block; section: Section; mutate: (recipe: (b: Block) => void, key?: string) => void }>;
}

export interface Extension {
  id: string;
  blocks?: BlockDefinition[];
  scenes?: Record<string, ExtensionScene>;
  css?: string;
  runtime?: Runtime;
  parts?: ExtensionPart[];
  pieceTools?: PieceTool[];
  pieceAttrs?: (block: Block) => Record<string, string> | null;
  pieceAfter?: ComponentType<{ block: Block }>;
}

export const pieceTools: PieceTool[] = [];

const extensionModules = import.meta.glob<{ default: Extension }>("/private/*/extension.tsx", { eager: true });

export const extensions: Extension[] = Object.values(extensionModules).map((m) => m.default);
pieceTools.push(...extensions.flatMap((e) => e.pieceTools ?? []));

export function pieceAttrs(block: Block): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const e of extensions) Object.assign(attrs, e.pieceAttrs?.(block));
  if (Object.keys(attrs).length) attrs["data-ext"] = "";
  return attrs;
}

export function siteBlockTypes(site: Site): Set<string> {
  const types = new Set<string>();
  const sections = [site.header, site.footer, ...site.pages.flatMap((p) => p.sections), ...(site.components ?? []).flatMap((c) => [c.section, ...(c.variants ?? []).map((v) => v.section)])];
  for (const s of sections) for (const b of s?.blocks ?? []) types.add(b.type);
  for (const c of site.companions ?? []) types.add(c.type);
  return types;
}

export function extensionsUsedBy(site: Site): Extension[] {
  const types = siteBlockTypes(site);
  return extensions.filter((e) => !e.blocks?.length || e.blocks.some((b) => types.has(b.type)) || (e.parts ?? []).some((p) => p.uses?.(site)));
}

export const allExtensionRuntimes: Runtime[] = extensions.flatMap((e) => [e.runtime, ...(e.parts ?? []).map((p) => p.runtime)]).filter((r): r is Runtime => Boolean(r));

export function extensionCodeFor(site: Site): { css: string; runtimes: Runtime[]; everyPage: boolean } {
  const types = siteBlockTypes(site);
  const used = extensionsUsedBy(site);
  const parts = used.flatMap((e) => (e.parts ?? []).filter((p) => p.blocks.some((b) => types.has(b)) || p.uses?.(site)));
  return {
    css: [...used.map((e) => e.css ?? ""), ...parts.map((p) => p.css ?? "")].filter(Boolean).join("\n"),
    runtimes: [...used.map((e) => e.runtime), ...parts.map((p) => p.runtime)].filter((r): r is Runtime => Boolean(r)),
    everyPage: parts.some((p) => p.everyPage)
  };
}

export function extensionScene(id: string): ExtensionScene | undefined {
  for (const e of extensions) if (e.scenes?.[id]) return e.scenes[id];
  return undefined;
}
