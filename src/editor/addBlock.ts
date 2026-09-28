import type { BlockProps } from "../model/types";
import { getBlockDefinition } from "../blocks/registry";
import { gridOf, toSectionSize } from "../model/grid";
import { createBlock, createSection } from "../model/factory";
import { createLayer, layerIdOf, placeInStack, targetLayerId } from "../model/layers";
import { findPage, findSection, maxBottom } from "../model/ops";
import { useEditor } from "../state/store";
import { findComponent, variantOf } from "../model/components";

export function useAddBlock(): (type: string, options?: { props?: BlockProps; size?: { w: number; h: number }; toPage?: boolean }) => { sectionId: string; blockId: string } {
  const { state, page, commit, select } = useEditor();
  return function addBlock(type, options = {}) {
    const { selection } = state;
    const making = !options.toPage ? findComponent(state.site.components, state.componentId) : undefined;
    const target =
      (making && variantOf(making, state.componentVariantId).section) ??
      ((selection.kind !== "none" && findSection(state.site, page.id, selection.sectionId)) || page.sections[page.sections.length - 1]);
    const section = target ?? createSection("Section 1");
    const selectedHere = selection.kind === "block" && selection.sectionId === section.id ? section.blocks.find((b) => b.id === selection.blockId) : undefined;
    const block = {
      ...createBlock(type, {
        x: 0,
        y: maxBottom(section.blocks) + (section.blocks.length ? 1 : 0),
        ...toSectionSize(options.size ?? getBlockDefinition(type)!.defaultSize, section),
        cols: gridOf(section).cols
      }),
      layerId: selectedHere && !state.focusedLayer ? layerIdOf(section, selectedHere) : targetLayerId(section, state.focusedLayer)
    };
    if (options.props) block.props = structuredClone(options.props);
    commit((draft) => {
      const draftPage = findPage(draft, page.id);
      if (!draftPage) {
        return;
      }
      if (!target) {
        draftPage.sections.push(section);
      }
      const s = findSection(draft, page.id, section.id);
      if (!s) return;
      if (type === "component" && !making) {
        const layer = createLayer(findComponent(draft.components, String(block.props.componentId))?.name ?? "Component");
        s.layers.push(layer);
        s.blocks.push({ ...block, layerId: layer.id });
      } else if (selectedHere && block.layerId === layerIdOf(s, selectedHere)) placeInStack(s, structuredClone(block), { layerId: block.layerId, blockId: selectedHere.id, place: "front" });
      else s.blocks.push(block);
    });
    select({ kind: "block", sectionId: section.id, blockId: block.id });
    return { sectionId: section.id, blockId: block.id };
  };
}
