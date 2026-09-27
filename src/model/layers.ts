import { createId } from "../util/id";
import type { Block, Layer, Section } from "./types";

export function createLayer(name: string): Layer {
  return { id: createId("lyr"), name, hidden: false, locked: false };
}

export function layerIdOf(section: Section, block: Block): string {
  return section.layers.some((l) => l.id === block.layerId) ? block.layerId! : section.layers[0].id;
}

export function pinLayers(section: Section): void {
  for (const b of section.blocks) {
    const id = layerIdOf(section, b);
    if (b.layerId !== id) b.layerId = id;
  }
}

export function layerOf(section: Section, block: Block): Layer {
  const id = layerIdOf(section, block);
  return section.layers.find((l) => l.id === id)!;
}

export function blocksOnLayer(section: Section, layerId: string): Block[] {
  return section.blocks.filter((b) => layerIdOf(section, b) === layerId);
}

export function isBlockVisible(section: Section, block: Block): boolean {
  return !block.hidden && !layerOf(section, block).hidden;
}

export type StackTarget = { layerId: string; blockId?: string; place?: "front" | "behind" };

export function placeInStack(section: Section, block: Block, target: StackTarget): void {
  pinLayers(section);
  section.blocks = section.blocks.filter((b) => b.id !== block.id);
  block.layerId = target.layerId;
  const ref = target.blockId ? section.blocks.findIndex((b) => b.id === target.blockId) : -1;
  if (ref >= 0) {
    section.blocks.splice(target.place === "behind" ? ref : ref + 1, 0, block);
    return;
  }
  let last = -1;
  section.blocks.forEach((b, i) => {
    if (layerIdOf(section, b) === target.layerId) last = i;
  });
  section.blocks.splice(last >= 0 ? last + 1 : section.blocks.length, 0, block);
}

export function ungroup(section: Section, layerId: string): void {
  pinLayers(section);
  const index = section.layers.findIndex((l) => l.id === layerId);
  if (index < 0 || section.layers.length < 2) return;
  const into = section.layers[index > 0 ? index - 1 : 1];
  const moving = section.blocks.filter((b) => layerIdOf(section, b) === layerId);
  section.layers.splice(index, 1);
  for (const b of moving) {
    placeInStack(section, b, index > 0 ? { layerId: into.id } : { layerId: into.id, blockId: section.blocks.find((x) => layerIdOf(section, x) === into.id && !moving.includes(x))?.id, place: "behind" });
  }
}

export function isolateBlock(section: Section, blockId: string, name: string): string | null {
  const block = section.blocks.find((b) => b.id === blockId);
  if (!block) return null;
  pinLayers(section);
  const from = section.layers.findIndex((l) => l.id === layerIdOf(section, block));
  const layer = createLayer(name);
  section.layers.splice(from + 1, 0, layer);
  placeInStack(section, block, { layerId: layer.id });
  return layer.id;
}

export function reorderWithinLayer(section: Section, blockId: string, direction: 1 | -1): void {
  const index = section.blocks.findIndex((b) => b.id === blockId);
  if (index < 0) return;
  const layerId = layerIdOf(section, section.blocks[index]);
  for (let i = index + direction; i >= 0 && i < section.blocks.length; i += direction) {
    if (layerIdOf(section, section.blocks[i]) === layerId) {
      const [block] = section.blocks.splice(index, 1);
      section.blocks.splice(i, 0, block);
      return;
    }
  }
}

export function targetLayerId(section: Section, focused: { sectionId: string; layerId: string } | null): string {
  if (focused?.sectionId === section.id && section.layers.some((l) => l.id === focused.layerId)) {
    return focused.layerId;
  }
  const usable = [...section.layers].reverse().find((l) => !l.hidden && !l.locked);
  return (usable ?? section.layers[section.layers.length - 1]).id;
}
