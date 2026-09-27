import type { Site } from "../model/types";
import { desktop, type VersionMeta } from "../platform/desktop";
import { openDatabase } from "../state/rename";

export type { VersionMeta };

const STORE = "versions";

function openDb(): Promise<IDBDatabase> {
  return openDatabase("versions", STORE);
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

type Stored = VersionMeta & { site: string };

export async function listVersions(): Promise<VersionMeta[]> {
  const list = desktop ? await desktop.listVersions() : ((await tx("readonly", (s) => s.getAll())) as Stored[]).map(({ site: _site, ...meta }) => meta);
  return list.sort((a, b) => b.at.localeCompare(a.at));
}

export async function saveVersion(site: Site, label: string, kind: VersionMeta["kind"]): Promise<VersionMeta> {
  const json = JSON.stringify(site);
  const meta = { label, kind, pages: site.pages.filter((p) => !p.design).length };
  if (desktop) return desktop.saveVersion(meta, json);
  const entry: Stored = { id: `v${Date.now()}-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`, at: new Date().toISOString(), ...meta, bytes: json.length, site: json };
  await tx("readwrite", (s) => s.put(entry));
  const all = ((await tx("readonly", (s) => s.getAll())) as Stored[]).filter((v) => v.kind !== "manual").sort((a, b) => b.at.localeCompare(a.at));
  const days = new Set<string>();
  for (const [i, v] of all.entries()) {
    const day = v.at.slice(0, 10);
    const keep = i < 30 || (Date.now() - Date.parse(v.at) < 90 * 864e5 && !days.has(day));
    days.add(day);
    if (!keep) await tx("readwrite", (s) => s.delete(v.id));
  }
  const { site: _site, ...stored } = entry;
  return stored;
}

export async function readVersion(id: string): Promise<Site> {
  const json = desktop ? await desktop.readVersion(id) : ((await tx("readonly", (s) => s.get(id))) as Stored | undefined)?.site;
  if (!json) throw new Error("That version is gone.");
  return JSON.parse(json) as Site;
}

export async function deleteVersion(id: string): Promise<void> {
  if (desktop) await desktop.deleteVersion(id);
  else await tx("readwrite", (s) => s.delete(id));
}
