import { useEffect, useRef, useState } from "react";
import { noteUpload } from "../quality/altText";
import { putAsset } from "../state/assets";
import { useEditor } from "../state/store";

interface Result {
  id: string;
  title: string;
  creator: string;
  license: string;
  url: string;
  thumbnail: string;
  foreign_landing_url: string;
  width: number;
  height: number;
  source: string;
}

const API = "https://api.openverse.org/v1/images/";

export function describeFromTitle(title: string): string {
  const t = title.replace(/\((explore|explored)\)/gi, "").replace(/\b(img|dsc|pxl)[-_]?\d+\b/gi, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length < 3 ? "" : t.charAt(0).toUpperCase() + t.slice(1);
}

export function PhotoPicker({ onPick, onClose }: { onPick: (ref: string) => void; onClose: () => void }) {
  const { commit } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => ref.current?.showModal(), []);

  async function search(q: string, p = 1) {
    if (!q.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API}?q=${encodeURIComponent(q.trim())}&license=cc0,pdm&page_size=24&page=${p}&mature=false`);
      if (!res.ok) throw new Error(res.status === 429 ? "Too many searches for now; try again in a minute." : `Search failed (${res.status}).`);
      const data = (await res.json()) as { results: Result[] };
      setResults((prev) => (p > 1 && prev ? [...prev, ...data.results] : data.results));
      setPage(p);
    } catch (e) {
      setError(e instanceof Error && !/fetch/i.test(e.message) ? e.message : "Couldn't reach Openverse. Are you online?");
    } finally {
      setBusy(false);
    }
  }

  async function use(r: Result) {
    setBusy(true);
    setError("");
    try {
      let blob: Blob | null = null;
      for (const url of [r.url, r.thumbnail]) {
        try {
          const res = await fetch(url);
          const b = res.ok ? await res.blob() : null;
          if (b && /^image\//.test(b.type)) {
            blob = b;
            break;
          }
        } catch {
        }
      }
      if (!blob) throw new Error("That photo couldn't be downloaded. Try another one.");
      const assetRef = await putAsset(blob);
      commit((d) => {
        d.mediaCredits = { ...d.mediaCredits, [assetRef]: { title: r.title, creator: r.creator, license: r.license === "pdm" ? "Public domain" : "CC0", source: r.foreign_landing_url } };
      });
      noteUpload("", describeFromTitle(r.title));
      onPick(assetRef);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog photo-picker" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Free photos</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <form
        className="field-row photo-search"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <input type="search" autoFocus placeholder="Search: coffee, mountains, hands typing…" aria-label="Search photos" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn btn--primary" disabled={busy || !query.trim()}>
          Search
        </button>
      </form>
      <p className="field-hint">Only CC0 and public-domain photos: free to use anywhere, no credit needed (the source is noted in your site's notices anyway). From Openverse.</p>
      {error && <p className="dialog-status dialog-status--error">{error}</p>}
      <div className="photo-body">
        <ul className="photo-grid">
          {results?.map((r) => (
            <li key={r.id}>
              <button className={chosen?.id === r.id ? "is-chosen" : undefined} onClick={() => setChosen(r)} title={r.title}>
                <img src={r.thumbnail} alt={r.title} loading="lazy" />
              </button>
            </li>
          ))}
          {results && !results.length && <li className="photo-none">No free photos found. Try a simpler word.</li>}
        </ul>
        {chosen && (
          <aside className="photo-detail">
            <img src={chosen.thumbnail} alt={chosen.title} />
            <strong>{chosen.title || "Untitled"}</strong>
            <span>
              by {chosen.creator || "unknown"} · {chosen.license === "pdm" ? "Public domain" : "CC0"} · {chosen.source}
            </span>
            <span>
              {chosen.width}×{chosen.height}
            </span>
            <button className="btn btn--primary" disabled={busy} onClick={() => void use(chosen)}>
              {busy ? "Adding…" : "Use this photo"}
            </button>
          </aside>
        )}
      </div>
      {results && results.length >= page * 24 && (
        <button className="btn btn--small photo-more" disabled={busy} onClick={() => void search(query, page + 1)}>
          More
        </button>
      )}
    </dialog>
  );
}
