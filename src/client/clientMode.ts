import { useSyncExternalStore } from "react";
import type { Site } from "../model/types";
import { useEditor } from "../state/store";

let unlocked = false;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));

export function setClientUnlocked(value: boolean) {
  unlocked = value;
  listeners.forEach((fn) => fn());
}

export const isClientLocked = (site: Site) => Boolean(site.clientMode?.enabled) && !unlocked;

export function useClientLock(): boolean {
  const { state } = useEditor();
  const open = useSyncExternalStore(subscribe, () => unlocked);
  return Boolean(state.site.clientMode?.enabled) && !open;
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pinMatches(site: Site, pin: string): Promise<boolean> {
  const mode = site.clientMode;
  return Boolean(mode && (await hashPin(pin, mode.salt)) === mode.pinHash);
}

export const CLIENT_FIELD_KINDS = new Set(["text", "textarea", "image", "link", "list"]);
