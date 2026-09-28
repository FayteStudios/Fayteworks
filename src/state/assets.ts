import { useSyncExternalStore } from "react";
import { desktop } from "../platform/desktop";
import { openDatabase } from "./rename";

const STORE = "assets";
export const ASSET_PREFIX = "asset:";

export interface StoredAsset {
  id: string;
  type: string;
  blob: Blob;
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "font/otf": "otf",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/webm": "weba",
  "audio/flac": "flac",
  "text/vtt": "vtt"
};

export function extensionFor(type: string): string {
  return EXTENSIONS[type] ?? "bin";
}

export function isAssetRef(src: string): boolean {
  return src.startsWith(ASSET_PREFIX);
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= openDatabase("assets", STORE);
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = action(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

export async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function libraryPut(blob: Blob): Promise<string> {
  const id = await hashBlob(blob);
  await run("readwrite", (store) => store.put({ id, type: blob.type, blob } satisfies StoredAsset));
  return ASSET_PREFIX + id;
}

function libraryGet(ref: string): Promise<StoredAsset | undefined> {
  return run<StoredAsset | undefined>("readonly", (store) => store.get(ref.slice(ASSET_PREFIX.length)));
}

let projectAssets = false;

const projectUrl = (ref: string) => `siteasset://asset/${ref.slice(ASSET_PREFIX.length)}`;

export const usingProjectAssets = () => projectAssets;

export function useProjectAssets(on: boolean) {
  projectAssets = on && Boolean(desktop);
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls.clear();
  notify();
}

export async function putAsset(blob: Blob): Promise<string> {
  if (!projectAssets || !desktop) return libraryPut(blob);
  const id = await hashBlob(blob);
  await desktop.putAsset(id, extensionFor(blob.type), new Uint8Array(await blob.arrayBuffer()));
  return ASSET_PREFIX + id;
}

export async function getAsset(ref: string): Promise<StoredAsset | undefined> {
  if (!projectAssets) return libraryGet(ref);
  const response = await fetch(projectUrl(ref));
  if (!response.ok) return undefined;
  const blob = await response.blob();
  return { id: ref.slice(ASSET_PREFIX.length), type: blob.type, blob };
}

export async function copyAssetsToLibrary(value: unknown): Promise<void> {
  if (!projectAssets) return;
  for (const ref of collectMediaRefs(value)) {
    if (!isAssetRef(ref) || (await libraryGet(ref))) continue;
    const asset = await getAsset(ref);
    if (asset) await libraryPut(asset.blob);
  }
}

export async function copyAssetsFromLibrary(value: unknown): Promise<void> {
  if (!projectAssets || !desktop) return;
  for (const ref of collectMediaRefs(value)) {
    if (!isAssetRef(ref) || (await desktop.hasAsset(ref.slice(ASSET_PREFIX.length)))) continue;
    const asset = await libraryGet(ref);
    if (asset) await putAsset(asset.blob);
  }
}

const urls = new Map<string, string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function assetUrl(src: string): string {
  if (!isAssetRef(src)) {
    return src;
  }
  if (projectAssets) {
    return projectUrl(src);
  }
  const cached = urls.get(src);
  if (cached) {
    return cached;
  }
  if (!pending.has(src)) {
    pending.add(src);
    getAsset(src)
      .then((asset) => {
        if (asset) urls.set(src, URL.createObjectURL(asset.blob));
      })
      .catch((error) => console.warn("Could not load asset", src, error))
      .finally(() => {
        pending.delete(src);
        notify();
      });
  }
  return "";
}

export function libraryAssetUrl(src: string): string {
  if (!isAssetRef(src)) return src;
  const key = `lib:${src}`;
  const cached = urls.get(key);
  if (cached) return cached;
  if (!pending.has(key)) {
    pending.add(key);
    libraryGet(src)
      .then((asset) => {
        if (asset) urls.set(key, URL.createObjectURL(asset.blob));
      })
      .catch((error) => console.warn("Could not load asset", src, error))
      .finally(() => {
        pending.delete(key);
        notify();
      });
  }
  return "";
}

export function useAssetVersion(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version
  );
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

export function collectMediaRefs(value: unknown, found = new Set<string>(), skipKeys?: ReadonlySet<string>): Set<string> {
  if (typeof value === "string") {
    if (isAssetRef(value) || value.startsWith("data:")) found.add(value);
    else if (value.includes("](asset:")) for (const m of value.matchAll(/\]\((asset:[\w-]+)/g)) found.add(m[1]);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectMediaRefs(item, found, skipKeys));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) if (!skipKeys?.has(key)) collectMediaRefs(item, found, skipKeys);
  }
  return found;
}

export const EDITOR_ONLY_PROPS: ReadonlySet<string> = new Set(["reference"]);
