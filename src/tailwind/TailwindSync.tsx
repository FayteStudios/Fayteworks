import { useEffect } from "react";
import { allSections } from "../model/ops";
import type { Block, Site } from "../model/types";
import { useEditor } from "../state/store";
import type { TailwindPreset } from "./compile";
import { tailwindKey } from "./key";

function tailwindBlocks(site: Site): Block[] {
  return allSections(site)
    .flatMap((s) => s.blocks)
    .filter((b) => b.type === "code" && (b.props.tailwind === "on" || b.props.tailwind === "flowbite"));
}

export function TailwindSync() {
  const { state, derive } = useEditor();

  useEffect(() => {
    const stale = tailwindBlocks(state.site)
      .map((b) => {
        const html = String(b.props.html ?? "");
        const preset = b.props.tailwind as TailwindPreset;
        return { id: b.id, html, preset, key: tailwindKey(preset, html), stored: b.props.tailwindFor };
      })
      .filter((b) => b.stored !== b.key);
    if (!stale.length) return;
    let live = true;
    void import("./compile").then(async ({ compileTailwind }) => {
      const results: { id: string; key: string; css: string }[] = [];
      for (const b of stale) {
        try {
          results.push({ id: b.id, key: b.key, css: await compileTailwind(b.html, b.preset) });
        } catch (error) {
          console.warn("Tailwind compile failed:", error);
        }
      }
      if (!live || !results.length) return;
      derive((site) => {
        for (const block of tailwindBlocks(site)) {
          const result = results.find((r) => r.id === block.id);
          if (!result || tailwindKey(String(block.props.tailwind), String(block.props.html ?? "")) !== result.key) continue;
          block.props.tailwindCss = result.css;
          block.props.tailwindFor = result.key;
        }
      });
    });
    return () => {
      live = false;
    };
  }, [state.site, derive]);

  return null;
}
