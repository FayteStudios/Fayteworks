import { framesFromLayers } from "../motion/flipbook";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { colorMapOf } from "../blocks/vector";
import { allSections } from "../model/ops";
import { resolveColor, THEME_TOKENS } from "../model/theme";
import type { Block, ListItem } from "../model/types";
import { desktop, type VectorApp } from "../platform/desktop";
import { editorTier, useEditor } from "../state/store";
import { drawingColors, drawingLayers, LAYER_EFFECTS, sanitizeSvg, type LayerAnimation } from "./svg";
import type { EditorReference } from "./VectorEditor";

const VectorEditor = lazy(() => import("./VectorEditor"));

const APP_KEY = "fayteworks:vector-app";

export function readVectorApp(): string {
  return readApp();
}

function readApp(): string {
  try {
    return localStorage.getItem(APP_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveApp(path: string) {
  try {
    localStorage.setItem(APP_KEY, path);
  } catch {
  }
}

export function withDrawing(block: Block, svg: string) {
  block.props.svg = svg;
  const used = new Set(drawingColors(svg).map((c) => c.color));
  const colors = (Array.isArray(block.props.colors) ? block.props.colors : []) as ListItem[];
  block.props.colors = colors.filter((c) => used.has(String(c.color)));
}

export function drawingReference(block: Block): EditorReference | null {
  if (!block.props.reference) return null;
  const matrix = String(block.props.referenceMatrix ?? "").split(" ").filter(Boolean).map(Number);
  return {
    src: String(block.props.reference),
    opacity: Number(block.props.referenceOpacity ?? 0.5),
    visible: block.props.referenceVisible !== false,
    matrix: matrix.length === 6 ? matrix : null
  };
}

export function saveDrawing(b: Block, next: string, allLinks: Record<string, string>, ref: EditorReference | null) {
  withDrawing(b, next);
  if (ref) {
    b.props.reference = ref.src;
    b.props.referenceOpacity = ref.opacity;
    b.props.referenceVisible = ref.visible;
    b.props.referenceMatrix = ref.matrix ? ref.matrix.map((n) => Math.round(n * 10000) / 10000).join(" ") : "";
  } else {
    delete b.props.reference;
    delete b.props.referenceOpacity;
    delete b.props.referenceVisible;
    delete b.props.referenceMatrix;
  }
  const kept = ((Array.isArray(b.props.colors) ? b.props.colors : []) as ListItem[]).filter((c) => !allLinks[String(c.color)]);
  const used = new Set(drawingColors(next).map((c) => c.color));
  b.props.colors = [...kept, ...Object.entries(allLinks).filter(([color]) => used.has(color)).map(([color, token]) => ({ color, token }))];
}

export function VectorSync() {
  const { commit, state } = useEditor();
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (!desktop) return;
    return desktop.onDrawingChanged(({ blockId, svg }) => {
      if (blockId.startsWith("section-")) {
        void import("./SectionSvgTools").then(({ applySectionChanges }) =>
          import("./sectionSvg").then(({ planSectionChanges }) => {
            const current = stateRef.current;
            const sectionId = blockId.slice("section-".length);
            const section = allSections(current.site).find((s) => s.id === sectionId);
            if (!section) return;
            try {
              const changes = planSectionChanges(section, svg);
              commit((draft) => {
                const target = allSections(draft).find((s) => s.id === sectionId);
                if (target) applySectionChanges(target, changes, editorTier(current));
              });
            } catch (error) {
              console.warn("Section SVG not applied:", error);
            }
          })
        );
        return;
      }
      let clean: string;
      try {
        clean = sanitizeSvg(svg);
      } catch {
        return;
      }
      commit((draft) => {
        const block = allSections(draft)
          .flatMap((s) => s.blocks)
          .find((b) => b.id === blockId && b.type === "vector");
        if (block) withDrawing(block, clean);
      });
    });
  }, [commit]);
  return null;
}

function download(name: string, svg: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name || "drawing"}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function VectorTools({ block, mutate }: { block: Block; mutate: (recipe: (b: Block) => void, key?: string) => void }) {
  const { state } = useEditor();
  const svg = String(block.props.svg ?? "");
  const colors = useMemo(() => drawingColors(svg), [svg]);
  const links = colorMapOf(block.props);
  const [editorOpen, setEditorOpen] = useState(false);
  const [apps, setApps] = useState<VectorApp[]>([]);
  const [appPath, setAppPath] = useState(readApp);
  const [watching, setWatching] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!desktop) return;
    void desktop.vectorApps().then((found) => {
      setApps(found);
      if (!readApp() && found[0]) setAppPath(found[0].path);
    });
  }, []);

  useEffect(() => () => void desktop?.stopEditingDrawing(block.id).catch(() => {}), [block.id]);

  const appName = apps.find((a) => a.path === appPath)?.name ?? (appPath ? appPath.split(/[\\/]/).pop()?.replace(/\.(exe|app)$/i, "") : "the default program");

  async function editOutside() {
    setError("");
    try {
      const file = await desktop!.editDrawing(block.id, svg, appPath || null);
      setWatching(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function chooseApp(value: string) {
    if (value === "__choose") {
      const chosen = await desktop!.chooseVectorApp();
      if (!chosen) return;
      value = chosen;
    }
    setAppPath(value);
    saveApp(value);
  }

  async function importFile(file: File) {
    setError("");
    try {
      const clean = sanitizeSvg(await file.text());
      mutate((b) => withDrawing(b, clean));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function link(color: string, token: string) {
    mutate((b) => {
      const rest = ((Array.isArray(b.props.colors) ? b.props.colors : []) as ListItem[]).filter((c) => c.color !== color);
      b.props.colors = token ? [...rest, { color, token }] : rest;
    });
  }

  return (
    <section className="inspector-group vector-tools">
      <h3 className="panel-heading">Drawing</h3>
      <button className="btn btn--primary btn--block" onClick={() => setEditorOpen(true)}>
        ✎ Edit drawing
      </button>
      {framesFromLayers(svg).length > 1 && (
        <button
          className="btn btn--block"
          title="Each layer becomes one frame of a frame-by-frame animation (bottom layer first)"
          onClick={() =>
            mutate((b) => {
              const frames = framesFromLayers(String(b.props.svg ?? ""));
              b.type = "flipbook";
              b.props = { frames: frames.map((f) => ({ svg: f.svg })), fps: 12, play: "loop", pingpong: false, fit: b.props.fit ?? "contain", alt: b.props.alt ?? "", colors: b.props.colors ?? [], editFrame: 0 };
            })
          }
        >
          🎞 Turn its {framesFromLayers(svg).length} layers into flipbook frames
        </button>
      )}

      {desktop && (
        <div className="vector-outside">
          <div className="vector-outside-row">
            <select aria-label="Program for editing drawings" value={appPath} onChange={(e) => void chooseApp(e.target.value)}>
              {apps.map((a) => (
                <option key={a.path} value={a.path}>
                  {a.name}
                </option>
              ))}
              {appPath && !apps.some((a) => a.path === appPath) && <option value={appPath}>{appName}</option>}
              <option value="">Default program for .svg</option>
              <option value="__choose">Other program…</option>
            </select>
            <button className="btn" onClick={() => void editOutside()}>
              Open
            </button>
          </div>
          {watching ? (
            <p className="field-hint vector-watching">
              ● Editing in {appName}: every save shows up here.{" "}
              <button className="link-button" onClick={() => void desktop!.showFolder(watching)}>
                Show file
              </button>
            </p>
          ) : apps.length === 0 && !appPath ? (
            <p className="field-hint">
              No drawing program found. Inkscape is free:{" "}
              <button className="link-button" onClick={() => void desktop!.openExternal("https://inkscape.org/release/")}>
                inkscape.org
              </button>
              , or choose any program above. Each time you save there, the drawing updates here.
            </p>
          ) : (
            <p className="field-hint">Edit in {appName}; each time you save there, the drawing updates here.</p>
          )}
        </div>
      )}

      <div className="vector-file-row">
        <button className="btn btn--small" onClick={() => fileRef.current?.click()}>
          Import SVG…
        </button>
        <button className="btn btn--small" onClick={() => download(String(block.name ?? "drawing"), svg)}>
          Download SVG
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".svg,image/svg+xml"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void importFile(file);
          }}
        />
      </div>
      {error && <p className="dialog-note">{error}</p>}

      {colors.length > 0 && (
        <div className="vector-colors">
          <span className="field-label">Colours</span>
          <span className="field-hint">Link a colour to the theme and it follows the site's colours.</span>
          {colors.slice(0, 16).map(({ color }) => {
            const token = links[color] ?? "";
            return (
              <div key={color} className="vector-color">
                <span className="vector-swatch" style={{ background: color }} title={color} />
                <span className="vector-color-arrow">→</span>
                <span className="vector-swatch" style={{ background: token ? resolveColor(token, state.site.theme) : color }} />
                <select aria-label={`Colour ${color}`} value={token} onChange={(e) => link(color, e.target.value)}>
                  <option value="">{color} (as drawn)</option>
                  {THEME_TOKENS.map((t) => (
                    <option key={t.value} value={t.value}>
                      Theme: {t.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      <LayerAnimations block={block} mutate={mutate} />

      {editorOpen && (
        <Suspense fallback={<div className="vector-editor-loading">Loading the vector editor…</div>}>
          <VectorEditor
            svg={svg}
            links={links}
            reference={drawingReference(block)}
            onSave={(next, allLinks, ref) => mutate((b) => saveDrawing(b, next, allLinks, ref))}
            onClose={() => setEditorOpen(false)}
          />
        </Suspense>
      )}
    </section>
  );
}

function LayerAnimations({ block, mutate }: { block: Block; mutate: (recipe: (b: Block) => void, key?: string) => void }) {
  const svg = String(block.props.svg ?? "");
  const layers = useMemo(() => [{ id: "*", label: "Whole drawing" }, ...drawingLayers(svg).map((l) => ({ id: l.id, label: l.label }))], [svg]);
  const animations = (Array.isArray(block.props.animations) ? block.props.animations : []) as unknown as LayerAnimation[];
  const update = (layer: string, patch: Partial<LayerAnimation> | null) =>
    mutate((b) => {
      const list = ((Array.isArray(b.props.animations) ? b.props.animations : []) as unknown as LayerAnimation[]).filter((a) => a.layer !== layer || patch);
      const existing = list.find((a) => a.layer === layer);
      if (patch && existing) Object.assign(existing, patch);
      else if (patch) list.push({ layer, effect: "fade", trigger: "view", speed: "normal", delay: 0, ...patch });
      b.props.animations = list as unknown as ListItem[];
    }, `${block.id}.animations.${layer}`);
  return (
    <div className="vector-anims">
      <span className="field-label">Animation</span>
      <span className="field-hint">Plays in Preview and on the published site (not for visitors who prefer less motion). Name layers in the drawing to animate them separately.</span>
      {layers.map((layer) => {
        const anim = animations.find((a) => a.layer === layer.id);
        return (
          <div key={layer.id} className="vector-anim">
            <span className="vector-anim-name" title={layer.label}>
              {layer.label}
            </span>
            <select aria-label={`Animation for ${layer.label}`} value={anim?.effect ?? ""} onChange={(e) => update(layer.id, e.target.value ? { effect: e.target.value as LayerAnimation["effect"] } : null)}>
              <option value="">No animation</option>
              {LAYER_EFFECTS.map((effect) => (
                <option key={effect.value} value={effect.value}>
                  {effect.label}
                </option>
              ))}
            </select>
            {anim && (
              <div className="vector-anim-options">
                <select aria-label="When" value={anim.trigger} onChange={(e) => update(layer.id, { trigger: e.target.value as LayerAnimation["trigger"] })}>
                  <option value="view">When scrolled into view</option>
                  <option value="hover">On hover</option>
                  <option value="loop">Always (loop)</option>
                </select>
                <select aria-label="Speed" value={anim.speed} onChange={(e) => update(layer.id, { speed: e.target.value as LayerAnimation["speed"] })}>
                  <option value="fast">Fast</option>
                  <option value="normal">Normal</option>
                  <option value="slow">Slow</option>
                </select>
                <label className="vector-anim-delay">
                  Delay
                  <input type="number" min={0} max={10} step={0.1} value={anim.delay} onChange={(e) => update(layer.id, { delay: Math.max(0, Number(e.target.value) || 0) })} />s
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
