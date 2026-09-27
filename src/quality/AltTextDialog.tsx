import { useEffect, useMemo, useRef, useState } from "react";
import { findSection } from "../model/ops";
import type { ListItem } from "../model/types";
import { assetUrl, useAssetVersion } from "../state/assets";
import { useEditor } from "../state/store";
import { pictures, type PictureRef } from "./altText";

export const OPEN_ALT = "fayteworks:open-alt";
export const openAltText = (blockId?: string) => window.dispatchEvent(new CustomEvent(OPEN_ALT, { detail: blockId ?? "" }));

export function AltTextDialog({ focus, onClose }: { focus: string; onClose: () => void }) {
  const { state, commit } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const [onlyMissing, setOnlyMissing] = useState(!focus);
  useAssetVersion();
  useEffect(() => ref.current?.showModal(), []);
  useEffect(() => {
    if (focus) setTimeout(() => document.querySelector<HTMLInputElement>(`.alt-row[data-block="${focus}"] input[type=text]`)?.focus(), 50);
  }, [focus]);
  const all = useMemo(() => pictures(state.site), [state.site]);
  const [shownKeys, setShownKeys] = useState<Set<string>>(() => new Set(all.filter((p) => !onlyMissing || (!p.alt.trim() && !p.decorative)).map((p) => p.key)));
  useEffect(() => setShownKeys(new Set(all.filter((p) => !onlyMissing || (!p.alt.trim() && !p.decorative)).map((p) => p.key))), [onlyMissing]);
  const rows = all.filter((p) => shownKeys.has(p.key) || p.blockId === focus);
  const missing = all.filter((p) => !p.alt.trim() && !p.decorative).length;

  function set(p: PictureRef, patch: { alt?: string; decorative?: boolean }) {
    commit((d) => {
      const b = findSection(d, p.pageId, p.sectionId)?.blocks.find((x) => x.id === p.blockId);
      if (!b) return;
      if (p.listKey !== undefined && p.index !== undefined) {
        const items = b.props[p.listKey] as ListItem[];
        if (items?.[p.index]) items[p.index] = { ...items[p.index], alt: patch.alt ?? items[p.index].alt ?? "" };
      } else {
        if (patch.alt !== undefined) b.props.alt = patch.alt;
        if (patch.decorative !== undefined) {
          if (patch.decorative) b.props.decorative = true;
          else delete b.props.decorative;
        }
      }
    }, `alt:${p.key}`);
  }

  return (
    <dialog ref={ref} className="dialog alt-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Picture descriptions</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <p className="dialog-lead">
        A description (alt text) is read aloud to people who can't see the picture, and helps search engines. Say what matters in it, briefly: “Our
        barista pouring a flat white”, not “image1.jpg”. Pictures that are only decoration can be marked as such.
      </p>
      <div className="alt-toolbar">
        <strong>{missing ? `${missing} of ${all.length} still need a description` : `✓ All ${all.length} pictures are described`}</strong>
        <label>
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Only show the ones that need one
        </label>
      </div>
      <ul className="alt-list">
        {rows.map((p) => {
          const src = p.src ? assetUrl(p.src) : p.drawing ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.drawing)}` : "";
          return (
            <li key={p.key} className="alt-row" data-block={p.blockId}>
              <div className="alt-thumb">{src && <img src={src} alt="" />}</div>
              <div className="alt-fields">
                <span className="alt-where">{p.where}</span>
                <input type="text" value={p.alt} disabled={p.decorative} placeholder={p.decorative ? "Decoration: screen readers skip it" : "Describe what's in the picture"} onChange={(e) => set(p, { alt: e.target.value })} />
                {p.listKey === undefined && (
                  <label className="alt-decor">
                    <input type="checkbox" checked={p.decorative} onChange={(e) => set(p, { decorative: e.target.checked })} /> Decoration only
                  </label>
                )}
              </div>
            </li>
          );
        })}
        {!rows.length && <li className="alt-none">Nothing to describe here.</li>}
      </ul>
    </dialog>
  );
}
