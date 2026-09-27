import { allSections } from "../model/ops";
import type { Block, Page, Site } from "../model/types";

export const REFERENCE_ONLY = "Reference only";

export const isReferenceOnly = (block: Block) => block.type === "code" && block.props.licence === REFERENCE_ONLY;

export function referenceBlocks(site: Site, only?: Page): { block: Block; where: string }[] {
  const found: { block: Block; where: string }[] = [];
  const pages = only ? [only] : site.pages.filter((p) => !p.design);
  for (const page of pages) for (const section of page.sections) for (const block of section.blocks) if (isReferenceOnly(block)) found.push({ block, where: `${page.title} › ${section.name}` });
  if (!only) {
    for (const section of [site.header, site.footer].filter(Boolean)) for (const block of section!.blocks) if (isReferenceOnly(block)) found.push({ block, where: section!.name });
    for (const c of site.components ?? []) for (const section of [c.section, ...(c.variants ?? []).map((v) => v.section)]) for (const block of section.blocks) if (isReferenceOnly(block)) found.push({ block, where: `Component “${c.name}”` });
  }
  return found;
}

export function assertPublishable(site: Site, only?: Page) {
  const found = referenceBlocks(site, only);
  if (!found.length) return;
  const list = found
    .slice(0, 5)
    .map(({ block, where }) => `“${String(block.props.name || "Captured component")}” (${where})`)
    .join(", ");
  throw new Error(
    `Not exported: ${found.length} piece${found.length === 1 ? " was" : "s were"} captured from another website for reference only: ${list}${found.length > 5 ? "…" : ""}. ` +
      "Rebuild them in your own way (then set their licence to Own work), or set the licence you were given if you have permission."
  );
}

export { allSections };
