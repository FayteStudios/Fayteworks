import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CardItemProvider, useCardSource } from "./cardSource";
import { getBlockDefinition } from "../blocks/registry";
import { bundleAssets, restoreAssets, type AssetBundle } from "../export/bundle";
import { downloadBlob } from "../export/output";
import {
  BLUEPRINTS,
  componentFromBlocks,
  createVariant,
  designsOf,
  designsWithPiece,
  variantOf,
  DEFAULT_FRAME,
  designWidth,
  detachComponent,
  componentUses,
  copyComponent,
  findComponent,
  FRAME,
  FRAME_FIELDS,
  frameStyle,
  newField,
  placedSize
} from "../model/components";
import { slugify } from "../model/factory";
import type { FieldDef } from "../model/fields";
import { migrateSection } from "../model/migrate";
import { componentSection, findSection } from "../model/ops";
import { themeVars } from "../model/theme";
import type { Block, ComponentDef, PropValue, Section, Site } from "../model/types";
import { useRenderContext } from "../site/renderContext";
import { BlockContent } from "../site/SiteRenderer";
import { editorTier, useEditor } from "../state/store";
import { createId } from "../util/id";
import { FieldList, type FieldExposure } from "./Fields";
import { useAddBlock } from "./addBlock";
import { activeLibraryDrag, LIBRARY_MIME } from "./libraryDrag";
import { SectionEditor } from "./SectionEditor";
import { askText } from "./askText";
import { GridPrecisionField } from "./GridPrecisionField";
import { densityOf, setGridDensity } from "../model/grid";
import {
  componentsFromLibrary,
  libraryEntry,
  pullFromLibrary,
  removeFromLibrary,
  saveToLibrary,
  useComponentLibrary,
  withNested,
  type LibraryEntry
} from "../state/componentLibrary";
import { RenderCtx } from "../site/renderContext";
import { libraryAssetUrl, useAssetVersion } from "../state/assets";

function allSections(site: Site): Section[] {
  return [
    ...(site.header ? [site.header] : []),
    ...(site.footer ? [site.footer] : []),
    ...site.pages.flatMap((p) => p.sections),
    ...(site.components ?? []).flatMap((c) => designsOf(c).map((d) => d.section))
  ];
}

function copiesOf(site: Site, id: string): number {
  return allSections(site).reduce((n, s) => n + s.blocks.filter((b) => b.type === "component" && b.props.componentId === id).length, 0);
}

interface ComponentFile {
  format: "fayteworks-component-def";
  version: 1;
  components: ComponentDef[];
  assets: AssetBundle;
}

async function exportComponent(site: Site, def: ComponentDef) {
  const components = withNested(site, def);
  const file: ComponentFile = { format: "fayteworks-component-def", version: 1, components, assets: await bundleAssets(components) };
  downloadBlob(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }), `${slugify(def.name) || "component"}.component.json`);
}

function fieldLabel(block: Block | null, field: FieldDef): string {
  if (!block) return field.label;
  const pieceLabel = getBlockDefinition(block.type)?.label ?? block.type;
  return field.label === pieceLabel ? field.label : `${pieceLabel} ${field.label.toLowerCase()}`;
}

export function useExposure(section: Section | null, blockId: string): FieldExposure | undefined {
  const { state, commit } = useEditor();
  const def = section
    ? state.site.components?.find((c) => designsOf(c).some((d) => d.section.id === section.id))
    : findComponent(state.site.components, state.componentId);
  if (!def) return undefined;
  const block = blockId === FRAME ? null : (designsOf(def).map((d) => d.section.blocks.find((b) => b.id === blockId)).find(Boolean) ?? null);
  return {
    labelOf: (key) => def.fields.find((f) => f.blockId === blockId && f.prop === key)?.label ?? null,
    toggle: (field) =>
      commit((draft) => {
        const d = draft.components?.find((c) => c.id === def.id);
        if (!d) return;
        const i = d.fields.findIndex((f) => f.blockId === blockId && f.prop === field.key);
        if (i >= 0) d.fields.splice(i, 1);
        else {
          const made = newField(d, blockId, field.key, blockId === FRAME ? `Frame ${field.label.toLowerCase()}` : fieldLabel(block, field));
          const only = designsWithPiece(d, blockId);
          d.fields.push(only ? { ...made, variants: only } : made);
        }
      })
  };
}

export function ComponentPreview({ def, width = 220, height = 150, components }: { def: ComponentDef; width?: number; height?: number; components?: ComponentDef[] }) {
  const { state } = useEditor();
  const ctx = useRenderContext();
  useAssetVersion();
  const innerRef = useRef<HTMLDivElement>(null);
  const [innerHeight, setInnerHeight] = useState(0);
  const layoutWidth = designWidth(def, state.site.theme);
  const scale = Math.min(1, width / layoutWidth, innerHeight ? height / innerHeight : 1);
  const block = useMemo<Block>(() => ({ id: `preview-${def.id}`, type: "component", x: 0, y: 0, ...placedSize(def), props: { componentId: def.id } }), [def]);
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setInnerHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="cmp-preview" style={{ height }} aria-hidden>
      <div ref={innerRef} className="site-root cmp-preview-inner" style={{ ...themeVars(state.site.theme), width: layoutWidth, containerType: "normal", transform: `translate(-50%, -50%) scale(${scale})` }}>
        {components ? (
          <RenderCtx.Provider value={{ ...ctx, components, asset: libraryAssetUrl }}>
            <BlockContent block={block} />
          </RenderCtx.Provider>
        ) : (
          <BlockContent block={block} />
        )}
      </div>
    </div>
  );
}

export function PlaceComponentsGroup({ excludeId, title = "Your components" }: { excludeId?: string; title?: string }) {
  const { state } = useEditor();
  const addBlock = useAddBlock();
  const components = (state.site.components ?? []).filter((c) => c.id !== excludeId);
  if (components.length === 0) return null;
  return (
    <section className="library-group">
      <h3 className="panel-heading">{title}</h3>
      <div className="library-grid">
        {components.map((def) => (
          <button
            key={def.id}
            className="library-item"
            title={def.description || `${def.name}: click to add, or drag onto a section`}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(LIBRARY_MIME, "component");
              event.dataTransfer.effectAllowed = "copy";
              Object.assign(activeLibraryDrag, { type: "component", props: { componentId: def.id }, size: placedSize(def) });
            }}
            onDragEnd={() => Object.assign(activeLibraryDrag, { type: null, props: undefined, size: undefined })}
            onClick={() => addBlock("component", { props: { componentId: def.id }, size: placedSize(def) })}
          >
            <span className="library-icon">{def.icon || "◆"}</span>
            <span>{def.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ComponentsPanel() {
  const { state, commit, editComponent } = useEditor();
  const components = state.site.components ?? [];
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const library = useComponentLibrary();
  const [busy, setBusy] = useState("");

  async function toLibrary(def: ComponentDef) {
    setBusy(def.id);
    try {
      const libraryId = await saveToLibrary(state.site, def);
      commit((draft) => {
        const d = draft.components?.find((c) => c.id === def.id);
        if (d) d.libraryId = libraryId;
      });
    } finally {
      setBusy("");
    }
  }

  async function fromLibrary(entry: LibraryEntry) {
    const defs = await componentsFromLibrary(entry);
    commit((draft) => {
      draft.components = [...(draft.components ?? []), ...defs];
    });
  }

  async function pull(def: ComponentDef, entry: LibraryEntry) {
    if (!window.confirm(`Replace “${def.name}” in this site with the library's version? Every placed copy updates.`)) return;
    const { latest, extras } = await pullFromLibrary(state.site, def, entry);
    commit((draft) => {
      draft.components = [...(draft.components ?? []).map((c) => (c.id === def.id ? latest : c)), ...extras];
    });
  }

  function create(def: ComponentDef) {
    commit((draft) => {
      draft.components = [...(draft.components ?? []), def];
    });
    editComponent(def.id);
  }

  async function importFile(file: File) {
    setError("");
    try {
      const parsed = JSON.parse(await file.text()) as Partial<ComponentFile>;
      if (!String(parsed.format).endsWith("-component-def") || !Array.isArray(parsed.components)) throw new Error("That isn't a component file.");
      await restoreAssets(parsed.assets);
      const ids = new Map(parsed.components.map((c) => [c.id, createId("cmp")]));
      const remap = (section: Section) => {
        const migrated = migrateSection(section);
        for (const b of migrated.blocks) if (b.type === "component" && ids.has(String(b.props.componentId))) b.props.componentId = ids.get(String(b.props.componentId))!;
        return migrated;
      };
      const imported = parsed.components.map((c) => ({
        ...c,
        id: ids.get(c.id)!,
        section: remap(c.section),
        variants: c.variants?.map((v) => ({ ...v, section: remap(v.section) })),
        frame: { ...DEFAULT_FRAME, ...c.frame },
        fields: c.fields ?? []
      }));
      commit((draft) => {
        draft.components = [...(draft.components ?? []), ...imported];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function duplicate(def: ComponentDef) {
    const copy = structuredClone(def);
    copy.id = createId("cmp");
    copy.name = `${def.name} copy`;
    copy.section.id = createId("sec");
    for (const v of copy.variants ?? []) v.section.id = createId("sec");
    delete copy.libraryId;
    commit((draft) => {
      draft.components = [...(draft.components ?? []), copy];
    });
  }

  function remove(def: ComponentDef) {
    const copies = copiesOf(state.site, def.id);
    const message = copies
      ? `Delete “${def.name}”? Its ${copies} placed ${copies === 1 ? "copy becomes" : "copies become"} ordinary blocks, so nothing disappears from your pages.`
      : `Delete “${def.name}”?`;
    if (!window.confirm(message)) return;
    commit((draft) => {
      for (const section of allSections(draft)) {
        const next: Block[] = [];
        for (const b of section.blocks) {
          if (b.type === "component" && b.props.componentId === def.id) next.push(...detachComponent(def, b, section));
          else next.push(b);
        }
        section.blocks = next;
      }
      draft.components = (draft.components ?? []).filter((c) => c.id !== def.id);
    });
  }

  return (
    <div className="cmp-panel">
      <p className="panel-hint">
        Make your own components from the same pieces pages use. Choose which settings become <strong>fields</strong>:
        they're all anyone needs to fill in when placing it. Placed copies stay linked, so editing the component
        updates every copy.
      </p>

      <h3 className="panel-heading">Start a component</h3>
      <div className="cmp-blueprints">
        {BLUEPRINTS.map((b) => (
          <button key={b.id} className="cmp-blueprint" title={b.description} onClick={() => create(b.build())}>
            <strong>{b.name}</strong>
            <span>{b.description}</span>
          </button>
        ))}
      </div>
      <p className="panel-hint">Or select blocks on a page and choose “◆ Make component” in the inspector.</p>

      <div className="cmp-panel-heading">
        <h3 className="panel-heading">In this site</h3>
        <button className="link-button" onClick={() => fileRef.current?.click()}>
          Import…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importFile(file);
          }}
        />
      </div>
      {error && <p className="dialog-status dialog-status--error">{error}</p>}
      {components.length === 0 ? (
        <p className="panel-hint">No components yet.</p>
      ) : (
        <ul className="cmp-list">
          {components.map((def) => (
            <li key={def.id} className={`cmp-card${state.componentId === def.id ? " is-open" : ""}`}>
              <ComponentPreview def={def} />
              <div className="cmp-card-info">
                <strong>
                  {def.icon} {def.name}
                </strong>
                <span>
                  {def.fields.length} field{def.fields.length === 1 ? "" : "s"}
                  {def.variants?.length ? ` · ${def.variants.length + 1} variants` : ""} · {copiesOf(state.site, def.id)} placed
                  {libraryEntry(def.libraryId) ? " · in my library" : ""}
                </span>
              </div>
              <div className="cmp-card-actions">
                <button className="btn btn--small btn--primary" onClick={() => editComponent(def.id)}>
                  Edit
                </button>
                <button className="btn btn--small" onClick={() => duplicate(def)}>
                  Duplicate
                </button>
                <button className="btn btn--small" title="Save as a file to share or use in another site" onClick={() => void exportComponent(state.site, def)}>
                  Export
                </button>
                <button className="btn btn--small btn--danger" onClick={() => remove(def)}>
                  Delete
                </button>
              </div>
              <div className="cmp-card-actions cmp-card-library">
                {libraryEntry(def.libraryId) ? (
                  <>
                    <button className="btn btn--small" disabled={busy === def.id} title="Save this version to your library, for every site" onClick={() => void toLibrary(def)}>
                      Update library
                    </button>
                    <button className="btn btn--small" title="Replace this site's version with the library's" onClick={() => void pull(def, libraryEntry(def.libraryId)!)}>
                      Update from library
                    </button>
                  </>
                ) : (
                  <button className="btn btn--small" disabled={busy === def.id} title="Keep it in your library to use in every site" onClick={() => void toLibrary(def)}>
                    Save to my library
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="panel-heading cmp-library-heading">My library (every site)</h3>
      {library.length === 0 ? (
        <p className="panel-hint">Components you save to your library show up here in every site you open on this computer.</p>
      ) : (
        <ul className="cmp-list">
          {library.map((entry) => {
            const inSite = components.some((c) => c.libraryId === entry.libraryId);
            return (
              <li key={entry.libraryId} className="cmp-card">
                <ComponentPreview def={entry.components[0]} components={entry.components} />
                <div className="cmp-card-info">
                  <strong>
                    {entry.components[0].icon} {entry.name}
                  </strong>
                  <span>Saved {new Date(entry.savedAt).toLocaleDateString()}{inSite ? " · in this site" : ""}</span>
                </div>
                <div className="cmp-card-actions">
                  <button className="btn btn--small btn--primary" disabled={inSite} onClick={() => void fromLibrary(entry)}>
                    {inSite ? "Already here" : "Add to this site"}
                  </button>
                  <button
                    className="btn btn--small btn--danger"
                    onClick={() => window.confirm(`Remove “${entry.name}” from your library? Sites that use it keep their copy.`) && removeFromLibrary(entry.libraryId)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function MakerBar({ def }: { def: ComponentDef }) {
  const { state, select, editComponent } = useEditor();
  const tier = editorTier(state);
  return (
    <div className="cmp-maker-bar" onPointerDown={(e) => e.stopPropagation()}>
      <span className="cmp-maker-kind">◆ Component maker</span>
      <strong>{def.name}</strong>
      <span className="cmp-maker-meta">
        {def.columns} of 12 columns · {def.fields.length} field{def.fields.length === 1 ? "" : "s"} · {copiesOf(state.site, def.id)} placed
        {tier !== "desktop" && ` · editing the ${tier} arrangement`}
      </span>
      <button className="btn btn--small" onClick={() => select({ kind: "none" })}>
        Component settings
      </button>
      <button className="btn btn--small btn--primary" onClick={() => editComponent(null)}>
        Done
      </button>
      <VariantTabs def={def} />
    </div>
  );
}

function VariantTabs({ def }: { def: ComponentDef }) {
  const { state, commit, editComponent } = useEditor();
  const current = state.componentVariantId ?? "";
  return (
    <div className="cmp-variant-tabs" role="tablist" aria-label="Variants">
      <span className="cmp-variant-label">Variants:</span>
      {designsOf(def).map((d) => (
        <button key={d.id || "default"} role="tab" aria-selected={d.id === current} className={d.id === current ? "is-active" : undefined} onClick={() => editComponent(def.id, d.id || null)}>
          {d.name}
        </button>
      ))}
      <button
        className="cmp-variant-add"
        title="A new variant: starts as a copy of the design shown, then change anything (fields keep working)"
        onClick={async () => {
          const name = await askText("Name the new variant (e.g. Dark, Horizontal, Compact):", "Dark");
          if (!name) return;
          const variant = createVariant(def, name, variantOf(def, state.componentVariantId));
          commit((draft) => {
            const d = draft.components?.find((c) => c.id === def.id);
            if (d) d.variants = [...(d.variants ?? []), variant];
          });
          editComponent(def.id, variant.id);
        }}
      >
        + Variant
      </button>
    </div>
  );
}

export function MakerStage({ def, screenWidth }: { def: ComponentDef; screenWidth: number }) {
  const { state, select } = useEditor();
  const { asset } = useRenderContext();
  const tier = editorTier(state);
  const width = designWidth(def, state.site.theme, screenWidth, tier === "phone");
  const design = variantOf(def, state.componentVariantId);
  const frame = { ...DEFAULT_FRAME, ...design.frame };
  return (
    <div className="cmp-maker-root">
      <div
        className="b-component cmp-maker-frame"
        style={{ ...frameStyle(frame, asset), width } as CSSProperties}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            e.stopPropagation();
            select({ kind: "none" });
          }
        }}
      >
        <CardItemProvider>
          <SectionEditor section={design.section} role="component" index={0} total={1} />
        </CardItemProvider>
      </div>
      <p className="cmp-maker-hint">
        {tier === "phone"
          ? "On phones the pieces stack unless you customize the phone arrangement (bar above the pieces). "
          : tier === "tablet"
            ? "Tablets use the desktop arrangement unless you customize it (bar above the pieces). "
            : ""}
        Add pieces from the Add tab and use <strong>◇ Field</strong> next to any setting to let each placed copy change
        it. Switch the device at the top to design other screen sizes.
      </p>
    </div>
  );
}

export function InlineMaker({ def }: { def: ComponentDef }) {
  const { state } = useEditor();
  const { asset } = useRenderContext();
  const card = useCardSource();
  const design = variantOf(def, state.componentVariantId);
  const frame = { ...DEFAULT_FRAME, ...design.frame };
  const maker = (
    <div className="b-component cmp-inline-frame" style={frameStyle(frame, asset) as CSSProperties} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <CardItemProvider>
        <SectionEditor section={design.section} role="component" index={0} total={1} />
      </CardItemProvider>
    </div>
  );
  if (!card?.block) return maker;
  const cols = Math.max(1, Math.min(6, Number(card.block.props.columns ?? 3)));
  const gap = Number(card.block.props.gap ?? 20);
  return (
    <div className="cmp-inline-card" style={{ width: `calc((100% - ${(cols - 1) * gap}px) / ${cols})` }}>
      {maker}
    </div>
  );
}

export function ComponentInspector({ def }: { def: ComponentDef }) {
  const { state, commit, select, editComponent } = useEditor();
  const addBlock = useAddBlock();
  const frameExposure = useExposure(null, FRAME);

  function update(recipe: (d: ComponentDef) => void, key?: string) {
    commit((draft) => {
      const d = draft.components?.find((c) => c.id === def.id);
      if (d) recipe(d);
    }, key);
  }

  const variantId = state.componentVariantId;
  const design = variantOf(def, variantId);

  function updateFrame(key: string, value: PropValue) {
    update((d) => {
      const v = variantId ? d.variants?.find((x) => x.id === variantId) : undefined;
      (v ?? d).frame[key] = value;
    }, `${def.id}.${variantId ?? ""}.frame.${key}`);
  }

  function describeTarget(blockId: string, prop: string): string {
    if (blockId === FRAME) return `Frame · ${FRAME_FIELDS.find((f) => f.key === prop)?.label ?? prop}`;
    const block = designsOf(def).map((d) => d.section.blocks.find((b) => b.id === blockId)).find(Boolean);
    if (!block) return "A removed piece";
    const blockDef = getBlockDefinition(block.type);
    const field = blockDef && [...(blockDef.extraFields?.(block.props, state.site) ?? []), ...blockDef.fields].find((f) => f.key === prop);
    return `${blockDef?.label ?? block.type} · ${field?.label ?? prop}`;
  }

  return (
    <>
      <header className="inspector-header">
        <span className="inspector-kind">{def.icon || "◆"}</span>
        <div>
          <h2>{def.name}</h2>
          <span className="field-hint">Component</span>
        </div>
      </header>

      <section className="inspector-group">
        <h3 className="panel-heading">Component</h3>
        <FieldList
          fields={[
            { key: "name", label: "Name", kind: "text" },
            { key: "icon", label: "Icon", kind: "text", hint: "A symbol or emoji for the library." },
            { key: "description", label: "Description", kind: "textarea" },
            { key: "columns", label: "Designed width (page columns)", kind: "range", min: 1, max: 12, hint: "How wide it is drawn here and placed on pages. Copies can still be resized." }
          ]}
          values={{ name: def.name, icon: def.icon, description: def.description, columns: def.columns }}
          onChange={(key, value) =>
            update((d) => {
              if (key === "columns") d.columns = Math.max(1, Math.min(12, Math.round(Number(value))));
              else (d as unknown as Record<string, unknown>)[key] = String(value);
            }, `${def.id}.${key}`)
          }
        />
      </section>

      <section className="inspector-group">
        <GridPrecisionField
          value={densityOf(def.section)}
          onChange={(d) =>
            update((c) => {
              setGridDensity(c.section, d);
              for (const v of c.variants ?? []) setGridDensity(v.section, d);
            })
          }
        />
      </section>

      <section className="inspector-group">
        <h3 className="panel-heading">Fields ({def.fields.length})</h3>
        {def.fields.length === 0 ? (
          <p className="field-hint">
            Nothing is changeable per copy yet. Select a piece and press <strong>◇ Field</strong> next to a setting (or
            next to a frame setting below).
          </p>
        ) : (
          <ul className="cmp-fields">
            {def.fields.map((f, i) => (
              <li key={f.id}>
                <input
                  type="text"
                  aria-label="Field name"
                  value={f.label}
                  onChange={(e) => update((d) => void (d.fields[i].label = e.target.value), `${def.id}.field.${f.id}`)}
                />
                {def.variants?.length ? (
                  <select
                    className="cmp-field-variants"
                    aria-label="Shows for"
                    title="Which designs this field shows for"
                    value={f.variants?.length === 1 ? f.variants[0] : f.variants ? "__some" : "__all"}
                    onChange={(e) =>
                      update((d) => {
                        const target = d.fields[i];
                        if (e.target.value === "__all") delete target.variants;
                        else target.variants = [e.target.value];
                      })
                    }
                  >
                    <option value="__all">Shows for every design</option>
                    {f.variants && f.variants.length > 1 && <option value="__some">Shows for {f.variants.length} designs</option>}
                    {designsOf(def).map((d) => (
                      <option key={d.id || "default"} value={d.id}>
                        Only {d.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <span className="cmp-field-target">
                  <button
                    className="link-button"
                    title="Select this piece"
                    onClick={() => f.blockId !== FRAME && select({ kind: "block", sectionId: def.section.id, blockId: f.blockId })}
                  >
                    {describeTarget(f.blockId, f.prop)}
                  </button>
                </span>
                <span className="cmp-field-actions">
                  <button title="Move up" disabled={i === 0} onClick={() => update((d) => void d.fields.splice(i - 1, 0, ...d.fields.splice(i, 1)))}>
                    ↑
                  </button>
                  <button title="Move down" disabled={i === def.fields.length - 1} onClick={() => update((d) => void d.fields.splice(i + 1, 0, ...d.fields.splice(i, 1)))}>
                    ↓
                  </button>
                  <button title="Stop being a field" onClick={() => update((d) => void d.fields.splice(i, 1))}>
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="inspector-group">
        <h3 className="panel-heading">Frame{design.variant ? ` · ${design.variant.name}` : ""}</h3>
        <FieldList fields={FRAME_FIELDS} values={{ ...DEFAULT_FRAME, ...design.frame }} expose={frameExposure} onChange={updateFrame} />
      </section>

      <section className="inspector-group">
        <h3 className="panel-heading">Variants ({def.variants?.length ?? 0})</h3>
        {!def.variants?.length ? (
          <p className="field-hint">
            Alternative designs of this component (a dark version, a horizontal one…). Press <strong>+ Variant</strong> in
            the bar above the canvas; each placed copy then picks one.
          </p>
        ) : (
          <ul className="cmp-fields">
            {def.variants.map((v, i) => (
              <li key={v.id}>
                <input
                  type="text"
                  aria-label="Variant name"
                  value={v.name}
                  onChange={(e) => update((d) => void (d.variants![i].name = e.target.value), `${def.id}.variant.${v.id}`)}
                />
                <span className="cmp-field-target">
                  <button className="link-button" onClick={() => editComponent(def.id, v.id)}>
                    {variantId === v.id ? "Editing now" : "Edit this variant"}
                  </button>
                </span>
                <span className="cmp-field-actions">
                  <button
                    title="Delete this variant (copies using it show the default design)"
                    onClick={() => {
                      if (!window.confirm(`Delete the “${v.name}” variant?`)) return;
                      if (variantId === v.id) editComponent(def.id, null);
                      update((d) => void d.variants!.splice(i, 1));
                    }}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="inspector-group">
        <div className="field-row">
          <button
            className="btn btn--primary"
            onClick={() => {
              editComponent(null);
              addBlock("component", { props: { componentId: def.id }, size: placedSize(def), toPage: true });
            }}
          >
            Place on page
          </button>
          <button className="btn" onClick={() => void exportComponent(state.site, def)}>
            Export
          </button>
          <button className="btn" onClick={() => editComponent(null)}>
            Done
          </button>
        </div>
      </section>
    </>
  );
}

export function ChangeDesign({ section, block, def }: { section: Section; block: Block; def: ComponentDef }) {
  const { state, page, commit, select, editComponent } = useEditor();
  const uses = componentUses(state.site, def.id);
  const card = block.type === "collection";
  const anchor = { sectionId: section.id, blockId: block.id };
  return (
    <section className="design-card">
      <div className="design-card-text">
        <strong>{card ? "The card" : def.name}</strong>
        <span>{uses > 1 ? `Used in ${uses} places. Changing it changes them all.` : "Only used here, so change it however you like."}</span>
      </div>
      <button className="btn btn--primary btn--block" onClick={() => editComponent(def.id, null, anchor)}>
        {card ? "Change the card" : "Change its design"}
      </button>
      {uses > 1 && (
        <button
          className="btn btn--block"
          title="Makes a copy of the design just for this spot; the other places keep the original"
          onClick={() => {
            const mine = copyComponent(def, `${def.name} (${card ? "this list" : "this one"})`);
            commit((draft) => {
              draft.components = [...(draft.components ?? []), mine];
              const b = findSection(draft, page.id, section.id)?.blocks.find((x) => x.id === block.id);
              if (b) b.props.componentId = mine.id;
            });
            editComponent(mine.id, null, anchor);
          }}
        >
          Change just this one
        </button>
      )}
      <div className="design-card-foot">
        <span>Or double-click it on the page.</span>
        {!card && (
          <button
            className="link-button"
            title="Replace it with ordinary pieces you can change freely; it stops following the design"
            onClick={() => {
              const blocks = detachComponent(def, block, section);
              commit((draft) => {
                const s = findSection(draft, page.id, section.id);
                if (!s) return;
                const i = s.blocks.findIndex((b) => b.id === block.id);
                if (i >= 0) s.blocks.splice(i, 1, ...blocks);
              });
              select({ kind: "block", sectionId: section.id, blockId: blocks[blocks.length - 1].id, blockIds: blocks.map((b) => b.id) });
            }}
          >
            Break it into loose pieces
          </button>
        )}
      </div>
    </section>
  );
}

export function MakeComponentButton({ section, ids }: { section: Section; ids: string[] }) {
  const { page, commit, select, editComponent } = useEditor();
  return (
    <button
      className="btn btn--block"
      title="Turn these blocks into a reusable component with fields; a linked copy takes their place"
      onClick={async () => {
        const name = await askText("Name the new component:", ids.length === 1 ? "My component" : "My card");
        if (!name) return;
        const made = componentFromBlocks(name, section, ids);
        if (!made) return;
        const first = section.blocks.find((b) => ids.includes(b.id));
        const copy: Block = { id: createId("blk"), type: "component", ...made.rect, layerId: first?.layerId, props: { componentId: made.def.id } };
        commit((draft) => {
          draft.components = [...(draft.components ?? []), made.def];
          const s = findSection(draft, page.id, section.id);
          if (!s) return;
          const at = s.blocks.findIndex((b) => ids.includes(b.id));
          s.blocks = s.blocks.filter((b) => !ids.includes(b.id));
          s.blocks.splice(Math.max(0, at), 0, copy);
        });
        select({ kind: "block", sectionId: section.id, blockId: copy.id });
        editComponent(made.def.id);
      }}
    >
      ◆ Make component
    </button>
  );
}
