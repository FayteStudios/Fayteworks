import { useEffect, useRef, useState } from "react";
import { openDocument } from "../business/DocumentDialog";
import { Icon } from "../editor/icons";
import { createDesignPage, DESIGN_PRESETS, describeSize, type DesignPreset } from "../model/design";
import type { DesignFormat, Page } from "../model/types";
import { useEditor } from "../state/store";
import { designThumbnail } from "./exportDesign";
import { closeDesignHome } from "./home";
import { NewDesignDialog } from "./NewDesignDialog";

type Design = Page & { design: DesignFormat };

function Thumb({ design }: { design: Design }) {
  const { state } = useEditor();
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      designThumbnail(state.site, design).then(
        (url) => live && setSrc(url),
        () => live && setFailed(true)
      );
    }, 60);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [state.site, design]);
  const ratio = design.design.width / design.design.height;
  return (
    <span className="designs-home-thumb" style={{ aspectRatio: String(ratio) }}>
      {src ? <img src={src} alt="" /> : <span className="designs-home-thumb-wait">{failed ? "No preview" : ""}</span>}
    </span>
  );
}

function Shape({ preset }: { preset: DesignPreset }) {
  const ratio = preset.width / preset.height;
  return (
    <span className="new-design-shape" style={{ width: ratio >= 1 ? 44 : 44 * ratio, height: ratio >= 1 ? 44 / ratio : 44 }}>
      {Array.from({ length: preset.folds }, (_, i) => (
        <span key={i} className="new-design-fold" style={{ left: `${((i + 1) / (preset.folds + 1)) * 100}%` }} />
      ))}
    </span>
  );
}

export function DesignsHome() {
  const { state, page, commit, setPage } = useEditor();
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const [filter, setFilter] = useState("");
  const designs = state.site.pages.filter((p): p is Design => Boolean(p.design));
  const shown = filter.trim() ? designs.filter((d) => d.title.toLowerCase().includes(filter.trim().toLowerCase())) : designs;

  useEffect(() => {
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && !more && closeDesignHome();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [more]);

  function openDesign(id: string) {
    setPage(id);
    closeDesignHome();
  }

  function create(preset: DesignPreset) {
    const design = createDesignPage(state.site, preset, preset.label.split(" · ")[0], []);
    commit((draft) => {
      draft.pages.push(design);
    });
    openDesign(design.id);
  }

  function remove(d: Design) {
    if (!window.confirm(`Delete “${d.title}”? You can undo this.`)) return;
    if (page.id === d.id) setPage(state.site.pages.find((p) => !p.design)?.id ?? state.site.pages[0].id);
    commit((draft) => void (draft.pages = draft.pages.filter((p) => p.id !== d.id)));
  }

  return (
    <div className="designs-home" role="dialog" aria-label="Designs" tabIndex={-1} ref={ref}>
      <header className="designs-home-head">
        <div>
          <h1>Designs</h1>
          <p>Flyers, cards, posters, stickers, social images and drawings, in your site's look. They export as pictures or PDFs and are never part of the website.</p>
        </div>
        <button className="btn" onClick={closeDesignHome}>
          {page.design ? "Back to the design" : "Back to the website"}
        </button>
      </header>

      <section className="designs-home-section">
        <div className="designs-home-row">
          <h2>Your designs</h2>
          {designs.length > 6 && <input className="designs-home-filter" type="search" placeholder="Find a design" value={filter} onChange={(e) => setFilter(e.target.value)} />}
        </div>
        {designs.length === 0 ? (
          <p className="panel-hint">Nothing yet. Pick a size below to start your first one.</p>
        ) : (
          <ul className="designs-home-grid">
            {shown.map((d) => (
              <li key={d.id} className={d.id === page.id ? "designs-home-card is-current" : "designs-home-card"}>
                <button className="designs-home-open" onClick={() => openDesign(d.id)} title={`Open “${d.title}”`}>
                  <Thumb design={d} />
                  <span className="designs-home-name">{d.title}</span>
                  <span className="designs-home-size">
                    {DESIGN_PRESETS.find((p) => p.id === d.design.preset)?.label.split(" · ")[0] ?? "Design"} · {describeSize(d.design)}
                  </span>
                </button>
                <button className="designs-home-delete" title={`Delete “${d.title}”`} aria-label={`Delete “${d.title}”`} onClick={() => remove(d)}>
                  <Icon name="close" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="designs-home-section">
        <div className="designs-home-row">
          <h2>Start something new</h2>
          <button className="btn btn--ghost" onClick={() => setMore(true)}>
            More ways to start…
          </button>
        </div>
        {(["Social", "Print"] as const).map((group) => (
          <div key={group} className="designs-home-group">
            <h3 className="panel-heading">{group}</h3>
            <div className="new-design-presets">
              {DESIGN_PRESETS.filter((p) => p.group === group).map((p) => (
                <button key={p.id} className="new-design-preset" onClick={() => create(p)}>
                  <Shape preset={p} />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="designs-home-group">
          <h3 className="panel-heading">Documents</h3>
          <div className="designs-home-docs">
            <button className="btn" onClick={() => openDocument("invoice")}>
              <Icon name="invoice" size={16} /> Invoice
            </button>
            <button className="btn" onClick={() => openDocument("proposal")}>
              <Icon name="file" size={16} /> Proposal
            </button>
          </div>
        </div>
      </section>
      {more && (
        <NewDesignDialog onClose={() => setMore(false)} onCreated={closeDesignHome} />
      )}
    </div>
  );
}
