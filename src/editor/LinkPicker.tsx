import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BACK_TO_CARDS, PAGE_LINK_PREFIX, type Page } from "../model/types";
import { useEditor } from "../state/store";

type Kind = "page" | "web" | "email" | "phone" | "back";

function kindOf(href: string): Kind {
  if (href === BACK_TO_CARDS) return "back";
  if (href.startsWith(PAGE_LINK_PREFIX)) return "page";
  if (href.startsWith("mailto:")) return "email";
  if (href.startsWith("tel:")) return "phone";
  return "web";
}

export function describeLink(href: string, pages: Page[]): string {
  const kind = kindOf(href);
  if (kind === "back") return "Back to the cards";
  if (kind === "page") return pages.find((p) => PAGE_LINK_PREFIX + p.id === href)?.title ?? "A deleted page";
  if (kind === "email") return href.slice(7).split("?")[0] || "Email";
  if (kind === "phone") return href.slice(4) || "Phone";
  if (!href || href === "#") return "Nowhere yet";
  return href.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function splitMail(href: string): { to: string; subject: string } {
  const [to, query = ""] = href.slice(7).split("?");
  const subject = new URLSearchParams(query).get("subject") ?? "";
  return { to: decodeURIComponent(to), subject };
}

export function LinkPicker({ value, onChange, allowBack = false }: { value: string; onChange: (href: string) => void; allowBack?: boolean }) {
  const { state, setPage } = useEditor();
  const pages = state.site.pages.filter((p) => !p.design);
  const [kind, setKind] = useState<Kind>(() => kindOf(value));
  const [filter, setFilter] = useState("");
  useEffect(() => setKind(kindOf(value)), [value]);
  const kinds: [Kind, string][] = [["page", "Page"], ["web", "Web address"], ["email", "Email"], ["phone", "Phone"], ...(allowBack || value === BACK_TO_CARDS ? ([["back", "Back to cards"]] as [Kind, string][]) : [])];
  const current = kindOf(value) === kind ? value : "";
  const shown = filter.trim() ? pages.filter((p) => `${p.title} ${p.slug}`.toLowerCase().includes(filter.trim().toLowerCase())) : pages;
  const mail = splitMail(current.startsWith("mailto:") ? current : "mailto:");
  const pick = (next: Kind) => {
    setKind(next);
    if (next === "back") onChange(BACK_TO_CARDS);
  };
  const linkedPage = kindOf(value) === "page" ? pages.find((p) => PAGE_LINK_PREFIX + p.id === value) : undefined;

  return (
    <div className="link-picker">
      <div className="link-picker-kinds" role="radiogroup" aria-label="Link to">
        {kinds.map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "is-active" : undefined} onClick={() => pick(k)}>
            {label}
          </button>
        ))}
      </div>
      {kind === "page" && (
        <>
          {pages.length > 8 && <input type="search" className="link-picker-filter" placeholder="Find a page" value={filter} onChange={(e) => setFilter(e.target.value)} />}
          <ul className="link-picker-pages" role="listbox" aria-label="Pages">
            {shown.map((p) => {
              const href = PAGE_LINK_PREFIX + p.id;
              return (
                <li key={p.id}>
                  <button type="button" role="option" aria-selected={value === href} className={value === href ? "is-active" : undefined} onClick={() => onChange(href)}>
                    <span>{p.title}</span>
                    <small>/{p.id === state.site.pages[0].id ? "" : p.slug}</small>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="link-picker-none">No page matches.</li>}
          </ul>
          {current && !linkedPage && <p className="field-hint">The page this linked to was deleted. Pick another one.</p>}
        </>
      )}
      {kind === "web" && (
        <input
          type="url"
          placeholder="https://…"
          value={current}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && !/^([a-z][\w+.-]*:|\/|#|\.)/i.test(v)) onChange(`https://${v}`);
          }}
        />
      )}
      {kind === "email" && (
        <>
          <input type="email" placeholder="name@example.com" value={mail.to} onChange={(e) => onChange(`mailto:${e.target.value.trim()}${mail.subject ? `?subject=${encodeURIComponent(mail.subject)}` : ""}`)} />
          <input type="text" placeholder="Subject (optional)" value={mail.subject} onChange={(e) => onChange(`mailto:${mail.to}${e.target.value ? `?subject=${encodeURIComponent(e.target.value)}` : ""}`)} />
        </>
      )}
      {kind === "phone" && <input type="tel" placeholder="+1 555 123 4567" value={current.slice(4)} onChange={(e) => onChange(`tel:${e.target.value.replace(/[^\d+]/g, "")}`)} />}
      {kind === "back" && <p className="field-hint">Closes the open card and shows the cards again.</p>}
      {linkedPage && (
        <button type="button" className="link-button" onClick={() => setPage(linkedPage.id)}>
          Go to {linkedPage.title} →
        </button>
      )}
    </div>
  );
}

export function LinkDialog({ title, value, onChange, onClose, allowBack, at }: { title: string; value: string; onChange: (href: string) => void; onClose: () => void; allowBack?: boolean; at?: { x: number; y: number } }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const id = window.setTimeout(() => window.addEventListener("pointerdown", away), 0);
    window.addEventListener("keydown", key);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return createPortal(
    <div
      className="link-dialog"
      role="dialog"
      aria-label={title}
      ref={ref}
      style={at ? { left: Math.max(12, Math.min(at.x, window.innerWidth - 352)), top: Math.max(12, Math.min(at.y, window.innerHeight - 440)) } : undefined}
    >
      <div className="link-dialog-head">
        <strong>{title}</strong>
        <button type="button" className="link-dialog-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <LinkPicker value={value} onChange={onChange} allowBack={allowBack} />
    </div>,
    document.body
  );
}
