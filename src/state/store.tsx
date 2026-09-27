import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { produce } from "immer";
import { createStarterSite } from "../model/factory";
import { migrateSite } from "../model/migrate";
import { findSection } from "../model/ops";
import type { Page, Site, Orientation } from "../model/types";
import { tierForWidth, type Tier } from "../model/responsive";
import { CUSTOM_SIZE_LIMITS, DEFAULT_CUSTOM_SIZE, DEFAULT_DEVICE_FOR_GROUP, getDevice, viewportSize, type CustomSize } from "./viewport";

export type Selection =
  | { kind: "none" }
  | { kind: "section"; sectionId: string }
  | {
      kind: "block";
      sectionId: string;
      blockId: string;
      blockIds?: string[];
    };

export function selectedBlockIds(selection: Selection): string[] {
  if (selection.kind !== "block") return [];
  return selection.blockIds?.length ? selection.blockIds : [selection.blockId];
}

export type Mode = "edit" | "preview";
export type LayerFocus = { sectionId: string; layerId: string } | null;

export type Recipe = (draft: Site) => void;

export interface EditorState {
  site: Site;
  past: Site[];
  future: Site[];
  pageId: string;
  selection: Selection;
  deviceId: string;
  landscape: boolean;
  customSize: CustomSize;
  canvasWidth: number;
  mode: Mode;
  freeform: boolean;
  focusedLayer: LayerFocus;
  focusedBlock: { sectionId: string; blockId: string } | null;
  componentId: string | null;
  componentVariantId: string | null;
  componentAnchor: { sectionId: string; blockId: string } | null;
  zoom: number | "fit";
  lastCommitKey: string | null;
  lastCommitAt: number;
}

type Action =
  | { type: "commit"; recipe: Recipe; coalesceKey?: string }
  | { type: "derive"; recipe: Recipe }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "load"; site: Site }
  | { type: "select"; selection: Selection }
  | { type: "setPage"; pageId: string }
  | { type: "setDevice"; deviceId: string; landscape: boolean }
  | { type: "setCanvasWidth"; width: number }
  | { type: "setCustomSize"; size: CustomSize }
  | { type: "setMode"; mode: Mode }
  | { type: "setFreeform"; freeform: boolean }
  | { type: "focusLayer"; focus: LayerFocus }
  | { type: "focusBlock"; focus: EditorState["focusedBlock"] }
  | { type: "editComponent"; componentId: string | null; variantId?: string | null; anchor?: { sectionId: string; blockId: string } | null }
  | { type: "setZoom"; zoom: number | "fit" };

const STORAGE_KEY = "fayteworks:site";
const PREFS_KEY = "fayteworks:prefs";

interface Prefs {
  freeform: boolean;
  deviceId: string;
  landscape: boolean;
  customSize: CustomSize;
}

const clampSize = (n: unknown, fallback: number) =>
  Math.round(Math.min(CUSTOM_SIZE_LIMITS.max, Math.max(CUSTOM_SIZE_LIMITS.min, Number(n) || fallback)));

function loadPrefs(): Prefs {
  let saved: Partial<Prefs> = {};
  try {
    saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
  }
  return {
    freeform: saved.freeform === true,
    deviceId: getDevice(String(saved.deviceId ?? DEFAULT_DEVICE_FOR_GROUP.Desktop)).id,
    landscape: saved.landscape === true,
    customSize: {
      width: clampSize(saved.customSize?.width, DEFAULT_CUSTOM_SIZE.width),
      height: clampSize(saved.customSize?.height, DEFAULT_CUSTOM_SIZE.height)
    }
  };
}

function savePrefs(state: EditorState) {
  try {
    const prefs: Prefs = { freeform: state.freeform, deviceId: state.deviceId, landscape: state.landscape, customSize: state.customSize };
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
  }
}

export function editorTier(state: Pick<EditorState, "deviceId" | "landscape" | "canvasWidth" | "customSize"> & Partial<Pick<EditorState, "site" | "pageId">>): Tier {
  if (state.site?.pages.find((p) => p.id === state.pageId)?.design) return "desktop";
  const size = viewportSize(state.deviceId, state.landscape, state.customSize);
  return tierForWidth(size?.width ?? (state.canvasWidth || 1440));
}

export function editorOrientation(state: Pick<EditorState, "deviceId" | "landscape" | "customSize">): Orientation | null {
  const size = viewportSize(state.deviceId, state.landscape, state.customSize);
  return size ? (size.width > size.height ? "landscape" : "portrait") : null;
}

const HISTORY_LIMIT = 100;
const COALESCE_MS = 800;

function loadSavedSite(): Site | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return migrateSite(parsed);
  } catch {
    return null;
  }
}

function normalize(state: EditorState): EditorState {
  const page = state.site.pages.find((p) => p.id === state.pageId) ?? state.site.pages[0];
  const { selection } = state;
  let valid = true;
  let nextSelection: Selection = selection;
  if (selection.kind !== "none") {
    const section = findSection(state.site, page.id, selection.sectionId);
    valid = Boolean(section);
    if (section && selection.kind === "block") {
      const ids = selectedBlockIds(selection).filter((id) => section.blocks.some((b) => b.id === id));
      if (ids.length === 0) nextSelection = { kind: "section", sectionId: section.id };
      else if (ids.length !== selectedBlockIds(selection).length)
        nextSelection = { kind: "block", sectionId: section.id, blockId: ids.includes(selection.blockId) ? selection.blockId : ids[0], blockIds: ids };
    }
  }
  const blockFocus = state.focusedBlock;
  const blockFocusValid = !blockFocus || Boolean(findSection(state.site, page.id, blockFocus.sectionId)?.blocks.some((b) => b.id === blockFocus.blockId));
  const focus = state.focusedLayer;
  const focusValid =
    !focus || Boolean(findSection(state.site, page.id, focus.sectionId)?.layers.some((l) => l.id === focus.layerId));
  const open = state.componentId ? state.site.components?.find((c) => c.id === state.componentId) : undefined;
  const componentValid = !state.componentId || Boolean(open);
  const variantValid = !state.componentVariantId || Boolean(open?.variants?.some((v) => v.id === state.componentVariantId));
  if (page.id === state.pageId && valid && focusValid && blockFocusValid && componentValid && variantValid && nextSelection === selection) {
    return state;
  }
  return {
    ...state,
    componentId: componentValid ? state.componentId : null,
    componentVariantId: componentValid && variantValid ? state.componentVariantId : null,
    pageId: page.id,
    selection: valid ? nextSelection : { kind: "none" },
    focusedLayer: focusValid ? focus : null,
    focusedBlock: blockFocusValid && page.id === state.pageId ? blockFocus : null
  };
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "commit": {
      const next = produce(state.site, (draft) => {
        action.recipe(draft as Site);
      });
      if (next === state.site) {
        return state;
      }
      const now = Date.now();
      const coalesce =
        action.coalesceKey !== undefined &&
        action.coalesceKey === state.lastCommitKey &&
        now - state.lastCommitAt < COALESCE_MS;
      return normalize({
        ...state,
        site: next,
        past: coalesce ? state.past : [...state.past, state.site].slice(-HISTORY_LIMIT),
        future: [],
        lastCommitKey: action.coalesceKey ?? null,
        lastCommitAt: now
      });
    }
    case "derive": {
      const next = produce(state.site, (draft) => {
        action.recipe(draft as Site);
      });
      return next === state.site ? state : { ...state, site: next };
    }
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) {
        return state;
      }
      return normalize({
        ...state,
        site: previous,
        past: state.past.slice(0, -1),
        future: [state.site, ...state.future],
        lastCommitKey: null
      });
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) {
        return state;
      }
      return normalize({ ...state, site: next, past: [...state.past, state.site], future: rest, lastCommitKey: null });
    }
    case "load":
      return normalize({ ...state, site: action.site, past: [], future: [], selection: { kind: "none" }, lastCommitKey: null });
    case "select":
      return { ...state, selection: action.selection };
    case "setPage":
      return normalize({ ...state, pageId: action.pageId, componentId: null, componentVariantId: null, selection: { kind: "none" } });
    case "setDevice":
      return { ...state, deviceId: action.deviceId, landscape: action.landscape };
    case "setCustomSize":
      return {
        ...state,
        customSize: { width: clampSize(action.size.width, state.customSize.width), height: clampSize(action.size.height, state.customSize.height) }
      };
    case "setCanvasWidth":
      return action.width === state.canvasWidth ? state : { ...state, canvasWidth: action.width };
    case "setMode":
      return { ...state, mode: action.mode, selection: { kind: "none" }, focusedBlock: null };
    case "setFreeform":
      return { ...state, freeform: action.freeform };
    case "focusLayer":
      return normalize({ ...state, focusedLayer: action.focus });
    case "focusBlock":
      return normalize({
        ...state,
        focusedBlock: action.focus,
        selection: action.focus ? { kind: "block", sectionId: action.focus.sectionId, blockId: action.focus.blockId } : state.selection
      });
    case "setZoom":
      return { ...state, zoom: action.zoom === "fit" ? "fit" : Math.min(4, Math.max(0.1, action.zoom)) };
    case "editComponent":
      return normalize({
        ...state,
        componentId: action.componentId,
        componentVariantId: action.componentId ? (action.variantId ?? null) : null,
        mode: "edit",
        selection: { kind: "none" },
        focusedLayer: null,
        componentAnchor: action.componentId ? (action.anchor !== undefined ? action.anchor : state.componentAnchor) : null,
        focusedBlock: action.componentId ? (action.anchor !== undefined ? action.anchor : state.componentAnchor) : null
      });
  }
}

function createInitialState(initialSite?: Site): EditorState {
  const site = initialSite ?? loadSavedSite() ?? createStarterSite();
  const prefs = loadPrefs();
  return {
    site,
    past: [],
    future: [],
    pageId: site.pages[0].id,
    selection: { kind: "none" },
    deviceId: prefs.deviceId,
    landscape: prefs.landscape,
    customSize: prefs.customSize,
    canvasWidth: 0,
    mode: "edit",
    freeform: prefs.freeform,
    focusedLayer: null,
    focusedBlock: null,
    componentId: null,
    componentVariantId: null,
    componentAnchor: null,
    zoom: "fit",
    lastCommitKey: null,
    lastCommitAt: 0
  };
}

interface EditorContextValue {
  state: EditorState;
  page: Page;
  commit: (recipe: Recipe, coalesceKey?: string) => void;
  derive: (recipe: Recipe) => void;
  select: (selection: Selection) => void;
  undo: () => void;
  redo: () => void;
  load: (site: Site) => void;
  setPage: (pageId: string) => void;
  setDevice: (deviceId: string, landscape: boolean) => void;
  setCanvasWidth: (width: number) => void;
  setCustomSize: (size: CustomSize) => void;
  setMode: (mode: Mode) => void;
  setFreeform: (freeform: boolean) => void;
  focusLayer: (focus: LayerFocus) => void;
  focusBlock: (focus: EditorState["focusedBlock"]) => void;
  editComponent: (componentId: string | null, variantId?: string | null, anchor?: { sectionId: string; blockId: string } | null) => void;
  setZoom: (zoom: number | "fit") => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

interface EditorProviderProps {
  children: ReactNode;
  initialSite?: Site;
  persist?: (site: Site) => void;
}

export function EditorProvider({ children, initialSite, persist }: EditorProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialSite, createInitialState);
  const persistRef = useRef(persist);
  persistRef.current = persist;

  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current && persistRef.current) {
      firstSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      if (persistRef.current) {
        persistRef.current(state.site);
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.site));
      } catch (error) {
        console.warn("Autosave failed", error);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [state.site]);

  const commit = useCallback((recipe: Recipe, coalesceKey?: string) => dispatch({ type: "commit", recipe, coalesceKey }), []);
  const derive = useCallback((recipe: Recipe) => dispatch({ type: "derive", recipe }), []);
  const select = useCallback((selection: Selection) => dispatch({ type: "select", selection }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const load = useCallback((site: Site) => dispatch({ type: "load", site }), []);
  const setPage = useCallback((pageId: string) => dispatch({ type: "setPage", pageId }), []);
  const setDevice = useCallback(
    (deviceId: string, landscape: boolean) => dispatch({ type: "setDevice", deviceId, landscape }),
    []
  );
  const setMode = useCallback((mode: Mode) => dispatch({ type: "setMode", mode }), []);
  const setCanvasWidth = useCallback((width: number) => dispatch({ type: "setCanvasWidth", width }), []);
  const setCustomSize = useCallback((size: CustomSize) => dispatch({ type: "setCustomSize", size }), []);
  const setFreeform = useCallback((freeform: boolean) => dispatch({ type: "setFreeform", freeform }), []);
  const focusLayer = useCallback((focus: LayerFocus) => dispatch({ type: "focusLayer", focus }), []);
  const focusBlock = useCallback((focus: EditorState["focusedBlock"]) => dispatch({ type: "focusBlock", focus }), []);
  const setZoom = useCallback((zoom: number | "fit") => dispatch({ type: "setZoom", zoom }), []);
  const editComponent = useCallback(
    (componentId: string | null, variantId?: string | null, anchor?: { sectionId: string; blockId: string } | null) => dispatch({ type: "editComponent", componentId, variantId, anchor }),
    []
  );

  useEffect(() => savePrefs(state), [state.freeform, state.deviceId, state.landscape, state.customSize]);

  const page = state.site.pages.find((p) => p.id === state.pageId) ?? state.site.pages[0];

  const value = useMemo(
    () => ({ state, page, commit, derive, select, undo, redo, load, setPage, setDevice, setCanvasWidth, setCustomSize, setMode, setFreeform, focusLayer, focusBlock, editComponent, setZoom }),
    [state, page, commit, derive, select, undo, redo, load, setPage, setDevice, setCanvasWidth, setCustomSize, setMode, setFreeform, focusLayer, focusBlock, editComponent, setZoom]
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) {
    throw new Error("useEditor must be used inside EditorProvider");
  }
  return ctx;
}
