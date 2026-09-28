import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

export function setDesignHome(next: boolean) {
  if (next === open) return;
  open = next;
  listeners.forEach((fn) => fn());
}

export const openDesignHome = () => setDesignHome(true);
export const closeDesignHome = () => setDesignHome(false);

export function useDesignHome(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => open
  );
}
