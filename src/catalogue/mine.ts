import type { BlockProps } from "../model/types";
import { copyAssetsFromLibrary, copyAssetsToLibrary } from "../state/assets";

export interface MineItem {
  id: string;
  name: string;
  type: string;
  props: BlockProps;
  size: { w: number; h: number };
  savedAt: number;
}

const KEY = "fayteworks:my-catalogue";

export function listMine(): MineItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? (value as MineItem[]).filter((i) => i && i.id && i.props && i.type) : [];
  } catch {
    return [];
  }
}

function write(items: MineItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export async function saveMine(type: string, props: BlockProps, size: { w: number; h: number }, name: string): Promise<MineItem> {
  await copyAssetsToLibrary(props);
  const clean = Object.fromEntries(Object.entries(props).filter(([k]) => !k.startsWith("layer:") && k !== "reference" && !k.startsWith("reference")));
  const item: MineItem = { id: `mine_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim() || "My component", type, props: clean, size, savedAt: Date.now() };
  write([item, ...listMine()]);
  return item;
}

export function removeMine(id: string) {
  write(listMine().filter((i) => i.id !== id));
}

export async function prepareMine(item: MineItem): Promise<BlockProps> {
  await copyAssetsFromLibrary(item.props);
  return structuredClone(item.props);
}
