import { openScene, useScene } from "../scenes/scenes";
import { DesignsPanel } from "../design/DesignsPanel";
import { openSecondWindow, useLiveBroadcast } from "../viewer/live";
import { checkForUpdatesNow } from "../platform/UpdateNotice";
import { CodePanel, DrawPanel, MediaPanel } from "./FocusPanels";
import { FieldWires } from "./FieldWires";
import { openShortcuts, ShortcutsHost } from "../guides/ShortcutsDialog";
import { DesignsHome } from "../design/DesignsHome";
import { openDesignHome, useDesignHome } from "../design/home";
import { FramesPanel } from "../motion/FlipbookTools";
import { onFocusRequest } from "./focusTools";
import { SceneHost } from "../scenes/SceneHost";
import { useEffect, useRef, useState } from "react";
import { LanguagePicker, TranslateDialog } from "../i18n/TranslateDialog";
import { useEditingLang } from "../i18n/i18n";
import { DocumentDialog, OPEN_DOCUMENT } from "../business/DocumentDialog";
import { StatsDialog } from "../stats/StatsDialog";
import { DirectoryDialog, OPEN_DIRECTORY } from "../directory/DirectoryDialog";
import { OPEN_TELL, TellPeopleDialog } from "../social/TellPeopleDialog";
import { EmailSignatureDialog } from "../social/EmailSignatureDialog";
import { HistoryDialog, VersionKeeper } from "../history/HistoryDialog";
import { isClientLocked, useClientLock } from "../client/clientMode";
import { ClientBadge, ClientInspector, ClientLockedPanel, HandoverDialog } from "../client/ClientInspector";
import { OPEN_PREPUBLISH, PrepublishDialog } from "../quality/PrepublishDialog";
import { GuideHost, OPEN_EXPORT, OPEN_INBOX, OPEN_SERVICES, openGuide } from "../guides/GuideHost";
import { OPEN_STATS } from "../stats/StatsDialog";
import { InboxDialog } from "../contact/InboxDialog";
import { downloadBlob } from "../export/output";
import { buildSiteFile, readSiteFile } from "../export/siteFile";
import { createBlankSite, createStarterSite, slugify } from "../model/factory";
import { isBlockVisible, targetLayerId } from "../model/layers";
import { findPage, findSection, removeSection } from "../model/ops";
import { isStacked } from "../model/responsive";
import { editorTier, selectedBlockIds, useEditor } from "../state/store";
import { canRotate, CUSTOM_DEVICE_ID, CUSTOM_SIZE_LIMITS, DEFAULT_DEVICE_FOR_GROUP, DEVICE_GROUPS, DEVICES, getDevice } from "../state/viewport";
import { cls } from "../util/cls";
import { Canvas } from "./Canvas";
import { desktop } from "../platform/desktop";
import { useDesktopProject } from "../platform/DesktopRoot";
import { copyBlocks, decodeClipboard, encodeClipboard, insertBlocks, moveBlocks, removeBlocks, sectionForPaste } from "./selectionOps";
import { CheckPanel } from "./CheckPanel";
import { DataPanel } from "../data/DataPanel";
import { TimelinePanel } from "../motion/TimelinePanel";
import { ServicesDialog } from "../services/ServicesDialog";
import { ExportDialog } from "./ExportDialog";
import { DotHelper } from "../helper/DotHelper";
import { IssuesProvider, useIssues } from "./issues";
import { EditorRenderProvider } from "./renderProvider";
import { Inspector } from "./Inspector";
import { LayersPanel } from "./LayersPanel";
import { AskTextHost } from "./askText";
import { TailwindSync } from "../tailwind/TailwindSync";
import { VectorSync } from "../vector/VectorTools";
import { MediaSync } from "../media/MediaTools";
import { dragPointer, onOpenPanel, RAIL_PANELS, setFocusTool, useFocusTool, useWorkspace, type FocusTool, type RailPanel, setFocusPopped, useFocusPopped } from "./workspace";
import { Icon, type IconName } from "./icons";
import { NewMenu, OPEN_COLLECTION } from "./NewMenu";
import { CollectionTool } from "../data/CollectionTool";
import { ComponentsDialog, Palette } from "./Palette";
import { TemplateCatalogue } from "./TemplateCatalogue";
import { CANVAS_ZOOM_EVENT, type CanvasZoomRequest } from "./Canvas";
import { densityOf } from "../model/grid";
import { PagesPanel } from "./PagesPanel";

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

const NUDGE: Record<string, [number, number]> = {
  arrowleft: [-1, 0],
  arrowright: [1, 0],
  arrowup: [0, -1],
  arrowdown: [0, 1]
};

function useShortcuts() {
  const editor = useEditor();
  const latest = useRef(editor);
  latest.current = editor;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const { state, page, commit, select, undo, redo, focusLayer, focusBlock } = latest.current;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (isTypingTarget(event.target) || state.mode !== "edit") {
        return;
      }
      if (document.querySelector(".scene") && !(mod && (key === "z" || key === "y"))) return;
      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (mod && key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (key === "?" && !mod) {
        event.preventDefault();
        openShortcuts();
        return;
      }
      if (key === "escape") {
        if (state.focusedBlock) focusBlock(null);
        else if (state.focusedLayer) focusLayer(null);
        else select({ kind: "none" });
        return;
      }

      const { selection } = state;
      if (selection.kind === "none" || isClientLocked(state.site)) {
        return;
      }
      const pageId = page.id;
      const { sectionId } = selection;
      const section = findSection(state.site, pageId, sectionId);
      if (!section) return;
      const tier = editorTier(state);
      const ids = selectedBlockIds(selection);

      if (mod && key === "a") {
        event.preventDefault();
        const all = section.blocks.filter((b) => isBlockVisible(section, b)).map((b) => b.id);
        if (all.length) select({ kind: "block", sectionId, blockId: all[0], blockIds: all });
        return;
      }

      if (key === "delete" || key === "backspace") {
        event.preventDefault();
        if (ids.length) {
          commit((draft) => {
            const s = findSection(draft, pageId, sectionId);
            if (s) removeBlocks(s, ids);
          });
          select({ kind: "section", sectionId });
        } else {
          commit((draft) => removeSection(draft, pageId, sectionId));
          select({ kind: "none" });
        }
        return;
      }

      if (ids.length === 0) {
        return;
      }

      if (mod && key === "d") {
        event.preventDefault();
        const copies = copyBlocks(section.blocks.filter((b) => ids.includes(b.id)));
        commit((draft) => {
          const s = findSection(draft, pageId, sectionId);
          if (s) insertBlocks(s, copies, tier, 1, 1, targetLayerId(s, state.focusedLayer));
        });
        select({ kind: "block", sectionId, blockId: copies[0].id, blockIds: copies.map((c) => c.id) });
        return;
      }

      if (NUDGE[key] && !isStacked(section, tier)) {
        event.preventDefault();
        const [dx, dy] = NUDGE[key];
        commit((draft) => {
          const s = findSection(draft, pageId, sectionId);
          if (s) moveBlocks(s, ids, tier, dx, dy);
        }, `${ids.join(",")}.nudge`);
      }
    }

    function copySelection(event: ClipboardEvent): boolean {
      const { state, page } = latest.current;
      const { selection } = state;
      if (selection.kind === "none") return false;
      const section = findSection(state.site, page.id, selection.sectionId);
      if (!section) return false;
      const ids = selectedBlockIds(selection);
      const text = ids.length
        ? encodeClipboard({ kind: "blocks", sourceSectionId: section.id, blocks: section.blocks.filter((b) => ids.includes(b.id)), density: densityOf(section) })
        : encodeClipboard({ kind: "section", section });
      event.clipboardData?.setData("text/plain", text);
      event.preventDefault();
      return true;
    }

    function onCopy(event: ClipboardEvent) {
      if (isTypingTarget(event.target) || latest.current.state.mode !== "edit") return;
      copySelection(event);
    }

    function onCut(event: ClipboardEvent) {
      if (isTypingTarget(event.target) || latest.current.state.mode !== "edit" || isClientLocked(latest.current.state.site)) return;
      const { state, page, commit, select } = latest.current;
      if (!copySelection(event) || state.selection.kind === "none") return;
      const { sectionId } = state.selection;
      const ids = selectedBlockIds(state.selection);
      if (ids.length) {
        commit((draft) => {
          const s = findSection(draft, page.id, sectionId);
          if (s) removeBlocks(s, ids);
        });
        select({ kind: "section", sectionId });
      } else {
        commit((draft) => removeSection(draft, page.id, sectionId));
        select({ kind: "none" });
      }
    }

    function onPaste(event: ClipboardEvent) {
      if (isTypingTarget(event.target) || latest.current.state.mode !== "edit" || isClientLocked(latest.current.state.site)) return;
      const payload = decodeClipboard(event.clipboardData?.getData("text/plain") ?? "");
      if (!payload) return;
      event.preventDefault();
      const { state, page, commit, select } = latest.current;
      const { selection } = state;
      const tier = editorTier(state);

      if (payload.kind === "section") {
        const copy = sectionForPaste(payload.section);
        const selectedId = selection.kind !== "none" ? selection.sectionId : null;
        const at = page.sections.findIndex((s) => s.id === selectedId);
        commit((draft) => {
          findPage(draft, page.id)?.sections.splice(at >= 0 ? at + 1 : page.sections.length, 0, copy);
        });
        select({ kind: "section", sectionId: copy.id });
        return;
      }

      const targetId = selection.kind !== "none" ? selection.sectionId : page.sections[0]?.id;
      const target = targetId ? findSection(state.site, page.id, targetId) : undefined;
      if (!target) return;
      const copies = copyBlocks(payload.blocks);
      const sameSection = payload.sourceSectionId === target.id;
      commit((draft) => {
        const s = findSection(draft, page.id, target.id);
        if (s) insertBlocks(s, copies, tier, 0, sameSection ? 1 : 0, targetLayerId(s, state.focusedLayer), payload.density ?? 1);
      });
      select({ kind: "block", sectionId: target.id, blockId: copies[0].id, blockIds: copies.map((c) => c.id) });
    }

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, []);
}

function DeviceBar() {
  const { state, setDevice, setCustomSize } = useEditor();
  const device = getDevice(state.deviceId, state.customSize);
  const isCustom = device.id === CUSTOM_DEVICE_ID;
  return (
    <div className="topbar-group device-bar">
      <div className="topbar-viewports" role="tablist" aria-label="Screen size">
        {DEVICE_GROUPS.map((group) => (
          <button
            key={group}
            role="tab"
            aria-selected={device.group === group}
            className={cls("seg", device.group === group && "is-active")}
            onClick={() => device.group !== group && setDevice(DEFAULT_DEVICE_FOR_GROUP[group], state.landscape)}
          >
            {group}
          </button>
        ))}
      </div>
      <select
        className="device-select"
        aria-label="Device"
        value={device.id}
        onChange={(e) => setDevice(e.target.value, state.landscape)}
      >
        {DEVICES.filter((d) => d.group === device.group).map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
            {d.width ? ` (${d.width}×${d.height})` : ""}
          </option>
        ))}
        <option value={CUSTOM_DEVICE_ID}>Custom size…</option>
      </select>
      {isCustom && (
        <div className="custom-size" title="Any size from 240 to 3840 pixels">
          {(["width", "height"] as const).map((dim, i) => (
            <label key={dim}>
              {i > 0 && <span aria-hidden>×</span>}
              <input
                type="number"
                aria-label={dim}
                min={CUSTOM_SIZE_LIMITS.min}
                max={CUSTOM_SIZE_LIMITS.max}
                defaultValue={state.customSize[dim]}
                key={`${dim}-${state.customSize[dim]}`}
                onBlur={(e) => setCustomSize({ ...state.customSize, [dim]: Number(e.target.value) })}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
            </label>
          ))}
        </div>
      )}
      <button
        className={cls("btn btn--ghost device-rotate", state.landscape && canRotate(device) && "is-active")}
        disabled={!canRotate(device)}
        title={state.landscape ? "Landscape: switch to portrait" : "Portrait: switch to landscape"}
        onClick={() => setDevice(device.id, !state.landscape)}
      >
        {state.landscape && canRotate(device) ? "▭" : "▯"}
      </button>
    </div>
  );
}

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

function ZoomControl() {
  const { state } = useEditor();
  const zoom = (detail: CanvasZoomRequest) => window.dispatchEvent(new CustomEvent<CanvasZoomRequest>(CANVAS_ZOOM_EVENT, { detail }));
  const current = state.zoom === "fit" ? "fit" : String(state.zoom);
  return (
    <div className="zoom-control" title="Zoom: Ctrl/Cmd + wheel or pinch. Pan: Space + drag or middle mouse. Ctrl + 0 fits.">
      <button className="btn btn--ghost zoom-step" aria-label="Zoom out" onClick={() => zoom({ step: -1 })}>
        −
      </button>
      <select aria-label="Zoom" value={current} onChange={(e) => zoom(e.target.value === "fit" ? { to: "fit" } : { to: Number(e.target.value) })}>
        <option value="fit">Fit</option>
        {state.zoom !== "fit" && !ZOOM_PRESETS.includes(state.zoom) && <option value={current}>{Math.round(state.zoom * 100)}%</option>}
        {ZOOM_PRESETS.map((z) => (
          <option key={z} value={String(z)}>
            {z * 100}%
          </option>
        ))}
      </select>
      <button className="btn btn--ghost zoom-step" aria-label="Zoom in" onClick={() => zoom({ step: 1 })}>
        +
      </button>
    </div>
  );
}

function TopBar({ workspace }: { workspace: ReturnType<typeof useWorkspace> }) {
  const { state, undo, redo, load, setMode, focusBlock, editComponent } = useEditor();
  const isolated = state.mode === "edit" && Boolean(state.focusedBlock);
  const makingInPlace = isolated && Boolean(state.componentId && state.componentAnchor);
  const { page: currentPage, setPage, select } = useEditor();
  const designing = state.mode === "edit" && Boolean(currentPage.design);
  const lastWebPage = useRef<string | null>(null);
  useEffect(() => {
    if (!currentPage.design) lastWebPage.current = currentPage.id;
  }, [currentPage.id, currentPage.design]);
  const leaveDesigns = () => setPage(lastWebPage.current && state.site.pages.some((p) => p.id === lastWebPage.current) ? lastWebPage.current : (state.site.pages.find((p) => !p.design)?.id ?? state.site.pages[0].id));
  const fileRef = useRef<HTMLDivElement>(null);
  const desktopProject = useDesktopProject();
  const clientLocked = useClientLock();
  const fileInput = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => !fileRef.current?.contains(e.target as Node) && setMenuOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuOpen]);
  const [exporting, setExporting] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [handover, setHandover] = useState(false);
  const [history, setHistory] = useState(false);
  const [documentKind, setDocumentKind] = useState<"invoice" | "proposal" | null>(null);
  const [translating, setTranslating] = useState(false);
  const [directory, setDirectory] = useState<{ category?: string } | null>(null);
  const [tell, setTell] = useState<{ target?: string } | null>(null);
  const [signature, setSignature] = useState(false);
  const [templates, setTemplates] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  useEffect(() => {
    const open = (e: Event) => setTell({ target: (e as CustomEvent<string | undefined>).detail });
    window.addEventListener(OPEN_TELL, open);
    return () => window.removeEventListener(OPEN_TELL, open);
  }, []);
  const editLang = useEditingLang(state.site);
  useEffect(() => {
    const open = (e: Event) => setDocumentKind((e as CustomEvent<"invoice" | "proposal">).detail);
    window.addEventListener(OPEN_DOCUMENT, open);
    return () => window.removeEventListener(OPEN_DOCUMENT, open);
  }, []);
  useEffect(() => {
    const open = (e: Event) => setDirectory({ category: (e as CustomEvent<string | undefined>).detail });
    window.addEventListener(OPEN_DIRECTORY, open);
    return () => window.removeEventListener(OPEN_DIRECTORY, open);
  }, []);
  useEffect(() => {
    const open = () => setChecking(true);
    window.addEventListener(OPEN_PREPUBLISH, open);
    return () => window.removeEventListener(OPEN_PREPUBLISH, open);
  }, []);
  useEffect(() => {
    const openExport = () => setExporting(true);
    const openServices = () => setServicesOpen(true);
    const openInbox = () => setInboxOpen(true);
    const openStats = () => setStatsOpen(true);
    window.addEventListener(OPEN_EXPORT, openExport);
    window.addEventListener(OPEN_SERVICES, openServices);
    window.addEventListener(OPEN_INBOX, openInbox);
    window.addEventListener(OPEN_STATS, openStats);
    return () => {
      window.removeEventListener(OPEN_EXPORT, openExport);
      window.removeEventListener(OPEN_SERVICES, openServices);
      window.removeEventListener(OPEN_INBOX, openInbox);
      window.removeEventListener(OPEN_STATS, openStats);
    };
  }, []);
  const editing = state.mode === "edit";
  const palette = workspace.layout.palette;

  async function exportJson() {
    const json = await buildSiteFile(state.site);
    downloadBlob(new Blob([json], { type: "application/json" }), `${slugify(state.site.name)}.site.json`);
  }

  async function importJson(file: File) {
    try {
      if (desktopProject && !window.confirm("Replace this project's site with the file's contents? Images are copied into the project.")) return;
      load(await readSiteFile(await file.text()));
    } catch {
      window.alert("That file isn't a site exported from this editor.");
    }
  }

  function startOver(kind: "starter" | "blank") {
    setMenuOpen(false);
    if (window.confirm("Replace the current site? Save a copy first if you want to keep it.")) load(kind === "blank" ? createBlankSite() : createStarterSite());
  }

  const item = (label: string, run: () => void) => (
    <button
      onClick={() => {
        setMenuOpen(false);
        run();
      }}
    >
      {label}
    </button>
  );

  return (
    <header className="topbar">
      <div className="topbar-group">
        <span className="topbar-logo" aria-hidden>
          <Icon name="grid" size={16} />
        </span>
        <div className="topbar-site">
          <button className="topbar-name" title="Site settings" onClick={() => openScene({ kind: "site", tab: "site" })}>
            {state.site.name || "Untitled site"}
          </button>
          {desktopProject && (
            <button className={`topbar-save topbar-save--${desktopProject.saveStatus}`} title={desktopProject.saveStatus === "error" ? desktopProject.saveError : `${desktopProject.project.path}\nClick for version history`} onClick={() => setHistory(true)}>
              {desktopProject.saveStatus === "saving" ? "Saving…" : desktopProject.saveStatus === "error" ? "Not saved!" : "Saved"}
            </button>
          )}
        </div>
        <div className="topbar-menu" ref={fileRef} hidden={isolated || designing}>
          <button className="btn topbar-tool" onClick={() => setMenuOpen((open) => !open)}>
            File
          </button>
          {menuOpen && (
            <div className="topbar-menu-list">
              {item("Publish or export…", () => setExporting(true))}
              {item("Check before publishing…", () => setChecking(true))}
              {item("Version history…", () => setHistory(true))}
              {item("Open a second window", openSecondWindow)}
              {desktop && item("Check for updates", checkForUpdatesNow)}
              <hr />
              {item("Translate (languages)…", () => setTranslating(true))}
              {item("Services (payments, sign-ups, statistics)…", () => setServicesOpen(true))}
              {item("Tell people (post a page everywhere)…", () => setTell({}))}
              {item("Email signature…", () => setSignature(true))}
              {item("Directory: print shops, merch makers and more…", () => setDirectory({}))}
              {item("Hand over to a client…", () => setHandover(true))}
              <hr />
              {item("Save site file (.json)", () => void exportJson())}
              {item("Open site file…", () => fileInput.current?.click())}
              <hr />
              {desktopProject ? (
                <>
                  {item("Show project folder", () => void desktop?.showFolder())}
                  {item("Switch project…", () => desktopProject.switchProject())}
                </>
              ) : (
                <>
                  <button onClick={() => startOver("starter")}>New site from Starter</button>
                  <button onClick={() => startOver("blank")}>New blank site</button>
                  {item("New site from a template…", () => setTemplates(true))}
                </>
              )}
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importJson(file);
            }}
          />
        </div>
        {isolated && (makingInPlace ? <span className="topbar-isolated">Changing its design</span> : <FocusToolSwitch />)}
        {designing && !isolated && (
          <>
            <button className="topbar-isolated topbar-isolated--button" title="See all your designs" onClick={openDesignHome}>
              Designs
            </button>
            <button className={cls("btn topbar-tool", palette && "is-active")} aria-pressed={palette} data-palette-toggle onClick={() => workspace.set({ palette: !palette })}>
              <Icon name="add" size={16} />
              Add
            </button>
          </>
        )}
        {makingInPlace && (
          <button className={cls("btn topbar-tool", palette && "is-active")} aria-pressed={palette} data-palette-toggle onClick={() => workspace.set({ palette: !palette })}>
            <Icon name="add" size={16} />
            Add a piece
          </button>
        )}
        {editing && !clientLocked && !isolated && !designing && (
          <>
            <span className="topbar-divider" />
            <NewMenu />
            <button className={cls("btn topbar-tool", palette && "is-active")} aria-pressed={palette} data-palette-toggle onClick={() => workspace.set({ palette: !palette })}>
              <Icon name="add" size={16} />
              Add
            </button>
          </>
        )}
      </div>

      {designing ? (
        <div className="topbar-group device-bar">
          <button className="btn topbar-tool" title="Show this design, or any page, in its own window next to the editor" onClick={openSecondWindow}>
            ⧉ Second window
          </button>
        </div>
      ) : (
        <DeviceBar />
      )}

      <div className="topbar-group">
        {editing && (
          <>
            <button className="btn btn--ghost topbar-icon" title="Undo (Ctrl Z)" aria-label="Undo" disabled={!state.past.length} onClick={undo}>
              <Icon name="undo" />
            </button>
            <button className="btn btn--ghost topbar-icon" title="Redo (Ctrl Y)" aria-label="Redo" disabled={!state.future.length} onClick={redo}>
              <Icon name="redo" />
            </button>
          </>
        )}
        {isolated ? (
          <button className="btn btn--primary topbar-tool" onClick={() => (makingInPlace ? editComponent(null) : focusBlock(null))}>
            Done
          </button>
        ) : designing ? (
          <>
            <button className="btn topbar-tool" onClick={() => select({ kind: "none" })}>
              Size and export
            </button>
            <button className="btn btn--primary topbar-tool" title="Back to the website" onClick={leaveDesigns}>
              Done
            </button>
          </>
        ) : (
          <>
            <LanguagePicker value={editLang} />
            <ClientBadge />
            <button className="btn topbar-tool" onClick={() => setMode(editing ? "preview" : "edit")}>
              {editing ? "Preview" : "Back to editor"}
            </button>
            <button className="btn btn--primary topbar-tool" onClick={() => setExporting(true)}>
              Publish
            </button>
          </>
        )}
      </div>
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {servicesOpen && <ServicesDialog onClose={() => setServicesOpen(false)} />}
      {inboxOpen && <InboxDialog onClose={() => setInboxOpen(false)} />}
      {statsOpen && <StatsDialog onClose={() => setStatsOpen(false)} />}
      {checking && <PrepublishDialog onClose={() => setChecking(false)} />}
      {handover && <HandoverDialog onClose={() => setHandover(false)} />}
      {history && <HistoryDialog onClose={() => setHistory(false)} />}
      {documentKind && <DocumentDialog kind={documentKind} onClose={() => setDocumentKind(null)} />}
      {translating && <TranslateDialog onClose={() => setTranslating(false)} />}
      {directory && <DirectoryDialog category={directory.category} onClose={() => setDirectory(null)} />}
      {tell && <TellPeopleDialog initial={tell.target} onClose={() => setTell(null)} />}
      {signature && <EmailSignatureDialog onClose={() => setSignature(false)} />}
      {templates && (
        <TemplateCatalogue
          onClose={() => setTemplates(false)}
          onPick={(build) => {
            if (!window.confirm("Replace the current site? Save a copy first if you want to keep it.")) return;
            setTemplates(false);
            load(build());
          }}
        />
      )}
    </header>
  );
}

const RAIL_LABELS: Record<RailPanel, string> = { pages: "Pages", layers: "Layers", data: "Data", check: "Check" };
const RAIL_ICONS: Record<RailPanel, IconName> = { pages: "page", layers: "layers", data: "data", check: "check" };

function Rail({ workspace }: { workspace: ReturnType<typeof useWorkspace> }) {
  const { issues } = useIssues();
  const { left } = workspace.layout;
  const locked = useClientLock();
  return (
    <nav className="rail" aria-label="Panels">
      {RAIL_PANELS.map((p) => (
        <button key={p} className={cls("rail-item", left === p && "is-active")} aria-pressed={left === p} onClick={() => workspace.toggleLeft(p)}>
          <Icon name={RAIL_ICONS[p]} size={20} />
          <span>{RAIL_LABELS[p]}</span>
          {p === "check" && issues.length > 0 && <span className="rail-badge">{issues.length}</span>}
        </button>
      ))}
      {!locked && (
        <button className="rail-item" title="Flyers, cards, posters, social images and drawings" onClick={openDesignHome}>
          <Icon name="design" size={20} />
          <span>Designs</span>
        </button>
      )}
      <span className="rail-spacer" />
      <div className="rail-dot-slot" />
      {desktop && (
        <>
          <button className="rail-item" onClick={() => window.dispatchEvent(new Event(OPEN_INBOX))}>
            <Icon name="inbox" size={20} />
            <span>Inbox</span>
          </button>
          <button className="rail-item" onClick={() => window.dispatchEvent(new Event(OPEN_STATS))}>
            <Icon name="stats" size={20} />
            <span>Stats</span>
          </button>
        </>
      )}
      <button className="rail-item" onClick={() => openGuide()}>
        <Icon name="help" size={20} />
        <span>Guides</span>
      </button>
    </nav>
  );
}

function FocusToolSwitch() {
  const { state, page } = useEditor();
  const tool = useFocusTool();
  const focus = state.focusedBlock;
  const block = focus ? page.sections.find((s) => s.id === focus.sectionId)?.blocks.find((b) => b.id === focus.blockId) : undefined;
  const tools: [FocusTool, string][] = [
    [null, "Settings"],
    ["timeline", "Animate"],
    ...(block?.type === "flipbook" ? ([["frames", "Frames"]] as [FocusTool, string][]) : []),
    ...(block?.type === "code" ? ([["code", "Code"]] as [FocusTool, string][]) : []),
    ...(block?.type === "video" || block?.type === "audio" ? ([["trim", "Trim"]] as [FocusTool, string][]) : []),
    ...(block?.type === "video" ? ([["captions", "Captions"]] as [FocusTool, string][]) : []),
    ...(block?.type === "vector" ? ([["draw", "Draw"]] as [FocusTool, string][]) : [])
  ];
  return (
    <div className="focus-tools" role="tablist" aria-label="What to work on">
      {tools.map(([id, label]) => (
        <button key={label} role="tab" aria-selected={tool === id} className={cls(tool === id && "is-active")} onClick={() => setFocusTool(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Workspace() {
  const { state } = useEditor();
  const workspace = useWorkspace();
  const { layout, set, setWidth, setBottomHeight } = workspace;
  const clientLocked = useClientLock();
  const [components, setComponents] = useState(false);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [startPost, setStartPost] = useState<string | undefined>();
  useEffect(() => {
    const open = (e: Event) => {
      const detail = (e as CustomEvent<string | { id: string; newPost?: string }>).detail;
      setCollectionId(typeof detail === "string" ? detail : detail.id);
      setStartPost(typeof detail === "string" ? undefined : detail.newPost);
    };
    window.addEventListener(OPEN_COLLECTION, open);
    return () => window.removeEventListener(OPEN_COLLECTION, open);
  }, []);
  useEffect(() => {
    if (state.componentId && !state.componentAnchor) set({ palette: true });
  }, [state.componentId, state.componentAnchor, set]);
  useEffect(
    () =>
      onOpenPanel((panel) => {
        if (panel === "add") set({ palette: true });
        else if (panel === "timeline") {
          const sel = latest.current.state.selection;
          if (sel.kind === "block") {
            latest.current.focusBlock({ sectionId: sel.sectionId, blockId: sel.blockId });
            setFocusTool("timeline");
          }
        }
        else if (panel === "make") setComponents(true);
        else if ((RAIL_PANELS as string[]).includes(panel)) set({ left: panel as RailPanel });
      }),
    [set]
  );
  const editing = state.mode === "edit";
  useShortcuts();
  const { page, focusBlock } = useEditor();
  useLiveBroadcast(state.site, page.id);
  const focusTool = useFocusTool();
  const designing = editing && Boolean(page.design);
  const latest = useRef({ state, focusBlock });
  latest.current = { state, focusBlock };
  useEffect(
    () =>
      onFocusRequest(({ sectionId, blockId }) => {
        const f = latest.current.state.focusedBlock;
        if (f?.blockId !== blockId) latest.current.focusBlock({ sectionId, blockId });
      }),
    []
  );
  const focusedType = state.focusedBlock ? page.sections.find((s) => s.id === state.focusedBlock!.sectionId)?.blocks.find((b) => b.id === state.focusedBlock!.blockId)?.type : undefined;
  useEffect(() => {
    if (!state.focusedBlock) setFocusTool(null);
    else if (focusTool === "frames" && focusedType !== "flipbook") setFocusTool(null);
    else if (focusTool === "code" && focusedType !== "code") setFocusTool(null);
    else if ((focusTool === "trim" || focusTool === "captions") && focusedType !== "video" && focusedType !== "audio") setFocusTool(null);
    else if (focusTool === "draw" && focusedType !== "vector") setFocusTool(null);
  }, [state.focusedBlock, focusTool, focusedType]);

  const isolated = editing && Boolean(state.focusedBlock);
  const makingInPlace = isolated && Boolean(state.componentId && state.componentAnchor);
  const [scene, setScene] = useScene();
  const designHome = useDesignHome();
  const leftPanel = (panel: RailPanel) =>
    clientLocked && ["layers", "check"].includes(panel) ? <ClientLockedPanel /> : panel === "layers" ? <LayersPanel /> : panel === "pages" ? <PagesPanel /> : panel === "check" ? <CheckPanel /> : <DataPanel />;
  const left = editing && !isolated && !designing ? layout.left : null;
  const toolOpen = editing && isolated && Boolean(focusTool);
  useEffect(() => {
    if (!toolOpen) return;
    const id = requestAnimationFrame(() => document.querySelector(".editor .is-focus-target")?.scrollIntoView({ block: "center", behavior: "smooth" }));
    return () => cancelAnimationFrame(id);
  }, [toolOpen, state.focusedBlock?.blockId]);
  useEffect(() => {
    if (!state.focusedBlock) return;
    const id = window.setTimeout(() => {
      const target = document.querySelector(".editor .is-focus-target");
      const box = target?.getBoundingClientRect();
      if (box && (box.bottom < 80 || box.top > window.innerHeight - 40)) target!.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    return () => window.clearTimeout(id);
  }, [state.focusedBlock?.blockId]);
  const popped = useFocusPopped();
  const bigTool = focusTool === "draw" || focusTool === "code";
  const bottom = toolOpen ? Math.max(bigTool ? Math.round(window.innerHeight * 0.55) : 260, layout.bottomHeight) : 0;
  useEffect(() => {
    if (!toolOpen && popped) setFocusPopped(false);
  }, [toolOpen, popped]);

  return (
    <>
    {scene && <SceneHost scene={scene} setScene={setScene} />}
    {designHome && editing && <DesignsHome />}
    <div
      hidden={Boolean(scene)}
      inert={Boolean(scene)}
      className={cls("editor", !editing && "editor--preview")}
      style={editing ? { gridTemplateColumns: `${isolated || designing ? 0 : 72}px ${left || (designing && !isolated) ? layout.leftWidth : 0}px minmax(0, 1fr) ${layout.rightWidth}px`, gridTemplateRows: `60px minmax(0, 1fr) ${bottom}px` } : undefined}
    >
      <TopBar workspace={workspace} />
      {editing && !isolated && !designing && <Rail workspace={workspace} />}
      {designing && !isolated && <DesignsPanel />}
      {editing && left && (
        <aside className="panel panel--left">
          <header className="panel-head">
            <h2>{RAIL_LABELS[left]}</h2>
            <button className="btn btn--ghost topbar-icon" aria-label={`Close ${RAIL_LABELS[left]}`} onClick={() => set({ left: null })}>
              <Icon name="close" size={16} />
            </button>
          </header>
          <div className="panel-body">{leftPanel(left)}</div>
          <div
            className="panel-resize panel-resize--left"
            role="separator"
            aria-orientation="vertical"
            onPointerDown={(e) => {
              const start = layout.leftWidth;
              dragPointer(e, (dx) => setWidth("left", start + dx), "is-resizing-dock-x");
            }}
          />
        </aside>
      )}
      <main className="stage">
        <Canvas />
        {editing && <FieldWires />}
        {editing && (
          <div className="canvas-zoom">
            <ZoomControl />
          </div>
        )}
      </main>
      {editing && (
        <aside className="panel panel--right">
          <div className="panel-body">{clientLocked ? <ClientInspector /> : <Inspector />}</div>
          <div
            className="panel-resize panel-resize--right"
            role="separator"
            aria-orientation="vertical"
            onPointerDown={(e) => {
              const start = layout.rightWidth;
              dragPointer(e, (dx) => setWidth("right", start - dx), "is-resizing-dock-x");
            }}
          />
        </aside>
      )}
      {toolOpen && (
        <aside className={cls("panel panel--bottom focus-tool-panel", popped && "is-popped", focusTool && `focus-tool-panel--${focusTool}`)}>
          <button className="btn btn--small focus-popout" title={popped ? "Put it back under the page" : "Give it the whole window"} onClick={() => setFocusPopped(!popped)}>
            {popped ? "↙ Dock" : "↗ Pop out"}
          </button>
          <div
            className="panel-resize panel-resize--bottom"
            role="separator"
            aria-orientation="horizontal"
            onPointerDown={(e) => {
              const start = Math.max(260, layout.bottomHeight);
              dragPointer(e, (_dx, dy) => setBottomHeight(start - dy), "is-resizing-dock-y");
            }}
          />
          <div className="panel-body">
            {focusTool === "frames" ? (
              <FramesPanel />
            ) : focusTool === "code" ? (
              <CodePanel />
            ) : focusTool === "trim" || focusTool === "captions" ? (
              <MediaPanel mode={focusTool} />
            ) : focusTool === "draw" ? (
              <DrawPanel />
            ) : (
              <TimelinePanel />
            )}
          </div>
        </aside>
      )}
      {editing && layout.palette && !clientLocked && (!isolated || makingInPlace) && <Palette onClose={() => set({ palette: false })} onManage={() => setComponents(true)} />}
      {components && <ComponentsDialog onClose={() => setComponents(false)} />}
      {collectionId && <CollectionTool key={collectionId} collectionId={collectionId} startPost={startPost} onClose={() => setCollectionId(null)} />}
    </div>
    </>
  );
}

export function EditorShell() {
  return (
    <IssuesProvider>
      <EditorRenderProvider>
        <Workspace />
        <AskTextHost />
        <GuideHost />
        <ShortcutsHost />
        <DotHelper />
        <VersionKeeper />
        <TailwindSync />
        <VectorSync />
        <MediaSync />
      </EditorRenderProvider>
    </IssuesProvider>
  );
}
