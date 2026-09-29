import { useEffect, useRef, useState } from "react";
import { noteUpload } from "../quality/altText";
import { assetUrl, collectMediaRefs, EDITOR_ONLY_PROPS, getAsset, putAsset, useAssetVersion } from "../state/assets";
import { useEditor } from "../state/store";
import { designPicture, designThumbnail } from "../design/exportDesign";
import type { DesignFormat, Page } from "../model/types";
import { slugify } from "../util/slug";

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

type Tab = "upload" | "free" | "mine" | "designs";

export function PicturePicker({ onPick, onClose, initial = "upload" }: { onPick: (ref: string) => void; onClose: () => void; initial?: Tab }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>(initial);
  useEffect(() => ref.current?.showModal(), []);
  const pick = (value: string) => {
    onPick(value);
    onClose();
  };
  return (
    <dialog ref={ref} className="dialog photo-picker" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Choose a picture</h2>
        <div className="catalogue-tabs" role="tablist">
          {(
            [
              ["upload", "Upload"],
              ["free", "Free photos"],
              ["mine", "My pictures"],
              ["designs", "My designs"]
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : undefined} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      {tab === "upload" ? <UploadTab onPick={pick} /> : tab === "free" ? <FreePhotos onPick={pick} /> : tab === "designs" ? <MyDesigns onPick={pick} /> : <MyPictures onPick={pick} />}
    </dialog>
  );
}

function UploadTab({ onPick }: { onPick: (ref: string) => void }) {
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function take(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That isn't a picture. Try a PNG, JPG, WebP, GIF or SVG.");
      return;
    }
    const assetRef = await putAsset(file);
    noteUpload(file.name);
    onPick(assetRef);
  }
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        void take(file);
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  });
  return (
    <div className="picture-upload">
      <button
        className={over ? "picture-drop is-over" : "picture-drop"}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files[0]);
        }}
      >
        <strong>Drop a picture here, or click to choose one</strong>
        <span>You can also paste a copied picture (Ctrl+V).</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void take(file);
        }}
      />
      <form
        className="field-row photo-search"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^https?:\/\//i.test(url.trim())) onPick(url.trim());
          else setError("Paste a full web address starting with https://");
        }}
      >
        <input type="url" placeholder="Or paste a picture's web address: https://…" aria-label="Picture address" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn" disabled={!url.trim()}>
          Use it
        </button>
      </form>
      {error && <p className="dialog-status dialog-status--error">{error}</p>}
    </div>
  );
}

type Design = Page & { design: DesignFormat };

function DesignThumb({ design }: { design: Design }) {
  const { state } = useEditor();
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    designThumbnail(state.site, design, 240).then(
      (url) => live && setSrc(url),
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [design]);
  return src ? <img src={src} alt="" /> : <span className="picture-design-wait">…</span>;
}

function MyDesigns({ onPick }: { onPick: (ref: string) => void }) {
  const { state } = useEditor();
  const designs = state.site.pages.filter((p): p is Design => Boolean(p.design));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (!designs.length) return <p className="panel-hint">No designs yet. Make one with Designs in the left bar (a cover, a sticker, a poster), then pick it here.</p>;
  async function use(design: Design) {
    setBusy(design.id);
    setError("");
    try {
      const blob = await designPicture(state.site, design);
      onPick(await putAsset(new File([blob], `${slugify(design.title) || "design"}.png`, { type: "image/png" })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }
  return (
    <>
      <p className="field-hint">Uses the design's first sheet as a picture. It's a copy: after changing the design, pick it again to update it.</p>
      {error && <p className="dialog-status dialog-status--error">{error}</p>}
      <ul className="photo-grid picture-designs">
        {designs.map((d) => (
          <li key={d.id}>
            <button onClick={() => void use(d)} disabled={Boolean(busy)} title={`Use “${d.title}”`}>
              <DesignThumb design={d} />
              <span>{busy === d.id ? "Making the picture…" : d.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function MyPictures({ onPick }: { onPick: (ref: string) => void }) {
  const { state } = useEditor();
  useAssetVersion();
  const [refs, setRefs] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    const all = [...collectMediaRefs(state.site, new Set(), EDITOR_ONLY_PROPS)].filter((r) => !r.startsWith("data:"));
    void Promise.all(all.map(async (r) => ((await getAsset(r))?.type.startsWith("image/") ? r : null))).then((found) => live && setRefs(found.filter((r): r is string => Boolean(r))));
    return () => {
      live = false;
    };
  }, [state.site]);
  if (!refs) return <p className="panel-hint">Looking through your site…</p>;
  if (!refs.length) return <p className="panel-hint">No pictures in this site yet. Upload one, or pick a free photo.</p>;
  return (
    <>
      <p className="field-hint">Every picture already used somewhere in this site.</p>
      <ul className="photo-grid picture-mine">
        {refs.map((r) => (
          <li key={r}>
            <button onClick={() => onPick(r)} title="Use this picture">
              <img src={assetUrl(r)} alt="" loading="lazy" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function FreePhotos({ onPick }: { onPick: (ref: string) => void }) {
  const { commit } = useEditor();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
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
    </>
  );
}
