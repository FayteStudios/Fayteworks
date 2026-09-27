import type { CSSProperties } from "react";
import { itemHref, itemValues, visibleItems } from "../data/model";
import type { FieldDef } from "../model/fields";
import { getBlockDefinition } from "./registry";
import type { BlockDefinition } from "./types";
import { num, str } from "./util";

export const collectionDefinitions: BlockDefinition[] = [
  {
    type: "collection",
    badges: ["grows"],
    label: "Collection list",
    category: "Content",
    icon: "▦",
    description: "Items from your data (products, posts, team…), each shown with a card design.",
    defaultSize: { w: 12, h: 16 },
    defaultProps: { collectionId: "", componentId: "", columns: 3, gap: 20, sort: "", order: "asc", filterField: "", filterValue: "", limit: 0, empty: "Nothing here yet.", tagField: "" },
    fields: [
      { key: "columns", label: "Columns", kind: "range", min: 1, max: 6 },
      { key: "gap", label: "Space between (px)", kind: "range", min: 0, max: 64 },
      { key: "limit", label: "Show at most (0 = all)", kind: "number", min: 0 },
      { key: "empty", label: "When there are no items", kind: "text" }
    ],
    extraFields: (props, site) => {
      const collections = site?.collections ?? [];
      const collection = collections.find((c) => c.id === props.collectionId);
      const fieldOptions = [{ value: "", label: "—" }, ...(collection?.fields ?? []).map((f) => ({ value: f.key, label: f.label }))];
      const fields: FieldDef[] = [
        { key: "collectionId", label: "Collection", kind: "select", options: [{ value: "", label: "Choose…" }, ...collections.map((c) => ({ value: c.id, label: `${c.name} (${c.items.length})` }))] },
        {
          key: "componentId",
          label: "Card design",
          kind: "select",
          options: [{ value: "", label: "Choose a component…" }, ...(site?.components ?? []).map((c) => ({ value: c.id, label: c.name }))],
          hint: "A component whose text, images and links use {{item.field}}. “Make a card design” below builds one from the collection's fields."
        },
        { key: "sort", label: "Sort by", kind: "select", options: fieldOptions },
        { key: "order", label: "Order", kind: "select", options: [{ value: "asc", label: "A → Z, low → high" }, { value: "desc", label: "Z → A, high → low" }] },
        { key: "filterField", label: "Only items where", kind: "select", options: fieldOptions },
        { key: "filterValue", label: "…equals", kind: "text", hint: "For a list of tags (comma-separated), matches any one of them." },
        { key: "tagField", label: "Filter buttons for", kind: "select", options: fieldOptions, hint: "Visitors can narrow the list by this field (e.g. tags or category)." }
      ];
      return fields;
    },
    mobileHeight: "content",
    grows: true,
    render: (p, ctx, meta) => {
      const collection = ctx.collections?.find((c) => c.id === p.collectionId);
      if (!collection) return ctx.isEditor ? <div className="b-collection-empty">Choose a collection in the inspector.</div> : null;
      const component = getBlockDefinition("component")!;
      const items = visibleItems(collection, {
        sort: str(p.sort),
        order: str(p.order, "asc"),
        filterField: str(p.filterField),
        filterValue: str(p.filterValue),
        limit: num(p.limit, 0)
      });
      if (!items.length) return <p className="b-collection-empty">{str(p.empty, "Nothing here yet.")}</p>;
      if (!str(p.componentId)) return ctx.isEditor ? <div className="b-collection-empty">Choose (or make) a card design in the inspector.</div> : null;
      const template = ctx.templatePages?.[collection.id];
      const tagField = str(p.tagField);
      const tagsOf = (item: (typeof items)[number]) =>
        String(item.values[tagField] ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
      const tags = tagField ? [...new Set(items.flatMap(tagsOf))].sort((a, b) => a.localeCompare(b)) : [];
      const grid = (
        <div className="b-collection" style={{ "--cols": Math.max(1, Math.min(6, num(p.columns, 3))), "--gap": `${num(p.gap, 20)}px` } as CSSProperties}>
          {items.map((item) => (
            <div key={item.id} className="b-collection-item" data-tags={tagField ? tagsOf(item).join("|").toLowerCase() : undefined}>
              {component.render({ componentId: str(p.componentId) }, { ...ctx, item: { values: itemValues(collection, item), url: template ? itemHref(template, item.slug) : "#" } }, { id: `${meta.id}-${item.id}` })}
            </div>
          ))}
        </div>
      );
      if (tags.length < 2) return grid;
      return (
        <div className="b-collection-wrap" data-js="tag-filter">
          <div className="b-tags" role="group" aria-label="Filter">
            <button type="button" className="b-tag is-active" data-tag="" aria-pressed="true">
              All
            </button>
            {tags.map((t) => (
              <button key={t} type="button" className="b-tag" data-tag={t.toLowerCase()} aria-pressed="false">
                {t}
              </button>
            ))}
          </div>
          {grid}
        </div>
      );
    }
  }
];
