import { useEffect, useRef, useState } from "react";
import { createDesignPage, DESIGN_PRESETS, type DesignPreset } from "../model/design";
import { useEditor } from "../state/store";

export function NewDesignDialog({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const { state, page, commit, setPage } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const [preset, setPreset] = useState<DesignPreset>(DESIGN_PRESETS[0]);
  const [title, setTitle] = useState("");
  const fromPage = page.design ? null : page;
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function create() {
    const from = fromPage ? fromPage.sections.filter((s) => picked.includes(s.id)) : [];
    const design = createDesignPage(state.site, preset, title.trim() || preset.label.split(" · ")[0], from);
    commit((draft) => {
      draft.pages.push(design);
    });
    setPage(design.id);
    onCreated?.();
    onClose();
  }

  const groups = ["Print", "Social"] as const;
  return (
    <dialog ref={ref} className="dialog new-design-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>New design</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <p className="dialog-lead">Flyers, posters, pamphlets, cards and social images, in your site's theme. They export as PDF or images and are never part of the website.</p>
      {groups.map((group) => (
        <section key={group} className="new-design-group">
          <h3 className="panel-heading">{group}</h3>
          <div className="new-design-presets">
            {DESIGN_PRESETS.filter((p) => p.group === group).map((p) => {
              const ratio = p.width / p.height;
              return (
                <button key={p.id} className={p.id === preset.id ? "new-design-preset is-active" : "new-design-preset"} onClick={() => setPreset(p)}>
                  <span className="new-design-shape" style={{ width: ratio >= 1 ? 44 : 44 * ratio, height: ratio >= 1 ? 44 / ratio : 44 }}>
                    {Array.from({ length: p.folds }, (_, i) => (
                      <span key={i} className="new-design-fold" style={{ left: `${((i + 1) / (p.folds + 1)) * 100}%` }} />
                    ))}
                  </span>
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <label className="field">
        <span className="field-label">Name</span>
        <input type="text" value={title} placeholder={preset.label.split(" · ")[0]} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {fromPage && fromPage.sections.length > 0 && (
        <fieldset className="new-design-from">
          <legend className="field-label">Start from sections of “{fromPage.title}” (optional)</legend>
          {fromPage.sections.map((s) => (
            <label key={s.id} className="catalogue-check">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))} />
              {s.name}
            </label>
          ))}
          <span className="field-hint">Their blocks go onto the first sheet, top to bottom, ready to rearrange.</span>
        </fieldset>
      )}
      <div className="field-row">
        <button className="btn btn--primary" onClick={create}>
          Create {preset.label.split(" · ")[0].toLowerCase()}
        </button>
      </div>
    </dialog>
  );
}
