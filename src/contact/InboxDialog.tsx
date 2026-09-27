import { useEffect, useMemo, useRef, useState } from "react";
import { openGuide } from "../guides/GuideHost";
import { desktop } from "../platform/desktop";
import { cls } from "../util/cls";

type Message = { id: string; form: string; created: string; data: Record<string, string> };

const readKey = (siteId: string) => `fayteworks:inbox-read:${siteId}`;
const loadRead = (siteId: string): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(readKey(siteId)) ?? "[]"));
  } catch {
    return new Set();
  }
};

const pick = (data: Record<string, string>, re: RegExp) => Object.entries(data).find(([k]) => re.test(k))?.[1] ?? "";
const emailOf = (m: Message) => pick(m.data, /e-?mail/i) || Object.values(m.data).find((v) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) || "";

export function InboxDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [siteId, setSiteId] = useState<string | null | undefined>(undefined);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState("");
  const [query, setQuery] = useState("");
  const [read, setRead] = useState<Set<string>>(new Set());
  useEffect(() => ref.current?.showModal(), []);
  useEffect(() => void desktop!.projectConfig().then((c) => setSiteId(c.netlify?.siteId ?? null)), []);

  async function refresh(id = siteId) {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const list = await desktop!.platformCall("netlifySubmissions", id);
      setMessages(list.sort((a, b) => b.created.localeCompare(a.created)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!siteId) return;
    setRead(loadRead(siteId));
    void refresh(siteId);
  }, [siteId]);

  function markRead(id: string) {
    if (!siteId || read.has(id)) return;
    const next = new Set(read).add(id);
    setRead(next);
    try {
      localStorage.setItem(readKey(siteId), JSON.stringify([...next].slice(-2000)));
    } catch {
    }
  }

  async function remove(m: Message) {
    if (!window.confirm("Delete this message? It's removed from Netlify too.")) return;
    try {
      await desktop!.platformCall("netlifyDeleteSubmission", m.id);
      setMessages((all) => all?.filter((x) => x.id !== m.id) ?? null);
      setOpenId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function downloadCsv() {
    const rows = shown;
    const keys = [...new Set(rows.flatMap((m) => Object.keys(m.data)))];
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [["received", "form", ...keys].map(cell).join(","), ...rows.map((m) => [m.created, m.form, ...keys.map((k) => m.data[k] ?? "")].map(cell).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "messages.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const forms = useMemo(() => [...new Set((messages ?? []).map((m) => m.form).filter(Boolean))], [messages]);
  const q = query.trim().toLowerCase();
  const shown = (messages ?? []).filter((m) => (!form || m.form === form) && (!q || Object.values(m.data).some((v) => v.toLowerCase().includes(q))));
  const open = shown.find((m) => m.id === openId) ?? null;
  const unread = (messages ?? []).filter((m) => !read.has(m.id)).length;

  return (
    <dialog ref={ref} className="dialog inbox-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Inbox{unread ? ` (${unread} new)` : ""}</h2>
        <div className="inbox-tools">
          {messages && (
            <>
              <input type="search" placeholder="Search" aria-label="Search messages" value={query} onChange={(e) => setQuery(e.target.value)} />
              {forms.length > 1 && (
                <select aria-label="Form" value={form} onChange={(e) => setForm(e.target.value)}>
                  <option value="">All forms</option>
                  {forms.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              )}
              <button className="btn btn--small" disabled={!shown.length} onClick={downloadCsv}>
                Download CSV
              </button>
            </>
          )}
          <button className="btn btn--small" disabled={busy || !siteId} onClick={() => void refresh()}>
            {busy ? "Checking…" : "↻ Check"}
          </button>
          <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
      </header>
      {siteId === null ? (
        <div className="inbox-empty">
          <p>The inbox shows messages from your site's contact forms when the site is on Netlify (Netlify Forms is free and built in).</p>
          <button className="btn btn--primary" onClick={() => (onClose(), openGuide("forms-inbox"))}>
            📘 Show me how
          </button>
        </div>
      ) : (
        <div className="inbox-body">
          <ul className="inbox-list">
            {shown.map((m) => {
              const name = pick(m.data, /name/i) || emailOf(m) || "Someone";
              const preview = pick(m.data, /message|body|comment|question|note/i) || Object.values(m.data).join(" · ");
              return (
                <li key={m.id}>
                  <button
                    className={cls("inbox-item", m.id === openId && "is-open", !read.has(m.id) && "is-unread")}
                    onClick={() => {
                      setOpenId(m.id);
                      markRead(m.id);
                    }}
                  >
                    <strong>{name}</strong>
                    <span className="inbox-when">{new Date(m.created).toLocaleString()}</span>
                    <span className="inbox-preview">{preview}</span>
                    {m.form && <em>{m.form}</em>}
                  </button>
                </li>
              );
            })}
            {messages && !shown.length && <li className="inbox-none">{messages.length ? "No messages match." : "No messages yet."}</li>}
          </ul>
          <section className="inbox-detail">
            {error && <p className="dialog-status dialog-status--error">{error}</p>}
            {open ? (
              <>
                <p className="inbox-meta">
                  {open.form ? `${open.form} · ` : ""}
                  {new Date(open.created).toLocaleString()}
                </p>
                <dl>
                  {Object.entries(open.data).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k.replace(/[-_]+/g, " ")}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="field-row">
                  {emailOf(open) && (
                    <button className="btn btn--primary" onClick={() => void desktop!.openExternal(`mailto:${emailOf(open)}?subject=${encodeURIComponent(`Re: your message${open.form ? ` (${open.form})` : ""}`)}`)}>
                      Reply by email
                    </button>
                  )}
                  <button className="btn" onClick={() => void remove(open)}>
                    Delete
                  </button>
                </div>
              </>
            ) : (
              !error && <p className="field-hint">{messages ? "Pick a message." : "Checking for messages…"}</p>
            )}
          </section>
        </div>
      )}
    </dialog>
  );
}
