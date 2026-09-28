import { useEffect, useRef, useState } from "react";
import { allSections } from "../model/ops";
import type { Block } from "../model/types";
import { desktop, type MediaApp } from "../platform/desktop";
import { getAsset, isAssetRef, putAsset } from "../state/assets";
import { useEditor } from "../state/store";
import { buildVtt, formatTime, parseCaptions, type Cue } from "./captions";
import type { MediaEdit, MediaInfo } from "./process";

export const srcKey = (block: Block) => (block.type === "video" ? "url" : "src");

const APP_KEY = "fayteworks:media-app";
const readApp = (kind: string) => {
  try {
    return localStorage.getItem(`${APP_KEY}:${kind}`) ?? "";
  } catch {
    return "";
  }
};
const saveApp = (kind: string, path: string) => {
  try {
    localStorage.setItem(`${APP_KEY}:${kind}`, path);
  } catch {
  }
};

async function blobOf(ref: string): Promise<Blob> {
  if (isAssetRef(ref)) {
    const asset = await getAsset(ref);
    if (!asset) throw new Error("The file couldn't be found.");
    return asset.blob;
  }
  return (await fetch(ref)).blob();
}

const sizeLabel = (bytes: number) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);

export function MediaSync() {
  const { commit } = useEditor();
  useEffect(() => {
    if (!desktop) return;
    return desktop.onMediaChanged(async ({ blockId, type, data }) => {
      const ref = await putAsset(new Blob([new Uint8Array(data)], { type }));
      commit((draft) => {
        const block = allSections(draft)
          .flatMap((s) => s.blocks)
          .find((b) => b.id === blockId && (b.type === "video" || b.type === "audio"));
        if (block) block.props[srcKey(block)] = ref;
      });
    });
  }, [commit]);
  return null;
}

export function MediaTools({ block, mutate }: { block: Block; mutate: (recipe: (b: Block) => void, key?: string) => void }) {
  const src = String(block.props[srcKey(block)] ?? "");
  const kind = block.type === "video" ? "video" : "audio";
  const uploaded = isAssetRef(src) || src.startsWith("data:") || src.startsWith("blob:");
  const [dialog, setDialog] = useState<"trim" | "captions" | null>(null);
  const [apps, setApps] = useState<MediaApp[]>([]);
  const [appPath, setAppPath] = useState(() => readApp(kind));
  const [watching, setWatching] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!desktop) return;
    void desktop.mediaApps().then((found) => {
      const mine = found.filter((a) => a.kind === kind || kind === "audio");
      setApps(mine);
      if (!readApp(kind) && mine[0]) setAppPath(mine.find((a) => a.kind === kind)?.path ?? mine[0].path);
    });
  }, [kind]);
  useEffect(() => () => void desktop?.stopEditingMedia(block.id).catch(() => {}), [block.id]);

  if (!uploaded) return null;
  const app = apps.find((a) => a.path === appPath);

  async function openOutside() {
    setError("");
    try {
      const blob = await blobOf(src);
      const ext = blob.type.split("/")[1]?.replace("mpeg", "mp3").replace("quicktime", "mov").replace("x-matroska", "mkv") || "bin";
      const result = await desktop!.editMedia(block.id, `${block.name || kind}.${ext === "mp4" && kind === "audio" ? "m4a" : ext}`, new Uint8Array(await blob.arrayBuffer()), appPath || null);
      setWatching(result.exportDir);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="inspector-group media-tools">
      <h3 className="panel-heading">{kind === "video" ? "Video tools" : "Audio tools"}</h3>
      <div className="vector-file-row">
        <button className="btn btn--small" onClick={() => setDialog("trim")}>
          ✂ Trim &amp; tidy
        </button>
        {kind === "video" && (
          <button className="btn btn--small" onClick={() => setDialog("captions")}>
            Captions{block.props.captions ? " ✓" : ""}
          </button>
        )}
      </div>
      {desktop && (
        <div className="vector-outside">
          <div className="vector-outside-row">
            <select
              aria-label={`Program for editing ${kind}`}
              value={appPath}
              onChange={(e) => {
                setAppPath(e.target.value);
                saveApp(kind, e.target.value);
              }}
            >
              {apps.map((a) => (
                <option key={a.path} value={a.path}>
                  {a.name}
                </option>
              ))}
              <option value="">Default program</option>
            </select>
            <button className="btn" onClick={() => void openOutside()}>
              Open
            </button>
          </div>
          {watching ? (
            <p className="field-hint vector-watching">
              ● Export your finished {kind} into the “export here” folder that opened: it replaces this one.{" "}
              <button className="link-button" onClick={() => void desktop!.showFolder(watching)}>
                Show folder
              </button>
            </p>
          ) : (
            <p className="field-hint">
              {apps.length === 0
                ? `No ${kind === "video" ? "video editor (DaVinci Resolve, Shotcut, Kdenlive, Premiere)" : "audio editor (Audacity)"} found; the default program opens it.`
                : app && !app.opensFiles
                  ? `${app.name} opens empty: import the clip from the folder that opens, then export into “export here”.`
                  : `Edit in ${app?.name ?? "your program"}, then export into the “export here” folder: it replaces the clip here.`}
            </p>
          )}
        </div>
      )}
      {error && <p className="dialog-note">{error}</p>}
      {dialog === "trim" && <TrimDialog kind={kind} src={src} onClose={() => setDialog(null)} onDone={(ref, poster) => mutate((b) => {
        if (ref) b.props[srcKey(b)] = ref;
        if (poster) b.props.poster = poster;
      })} />}
      {dialog === "captions" && (
        <CaptionsDialog
          src={src}
          captions={String(block.props.captions ?? "")}
          lang={String(block.props.captionsLang ?? "en")}
          on={Boolean(block.props.captionsOn)}
          onClose={() => setDialog(null)}
          onSave={(ref, lang, on) =>
            mutate((b) => {
              b.props.captions = ref;
              b.props.captionsLang = lang;
              b.props.captionsOn = on;
            })
          }
        />
      )}
    </section>
  );
}

function useObjectUrl(src: string) {
  const [url, setUrl] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => {
    let made = "";
    void blobOf(src).then((b) => {
      made = URL.createObjectURL(b);
      setBlob(b);
      setUrl(made);
    });
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [src]);
  return { url, blob };
}

function useDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return ref;
}

export function TrimBody({ kind, src, onClose, onDone }: { kind: "video" | "audio"; src: string; onClose: () => void; onDone: (ref: string | null, poster?: string) => void }) {
  const { url, blob } = useObjectUrl(src);
  const player = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [edit, setEdit] = useState<MediaEdit>({ start: 0, end: 0, aspect: "", maxSide: 0, quality: "high", mute: false, fadeIn: 0, fadeOut: 0, format: kind === "video" ? "mp4" : "m4a" });
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!blob) return;
    void import("./process").then(async ({ mediaInfo, defaultAudioFormat }) => {
      try {
        const found = await mediaInfo(blob);
        setInfo(found);
        const format = kind === "audio" ? await defaultAudioFormat() : "mp4";
        setEdit((e) => ({ ...e, end: found.duration, format }));
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    });
  }, [blob, kind]);

  const set = (patch: Partial<MediaEdit>) => setEdit((e) => ({ ...e, ...patch }));
  const now = () => player.current?.currentTime ?? 0;

  async function apply() {
    if (!blob) return;
    setStatus("");
    setProgress(0);
    abort.current = new AbortController();
    try {
      const { processMedia } = await import("./process");
      const result = await processMedia(blob, kind, edit, setProgress, abort.current.signal);
      const ref = await putAsset(result);
      onDone(ref);
      setStatus(`Done: ${sizeLabel(blob.size)} → ${sizeLabel(result.size)}.`);
      setTimeout(onClose, 900);
    } catch (e) {
      setStatus(abort.current?.signal.aborted ? "Cancelled." : e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  async function poster() {
    const { frameAt } = await import("./process");
    const png = await frameAt(url, now());
    onDone(null, await putAsset(png));
    setStatus(`Poster set from ${formatTime(now()).slice(3, 8)}.`);
  }

  const duration = info?.duration ?? 0;
  return (
    <div className="media-body">
      {kind === "video" ? <video ref={player} className="media-preview" src={url || undefined} controls /> : <audio ref={player} className="media-preview" src={url || undefined} controls />}
      {info && (
        <p className="field-hint">
          {formatTime(duration).slice(0, 8)} long{info.width ? `, ${info.width} × ${info.height}` : ""}
          {blob ? `, ${sizeLabel(blob.size)}` : ""}.
        </p>
      )}
      <div className="media-grid">
        <label className="field">
          <span className="field-label">Start ({edit.start.toFixed(1)} s)</span>
          <input type="range" min={0} max={duration} step={0.1} value={edit.start} onChange={(e) => set({ start: Math.min(Number(e.target.value), edit.end - 0.1) })} />
          <button className="link-button" onClick={() => set({ start: Math.min(now(), edit.end - 0.1) })}>
            Start at the playhead
          </button>
        </label>
        <label className="field">
          <span className="field-label">End ({edit.end.toFixed(1)} s)</span>
          <input type="range" min={0} max={duration} step={0.1} value={edit.end} onChange={(e) => set({ end: Math.max(Number(e.target.value), edit.start + 0.1) })} />
          <button className="link-button" onClick={() => set({ end: Math.max(now(), edit.start + 0.1) })}>
            End at the playhead
          </button>
        </label>
        {kind === "video" && (
          <>
            <label className="field">
              <span className="field-label">Crop to</span>
              <select value={edit.aspect} onChange={(e) => set({ aspect: e.target.value as MediaEdit["aspect"] })}>
                <option value="">Whole frame</option>
                <option value="16:9">16 : 9 (wide)</option>
                <option value="4:3">4 : 3</option>
                <option value="1:1">1 : 1 (square)</option>
                <option value="4:5">4 : 5 (portrait post)</option>
                <option value="9:16">9 : 16 (story, reel)</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Size for the web</span>
              <select value={edit.maxSide} onChange={(e) => set({ maxSide: Number(e.target.value) })}>
                <option value={0}>Keep</option>
                <option value={1920}>1080p (1920)</option>
                <option value={1280}>720p (1280)</option>
                <option value={854}>480p (854)</option>
              </select>
            </label>
          </>
        )}
        <label className="field">
          <span className="field-label">Quality</span>
          <select value={edit.quality} onChange={(e) => set({ quality: e.target.value as MediaEdit["quality"] })}>
            <option value="high">High</option>
            <option value="medium">Medium (smaller)</option>
            <option value="low">Low (smallest)</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">File type</span>
          <select value={edit.format} onChange={(e) => set({ format: e.target.value as MediaEdit["format"] })}>
            {kind === "video" ? (
              <>
                <option value="mp4">MP4 (plays everywhere)</option>
                <option value="webm">WebM (smaller, modern browsers)</option>
              </>
            ) : (
              <>
                <option value="m4a">M4A (AAC)</option>
                <option value="ogg">OGG (Opus, small)</option>
                <option value="wav">WAV (uncompressed)</option>
              </>
            )}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Fade in (s)</span>
          <input type="number" min={0} step={0.5} value={edit.fadeIn} disabled={edit.mute} onChange={(e) => set({ fadeIn: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
        <label className="field">
          <span className="field-label">Fade out (s)</span>
          <input type="number" min={0} step={0.5} value={edit.fadeOut} disabled={edit.mute} onChange={(e) => set({ fadeOut: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
      </div>
      {kind === "video" && info?.hasAudio && (
        <label className="catalogue-check">
          <input type="checkbox" checked={edit.mute} onChange={(e) => set({ mute: e.target.checked })} />
          Remove the sound (background videos)
        </label>
      )}
      {progress !== null && (
        <div className="media-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {status && <p className="field-hint media-status">{status}</p>}
      <div className="field-row media-actions">
        {kind === "video" && (
          <button className="btn" disabled={!url} onClick={() => void poster()}>
            Use this frame as the poster
          </button>
        )}
        {progress !== null ? (
          <button className="btn" onClick={() => abort.current?.abort()}>
            Cancel
          </button>
        ) : (
          <button className="btn btn--primary" disabled={!info} onClick={() => void apply()}>
            Apply
          </button>
        )}
      </div>
    </div>
  );
}

function TrimDialog(props: { kind: "video" | "audio"; src: string; onClose: () => void; onDone: (ref: string | null, poster?: string) => void }) {
  const dialogRef = useDialog();
  return (
    <dialog ref={dialogRef} className="dialog media-dialog" onClose={props.onClose} onCancel={props.onClose}>
      <header className="dialog-header">
        <h2>Trim &amp; tidy</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={props.onClose}>
          ✕
        </button>
      </header>
      <TrimBody {...props} />
    </dialog>
  );
}

export function CaptionsBody({ src, captions, lang, on, onClose, onSave }: { src: string; captions: string; lang: string; on: boolean; onClose: () => void; onSave: (ref: string, lang: string, on: boolean) => void }) {
  const { url } = useObjectUrl(src);
  const player = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [language, setLanguage] = useState(lang);
  const [showByDefault, setShowByDefault] = useState(on);

  useEffect(() => {
    if (!captions) return;
    void blobOf(captions)
      .then((b) => b.text())
      .then((text) => setCues(parseCaptions(text)))
      .catch(() => {});
  }, [captions]);

  const update = (i: number, patch: Partial<Cue>) => setCues((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const now = () => player.current?.currentTime ?? 0;

  async function save() {
    const ref = await putAsset(new Blob([buildVtt(cues)], { type: "text/vtt" }));
    onSave(ref, language.trim() || "en", showByDefault);
    onClose();
  }

  return (
    <div className="media-body">
      <video ref={player} className="media-preview" src={url || undefined} controls />
      <p className="field-hint">Captions help people watching without sound, and people who are deaf or hard of hearing. Pause where a line starts and add it.</p>
      <div className="captions-list">
        {cues.map((cue, i) => (
          <div key={i} className="caption-row">
            <input type="number" step={0.1} min={0} aria-label="Starts at (seconds)" value={Math.round(cue.start * 10) / 10} onChange={(e) => update(i, { start: Number(e.target.value) })} />
            <input type="number" step={0.1} min={0} aria-label="Ends at (seconds)" value={Math.round(cue.end * 10) / 10} onChange={(e) => update(i, { end: Number(e.target.value) })} />
            <input type="text" aria-label="Caption text" value={cue.text} onChange={(e) => update(i, { text: e.target.value })} />
            <button className="btn btn--ghost" aria-label="Remove caption" onClick={() => setCues((list) => list.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="field-row">
        <button className="btn btn--small" onClick={() => setCues((list) => [...list, { start: now(), end: now() + 3, text: "" }].sort((a, b) => a.start - b.start))}>
          + Add a line at the playhead
        </button>
        <button className="btn btn--small" onClick={() => fileRef.current?.click()}>
          Import .vtt / .srt…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".vtt,.srt,text/vtt"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) setCues(parseCaptions(await file.text()));
          }}
        />
      </div>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Language code</span>
          <input type="text" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" />
        </label>
        <label className="catalogue-check">
          <input type="checkbox" checked={showByDefault} onChange={(e) => setShowByDefault(e.target.checked)} />
          Show captions without being asked
        </label>
      </div>
      <div className="field-row media-actions">
        <button className="btn btn--primary" onClick={() => void save()}>
          Save captions
        </button>
      </div>
    </div>
  );
}

function CaptionsDialog(props: { src: string; captions: string; lang: string; on: boolean; onClose: () => void; onSave: (ref: string, lang: string, on: boolean) => void }) {
  const dialogRef = useDialog();
  return (
    <dialog ref={dialogRef} className="dialog media-dialog" onClose={props.onClose} onCancel={props.onClose}>
      <header className="dialog-header">
        <h2>Captions</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={props.onClose}>
          ✕
        </button>
      </header>
      <CaptionsBody {...props} />
    </dialog>
  );
}
