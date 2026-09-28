import { useEffect, useRef, useState } from "react";

const OPEN_SHORTCUTS = "fayteworks:open-shortcuts";

export function openShortcuts() {
  window.dispatchEvent(new Event(OPEN_SHORTCUTS));
}

const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = mac ? "⌘" : "Ctrl";
const ALT = mac ? "⌥" : "Alt";

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Editor",
    rows: [
      [`${MOD} Z`, "Undo"],
      [`${MOD} Y  or  ${MOD} Shift Z`, "Redo"],
      [`${MOD} D`, "Duplicate the selected pieces"],
      [`${MOD} A`, "Select every piece in the section"],
      ["Delete", "Delete the selection"],
      ["Arrow keys", "Nudge the selected pieces"],
      ["Esc", "Leave a piece you're working inside, or clear the selection"],
      ["?", "This list"]
    ]
  },
  {
    title: "Canvas",
    rows: [
      [`${MOD} + / ${MOD} −`, "Zoom in and out"],
      [`${MOD} 0`, "Fit the page"],
      [`${MOD} 1`, "Actual size"],
      [`${MOD} + wheel, or pinch`, "Zoom"],
      ["Space + drag, or middle mouse", "Pan"]
    ]
  },
  {
    title: "Drawing tool: tools",
    rows: [
      ["V / A", "Select / Edit points"],
      ["P / Shift P", "Pen / Curvature pen"],
      ["N", "Pencil"],
      ["C / K / Shift E", "Scissors / Knife / Eraser"],
      ["M, L, Y, S, U", "Rectangle, Ellipse, Polygon, Star, More shapes"],
      ["\\ / Shift A / Shift S", "Line / Arc / Spiral"],
      ["T", "Text"],
      ["I / G", "Eyedropper / Gradient"],
      ["Shift B / Shift C", "Blob brush / Calligraphy pen"],
      ["Shift D / Shift M / Shift W", "Distort / Shape builder / Width"],
      ["H, or hold Space", "Hand"]
    ]
  },
  {
    title: "Drawing tool: commands",
    rows: [
      [`${MOD} D`, "Repeat the last move or copy (duplicates when there's nothing to repeat)"],
      [`${MOD} G / ${MOD} Shift G`, "Group / Ungroup"],
      [`${MOD} J`, "Join or close paths"],
      [`${MOD} 8 / ${MOD} Shift 8`, "Combine / Break apart"],
      [`${MOD} ${ALT} C / ${MOD} ${ALT} V`, "Copy style / Paste style"],
      [`${MOD} [  ${MOD} ]`, "Send backward / Bring forward (with Shift: to the back / front)"],
      [`${MOD} Y`, "Outline view"],
      [`${MOD} S`, "Save and keep drawing"],
      [`Hold ${ALT}`, "Measure distances to other shapes"],
      [`${ALT}-drag`, "Copy while moving"],
      ["Shift while drawing", "Keep proportions and angles"],
      ["Double-click a group", "Work inside it (Esc to leave)"]
    ]
  }
];

export function ShortcutsHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_SHORTCUTS, on);
    return () => window.removeEventListener(OPEN_SHORTCUTS, on);
  }, []);
  return open ? <ShortcutsDialog onClose={() => setOpen(false)} /> : null;
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="dialog shortcuts-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Keyboard shortcuts</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="shortcuts-groups">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="panel-heading">{g.title}</h3>
            <dl>
              {g.rows.map(([keys, what]) => (
                <div key={keys + what} className="shortcuts-row">
                  <dt>
                    <kbd>{keys}</kbd>
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
