import { useLayoutEffect, useRef, useState } from "react";
import { downloadBlob } from "../export/output";
import { slugify } from "../model/factory";
import { createSection } from "../model/factory";
import { createLayer, targetLayerId } from "../model/layers";
import { cloneSection, findPage, findSection, maxBottom } from "../model/ops";
import { copyBlocks } from "./selectionOps";
import { askText } from "./askText";
import { convertBlocks, densityOf } from "../model/grid";
import { themeVars } from "../model/theme";
import type { Section } from "../model/types";
import { StaticSection } from "../site/SiteRenderer";
import {
  buildComponentFile,
  deleteComponent,
  importComponentFile,
  renameComponent,
  saveBlocksComponent,
  saveComponent,
  useSavedComponents,
  type SavedComponent
} from "../state/components";
import { useEditor } from "../state/store";
import { copyAssetsFromLibrary } from "../state/assets";

const THUMB_LAYOUT_WIDTH = 1200;
const THUMB_MAX_HEIGHT = 120;

export async function promptSaveComponent(section: Section): Promise<SavedComponent | null> {
  const name = await askText("Save a copy of this section. Name:", section.name);
  return name ? saveComponent(name, section) : null;
}

export async function promptSaveBlocks(section: Section, ids: string[]): Promise<SavedComponent | null> {
  const suggestion = ids.length === 1 ? "My block" : "My block group";
  const name = await askText(`Save ${ids.length === 1 ? "this block" : `these ${ids.length} blocks`} for reuse. Name:`, suggestion);
  return name ? saveBlocksComponent(name, section, ids) : null;
}

export function ComponentThumb({ section }: { section: Section }) {
  const { state } = useEditor();
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.18);
  const [height, setHeight] = useState(60);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    const measure = () => {
      const s = box.clientWidth / THUMB_LAYOUT_WIDTH;
      setScale(s);
      setHeight(Math.min(THUMB_MAX_HEIGHT, inner.offsetHeight * s));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={boxRef} className="component-thumb" style={{ height }} aria-hidden>
      <div
        ref={innerRef}
        className="site-root"
        style={{ ...themeVars(state.site.theme), width: THUMB_LAYOUT_WIDTH, transform: `scale(${scale})` }}
      >
        <StaticSection section={section} role="page" />
      </div>
    </div>
  );
}

export function useInsertSection(): (section: Section) => void {
  const { state, page, commit, select } = useEditor();
  return (section: Section) => {
    const selectedId = state.selection.kind !== "none" ? state.selection.sectionId : null;
    const at = page.sections.findIndex((s) => s.id === selectedId);
    commit((draft) => {
      findPage(draft, page.id)?.sections.splice(at >= 0 ? at + 1 : page.sections.length, 0, section);
    });
    select({ kind: "section", sectionId: section.id });
    requestAnimationFrame(() =>
      document.querySelector(`[data-section="${section.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" })
    );
  };
}

export function ComponentsGroup() {
  const insertSectionAfterSelection = useInsertSection();
  const { state, page, commit, select } = useEditor();
  const components = useSavedComponents();
  const fileInput = useRef<HTMLInputElement>(null);

  async function insert(component: SavedComponent) {
    await copyAssetsFromLibrary(component.section);
    if (component.kind === "blocks") insertBlocksComponent(component);
    else insertSection(component);
  }

  function insertBlocksComponent(component: SavedComponent) {
    const targetId = state.selection.kind !== "none" ? state.selection.sectionId : page.sections[page.sections.length - 1]?.id;
    const target = targetId ? findSection(state.site, page.id, targetId) : undefined;
    const newSection = target ? null : createSection("Section 1");
    const section = target ?? newSection!;
    const sourceLayers = component.section.layers;
    const layerMap = new Map<string, string>();
    const newLayers = sourceLayers.length > 1 ? sourceLayers.map((l) => ({ ...createLayer(`${component.name} · ${l.name}`) })) : [];
    sourceLayers.forEach((l, i) => layerMap.set(l.id, newLayers[i]?.id ?? targetLayerId(section, state.focusedLayer)));
    const top = section.blocks.length ? maxBottom(section.blocks) + 1 : 0;
    const copies = convertBlocks(copyBlocks(component.section.blocks), densityOf(component.section), densityOf(section)).map((b) => ({
      ...b,
      y: b.y + top,
      layerId: layerMap.get(b.layerId ?? "") ?? targetLayerId(section, state.focusedLayer)
    }));
    commit((draft) => {
      if (newSection) findPage(draft, page.id)?.sections.push(newSection);
      const s = findSection(draft, page.id, section.id);
      if (!s) return;
      s.layers.push(...newLayers);
      s.blocks.push(...copies);
    });
    select({ kind: "block", sectionId: section.id, blockId: copies[0].id, blockIds: copies.map((c) => c.id) });
    requestAnimationFrame(() =>
      document.querySelector(`[data-block-id="${copies[0].id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" })
    );
  }

  function insertSection(component: SavedComponent) {
    insertSectionAfterSelection({ ...cloneSection(component.section), name: component.name });
  }

  async function exportComponent(component: SavedComponent) {
    const json = await buildComponentFile(component);
    downloadBlob(new Blob([json], { type: "application/json" }), `${slugify(component.name)}.component.json`);
  }

  return (
    <section className="library-group">
      <div className="library-group-header">
        <h3 className="panel-heading">Saved sections</h3>
        <button className="link-button" onClick={() => fileInput.current?.click()}>
          Import…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              await importComponentFile(await file.text());
            } catch {
              window.alert("That file isn't a component exported from this editor.");
            }
          }}
        />
      </div>
      {components.length === 0 ? (
        <p className="panel-hint">
          Press ★ on a section's toolbar (or “Save group” on selected blocks) to keep a copy here for any page of
          any site. For reusable pieces with their own fields, make a component in the Components tab.
        </p>
      ) : (
        <ul className="component-list">
          {components.map((component) => (
            <li key={component.id} className="component-card">
              <button className="component-insert" title="Insert on this page" onClick={() => insert(component)}>
                <ComponentThumb section={component.section} />
                <span className="component-name">
                  {component.name}
                  <span className="component-kind">{component.kind === "blocks" ? "Blocks" : "Section"}</span>
                </span>
              </button>
              <div className="component-actions">
                <button
                  title="Rename"
                  onClick={async () => {
                    const name = await askText("Rename", component.name);
                    if (name) renameComponent(component.id, name);
                  }}
                >
                  Rename
                </button>
                <button title="Download as a file you can share" onClick={() => void exportComponent(component)}>
                  Export
                </button>
                <button
                  title="Delete from your library"
                  onClick={() => window.confirm(`Delete “${component.name}” from your components?`) && deleteComponent(component.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
