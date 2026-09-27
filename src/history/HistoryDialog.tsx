import { useEffect, useRef, useState } from "react";
import { migrateSite } from "../model/migrate";
import { useEditor } from "../state/store";
import { deleteVersion, listVersions, readVersion, saveVersion, type VersionMeta } from "./versions";

export const OPEN_HISTORY = "fayteworks:open-history";

const KIND_ICON: Record<VersionMeta["kind"], string> = { auto: "⏱", manual: "★", publish: "⇪", restore: "↺" };

export function VersionKeeper() {
  const { state } = useEditor();
  const last = useRef<number | null>(null);
  const first = useRef(true);
  useEffect(() => {
    void listVersions()
      .then((list) => (last.current = list.filter((v) => v.kind === "auto").reduce((m, v) => Math.max(m, Date.parse(v.at)), 0)))
      .catch(() => (last.current = 0));
  }, []);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (last.current === null || Date.now() - last.current < 60 * 60 * 1000) return;
    last.current = Date.now();
    const site = state.site;
    const timer = window.setTimeout(() => void saveVersion(site, "Automatic", "auto").catch(() => undefined), 3000);
    return () => window.clearTimeout(timer);
  }, [state.site]);
  return null;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  return same(d, today) ? "Today" : same(d, yesterday) ? "Yesterday" : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const { state, load } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const refresh = () => void listVersions().then(setVersions, (e) => setStatus(String(e)));
  useEffect(() => {
    ref.current?.showModal();
    refresh();
  }, []);

  async function saveNamed() {
    await saveVersion(state.site, name.trim() || "Saved version", "manual");
    setName("");
    setStatus("✓ Saved.");
    refresh();
  }

  async function restore(v: VersionMeta) {
    if (!window.confirm(`Go back to “${v.label}” from ${new Date(v.at).toLocaleString()}? The site as it is now is saved first, so you can come back.`)) return;
    try {
      const site = migrateSite(await readVersion(v.id));
      if (!site) throw new Error("That version couldn't be read.");
      await saveVersion(state.site, `Before going back to ${new Date(v.at).toLocaleString()}`, "restore");
      load(site);
      onClose();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }

  const groups = new Map<string, VersionMeta[]>();
  for (const v of versions ?? []) {
    const key = dayLabel(v.at);
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }

  return (
    <dialog ref={ref} className="dialog history-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Version history</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <p className="dialog-lead">A copy of the site is kept every hour while you work, before each export, and before going back. Save one with a name any time.</p>
      <div className="field-row history-save">
        <input type="text" placeholder="Name this version (e.g. Before the redesign)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void saveNamed()} />
        <button className="btn btn--primary" onClick={() => void saveNamed()}>
          ★ Save this version
        </button>
      </div>
      {status && <p className="field-hint">{status}</p>}
      {versions && !versions.length && <p className="field-hint">No versions yet. The first is kept after an hour of work, or save one now.</p>}
      {[...groups].map(([day, list]) => (
        <section key={day} className="history-day">
          <h3 className="panel-heading">{day}</h3>
          <ul className="history-list">
            {list.map((v) => (
              <li key={v.id} className={`history-item is-${v.kind}`}>
                <span className="history-icon" aria-hidden>
                  {KIND_ICON[v.kind]}
                </span>
                <span className="history-time">{new Date(v.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                <span className="history-label">{v.label}</span>
                <span className="history-pages">
                  {v.pages} page{v.pages === 1 ? "" : "s"}
                </span>
                <button className="btn btn--small" onClick={() => void restore(v)}>
                  Go back to this
                </button>
                {v.kind === "manual" && (
                  <button className="pages-delete" title="Delete this version" onClick={() => void deleteVersion(v.id).then(refresh)}>
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </dialog>
  );
}
