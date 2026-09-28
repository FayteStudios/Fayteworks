import { lazy, Suspense, useState } from "react";
import { getBlockDefinition } from "../blocks/registry";
import { CaptionsBody, srcKey, TrimBody } from "../media/MediaTools";
import { findSection } from "../model/ops";
import { themeVars } from "../model/theme";
import type { Block } from "../model/types";
import { useRenderContext } from "../site/renderContext";
import { isAssetRef } from "../state/assets";
import { useEditor } from "../state/store";
import { colorMapOf } from "../blocks/vector";
import { drawingReference, saveDrawing } from "../vector/VectorTools";
import { setFocusTool } from "./workspace";

const VectorEditor = lazy(() => import("../vector/VectorEditor"));

function useFocused(): { block: Block | undefined; mutate: (recipe: (b: Block) => void, key?: string) => void } {
  const { state, page, commit } = useEditor();
  const focus = state.focusedBlock;
  const block = focus ? findSection(state.site, page.id, focus.sectionId)?.blocks.find((b) => b.id === focus.blockId) : undefined;
  const mutate = (recipe: (b: Block) => void, key?: string) =>
    commit((draft) => {
      const b = focus ? findSection(draft, page.id, focus.sectionId)?.blocks.find((x) => x.id === focus.blockId) : undefined;
      if (b) recipe(b);
    }, key);
  return { block, mutate };
}

function CodeArea({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <textarea
      className="field-code code-panel-area"
      aria-label={label}
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Tab" || e.shiftKey) return;
        e.preventDefault();
        const t = e.currentTarget;
        const { selectionStart: start, selectionEnd: end } = t;
        const next = `${t.value.slice(0, start)}  ${t.value.slice(end)}`;
        onChange(next);
        requestAnimationFrame(() => t.setSelectionRange(start + 2, start + 2));
      }}
    />
  );
}

export function CodePanel() {
  const { state } = useEditor();
  const { block, mutate } = useFocused();
  const ctx = useRenderContext();
  const [tab, setTab] = useState<"html" | "css">("html");
  const [width, setWidth] = useState<"piece" | "phone" | "full">("piece");
  if (!block || block.type !== "code") return <p className="panel-hint frames-empty">Open a Custom code piece to edit its code here.</p>;
  const def = getBlockDefinition("code")!;
  const preview = def.render(block.props, { ...ctx, isEditor: false }, { id: `${block.id}-preview` });
  return (
    <div className="code-panel">
      <div className="code-panel-editor">
        <div className="code-panel-tabs" role="tablist">
          {(["html", "css"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "is-active" : undefined} onClick={() => setTab(t)}>
              {t.toUpperCase()}
            </button>
          ))}
          <span className="code-panel-hint">{tab === "html" ? "{{name}} makes a field you can fill in on the right." : "Styles stay inside this piece. Theme colours: var(--accent), var(--text)…"}</span>
        </div>
        <CodeArea key={tab} label={tab.toUpperCase()} value={String(block.props[tab] ?? "")} onChange={(v) => mutate((b) => void (b.props[tab] = v), `${block.id}.${tab}`)} />
      </div>
      <div className="code-panel-preview">
        <div className="code-panel-tabs">
          <strong>Live preview</strong>
          <span className="code-panel-sizes">
            {(
              [
                ["piece", "Piece"],
                ["phone", "Phone"],
                ["full", "Full width"]
              ] as const
            ).map(([id, label]) => (
              <button key={id} className={width === id ? "is-active" : undefined} onClick={() => setWidth(id)}>
                {label}
              </button>
            ))}
          </span>
        </div>
        <div className="code-panel-stage">
          <div className={`site-root code-panel-frame code-panel-frame--${width}`} style={themeVars(state.site.theme) as React.CSSProperties}>
            {preview}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MediaPanel({ mode }: { mode: "trim" | "captions" }) {
  const { block, mutate } = useFocused();
  if (!block || (block.type !== "video" && block.type !== "audio")) return <p className="panel-hint frames-empty">Open a video or sound piece to edit it here.</p>;
  const src = String(block.props[srcKey(block)] ?? "");
  const uploaded = isAssetRef(src) || src.startsWith("data:") || src.startsWith("blob:");
  if (!uploaded) return <p className="panel-hint frames-empty">Trimming and captions work on uploaded files. Upload the {block.type === "video" ? "video" : "sound"} in Settings first.</p>;
  const kind = block.type === "video" ? "video" : "audio";
  return (
    <div className="media-panel">
      {mode === "trim" ? (
        <TrimBody
          key={`${block.id}:${src}`}
          kind={kind}
          src={src}
          onClose={() => undefined}
          onDone={(ref, poster) =>
            mutate((b) => {
              if (ref) b.props[srcKey(b)] = ref;
              if (poster) b.props.poster = poster;
            })
          }
        />
      ) : (
        <CaptionsBody
          key={block.id}
          src={src}
          captions={String(block.props.captions ?? "")}
          lang={String(block.props.captionsLang ?? "en")}
          on={Boolean(block.props.captionsOn)}
          onClose={() => undefined}
          onSave={(ref, lang, on) =>
            mutate((b) => {
              b.props.captions = ref;
              b.props.captionsLang = lang;
              b.props.captionsOn = on;
            })
          }
        />
      )}
    </div>
  );
}

export function DrawPanel() {
  const { block, mutate } = useFocused();
  if (!block || block.type !== "vector") return <p className="panel-hint frames-empty">Open a drawing to draw here.</p>;
  const links = colorMapOf(block.props);
  return (
    <Suspense fallback={<p className="panel-hint">Loading the drawing tool…</p>}>
      <VectorEditor
        key={block.id}
        embedded
        svg={String(block.props.svg ?? "")}
        links={links}
        reference={drawingReference(block)}
        onSave={(next, allLinks, ref) => mutate((b) => saveDrawing(b, next, allLinks, ref))}
        onClose={() => setFocusTool(null)}
      />
    </Suspense>
  );
}
