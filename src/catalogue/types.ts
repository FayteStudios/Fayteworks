import type { SlotKind } from "../site/customHtml";

export type CatalogueCategory = "Buttons" | "Cards" | "Sections" | "Text" | "Badges" | "Loaders" | "Forms" | "Decoration";

export type CatalogueLicence = "CC0" | "MIT" | "ISC";

export interface CatalogueSource {
  library: string;
  author: string;
  url: string;
  licence: CatalogueLicence;
  copyright?: string;
  changes?: string;
}

export interface CatalogueItem {
  id: string;
  name: string;
  category: CatalogueCategory;
  tags: string[];
  size: { w: number; h: number };
  fit?: "center" | "start" | "stretch";
  html: string;
  css: string;
  slots: { key: string; label: string; kind: SlotKind; value: string }[];
  source: CatalogueSource;
  dark?: boolean;
}
