import { useEffect, useMemo, useRef, useState } from "react";
import { openDocument } from "../business/DocumentDialog";
import { BlogWizard } from "../data/BlogWizard";
import { newCollection } from "../data/model";
import { NewDesignDialog } from "../design/NewDesignDialog";
import { BLUEPRINTS, copyComponent } from "../model/components";
import { createPage, createSection, slugify } from "../model/factory";
import { cloneSection } from "../model/ops";
import { PAGE_TEMPLATES, READY_MADE_SECTIONS, readyMadeForPage } from "../model/pageTemplates";
import { SECTION_TEMPLATES } from "../model/templates";
import type { ComponentDef, Page } from "../model/types";
import { useEditor } from "../state/store";
import { createId } from "../util/id";
import { cls } from "../util/cls";
import { askText } from "./askText";
import { ComponentPreview } from "./ComponentMaker";
import { ComponentThumb, useInsertSection } from "./ComponentsGroup";
import { Icon, type IconName } from "./icons";

export const OPEN_COLLECTION = "fayteworks:open-collection";
export const OPEN_NEW = "fayteworks:open-new";
export const openNew = (kind: "page" | "section" | "component" | "blog" | "design") => window.dispatchEvent(new CustomEvent(OPEN_NEW, { detail: kind }));

type NewDialog = "page" | "section" | "component" | "design" | "blog" | null;

const ITEMS: { id: string; icon: IconName; label: string; what: string }[] = [
  { id: "page", icon: "page", label: "Page", what: "Blank, from a template, or a copy" },
  { id: "section", icon: "section", label: "Section", what: "A blank band, or a ready-made one" },
  { id: "component", icon: "component", label: "Component", what: "A reusable piece you design once" },
  { id: "collection", icon: "data", label: "Collection", what: "A list: products, people, events…" },
  { id: "blog", icon: "blog", label: "Blog", what: "Posts, a blog page and a feed" },
  { id: "design", icon: "design", label: "Design", what: "Flyers, cards, posters, social images" },
  { id: "invoice", icon: "invoice", label: "Invoice", what: "For a client, as a PDF" },
  { id: "proposal", icon: "file", label: "Proposal", what: "Your offer, as a PDF" }
];

export function NewMenu() {
  const { state, commit, setPage } = useEditor();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<NewDialog>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const show = (e: Event) => setDialog((e as CustomEvent<NewDialog>).detail);
    window.addEventListener(OPEN_NEW, show);
    return () => window.removeEventListener(OPEN_NEW, show);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  async function run(id: string) {
    setOpen(false);
    if (id === "page" || id === "section" || id === "component" || id === "design" || id === "blog") return setDialog(id);
    if (id === "invoice" || id === "proposal") return openDocument(id);
    if (id === "collection") {
      const name = await askText("Name the collection (e.g. Products, Team, Events)", "Products");
      if (!name?.trim()) return;
      const collection = newCollection(name.trim());
      commit((draft) => void (draft.collections ??= []).push(collection));
      window.dispatchEvent(new CustomEvent(OPEN_COLLECTION, { detail: collection.id }));
      return;
    }
  }

  return (
    <div className="topbar-menu" ref={ref}>
      <button className={cls("btn topbar-tool", open && "is-active")} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="plus" size={16} />
        New
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="new-menu" role="menu">
          <span className="new-menu-label">Make something new</span>
          {ITEMS.map((it) => (
            <button key={it.id} role="menuitem" className="new-menu-item" onClick={() => void run(it.id)}>
              <Icon name={it.icon} size={20} />
              <span>
                <strong>{it.label}</strong>
                <small>{it.what}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      {dialog === "page" && <NewPageDialog onClose={() => setDialog(null)} />}
      {dialog === "section" && <NewSectionDialog onClose={() => setDialog(null)} />}
      {dialog === "component" && <NewComponentDialog onClose={() => setDialog(null)} />}
      {dialog === "design" && <NewDesignDialog onClose={() => setDialog(null)} />}
      {dialog === "blog" && <BlogWizard onClose={() => setDialog(null)} />}
    </div>
  );
}

function useModal(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return { ref, onClose, onCancel: onClose };
}

function Choice({ icon, title, what, active, onClick }: { icon: IconName; title: string; what: string; active: boolean; onClick: () => void }) {
  return (
    <button className={cls("choice", active && "is-active")} aria-pressed={active} onClick={onClick}>
      <span className="choice-icon">
        <Icon name={icon} size={22} />
      </span>
      <span className="choice-text">
        <strong>{title}</strong>
        <small>{what}</small>
      </span>
    </button>
  );
}

function CardButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      className={cls("template-card", active && "is-active")}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {children}
    </div>
  );
}

function Steps({ labels, at }: { labels: string[]; at: number }) {
  return (
    <ol className="steps">
      {labels.map((l, i) => (
        <li key={l} className={cls(i < at && "is-done", i === at && "is-current")}>
          <span>{i + 1}</span>
          {l}
        </li>
      ))}
    </ol>
  );
}

function copyPage(page: Page, title: string, slug: string): Page {
  return { ...structuredClone(page), id: createId("pg"), title, slug, sections: page.sections.map(cloneSection), collectionId: undefined };
}

export function NewPageDialog({ onClose }: { onClose: () => void }) {
  const { state, commit, setPage } = useEditor();
  const modal = useModal(onClose);
  const [step, setStep] = useState(0);
  const [start, setStart] = useState<"blank" | "template" | "copy">("blank");
  const [template, setTemplate] = useState(PAGE_TEMPLATES[0].id);
  const webPages = state.site.pages.filter((p) => !p.design && !p.collectionId);
  const [copyOf, setCopyOf] = useState(webPages[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [inMenu, setInMenu] = useState(true);
  const suggested = start === "template" ? (PAGE_TEMPLATES.find((t) => t.id === template)?.label ?? "Page") : start === "copy" ? `${webPages.find((p) => p.id === copyOf)?.title ?? "Page"} copy` : `Page ${webPages.length + 1}`;
  const name = title.trim() || suggested;
  const slug = useMemo(() => {
    const taken = new Set(state.site.pages.map((p) => p.slug));
    let s = slugify(name) || "page";
    while (taken.has(s)) s += "-1";
    return s;
  }, [name, state.site.pages]);

  function create() {
    if (start === "template") {
      const made = PAGE_TEMPLATES.find((t) => t.id === template)!.build(state.site);
      const main = made.pages.find((p) => p.id === made.open)!;
      if (title.trim()) main.title = title.trim();
      if (!inMenu) main.hideInNav = true;
      commit((draft) => {
        draft.pages.push(...made.pages);
        if (made.collections) (draft.collections ??= []).push(...made.collections);
        if (made.components) (draft.components ??= []).push(...made.components);
      });
      setPage(made.open);
    } else {
      const source = webPages.find((p) => p.id === copyOf);
      const page = start === "copy" && source ? copyPage(source, name, slug) : createPage(name, slug);
      page.hideInNav = !inMenu;
      commit((draft) => void draft.pages.push(page));
      setPage(page.id);
    }
    onClose();
  }

  return (
    <dialog {...modal} className="dialog wizard">
      <header className="dialog-header">
        <h2>New page</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <Steps labels={["Start from", "Details"]} at={step} />
      {step === 0 ? (
        <>
          <div className="choices">
            <Choice icon="plus" title="Blank" what="An empty page." active={start === "blank"} onClick={() => setStart("blank")} />
            <Choice icon="template" title="From a template" what="Link in bio, coming soon, press kit, events, podcast." active={start === "template"} onClick={() => setStart("template")} />
            <Choice icon="copy" title="Copy a page" what="Start from one of this site's pages." active={start === "copy"} onClick={() => setStart("copy")} />
          </div>
          {start === "template" && (
            <div className="choice-list">
              {PAGE_TEMPLATES.map((t) => (
                <button key={t.id} className={cls("choice-row", template === t.id && "is-active")} onClick={() => setTemplate(t.id)}>
                  <strong>{t.label}</strong>
                  <small>{t.description}</small>
                </button>
              ))}
            </div>
          )}
          {start === "copy" && (
            <div className="choice-list">
              {webPages.map((p) => (
                <button key={p.id} className={cls("choice-row", copyOf === p.id && "is-active")} onClick={() => setCopyOf(p.id)}>
                  <strong>{p.title}</strong>
                  <small>/{p.slug}</small>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="wizard-fields">
          <label className="field">
            <span className="field-label">Page name</span>
            <input type="text" autoFocus value={title} placeholder={suggested} onChange={(e) => setTitle(e.target.value)} />
          </label>
          {start !== "template" && (
            <p className="field-hint">
              Its address: <strong>/{slug}</strong>
            </p>
          )}
          <label className="catalogue-check">
            <input type="checkbox" checked={inMenu} onChange={(e) => setInMenu(e.target.checked)} /> Show it in the site's menu
          </label>
        </div>
      )}
      <footer className="wizard-actions">
        {step > 0 ? (
          <button className="btn" onClick={() => setStep(0)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {step === 0 ? (
          <button className="btn btn--primary" onClick={() => setStep(1)}>
            Next
          </button>
        ) : (
          <button className="btn btn--primary" onClick={create}>
            Create page
          </button>
        )}
      </footer>
    </dialog>
  );
}

export function NewSectionDialog({ onClose }: { onClose: () => void }) {
  const modal = useModal(onClose);
  const insert = useInsertSection();
  const { state, page, commit, select } = useEditor();

  function addReadyMade(id: string) {
    const made = readyMadeForPage(state.site, id, page.id);
    const selectedId = state.selection.kind !== "none" ? state.selection.sectionId : null;
    commit((draft) => {
      if (made.collections.length) (draft.collections ??= []).push(...made.collections);
      if (made.components.length) (draft.components ??= []).push(...made.components);
      draft.pages.push(...made.pages);
      const target = draft.pages.find((p) => p.id === page.id);
      if (!target) return;
      const at = target.sections.findIndex((s) => s.id === selectedId);
      target.sections.splice(at >= 0 ? at + 1 : target.sections.length, 0, ...made.sections);
    });
    select({ kind: "section", sectionId: made.sections[0].id });
    onClose();
  }
  const previews = useMemo(() => SECTION_TEMPLATES.map((t) => ({ ...t, preview: t.build() })), []);
  return (
    <dialog {...modal} className="dialog wizard wizard--wide">
      <header className="dialog-header">
        <h2>New section</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <p className="dialog-lead">It goes after the selected section (or at the end of the page).</p>
      <h3 className="panel-heading">Ready-made</h3>
      <div className="choice-list choice-list--3">
        {READY_MADE_SECTIONS.map((r) => (
          <button key={r.id} className="choice-row" onClick={() => addReadyMade(r.id)}>
            <strong>{r.label}</strong>
            <small>{r.description}</small>
          </button>
        ))}
      </div>
      <h3 className="panel-heading new-section-layouts">Layouts</h3>
      <div className="template-grid">
        <button
          className="template-card template-card--blank"
          onClick={() => {
            insert(createSection("Section"));
            onClose();
          }}
        >
          <span className="template-blank">
            <Icon name="plus" size={28} />
          </span>
          <strong>Blank</strong>
        </button>
        {previews.map((t) => (
          <CardButton
            key={t.id}
            onClick={() => {
              insert(t.build());
              onClose();
            }}
          >
            <div className="template-thumb" inert>
              <ComponentThumb section={t.preview} />
            </div>
            <strong>{t.name}</strong>
          </CardButton>
        ))}
      </div>
    </dialog>
  );
}

export function NewComponentDialog({ onClose }: { onClose: () => void }) {
  const { state, commit, editComponent } = useEditor();
  const modal = useModal(onClose);
  const mine = state.site.components ?? [];
  const [start, setStart] = useState<"blank" | "template" | "mine">("blank");
  const templates = BLUEPRINTS.filter((b) => b.id !== "blank");
  const [template, setTemplate] = useState(templates[0]?.id ?? "");
  const [from, setFrom] = useState(mine[0]?.id ?? "");

  function open() {
    let def: ComponentDef | undefined;
    if (start === "blank") def = BLUEPRINTS.find((b) => b.id === "blank")!.build();
    else if (start === "template") def = BLUEPRINTS.find((b) => b.id === template)?.build();
    else {
      const source = mine.find((c) => c.id === from);
      if (source) def = copyComponent(source, `${source.name} copy`);
    }
    if (!def) return;
    const made = def;
    commit((draft) => void (draft.components = [...(draft.components ?? []), made]));
    editComponent(made.id);
    onClose();
  }

  return (
    <dialog {...modal} className="dialog wizard wizard--wide">
      <header className="dialog-header">
        <h2>New component</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </header>
      <p className="dialog-lead">Design a piece once and use it anywhere. Change it later and every copy updates.</p>
      <div className="choices choices--3">
        <Choice icon="plus" title="Blank" what="An empty frame to add pieces to." active={start === "blank"} onClick={() => setStart("blank")} />
        <Choice icon="template" title="From a template" what="Cards, team members, prices, events…" active={start === "template"} onClick={() => setStart("template")} />
        <Choice icon="star" title="From one of mine" what={mine.length ? "Opens a copy; the original stays as it is." : "You haven't made any yet."} active={start === "mine"} onClick={() => mine.length && setStart("mine")} />
      </div>
      {start === "template" && (
        <div className="choice-list">
          {templates.map((b) => (
            <button key={b.id} className={cls("choice-row", template === b.id && "is-active")} onClick={() => setTemplate(b.id)}>
              <strong>{b.name}</strong>
              <small>{b.description}</small>
            </button>
          ))}
        </div>
      )}
      {start === "mine" && (
        <div className="template-grid">
          {mine.map((c) => (
            <CardButton key={c.id} active={from === c.id} onClick={() => setFrom(c.id)}>
              <div className="template-thumb" inert>
                <ComponentPreview def={c} width={200} height={120} components={mine} />
              </div>
              <strong>{c.name}</strong>
            </CardButton>
          ))}
        </div>
      )}
      <footer className="wizard-actions">
        <span />
        <button className="btn btn--primary" onClick={open}>
          Open the component studio
        </button>
      </footer>
    </dialog>
  );
}
