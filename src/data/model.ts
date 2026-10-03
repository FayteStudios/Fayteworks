import type { BlockProps, Collection, CollectionField, CollectionFieldType, CollectionItem, ListItem, PropValue } from "../model/types";
import { markdownText, readingMinutes } from "../site/markdown";
import { createId } from "../util/id";
import { slugify } from "../util/slug";

export type ItemContext = { values: Record<string, string | number | boolean>; url: string; key?: string };

const TOKEN = /\{\{\s*item\.([\w-]+)\s*\}\}/g;

export function fillTokens(text: string, item: ItemContext): string {
  return text.replace(TOKEN, (_, key: string) => (key === "url" ? item.url : String(item.values[key] ?? "")));
}

const hasToken = (v: unknown) => typeof v === "string" && v.includes("{{") && /\{\{\s*item\./.test(v);

export function bindProps(props: BlockProps, item: ItemContext): BlockProps {
  let changed = false;
  const out: BlockProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (hasToken(value)) {
      out[key] = fillTokens(value as string, item);
      changed = true;
    } else if (Array.isArray(value) && value.some((row) => Object.values(row).some(hasToken))) {
      out[key] = (value as ListItem[]).map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, hasToken(v) ? fillTokens(v as string, item) : v]))) as PropValue;
      changed = true;
    } else out[key] = value;
  }
  return changed ? out : props;
}

export function itemValues(collection: Collection | undefined, item: CollectionItem): ItemContext["values"] {
  const values = { ...item.values };
  for (const f of collection?.fields ?? []) {
    const v = item.values[f.key];
    if (f.type === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      const d = new Date(`${v.slice(0, 10)}T12:00:00Z`);
      if (!Number.isNaN(d.getTime())) values[`${f.key}_nice`] = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(d);
    }
    if (f.type === "markdown" && typeof v === "string") {
      values[`${f.key}_minutes`] = `${readingMinutes(v)} min read`;
      const text = markdownText(v);
      values[`${f.key}_text`] = text.length > 180 ? `${text.slice(0, 177).replace(/\s+\S*$/, "")}…` : text;
    }
  }
  return values;
}

export const itemHref = (pageId: string, slug: string) => `item:${pageId}:${slug}`;

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}

export function parseMarkdown(text: string, name: string): Record<string, string> {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const values: Record<string, string> = { slug: name.replace(/\.(md|markdown)$/i, "") };
  if (!m) return { ...values, body: text.trim() };
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (kv) values[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  values.body = m[2].trim();
  return values;
}

export function jsonRows(data: unknown, path?: string): Record<string, unknown>[] {
  let node: unknown = data;
  if (path) for (const part of path.split(".").filter(Boolean)) node = (node as Record<string, unknown>)?.[part];
  if (!Array.isArray(node) && node && typeof node === "object") node = Object.values(node).find(Array.isArray);
  if (!Array.isArray(node)) throw new Error(path ? `No list at “${path}” in that data.` : "No list of items found in that data (set the path to it).");
  return node.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
}

export function sheetsCsvUrl(url: string): string {
  const id = url.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1];
  if (!id) return url;
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i;

function guessType(values: unknown[]): CollectionFieldType {
  const present = values.filter((v) => v !== "" && v !== null && v !== undefined);
  if (!present.length) return "text";
  if (present.every((v) => typeof v === "boolean" || /^(true|false|yes|no)$/i.test(String(v)))) return "boolean";
  if (present.every((v) => typeof v === "number" || (/^-?\d+(\.\d+)?$/.test(String(v).trim()) && String(v).trim().length < 16))) return "number";
  if (present.every((v) => /^https?:\/\//.test(String(v)) && IMAGE.test(String(v)))) return "image";
  if (present.every((v) => /^(https?:\/\/|mailto:|\/)/.test(String(v)))) return "link";
  if (present.every((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v)))) return "date";
  if (present.some((v) => String(v).length > 120 || String(v).includes("\n"))) return "longtext";
  return "text";
}

const fieldKey = (name: string) => slugify(name).replace(/-/g, "_") || "field";

export function rowsToCollection(rows: Record<string, unknown>[], existing?: Collection): { fields: CollectionField[]; items: CollectionItem[] } {
  const names = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => !k.startsWith("_"));
  const fields: CollectionField[] = names.map((name) => {
    const key = fieldKey(name);
    const known = existing?.fields.find((f) => f.key === key);
    return known ?? { key, label: name.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()), type: guessType(rows.map((r) => r[name])) };
  });
  const titleKey = fields.find((f) => /^(slug)$/.test(f.key))?.key ?? fields.find((f) => /title|name|heading/.test(f.key))?.key ?? fields.find((f) => f.type === "text")?.key;
  const used = new Set<string>();
  const items = rows.map((row, i) => {
    const values: CollectionItem["values"] = {};
    for (const name of names) {
      const f = fields.find((x) => x.key === fieldKey(name))!;
      const raw = row[name];
      values[f.key] =
        raw === null || raw === undefined
          ? ""
          : f.type === "number" && raw !== ""
            ? Number(raw)
            : f.type === "boolean"
              ? raw === true || /^(true|yes)$/i.test(String(raw))
              : typeof raw === "object"
                ? JSON.stringify(raw)
                : String(raw);
    }
    let slug = slugify(String((titleKey && values[titleKey]) || `item-${i + 1}`)) || `item-${i + 1}`;
    for (let n = 2; used.has(slug); n++) slug = `${slugify(String(values[titleKey!] ?? "item"))}-${n}`;
    used.add(slug);
    const previous = existing?.items.find((it) => it.slug === slug);
    return { id: previous?.id ?? createId("itm"), slug, values };
  });
  return { fields, items };
}

export function visibleItems(collection: Collection, options: { sort?: string; order?: string; filterField?: string; filterValue?: string; limit?: number }): CollectionItem[] {
  let items = collection.items;
  if (options.filterField && options.filterValue !== undefined && options.filterValue !== "") {
    const want = options.filterValue.toLowerCase();
    items = items.filter((it) => {
      const value = String(it.values[options.filterField!] ?? "").toLowerCase();
      return value === want || value.split(",").some((t) => t.trim() === want);
    });
  }
  if (options.sort) {
    const key = options.sort;
    const dir = options.order === "desc" ? -1 : 1;
    items = [...items].sort((a, b) => {
      const x = a.values[key];
      const y = b.values[key];
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true })) * dir;
    });
  }
  return options.limit && options.limit > 0 ? items.slice(0, options.limit) : items;
}

export function newCollection(name: string): Collection {
  return {
    id: createId("col"),
    name,
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "text", label: "Text", type: "longtext" },
      { key: "image", label: "Image", type: "image" }
    ],
    items: [],
    source: { kind: "manual" }
  };
}

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The collection as a CSV file, with the original file's column names and order where known. */
export function collectionToCsv(collection: Collection, headers: string[] = []): string {
  const byKey = new Map(headers.map((h) => [fieldKey(h), h]));
  const ordered = [...headers.map((h) => collection.fields.find((f) => f.key === fieldKey(h))).filter((f): f is CollectionField => Boolean(f)), ...collection.fields.filter((f) => !byKey.has(f.key))];
  const lines = [ordered.map((f) => csvCell(byKey.get(f.key) ?? f.label)).join(",")];
  for (const it of collection.items) lines.push(ordered.map((f) => csvCell(it.values[f.key])).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** A short fingerprint of a collection's contents, to tell whether it changed since it was saved. */
export function contentHash(collection: Collection): string {
  const text = JSON.stringify([collection.fields, collection.items.map((it) => [it.slug, it.values])]);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function csvHeaders(text: string): string[] {
  const rows = parseCsv(text);
  return rows.length ? Object.keys(rows[0]) : [];
}
