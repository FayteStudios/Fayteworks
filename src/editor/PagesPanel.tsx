import { useEffect, useRef, useState } from "react";
import { openScene } from "../scenes/scenes";
import { Icon } from "./icons";
import { useClientLock } from "../client/clientMode";
import { NewDesignDialog } from "../design/NewDesignDialog";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import { NewPageDialog } from "./NewMenu";

export function PageMenu({ onSettings, onDelete, settingsLabel = "Page settings" }: { onSettings: () => void; onDelete?: () => void; settingsLabel?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);
  return (
    <div className="pages-menu" ref={ref}>
      <button className="pages-more" aria-label="Page options" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="more" size={16} />
      </button>
      {open && (
        <div className="pages-menu-list" role="menu">
          <button role="menuitem" onClick={() => (setOpen(false), onSettings())}>
            {settingsLabel}
          </button>
          {onDelete && (
            <button role="menuitem" className="is-danger" onClick={() => (setOpen(false), onDelete())}>
              Delete page
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
            {!locked && <PageMenu onSettings={() => openScene({ kind: "page", pageId: page.id })} onDelete={index > 0 ? () => deletePage(page.id) : undefined} />}
          </li>
        ))}
      </ul>
      {!locked && (
        <button className="btn btn--block" onClick={() => setNewPage(true)}>
          + New page…
        </button>
      )}
      <p className="panel-hint">The first page is your home page. ⋯ next to a page opens its settings.</p>

      <h3 className="panel-heading pages-designs-heading">Designs</h3>
      {!locked && (
        <button className="inspector-door" onClick={() => (designs[0] ? setPage(designs[0].id) : setNewDesign(true))}>
          <Icon name="design" size={20} />
          <span>
            <strong>{designs.length ? "Open the design tool" : "Make a design"}</strong>
            <small>{designs.length ? `${designs.length} design${designs.length === 1 ? "" : "s"}: flyers, cards, posters, invoices` : "Flyers, cards, posters and social images. They aren't part of the website."}</small>
          </span>
        </button>
      )}
      {newDesign && <NewDesignDialog onClose={() => setNewDesign(false)} />}
      {newPage && <NewPageDialog onClose={() => setNewPage(false)} />}
    </div>
  );
}
