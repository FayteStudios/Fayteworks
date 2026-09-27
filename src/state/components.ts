import { useSyncExternalStore } from "react";
import { bundleAssets, restoreAssets, type AssetBundle } from "../export/bundle";
import { copyAssetsToLibrary } from "./assets";
import { migrateSection } from "../model/migrate";
import type { Section } from "../model/types";
import { createId } from "../util/id";
import { createSection } from "../model/factory";
import { layerIdOf } from "../model/layers";

export interface SavedComponent {
  id: string;
  name: string;
  createdAt: string;
  kind?: "section" | "blocks";
  section: Section;
}

interface ComponentFile {
  format: "fayteworks-component";
  bundleVersion: 1;
  name: string;
  kind?: "section" | "blocks";
  section: Section;
  assets: AssetBundle;
}

const STORAGE_KEY = "fayteworks:components";
const listeners = new Set<() => void>();

function read(): SavedComponent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.map((c: SavedComponent) => ({ ...c, section: migrateSection(c.section) })) : [];
  } catch {
    return [];
  }
}

let cache: SavedComponent[] = read();

function write(next: SavedComponent[]) {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("Could not save components", error);
  }
  listeners.forEach((listener) => listener());
}

export function useSavedComponents(): SavedComponent[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => cache
  );
}

export function saveComponent(name: string, section: Section, kind: "section" | "blocks" = "section"): SavedComponent {
  const component: SavedComponent = { id: createId("cmp"), name, createdAt: new Date().toISOString(), kind, section: structuredClone(section) };
  void copyAssetsToLibrary(section);
  write([component, ...cache]);
  return component;
}

export function saveBlocksComponent(name: string, source: Section, ids: string[]): SavedComponent | null {
  const picked = source.blocks.filter((b) => ids.includes(b.id)).map((b) => structuredClone(b));
  if (picked.length === 0) return null;
  const top = Math.min(...picked.map((b) => b.y));
  const layers = source.layers.filter((l) => picked.some((b) => layerIdOf(source, b) === l.id)).map((l) => ({ ...l, hidden: false, locked: false }));
  const blocks = picked.map(({ responsive: _drop, ...b }) => ({ ...b, y: b.y - top, layerId: layerIdOf(source, b) }));
  return saveComponent(name, { ...createSection(name, blocks, { minRows: 0, paddingY: 24 }), layers, ...(source.grid ? { grid: source.grid } : {}) }, "blocks");
}

export function renameComponent(id: string, name: string) {
  write(cache.map((c) => (c.id === id ? { ...c, name } : c)));
}

export function deleteComponent(id: string) {
  write(cache.filter((c) => c.id !== id));
}

export async function buildComponentFile(component: SavedComponent): Promise<string> {
  const file: ComponentFile = {
    format: "fayteworks-component",
    bundleVersion: 1,
    name: component.name,
    kind: component.kind ?? "section",
    section: component.section,
    assets: await bundleAssets(component.section)
  };
  return JSON.stringify(file, null, 2);
}

export async function importComponentFile(text: string): Promise<SavedComponent> {
  const parsed = JSON.parse(text) as Partial<ComponentFile>;
  if (!String(parsed.format).endsWith("-component") || !parsed.section) {
    throw new Error("Not a component file");
  }
  await restoreAssets(parsed.assets);
  return saveComponent(String(parsed.name ?? "Imported component"), migrateSection(parsed.section), parsed.kind === "blocks" ? "blocks" : "section");
}
