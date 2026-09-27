import { createComponent } from "../model/components";
import { createBlock, createPage, createSection } from "../model/factory";
import type { Block, Collection, ComponentDef, Page } from "../model/types";

export function cardDesignFor(collection: Collection): ComponentDef {
  const blocks: Block[] = [];
  let y = 0;
  const image = collection.fields.find((f) => f.type === "image");
  const title = collection.fields.find((f) => f.type === "text" && /title|name|heading/.test(f.key)) ?? collection.fields.find((f) => f.type === "text");
  const text = collection.fields.find((f) => f.type === "longtext") ?? collection.fields.find((f) => f.type === "text" && f !== title);
  const number = collection.fields.find((f) => f.type === "number");
  const date = collection.fields.find((f) => f.type === "date");
  if (image) {
    blocks.push(createBlock("image", { x: 0, y, w: 12, h: 8 }, { src: `{{item.${image.key}}}`, alt: title ? `{{item.${title.key}}}` : "", fit: "cover" }));
    y += 8;
  }
  if (title) {
    blocks.push(createBlock("heading", { x: 0, y, w: 12, h: 2 }, { text: `{{item.${title.key}}}`, level: "3", size: "s" }));
    y += 2;
  }
  if (date) {
    blocks.push(createBlock("text", { x: 0, y, w: 12, h: 1 }, { text: `{{item.${date.key}}}`, size: "s" }));
    y += 1;
  }
  if (text) {
    blocks.push(createBlock("text", { x: 0, y, w: 12, h: 3 }, { text: `{{item.${text.key}}}` }));
    y += 3;
  }
  if (number) {
    blocks.push(createBlock("heading", { x: 0, y, w: 12, h: 2 }, { text: `{{item.${number.key}}}`, level: "4", size: "s" }));
    y += 2;
  }
  blocks.push(createBlock("button", { x: 0, y, w: 6, h: 2 }, { label: "Read more", href: "{{item.url}}", variant: "outline", size: "s" }));
  const buy = collection.fields.find((f) => f.type === "link" && /buy|checkout|payment|purchase|shop/.test(f.key));
  if (buy) blocks.push(createBlock("buy", { x: 6, y, w: 6, h: 2 }, { provider: "other", href: `{{item.${buy.key}}}`, label: "Buy", price: number ? `{{item.${number.key}}}` : "", size: "s", align: "right" }));
  const def = createComponent(`${collection.name} card`, blocks, 4, { padding: 16 });
  def.icon = "▦";
  def.description = `Card for the “${collection.name}” collection (uses {{item.…}}).`;
  return def;
}

export function itemPageFor(collection: Collection, slug: string): Page {
  const f = (type: string) => collection.fields.find((x) => x.type === type);
  const title = collection.fields.find((x) => x.type === "text" && /title|name|heading/.test(x.key)) ?? f("text");
  const text = f("longtext") ?? collection.fields.find((x) => x.type === "text" && x !== title);
  const image = f("image");
  const blocks: Block[] = [];
  let y = 0;
  if (title) {
    blocks.push(createBlock("heading", { x: 2, y, w: 8, h: 3 }, { text: `{{item.${title.key}}}`, level: "1", size: "xl" }));
    y += 3;
  }
  if (image) {
    blocks.push(createBlock("image", { x: 2, y, w: 8, h: 12 }, { src: `{{item.${image.key}}}`, alt: title ? `{{item.${title.key}}}` : "", fit: "cover" }));
    y += 12;
  }
  if (text) blocks.push(createBlock("text", { x: 2, y, w: 8, h: 6 }, { text: `{{item.${text.key}}}` }));
  const page = createPage(title ? `{{item.${title.key}}}` : collection.name, slug, [createSection(collection.name, blocks)]);
  page.collectionId = collection.id;
  page.hideInNav = true;
  return page;
}
