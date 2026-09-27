import { useSyncExternalStore } from "react";
import { designsOf, findComponent } from "../model/components";
import { migrateSection } from "../model/migrate";
import type { ComponentDef, Section, Site } from "../model/types";
import { createId } from "../util/id";
import { copyAssetsFromLibrary, copyAssetsToLibrary } from "./assets";

export interface LibraryEntry {
  libraryId: string;
  name: string;
  savedAt: string;
  components: ComponentDef[];
}

const STORAGE_KEY = "fayteworks:component-library";
const listeners = new Set<() => void>();

function read(): LibraryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let cache: LibraryEntry[] = read();

function write(next: LibraryEntry[]) {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("Could not save the component library", error);
  }
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      cache = read();
      listeners.forEach((listener) => listener());
    }
  });
}

export function useComponentLibrary(): LibraryEntry[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => cache
  );
}

export function libraryEntry(libraryId: string | undefined): LibraryEntry | undefined {
  return libraryId ? cache.find((e) => e.libraryId === libraryId) : undefined;
}

export function withNested(site: Site, def: ComponentDef, found = new Map<string, ComponentDef>()): ComponentDef[] {
  if (found.has(def.id)) return [...found.values()];
  found.set(def.id, def);
  for (const b of designsOf(def).flatMap((d) => d.section.blocks)) {
    const inner = b.type === "component" ? findComponent(site.components, b.props.componentId) : undefined;
    if (inner) withNested(site, inner, found);
  }
  return [...found.values()];
}

export async function saveToLibrary(site: Site, def: ComponentDef): Promise<string> {
  const libraryId = def.libraryId ?? createId("lib");
  const components = structuredClone(withNested(site, def)).map((c, i) => (i === 0 ? { ...c, libraryId } : c));
  await copyAssetsToLibrary(components);
  const entry: LibraryEntry = { libraryId, name: def.name, savedAt: new Date().toISOString(), components };
  write([entry, ...cache.filter((e) => e.libraryId !== libraryId)]);
  return libraryId;
}

export function removeFromLibrary(libraryId: string) {
  write(cache.filter((e) => e.libraryId !== libraryId));
}

export async function componentsFromLibrary(entry: LibraryEntry): Promise<ComponentDef[]> {
  await copyAssetsFromLibrary(entry.components);
  const ids = new Map(entry.components.map((c) => [c.id, createId("cmp")]));
  const remap = (section: Section): Section => {
    const copy = migrateSection(structuredClone(section));
    copy.id = createId("sec");
    for (const b of copy.blocks) {
      const target = ids.get(String(b.props.componentId));
      if (b.type === "component" && target) b.props.componentId = target;
    }
    return copy;
  };
  return entry.components.map((c, i) => ({
    ...structuredClone(c),
    id: ids.get(c.id)!,
    section: remap(c.section),
    variants: c.variants?.map((v) => ({ ...structuredClone(v), section: remap(v.section) })),
    libraryId: i === 0 ? entry.libraryId : undefined
  }));
}

export async function pullFromLibrary(site: Site, def: ComponentDef, entry: LibraryEntry): Promise<{ latest: ComponentDef; extras: ComponentDef[] }> {
  const all = await componentsFromLibrary(entry);
  const redirect = new Map<string, string>([[all[0].id, def.id]]);
  const extras: ComponentDef[] = [];
  for (const c of all.slice(1)) {
    const existing = site.components?.find((e) => e.name === c.name && e.fields.length === c.fields.length);
    if (existing) redirect.set(c.id, existing.id);
    else extras.push(c);
  }
  for (const c of all) {
    for (const d of designsOf(c)) {
      for (const b of d.section.blocks) {
        const to = b.type === "component" ? redirect.get(String(b.props.componentId)) : undefined;
        if (to) b.props.componentId = to;
      }
    }
  }
  return { latest: { ...all[0], id: def.id, libraryId: entry.libraryId }, extras };
}
