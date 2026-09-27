import type { Block, ListItem, Site } from "../model/types";

export interface PictureRef {
  key: string;
  pageId: string;
  sectionId: string;
  blockId: string;
  listKey?: string;
  index?: number;
  src: string;
  alt: string;
  decorative: boolean;
  where: string;
  drawing?: string;
}

export function needsDescription(block: Block): boolean {
  const p = block.props;
  if (p.decorative) return false;
  if (block.type === "image") return Boolean(p.src) && !String(p.src).includes("{{") && !String(p.alt ?? "").trim();
  if (block.type === "card") return Boolean(p.image) && !String(p.alt ?? "").trim();
  if (block.type === "gallery" || block.type === "carousel") {
    const items = (block.type === "gallery" ? p.images : p.slides) as ListItem[] | undefined;
    return Array.isArray(items) && items.some((i) => i.image && !String(i.alt ?? "").trim());
  }
  return false;
}

export function pictures(site: Site): PictureRef[] {
  const out: PictureRef[] = [];
  const shared = [site.header, site.footer].filter(Boolean);
  const seen = new Set<string>();
  for (const page of site.pages) {
    for (const section of [...page.sections, ...(page.design ? [] : shared)] as NonNullable<typeof site.header>[]) {
      if (seen.has(section.id)) continue;
      seen.add(section.id);
      const place = page.sections.includes(section) ? page.title : section === site.header ? "Header" : "Footer";
      for (const b of section.blocks) {
        const base = { pageId: page.id, sectionId: section.id, blockId: b.id };
        const p = b.props;
        if (b.type === "image" && p.src && !String(p.src).includes("{{")) out.push({ ...base, key: b.id, src: String(p.src), alt: String(p.alt ?? ""), decorative: Boolean(p.decorative), where: `${place} › Image` });
        if (b.type === "card" && p.image) out.push({ ...base, key: b.id, src: String(p.image), alt: String(p.alt ?? ""), decorative: Boolean(p.decorative), where: `${place} › Card “${String(p.title ?? "").slice(0, 30)}”` });
        if ((b.type === "vector" || b.type === "flipbook") && (p.svg || p.frames)) {
          const svg = b.type === "vector" ? String(p.svg) : String((p.frames as ListItem[])?.[0]?.svg ?? "");
          out.push({ ...base, key: b.id, src: "", drawing: svg, alt: String(p.alt ?? ""), decorative: Boolean(p.decorative), where: `${place} › ${b.type === "vector" ? "Drawing" : "Flipbook"}` });
        }
        for (const [type, listKey, noun] of [["gallery", "images", "Gallery picture"], ["carousel", "slides", "Slide"]] as const) {
          if (b.type !== type || !Array.isArray(p[listKey])) continue;
          (p[listKey] as ListItem[]).forEach((item, index) => {
            if (item.image) out.push({ ...base, key: `${b.id}:${index}`, listKey, index, src: String(item.image), alt: String(item.alt ?? ""), decorative: false, where: `${place} › ${noun} ${index + 1}` });
          });
        }
      }
    }
  }
  return out;
}

export const lastUpload = { name: "", suggestion: "", at: 0 };
export function noteUpload(name: string, suggestion = "") {
  lastUpload.name = name;
  lastUpload.suggestion = suggestion;
  lastUpload.at = Date.now();
}

export function suggestFromName(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_.]+/g, " ").trim();
  if (!/[a-z]{3,}.*\s+[a-z]{2,}/i.test(base) || /^(img|dsc|pxl|screenshot|photo|image|untitled)\b/i.test(base)) return "";
  return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
}
