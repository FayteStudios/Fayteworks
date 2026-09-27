import { useEffect, useRef, useState } from "react";
import { themeVars } from "../model/theme";
import { useEditor } from "../state/store";
import { openGuide } from "../guides/GuideHost";
import type { Collection, CollectionItem } from "../model/types";
import { desktop } from "../platform/desktop";
import { markdownText, Markdown, readingMinutes } from "../site/markdown";
import { defaultRenderContext, isExternalHref, type RenderContext } from "../site/renderContext";
import { assetUrl, getAsset, putAsset, useAssetVersion } from "../state/assets";
import { autocorrect, autocorrectOn, setAutocorrectOn, type Correction } from "./autocorrect";

export function PostEditor({
  collection,
  item,
  fieldKey,
  siteUrl,
  itemUrl,
  onSave,
  onClose
}: {
  collection: Collection;
  item: CollectionItem;
  fieldKey: string;
  siteUrl: string;
  itemUrl: string;
  onSave: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const { state } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleKey = collection.fields.find((f) => f.type === "text" && /title|name|heading/.test(f.key))?.key;
  const [title, setTitle] = useState(String((titleKey && item.values[titleKey]) ?? ""));
  const [body, setBody] = useState(String(item.values[fieldKey] ?? ""));
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [fixing, setFixing] = useState(autocorrectOn);
  const lastFix = useRef<Correction | null>(null);
  useAssetVersion();
  useEffect(() => ref.current?.showModal(), []);

  const dirty = body !== String(item.values[fieldKey] ?? "") || (titleKey ? title !== String(item.values[titleKey] ?? "") : false);
  const words = markdownText(body).split(" ").filter(Boolean).length;
  const ctx: RenderContext = { ...defaultRenderContext, asset: assetUrl, link: (href) => ({ href: isExternalHref(href) ? href : "#", external: true }), isEditor: true, isPreview: true };

  function wrap(before: string, after = before, placeholder = "text") {
    const area = areaRef.current!;
    const { selectionStart: s, selectionEnd: e } = area;
    const selected = body.slice(s, e) || placeholder;
    const next = body.slice(0, s) + before + selected + after + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  }
  function linePrefix(prefix: string | ((i: number) => string)) {
    const area = areaRef.current!;
    const start = body.lastIndexOf("\n", area.selectionStart - 1) + 1;
    const endIndex = body.indexOf("\n", area.selectionEnd);
    const end = endIndex < 0 ? body.length : endIndex;
    const lines = body.slice(start, end).split("\n").map((l, i) => (typeof prefix === "string" ? prefix : prefix(i)) + l.replace(/^(#{1,4}\s|>\s|-\s|\d+\.\s)/, ""));
    setBody(body.slice(0, start) + lines.join("\n") + body.slice(end));
    requestAnimationFrame(() => area.focus());
  }
  function insertBlock(text: string) {
    const area = areaRef.current!;
    const lineEnd = body.indexOf("\n", area.selectionEnd);
    const at = lineEnd < 0 ? body.length : lineEnd;
    const pre = body.slice(0, at).endsWith("\n\n") || at === 0 ? "" : body.slice(0, at).endsWith("\n") ? "\n" : "\n\n";
    setBody(body.slice(0, at) + pre + text + "\n\n" + body.slice(at));
    requestAnimationFrame(() => area.focus());
  }

  function save(close: boolean) {
    onSave({ [fieldKey]: body, ...(titleKey ? { [titleKey]: title } : {}) });
    setStatus("Saved.");
    if (close) onClose();
  }

  async function newsletterBody(): Promise<string> {
    let out = body;
    for (const m of body.matchAll(/\]\((asset:[\w-]+)/g)) {
      const asset = await getAsset(m[1]);
      const ext = asset?.blob.type.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") ?? "png";
      out = out.split(m[1]).join(siteUrl ? `${siteUrl.replace(/\/+$/, "")}/assets/${m[1].slice(6)}.${ext}` : "");
    }
    out = out.replace(/!\[[^\]]*\]\(\s*\)/g, "");
    return itemUrl ? `${out}\n\n---\n\n[Read this on the website](${itemUrl})` : out;
  }

  async function sendDraft() {
    setSending(true);
    setStatus("");
    try {
      save(false);
      await desktop!.platformCall("buttondownDraft", title || "New post", await newsletterBody());
      setStatus("✓ Saved to Buttondown as a draft. Open Buttondown to check it and send it.");
    } catch (e) {
      setStatus(`Couldn't send: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(false);
    }
  }

  const tools: { label: string; title: string; run: () => void }[] = [
    { label: "H2", title: "Heading", run: () => linePrefix("## ") },
    { label: "H3", title: "Smaller heading", run: () => linePrefix("### ") },
    { label: "B", title: "Bold (Ctrl+B)", run: () => wrap("**") },
    { label: "I", title: "Italic (Ctrl+I)", run: () => wrap("_") },
    { label: "🔗", title: "Link (Ctrl+K)", run: () => wrap("[", "](https://)", "link text") },
    { label: "❝", title: "Quote", run: () => linePrefix("> ") },
    { label: "•", title: "Bulleted list", run: () => linePrefix("- ") },
    { label: "1.", title: "Numbered list", run: () => linePrefix((i) => `${i + 1}. `) },
    { label: "</>", title: "Code", run: () => wrap("`") },
    { label: "―", title: "Divider", run: () => insertBlock("---") },
    { label: "🖼 Picture", title: "Add a picture", run: () => fileRef.current?.click() }
  ];

  return (
    <dialog ref={ref} className="dialog post-editor" onCancel={(e) => (e.preventDefault(), (!dirty || window.confirm("Close without saving?")) && onClose())}>
      <header className="dialog-header">
        <input className="post-title" aria-label="Title" value={title} placeholder="Title" disabled={!titleKey} onChange={(e) => setTitle(e.target.value)} />
        <div className="post-actions">
          <span className="post-stats">
            {words} words · {readingMinutes(body)} min read
          </span>
          {desktop && (
            <button className="btn" disabled={sending} title="Send to Buttondown as a draft email" onClick={async () => ((await desktop!.hasToken("buttondown")) ? void sendDraft() : openGuide("newsletter-send"))}>
              {sending ? "Sending…" : "✉ Newsletter draft"}
            </button>
          )}
          <button className="btn" onClick={() => (!dirty || window.confirm("Close without saving?")) && onClose()}>
            Close
          </button>
          <button className="btn btn--primary" onClick={() => save(true)}>
            Save
          </button>
        </div>
      </header>
      <div className="post-toolbar" role="toolbar" aria-label="Formatting">
        {tools.map((t) => (
          <button key={t.label} type="button" className="btn btn--small" title={t.title} aria-label={t.title} onClick={t.run}>
            {t.label}
          </button>
        ))}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const src = await putAsset(file);
            insertBlock(`![${file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")}](${src})`);
          }}
        />
        <label className="post-autocorrect" title="Fixes common typos as you type (teh → the, dont → don’t), curls quotes and turns -- into a dash. Press Backspace straight after a fix to undo it.">
          <input
            type="checkbox"
            checked={fixing}
            onChange={(e) => {
              setFixing(e.target.checked);
              setAutocorrectOn(e.target.checked);
            }}
          />{" "}
          Auto-correct
        </label>
        {status && <span className="post-status">{status}</span>}
      </div>
      <div className="post-panes">
        <textarea
          ref={areaRef}
          className="post-source"
          aria-label="Post"
          placeholder="Start writing here. The buttons above add headings, bold, links and pictures; the right side shows how it will look."
          autoFocus={!body}
          value={body}
          spellCheck
          onChange={(e) => {
            const area = e.target;
            const fix = fixing ? autocorrect(body, area.value, area.selectionStart) : null;
            lastFix.current = fix;
            if (fix) {
              area.value = fix.text;
              area.setSelectionRange(fix.caret, fix.caret);
            }
            setBody(area.value);
          }}
          onKeyDown={(e) => {
            const fix = lastFix.current;
            lastFix.current = null;
            if (fix && e.key === "Backspace" && body === fix.text) {
              e.preventDefault();
              const area = e.currentTarget;
              area.value = fix.undo.text;
              area.setSelectionRange(fix.undo.caret, fix.undo.caret);
              setBody(fix.undo.text);
              return;
            }
            if (!(e.ctrlKey || e.metaKey)) return;
            const key = e.key.toLowerCase();
            if (key === "b") (e.preventDefault(), wrap("**"));
            else if (key === "i") (e.preventDefault(), wrap("_"));
            else if (key === "k") (e.preventDefault(), wrap("[", "](https://)", "link text"));
            else if (key === "s") (e.preventDefault(), save(false));
          }}
        />
        <div className="post-preview site-root" style={themeVars(state.site.theme)}>
          <h1 className="post-preview-title">{title}</h1>
          <div className="b-article">
            <Markdown text={body} ctx={ctx} />
          </div>
        </div>
      </div>
    </dialog>
  );
}
