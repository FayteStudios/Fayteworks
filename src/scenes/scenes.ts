import { useEffect, useState } from "react";

export type LookTab = "colours" | "fonts" | "shape" | "styles";
export type SiteTab = "site" | "connections" | "languages" | "client" | "companions";

export type Scene = { kind: "page"; pageId: string } | { kind: "look"; tab: LookTab } | { kind: "site"; tab: SiteTab } | { kind: "describe"; focus?: string } | { kind: "extension"; id: string; params?: Record<string, string> } | { kind: "sprites"; id?: string };

const OPEN_SCENE = "fayteworks:open-scene";

export function openScene(scene: Scene) {
  window.dispatchEvent(new CustomEvent<Scene>(OPEN_SCENE, { detail: scene }));
}

export function closeScene() {
  window.dispatchEvent(new CustomEvent<Scene | null>(OPEN_SCENE, { detail: null }));
}

export function useScene(): [Scene | null, (scene: Scene | null) => void] {
  const [scene, setScene] = useState<Scene | null>(null);
  useEffect(() => {
    const open = (e: Event) => setScene((e as CustomEvent<Scene | null>).detail);
    window.addEventListener(OPEN_SCENE, open);
    return () => window.removeEventListener(OPEN_SCENE, open);
  }, []);
  return [scene, setScene];
}
