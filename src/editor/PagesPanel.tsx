import { useEffect, useMemo, useRef, useState } from "react";
import { cardLayouts, type PageOutlineNode } from "../model/extras";
import { findSection } from "../model/ops";
import { openScene } from "../scenes/scenes";
import { Icon } from "./icons";
import { useClientLock } from "../client/clientMode";
import { openDesignHome } from "../design/home";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import { NewPageDialog } from "./NewMenu";
import { LinkDialog } from "./LinkPicker";

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

const openNodes = new Set<string>();

function pathTo(nodes: PageOutlineNode[], pageId: string, trail: string[] = []): string[] | null {
  for (const n of nodes) {
    if (n.pageId === pageId && !n.sectionId) return trail;
    const found = pathTo(n.children, pageId, [...trail, n.key]);
    if (found) return found;
  }
  return null;
}

function OutlineTree({ nodes, onDelete }: { nodes: PageOutlineNode[]; onDelete: (pageId: string) => void }) {
  const { state, page: currentPage, setPage, select, commit } = useEditor();
  const locked = useClientLock();
  const [, setTick] = useState(0);
  const [linking, setLinking] = useState<{ node: PageOutlineNode; at: { x: number; y: number } } | null>(null);
  const home = state.site.pages[0]?.id;
  const selectedSection = state.selection.kind === "none" ? null : state.selection.sectionId;

  useEffect(() => {
    for (const key of pathTo(nodes, currentPage.id) ?? []) openNodes.add(key);
    for (const n of nodes) openNodes.add(n.key);
    setTick((t) => t + 1);
  }, [currentPage.id]);

  const toggle = (key: string) => {
    if (openNodes.has(key)) openNodes.delete(key);
    else openNodes.add(key);
    setTick((t) => t + 1);
  };

  const open = (n: PageOutlineNode) => {
    if (n.pageId !== currentPage.id) setPage(n.pageId);
    if (n.sectionId) select({ kind: "section", sectionId: n.sectionId });
  };

  const row = (n: PageOutlineNode, depth: number) => {
    const current = n.sectionId ? n.pageId === currentPage.id && selectedSection === n.sectionId : n.pageId === currentPage.id && (!n.link || !selectedSection || !currentPage.sections.some((s) => s.id === selectedSection));
    const expanded = openNodes.has(n.key);
    return (
      <li key={n.key}>
        <div className={cls("pages-item", "outline-item", current && "is-current")} style={{ paddingLeft: depth * 14 }}>
          {n.children.length > 0 ? (
            <button className="outline-toggle" aria-label={expanded ? "Fold" : "Unfold"} aria-expanded={expanded} onClick={() => toggle(n.key)}>
              <Icon name={expanded ? "chevronDown" : "chevronRight"} size={14} />
            </button>
          ) : (
            <span className="outline-toggle" />
          )}
          <button className="pages-open" onClick={() => open(n)}>
            <span className="pages-title">
              {n.label}
              {!n.sectionId && !n.link && n.pageId === home && <em className="outline-home">home</em>}
            </span>
            {n.note && <span className="pages-slug">{n.note}</span>}
          </button>
          {!locked && n.link && (
            <button
              className="outline-link"
              title="Change where this leads"
              aria-label={`Change where ${n.label} leads`}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setLinking({ node: n, at: { x: r.right + 8, y: r.top } });
              }}
            >
              ↗
            </button>
          )}
          {!locked && !n.sectionId && !n.link && <PageMenu onSettings={() => openScene({ kind: "page", pageId: n.pageId })} onDelete={n.pageId !== home ? () => onDelete(n.pageId) : undefined} />}
        </div>
        {expanded && n.children.length > 0 && <ul className="outline-children">{n.children.map((c) => row(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <>
      <ul className="pages-list outline-list">{nodes.map((n) => row(n, 0))}</ul>
      {linking?.node.link && (
        <LinkDialog
          title={`Where “${linking.node.label}” leads`}
          at={linking.at}
          value={linking.node.link.href}
          onClose={() => setLinking(null)}
          onChange={(href) => {
            const { pageId, sectionId } = linking.node.link!;
            commit((draft) => {
              const section = findSection(draft, pageId, sectionId);
              if (section) section.card = { ...(section.card ?? {}), link: href };
            }, `${sectionId}.card.link`);
            setLinking({ ...linking, node: { ...linking.node, link: { pageId, sectionId, href } } });
          }}
        />
      )}
    </>
  );
}

export function PagesPanel() {
  const { state, page: currentPage, commit, setPage } = useEditor();
  const { pages } = state.site;
  const [newPage, setNewPage] = useState(false);
  const locked = useClientLock();
  const outline = useMemo(() => cardLayouts?.outline?.(pages) ?? null, [pages]);
  const webPages = pages.filter((p) => !p.design && !outline?.pageIds.includes(p.id));
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
      {outline && outline.nodes.length > 0 && (
        <>
          <h3 className="panel-heading">{outline.heading}</h3>
          <OutlineTree nodes={outline.nodes} onDelete={deletePage} />
          {outline.hint && <p className="panel-hint">{outline.hint}</p>}
          <h3 className="panel-heading pages-designs-heading">Pages</h3>
        </>
      )}
      <ul className="pages-list">
        {webPages.map((page) => (
          <li key={page.id} className={cls("pages-item", page.id === currentPage.id && "is-current")}>
            <button className="pages-open" onClick={() => setPage(page.id)}>
              <span className="pages-title">{page.title}</span>
              <span className="pages-slug">/{page.id === pages[0].id ? "" : page.slug}</span>
            </button>
            {!locked && <PageMenu onSettings={() => openScene({ kind: "page", pageId: page.id })} onDelete={page.id !== pages[0].id ? () => deletePage(page.id) : undefined} />}
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
        <button className="inspector-door" onClick={openDesignHome}>
          <Icon name="design" size={20} />
          <span>
            <strong>{designs.length ? "Open the design tool" : "Make a design"}</strong>
            <small>{designs.length ? `${designs.length} design${designs.length === 1 ? "" : "s"}: flyers, cards, posters, invoices` : "Flyers, cards, posters and social images. They aren't part of the website."}</small>
          </span>
        </button>
      )}
      {newPage && <NewPageDialog onClose={() => setNewPage(false)} />}
    </div>
  );
}
