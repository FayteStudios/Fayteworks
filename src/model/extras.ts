import type { ComponentType, ReactNode } from "react";
import type { BlockDefinition } from "../blocks/types";
import type { Page, PageShell, Section, ShellType, Site } from "./types";

export interface ShellOption {
  value: ShellType;
  label: string;
  description: string;
}

export interface CardLayouts {
  options: ShellOption[];
  Shell: ComponentType<{ page: Page; sections: Section[]; pages: Page[] }>;
  split<T>(shell: PageShell, sections: T[]): { intro: T | null; cards: T[] };
  cardTitle(section: Section, index: number, numbers: boolean): string;
  CardAside: ComponentType<{ page: Page; section: Section; index: number; children: ReactNode }>;
  PageSettings: ComponentType<{ page: Page; mutatePage: (recipe: (p: Page) => void, key: string) => void }>;
  SectionSettings: ComponentType<{ page: Page; section: Section; mutateSection: (recipe: (s: Section) => void, key: string) => void }>;
  css: string;
  runtime: (root: Document | HTMLElement) => () => void;
}

const found = import.meta.glob<{ default: CardLayouts }>("/private/cards/index.tsx", { eager: true });

export const cardLayouts: CardLayouts | null = Object.values(found)[0]?.default ?? null;

export interface Extension {
  id: string;
  blocks?: BlockDefinition[];
  css?: string;
  runtime?: (root: Document | HTMLElement) => () => void;
}

const extensionModules = import.meta.glob<{ default: Extension }>("/private/*/extension.tsx", { eager: true });

export const extensions: Extension[] = Object.values(extensionModules).map((m) => m.default);

export function siteBlockTypes(site: Site): Set<string> {
  const types = new Set<string>();
  const sections = [site.header, site.footer, ...site.pages.flatMap((p) => p.sections), ...(site.components ?? []).flatMap((c) => [c.section, ...(c.variants ?? []).map((v) => v.section)])];
  for (const s of sections) for (const b of s?.blocks ?? []) types.add(b.type);
  return types;
}

export function extensionsUsedBy(site: Site): Extension[] {
  const types = siteBlockTypes(site);
  return extensions.filter((e) => !e.blocks?.length || e.blocks.some((b) => types.has(b.type)));
}
