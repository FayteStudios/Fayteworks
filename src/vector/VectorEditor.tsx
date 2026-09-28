import { useEffect, useRef, useState, type ReactNode } from "react";
import type paper from "paper/dist/paper-core";
import { fontCss } from "../model/fonts";
import { resolveColor, THEME_TOKENS } from "../model/theme";
import { Icon, type IconName } from "../editor/icons";
import { useEditor } from "../state/store";
import { DrawingEngine, type AlignOp, type BlendMode, type BooleanOp, type Fill, type GradientStop, type PathOp, type PointType, type RefPoint, type SameKind, type ShapeKind, type Tool } from "./engine";
import { DEFAULT_GLOW, DEFAULT_INNER, DEFAULT_SHADOW, type Effects, type Shadow } from "./effects";
import { END_KINDS, type EndKind } from "./ends";
import { fontLoader } from "./outlines";
import { PATTERN_KINDS, type ExtraPaint, type PatternKind, type StrokeAlign } from "./paint";
import { EFFECT_DEFAULTS, WARP_STYLES, type EffectKind, type EffectParams, type WarpStyle } from "./pathEffects";
import { createZip } from "../export/zip";
import { WIDTH_PROFILES, type WidthProfile } from "./strokes";
import { downloadBlob } from "../export/output";
import { sanitizeSvg } from "./svg";
import { getAsset, putAsset } from "../state/assets";
import { TRACE_PRESETS, type TraceOptions } from "./trace";

export interface EditorReference {
  src: string;
  opacity: number;
  visible: boolean;
  matrix: number[] | null;
}

type ToolGroup = "select" | "draw" | "shapes" | "edit";

const TOOL_GROUPS: { id: ToolGroup; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "draw", label: "Draw" },
  { id: "shapes", label: "Shapes" },
  { id: "edit", label: "Edit" }
];

const TOOLS: { tool: Tool; icon: ReactNode; label: string; key: string; group: ToolGroup }[] = [
  { tool: "select", icon: "➤", label: "Select", key: "V", group: "select" },
  { tool: "direct", icon: "◇", label: "Edit points", key: "A", group: "select" },
  { tool: "pen", icon: "✒", label: "Pen", key: "P", group: "draw" },
  { tool: "curvature", icon: "∿", label: "Curvature pen", key: "Shift+P", group: "draw" },
  { tool: "pencil", icon: "✎", label: "Pencil", key: "N", group: "draw" },
  { tool: "scissors", icon: "✂", label: "Scissors", key: "C", group: "edit" },
  { tool: "knife", icon: "🔪", label: "Knife", key: "K", group: "edit" },
  { tool: "eraser", icon: "⌫", label: "Eraser", key: "Shift+E", group: "edit" },
  { tool: "rect", icon: "▭", label: "Rectangle", key: "M", group: "shapes" },
  { tool: "ellipse", icon: "◯", label: "Ellipse", key: "L", group: "shapes" },
  { tool: "polygon", icon: "⬡", label: "Polygon", key: "Y", group: "shapes" },
  { tool: "star", icon: "☆", label: "Star", key: "S", group: "shapes" },
  { tool: "shape", icon: "♥", label: "More shapes", key: "U", group: "shapes" },
  { tool: "line", icon: "╱", label: "Line", key: "\\", group: "shapes" },
  { tool: "arc", icon: "⌒", label: "Arc", key: "Shift+A", group: "shapes" },
  { tool: "spiral", icon: "@", label: "Spiral", key: "Shift+S", group: "shapes" },
  { tool: "text", icon: "T", label: "Text", key: "T", group: "draw" },
  { tool: "eyedropper", icon: "💧", label: "Eyedropper", key: "I", group: "select" },
  { tool: "gradient", icon: "◐", label: "Gradient", key: "G", group: "edit" },
  { tool: "blob", icon: "🖌", label: "Blob brush", key: "Shift+B", group: "draw" },
  { tool: "calligraphy", icon: "🖋", label: "Calligraphy pen", key: "Shift+C", group: "draw" },
  { tool: "distort", icon: "⌗", label: "Distort", key: "Shift+D", group: "edit" },
  { tool: "builder", icon: "⊕", label: "Shape builder", key: "Shift+M", group: "edit" },
  { tool: "width", icon: "⟠", label: "Width", key: "Shift+W", group: "edit" },
  { tool: "hand", icon: "✋", label: "Hand", key: "H, or hold Space", group: "select" }
];

const ADD_SHAPES: Tool[] = ["rect", "ellipse", "line", "polygon", "star", "shape"];

type LeftPanel = "layers" | "history" | "boards";

const LEFT_PANELS: { id: LeftPanel; label: string; icon: IconName }[] = [
  { id: "layers", label: "Layers", icon: "layers" },
  { id: "history", label: "History", icon: "history" },
  { id: "boards", label: "Artboards", icon: "artboard" }
];

type SideArea = "transform" | "paths" | "extras" | "board";

const SIDE_AREAS: { id: SideArea; label: string; title: string; icon: IconName }[] = [
  { id: "transform", label: "Transform", title: "Position, size, turning, arranging and groups", icon: "transform" },
  { id: "paths", label: "Paths", title: "Points, corners, path effects and combining shapes", icon: "path" },
  { id: "extras", label: "Extras", title: "Extra fills and outlines, effects, repeat, blend, symbols, recolour, masks", icon: "sparkle" },
  { id: "board", label: "Artboard", title: "Align and space things out, and the artboard size", icon: "artboard" }
];

function stored<T extends string>(key: string, fallback: T, allowed: readonly (T | null)[]): T | null {
  try {
    const v = localStorage.getItem(`fw-draw-${key}`);
    if (v === "none" && allowed.includes(null)) return null;
    if (v && allowed.includes(v as T)) return v as T;
  } catch {}
  return fallback;
}

function remember(key: string, value: string | null) {
  try {
    localStorage.setItem(`fw-draw-${key}`, value ?? "none");
  } catch {}
}

const TOOL_KEYS: Record<string, Tool> = { v: "select", a: "direct", p: "pen", n: "pencil", c: "scissors", m: "rect", r: "rect", l: "ellipse", e: "ellipse", y: "polygon", s: "star", u: "shape", "\\": "line", t: "text", i: "eyedropper", g: "gradient", k: "knife", h: "hand" };
const SHIFT_TOOL_KEYS: Record<string, Tool> = { a: "arc", s: "spiral", p: "curvature", e: "eraser", b: "blob", c: "calligraphy", d: "distort", m: "builder", w: "width" };

const TOOL_HINTS: Partial<Record<Tool, string>> = {
  select: "Click to select, Shift-click to add, drag the handles to scale, the circle to rotate. Alt-drag copies; hold Alt to measure. Click a selected shape again to line the others up to it. Double-click a group to work inside it.",
  direct: "Drag points and handles. Click the outline to pick the stretch between two points (drag it to bend, Delete to remove it); double-click it to add a point. Drag across points to select them; Alt-drag a point to pull out handles.",
  pen: "Click for sharp points, drag for curves (Alt drags one handle). Click the end of an open path to carry it on; click the first point to close. Enter or Esc to finish.",
  pencil: "Draw freehand; the line is smoothed when you let go.",
  scissors: "Click an outline to cut it there.",
  rect: "Drag to draw. Shift makes a square, Alt draws from the centre. Set the corner radius on the left, or change it later.",
  polygon: "Drag from the centre. Shift keeps it upright.",
  star: "Drag from the centre. Shift keeps it upright.",
  shape: "Pick a shape on the left, then drag. Shift keeps its proportions, Alt draws from the centre.",
  arc: "Drag from one end to the other. Shift makes it round, Alt bends it the other way.",
  spiral: "Drag from the centre outwards. Set the number of turns on the left.",
  text: "Click to place text, or click existing text to edit it.",
  eyedropper: "Click a shape to give its look to the selected shapes. With nothing selected, new shapes take its colours.",
  curvature: "Click points and the line curves smoothly through them. Alt-click for a sharp corner. Click the first point to close; Enter or Esc to finish.",
  knife: "Drag through shapes to slice them into pieces (Shift for a straight cut). Works on the selection, or on everything when nothing is selected.",
  eraser: "Drag over shapes to rub parts away. Set the size on the left. Works on the selection, or on everything when nothing is selected.",
  blob: "Paint with the fill colour. Strokes that touch the same colour merge into one shape. Set the size on the left.",
  calligraphy: "Draw with an angled nib: thick and thin follow the direction you move. Set the nib on the left.",
  width: "Drag out from a line to make it thicker or thinner at that spot. Drag the dots to change a width; Alt-click a dot to remove it.",
  builder: "Select overlapping shapes, then drag across the pieces to merge them into one. Alt-drag to delete pieces. Shift-click adds a shape to the selection.",
  distort: "Select shapes, then drag the four corners to bend them into any four-sided shape. Shift-drag a corner for perspective.",
  gradient: "Click a shape and drag to lay a gradient across it. Drag the ends and the colour dots; double-click the line to add a colour, Alt-click a dot to remove it."
};

const SHAPES: { kind: ShapeKind; icon: string; label: string }[] = [
  { kind: "triangle", icon: "▲", label: "Triangle" },
  { kind: "arrow", icon: "➔", label: "Arrow" },
  { kind: "bubble", icon: "💬", label: "Speech bubble" },
  { kind: "heart", icon: "♥", label: "Heart" },
  { kind: "cloud", icon: "☁", label: "Cloud" },
  { kind: "gear", icon: "⚙", label: "Gear" },
  { kind: "donut", icon: "◎", label: "Donut" },
  { kind: "pie", icon: "◔", label: "Pie slice" }
];

const REF_POINTS: RefPoint[] = ["tl", "t", "tr", "l", "c", "r", "bl", "b", "br"];

const BLEND_MODES: BlendMode[] = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];

const blendLabel = (m: BlendMode) => (m === "normal" ? "Normal blending" : m.replace("-", " ").replace(/^./, (c) => c.toUpperCase()));

function ShadowFields({ value, onChange, glow }: { value: Shadow | { blur: number; color: string; opacity: number }; onChange: (v: Shadow) => void; glow?: boolean }) {
  const v = { x: 0, y: 0, ...value } as Shadow;
  return (
    <div className="ve-fx-fields">
      {!glow && <NumberField label="X" value={v.x} onChange={(x) => onChange({ ...v, x })} />}
      {!glow && <NumberField label="Y" value={v.y} onChange={(y) => onChange({ ...v, y })} />}
      <NumberField label="Blur" min={0} value={v.blur} onChange={(blur) => onChange({ ...v, blur })} />
      <input type="color" aria-label="Colour" value={v.color} onChange={(e) => onChange({ ...v, color: e.target.value })} />
      <label className="ve-range">
        <input type="range" min={0} max={1} step={0.05} value={v.opacity} onChange={(e) => onChange({ ...v, opacity: Number(e.target.value) })} />
        <span>{Math.round(v.opacity * 100)}%</span>
      </label>
    </div>
  );
}

const POINT_TYPES: { type: PointType; label: string; title: string }[] = [
  { type: "sharp", label: "Sharp", title: "A corner with no handles" },
  { type: "smooth", label: "Smooth", title: "Handles in a straight line, each its own length" },
  { type: "symmetric", label: "Even", title: "Handles in a straight line and the same length" },
  { type: "auto", label: "Auto", title: "Handles worked out from the points either side" }
];

const PATH_OPS: { op: PathOp; label: string; title: string }[] = [
  { op: "reverse", label: "Reverse", title: "Run the path the other way (moves text on a path to the other side, and flips dashes)" },
  { op: "smooth", label: "Smooth", title: "Round off the corners of the path (or of the selected points)" },
  { op: "addPoints", label: "Add points", title: "Add a point halfway along every stretch" },
  { op: "reduce", label: "Remove extras", title: "Remove points that don't change the shape" },
  { op: "straighten", label: "Straighten", title: "Turn curves into straight lines (or just around the selected points)" }
];

function ColorControl({ label, value, onChange, onTheme, theme, used = [] }: { label: string; value: string; onChange: (v: string) => void; onTheme: (hex: string, token: string) => void; theme: Record<string, string>; used?: string[] }) {
  return (
    <div className="ve-color">
      <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="ve-hex">{value}</span>
      <div className="ve-theme-swatches" aria-label={`${label}: theme colours`}>
        {THEME_TOKENS.map((t) => (
          <button key={t.value} title={`Theme: ${t.label}`} style={{ background: theme[t.value] }} onClick={() => onTheme(theme[t.value], t.value)} />
        ))}
      </div>
      {used.length > 0 && (
        <div className="ve-used-swatches" aria-label={`${label}: colours in this drawing`}>
          {used.map((hex) => (
            <button key={hex} title={hex} className={hex === value ? "is-active" : undefined} style={{ background: hex }} onClick={() => onChange(hex)} />
          ))}
        </div>
      )}
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
  onClose,
  embedded = false
}: {
  embedded?: boolean;
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
  const rootRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(!embedded);
  useEffect(() => {
    if (!embedded) return;
    const outside = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) activeRef.current = false;
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [embedded]);
  const [move, setMove] = useState({ dx: 0, dy: 0, scale: 100, rotate: 0, each: false });
  const [gap, setGap] = useState("");
  const [png, setPng] = useState({ scale: 2, selection: false, white: false, busy: false, error: "" });
  const [cornerRadius, setCornerRadius] = useState(8);
  const [offsetBy, setOffsetBy] = useState({ distance: 6, join: "round" as "miter" | "round" | "bevel" });
  const [outlining, setOutlining] = useState<string | null>(null);
  const [effect, setEffect] = useState<{ kind: EffectKind; params: EffectParams }>({ kind: "roughen", params: EFFECT_DEFAULTS });
  const [layerOut, setLayerOut] = useState("");
  const [left, setLeft] = useState<LeftPanel | null>(() => (embedded ? null : stored<LeftPanel>("left", "layers", ["layers", "history", "boards", null])));
  const [side, setSide] = useState<SideArea>(() => stored<SideArea>("side", "transform", ["transform", "paths", "extras", "board"]) ?? "transform");
  const [toolsOpen, setToolsOpenState] = useState(() => !embedded && stored("tools", "open", ["open", "slim"]) === "open");
  const [toolTab, setToolTab] = useState<ToolGroup>("select");
  const [refOpen, setRefOpen] = useState(false);
  const [selOpen, setSelOpen] = useState(true);
  const setLeftPanel = (next: LeftPanel | null) => (setLeft(next), remember("left", next));
  const setSideArea = (next: SideArea) => (setSide(next), remember("side", next));
  const setToolsOpen = (open: boolean) => (setToolsOpenState(open), remember("tools", open ? "open" : "slim"));
  const [dragRow, setDragRow] = useState<{ id: number; over: number | null; where: "above" | "below" | "inside" } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const engine = new DrawingEngine(canvas, svg, {
      onChange: () => setVersion((v) => v + 1),
      onEditText: (item, rect) => setEditing({ item, rect, value: item.data?.wrap ? String(item.data.raw ?? item.content) : item.content }),
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
    const group = TOOLS.find((t) => t.tool === next)?.group;
    if (group) setToolTab(group);
  }

  function save(close: boolean) {
    const e = engineRef.current;
    if (!e) return;
    e.finishPen();
    const out = sanitizeSvg(e.exportSvg());
    const ref = e.referenceState;
    onSave(out, { ...links, ...newLinks }, refSrc && ref.has ? { src: refSrc, opacity: ref.opacity, visible: ref.visible, matrix: ref.matrix } : null);
    if (close) onClose();
    else e.markSaved();
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
      if (!eng || !activeRef.current) return;
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
      if (key === "alt") {
        eng.setAlt(true);
        return handled();
      }
      if (mod) {
        if (key === "z" && !e.shiftKey) eng.undo();
        else if (key === "z" && e.shiftKey) eng.redo();
        else if (key === "y") eng.setOutlineView(!eng.outlineView);
        else if (key === "s") save(false);
        else if (key === "c" && e.altKey) eng.copyStyle();
        else if (key === "v" && e.altKey) eng.pasteStyle();
        else if (key === "c") eng.copy();
        else if (key === "x") eng.cut();
        else if (key === "v") eng.paste();
        else if (key === "d") eng.repeat();
        else if (key === "j") eng.join();
        else if (e.code === "Digit8" && e.shiftKey) eng.breakApart();
        else if (e.code === "Digit8") eng.combine();
        else if (key === "a" && eng.tool === "direct") eng.selectAllPoints();
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
        else if (eng.selection.length || !eng.isolated) eng.select([]);
        else eng.leaveIsolation();
        return handled();
      }
      if (key.startsWith("arrow")) {
        const step = e.shiftKey ? 10 : 1;
        eng.nudge(key === "arrowleft" ? -step : key === "arrowright" ? step : 0, key === "arrowup" ? -step : key === "arrowdown" ? step : 0);
        return handled();
      }
      if (e.shiftKey && SHIFT_TOOL_KEYS[key] && !e.altKey) {
        setTool(SHIFT_TOOL_KEYS[key]);
        return handled();
      }
      if (TOOL_KEYS[key] && !e.altKey && !e.shiftKey) {
        setTool(TOOL_KEYS[key]);
        return handled();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") engineRef.current?.setSpace(false);
      if (e.key === "Alt") {
        engineRef.current?.setAlt(false);
        e.preventDefault();
      }
      if (!(e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) e.stopPropagation();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  });

  useEffect(() => {
    const close = (e: PointerEvent) => {
      for (const menu of Array.from(document.querySelectorAll<HTMLDetailsElement>(".ve-menu[open]"))) if (!menu.contains(e.target as Node)) menu.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const style = engine?.styleInfo();
  const text = engine?.textInfo();
  const tpath = engine?.textPathInfo();
  const geo = engine?.geometry();
  const rows = engine?.layerRows() ?? [];
  const pinfo = engine?.pathInfo();
  const corners = engine?.rectInfo();
  const used = engine?.documentColors() ?? [];
  const history = engine?.historyRows() ?? [];
  const hasSelection = Boolean(engine?.selection.length);
  const count = engine?.selection.length ?? 0;
  const multi = count > 1;
  const gapValue = gap.trim() === "" || !Number.isFinite(Number(gap)) ? null : Number(gap);
  const rerender = () => setVersion((v) => v + 1);
  const ends = engine?.endsInfo();
  const fx = engine?.effectsInfo();
  const star = engine?.shapeInfo();
  const profile = engine?.widthProfile();
  const extras = engine?.extrasInfo();
  const setExtra = (i: number, patch: Partial<ExtraPaint>) => extras && engine!.setExtras(extras.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const live = engine?.liveInfo();
  const runEffect = <K extends EffectKind>(kind: K, patch: Partial<EffectParams[K]>) => {
    const params = { ...effect.params, [kind]: { ...effect.params[kind], ...patch } } as EffectParams;
    setEffect({ kind, params });
    engine!.applyEffect(kind, params[kind]);
  };
  const saveFiles = async (what: "layers" | "boards", format: "svg" | "png") => {
    if (!engine) return;
    setLayerOut("busy");
    try {
      const files = what === "layers" ? await engine.exportLayers(format, png.scale) : await engine.exportBoards(format, png.scale);
      const zip = createZip(await Promise.all(files.map(async (f) => ({ path: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) }))));
      downloadBlob(zip, `drawing-${what}-${format}.zip`);
      setLayerOut("");
    } catch (error) {
      setLayerOut(error instanceof Error ? error.message : String(error));
    }
  };
  const setFx = (patch: Partial<Effects>) => {
    const next: Effects = { ...(fx ?? {}), ...patch };
    for (const k of Object.keys(next) as (keyof Effects)[]) if (next[k] === undefined || next[k] === 0) delete next[k];
    engine!.setEffects(next);
  };
  const stops: GradientStop[] = style && style.fill.kind !== "none" && style.fill.kind !== "solid" ? (style.fill.stops ?? [{ color: style.fill.color, offset: 0 }, { color: style.fill.color2, offset: 1 }]) : [];
  const setStops = (next: GradientStop[]) => {
    const sorted = [...next].sort((a, b) => a.offset - b.offset);
    setFill({ stops: sorted, color: sorted[0].color, color2: sorted[sorted.length - 1].color });
  };
  const toShapes = async () => {
    if (!engine) return;
    setOutlining("busy");
    try {
      const n = await engine.textToOutlines(fontLoader(state.site.fonts ?? []));
      setOutlining(n ? null : "There was no text to turn into shapes.");
    } catch (error) {
      setOutlining(error instanceof Error ? error.message : String(error));
    }
  };
  const setFill = (patch: Partial<Fill>, key = "fill") => style && engine!.setStyle({ fill: { ...style.fill, ...patch } }, key);
  const toolOptions = engine && (
    <>
      {tool === "rect" && engine && (
        <div className="ve-tool-options">
          <NumberField label="Radius" min={0} value={engine.options.radius} onChange={(n) => ((engine.options.radius = n), rerender())} />
        </div>
      )}
      {tool === "blob" && engine && (
        <div className="ve-tool-options">
          <NumberField label="Size" min={1} value={engine.options.blob} onChange={(n) => ((engine.options.blob = n), rerender())} />
        </div>
      )}
      {tool === "calligraphy" && engine && (
        <div className="ve-tool-options">
          <NumberField label="Nib" min={1} value={engine.options.nib} onChange={(n) => ((engine.options.nib = n), rerender())} />
          <NumberField label="Angle" value={engine.options.nibAngle} onChange={(n) => ((engine.options.nibAngle = n), rerender())} />
        </div>
      )}
      {tool === "eraser" && engine && (
        <div className="ve-tool-options">
          <NumberField label="Size" min={1} value={engine.options.eraser} onChange={(n) => ((engine.options.eraser = n), rerender())} />
        </div>
      )}
      {tool === "spiral" && engine && (
        <div className="ve-tool-options">
          <NumberField label="Turns" min={0.5} step={0.5} value={engine.options.turns} onChange={(n) => ((engine.options.turns = n), rerender())} />
        </div>
      )}
      {tool === "shape" && engine && (
        <div className="ve-tool-options ve-shape-picker" role="group" aria-label="Shape">
          {SHAPES.map((s) => (
            <button key={s.kind} title={s.label} className={engine.options.shape === s.kind ? "is-active" : undefined} aria-pressed={engine.options.shape === s.kind} onClick={() => ((engine.options.shape = s.kind), rerender())}>
              {s.icon}
            </button>
          ))}
        </div>
      )}
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
    </>
  );

  return (
    <div
      ref={rootRef}
      className={embedded ? "vector-editor vector-editor--embedded" : "vector-editor"}
      role={embedded ? "region" : "dialog"}
      aria-label="Drawing editor"
      onPointerDown={() => (activeRef.current = true)}
    >
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
        {engine && (
          <details className="ve-menu">
            <summary className="btn btn--ghost">Snap ▾</summary>
            <div className="ve-menu-panel">
              <label className="ve-check" title="Line up with other shapes' edges and centres, the artboard and guides">
                <input type="checkbox" checked={engine.options.smartGuides} onChange={(e) => engine.setSnapOptions({ smartGuides: e.target.checked })} />
                Smart guides
              </label>
              <label className="ve-check" title="Snap onto other shapes' points and outlines">
                <input type="checkbox" checked={engine.options.snapPoints} onChange={(e) => engine.setSnapOptions({ snapPoints: e.target.checked })} />
                Points and outlines
              </label>
              <label className="ve-check" title="Snap to the grid (its size is under Artboard)">
                <input type="checkbox" checked={engine.options.snap} onChange={(e) => engine.setSnapOptions({ snap: e.target.checked })} />
                Grid
              </label>
              <label className="ve-num" title="Shift keeps lines to these angles">
                <span>Shift angles</span>
                <select value={engine.options.angleStep} onChange={(e) => engine.setSnapOptions({ angleStep: Number(e.target.value) })}>
                  {[15, 30, 45, 90].map((a) => (
                    <option key={a} value={a}>
                      {a}°
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        )}
        {engine && (
          <details className="ve-menu">
            <summary className="btn btn--ghost">View ▾</summary>
            <div className="ve-menu-panel">
              <label className="ve-check">
                <input type="checkbox" checked={engine.options.showGrid} onChange={(e) => engine.setGrid({ showGrid: e.target.checked })} />
                Grid
              </label>
              <label className="ve-check" title="Drag from a ruler to make a guide; drag it back to remove it">
                <input type="checkbox" checked={engine.options.rulers} onChange={(e) => engine.setSnapOptions({ rulers: e.target.checked })} />
                Rulers and guides
              </label>
              <label className="ve-num" title="Draw one half and the other side follows">
                <span>Mirror drawing</span>
                <select value={engine.options.mirror} onChange={(e) => engine.setMirrorDrawing(e.target.value as "off")}>
                  <option value="off">Off</option>
                  <option value="v">Left and right</option>
                  <option value="h">Top and bottom</option>
                  <option value="both">All four ways</option>
                </select>
              </label>
              <label className="ve-check" title="See just the lines (Ctrl+Y)">
                <input type="checkbox" checked={engine.outlineView} onChange={(e) => engine.setOutlineView(e.target.checked)} />
                Outlines only
              </label>
              <button className="btn btn--small" disabled={!engine.guides.x.length && !engine.guides.y.length} onClick={() => engine.clearGuides()}>
                Clear guides
              </button>
            </div>
          </details>
        )}
        {engine && (
          <button className={refOpen ? "btn btn--ghost is-active" : "btn btn--ghost"} aria-pressed={refOpen} title="A photo or sketch under the drawing to trace over, and Image Trace" onClick={() => setRefOpen(!refOpen)}>
            Reference{engine.referenceState.has ? " •" : ""}
          </button>
        )}
        {engine?.isolated && (
          <button className="btn btn--small ve-isolation" title="Leave the group (Esc)" onClick={() => engine.leaveIsolation()}>
            Inside a group · Done
          </button>
        )}
        <span className="ve-hint">{TOOL_HINTS[tool] ?? ""}</span>
        <div className="ve-bar-end">
          <button className="btn" onClick={requestClose}>
            Close
          </button>
          <button className="btn" disabled={!engine?.dirty} onClick={() => save(false)} title="Save and keep drawing (Ctrl+S)">
            {engine?.dirty ? "Save" : "Saved"}
          </button>
          <button className="btn btn--primary" onClick={() => save(true)} title="Save to the drawing and close the editor">
            Save and close
          </button>
        </div>
      </header>

      <div className="ve-body">
        <nav className="ve-rail" aria-label="Drawing panels">
          {LEFT_PANELS.map((p) => (
            <button key={p.id} className={left === p.id ? "ve-rail-item is-active" : "ve-rail-item"} aria-pressed={left === p.id} onClick={() => setLeftPanel(left === p.id ? null : p.id)}>
              <Icon name={p.icon} size={20} />
              <span>{p.label}</span>
            </button>
          ))}
          <details className="ve-menu ve-add">
            <summary className="ve-rail-item" title="Add a picture, text, a shape or an artboard">
              <Icon name="add" size={20} />
              <span>Add</span>
            </summary>
            <div className="ve-menu-panel" onClick={(e) => (e.target as HTMLElement).closest("button") && ((e.currentTarget.parentElement as HTMLDetailsElement).open = false)}>
              <button onClick={() => imageRef.current?.click()}>🖼 Picture…</button>
              <button onClick={() => setTool("text")}>T Text</button>
              {ADD_SHAPES.map((t) => (
                <button key={t} onClick={() => setTool(t)}>
                  {TOOLS.find((x) => x.tool === t)!.icon} {TOOLS.find((x) => x.tool === t)!.label}
                </button>
              ))}
              <button onClick={() => (engine?.addBoard(), setLeftPanel("boards"))}>▢ Artboard</button>
              <button onClick={() => (setRefOpen(true), referenceFileRef.current?.click())}>◩ Reference image…</button>
            </div>
          </details>
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
          <input
            ref={referenceFileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file || !engine) return;
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
        </nav>

        {left && engine && (
          <aside className="ve-panel ve-drawer" aria-label={LEFT_PANELS.find((p) => p.id === left)!.label}>
            {left === "layers" && (
              <section className="ve-layers">
                <h3>Layers</h3>
                {rows.length === 0 && <p className="ve-note">Nothing drawn yet.</p>}
                <ul>
                  {rows.map((row) => (
                    <li
                      key={row.id}
                      className={[row.selected ? "is-selected" : "", dragRow?.over === row.id ? `is-drop-${dragRow.where}` : ""].filter(Boolean).join(" ") || undefined}
                      style={{ paddingLeft: 6 + row.depth * 14 }}
                      draggable={renaming !== row.id}
                      onClick={(e) => engine!.selectById(row.id, e.shiftKey)}
                      onDoubleClick={() => setRenaming(row.id)}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(row.id));
                        setDragRow({ id: row.id, over: null, where: "above" });
                      }}
                      onDragOver={(e) => {
                        if (!dragRow || dragRow.id === row.id) return;
                        e.preventDefault();
                        const r = e.currentTarget.getBoundingClientRect();
                        const y = (e.clientY - r.top) / r.height;
                        const where = row.isGroup && y > 0.3 && y < 0.7 ? "inside" : y < 0.5 ? "above" : "below";
                        if (dragRow.over !== row.id || dragRow.where !== where) setDragRow({ ...dragRow, over: row.id, where });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragRow && dragRow.id !== row.id) engine!.moveLayerTo(dragRow.id, row.id, dragRow.where);
                        setDragRow(null);
                      }}
                      onDragEnd={() => setDragRow(null)}
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
                <p className="ve-note">Named layers show up on the page: text becomes an editable field, and any named layer can be hidden per copy. Drag a layer to move it, or onto a group to put it inside.</p>
              </section>
            )}
            {left === "history" && (
              <section className="ve-history">
                <h3>History</h3>
                <p className="ve-note">Click a step to go back to it. Your next change clears the greyed-out steps.</p>
            <ol>
              {history.map((row, i) => (
                <li key={i}>
                  <button className={`is-${row.state}`} aria-current={row.state === "current" ? "step" : undefined} onClick={() => engine!.goToHistory(i)}>
                    {row.label}
                  </button>
                </li>
              ))}
            </ol>
              </section>
            )}
            {left === "boards" && (
              <>
              {engine && (
                <section>
                  <h3>Artboard</h3>
                  <div className="ve-grid">
                    <NumberField label="W" min={1} value={engine.box.w} onChange={(w) => engine.setSize(w, engine.box.h)} />
                    <NumberField label="H" min={1} value={engine.box.h} onChange={(h) => engine.setSize(engine.box.w, h)} />
                    <NumberField label="Grid" min={1} value={engine.options.grid} onChange={(grid) => engine.setGrid({ grid })} />
                  </div>
                  {engine.boards.length > 0 && <p className="ve-note">The main artboard is what shows on the page. The others are for extra versions, icon sets and stickers.</p>}
                  {engine.boards.map((b, i) => (
                    <div key={i} className="ve-extra">
                      <div className="ve-row">
                        <input className="ve-board-name" aria-label="Artboard name" defaultValue={b.name} key={b.name} onBlur={(e) => e.target.value.trim() && e.target.value !== b.name && engine.setBoard(i, { name: e.target.value.trim() })} />
                        <button className="ve-layer-toggle" title="Remove this artboard (the drawing on it stays)" onClick={() => engine.removeBoard(i)}>
                          ×
                        </button>
                      </div>
                      <div className="ve-grid">
                        <NumberField label="X" value={b.x} onChange={(x) => engine.setBoard(i, { x })} />
                        <NumberField label="Y" value={b.y} onChange={(y) => engine.setBoard(i, { y })} />
                        <NumberField label="W" min={1} value={b.w} onChange={(w) => engine.setBoard(i, { w })} />
                        <NumberField label="H" min={1} value={b.h} onChange={(h) => engine.setBoard(i, { h })} />
                      </div>
                    </div>
                  ))}
                  <div className="ve-buttons">
                    <button onClick={() => engine.addBoard()}>+ Artboard</button>
                    {engine.boards.length > 0 && <button onClick={() => engine.fitAll()}>Show all artboards</button>}
                  </div>
                </section>
              )}
              {engine && (
                <section>
                  <h3>Save a picture</h3>
                  <div className="ve-row ve-segmented">
                    {[1, 2, 3].map((n) => (
                      <button key={n} className={png.scale === n ? "is-active" : undefined} onClick={() => setPng({ ...png, scale: n })}>
                        {n}×
                      </button>
                    ))}
                  </div>
                  <div className="ve-row">
                    <label className="ve-check">
                      <input type="checkbox" disabled={!hasSelection} checked={png.selection && hasSelection} onChange={(e) => setPng({ ...png, selection: e.target.checked })} />
                      Selection only
                    </label>
                    <label className="ve-check">
                      <input type="checkbox" checked={png.white} onChange={(e) => setPng({ ...png, white: e.target.checked })} />
                      White background
                    </label>
                  </div>
                  <button
                    className="btn btn--small"
                    disabled={png.busy}
                    onClick={async () => {
                      setPng((p) => ({ ...p, busy: true, error: "" }));
                      try {
                        const blob = await engine.exportPng(png.scale, png.selection && hasSelection, png.white ? "#ffffff" : null);
                        downloadBlob(blob, png.scale === 1 ? "drawing.png" : `drawing@${png.scale}x.png`);
                        setPng((p) => ({ ...p, busy: false }));
                      } catch (error) {
                        setPng((p) => ({ ...p, busy: false, error: error instanceof Error ? error.message : String(error) }));
                      }
                    }}
                  >
                    {png.busy ? "Saving…" : "Save as PNG"}
                  </button>
                  {png.error && <p className="ve-note ve-error">{png.error}</p>}
                  {engine.boards.length > 0 && (
                    <>
                      <h4>Each artboard as its own file</h4>
                      <div className="ve-buttons">
                        <button disabled={layerOut === "busy"} onClick={() => saveFiles("boards", "svg")}>
                          SVG files
                        </button>
                        <button disabled={layerOut === "busy"} onClick={() => saveFiles("boards", "png")}>
                          PNG files
                        </button>
                      </div>
                    </>
                  )}
                  <h4>Each layer as its own file</h4>
                  <div className="ve-buttons">
                    <button disabled={layerOut === "busy"} onClick={() => saveFiles("layers", "svg")}>
                      SVG files
                    </button>
                    <button disabled={layerOut === "busy"} onClick={() => saveFiles("layers", "png")}>
                      PNG files
                    </button>
                  </div>
                  {layerOut && layerOut !== "busy" && <p className="ve-note ve-error">{layerOut}</p>}
                </section>
              )}
              </>
            )}
          </aside>
        )}

        <nav className={toolsOpen ? "ve-tools" : "ve-tools is-slim"} aria-label="Tools">
          <div className="ve-tools-head">
            {toolsOpen && (
              <div className="ve-tool-tabs" role="tablist" aria-label="Tool groups">
                {TOOL_GROUPS.map((g) => (
                  <button key={g.id} role="tab" aria-selected={toolTab === g.id} className={toolTab === g.id ? "is-active" : undefined} onClick={() => setToolTab(g.id)}>
                    {g.label}
                  </button>
                ))}
              </div>
            )}
            <button className="ve-tools-toggle" title={toolsOpen ? "Slim the tools down to icons" : "Show the tools in groups, with names"} aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}>
              {toolsOpen ? "«" : "»"}
            </button>
          </div>
          <div className="ve-tool-grid">
            {(toolsOpen ? TOOLS.filter((t) => t.group === toolTab) : TOOLS).map((t) => (
              <button key={t.tool} className={tool === t.tool ? "ve-tool is-active" : "ve-tool"} aria-pressed={tool === t.tool} title={`${t.label} (${t.key})`} onClick={() => setTool(t.tool)}>
                <span className="ve-tool-icon">{t.icon}</span>
                {toolsOpen && <span className="ve-tool-label">{t.label}</span>}
              </button>
            ))}
          </div>
          {toolsOpen && toolOptions}
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
          {!toolsOpen && toolOptions}
          {refOpen && engine && (
            <div className="ve-float" role="dialog" aria-label="Reference">
              <div className="ve-float-head">
                <strong>Reference</strong>
                <button className="ve-layer-toggle" title="Close" onClick={() => setRefOpen(false)}>
                  ×
                </button>
              </div>
            {onion && onion.length > 0 && (
              <section className="ve-reference ve-onion">
                <h3>Onion skin</h3>
                <label className="ve-check" title="Faint copies of the neighbouring frames, to line up the motion (never saved)">
                  <input type="checkbox" checked={onionOn} onChange={(e) => (setOnionOn(e.target.checked), engine.setOnionVisible(e.target.checked))} />
                  {onion.length > 1 ? "Show the frames either side" : `Show ${onion[0].label}`}
                </label>
              </section>
            )}
              <section className="ve-reference">
                <h3>Reference image</h3>
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
            </div>
          )}
        </div>

        <aside className="ve-panel ve-panel--right">
          <div className="ve-panel-main">
            <div className={selOpen ? "ve-selection" : "ve-selection is-closed"}>
              <button className="ve-pane-head" aria-expanded={selOpen} onClick={() => setSelOpen(!selOpen)}>
                <span>{hasSelection ? (multi ? `${count} selected` : "Selection") : "New shapes"}</span>
                <span aria-hidden>{selOpen ? "▾" : "▸"}</span>
              </button>
              {selOpen && (
                <div className="ve-selection-body">
              {style && (
                <section>
                      <div className="ve-row ve-segmented">
                    {(["none", "solid", "linear", "radial", ...(hasSelection ? (["pattern"] as const) : [])] as const).map((kind) => (
                      <button key={kind} className={style.fill.kind === kind ? "is-active" : undefined} onClick={() => setFill({ kind })}>
                        {kind === "none" ? "No fill" : kind === "solid" ? "Colour" : kind === "linear" ? "Linear" : kind === "radial" ? "Radial" : "Pattern"}
                      </button>
                    ))}
                  </div>
                  {style.fill.kind !== "none" && (
                    <ColorControl label="Fill" value={style.fill.color} theme={theme} used={used} onChange={(color) => setFill({ color })} onTheme={(color, token) => (themeLink(color, token), setFill({ color }, "fill-theme"))} />
                  )}
                  {(style.fill.kind === "linear" || style.fill.kind === "radial") && (
                    <>
                      <ColorControl label="Gradient end" value={style.fill.color2} theme={theme} used={used} onChange={(color2) => setFill({ color2 })} onTheme={(color2, token) => (themeLink(color2, token), setFill({ color2 }, "fill-theme"))} />
                      {style.fill.kind === "linear" && <NumberField label="Angle" value={style.fill.angle} onChange={(angle) => setFill({ angle })} />}
                      <div className="ve-stops" style={{ background: `linear-gradient(90deg, ${[...stops].sort((a, b) => a.offset - b.offset).map((st) => `${st.color} ${Math.round(st.offset * 100)}%`).join(", ")})` }} />
                      {stops.map((st, i) => (
                        <div key={i} className="ve-row ve-stop">
                          <input type="color" aria-label={`Colour ${i + 1}`} value={st.color} onChange={(e) => setStops(stops.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} />
                          <NumberField label="%" min={0} value={Math.round(st.offset * 100)} onChange={(n) => setStops(stops.map((x, j) => (j === i ? { ...x, offset: Math.max(0, Math.min(100, n)) / 100 } : x)))} />
                          <button className="ve-layer-toggle" disabled={stops.length <= 2} title="Remove this colour" onClick={() => setStops(stops.filter((_, j) => j !== i))}>
                            ×
                          </button>
                        </div>
                      ))}
                      <div className="ve-buttons">
                        <button
                          onClick={() => {
                            const sorted = [...stops].sort((a, b) => a.offset - b.offset);
                            let at = 0;
                            let gap = -1;
                            for (let i = 0; i < sorted.length - 1; i++) if (sorted[i + 1].offset - sorted[i].offset > gap) (gap = sorted[i + 1].offset - sorted[i].offset), (at = i);
                            setStops([...sorted, { color: sorted[at].color, offset: (sorted[at].offset + sorted[at + 1].offset) / 2 }]);
                          }}
                        >
                          + Add a colour
                        </button>
                        <button title="Edit the gradient on the drawing (G)" onClick={() => setTool("gradient")}>
                          Edit on the drawing
                        </button>
                      </div>
                    </>
                  )}
                  {style.fill.kind === "pattern" && (
                    <>
                      <div className="ve-row ve-segmented">
                        {PATTERN_KINDS.map((k) => (
                          <button key={k.value} className={style.fill.pattern?.kind === k.value ? "is-active" : undefined} disabled={k.value === "tile" && !engine!.tile && style.fill.pattern?.kind !== "tile"} title={k.value === "tile" ? "Select shapes and press Use as tile first" : undefined} onClick={() => setFill({ pattern: { ...(style.fill.pattern ?? { size: 12, angle: 45 }), kind: k.value as PatternKind, ...(k.value === "tile" && engine!.tile ? engine!.tile : {}) } })}>
                            {k.label}
                          </button>
                        ))}
                      </div>
                      <ColorControl label="Background" value={style.fill.color2} theme={theme} used={used} onChange={(color2) => setFill({ color2 })} onTheme={(color2, token) => (themeLink(color2, token), setFill({ color2 }, "fill-theme"))} />
                      <div className="ve-grid">
                        <NumberField label="Size" min={1} value={style.fill.pattern?.size ?? 12} onChange={(size) => setFill({ pattern: { ...(style.fill.pattern ?? { kind: "stripes", angle: 45 }), size } })} />
                        <NumberField label="Angle" value={style.fill.pattern?.angle ?? 0} onChange={(angle) => setFill({ pattern: { ...(style.fill.pattern ?? { kind: "stripes", size: 12 }), angle } })} />
                      </div>
                    </>
                  )}
                  {hasSelection && (
                    <div className="ve-buttons">
                      <button title="Use the selected shapes as a tile for pattern fills" onClick={() => engine!.captureTile()}>
                        Use as pattern tile
                      </button>
                    </div>
                  )}
                  {hasSelection && style.fill.kind !== "none" && (
                    <select aria-label="Where shapes overlap" value={style.fillRule} onChange={(e) => engine!.setStyle({ fillRule: e.target.value as "nonzero" })}>
                      <option value="nonzero">Overlaps stay filled</option>
                      <option value="evenodd">Overlaps make holes</option>
                    </select>
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
                      {profile && (
                        <select aria-label="Width along the line" value={profile} onChange={(e) => engine!.setWidthProfile(e.target.value as WidthProfile)}>
                          {WIDTH_PROFILES.map((w) => (
                            <option key={w.value} value={w.value}>
                              {w.label}
                            </option>
                          ))}
                          {profile === "custom" && <option value="custom">Your own widths (Shift+W)</option>}
                        </select>
                      )}
                      {hasSelection && (
                        <select aria-label="Outline position" value={style.strokeAlign} onChange={(e) => engine!.setStrokeAlign(e.target.value as StrokeAlign)}>
                          <option value="center">Outline on the edge</option>
                          <option value="inside">Outline inside</option>
                          <option value="outside">Outline outside</option>
                        </select>
                      )}
                      <ColorControl label="Outline" value={style.stroke} theme={theme} used={used} onChange={(stroke) => engine!.setStyle({ stroke }, "stroke")} onTheme={(stroke, token) => (themeLink(stroke, token), engine!.setStyle({ stroke }))} />
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
                      {style.dash && (
                        <div className="ve-grid">
                          <NumberField label="Dash" min={0} step={0.5} value={style.dashArray[0] ?? 0} onChange={(d) => engine!.setStyle({ dashArray: [d, style.dashArray[1] ?? d] }, "dash")} />
                          <NumberField label="Gap" min={0} step={0.5} value={style.dashArray[1] ?? style.dashArray[0] ?? 0} onChange={(g) => engine!.setStyle({ dashArray: [style.dashArray[0] ?? g, g] }, "dash")} />
                          <NumberField label="Shift" step={0.5} value={style.dashOffset} onChange={(dashOffset) => engine!.setStyle({ dashOffset }, "dash")} />
                          <div className="ve-buttons">
                            <button title="Round dots" onClick={() => engine!.setStyle({ dashArray: [0, Math.max(2, style.strokeWidth * 2)], cap: "round" })}>
                              Dots
                            </button>
                          </div>
                        </div>
                      )}
                      {style.join === "miter" && <NumberField label="Miter limit" min={1} step={0.5} value={style.miterLimit} onChange={(miterLimit) => engine!.setStyle({ miterLimit }, "miter")} />}
                    </>
                  )}
                  {ends && (
                    <div className="ve-grid ve-ends">
                      <select aria-label="Start of the line" value={ends.start} onChange={(e) => engine!.setEnds({ start: e.target.value as EndKind })}>
                        {END_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            Start: {k.label}
                          </option>
                        ))}
                      </select>
                      <select aria-label="End of the line" value={ends.end} onChange={(e) => engine!.setEnds({ end: e.target.value as EndKind })}>
                        {END_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>
                            End: {k.label}
                          </option>
                        ))}
                      </select>
                      {(ends.start !== "none" || ends.end !== "none") && <NumberField label="Size %" min={10} value={Math.round(ends.size * 100)} onChange={(n) => engine!.setEnds({ size: n / 100 })} />}
                    </div>
                  )}
                  {hasSelection && (
                    <label className="ve-range">
                      <span>Opacity</span>
                      <input type="range" min={0} max={1} step={0.05} value={style.opacity} onChange={(e) => engine!.setStyle({ opacity: Number(e.target.value) }, "opacity")} />
                      <span>{Math.round(style.opacity * 100)}%</span>
                    </label>
                  )}
                  {hasSelection && (
                    <select aria-label="Blending" value={style.blendMode} onChange={(e) => engine!.setStyle({ blendMode: e.target.value as BlendMode })}>
                      {BLEND_MODES.map((m) => (
                        <option key={m} value={m}>
                          {blendLabel(m)}
                        </option>
                      ))}
                    </select>
                  )}
                  {hasSelection && (
                    <div className="ve-buttons">
                      <button title="Copy style (Ctrl+Alt+C)" onClick={() => engine!.copyStyle()}>
                        Copy style
                      </button>
                      <button disabled={!engine!.canPasteStyle} title="Paste style (Ctrl+Alt+V)" onClick={() => engine!.pasteStyle()}>
                        Paste style
                      </button>
                      <select aria-label="Select same" value="" onChange={(e) => e.target.value && engine!.selectSame(e.target.value as SameKind)}>
                        <option value="">Select same…</option>
                        <option value="fill">Same fill</option>
                        <option value="stroke">Same outline colour</option>
                        <option value="width">Same outline width</option>
                        <option value="kind">Same kind</option>
                      </select>
                    </div>
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
                  <div className="ve-row">
                    <NumberField label="Line height" min={0.5} step={0.1} value={text.lineHeight} onChange={(lineHeight) => engine!.setText({ lineHeight })} />
                    <NumberField label="Wrap at" min={0} value={text.wrap} onChange={(w) => engine!.setWrap(w)} />
                    <NumberField label="Spacing" step={0.5} value={text.spacing} onChange={(spacing) => engine!.setText({ spacing })} />
                  </div>
                  <p className="ve-note">Name this text in Layers to make it an editable field on the page.</p>
                  <div className="ve-buttons">
                    <button disabled={outlining === "busy"} title="Turn the letters into shapes you can edit point by point (the text stops being editable)" onClick={toShapes}>
                      {outlining === "busy" ? "Turning into shapes…" : "Text to shapes"}
                    </button>
                  </div>
                  {outlining && outlining !== "busy" && <p className="ve-note ve-error">{outlining}</p>}
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
                  <ColorControl label="Text colour" value={tpath.fill} theme={theme} used={used} onChange={(fill) => engine!.setTextPath({ fill })} onTheme={(fill, token) => (themeLink(fill, token), engine!.setTextPath({ fill }))} />
                  <label className="ve-range">
                    <span>Start</span>
                    <input type="range" min={0} max={100} step={1} value={tpath.offset} onChange={(e) => engine!.setTextPath({ offset: Number(e.target.value) })} />
                    <span>{tpath.offset}%</span>
                  </label>
                  <div className="ve-buttons">
                    <button title="Put the text on the other side of the path" onClick={() => engine!.setTextPath({ flip: true })}>
                      Flip side
                    </button>
                    <button disabled={outlining === "busy"} title="Turn the letters into shapes" onClick={toShapes}>
                      Text to shapes
                    </button>
                  </div>
                  <p className="ve-note">Edit the path's shape with the point tool (A). Name it in Layers to make the text a field on the page.</p>
                </section>
              )}
                </div>
              )}
            </div>
            <div className="ve-side-body">
              <h2 className="ve-side-title">{SIDE_AREAS.find((a) => a.id === side)!.label}</h2>
              {side === "transform" && geo && (
                <section>
                    <h3>Position and size</h3>
                    <div className="ve-geo">
                      <div className="ve-refgrid" role="group" aria-label="Reference point for X, Y, sizes and turns">
                        {REF_POINTS.map((r) => (
                          <button key={r} title="Measure and turn from this point" className={engine!.options.ref === r ? "is-active" : undefined} aria-pressed={engine!.options.ref === r} onClick={() => ((engine!.options.ref = r), rerender())} />
                        ))}
                      </div>
                      <div className="ve-grid">
                        <NumberField label="X" value={geo.x} onChange={(x) => engine!.setGeometry({ x })} />
                        <NumberField label="Y" value={geo.y} onChange={(y) => engine!.setGeometry({ y })} />
                        <NumberField label="W" min={0.1} value={geo.w} onChange={(w) => engine!.setGeometry({ w })} />
                        <NumberField label="H" min={0.1} value={geo.h} onChange={(h) => engine!.setGeometry({ h })} />
                        {!multi && <NumberField label="°" value={geo.rotation} onChange={(rotation) => engine!.setGeometry({ rotation })} />}
                      </div>
                    </div>
                    <details className="ve-details">
                      <summary>Transform by numbers</summary>
                      <div className="ve-grid">
                        <NumberField label="Move X" value={move.dx} onChange={(dx) => setMove({ ...move, dx })} />
                        <NumberField label="Move Y" value={move.dy} onChange={(dy) => setMove({ ...move, dy })} />
                        <NumberField label="Scale %" min={1} value={move.scale} onChange={(scale) => setMove({ ...move, scale })} />
                        <NumberField label="Turn °" value={move.rotate} onChange={(rotate) => setMove({ ...move, rotate })} />
                      </div>
                      <label className="ve-check">
                        <input type="checkbox" checked={move.each} onChange={(e) => setMove({ ...move, each: e.target.checked })} />
                        Each shape on its own
                      </label>
                      <div className="ve-buttons">
                        <button onClick={() => engine!.transformBy({ dx: move.dx, dy: move.dy, scaleX: move.scale, scaleY: move.scale, rotate: move.rotate, each: move.each })}>Apply</button>
                        <button onClick={() => engine!.transformBy({ dx: move.dx, dy: move.dy, scaleX: move.scale, scaleY: move.scale, rotate: move.rotate, each: move.each }, true)}>Apply to a copy</button>
                        <button disabled={!engine!.canRepeat} title="Repeat the last move, turn, resize or copy (Ctrl+D)" onClick={() => engine!.repeat()}>
                          Do it again
                        </button>
                      </div>
                      <p className="ve-note">Sizes and turns work from the reference point picked above.</p>
                    </details>
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
                      <button title="Duplicate (Ctrl+D repeats the last move or copy)" onClick={() => engine!.duplicate()}>⧉</button>
                      <button title="Delete (Del)" onClick={() => engine!.deleteSelection()}>🗑</button>
                    </div>
                </section>
              )}
              {side === "transform" && !geo && <p className="ve-note ve-side-empty">Select something to move, size, turn, flip or group it.</p>}

                {side === "paths" && pinfo && (
                  <section>
                    <h3>
                      Path · {pinfo.points} {pinfo.points === 1 ? "point" : "points"}
                    </h3>
                    {tool === "direct" && pinfo.nodes > 0 && (
                      <>
                        <h4>{pinfo.nodes === 1 ? "1 point selected" : `${pinfo.nodes} points selected`}</h4>
                        <div className="ve-row ve-segmented">
                          {POINT_TYPES.map((t) => (
                            <button key={t.type} title={t.title} className={pinfo.pointType === t.type ? "is-active" : undefined} onClick={() => engine!.setPointType(t.type)}>
                              {t.label}
                            </button>
                          ))}
                        </div>
                        <div className="ve-buttons">
                          <button disabled={pinfo.nodes < 2} title="Line the points up in a row, side to side" onClick={() => engine!.lineUpPoints("y")}>
                            ⇹ Row
                          </button>
                          <button disabled={pinfo.nodes < 2} title="Line the points up in a column" onClick={() => engine!.lineUpPoints("x")}>
                            ⇳ Column
                          </button>
                          <button disabled={pinfo.nodes < 2} title="Bring the points together at their middle" onClick={() => engine!.lineUpPoints("both")}>
                            • Together
                          </button>
                          <button disabled={!pinfo.canBreak} title="Split the path at the selected points" onClick={() => engine!.breakAtPoints()}>
                            Break here
                          </button>
                        </div>
                      </>
                    )}
                    {pinfo.curve && (
                      <div className="ve-buttons">
                        <button title="Remove the highlighted stretch (Delete)" onClick={() => engine!.deleteCurve()}>
                          Delete this stretch
                        </button>
                      </div>
                    )}
                    <div className="ve-buttons">
                      <button disabled={!pinfo.canJoin} title="Join two open ends, or close an open path (Ctrl+J). With the point tool, select the two end points to join." onClick={() => engine!.join()}>
                        Join / close
                      </button>
                      <button disabled={!pinfo.closed} title="Open a closed path where it starts, without changing how it looks" onClick={() => engine!.openPath()}>
                        Open
                      </button>
                      {PATH_OPS.map((o) => (
                        <button key={o.op} title={o.title} onClick={() => engine!.pathOp(o.op)}>
                          {o.label}
                        </button>
                      ))}
                      <button disabled={!pinfo.compound} title="Split a combined shape into separate shapes (Ctrl+Shift+8)" onClick={() => engine!.breakApart()}>
                        Break apart
                      </button>
                      <button disabled={!multi} title="Combine shapes into one, where overlaps become holes (Ctrl+8)" onClick={() => engine!.combine()}>
                        Combine
                      </button>
                      <button disabled={!multi} title="Split overlapping shapes into every separate piece" onClick={() => engine!.divide()}>
                        Divide
                      </button>
                      <button disabled={!multi} title="Use the top path to cut the outlines of the ones below into open pieces" onClick={() => engine!.cutPath()}>
                        Cut path
                      </button>
                    </div>
                    <div className="ve-row">
                      <NumberField label="Round corners" min={0} value={cornerRadius} onChange={setCornerRadius} />
                      <div className="ve-buttons">
                        <button title={tool === "direct" && pinfo.nodes ? "Round the selected sharp points" : "Round every sharp corner"} onClick={() => engine!.roundCorners(cornerRadius)}>
                          Round
                        </button>
                      </div>
                    </div>
                    <div className="ve-row">
                      <NumberField label="Offset" value={offsetBy.distance} onChange={(distance) => setOffsetBy({ ...offsetBy, distance })} />
                      <select aria-label="Offset corners" value={offsetBy.join} onChange={(e) => setOffsetBy({ ...offsetBy, join: e.target.value as "round" })}>
                        <option value="round">Round</option>
                        <option value="miter">Sharp</option>
                        <option value="bevel">Bevelled</option>
                      </select>
                      <div className="ve-buttons">
                        <button title="Make a copy that's bigger (or smaller, with a minus number) all the way round" onClick={() => engine!.offsetCopy(offsetBy.distance, offsetBy.join)}>
                          Make copy
                        </button>
                      </div>
                    </div>
                    <label className="ve-range" title="Thin out points; 0 puts them all back">
                      <span>Simplify</span>
                      <input type="range" min={0} max={20} step={0.5} value={engine!.simplifyAmount} onChange={(e) => engine!.simplify(Number(e.target.value))} />
                      <span>{engine!.simplifyAmount}</span>
                    </label>
                  </section>
                )}

                {side === "paths" && star && (
                  <section>
                    <h3>{star.kind === "star" ? "Star" : "Polygon"}</h3>
                    <div className="ve-grid">
                      <NumberField label={star.kind === "star" ? "Points" : "Sides"} min={3} value={star.count} onChange={(count) => engine!.setShape({ count })} />
                    </div>
                    {star.kind === "star" && (
                      <label className="ve-range">
                        <span>Inner</span>
                        <input type="range" min={5} max={100} step={1} value={star.inner} onChange={(e) => engine!.setShape({ inner: Number(e.target.value) })} />
                        <span>{star.inner}%</span>
                      </label>
                    )}
                  </section>
                )}

                {side === "paths" && corners && (
                  <section>
                    <h3>Corners</h3>
                    <div className="ve-grid">
                      <NumberField label="Radius" min={0} value={Math.max(...corners.radii)} onChange={(r) => engine!.setRadius([r, r, r, r])} />
                    </div>
                    <details className="ve-details">
                      <summary>Each corner</summary>
                      <div className="ve-grid">
                        {["↖", "↗", "↘", "↙"].map((label, i) => (
                          <NumberField key={label} label={label} min={0} value={corners.radii[i]} onChange={(r) => engine!.setRadius(corners.radii.map((v, j) => (j === i ? r : v)))} />
                        ))}
                      </div>
                    </details>
                  </section>
                )}

                {side === "paths" && pinfo && (
                  <section>
                    <h3>Path effects</h3>
                    <select aria-label="Effect" value={effect.kind} onChange={(e) => setEffect({ ...effect, kind: e.target.value as EffectKind })}>
                      <option value="roughen">Roughen</option>
                      <option value="zigzag">Zig zag</option>
                      <option value="pucker">Pucker and bloat</option>
                      <option value="twist">Twist</option>
                      <option value="warp">Warp</option>
                    </select>
                    {effect.kind === "roughen" && (
                      <>
                        <label className="ve-range">
                          <span>Size</span>
                          <input type="range" min={0} max={30} step={0.5} value={effect.params.roughen.size} onChange={(e) => runEffect("roughen", { size: Number(e.target.value) })} />
                          <span>{effect.params.roughen.size}</span>
                        </label>
                        <label className="ve-range">
                          <span>Detail</span>
                          <input type="range" min={1} max={40} step={1} value={effect.params.roughen.detail} onChange={(e) => runEffect("roughen", { detail: Number(e.target.value) })} />
                          <span>{effect.params.roughen.detail}</span>
                        </label>
                        <div className="ve-row">
                          <label className="ve-check">
                            <input type="checkbox" checked={effect.params.roughen.smooth} onChange={(e) => runEffect("roughen", { smooth: e.target.checked })} />
                            Smooth
                          </label>
                          <div className="ve-buttons">
                            <button onClick={() => runEffect("roughen", { seed: effect.params.roughen.seed + 1 })}>Shuffle</button>
                          </div>
                        </div>
                      </>
                    )}
                    {effect.kind === "zigzag" && (
                      <>
                        <label className="ve-range">
                          <span>Size</span>
                          <input type="range" min={0} max={30} step={0.5} value={effect.params.zigzag.size} onChange={(e) => runEffect("zigzag", { size: Number(e.target.value) })} />
                          <span>{effect.params.zigzag.size}</span>
                        </label>
                        <label className="ve-range">
                          <span>Ridges</span>
                          <input type="range" min={1} max={30} step={1} value={effect.params.zigzag.ridges} onChange={(e) => runEffect("zigzag", { ridges: Number(e.target.value) })} />
                          <span>{effect.params.zigzag.ridges}</span>
                        </label>
                        <label className="ve-check">
                          <input type="checkbox" checked={effect.params.zigzag.smooth} onChange={(e) => runEffect("zigzag", { smooth: e.target.checked })} />
                          Wavy
                        </label>
                      </>
                    )}
                    {effect.kind === "pucker" && (
                      <label className="ve-range">
                        <span>Pucker · Bloat</span>
                        <input type="range" min={-100} max={100} step={1} value={effect.params.pucker.amount} onChange={(e) => runEffect("pucker", { amount: Number(e.target.value) })} />
                        <span>{effect.params.pucker.amount}</span>
                      </label>
                    )}
                    {effect.kind === "twist" && (
                      <label className="ve-range">
                        <span>Angle</span>
                        <input type="range" min={-360} max={360} step={5} value={effect.params.twist.angle} onChange={(e) => runEffect("twist", { angle: Number(e.target.value) })} />
                        <span>{effect.params.twist.angle}°</span>
                      </label>
                    )}
                    {effect.kind === "warp" && (
                      <>
                        <select aria-label="Warp style" value={effect.params.warp.style} onChange={(e) => runEffect("warp", { style: e.target.value as WarpStyle })}>
                          {WARP_STYLES.map((w) => (
                            <option key={w.value} value={w.value}>
                              {w.label}
                            </option>
                          ))}
                        </select>
                        <label className="ve-range">
                          <span>Bend</span>
                          <input type="range" min={-100} max={100} step={1} value={effect.params.warp.bend} onChange={(e) => runEffect("warp", { bend: Number(e.target.value) })} />
                          <span>{effect.params.warp.bend}</span>
                        </label>
                      </>
                    )}
                    <p className="ve-note">Moving a slider again redoes the effect from the shape you started with, until you do something else.</p>
                    <div className="ve-buttons">
                      <button title="Bend the selection by dragging its corners (Shift+D)" onClick={() => setTool("distort")}>
                        Distort by the corners
                      </button>
                    </div>
                  </section>
                )}

              {side === "paths" && geo && (
                <section>
                    <h3>Combine shapes</h3>
                    <label className="ve-check" title="The original shapes stay underneath: move or edit them later and the result follows">
                      <input type="checkbox" checked={engine!.options.liveBoolean} onChange={(e) => ((engine!.options.liveBoolean = e.target.checked), rerender())} />
                      Keep the shapes editable
                    </label>
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
                </section>
              )}
              {side === "paths" && !pinfo && !star && !corners && !geo && <p className="ve-note ve-side-empty">Select a shape or a line to edit its path, combine shapes or add path effects.</p>}

                {side === "extras" && extras && (
                  <section>
                    <h3>Extra fills and outlines</h3>
                    {extras.length === 0 && <p className="ve-note">Stack more fills and outlines under the shape's own, for double outlines, offset shadows and stickers.</p>}
                    {extras.map((x, i) => (
                      <div key={i} className="ve-extra">
                        <div className="ve-row">
                          <strong>{x.kind === "fill" ? "Fill" : "Outline"}</strong>
                          <input type="color" aria-label="Colour" value={x.color} onChange={(e) => setExtra(i, { color: e.target.value })} />
                          {x.kind === "stroke" && <NumberField label="Width" min={0} step={0.5} value={x.width} onChange={(width) => setExtra(i, { width })} />}
                          <button className="ve-layer-toggle" title="Move up (drawn later)" disabled={i === extras.length - 1} onClick={() => engine!.setExtras(extras.map((_, j) => extras[j === i ? i + 1 : j === i + 1 ? i : j]))}>
                            ▲
                          </button>
                          <button className="ve-layer-toggle" title="Remove" onClick={() => engine!.setExtras(extras.filter((_, j) => j !== i))}>
                            ×
                          </button>
                        </div>
                        <div className="ve-row">
                          <NumberField label="Move X" value={x.dx} onChange={(dx) => setExtra(i, { dx })} />
                          <NumberField label="Y" value={x.dy} onChange={(dy) => setExtra(i, { dy })} />
                          <label className="ve-range">
                            <input type="range" min={0} max={1} step={0.05} value={x.opacity} onChange={(e) => setExtra(i, { opacity: Number(e.target.value) })} />
                            <span>{Math.round(x.opacity * 100)}%</span>
                          </label>
                        </div>
                      </div>
                    ))}
                    <div className="ve-buttons">
                      <button onClick={() => engine!.setExtras([...extras, { kind: "fill", color: "#1d1b18", opacity: 0.3, width: 0, dx: 4, dy: 4 }])}>+ Fill</button>
                      <button onClick={() => engine!.setExtras([...extras, { kind: "stroke", color: "#ffffff", opacity: 1, width: Math.max(4, (style?.strokeWidth ?? 2) * 3), dx: 0, dy: 0 }])}>+ Outline</button>
                    </div>
                  </section>
                )}

                {side === "extras" && fx && (
                  <section>
                    <h3>Effects</h3>
                    <label className="ve-check">
                      <input type="checkbox" checked={Boolean(fx.shadow)} onChange={(e) => setFx({ shadow: e.target.checked ? DEFAULT_SHADOW : undefined })} />
                      Drop shadow
                    </label>
                    {fx.shadow && <ShadowFields value={fx.shadow} onChange={(shadow) => setFx({ shadow })} />}
                    <label className="ve-check">
                      <input type="checkbox" checked={Boolean(fx.inner)} onChange={(e) => setFx({ inner: e.target.checked ? DEFAULT_INNER : undefined })} />
                      Inner shadow
                    </label>
                    {fx.inner && <ShadowFields value={fx.inner} onChange={(inner) => setFx({ inner })} />}
                    <label className="ve-check">
                      <input type="checkbox" checked={Boolean(fx.glow)} onChange={(e) => setFx({ glow: e.target.checked ? DEFAULT_GLOW : undefined })} />
                      Glow
                    </label>
                    {fx.glow && <ShadowFields glow value={fx.glow} onChange={({ blur, color, opacity }) => setFx({ glow: { blur, color, opacity } })} />}
                    <label className="ve-range">
                      <span>Blur</span>
                      <input type="range" min={0} max={30} step={0.5} value={fx.blur ?? 0} onChange={(e) => setFx({ blur: Number(e.target.value) })} />
                      <span>{fx.blur ?? 0}</span>
                    </label>
                  </section>
                )}

                {side === "extras" && hasSelection && engine && (
                  <section>
                    <h3>Repeat, blend and symbols</h3>
                    {live?.repeat && (
                      <>
                        <h4>{live.repeat.kind === "grid" ? "Grid" : live.repeat.kind === "radial" ? "Around a circle" : live.repeat.kind === "mirror" ? "Mirror" : "Along a path"}</h4>
                        <div className="ve-grid">
                          {live.repeat.kind === "grid" && (
                            <>
                              <NumberField label="Across" min={1} value={live.repeat.cols} onChange={(cols) => engine.setRepeat({ cols: Math.round(cols) })} />
                              <NumberField label="Down" min={1} value={live.repeat.rows} onChange={(rows) => engine.setRepeat({ rows: Math.round(rows) })} />
                              <NumberField label="Gap ↔" value={live.repeat.gapX} onChange={(gapX) => engine.setRepeat({ gapX })} />
                              <NumberField label="Gap ↕" value={live.repeat.gapY} onChange={(gapY) => engine.setRepeat({ gapY })} />
                            </>
                          )}
                          {live.repeat.kind === "radial" && (
                            <>
                              <NumberField label="Copies" min={2} value={live.repeat.count} onChange={(count) => engine.setRepeat({ count: Math.round(count) })} />
                              <NumberField label="Radius" min={0} value={live.repeat.radius} onChange={(radius) => engine.setRepeat({ radius })} />
                            </>
                          )}
                          {live.repeat.kind === "mirror" && (
                            <>
                              <select aria-label="Mirror" value={live.repeat.axis} onChange={(e) => engine.setRepeat({ axis: e.target.value as "v" })}>
                                <option value="v">Left and right</option>
                                <option value="h">Top and bottom</option>
                                <option value="both">All four ways</option>
                              </select>
                              <span />
                              <NumberField label="Line X" value={live.repeat.atX} onChange={(atX) => engine.setRepeat({ atX })} />
                              <NumberField label="Line Y" value={live.repeat.atY} onChange={(atY) => engine.setRepeat({ atY })} />
                            </>
                          )}
                          {live.repeat.kind === "path" && (
                            <>
                              <NumberField label="Copies" min={1} value={live.repeat.count} onChange={(count) => engine.setRepeat({ count: Math.round(count) })} />
                              <label className="ve-check">
                                <input type="checkbox" checked={live.repeat.rotate} onChange={(e) => engine.setRepeat({ rotate: e.target.checked })} />
                                Follow the path
                              </label>
                            </>
                          )}
                        </div>
                      </>
                    )}
                    {live?.boolean && (
                      <>
                        <div className="ve-row ve-segmented">
                          {(["unite", "subtract", "intersect", "exclude"] as BooleanOp[]).map((op) => (
                            <button key={op} className={live.boolean === op ? "is-active" : undefined} onClick={() => engine.setBooleanOp(op)}>
                              {op[0].toUpperCase() + op.slice(1)}
                            </button>
                          ))}
                        </div>
                        <p className="ve-note">Double-click to work inside and move the original shapes; the result follows.</p>
                        <div className="ve-buttons">
                          <button title="Keep just the result, as an ordinary shape" onClick={() => engine.expandLive()}>
                            Flatten
                          </button>
                          <button title="Bring back the original shapes" onClick={() => engine.releaseLive()}>
                            Release
                          </button>
                        </div>
                      </>
                    )}
                    {live?.blend && <NumberField label="Steps" min={1} value={live.blend.steps} onChange={(steps) => engine.setBlend(steps)} />}
                    {(live?.repeat || live?.blend) && (
                      <>
                        <p className="ve-note">Edit the original with the point tool (A) or inside the group (double-click); the copies follow.</p>
                        <div className="ve-buttons">
                          <button title="Turn the copies into ordinary shapes" onClick={() => engine.expandLive()}>
                            Expand
                          </button>
                          <button title="Remove the copies and keep the original" onClick={() => engine.releaseLive()}>
                            Release
                          </button>
                        </div>
                      </>
                    )}
                    {live?.symbol && (
                      <>
                        <p className="ve-note">{live.symbol === "master" ? "This is the original of a symbol: every copy follows your edits." : "A copy of a symbol. Edit the original and every copy updates."}</p>
                        <div className="ve-buttons">
                          <button onClick={() => engine.placeSymbol()}>Place a copy</button>
                          {live.symbol === "copy" && <button onClick={() => engine.selectSymbolMaster()}>Select the original</button>}
                          <button title={live.symbol === "copy" ? "Make this copy an ordinary shape" : "Stop being a symbol; copies become ordinary shapes"} onClick={() => engine.detachSymbol()}>
                            {live.symbol === "copy" ? "Detach" : "Stop being a symbol"}
                          </button>
                        </div>
                      </>
                    )}
                    {!live && (
                      <div className="ve-buttons">
                        <button onClick={() => engine.makeRepeat("grid")}>Grid</button>
                        <button onClick={() => engine.makeRepeat("radial")}>Around a circle</button>
                        <button onClick={() => engine.makeRepeat("mirror")}>Mirror</button>
                        <button disabled={count !== 2} title="Select a shape and a path" onClick={() => engine.makeRepeat("path")}>
                          Along a path
                        </button>
                        <button disabled={count !== 2} title="Select two shapes to morph between" onClick={() => engine.makeBlend()}>
                          Blend
                        </button>
                        <button title="Make a symbol: copies follow the original" onClick={() => engine.makeSymbol()}>
                          Symbol
                        </button>
                      </div>
                    )}
                  </section>
                )}

              {side === "extras" && geo && (
                <section>
                    <h3>Masks and text</h3>
                    <div className="ve-buttons">
                      <button disabled={!multi} title="Show the shapes below only inside the top shape" onClick={() => engine!.clip()}>
                        Clip
                      </button>
                      <button disabled={!engine!.canUnclip} title="Release the clipping mask" onClick={() => engine!.unclip()}>
                        Release clip
                      </button>
                      <button disabled={!multi} title="Fade the shapes below using the top shape's shades: white shows, black hides, greys fade" onClick={() => engine!.makeSoftMask()}>
                        Soft mask
                      </button>
                      <button disabled={!engine!.canReleaseSoftMask} onClick={() => engine!.releaseSoftMask()}>
                        Release soft mask
                      </button>
                      <button disabled={!engine!.canTextOnPath} title="Select a text and a path, then lay the text along the path" onClick={() => engine!.textOnPath()}>
                        Text on path
                      </button>
                    </div>
                </section>
              )}

                {side === "extras" && used.length > 0 && engine && (
                  <section>
                    <details className="ve-details">
                      <summary>Recolour the drawing</summary>
                      <div className="ve-recolour">
                        {used.map((hex, i) => (
                          <input key={i} type="color" title={`${hex}: change it everywhere`} value={hex} onChange={(e) => engine.recolor(hex, e.target.value)} />
                        ))}
                      </div>
                    </details>
                  </section>
                )}
              {side === "extras" && !hasSelection && !used.length && <p className="ve-note ve-side-empty">Select something for extra fills, effects, repeats, blends, symbols and masks.</p>}

              {side === "board" && geo && (
                <section>
                    <h3>{multi ? "Align" : "Align to the artboard"}</h3>
                    {multi && (
                      <div className="ve-row ve-segmented">
                        <button className={engine!.options.alignTo === "selection" ? "is-active" : undefined} onClick={() => ((engine!.options.alignTo = "selection"), rerender())}>
                          {engine!.key ? "To the key shape" : "To each other"}
                        </button>
                        <button className={engine!.options.alignTo === "board" ? "is-active" : undefined} onClick={() => ((engine!.options.alignTo = "board"), rerender())}>
                          To the artboard
                        </button>
                      </div>
                    )}
                    {multi && engine!.options.alignTo === "selection" && (
                      <p className="ve-note">{engine!.key ? "The others line up to the shape with the thick outline. Click it again to let go." : "Click one of the selected shapes again to make the others line up to it."}</p>
                    )}
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
                    <div className="ve-row">
                      <div className="ve-buttons">
                        <button disabled={count < (gapValue === null ? 3 : 2)} title="The same gap between each shape, side to side" onClick={() => engine!.spaceEvenly("x", gapValue)}>
                          Space ↔
                        </button>
                        <button disabled={count < (gapValue === null ? 3 : 2)} title="The same gap between each shape, top to bottom" onClick={() => engine!.spaceEvenly("y", gapValue)}>
                          Space ↕
                        </button>
                      </div>
                      <label className="ve-num ve-gap" title="Leave empty for even gaps">
                        <span>Gap</span>
                        <input type="number" placeholder="even" value={gap} onChange={(e) => setGap(e.target.value)} />
                      </label>
                    </div>
                </section>
              )}
              {side === "board" && engine && (
                <section>
                  <h3>Artboard</h3>
                <div className="ve-grid">
                  <NumberField label="W" min={1} value={engine.box.w} onChange={(w) => engine.setSize(w, engine.box.h)} />
                  <NumberField label="H" min={1} value={engine.box.h} onChange={(h) => engine.setSize(engine.box.w, h)} />
                  <NumberField label="Grid" min={1} value={engine.options.grid} onChange={(grid) => engine.setGrid({ grid })} />
                </div>
                  <div className="ve-buttons">
                    <button onClick={() => setLeftPanel("boards")}>More artboards and saving pictures…</button>
                  </div>
                </section>
              )}
            </div>
          </div>
          <nav className="ve-side-strip" aria-label="Panel areas">
            {SIDE_AREAS.map((a) => (
              <button key={a.id} className={side === a.id ? "is-active" : undefined} aria-pressed={side === a.id} title={a.title} onClick={() => setSideArea(a.id)}>
                <Icon name={a.icon} size={19} />
                <span>{a.label}</span>
              </button>
            ))}
          </nav>
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
