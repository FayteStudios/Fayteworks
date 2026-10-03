import { createContext, useContext, useMemo, type ReactNode } from "react";
import { itemValues, visibleItems, type ItemContext } from "../data/model";
import type { Block, Collection, PropValue } from "../model/types";
import { RenderCtx, useRenderContext } from "../site/renderContext";
import { useEditor } from "../state/store";

export interface CardSource {
  collection: Collection;
  block?: Block;
  item?: ItemContext;
}

export interface ItemField {
  key: string;
  label: string;
}

const TOKEN = /\{\{\s*item\.([\w-]+)\s*\}\}/g;
const ONLY_TOKENS = /^(\s*\{\{\s*item\.[\w-]+\s*\}\}\s*)+$/;

export function useCardSource(): CardSource | null {
  const { state, page } = useEditor();
  return useMemo(() => {
    const site = state.site;
    const anchor = state.componentAnchor;
    let block = anchor
      ? page.sections
          .find((s) => s.id === anchor.sectionId)
          ?.blocks.find((b) => b.id === anchor.blockId)
      : undefined;
    if (block?.type !== "collection") block = undefined;
    if (!block && state.componentId)
      block = site.pages
        .flatMap((p) => p.sections.flatMap((s) => s.blocks))
        .find(
          (b) =>
            b.type === "collection" &&
            b.props.componentId === state.componentId,
        );
    if (block) {
      const collection = site.collections?.find(
        (c) => c.id === block.props.collectionId,
      );
      if (!collection) return null;
      const p = block.props;
      const first =
        visibleItems(collection, {
          sort: String(p.sort ?? ""),
          order: String(p.order ?? "asc"),
          filterField: String(p.filterField ?? ""),
          filterValue: String(p.filterValue ?? ""),
          limit: 1,
        })[0] ?? collection.items[0];
      return {
        collection,
        block,
        item: first
          ? { values: itemValues(collection, first), url: "#" }
          : undefined,
      };
    }
    if (!state.componentId && page.collectionId) {
      const collection = site.collections?.find(
        (c) => c.id === page.collectionId,
      );
      if (collection) return { collection };
    }
    return null;
  }, [state.site, state.componentAnchor, state.componentId, page]);
}

export function itemFieldsOf(collection: Collection): ItemField[] {
  const out: ItemField[] = [];
  for (const f of collection.fields) {
    out.push({ key: f.key, label: f.label || f.key });
    if (f.type === "date")
      out.push({
        key: `${f.key}_nice`,
        label: `${f.label || f.key}, written out`,
      });
    if (f.type === "markdown") {
      out.push({
        key: `${f.key}_text`,
        label: `${f.label || f.key}, first lines`,
      });
      out.push({ key: `${f.key}_minutes`, label: "Reading time" });
    }
  }
  out.push({ key: "url", label: "Its own page" });
  return out;
}

export interface TemplateItem {
  key: string;
  title: string;
  item: ItemContext;
}

/** The items a template is filled with while designing it: the collection it shows. */
export function useTemplateItems(): TemplateItem[] {
  const source = useCardSource();
  return useMemo(() => {
    const collection = source?.collection;
    if (!collection) return [];
    const titleKey = collection.fields.find((f) => f.type === "text")?.key;
    return collection.items.map((it) => ({
      key: it.id,
      title: String((titleKey && it.values[titleKey]) || it.slug || "Item"),
      item: { values: itemValues(collection, it), url: "#", key: it.id }
    }));
  }, [source?.collection]);
}

export function CardItemProvider({ children }: { children: ReactNode }) {
  const source = useCardSource();
  const items = useTemplateItems();
  const { state } = useEditor();
  const ctx = useRenderContext();
  const chosen = state.componentItem ? items.find((i) => i.key === state.componentItem)?.item : undefined;
  const item = chosen ?? source?.item;
  if (!item) return <>{children}</>;
  return (
    <RenderCtx.Provider value={{ ...ctx, item }}>
      {children}
    </RenderCtx.Provider>
  );
}

export function isBound(value: unknown): boolean {
  return typeof value === "string" && ONLY_TOKENS.test(value);
}

export const ItemFieldsCtx = createContext<ItemField[] | null>(null);

export function hasItemToken(value: unknown): boolean {
  return typeof value === "string" && /\{\{\s*item\./.test(value);
}

export function ItemFieldPicker({
  value,
  onChange,
}: {
  value: PropValue | undefined;
  onChange: (value: PropValue) => void;
}) {
  const fields = useContext(ItemFieldsCtx);
  if (!fields) return null;
  const text = typeof value === "string" ? value : "";
  const used = [...text.matchAll(TOKEN)].map(
    (m) => fields.find((f) => f.key === m[1])?.label ?? m[1],
  );
  return (
    <div className="item-field-pick">
      {used.length > 0 && (
        <span className="item-field-used">
          Each one shows its <strong>{used.join(", ")}</strong>
        </span>
      )}
      <select
        value=""
        aria-label="Fill in from a field"
        onChange={(e) => {
          const key = e.target.value;
          if (key === "__own") return onChange("");
          if (!key) return;
          const token = `{{item.${key}}}`;
          onChange(
            !text.trim() || ONLY_TOKENS.test(text) ? token : `${text} ${token}`,
          );
        }}
      >
        <option value="">
          {used.length ? "Show a different field…" : "Fill in from a field…"}
        </option>
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
        {used.length > 0 && <option value="__own">Type my own instead</option>}
      </select>
    </div>
  );
}
