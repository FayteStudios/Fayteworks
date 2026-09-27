import { useEffect, useRef, useState, type ReactNode } from "react";
import type paper from "paper/dist/paper-core";
import { fontCss } from "../model/fonts";
import { resolveColor, THEME_TOKENS } from "../model/theme";
import { useEditor } from "../state/store";
import { DrawingEngine, type AlignOp, type BooleanOp, type Fill, type Tool } from "./engine";
import { sanitizeSvg } from "./svg";
import { getAsset, putAsset } from "../state/assets";
import { TRACE_PRESETS, type TraceOptions } from "./trace";

export interface EditorReference {
  src: string;
  opacity: number;
  visible: boolean;
  matrix: number[] | null;
}

const TOOLS: { tool: Tool; icon: ReactNode; label: string; key: string }[] = [
  { tool: "select", icon: "➤", label: "Select", key: "V" },
  { tool: "direct", icon: "◇", label: "Edit points", key: "A" },
  { tool: "pen", icon: "✒", label: "Pen", key: "P" },
  { tool: "pencil", icon: "✎", label: "Pencil", key: "N" },
  { tool: "rect", icon: "▭", label: "Rectangle", key: "M" },
  { tool: "ellipse", icon: "◯", label: "Ellipse", key: "L" },
  { tool: "polygon", icon: "⬡", label: "Polygon", key: "Y" },
  { tool: "star", icon: "☆", label: "Star", key: "S" },
  { tool: "line", icon: "╱", label: "Line", key: "\\" },
  { tool: "text", icon: "T", label: "Text", key: "T" },
  { tool: "hand", icon: "✋", label: "Hand (or hold Space)", key: "H" }
];

const TOOL_KEYS: Record<string, Tool> = { v: "select", a: "direct", p: "pen", n: "pencil", m: "rect", r: "rect", l: "ellipse", e: "ellipse", y: "polygon", s: "star", "\\": "line", t: "text", h: "hand" };

const TOOL_HINTS: Partial<Record<Tool, string>> = {
  select: "Click to select, Shift-click to add, drag the handles to scale (Shift keeps proportions, Alt from the centre), the circle to rotate. Alt-drag copies. Double-click text to edit it.",
  direct: "Click a shape to see its points. Drag points and handles; click the outline to add a point; double-click a point to make it smooth or sharp; Delete removes points.",
  pen: "Click for sharp points, drag for curves (Alt drags one handle). Click the first point to close the shape; Enter or Esc to finish.",
  pencil: "Draw freehand; the line is smoothed when you let go.",
  polygon: "Drag from the centre. Shift keeps it upright.",
  star: "Drag from the centre. Shift keeps it upright.",
  text: "Click to place text, or click existing text to edit it."
};

function ColorControl({ label, value, onChange, onTheme, theme }: { label: string; value: string; onChange: (v: string) => void; onTheme: (hex: string, token: string) => void; theme: Record<string, string> }) {
  return (
    <div className="ve-color">
      <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="ve-hex">{value}</span>
      <div className="ve-theme-swatches" aria-label={`${label}: theme colours`}>
        {THEME_TOKENS.map((t) => (
          <button key={t.value} title={`Theme: ${t.label}`} style={{ background: theme[t.value] }} onClick={() => onTheme(theme[t.value], t.value)} />
        ))}
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, step = 1, min }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  const [text, setText] = useState(String(Math.round(value * 100) / 100));
  useEffect(() => setText(String(Math.round(value * 100) / 100)), [value]);
  const commit = () => {
    const n = Number(text);
    if (Number.isFinite(n) && n !== value) onChange(min !== undefined ? Math.max(min, n) : n);
    else setText(String(Math.round(value * 100) / 100));
  };
  return (
    <label className="ve-num">
      <span>{label}</span>
      <input type="number" step={step} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (commit(), e.currentTarget.blur())} />
    </label>
  );
}

export default function VectorEditor({
  svg,
  links,
  reference,
  onion,
  onSave,
  onClose
}: {
  svg: string;
  links: Record<string, string>;
  reference?: EditorReference | null;
  onion?: { svg: string; opacity: number; label: string }[];
  onSave: (svg: string, links: Record<string, string>, reference: EditorReference | null) => void;
  onClose: () => void;
}) {
  const { state } = useEditor();
  const theme = Object.fromEntries(THEME_TOKENS.map((t) => [t.value, resolveColor(t.value, state.site.theme)]));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DrawingEngine | null>(null);
  const [, setVersion] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [tool, setToolState] = useState<Tool>("select");
  const [editing, setEditing] = useState<{ item: paper.PointText; rect: { x: number; y: number; w: number; h: number; fontSize: number }; value: string } | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [newLinks, setNewLinks] = useState<Record<string, string>>({});
  const imageRef = useRef<HTMLInputElement>(null);
  const referenceFileRef = useRef<HTMLInputElement>(null);
  const [refSrc, setRefSrc] = useState(reference?.src ?? "");
  const [refError, setRefError] = useState("");
  const [onionOn, setOnionOn] = useState(true);
  const [trace, setTrace] = useState<{ preset: string; options: TraceOptions; skipWhite: boolean }>({ preset: "logo", options: TRACE_PRESETS[0].options, skipWhite: true });
  const [tracing, setTracing] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const engine = new DrawingEngine(canvas, svg, {
      onChange: () => setVersion((v) => v + 1),
      onEditText: (item, rect) => setEditing({ item, rect, value: item.content }),
      onZoom: setZoom
    });
    engine.fonts = { heading: fontCss(state.site.theme.headingFont), body: fontCss(state.site.theme.bodyFont) };
    engineRef.current = engine;
    const resize = () => {
      const r = stage.getBoundingClientRect();
      engine.resize(r.width, r.height);
    };
    resize();
    engine.fit();
    if (reference?.src) {
      void getAsset(reference.src)
        .then(async (asset) => {
          if (!asset || engineRef.current !== engine) return;
          await engine.setReference(URL.createObjectURL(asset.blob), reference.matrix);
          engine.setReferenceOpacity(reference.opacity);
          engine.setReferenceVisible(reference.visible);
          engine.markClean();
        })
        .catch(() => setRefError("The reference image couldn't be loaded."));
    }
    if (onion?.length) {
      void engine.setOnion(onion.map((o) => ({ url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(o.svg)}`, opacity: o.opacity })));
    }
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    const wheel = (e: WheelEvent) => engine.wheel(e);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      canvas.removeEventListener("wheel", wheel);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const engine = engineRef.current;

  function setTool(next: Tool) {
    engineRef.current?.setTool(next);
    setToolState(next);
  }

  function save(close: boolean) {
    const e = engineRef.current;
    if (!e) return;
    e.finishPen();
    const out = sanitizeSvg(e.exportSvg());
    const ref = e.referenceState;
    onSave(out, { ...links, ...newLinks }, refSrc && ref.has ? { src: refSrc, opacity: ref.opacity, visible: ref.visible, matrix: ref.matrix } : null);
    if (close) onClose();
  }

  function requestClose() {
    if (engineRef.current?.dirty) setConfirmClose(true);
    else onClose();
  }

  function themeLink(hex: string, token: string) {
    setNewLinks((all) => ({ ...all, [hex.toLowerCase()]: token }));
  }

  function commitText() {
    if (!editing) return;
    engineRef.current?.setTextContent(editing.item, editing.value);
    setEditing(null);
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      e.stopPropagation();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const handled = () => e.preventDefault();
      if (key === " " && !e.repeat) {
        eng.setSpace(true);
        return handled();
      }
      if (mod) {
        if (key === "z" && !e.shiftKey) eng.undo();
        else if ((key === "z" && e.shiftKey) || key === "y") eng.redo();
        else if (key === "s") save(false);
        else if (key === "c") eng.copy();
        else if (key === "x") eng.cut();
        else if (key === "v") eng.paste();
        else if (key === "d") eng.duplicate();
        else if (key === "a") eng.selectAll();
        else if (key === "g" && e.shiftKey) eng.ungroup();
        else if (key === "g") eng.group();
        else if (key === "[" || key === "{") eng.arrange(e.shiftKey ? "back" : "backward");
        else if (key === "]" || key === "}") eng.arrange(e.shiftKey ? "front" : "forward");
        else if (key === "0") eng.fit();
        else if (key === "1") eng.zoomTo(1);
        else if (key === "=" || key === "+") eng.zoomTo(eng.zoom * 1.25);
        else if (key === "-") eng.zoomTo(eng.zoom / 1.25);
        else return;
        return handled();
      }
      if (key === "delete" || key === "backspace") {
        eng.deleteSelection();
        return handled();
      }
      if (key === "enter") {
        eng.finishPen();
        return handled();
      }
      if (key === "escape" && eng.refAdjust) {
        eng.setReferenceAdjust(false);
        return handled();
      }
      if (key === "escape") {
        if (eng.tool === "pen") eng.finishPen();
        else eng.select([]);
        return handled();
      }
      if (key.startsWith("arrow")) {
        const step = e.shiftKey ? 10 : 1;
        eng.nudge(key === "arrowleft" ? -step : key === "arrowright" ? step : 0, key === "arrowup" ? -step : key === "arrowdown" ? step : 0);
        return handled();
      }
      if (TOOL_KEYS[key] && !e.altKey) {
        setTool(TOOL_KEYS[key]);
        return handled();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") engineRef.current?.setSpace(false);
      if (!(e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) e.stopPropagation();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  });

  const style = engine?.styleInfo();
  const text = engine?.textInfo();
  const tpath = engine?.textPathInfo();
  const geo = engine?.geometry();
  const rows = engine?.layerRows() ?? [];
  const hasSelection = Boolean(engine?.selection.length);
  const multi = (engine?.selection.length ?? 0) > 1;
  const setFill = (patch: Partial<Fill>, key = "fill") => style && engine!.setStyle({ fill: { ...style.fill, ...patch } }, key);

  return (
    <div className="vector-editor" role="dialog" aria-label="Drawing editor">
      <header className="ve-bar">
        <strong>Drawing</strong>
        <div className="ve-bar-group">
          <button className="btn btn--ghost" title="Undo (Ctrl+Z)" disabled={!engine?.canUndo} onClick={() => engine?.undo()}>
            ↶
          </button>
          <button className="btn btn--ghost" title="Redo (Ctrl+Y)" disabled={!engine?.canRedo} onClick={() => engine?.redo()}>
            ↷
          </button>
        </div>
        <div className="ve-bar-group">
          <button className="btn btn--ghost" title="Zoom out (Ctrl+-)" onClick={() => engine?.zoomTo(engine.zoom / 1.25)}>
            −
          </button>
          <button className="btn btn--ghost ve-zoom" title="Fit (Ctrl+0)" onClick={() => engine?.fit()}>
            {Math.round(zoom * 100)}%
          </button>
          <button className="btn btn--ghost" title="Zoom in (Ctrl+=)" onClick={() => engine?.zoomTo(engine.zoom * 1.25)}>
            +
          </button>
        </div>
        <label className="ve-check" title="Snap shapes and moves to an 8px grid">
          <input
            type="checkbox"
            checked={engine?.options.snap ?? false}
            onChange={(e) => {
              if (engine) engine.options.snap = e.target.checked;
              setVersion((v) => v + 1);
            }}
          />
          Snap to grid
        </label>
        <span className="ve-hint">{TOOL_HINTS[tool] ?? ""}</span>
        <div className="ve-bar-end">
          <button className="btn" onClick={requestClose}>
            Close
          </button>
          <button className="btn btn--primary" onClick={() => save(true)} title="Save to the drawing (Ctrl+S saves and keeps editing)">
            Save
          </button>
        </div>
      </header>

      <div className="ve-body">
        <nav className="ve-tools" aria-label="Tools">
          {TOOLS.map((t) => (
            <button key={t.tool} className={tool === t.tool ? "is-active" : undefined} aria-pressed={tool === t.tool} title={`${t.label} (${t.key})`} onClick={() => setTool(t.tool)}>
              {t.icon}
            </button>
          ))}
          <span className="ve-tools-sep" />
          <button title="Place an image" onClick={() => imageRef.current?.click()}>
            🖼
          </button>
          <input
            ref={imageRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => engine?.placeImage(String(reader.result));
              reader.readAsDataURL(file);
            }}
          />
          {(tool === "polygon" || tool === "star") && engine && (
            <div className="ve-tool-options">
              <NumberField
                label={tool === "polygon" ? "Sides" : "Points"}
                min={3}
                value={tool === "polygon" ? engine.options.sides : engine.options.points}
                onChange={(n) => {
                  if (tool === "polygon") engine.options.sides = Math.round(n);
                  else engine.options.points = Math.round(n);
                  setVersion((v) => v + 1);
                }}
              />
            </div>
          )}
        </nav>

        <div className="ve-stage" ref={stageRef}>
          <canvas ref={canvasRef} className="ve-canvas" data-tool={tool} />
          {editing && (
            <textarea
              className="ve-text-edit"
              autoFocus
              value={editing.value}
              style={{ left: editing.rect.x, top: editing.rect.y, minWidth: editing.rect.w + 40, fontSize: Math.max(12, editing.rect.fontSize) }}
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
              onBlur={commitText}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
                  e.preventDefault();
                  commitText();
                }
              }}
            />
          )}
        </div>

        <aside className="ve-panel">
          {engine && onion && onion.length > 0 && (
            <section className="ve-reference ve-onion">
              <h3>Onion skin</h3>
              <label className="ve-check" title="Faint copies of the neighbouring frames, to line up the motion (never saved)">
                <input type="checkbox" checked={onionOn} onChange={(e) => (setOnionOn(e.target.checked), engine.setOnionVisible(e.target.checked))} />
                {onion.length > 1 ? "Show the frames either side" : `Show ${onion[0].label}`}
              </label>
            </section>
          )}
          {engine && (
            <section className="ve-reference">
              <h3>Reference image</h3>
              <input
                ref={referenceFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setRefError("");
                  try {
                    const src = await putAsset(file);
                    await engine.setReference(URL.createObjectURL(file));
                    setRefSrc(src);
                  } catch (error) {
                    setRefError(error instanceof Error ? error.message : String(error));
                  }
                }}
              />
              {!engine.referenceState.has ? (
                <>
                  <p className="ve-note">Lay a photo, sketch or screenshot under the drawing to trace over it (by hand, or with Image Trace). It stays in the editor: it's never published.</p>
                  <button className="btn btn--small" onClick={() => referenceFileRef.current?.click()}>
                    Choose an image…
                  </button>
                </>
              ) : (
                <>
                  <div className="ve-row">
                    <label className="ve-check">
                      <input type="checkbox" checked={engine.referenceState.visible} onChange={(e) => engine.setReferenceVisible(e.target.checked)} />
                      Show
                    </label>
                    <label className="ve-check" title="Over the artwork, to check the fit">
                      <input type="checkbox" checked={engine.referenceState.onTop} onChange={(e) => engine.setReferenceOnTop(e.target.checked)} />
                      On top
                    </label>
                  </div>
                  <label className="ve-range">
                    <span>Opacity</span>
                    <input type="range" min={0.05} max={1} step={0.05} value={engine.referenceState.opacity} onChange={(e) => engine.setReferenceOpacity(Number(e.target.value))} />
                    <span>{Math.round(engine.referenceState.opacity * 100)}%</span>
                  </label>
                  <div className="ve-buttons">
                    <button className={engine.referenceState.adjust ? "is-active" : undefined} aria-pressed={engine.referenceState.adjust} title="Move, scale and rotate the reference with the select tool (Esc when done)" onClick={() => engine.setReferenceAdjust(!engine.referenceState.adjust)}>
                      {engine.referenceState.adjust ? "Done adjusting" : "Adjust position"}
                    </button>
                    <button onClick={() => engine.fitReference()}>Fit to artboard</button>
                    <button onClick={() => referenceFileRef.current?.click()}>Replace…</button>
                    <button
                      onClick={() => {
                        void engine.setReference(null);
                        setRefSrc("");
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <h4>Image Trace</h4>
                  <select
                    aria-label="Trace preset"
                    value={trace.preset}
                    onChange={(e) => {
                      const preset = TRACE_PRESETS.find((p) => p.id === e.target.value)!;
                      setTrace({ ...trace, preset: preset.id, options: preset.options });
                    }}
                  >
                    {TRACE_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <label className="ve-range">
                    <span>Colours</span>
                    <input type="range" min={2} max={32} step={1} value={trace.options.colors} onChange={(e) => setTrace({ ...trace, options: { ...trace.options, colors: Number(e.target.value) } })} />
                    <span>{trace.options.colors}</span>
                  </label>
                  <label className="ve-range">
                    <span>Ignore specks</span>
                    <input type="range" min={0} max={40} step={1} value={trace.options.omit} onChange={(e) => setTrace({ ...trace, options: { ...trace.options, omit: Number(e.target.value) } })} />
                    <span>{trace.options.omit}</span>
                  </label>
                  <label className="ve-range">
                    <span>Smoothing</span>
                    <input type="range" min={0} max={5} step={1} value={trace.options.blur} onChange={(e) => setTrace({ ...trace, options: { ...trace.options, blur: Number(e.target.value) } })} />
                    <span>{trace.options.blur}</span>
                  </label>
                  <div className="ve-row">
                    <label className="ve-check">
                      <input type="checkbox" checked={trace.options.corners} onChange={(e) => setTrace({ ...trace, options: { ...trace.options, corners: e.target.checked } })} />
                      Sharp corners
                    </label>
                    <label className="ve-check">
                      <input type="checkbox" checked={trace.skipWhite} onChange={(e) => setTrace({ ...trace, skipWhite: e.target.checked })} />
                      Leave out white
                    </label>
                  </div>
                  <button
                    className="btn btn--small btn--primary"
                    disabled={tracing === "busy"}
                    onClick={async () => {
                      setTracing("busy");
                      try {
                        const n = await engine.traceReference(trace.options, trace.skipWhite);
                        setTracing(n ? `Traced into ${n} shapes (grouped as “Traced”). Undo to try other settings.` : "Nothing to trace with these settings.");
                      } catch (error) {
                        setTracing(error instanceof Error ? error.message : String(error));
                      }
                    }}
                  >
                    {tracing === "busy" ? "Tracing…" : "Trace image"}
                  </button>
                  {tracing && tracing !== "busy" && <p className="ve-note">{tracing}</p>}
                </>
              )}
              {refError && <p className="ve-note ve-error">{refError}</p>}
            </section>
          )}
          {style && (
            <section>
              <h3>{hasSelection ? (multi ? `${engine!.selection.length} selected` : "Selection") : "New shapes"}</h3>
              <div className="ve-row ve-segmented">
                {(["none", "solid", "linear", "radial"] as const).map((kind) => (
                  <button key={kind} className={style.fill.kind === kind ? "is-active" : undefined} onClick={() => setFill({ kind })}>
                    {kind === "none" ? "No fill" : kind === "solid" ? "Colour" : kind === "linear" ? "Linear" : "Radial"}
                  </button>
                ))}
              </div>
              {style.fill.kind !== "none" && (
                <ColorControl label="Fill" value={style.fill.color} theme={theme} onChange={(color) => setFill({ color })} onTheme={(color, token) => (themeLink(color, token), setFill({ color }, "fill-theme"))} />
              )}
              {(style.fill.kind === "linear" || style.fill.kind === "radial") && (
                <>
                  <ColorControl label="Gradient end" value={style.fill.color2} theme={theme} onChange={(color2) => setFill({ color2 })} onTheme={(color2, token) => (themeLink(color2, token), setFill({ color2 }, "fill-theme"))} />
                  {style.fill.kind === "linear" && <NumberField label="Angle" value={style.fill.angle} onChange={(angle) => setFill({ angle })} />}
                </>
              )}
              <div className="ve-row">
                <label className="ve-check">
                  <input type="checkbox" checked={Boolean(style.stroke)} onChange={(e) => engine!.setStyle({ stroke: e.target.checked ? "#1d1b18" : null })} />
                  Outline
                </label>
                {style.stroke && <NumberField label="Width" min={0} step={0.5} value={style.strokeWidth} onChange={(strokeWidth) => engine!.setStyle({ strokeWidth })} />}
              </div>
              {style.stroke && (
                <>
                  <ColorControl label="Outline" value={style.stroke} theme={theme} onChange={(stroke) => engine!.setStyle({ stroke }, "stroke")} onTheme={(stroke, token) => (themeLink(stroke, token), engine!.setStyle({ stroke }))} />
                  <div className="ve-row">
                    <label className="ve-check">
                      <input type="checkbox" checked={style.dash} onChange={(e) => engine!.setStyle({ dash: e.target.checked })} />
                      Dashed
                    </label>
                    <select aria-label="Line ends" value={style.cap} onChange={(e) => engine!.setStyle({ cap: e.target.value as "butt" })}>
                      <option value="butt">Flat ends</option>
                      <option value="round">Round ends</option>
                      <option value="square">Square ends</option>
                    </select>
                    <select aria-label="Corners" value={style.join} onChange={(e) => engine!.setStyle({ join: e.target.value as "miter" })}>
                      <option value="miter">Sharp corners</option>
                      <option value="round">Round corners</option>
                      <option value="bevel">Bevelled corners</option>
                    </select>
                  </div>
                </>
              )}
              {hasSelection && (
                <label className="ve-range">
                  <span>Opacity</span>
                  <input type="range" min={0} max={1} step={0.05} value={style.opacity} onChange={(e) => engine!.setStyle({ opacity: Number(e.target.value) }, "opacity")} />
                  <span>{Math.round(style.opacity * 100)}%</span>
                </label>
              )}
            </section>
          )}

          {text && (
            <section>
              <h3>Text</h3>
              <textarea className="ve-textarea" rows={2} value={text.content} onChange={(e) => engine!.setText({ content: e.target.value })} />
              <div className="ve-row">
                <select aria-label="Font" value={text.fontFamily} onChange={(e) => engine!.setText({ fontFamily: e.target.value })}>
                  <option value={engine!.fonts.heading}>Heading font</option>
                  <option value={engine!.fonts.body}>Body font</option>
                  {![engine!.fonts.heading, engine!.fonts.body].includes(text.fontFamily) && <option value={text.fontFamily}>{text.fontFamily.slice(0, 24)}</option>}
                  <option value="Georgia, serif">Serif</option>
                  <option value="system-ui, sans-serif">Sans-serif</option>
                  <option value="ui-monospace, monospace">Monospace</option>
                </select>
                <NumberField label="Size" min={1} value={text.fontSize} onChange={(fontSize) => engine!.setText({ fontSize })} />
              </div>
              <div className="ve-row">
                <select aria-label="Weight" value={text.fontWeight} onChange={(e) => engine!.setText({ fontWeight: e.target.value })}>
                  {["300", "normal", "500", "600", "bold", "800"].map((w) => (
                    <option key={w} value={w}>
                      {w === "normal" ? "Regular" : w === "bold" ? "Bold" : w}
                    </option>
                  ))}
                </select>
                <div className="ve-segmented">
                  {(["left", "center", "right"] as const).map((j) => (
                    <button key={j} className={text.justification === j ? "is-active" : undefined} onClick={() => engine!.setText({ justification: j })}>
                      {j === "left" ? "⟸" : j === "center" ? "⟺" : "⟹"}
                    </button>
                  ))}
                </div>
              </div>
              <p className="ve-note">Name this text in Layers to make it an editable field on the page.</p>
            </section>
          )}

          {geo && (
            <section>
              <h3>Position and size</h3>
              <div className="ve-grid">
                <NumberField label="X" value={geo.x} onChange={(x) => engine!.setGeometry({ x })} />
                <NumberField label="Y" value={geo.y} onChange={(y) => engine!.setGeometry({ y })} />
                <NumberField label="W" min={0.1} value={geo.w} onChange={(w) => engine!.setGeometry({ w })} />
                <NumberField label="H" min={0.1} value={geo.h} onChange={(h) => engine!.setGeometry({ h })} />
                {!multi && <NumberField label="°" value={geo.rotation} onChange={(rotation) => engine!.setGeometry({ rotation })} />}
              </div>
              <div className="ve-buttons">
                <button title="Bring to front (Ctrl+Shift+])" onClick={() => engine!.arrange("front")}>⤒ Front</button>
                <button title="Forward (Ctrl+])" onClick={() => engine!.arrange("forward")}>↑</button>
                <button title="Backward (Ctrl+[)" onClick={() => engine!.arrange("backward")}>↓</button>
                <button title="Send to back (Ctrl+Shift+[)" onClick={() => engine!.arrange("back")}>⤓ Back</button>
              </div>
              <div className="ve-buttons">
                <button disabled={!multi} title="Group (Ctrl+G)" onClick={() => engine!.group()}>Group</button>
                <button title="Ungroup (Ctrl+Shift+G)" onClick={() => engine!.ungroup()}>Ungroup</button>
                <button title="Flip horizontally" onClick={() => engine!.flip("x")}>⇋</button>
                <button title="Flip vertically" onClick={() => engine!.flip("y")}>⇵</button>
                <button title="Duplicate (Ctrl+D)" onClick={() => engine!.duplicate()}>⧉</button>
                <button title="Delete (Del)" onClick={() => engine!.deleteSelection()}>🗑</button>
              </div>
              <h4>{multi ? "Align to each other" : "Align to the artboard"}</h4>
              <div className="ve-buttons">
                {(
                  [
                    ["left", "⇤", "Left"],
                    ["hcenter", "↔", "Centre"],
                    ["right", "⇥", "Right"],
                    ["top", "⤒", "Top"],
                    ["vcenter", "↕", "Middle"],
                    ["bottom", "⤓", "Bottom"]
                  ] as [AlignOp, string, string][]
                ).map(([op, icon, label]) => (
                  <button key={op} title={`Align ${label.toLowerCase()}`} onClick={() => engine!.align(op)}>
                    {icon}
                  </button>
                ))}
                <button disabled={(engine?.selection.length ?? 0) < 3} title="Distribute horizontally" onClick={() => engine!.distribute("x")}>
                  ⋯
                </button>
                <button disabled={(engine?.selection.length ?? 0) < 3} title="Distribute vertically" onClick={() => engine!.distribute("y")}>
                  ⋮
                </button>
              </div>
              <h4>Combine shapes</h4>
              <div className="ve-buttons">
                {(
                  [
                    ["unite", "Unite"],
                    ["subtract", "Subtract"],
                    ["intersect", "Intersect"],
                    ["exclude", "Exclude"]
                  ] as [BooleanOp, string][]
                ).map(([op, label]) => (
                  <button key={op} disabled={!multi} title={op === "subtract" ? "Cut the shapes on top out of the bottom one" : label} onClick={() => engine!.boolean(op)}>
                    {label}
                  </button>
                ))}
                <button title="Turn outlines into filled shapes" onClick={() => engine!.outlineStroke()}>
                  Outline → shape
                </button>
              </div>
              <h4>Masks and text</h4>
              <div className="ve-buttons">
                <button disabled={!multi} title="Show the shapes below only inside the top shape" onClick={() => engine!.clip()}>
                  Clip
                </button>
                <button disabled={!engine!.canUnclip} title="Release the clipping mask" onClick={() => engine!.unclip()}>
                  Release clip
                </button>
                <button disabled={!engine!.canTextOnPath} title="Select a text and a path, then lay the text along the path" onClick={() => engine!.textOnPath()}>
                  Text on path
                </button>
              </div>
            </section>
          )}

          {tpath && (
            <section>
              <h3>Text on path</h3>
              <textarea className="ve-textarea" rows={2} value={tpath.content} onChange={(e) => engine!.setTextPath({ content: e.target.value })} />
              <div className="ve-row">
                <select aria-label="Font" value={tpath.fontFamily} onChange={(e) => engine!.setTextPath({ fontFamily: e.target.value })}>
                  <option value={engine!.fonts.heading}>Heading font</option>
                  <option value={engine!.fonts.body}>Body font</option>
                  {![engine!.fonts.heading, engine!.fonts.body].includes(tpath.fontFamily) && <option value={tpath.fontFamily}>{tpath.fontFamily.slice(0, 24)}</option>}
                  <option value="Georgia, serif">Serif</option>
                  <option value="system-ui, sans-serif">Sans-serif</option>
                </select>
                <NumberField label="Size" min={1} value={tpath.fontSize} onChange={(fontSize) => engine!.setTextPath({ fontSize })} />
              </div>
              <div className="ve-row">
                <select aria-label="Weight" value={tpath.fontWeight} onChange={(e) => engine!.setTextPath({ fontWeight: e.target.value })}>
                  {["300", "normal", "500", "600", "bold", "800"].map((w) => (
                    <option key={w} value={w}>
                      {w === "normal" ? "Regular" : w === "bold" ? "Bold" : w}
                    </option>
                  ))}
                </select>
                <NumberField label="Spacing" step={0.5} value={tpath.spacing} onChange={(spacing) => engine!.setTextPath({ spacing })} />
              </div>
              <ColorControl label="Text colour" value={tpath.fill} theme={theme} onChange={(fill) => engine!.setTextPath({ fill })} onTheme={(fill, token) => (themeLink(fill, token), engine!.setTextPath({ fill }))} />
              <label className="ve-range">
                <span>Start</span>
                <input type="range" min={0} max={100} step={1} value={tpath.offset} onChange={(e) => engine!.setTextPath({ offset: Number(e.target.value) })} />
                <span>{tpath.offset}%</span>
              </label>
              <div className="ve-buttons">
                <button title="Put the text on the other side of the path" onClick={() => engine!.setTextPath({ flip: true })}>
                  Flip side
                </button>
              </div>
              <p className="ve-note">Edit the path's shape with the point tool (A). Name it in Layers to make the text a field on the page.</p>
            </section>
          )}

          <section className="ve-layers">
            <h3>Layers</h3>
            {rows.length === 0 && <p className="ve-note">Nothing drawn yet.</p>}
            <ul>
              {rows.map((row) => (
                <li
                  key={row.id}
                  className={row.selected ? "is-selected" : undefined}
                  style={{ paddingLeft: 6 + row.depth * 14 }}
                  onClick={(e) => engine!.selectById(row.id, e.shiftKey)}
                  onDoubleClick={() => setRenaming(row.id)}
                >
                  <button className="ve-layer-toggle" title={row.visible ? "Hide" : "Show"} onClick={(e) => (e.stopPropagation(), engine!.toggleVisible(row.id))}>
                    {row.visible ? "👁" : "–"}
                  </button>
                  {renaming === row.id ? (
                    <input
                      autoFocus
                      defaultValue={row.name}
                      aria-label="Layer name"
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => (engine!.rename(row.id, e.target.value), setRenaming(null))}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <span className={row.name ? "ve-layer-name" : "ve-layer-name is-unnamed"} title="Double-click to name it">
                      {row.label || row.kind}
                    </span>
                  )}
                  <button className="ve-layer-toggle" title={row.locked ? "Unlock" : "Lock"} onClick={(e) => (e.stopPropagation(), engine!.toggleLocked(row.id))}>
                    {row.locked ? "🔒" : "🔓"}
                  </button>
                  <button className="ve-layer-toggle" title="Move up" onClick={(e) => (e.stopPropagation(), engine!.moveLayer(row.id, 1))}>
                    ▲
                  </button>
                  <button className="ve-layer-toggle" title="Move down" onClick={(e) => (e.stopPropagation(), engine!.moveLayer(row.id, -1))}>
                    ▼
                  </button>
                </li>
              ))}
            </ul>
            <p className="ve-note">Named layers show up on the page: text becomes an editable field, and any named layer can be hidden per copy.</p>
          </section>

          {engine && (
            <section>
              <h3>Artboard</h3>
              <div className="ve-grid">
                <NumberField label="W" min={1} value={engine.box.w} onChange={(w) => engine.setSize(w, engine.box.h)} />
                <NumberField label="H" min={1} value={engine.box.h} onChange={(h) => engine.setSize(engine.box.w, h)} />
              </div>
            </section>
          )}
        </aside>
      </div>

      {confirmClose && (
        <div className="ve-confirm" role="alertdialog" aria-label="Unsaved changes">
          <p>Save the changes to this drawing?</p>
          <div>
            <button className="btn btn--primary" onClick={() => save(true)}>
              Save
            </button>
            <button className="btn" onClick={onClose}>
              Discard
            </button>
            <button className="btn btn--ghost" onClick={() => setConfirmClose(false)}>
              Keep editing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
