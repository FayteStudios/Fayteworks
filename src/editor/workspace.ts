import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type PanelId = "add" | "layers" | "pages" | "check" | "make" | "data" | "timeline" | "inspector";
export type RailPanel = "pages" | "layers" | "data" | "check";

export const RAIL_PANELS: RailPanel[] = ["pages", "layers", "data", "check"];

const OPEN_PANEL_EVENT = "fayteworks:open-panel";

export type FocusTool = "timeline" | "frames" | "code" | "trim" | "captions" | "draw" | null;

let popped = false;
const poppedListeners = new Set<() => void>();

export function setFocusPopped(next: boolean) {
  if (next === popped) return;
  popped = next;
  poppedListeners.forEach((fn) => fn());
}

export function useFocusPopped(): boolean {
  return useSyncExternalStore(
    (fn) => {
      poppedListeners.add(fn);
      return () => poppedListeners.delete(fn);
    },
    () => popped
  );
}

let focusTool: FocusTool = null;
const focusToolListeners = new Set<() => void>();

export function setFocusTool(tool: FocusTool) {
  if (tool === focusTool) return;
  focusTool = tool;
  focusToolListeners.forEach((fn) => fn());
}

export function useFocusTool(): FocusTool {
  return useSyncExternalStore(
    (fn) => {
      focusToolListeners.add(fn);
      return () => focusToolListeners.delete(fn);
    },
    () => focusTool
  );
}

export function openPanel(panel: PanelId) {
  window.dispatchEvent(new CustomEvent(OPEN_PANEL_EVENT, { detail: panel }));
}

export function onOpenPanel(fn: (panel: PanelId) => void): () => void {
  const listener = (e: Event) => fn((e as CustomEvent<PanelId>).detail);
  window.addEventListener(OPEN_PANEL_EVENT, listener);
  return () => window.removeEventListener(OPEN_PANEL_EVENT, listener);
}

export interface WorkspaceLayout {
  left: RailPanel | null;
  leftWidth: number;
  rightWidth: number;
  bottomOpen: boolean;
  bottomHeight: number;
  palette: boolean;
}

const DEFAULTS: WorkspaceLayout = { left: "pages", leftWidth: 280, rightWidth: 320, bottomOpen: false, bottomHeight: 260, palette: false };
const STORAGE_KEY = "fayteworks:workspace";
const clamp = (n: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, n)));

function load(): WorkspaceLayout {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<WorkspaceLayout> | null;
    if (!raw) return { ...DEFAULTS };
    return {
      left: raw.left === null ? null : RAIL_PANELS.includes(raw.left as RailPanel) ? (raw.left as RailPanel) : DEFAULTS.left,
      leftWidth: clamp(Number(raw.leftWidth) || DEFAULTS.leftWidth, 220, 560),
      rightWidth: clamp(Number(raw.rightWidth) || DEFAULTS.rightWidth, 260, 560),
      bottomOpen: Boolean(raw.bottomOpen),
      bottomHeight: clamp(Number(raw.bottomHeight) || DEFAULTS.bottomHeight, 140, 700),
      palette: false
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function useWorkspace() {
  const [layout, setLayout] = useState<WorkspaceLayout>(load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      return;
    }
  }, [layout]);
  const set = useCallback((patch: Partial<WorkspaceLayout>) => setLayout((l) => ({ ...l, ...patch })), []);
  const toggleLeft = useCallback((panel: RailPanel) => setLayout((l) => ({ ...l, left: l.left === panel ? null : panel })), []);
  const setWidth = useCallback((side: "left" | "right", px: number) => setLayout((l) => (side === "left" ? { ...l, leftWidth: clamp(px, 220, 560) } : { ...l, rightWidth: clamp(px, 260, 560) })), []);
  const setBottomHeight = useCallback((px: number) => setLayout((l) => ({ ...l, bottomHeight: clamp(px, 140, 700), bottomOpen: true })), []);
  return { layout, set, toggleLeft, setWidth, setBottomHeight };
}

export function dragPointer(e: React.PointerEvent, onMove: (dx: number, dy: number) => void, bodyClass: string) {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const move = (ev: PointerEvent) => onMove(ev.clientX - startX, ev.clientY - startY);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    document.body.classList.remove(bodyClass);
  };
  document.body.classList.add(bodyClass);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
