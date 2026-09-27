import { useState } from "react";
import { useClientLock } from "../client/clientMode";
import { NewDesignDialog } from "../design/NewDesignDialog";
import { DESIGN_PRESETS, describeSize } from "../model/design";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import { NewPageDialog } from "./NewMenu";

export function PagesPanel() {
  const { state, page: currentPage, commit, setPage } = useEditor();
  const { pages } = state.site;
  const [newDesign, setNewDesign] = useState(false);
  const [newPage, setNewPage] = useState(false);
  const locked = useClientLock();
  const webPages = pages.filter((p) => !p.design);
  const designs = pages.filter((p) => p.design);

  function deletePage(pageId: string) {
    const page = pages.find((p) => p.id === pageId);
    if (!page || pages.length === 1 || !window.confirm(`Delete “${page.title}”? You can undo this.`)) {
      return;
    }
    commit((draft) => {
      draft.pages = draft.pages.filter((p) => p.id !== pageId);
    });
  }

  return (
    <div className="pages-panel">
      <ul className="pages-list">
        {webPages.map((page, index) => (
          <li key={page.id} className={cls("pages-item", page.id === currentPage.id && "is-current")}>
            <button className="pages-open" onClick={() => setPage(page.id)}>
              <span className="pages-title">{page.title}</span>
              <span className="pages-slug">/{index === 0 ? "" : page.slug}</span>
            </button>
            {index > 0 && !locked && (
              <button className="pages-delete" title="Delete page" onClick={() => deletePage(page.id)}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {!locked && (
        <button className="btn btn--block" onClick={() => setNewPage(true)}>
          + New page…
        </button>
      )}
      <p className="panel-hint">The first page is your home page. Click empty space on the canvas for a page's settings.</p>

      <h3 className="panel-heading pages-designs-heading">Designs</h3>
      {designs.length > 0 && (
        <ul className="pages-list">
          {designs.map((page) => (
            <li key={page.id} className={cls("pages-item", page.id === currentPage.id && "is-current")}>
              <button className="pages-open" onClick={() => setPage(page.id)}>
                <span className="pages-title">{page.title}</span>
                <span className="pages-slug">
                  {DESIGN_PRESETS.find((p) => p.id === page.design!.preset)?.label.split(" · ")[0] ?? "Design"} · {describeSize(page.design!)}
                </span>
              </button>
              <button className="pages-delete" title="Delete design" hidden={locked} onClick={() => deletePage(page.id)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {!locked && (
        <>
          <button className="btn btn--block" onClick={() => setNewDesign(true)}>
            + New design…
          </button>
        </>
      )}
      <p className="panel-hint">Flyers, cards, posters and social images. They export as PDF or pictures and aren't part of the website.</p>
      {newDesign && <NewDesignDialog onClose={() => setNewDesign(false)} />}
      {newPage && <NewPageDialog onClose={() => setNewPage(false)} />}
    </div>
  );
}
