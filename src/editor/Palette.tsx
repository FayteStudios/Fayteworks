import { forgetImport, listImported, onImportedChange, prepareImported } from "../catalogue/imported";
import { useEffect, useMemo, useRef, useState } from "react";
import { listBlockDefinitions } from "../blocks/registry";
import type { BlockCategory, BlockDefinition } from "../blocks/types";
import { findComponent } from "../model/components";
import { useEditor } from "../state/store";
import { desktop } from "../platform/desktop";
import { cls } from "../util/cls";
import { CatalogueDialog } from "./CatalogueDialog";
import { ComponentsPanel, PlaceComponentsGroup } from "./ComponentMaker";
import { ComponentsGroup } from "./ComponentsGroup";
import { Icon } from "./icons";
import { useAddBlock } from "./addBlock";
import { activeLibraryDrag, LIBRARY_MIME } from "./libraryDrag";

const PAGES: { id: string; label: string; categories: BlockCategory[] }[] = [
  { id: "basics", label: "Basics", categories: ["Text", "Actions", "Layout"] },
  { id: "media", label: "Media", categories: ["Media"] },
  { id: "content", label: "Content", categories: ["Content", "Interactive"] },
  { id: "social", label: "Social", categories: ["Social"] },
  { id: "services", label: "Selling & services", categories: ["Services"] },
  { id: "site", label: "Site parts", categories: ["Navigation"] },
  { id: "toybox", label: "Toybox", categories: ["Toybox"] }
];

function Tile({ def, onAdd, onHover }: { def: BlockDefinition; onAdd: () => void; onHover: (text: string) => void }) {
  return (
    <button
      className="palette-tile"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(LIBRARY_MIME, def.type);
        event.dataTransfer.effectAllowed = "copy";
        Object.assign(activeLibraryDrag, { type: def.type, props: undefined, size: undefined });
      }}
      onDragEnd={() => Object.assign(activeLibraryDrag, { type: null, props: undefined, size: undefined })}
      onClick={onAdd}
      onPointerEnter={() => onHover(`${def.label}: ${def.description}`)}
      onPointerLeave={() => onHover("")}
      onFocus={() => onHover(`${def.label}: ${def.description}`)}
      onBlur={() => onHover("")}
      aria-description={def.description}
    >
      <span className="palette-tile-icon" aria-hidden>
        {def.icon}
      </span>
      <span className="palette-tile-label">{def.label}</span>
    </button>
  );
}

function ImportedPage({ onHover }: { onHover: (text: string) => void }) {
  const addBlock = useAddBlock();
  const [items, setItems] = useState(listImported);
  useEffect(() => onImportedChange(() => setItems(listImported())), []);
  if (!items.length) return <p className="palette-empty">Pieces you add from the catalogue land here by themselves, ready to use again on any site.</p>;
  return (
    <div className="imported-list">
      {items.map((item) => (
        <div key={item.id} className="imported-item">
          <button
            className="imported-add"
            onMouseEnter={() => onHover(`${item.name} · from ${item.from}`)}
            onMouseLeave={() => onHover("")}
            onClick={async () => addBlock(item.type, { props: await prepareImported(item), size: item.size })}
          >
            <strong>{item.name}</strong>
            <small>
              {item.type === "vector" ? "Drawing" : "Code"} · {item.from}
            </small>
          </button>
          <button className="imported-forget" aria-label={`Forget ${item.name}`} title="Take it off this list" onClick={() => forgetImport(item.id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Palette({ onClose, onManage }: { onClose: () => void; onManage: () => void }) {
  const { state } = useEditor();
  const addBlock = useAddBlock();
  const [tab, setTab] = useState<"mine" | "more">("mine");
  const [page, setPage] = useState("basics");
  const [query, setQuery] = useState("");
  const [catalogue, setCatalogue] = useState(false);
  const [hint, setHint] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const making = findComponent(state.site.components, state.componentId);
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => searchRef.current?.focus(), []);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Element;
      if (rootRef.current?.contains(t) || t.closest?.("[data-palette-toggle], dialog[open]")) return;
      onClose();
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [onClose]);
  const all = useMemo(() => listBlockDefinitions().filter((d) => !d.hidden), []);
  const q = query.trim().toLowerCase();
  const found = q ? all.filter((d) => `${d.label} ${d.description} ${d.category}`.toLowerCase().includes(q)) : [];
  const current = PAGES.find((p) => p.id === page);

  return (
    <section ref={rootRef} className="palette" aria-label="Add">
      <header className="palette-tabs">
        <button className={cls(tab === "mine" && "is-active")} onClick={() => setTab("mine")}>
          My components
        </button>
        <button className={cls(tab === "more" && "is-active")} onClick={() => setTab("more")}>
          Get more…
        </button>
        <button className="btn btn--ghost palette-close" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </header>
      {tab === "mine" ? (
        <>
          <label className="palette-search">
            <Icon name="search" size={16} />
            <input ref={searchRef} type="search" aria-label="Search" placeholder="Search: button, gallery, map…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {making && (
            <p className="palette-note">
              Adding pieces to <strong>{making.name}</strong>.
            </p>
          )}
          {!q && (
            <nav className="palette-pages" aria-label="Kinds">
              {PAGES.filter((p) => all.some((d) => p.categories.includes(d.category))).map((p) => (
                <button key={p.id} className={cls(page === p.id && "is-active")} onClick={() => setPage(p.id)}>
                  {p.label}
                </button>
              ))}
              <button className={cls(page === "mine" && "is-active")} onClick={() => setPage("mine")}>
                Mine
              </button>
              <button className={cls(page === "imported" && "is-active")} onClick={() => setPage("imported")}>
                Imported
              </button>
            </nav>
          )}
          <div className="palette-body">
            {q ? (
              found.length ? (
                <div className="palette-grid">
                  {found.map((d) => (
                    <Tile key={d.type} def={d} onAdd={() => addBlock(d.type)} onHover={setHint} />
                  ))}
                </div>
              ) : (
                <p className="palette-empty">Nothing called “{query.trim()}”. Try Get more… for thousands of extra pieces.</p>
              )
            ) : page === "imported" ? (
              <ImportedPage onHover={setHint} />
            ) : page === "mine" ? (
              <div className="palette-mine">
                <PlaceComponentsGroup excludeId={making?.id} title="Components in this site" />
                {!making && <ComponentsGroup />}
                <button className="btn btn--block" onClick={onManage}>
                  Manage components…
                </button>
              </div>
            ) : (
              current &&
              current.categories.map((c) => {
                const defs = all.filter((d) => d.category === c);
                return defs.length ? (
                  <section key={c} className="palette-group">
                    {current.categories.length > 1 && <h3 className="panel-heading">{c}</h3>}
                    <div className="palette-grid">
                      {defs.map((d) => (
                        <Tile key={d.type} def={d} onAdd={() => addBlock(d.type)} onHover={setHint} />
                      ))}
                    </div>
                  </section>
                ) : null;
              })
            )}
          </div>
          <footer className="palette-foot">{hint || "Drag onto the page, or click to add to the selected section."}</footer>
        </>
      ) : (
        <div className="palette-body palette-more">
          <h3>The component catalogue</h3>
          <p>About 4,200 buttons, cards, heroes, forms and more from Uiverse, HyperUI, Meraki UI and Flowbite, all free to use. Preview them, then add the ones you like.</p>
          <button className="btn btn--primary btn--block" onClick={() => setCatalogue(true)}>
            Browse the catalogue
          </button>
          {desktop && <p className="field-hint">You can also capture a piece from a website there.</p>}
        </div>
      )}
      {catalogue && <CatalogueDialog onClose={() => setCatalogue(false)} />}
    </section>
  );
}

export function ComponentsDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { state } = useEditor();
  const opened = useRef(state.componentId);
  useEffect(() => ref.current?.showModal(), []);
  useEffect(() => {
    if (state.componentId && state.componentId !== opened.current) onClose();
  }, [state.componentId, onClose]);
  return (
    <dialog ref={ref} className="dialog components-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Components</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <ComponentsPanel />
    </dialog>
  );
}
