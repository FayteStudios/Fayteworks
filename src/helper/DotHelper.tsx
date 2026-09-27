import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";

const HIDDEN_KEY = "fayteworks:dot";
const SEEN_KEY = "fayteworks:dot-seen";
export const DOT_TOGGLE = "fayteworks:dot-toggle";

const TIPS: Record<string, string[]> = {
  editor: [
    "Drag pieces from Add onto the page. They snap to the grid.",
    "Double-click a piece to work on it on its own.",
    "Ctrl+Z undoes anything, so go ahead and try things.",
    "Check, on the left, finds little problems before you publish.",
    "Tablet and Phone at the top show how the page fits smaller screens."
  ],
  preview: ["This is what visitors see. Links take you between pages.", "Back to editor is at the top right when you're done looking."],
  focus: ["You're working on one piece. Settings, Animate and Frames are at the top.", "Done takes you back to the whole page."],
  scene: ["Changes save as you go. Done closes this screen."],
  design: ["Designs are flyers and posts, not website pages. Size and export is at the top."]
};

const MOMENTS = {
  hello: "Hi! I'm Dot. I'll pop up with the odd tip. Click me any time, or tuck me away.",
  firstBlock: "Nice! Drag it to move it, or pull a corner to resize it.",
  firstPreview: "Looking good! This is how your visitors will see it.",
  firstExport: "Almost there. Check before publishing catches the little things.",
  emptyPage: "A blank page is the hardest part. Try Add, then Text, to get going."
};

type Moment = keyof typeof MOMENTS;

const readSeen = (): Moment[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as Moment[];
  } catch {
    return [];
  }
};

export const dotHidden = () => localStorage.getItem(HIDDEN_KEY) === "off";

export function setDotHidden(hidden: boolean) {
  if (hidden) localStorage.setItem(HIDDEN_KEY, "off");
  else localStorage.removeItem(HIDDEN_KEY);
  window.dispatchEvent(new Event(DOT_TOGGLE));
}

export function DotHelper() {
  const { state, page } = useEditor();
  const [hidden, setHidden] = useState(dotHidden);
  const [line, setLine] = useState("");
  const [mood, setMood] = useState<"idle" | "talk" | "hop">("idle");
  const tipIndex = useRef<Record<string, number>>({});
  const timer = useRef(0);
  const seen = useRef<Moment[]>(readSeen());

  const say = useCallback((text: string, ms = 6500) => {
    window.clearTimeout(timer.current);
    setLine(text);
    setMood("talk");
    timer.current = window.setTimeout(() => {
      setLine("");
      setMood("idle");
    }, ms);
  }, []);

  const moment = useCallback(
    (m: Moment) => {
      if (seen.current.includes(m) || dotHidden()) return;
      seen.current = [...seen.current, m];
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen.current));
      say(MOMENTS[m]);
    },
    [say]
  );

  useEffect(() => {
    const toggle = () => setHidden(dotHidden());
    window.addEventListener(DOT_TOGGLE, toggle);
    return () => window.removeEventListener(DOT_TOGGLE, toggle);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => moment("hello"), 1500);
    return () => window.clearTimeout(t);
  }, [moment]);

  const blockCount = state.site.pages.reduce((sum, p) => sum + p.sections.reduce((n, s) => n + s.blocks.length, 0), 0);
  const lastCount = useRef(blockCount);
  useEffect(() => {
    if (blockCount > lastCount.current) moment("firstBlock");
    lastCount.current = blockCount;
  }, [blockCount, moment]);

  useEffect(() => {
    if (state.mode === "preview") moment("firstPreview");
  }, [state.mode, moment]);

  const pageEmpty = page.sections.every((s) => s.blocks.length === 0);
  useEffect(() => {
    if (!pageEmpty || state.mode !== "edit") return;
    const t = window.setTimeout(() => moment("emptyPage"), 60000);
    return () => window.clearTimeout(t);
  }, [pageEmpty, state.mode, moment]);

  useEffect(() => {
    const check = window.setInterval(() => {
      const open = document.querySelector("dialog[open] .prepublish-banner, dialog[open] .publish");
      if (open) moment("firstExport");
    }, 2000);
    return () => window.clearInterval(check);
  }, [moment]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const bodyRef = useRef<HTMLButtonElement>(null);
  const [spot, setSpot] = useState<{ left: number; bottom: number } | null>(null);
  useLayoutEffect(() => {
    if (!line || !bodyRef.current) return;
    const r = bodyRef.current.getBoundingClientRect();
    setSpot({ left: r.right + 12, bottom: window.innerHeight - r.bottom + 4 });
  }, [line]);

  const [slot, setSlot] = useState<Element | null>(null);
  useEffect(() => {
    const find = () => setSlot(document.querySelector(".rail-dot-slot"));
    find();
    const t = window.setTimeout(find, 50);
    return () => window.clearTimeout(t);
  }, [state.mode, state.focusedBlock]);

  if (hidden) return null;

  const context = document.querySelector(".scene") ? "scene" : state.mode === "preview" ? "preview" : state.focusedBlock ? "focus" : page.design ? "design" : "editor";
  const tip = () => {
    const list = TIPS[context];
    const i = tipIndex.current[context] ?? 0;
    tipIndex.current[context] = (i + 1) % list.length;
    say(list[i]);
    setMood("hop");
  };

  const ui = (
    <div className={cls("dot-helper", `is-${mood}`, !slot && "is-floating")}>
      {line &&
        spot &&
        createPortal(
          <p className="dot-helper-say" role="status" aria-live="polite" style={{ left: spot.left, bottom: spot.bottom }}>
            {line}
          </p>,
          document.body
        )}
      <button ref={bodyRef} type="button" className="dot-helper-body" aria-label="Dot, your helper. Click for a tip." onClick={tip}>
        <span className="dot-helper-eye" />
        <span className="dot-helper-eye" />
      </button>
      <button
        type="button"
        className="dot-helper-hide"
        aria-label="Hide Dot"
        title="Hide Dot (bring her back from Guides)"
        onClick={() => {
          setLine("");
          setDotHidden(true);
        }}
      >
        ×
      </button>
    </div>
  );
  if (!slot && !line) return null;
  return slot ? createPortal(ui, slot) : ui;
}
