import { pageTheme } from "../model/styles";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { DESIGN_PRESETS, describeSize, SHEET_WIDTH } from "../model/design";
import { createFooterSection, createHeaderSection } from "../model/factory";
import { pageSectionsWithShared } from "../model/ops";
import { themeVars } from "../model/theme";
import { initSite } from "../site/runtime";
import { PageRenderer } from "../site/SiteRenderer";
import { TIER_LABEL } from "../model/responsive";
import { cardLayouts } from "../model/extras";
import { isCardShell, SHELL_OPTIONS, shellOf } from "../model/shells";
import { flushSync } from "react-dom";
import { editorTier, useEditor } from "../state/store";
import { getDevice, viewportSize } from "../state/viewport";
import { useIssues } from "./issues";
import { scanLayout } from "./layoutCheck";
import { AddSectionButton, SectionEditor } from "./SectionEditor";
import { MakerBar, MakerStage } from "./ComponentMaker";
import { findComponent } from "../model/components";
import { cls } from "../util/cls";

const CANVAS_PADDING = 56;

function SharedSectionButton({ kind }: { kind: "header" | "footer" }) {
  const { state, commit, select } = useEditor();
  return (
    <div className={`editor-add-section editor-add-section--${kind}`}>
      <button
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          const section = kind === "header" ? createHeaderSection(state.site.name) : createFooterSection(state.site.name);
          commit((draft) => {
            draft[kind] = section;
          });
          select({ kind: "section", sectionId: section.id });
        }}
      >
        + Add shared {kind}
      </button>
    </div>
  );
}

function useAvailableWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current?.closest<HTMLElement>(".stage") ?? ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth - CANVAS_PADDING);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function Canvas() {
  const { state, page, select, setPage, setCanvasWidth, setZoom, focusBlock } = useEditor();
  const { site } = state;
  const editing = state.mode === "edit";
  const canvasRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const siteRootRef = useRef<HTMLDivElement>(null);
  const { setScanned } = useIssues();
  const [measureTick, setMeasureTick] = useState(0);
  const tier = editorTier(state);
  const making = editing ? findComponent(site.components, state.componentId) : undefined;
  const makingInPlace = Boolean(making && state.componentAnchor && page.sections.some((s) => s.id === state.componentAnchor!.sectionId));
  const scanning = editing && !making;

  const design = page.design;
  const deviceSize = design ? null : viewportSize(state.deviceId, state.landscape, state.customSize);
  const available = useAvailableWidth(canvasRef);
  const frozenWidth = useRef(0);
  if (!deviceSize && state.zoom === "fit") frozenWidth.current = state.canvasWidth || available;
  const size = design
    ? { width: SHEET_WIDTH, height: 0 }
    : (deviceSize ?? (state.zoom === "fit" ? null : { width: frozenWidth.current || available || 1200, height: 0 }));
  const fitScale = design && available > 0 ? Math.min(1, available / SHEET_WIDTH) : deviceSize && available > 0 ? Math.min(1, available / deviceSize.width) : 1;
  const scale = state.zoom === "fit" ? fitScale : state.zoom;
  const zoomed = size !== null && size.height === 0;
  const [contentHeight, setContentHeight] = useState(0);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!zoomed || !frame) return;
    const measure = () => setContentHeight(frame.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    if (frame.firstElementChild) observer.observe(frame.firstElementChild);
    return () => observer.disconnect();
  }, [zoomed]);

  const anchor = useRef<{ fx: number; fy: number; clientX: number; clientY: number } | null>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const zoomTo = useRef((next: number, clientX?: number, clientY?: number) => {});
  zoomTo.current = (next: number, clientX?: number, clientY?: number) => {
    const frame = frameRef.current;
    const stage = canvasRef.current?.closest<HTMLElement>(".stage");
    if (frame && stage) {
      const r = frame.getBoundingClientRect();
      const box = stage.getBoundingClientRect();
      const x = clientX ?? box.left + box.width / 2;
      const y = clientY ?? box.top + box.height / 2;
      anchor.current = { fx: (x - r.left) / scaleRef.current, fy: (y - r.top) / scaleRef.current, clientX: x, clientY: y };
    }
    setZoom(Math.round(Math.min(4, Math.max(0.1, next)) * 1000) / 1000);
  };
  useLayoutEffect(() => {
    const a = anchor.current;
    const frame = frameRef.current;
    const stage = canvasRef.current?.closest<HTMLElement>(".stage");
    if (!a || !frame || !stage) return;
    anchor.current = null;
    const r = frame.getBoundingClientRect();
    stage.scrollLeft += r.left - (a.clientX - a.fx * scale);
    stage.scrollTop += r.top - (a.clientY - a.fy * scale);
  }, [scale]);
  useEffect(() => {
    const stage = canvasRef.current?.closest<HTMLElement>(".stage");
    if (!stage) return;
    let space = false;
    let pan: { x: number; y: number; left: number; top: number; id: number } | null = null;
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo.current(scaleRef.current * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.code === "Space" && !e.repeat) {
        space = true;
        stage.classList.add("is-pan-ready");
        e.preventDefault();
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "=" || e.key === "+") zoomTo.current(nextZoomStep(scaleRef.current, 1));
        else if (e.key === "-") zoomTo.current(nextZoomStep(scaleRef.current, -1));
        else if (e.key === "0") setZoom("fit");
        else if (e.key === "1") zoomTo.current(1);
        else return;
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        space = false;
        stage.classList.remove("is-pan-ready");
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!(e.button === 1 || (e.button === 0 && space))) return;
      e.preventDefault();
      e.stopPropagation();
      pan = { x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop, id: e.pointerId };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add("is-panning");
    };
    const onMove = (e: PointerEvent) => {
      if (!pan) return;
      stage.scrollLeft = pan.left - (e.clientX - pan.x);
      stage.scrollTop = pan.top - (e.clientY - pan.y);
    };
    const onUp = () => {
      if (!pan) return;
      if (stage.hasPointerCapture(pan.id)) stage.releasePointerCapture(pan.id);
      pan = null;
      stage.classList.remove("is-panning");
    };
    const onRequest = (e: Event) => {
      const r = (e as CustomEvent<CanvasZoomRequest>).detail;
      if (r.to === "fit") setZoom("fit");
      else if (r.to !== undefined) zoomTo.current(r.to);
      else if (r.step) zoomTo.current(nextZoomStep(scaleRef.current, r.step));
    };
    window.addEventListener(CANVAS_ZOOM_EVENT, onRequest);
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("pointerdown", onDown, true);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("pointerdown", onDown, true);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener(CANVAS_ZOOM_EVENT, onRequest);
      stage.classList.remove("is-pan-ready", "is-panning");
    };
  }, [setZoom]);

  useEffect(() => {
    setScanned(scanning && frameRef.current ? scanLayout(frameRef.current, site, page, tier) : []);
    if (frameRef.current) setCanvasWidth(frameRef.current.offsetWidth);
  });
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const bump = () => setMeasureTick((t) => t + 1);
    const observer = new ResizeObserver(bump);
    observer.observe(frame);
    void document.fonts.ready.then(bump);
    return () => observer.disconnect();
  }, [state.deviceId, state.landscape]);
  void measureTick;

  useEffect(() => {
    if (editing || !siteRootRef.current) return;
    const stop = initSite(siteRootRef.current);
    const stopCards = cardLayouts?.runtime(siteRootRef.current);
    return () => {
      stopCards?.();
      stop();
    };
  }, [editing, site, page]);

  function handlePreviewClick(event: MouseEvent) {
    const anchor = (event.target as Element).closest("a");
    if (!anchor || event.defaultPrevented) return;
    event.preventDefault();
    const pageId = anchor.getAttribute("data-page-id");
    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("#") && href.length > 1) {
      siteRootRef.current?.querySelector(`#${CSS.escape(href.slice(1))}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (pageId && site.pages.some((p) => p.id === pageId)) {
      const go = () => {
        const focus = anchor.getAttribute("data-focus-card");
        if (focus && siteRootRef.current) siteRootRef.current.dataset.focusCard = focus;
        flushSync(() => setPage(pageId));
        frameRef.current?.scrollTo({ top: 0 });
        document.querySelector(".stage")?.scrollTo({ top: 0 });
      };
      const startViewTransition = (document as Document & { startViewTransition?: (fn: () => void) => unknown }).startViewTransition;
      if (startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) startViewTransition.call(document, go);
      else go();
    } else if (href && href !== "#") {
      window.open(href, "_blank", "noopener");
    }
  }

  const sections = pageSectionsWithShared(site, page);
  const pageSections = sections.filter((s) => s.role === "page");

  const shell = shellOf(page);
  const cardShell = Boolean(cardLayouts) && isCardShell(shell.type);
  const { intro, cards } = cardLayouts && cardShell ? cardLayouts.split(shell, page.sections) : { intro: null, cards: [] as typeof page.sections };
  const [focusByPage, setFocusByPage] = useState<Record<string, string>>({});
  const storedFocus = focusByPage[page.id];
  const focusId = !cardShell
    ? "all"
    : storedFocus === "all" || page.sections.some((s) => s.id === storedFocus)
      ? storedFocus
      : (cards[0] ?? intro)?.id ?? "all";
  const setFocus = (id: string) => setFocusByPage((f) => ({ ...f, [page.id]: id }));
  const selectedSectionId = state.selection.kind === "none" ? null : state.selection.sectionId;
  useEffect(() => {
    if (cardShell && focusId !== "all" && selectedSectionId && selectedSectionId !== focusId && page.sections.some((s) => s.id === selectedSectionId)) {
      setFocus(selectedSectionId);
    }
  }, [selectedSectionId]);
  const shownSections = focusId === "all" ? sections : sections.filter((s) => s.role !== "page" || s.section.id === focusId);
  const lastShownPage = [...shownSections].reverse().find((s) => s.role === "page")?.section;
  const numbers = shell.numbers !== false;

  const siteRoot = (
    <div
      ref={siteRootRef}
      className={["site-root", editing && state.freeform && "site-root--freeform", design && "site-root--design"].filter(Boolean).join(" ")}
      data-orientation={deviceSize ? (deviceSize.width > deviceSize.height ? "landscape" : "portrait") : undefined}
      style={{
        ...themeVars(pageTheme(site, page)),
        ...(editing ? {} : { "--shell-vh": deviceSize ? `${deviceSize.height}px` : "calc(100vh - 88px)" })
      } as CSSProperties}
      onClick={editing ? undefined : handlePreviewClick}
      onSubmitCapture={(event) => {
        event.preventDefault();
        if (!editing) window.alert("Forms send messages from the published site. In the editor they are just a preview.");
      }}
    >
      {editing && making && !makingInPlace ? (
        <MakerStage def={making} screenWidth={size?.width ?? (state.canvasWidth || 1440)} />
      ) : editing ? (
        <>
          {shell.type !== "scroll" && (
            <div className="editor-shell-note" onPointerDown={(e) => e.stopPropagation()}>
              <strong>{[...SHELL_OPTIONS, ...(cardLayouts?.options ?? [])].find((o) => o.value === shell.type)?.label}</strong>:{" "}
              {cardShell
                ? "each section is a card with its own page. Pick the card to edit; press Preview to try it."
                : "this page presents its sections differently. You edit them here as usual; press Preview to try the layout."}
              {cardShell && page.sections.length > 0 && (
                <div className="editor-card-tabs" role="tablist" aria-label="Cards on this page">
                  {intro && (
                    <button role="tab" aria-selected={focusId === intro.id} className={focusId === intro.id ? "is-active" : undefined} onClick={() => setFocus(intro.id)}>
                      Intro
                    </button>
                  )}
                  {cards.map((section, i) => (
                    <button
                      key={section.id}
                      role="tab"
                      aria-selected={focusId === section.id}
                      className={focusId === section.id ? "is-active" : undefined}
                      onClick={() => {
                        setFocus(section.id);
                        select({ kind: "section", sectionId: section.id });
                      }}
                    >
                      {cardLayouts?.cardTitle(section, i, numbers)}
                      {section.card?.link ? " ↗" : ""}
                    </button>
                  ))}
                  <button role="tab" aria-selected={focusId === "all"} className={focusId === "all" ? "is-active" : undefined} onClick={() => setFocus("all")}>
                    All
                  </button>
                </div>
              )}
            </div>
          )}
          {!site.header && !design && <SharedSectionButton kind="header" />}
          {shownSections.map(({ section, role }) => {
            const cardIndex = cards.indexOf(section);
            const besideCard = cardLayouts && cardShell && focusId === section.id && cardIndex >= 0 && !section.card?.link;
            const editor = (
              <SectionEditor
                section={section}
                role={role}
                index={role === "page" ? page.sections.indexOf(section) : 0}
                total={pageSections.length}
              />
            );
            return (
              <Fragment key={section.id}>
                {besideCard && cardLayouts ? (
                  <cardLayouts.CardAside page={page} section={section} index={cardIndex}>
                    {editor}
                  </cardLayouts.CardAside>
                ) : (
                  editor
                )}
                {role === "page" && section === lastShownPage && (
                  <AddSectionButton index={page.sections.indexOf(section) + 1} />
                )}
              </Fragment>
            );
          })}
          {pageSections.length === 0 && <AddSectionButton index={0} />}
          {!site.footer && !design && <SharedSectionButton kind="footer" />}
        </>
      ) : (
        <PageRenderer site={site} page={page} />
      )}
    </div>
  );

  return (
    <div
      ref={canvasRef}
      className={cls(size ? "editor-canvas editor-canvas--sized" : "editor-canvas", state.focusedBlock && "is-block-focus")}
      onPointerDownCapture={(event) => {
        if (!state.focusedBlock) return;
        const target = event.target as HTMLElement;
        if (target.closest(".is-focus-target, .focus-bar, .inline-toolbar")) return;
        event.stopPropagation();
        event.preventDefault();
        focusBlock(null);
      }}
      onPointerDown={() => editing && select({ kind: "none" })}
    >
      {making && !makingInPlace && <MakerBar def={making} />}
      {size ? (
        <>
          <div className="editor-device-label">
            {design
              ? `${DESIGN_PRESETS.find((p) => p.id === design.preset)?.label.split(" · ")[0] ?? "Design"} · ${describeSize(design)}${design.bleed ? ` + ${design.bleed} ${design.unit} bleed` : ""}`
              : deviceSize
                ? `${getDevice(state.deviceId, state.customSize).label} · ${size.width} × ${size.height}`
                : `Fit to window · ${size.width} wide`}
            {Math.round(scale * 100) !== 100 && ` · shown at ${Math.round(scale * 100)}%`}
            {!design && (
              <>
                {" · "}
                <strong>{TIER_LABEL[tier]} layout</strong>
              </>
            )}
          </div>
          <div className="editor-device" style={{ width: size.width * scale, height: (zoomed ? contentHeight : size.height) * scale }}>
            <div
              ref={frameRef}
              className={zoomed ? "editor-frame editor-frame--zoomed" : "editor-frame editor-frame--device"}
              style={{ width: size.width, height: zoomed ? undefined : size.height, transform: scale !== 1 ? `scale(${scale})` : undefined, ["--canvas-inverse" as string]: scale ? 1 / scale : 1 }}
            >
              {siteRoot}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="editor-device-label">
            Fit to window · {state.canvasWidth || "…"} wide · <strong>{TIER_LABEL[tier]} layout</strong>
          </div>
          <div ref={frameRef} className="editor-frame">
            {siteRoot}
          </div>
        </>
      )}
    </div>
  );
}

const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4];

export function nextZoomStep(current: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((z) => z > current + 0.001) ?? 4;
  return [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001) ?? 0.1;
}

export const CANVAS_ZOOM_EVENT = "fayteworks:canvas-zoom";
export type CanvasZoomRequest = { step?: 1 | -1; to?: number | "fit" };
