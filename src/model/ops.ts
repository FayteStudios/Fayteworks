import { createId } from "../util/id";
import type { Block, Page, Section, Site } from "./types";

export type SectionRole = "header" | "footer" | "page" | "component";

export function findPage(site: Site, pageId: string): Page | undefined {
  return site.pages.find((p) => p.id === pageId);
}

export function pageSectionsWithShared(site: Site, page: Page): { section: Section; role: SectionRole }[] {
  if (page.design || page.standalone) return page.sections.map((section) => ({ section, role: "page" as const }));
  return [
    ...(site.header ? [{ section: site.header, role: "header" as const }] : []),
    ...page.sections.map((section) => ({ section, role: "page" as const })),
    ...(site.footer ? [{ section: site.footer, role: "footer" as const }] : [])
  ];
}

export function findSection(site: Site, pageId: string, sectionId: string): Section | undefined {
  if (site.header?.id === sectionId) return site.header;
  if (site.footer?.id === sectionId) return site.footer;
  return findPage(site, pageId)?.sections.find((s) => s.id === sectionId) ?? componentSection(site, sectionId);
}

export function allSections(site: Site): Section[] {
  const sections: Section[] = [];
  if (site.header) sections.push(site.header);
  if (site.footer) sections.push(site.footer);
  for (const page of site.pages) sections.push(...page.sections);
  for (const c of site.components ?? []) {
    sections.push(c.section);
    for (const v of c.variants ?? []) sections.push(v.section);
  }
  return sections;
}

export function componentSection(site: Site, sectionId: string): Section | undefined {
  for (const c of site.components ?? []) {
    if (c.section.id === sectionId) return c.section;
    const variant = c.variants?.find((v) => v.section.id === sectionId);
    if (variant) return variant.section;
  }
  return undefined;
}

export function findBlock(site: Site, pageId: string, sectionId: string, blockId: string): Block | undefined {
  return findSection(site, pageId, sectionId)?.blocks.find((b) => b.id === blockId);
}

export function removeSection(site: Site, pageId: string, sectionId: string): void {
  if (site.header?.id === sectionId) {
    site.header = null;
  } else if (site.footer?.id === sectionId) {
    site.footer = null;
  } else {
    const page = findPage(site, pageId);
    if (page) page.sections = page.sections.filter((s) => s.id !== sectionId);
  }
}

export function moveItem<T>(items: T[], from: number, to: number): void {
  if (to < 0 || to >= items.length || from === to) {
    return;
  }
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
}

export function maxBottom(blocks: Block[]): number {
  return blocks.reduce((max, b) => Math.max(max, b.y + b.h), 0);
}

export function sectionRows(section: Section): number {
  return Math.max(section.settings.minRows, maxBottom(section.blocks), 1);
}

export function cloneBlock(block: Block): Block {
  return { ...structuredClone(block), id: createId("blk") };
}

export function cloneSection(section: Section): Section {
  return {
    ...structuredClone(section),
    id: createId("sec"),
    name: `${section.name} copy`,
    blocks: section.blocks.map(cloneBlock)
  };
}
