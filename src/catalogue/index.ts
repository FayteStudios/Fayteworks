import type { BlockProps } from "../model/types";
import { SLOT_PREFIX } from "../site/customHtml";
import { originalItems } from "./originals";
import type { CatalogueCategory, CatalogueItem } from "./types";
import { uiverseItems } from "./uiverse";

export type { CatalogueCategory, CatalogueItem } from "./types";

export const CATALOGUE: CatalogueItem[] = [...originalItems, ...uiverseItems];

export const CATALOGUE_CATEGORIES: CatalogueCategory[] = ["Sections", "Cards", "Text", "Buttons", "Badges", "Forms", "Loaders", "Decoration"];

export const CATALOGUE_LIBRARIES = [
  { name: "FayteWorks", licence: "CC0", url: "" },
  { name: "Uiverse", licence: "MIT", url: "https://github.com/uiverse-io/galaxy" },
  { name: "HyperUI", licence: "MIT", url: "https://github.com/markmead/hyperui" },
  { name: "Meraki UI", licence: "MIT", url: "https://github.com/merakiuilabs/merakiui" },
  { name: "Flowbite", licence: "MIT", url: "https://github.com/themesberg/flowbite" },
  { name: "Tailwind CSS", licence: "MIT", url: "https://github.com/tailwindlabs/tailwindcss" }
];

export function searchCatalogue(query: string, category: CatalogueCategory | "All"): CatalogueItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return CATALOGUE.filter((item) => {
    if (category !== "All" && item.category !== category) return false;
    const haystack = [item.name, item.category, item.source.library, item.source.author, ...item.tags].join(" ").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export function catalogueBlockProps(item: CatalogueItem): BlockProps {
  const props: BlockProps = {
    html: item.html,
    css: item.css,
    slots: item.slots.map(({ key, label, kind }) => ({ key, label, kind })),
    fit: item.fit ?? "center",
    name: item.name,
    author: item.source.author,
    source: item.source.url,
    licence: item.source.licence,
    copyright: item.source.copyright ?? "",
    catalogueId: item.id
  };
  for (const slot of item.slots) props[`${SLOT_PREFIX}${slot.key}`] = slot.value;
  return props;
}
