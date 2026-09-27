import { useState } from "react";
import { openDocument } from "../business/DocumentDialog";
import { openDirectory } from "../directory/DirectoryDialog";
import { categoryForPreset } from "../directory/directory";
import { Icon } from "../editor/icons";
import { LayersPanel } from "../editor/LayersPanel";
import { PageMenu } from "../editor/PagesPanel";
import { DESIGN_PRESETS, describeSize } from "../model/design";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import { NewDesignDialog } from "./NewDesignDialog";

export function DesignsPanel() {
  const { state, page, commit, setPage, select } = useEditor();
  const [tab, setTab] = useState<"designs" | "layers">("designs");
  const [creating, setCreating] = useState(false);
  const designs = state.site.pages.filter((p) => p.design);
  const print = page.design?.kind === "print";

  function remove(id: string) {
    const d = designs.find((p) => p.id === id);
    if (!d || !window.confirm(`Delete “${d.title}”? You can undo this.`)) return;
    const next = designs.find((p) => p.id !== id) ?? state.site.pages.find((p) => !p.design);
    if (next) setPage(next.id);
    commit((draft) => void (draft.pages = draft.pages.filter((p) => p.id !== id)));
  }

  return (
    <aside className="panel panel--left designs-panel">
      <div className="designs-tabs" role="tablist" aria-label="Design tool">
        <button role="tab" aria-selected={tab === "designs"} className={cls(tab === "designs" && "is-active")} onClick={() => setTab("designs")}>
          Designs
        </button>
        <button role="tab" aria-selected={tab === "layers"} className={cls(tab === "layers" && "is-active")} onClick={() => setTab("layers")}>
          Layers
        </button>
      </div>
      <div className="panel-body">
        {tab === "layers" ? (
          <LayersPanel />
        ) : (
          <>
            <ul className="pages-list">
              {designs.map((d) => (
                <li key={d.id} className={cls("pages-item", d.id === page.id && "is-current")}>
                  <button className="pages-open" onClick={() => setPage(d.id)}>
                    <span className="pages-title">{d.title}</span>
                    <span className="pages-slug">
                      {DESIGN_PRESETS.find((p) => p.id === d.design!.preset)?.label.split(" · ")[0] ?? "Design"} · {describeSize(d.design!)}
                    </span>
                  </button>
                  <PageMenu settingsLabel="Size and export" onSettings={() => (setPage(d.id), select({ kind: "none" }))} onDelete={() => remove(d.id)} />
                </li>
              ))}
            </ul>
            <div className="designs-new">
              <button className="btn btn--block btn--primary" onClick={() => setCreating(true)}>
                <Icon name="add" size={16} /> New design
              </button>
              <div className="designs-docs">
                <button className="btn" onClick={() => openDocument("invoice")}>
                  <Icon name="invoice" size={16} /> Invoice
                </button>
                <button className="btn" onClick={() => openDocument("proposal")}>
                  <Icon name="file" size={16} /> Proposal
                </button>
              </div>
            </div>
            <section className="designs-print">
              <h3>{print ? "Get it printed" : "Share it"}</h3>
              {print ? (
                <>
                  <p className="panel-hint">Print shops and merch makers that take PDFs like this one, near you or online.</p>
                  <button className="btn btn--block" onClick={() => openDirectory(categoryForPreset(page.design?.preset))}>
                    Where to get this printed
                  </button>
                </>
              ) : (
                <p className="panel-hint">Export it as a picture, or use it as the picture your pages show when someone shares them: both are in the design's settings on the right.</p>
              )}
            </section>
          </>
        )}
      </div>
      {creating && <NewDesignDialog onClose={() => setCreating(false)} />}
    </aside>
  );
}
