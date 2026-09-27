import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useEditingLang, writeProp } from "../i18n/i18n";
import { getBlockDefinition, type InlineEditTarget } from "../blocks/registry";
import { findSection } from "../model/ops";
import { PAGE_LINK_PREFIX, type Block } from "../model/types";
import { escapeRich } from "../site/richText";
import { useEditor } from "../state/store";

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "LI"]);

function serializeEditable(root: HTMLElement, target: InlineEditTarget): string {
  const rich = target.mode === "rich";
  const inline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/ /g, " ");
      return rich ? escapeRich(text) : text;
    }
    if (!(node instanceof HTMLElement)) return "";
    if (node.tagName === "BR") return "\n";
    const inner = Array.from(node.childNodes).map(inline).join("");
    const blockBreak = BLOCK_TAGS.has(node.tagName) ? "\n" : "";
    if (!rich || !inner.trim()) return blockBreak + inner;
    switch (node.tagName) {
      case "B":
      case "STRONG":
        return `**${inner}**`;
      case "I":
      case "EM":
        return `_${inner}_`;
      case "A": {
        const pageId = node.dataset.pageId;
        const href = pageId ? PAGE_LINK_PREFIX + pageId : (node.getAttribute("href") ?? "");
        return `[${inner}](${href.replace(/[()\\]/g, "\\$&")})`;
      }
      default:
        return blockBreak + inner;
    }
  };

  const chunks: string[] = [];
  let loose: string | null = null;
  for (const child of Array.from(root.childNodes)) {
    if (child instanceof HTMLElement && BLOCK_TAGS.has(child.tagName)) {
      if (loose !== null) chunks.push(loose);
      loose = null;
      chunks.push(Array.from(child.childNodes).map(inline).join(""));
    } else {
      loose = (loose ?? "") + inline(child);
    }
  }
  if (loose !== null) chunks.push(loose);

  let text = chunks.map((c) => c.replace(/\n+$/, "")).join(target.lines === "paragraphs" ? "\n\n" : "\n");
  if (target.lines === "single") text = text.replace(/\s*\n\s*/g, " ");
  return text.trim();
}

function ancestorWithin(node: Node, root: HTMLElement, tags: string[]): HTMLElement | null {
  for (let n: Node | null = node; n && n !== root; n = n.parentNode) {
    if (n instanceof HTMLElement && tags.includes(n.tagName)) return n;
  }
  return null;
}

function unwrap(el: HTMLElement) {
  el.replaceWith(...Array.from(el.childNodes));
}

function selectContents(el: Node) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function wrapRange(root: HTMLElement, range: Range, el: HTMLElement): boolean {
  if (range.collapsed || !root.contains(range.commonAncestorContainer)) return false;
  const blockOf = (n: Node) => ancestorWithin(n, root, [...BLOCK_TAGS]);
  if (blockOf(range.startContainer) !== blockOf(range.endContainer)) return false;
  el.appendChild(range.extractContents());
  range.insertNode(el);
  selectContents(el);
  return true;
}

function toggleMark(root: HTMLElement, mark: "strong" | "em") {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const existing = ancestorWithin(range.commonAncestorContainer, root, mark === "strong" ? ["STRONG", "B"] : ["EM", "I"]);
  if (existing) unwrap(existing);
  else wrapRange(root, range, document.createElement(mark));
}

interface EditingState {
  blockId: string;
  target: InlineEditTarget;
  x: number;
  y: number;
}

function LinkForm({ onApply, onRemove, onCancel }: { onApply: (href: string) => void; onRemove: () => void; onCancel: () => void }) {
  const { state } = useEditor();
  const [href, setHref] = useState("https://");
  return (
    <form
      className="inline-link-form"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(href.trim());
      }}
    >
      <select value={href.startsWith(PAGE_LINK_PREFIX) ? href : ""} onChange={(e) => setHref(e.target.value || "https://")}>
        <option value="">Web address…</option>
        {state.site.pages.map((p) => (
          <option key={p.id} value={PAGE_LINK_PREFIX + p.id}>
            Page: {p.title}
          </option>
        ))}
      </select>
      {!href.startsWith(PAGE_LINK_PREFIX) && (
        <input autoFocus type="text" value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://…" />
      )}
      <button type="submit">Apply</button>
      <button type="button" onClick={onRemove}>
        Unlink
      </button>
      <button type="button" onClick={onCancel} aria-label="Cancel">
        ✕
      </button>
    </form>
  );
}

export function useInlineEditing(sectionId: string, getSectionEl: () => HTMLElement | null) {
  const { state, page, commit } = useEditor();
  const editLang = useEditingLang(state.site);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [version, setVersion] = useState(0);
  const [linkRange, setLinkRange] = useState<Range | null>(null);
  const editableRef = useRef<HTMLElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const pageId = page.id;

  const finishRef = useRef<(save: boolean) => void>(() => {});
  finishRef.current = (save: boolean) => {
    const el = editableRef.current;
    const current = editing;
    if (save && el && current) {
      const value = serializeEditable(el, current.target);
      commit((draft) => {
        const block = findSection(draft, pageId, sectionId)?.blocks.find((b) => b.id === current.blockId);
        if (!block) return;
        if (editLang) writeProp(block, current.target.key, value, editLang, draft);
        else if (block.props[current.target.key] !== value) block.props[current.target.key] = value;
      });
    }
    editableRef.current = null;
    setLinkRange(null);
    setEditing(null);
    setVersion((v) => v + 1);
  };

  const openLinkForm = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && !selection.getRangeAt(0).collapsed) setLinkRange(selection.getRangeAt(0).cloneRange());
  };

  useLayoutEffect(() => {
    if (!editing) return;
    const el = getSectionEl()?.querySelector<HTMLElement>(`[data-block-id="${editing.blockId}"] ${editing.target.selector}`);
    if (!el) {
      setEditing(null);
      return;
    }
    editableRef.current = el;
    el.contentEditable = "true";
    el.spellcheck = true;
    el.focus();
    const caret = document.caretRangeFromPoint?.(editing.x, editing.y);
    if (caret && el.contains(caret.startContainer)) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(caret);
    }

    const { lines, mode } = editing.target;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") {
        e.preventDefault();
        finishRef.current(false);
      } else if (e.key === "Enter" && (lines === "single" || mod)) {
        e.preventDefault();
        finishRef.current(true);
      } else if (e.key === "Enter" && (lines === "lines" || e.shiftKey)) {
        e.preventDefault();
        document.execCommand("insertLineBreak");
      } else if (mod && mode === "rich" && ["b", "i", "k"].includes(e.key.toLowerCase())) {
        e.preventDefault();
        const key = e.key.toLowerCase();
        if (key === "k") openLinkForm();
        else toggleMark(el, key === "b" ? "strong" : "em");
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      document.execCommand("insertText", false, lines === "single" ? text.replace(/\s*\n\s*/g, " ") : text);
    };
    const onBlur = (e: FocusEvent) => {
      if (toolbarRef.current?.contains(e.relatedTarget as Node | null)) return;
      finishRef.current(true);
    };
    const onDrop = (e: DragEvent) => e.preventDefault();
    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("paste", onPaste);
    el.addEventListener("blur", onBlur);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("paste", onPaste);
      el.removeEventListener("blur", onBlur);
      el.removeEventListener("drop", onDrop);
    };
  }, [editing, getSectionEl]);

  useEffect(() => () => void (editableRef.current = null), []);

  function start(event: ReactMouseEvent, block: Block, blockEl: HTMLElement) {
    const targets = getBlockDefinition(block.type)?.inlineEdit?.filter((t) => !/{{s*item./.test(String(block.props[t.key] ?? "")));
    if (!targets?.length) return;
    const inside = (t: InlineEditTarget) => {
      const r = blockEl.querySelector(t.selector)?.getBoundingClientRect();
      return r && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    };
    const target = targets.find(inside) ?? targets.find((t) => blockEl.querySelector(t.selector));
    if (target) setEditing({ blockId: block.id, target, x: event.clientX, y: event.clientY });
  }

  function toolbar(blockId: string) {
    if (editing?.blockId !== blockId) return null;
    const rich = editing.target.mode === "rich";
    const keep = (e: ReactMouseEvent) => e.preventDefault();
    const el = () => editableRef.current;
    return (
      <div ref={toolbarRef} className="inline-toolbar" onPointerDown={(e) => e.stopPropagation()}>
        {linkRange ? (
          <LinkForm
            onApply={(href) => {
              const root = el();
              if (root && href) {
                const a = document.createElement("a");
                if (href.startsWith(PAGE_LINK_PREFIX)) {
                  a.href = "#";
                  a.dataset.pageId = href.slice(PAGE_LINK_PREFIX.length);
                } else a.href = href;
                root.focus();
                wrapRange(root, linkRange, a);
              }
              setLinkRange(null);
            }}
            onRemove={() => {
              const root = el();
              const a = root && ancestorWithin(linkRange.commonAncestorContainer, root, ["A"]);
              if (a) unwrap(a);
              root?.focus();
              setLinkRange(null);
            }}
            onCancel={() => {
              el()?.focus();
              setLinkRange(null);
            }}
          />
        ) : (
          <>
            {rich && (
              <>
                <button onMouseDown={keep} onClick={() => el() && toggleMark(el()!, "strong")} title="Bold (Ctrl B)">
                  <strong>B</strong>
                </button>
                <button onMouseDown={keep} onClick={() => el() && toggleMark(el()!, "em")} title="Italic (Ctrl I)">
                  <em>I</em>
                </button>
                <button onMouseDown={keep} onClick={openLinkForm} title="Link (Ctrl K) – select some text first">
                  Link
                </button>
                <span className="inline-toolbar-sep" />
              </>
            )}
            <button onMouseDown={keep} onClick={() => finishRef.current(true)} title="Done (click outside also saves)">
              Done
            </button>
            <span className="inline-toolbar-hint">Esc cancels</span>
          </>
        )}
      </div>
    );
  }

  return { editingBlockId: editing?.blockId ?? null, version, start, toolbar };
}
