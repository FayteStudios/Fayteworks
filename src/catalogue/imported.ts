import type { BlockProps } from "../model/types";
import { copyAssetsFromLibrary, copyAssetsToLibrary } from "../state/assets";

export interface ImportedItem {
  id: string;
  name: string;
  type: string;
  props: BlockProps;
  size: { w: number; h: number };
  from: string;
  addedAt: number;
}

const KEY = "fayteworks:imported";
const LIMIT = 80;
const CHANGED = "fayteworks:imported-changed";

export function listImported(): ImportedItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? (value as ImportedItem[]).filter((i) => i && i.id && i.props && i.type) : [];
  } catch {
    return [];
  }
}

function write(items: ImportedItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, LIMIT)));
    window.dispatchEvent(new Event(CHANGED));
  } catch {
    return;
  }
}

export function onImportedChange(fn: () => void): () => void {
  window.addEventListener(CHANGED, fn);
  return () => window.removeEventListener(CHANGED, fn);
}

export async function rememberImport(type: string, props: BlockProps, size: { w: number; h: number }) {
  if (Object.keys(props).some((k) => k.startsWith("reference"))) return;
  await copyAssetsToLibrary(props);
  const name = String(props.name ?? "").trim() || "Imported piece";
  const from = String(props.author ?? "").trim() || (props.source ? new URL(String(props.source), "https://x.invalid").hostname : "") || "Your code";
  const same = (i: ImportedItem) => (props.catalogueId ? i.props.catalogueId === props.catalogueId : i.name === name && i.props.html === props.html);
  const item: ImportedItem = { id: `imp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, type, props: structuredClone(props), size, from, addedAt: Date.now() };
  write([item, ...listImported().filter((i) => !same(i))]);
}

export function forgetImport(id: string) {
  write(listImported().filter((i) => i.id !== id));
}

export async function prepareImported(item: ImportedItem): Promise<BlockProps> {
  await copyAssetsFromLibrary(item.props);
  return structuredClone(item.props);
}
