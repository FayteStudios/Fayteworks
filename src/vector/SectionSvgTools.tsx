import { lazy, Suspense, useRef, useState } from "react";
import { gridOf } from "../model/grid";
import { targetLayerId } from "../model/layers";
import { createBlock } from "../model/factory";
import { setRect, type Tier } from "../model/responsive";
import type { Section } from "../model/types";
import { desktop } from "../platform/desktop";
import { editorTier, useEditor } from "../state/store";
import { exportSectionSvg, planSectionChanges, SECTION_ART_PROP, type SectionChanges, type SectionSvgMeta } from "./sectionSvg";
import { readVectorApp, withDrawing } from "./VectorTools";

const VectorEditor = lazy(() => import("./VectorEditor"));

export function applySectionChanges(section: Section, changes: SectionChanges, tier: Tier) {
  const cols = gridOf(section).cols;
  const fit = (r: { x: number; y: number; w: number; h: number }) => {
    const w = Math.min(Math.max(1, r.w), cols);
    return { x: Math.max(0, Math.min(r.x, cols - w)), y: Math.max(0, r.y), w, h: Math.max(1, r.h) };
  };
  for (const move of changes.moves) {
    const block = section.blocks.find((b) => b.id === move.blockId);
    if (block) setRect(section, block, tier, fit(move.rect));
  }
  for (const text of changes.texts) {
    const block = section.blocks.find((b) => b.id === text.blockId);
    if (block) block.props[text.key] = text.value;
  }
  if (changes.art) {
    const rect = fit(changes.art.rect);
    const existing = section.blocks.find((b) => b.type === "vector" && b.props[SECTION_ART_PROP]);
    if (existing) {
      withDrawing(existing, changes.art.svg);
      setRect(section, existing, tier, rect);
    } else {
      const block = createBlock("vector", { ...rect, cols }, { svg: changes.art.svg, colors: [], fit: "stretch", [SECTION_ART_PROP]: true });
      block.name = "Painted artwork";
      block.layerId = targetLayerId(section, null);
      setRect(section, block, tier, rect);
      section.blocks.push(block);
    }
  }
}

export function describeChanges(changes: SectionChanges): string {
  const parts = [
    changes.moves.length && `${changes.moves.length} block${changes.moves.length === 1 ? "" : "s"} moved`,
    changes.texts.length && `${changes.texts.length} text${changes.texts.length === 1 ? "" : "s"} changed`,
    changes.art && "artwork added as a drawing"
  ].filter(Boolean);
  return parts.length ? `Applied: ${parts.join(", ")}.` : "No changes found in that SVG.";
}

function download(name: string, svg: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name || "section"}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SectionSvgTools({ section }: { section: Section }) {
  const { state, page, commit } = useEditor();
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<{ svg: string; meta: SectionSvgMeta } | null>(null);
  const [watching, setWatching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tier = editorTier(state);

  function apply(svg: string, meta: SectionSvgMeta | null) {
    try {
      const changes = planSectionChanges(section, svg, meta);
      commit((draft) => {
        const target = [draft.header, draft.footer, ...draft.pages.flatMap((p) => p.sections)].find((s) => s?.id === section.id);
        if (target) applySectionChanges(target, changes, tier);
      });
      setStatus(describeChanges(changes));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }

  async function run(action: "editor" | "download" | "outside") {
    setStatus("");
    try {
      const d = page.design;
      const physical = d && d.unit !== "px" ? { width: `${d.width + 2 * d.bleed}${d.unit}`, height: `${d.height + 2 * d.bleed}${d.unit}` } : undefined;
      const exported = await exportSectionSvg(section, physical);
      if (action === "editor") setEditing(exported);
      else if (action === "download") download(section.name.replace(/[^\w-]+/g, "-").toLowerCase(), exported.svg);
      else {
        const app = readVectorApp();
        await desktop!.editDrawing(`section-${section.id}`, exported.svg, app || null);
        setWatching(true);
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="inspector-group section-svg-tools">
      <h3 className="panel-heading">Paint over this section</h3>
      <p className="field-hint">
        Open the section as a drawing: move or resize the dashed block frames, edit text, and draw on the “Your artwork” layer.
        Coming back, blocks move, text updates and the artwork becomes a drawing in the section.
      </p>
      <button className="btn btn--block" onClick={() => void run("editor")}>
        ✎ Paint over in the drawing editor
      </button>
      {desktop && (
        <button className="btn btn--block" onClick={() => void run("outside")}>
          Open in your drawing program
        </button>
      )}
      {watching && <p className="field-hint vector-watching">● Each save there updates this section.</p>}
      <div className="vector-file-row">
        <button className="btn btn--small" onClick={() => void run("download")}>
          Download SVG
        </button>
        <button className="btn btn--small" onClick={() => fileRef.current?.click()}>
          Apply an edited SVG…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".svg,image/svg+xml"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) apply(await file.text(), null);
          }}
        />
      </div>
      {status && <p className="field-hint">{status}</p>}
      {editing && (
        <Suspense fallback={<div className="vector-editor-loading">Loading the vector editor…</div>}>
          <VectorEditor svg={editing.svg} links={{}} onSave={(svg) => apply(svg, editing.meta)} onClose={() => setEditing(null)} />
        </Suspense>
      )}
    </section>
  );
}
