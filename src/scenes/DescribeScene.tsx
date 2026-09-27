import { useMemo, useState } from "react";
import { findSection } from "../model/ops";
import type { ListItem, Site } from "../model/types";
import { lastUpload, pictures, suggestFromName, type PictureRef } from "../quality/altText";
import { assetUrl, useAssetVersion } from "../state/assets";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";

const done = (p: PictureRef) => p.decorative || Boolean(p.alt.trim());

function pictureSrc(p: PictureRef): string {
  return p.src ? assetUrl(p.src) : p.drawing ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.drawing)}` : "";
}

function ideas(site: Site, p: PictureRef): string[] {
  const section = findSection(site, p.pageId, p.sectionId);
  const block = section?.blocks.find((b) => b.id === p.blockId);
  const plain = (v: unknown) => String(v ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const out = [
    block?.type === "card" ? plain(block.props.title) : "",
    p.listKey && p.index !== undefined ? plain(((block?.props[p.listKey] as ListItem[]) ?? [])[p.index]?.caption ?? ((block?.props[p.listKey] as ListItem[]) ?? [])[p.index]?.title) : "",
    Date.now() - lastUpload.at < 120_000 ? lastUpload.suggestion || suggestFromName(lastUpload.name) : ""
  ];
  return [...new Set(out.filter((s) => s.length > 2 && s.length < 120))].slice(0, 3);
}

export function DescribeScene({ focus, onDone }: { focus?: string; onDone: () => void }) {
  const { state, commit } = useEditor();
  useAssetVersion();
  const all = useMemo(() => pictures(state.site), [state.site]);
  const [onlyLeft, setOnlyLeft] = useState(!focus);
  const [order] = useState(() => {
    const list = pictures(state.site);
    const left = list.filter((p) => !done(p) || p.blockId === focus).map((p) => p.key);
    return { left, all: list.map((p) => p.key) };
  });
  const keys = onlyLeft ? order.left : order.all;
  const rows = keys.map((k) => all.find((p) => p.key === k)).filter((p): p is PictureRef => Boolean(p));
  const [index, setIndex] = useState(() => Math.max(0, rows.findIndex((p) => p.blockId === focus)));
  const current = rows[Math.min(index, rows.length - 1)];
  const remaining = all.filter((p) => !done(p)).length;

  function set(p: PictureRef, patch: { alt?: string; decorative?: boolean }) {
    commit((d) => {
      const b = findSection(d, p.pageId, p.sectionId)?.blocks.find((x) => x.id === p.blockId);
      if (!b) return;
      if (p.listKey !== undefined && p.index !== undefined) {
        const items = b.props[p.listKey] as ListItem[];
        if (items?.[p.index]) items[p.index] = { ...items[p.index], alt: patch.alt ?? items[p.index].alt ?? "" };
        return;
      }
      if (patch.alt !== undefined) b.props.alt = patch.alt;
      if (patch.decorative !== undefined) {
        if (patch.decorative) b.props.decorative = true;
        else delete b.props.decorative;
      }
    }, `alt:${p.key}`);
  }

  if (!current) {
    return (
      <div className="describe-empty">
        <h2>{all.length ? "Every picture has a description." : "There are no pictures on this site yet."}</h2>
        <p className="scene-note">{all.length ? "People who can't see them will hear what's in them, and search engines understand them better too." : "When you add some, this is where you describe them."}</p>
        {all.length > 0 && onlyLeft && (
          <button className="btn" onClick={() => (setOnlyLeft(false), setIndex(0))}>
            Look through all {all.length} pictures
          </button>
        )}
        <button className="btn btn--primary" onClick={onDone}>
          Done
        </button>
      </div>
    );
  }

  const position = rows.indexOf(current);
  const src = pictureSrc(current);
  const suggestions = ideas(state.site, current);
  const isLast = position === rows.length - 1;

  return (
    <div className="describe-layout">
      <nav className="describe-strip" aria-label="Pictures">
        <div className="describe-progress">
          <strong>{remaining ? `${remaining} still to describe` : "All described"}</strong>
          <label className="scene-check">
            <input type="checkbox" checked={!onlyLeft} onChange={(e) => (setOnlyLeft(!e.target.checked), setIndex(0))} />
            Show all pictures
          </label>
        </div>
        {rows.map((p, i) => (
          <button key={p.key} className={cls("describe-thumb", p === current && "is-current")} aria-current={p === current ? "true" : undefined} onClick={() => setIndex(i)}>
            <span className="describe-thumb-img">{pictureSrc(p) && <img src={pictureSrc(p)} alt="" />}</span>
            <span>
              <strong>{p.where.split(" › ")[0]}</strong>
              <small className={cls(done(p) && "is-done")}>{p === current ? "Describing now" : p.decorative ? "Decoration" : p.alt.trim() ? "Described" : "Still to do"}</small>
            </span>
          </button>
        ))}
      </nav>

      <section className="describe-picture-view" aria-label="The picture">
        <div className="describe-frame">{src ? <img src={src} alt="" /> : <span className="scene-note">No preview</span>}</div>
        <span className="scene-note">
          {current.where.replace(" › ", ", ")} · picture {position + 1} of {rows.length}
        </span>
      </section>

      <section className="describe-card" aria-label="Describe it">
        <h2>What's in this picture?</h2>
        <p>Say it the way you'd describe it to a friend on the phone. One sentence is plenty.</p>
        <label className="scene-field">
          <span>Your description</span>
          <textarea
            key={current.key}
            rows={3}
            autoFocus
            value={current.alt}
            disabled={current.decorative}
            placeholder={current.decorative ? "Marked as decoration: screen readers skip it." : "Two friends laughing over coffee at a sunny window table."}
            onChange={(e) => set(current, { alt: e.target.value })}
          />
        </label>
        {suggestions.length > 0 && !current.decorative && (
          <div className="describe-ideas">
            <span className="scene-note">Ideas to start from</span>
            <div>
              {suggestions.map((s) => (
                <button key={s} className="idea-chip" onClick={() => set(current, { alt: s })}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {current.listKey === undefined && (
          <button className={cls("describe-decor", current.decorative && "is-active")} aria-pressed={current.decorative} onClick={() => set(current, { decorative: !current.decorative })}>
            <strong>{current.decorative ? "Marked as decoration" : "It's only decoration"}</strong>
            <small>{current.decorative ? "Screen readers skip it. Press again to describe it after all." : "Screen readers will skip it. Right for patterns and background shapes."}</small>
          </button>
        )}
        <div className="describe-actions">
          <button className="btn" disabled={position === 0} onClick={() => setIndex(position - 1)}>
            Back
          </button>
          <button className="btn btn--primary" onClick={() => (isLast ? onDone() : setIndex(position + 1))}>
            {isLast ? "Save and finish" : "Save, next picture"}
          </button>
        </div>
        <p className="scene-note">People who can't see the picture hear this instead. Search engines read it too.</p>
      </section>
    </div>
  );
}
