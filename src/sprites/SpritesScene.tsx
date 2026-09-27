import { useEffect, useRef, useState } from "react";
import type { SpriteSet } from "../model/types";
import { desktop } from "../platform/desktop";
import { assetUrl, putAsset, useAssetVersion } from "../state/assets";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import { createId } from "../util/id";
import { decodeSprites, type Decoded } from "./decode";
import { composeSheet, frameCount, guessGrid, spriteCss, spriteStyle, stateClass } from "./sprites";

const LICENCES: { value: SpriteSet["licence"]; label: string; what: string }[] = [
  { value: "own", label: "My own art", what: "You made it." },
  { value: "cc0", label: "Public domain (CC0)", what: "Free for anything, no credit needed. Kenney and many OpenGameArt sets." },
  { value: "ccby", label: "Free with credit (CC-BY)", what: "Free to use if you credit the artist. Write the credit below." },
  { value: "permission", label: "I have permission", what: "The artist said yes, or you bought a licence." },
  { value: "reference", label: "Reference only", what: "Someone else's characters, like ripped game sprites. Fine for practice; it can't be published." }
];

const SOURCES = [
  { name: "OpenGameArt", url: "https://opengameart.org/art-search-advanced?field_art_type_tid%5B%5D=9", note: "Thousands of free sprites. Check each one's licence." },
  { name: "itch.io game assets", url: "https://itch.io/game-assets/free/tag-sprites", note: "Free and paid packs from indie artists." },
  { name: "Kenney", url: "https://kenney.nl/assets", note: "Huge public-domain packs (CC0)." }
];

const guessLicence = (source: string): SpriteSet["licence"] => (/kenney\.nl/i.test(source) ? "cc0" : /spriters-resource|vg-resource/i.test(source) ? "reference" : "own");

function candidates(html: string, base: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/(?:href|src|content)=["']([^"']+\.(?:png|gif|webp|zip|json))(?:\?[^"']*)?["']/gi)) {
    try {
      found.add(new URL(m[1], base).toString());
    } catch {
      continue;
    }
  }
  return [...found].slice(0, 40);
}

function Tile({ set, url, frame, active, onClick, label }: { set: SpriteSet; url: string; frame: number; active?: boolean; onClick?: () => void; label?: string }) {
  return (
    <button type="button" className={cls("sprite-tile", active && "is-active")} onClick={onClick} title={label ?? `Frame ${frame + 1}`}>
      <span className="fw-sprite" style={spriteStyle(set, url, frame)} />
      <small>{frame + 1}</small>
    </button>
  );
}

interface Pending {
  decoded: Decoded;
  name: string;
  licence: SpriteSet["licence"];
  credit: string;
  source: string;
}

export function SpritesScene({ id }: { id?: string }) {
  const { state, commit } = useEditor();
  useAssetVersion();
  const sets = state.site.sprites ?? [];
  const [selected, setSelected] = useState<string | undefined>(id ?? sets[0]?.id);
  const [stateId, setStateId] = useState<string | undefined>();
  const [pending, setPending] = useState<Pending | null>(null);
  const [links, setLinks] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const set = sets.find((s) => s.id === selected);
  const sheetUrl = set ? assetUrl(set.sheet) : "";
  const current = set?.states.find((s) => s.id === stateId) ?? set?.states[0];

  useEffect(() => {
    setDims(null);
    if (!sheetUrl) return;
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = sheetUrl;
  }, [sheetUrl]);

  const edit = (recipe: (s: SpriteSet) => void, key?: string) =>
    commit((d) => {
      const s = d.sprites?.find((x) => x.id === selected);
      if (s) recipe(s);
    }, key && `sprite.${selected}.${key}`);

  async function take(files: File[], source = "") {
    setError("");
    setBusy("Reading…");
    try {
      const decoded = await decodeSprites(files);
      setPending({ decoded, name: decoded.name, licence: guessLicence(source), credit: "", source });
      setLinks([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function fetchUrl(address: string) {
    setError("");
    setBusy("Downloading…");
    try {
      if (desktop) {
        const got = await desktop.fetchFile(address);
        if (got.html !== undefined) {
          const found = candidates(got.html, got.url);
          setLinks(found);
          if (!found.length) setError("No sprite files were linked on that page. Open it, download the file, and drop it here.");
          return;
        }
        await take([new File([got.bytes!.slice()], got.name, { type: got.type })], address);
      } else {
        const r = await fetch(address);
        if (!r.ok) throw new Error(`The site answered ${r.status}.`);
        await take([new File([await r.blob()], address.split("/").pop() || "sprite", { type: r.headers.get("content-type") ?? "" })], address);
      }
    } catch (e) {
      setError(desktop ? (e instanceof Error ? e.message : String(e)) : "In the browser most sites don't allow this. Download the file and drop it here (the desktop app can fetch it directly).");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!pending) return;
    setBusy("Saving…");
    try {
      const d = pending.decoded;
      let blob: Blob;
      let grid: { frameW: number; frameH: number; columns: number; rows: number };
      let states: SpriteSet["states"] = [];
      if (d.kind === "sheet" && d.sheet) {
        blob = d.sheet;
        const bmp = await createImageBitmap(d.sheet);
        const g = guessGrid(bmp.width, bmp.height);
        grid = { ...g, columns: Math.max(1, Math.floor(bmp.width / g.frameW)), rows: Math.max(1, Math.floor(bmp.height / g.frameH)) };
        states = [{ id: createId("st"), name: "idle", frames: Array.from({ length: grid.columns }, (_, i) => i), fps: 8, loop: true }];
      } else {
        const sheet = await composeSheet(d.frames ?? []);
        blob = sheet.blob;
        grid = sheet;
        states = (d.states ?? []).map((s) => ({ id: createId("st"), name: s.name, frames: s.frames, fps: s.fps ?? 10, loop: true }));
      }
      const src = await putAsset(new Blob([blob], { type: blob.type || "image/png" }));
      const made: SpriteSet = { id: createId("spr"), name: pending.name.trim() || "Sprite", sheet: src, ...grid, pixelated: grid.frameW <= 96, states, licence: pending.licence, credit: pending.credit || undefined, source: pending.source || undefined };
      commit((draft) => void (draft.sprites = [...(draft.sprites ?? []), made]));
      setSelected(made.id);
      setStateId(made.states[0]?.id);
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const regrid = (frameW: number, frameH: number) =>
    edit((s) => {
      s.frameW = Math.max(1, Math.round(frameW));
      s.frameH = Math.max(1, Math.round(frameH));
      if (dims) {
        s.columns = Math.max(1, Math.floor(dims.w / s.frameW));
        s.rows = Math.max(1, Math.floor(dims.h / s.frameH));
      }
      const max = s.columns * s.rows;
      s.states.forEach((st) => (st.frames = st.frames.filter((f) => f < max)));
    }, "grid");

  return (
    <div className="sprites-layout">
      <aside className="sprites-side">
        <h3>Your sprites</h3>
        {sets.map((s) => (
          <button key={s.id} className={cls("sprites-set", s.id === selected && !pending && "is-active")} onClick={() => (setPending(null), setSelected(s.id), setStateId(undefined))}>
            <span className="fw-sprite" style={spriteStyle(s, assetUrl(s.sheet), s.states[0]?.frames[0] ?? 0)} />
            <span>
              <strong>{s.name}</strong>
              <small>
                {s.states.length} state{s.states.length === 1 ? "" : "s"}
                {s.licence === "reference" ? " · reference only" : ""}
              </small>
            </span>
          </button>
        ))}
        <button
          className={cls("sprites-drop", over && "is-over")}
          onClick={() => input.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void take([...e.dataTransfer.files]);
          }}
        >
          <strong>Drop sprites here</strong>
          <small>A sheet, a GIF, frames, an Aseprite or TexturePacker file, or a ZIP</small>
        </button>
        <input ref={input} type="file" hidden multiple accept=".png,.gif,.webp,.jpg,.jpeg,.json,.zip,image/*" onChange={(e) => (void take([...(e.target.files ?? [])]), (e.target.value = ""))} />
        <label className="scene-field">
          <span>Or paste a web address</span>
          <div className="sprites-url">
            <input type="url" placeholder="https://opengameart.org/content/…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="btn" disabled={!url.trim() || Boolean(busy)} onClick={() => void fetchUrl(url.trim())}>
              Get
            </button>
          </div>
        </label>
        {links.length > 0 && (
          <div className="sprites-links">
            <small>Files on that page. Pick one:</small>
            {links.map((l) => (
              <button key={l} className="link-button" onClick={() => void fetchUrl(l)}>
                {decodeURIComponent(l.split("/").pop() ?? l)}
              </button>
            ))}
          </div>
        )}
        <div className="sprites-sources">
          {SOURCES.map((s) => (
            <a key={s.name} href={s.url} target="_blank" rel="noreferrer" className="font-source">
              <strong>{s.name}</strong>
              <small>{s.note}</small>
            </a>
          ))}
        </div>
        {busy && <p className="scene-note">{busy}</p>}
        {error && <p className="dialog-status dialog-status--error">{error}</p>}
      </aside>

      {pending ? (
        <section className="scene-card sprites-pending">
          <h3>Bring in “{pending.name}”</h3>
          <p className="scene-note">
            {pending.decoded.kind === "sheet" ? "A sprite sheet. You'll set the frame size and pick states next." : `${pending.decoded.frames?.length ?? 0} frames${pending.decoded.states?.length ? ` in ${pending.decoded.states.length} state${pending.decoded.states.length === 1 ? "" : "s"}` : ""}. They'll be laid out as one sheet.`}
          </p>
          <label className="scene-field">
            <span>Name</span>
            <input value={pending.name} onChange={(e) => setPending({ ...pending, name: e.target.value })} />
          </label>
          <span className="scene-note">Where is it from?</span>
          {LICENCES.map((l) => (
            <label key={l.value} className={cls("scene-choice", pending.licence === l.value && "is-active")}>
              <input type="radio" name="sprite-licence" checked={pending.licence === l.value} onChange={() => setPending({ ...pending, licence: l.value })} />
              <span>
                <strong>{l.label}</strong>
                <small>{l.what}</small>
              </span>
            </label>
          ))}
          {(pending.licence === "ccby" || pending.licence === "permission") && (
            <label className="scene-field">
              <span>Credit</span>
              <input placeholder="Art by … (link)" value={pending.credit} onChange={(e) => setPending({ ...pending, credit: e.target.value })} />
            </label>
          )}
          <div className="colour-actions">
            <button className="btn" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button className="btn btn--primary" disabled={Boolean(busy)} onClick={() => void save()}>
              Bring it in
            </button>
          </div>
        </section>
      ) : set ? (
        <>
          <section className="scene-card sprites-sheet">
            <style>{spriteCss(set)}</style>
            <div className="dlg-row">
              <label className="scene-field sprites-name">
                <span>Name</span>
                <input value={set.name} onChange={(e) => edit((s) => void (s.name = e.target.value), "name")} />
              </label>
              <label className="scene-field">
                <span>Licence</span>
                <select value={set.licence} onChange={(e) => edit((s) => void (s.licence = e.target.value as SpriteSet["licence"]))}>
                  {LICENCES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {set.licence === "reference" && <p className="font-warning">Reference only: fine for practice, but a site using it can't be published.</p>}
            {(set.licence === "ccby" || set.credit) && (
              <label className="scene-field">
                <span>Credit</span>
                <input value={set.credit ?? ""} onChange={(e) => edit((s) => void (s.credit = e.target.value || undefined), "credit")} />
              </label>
            )}
            <div className="dlg-row sprites-grid-controls">
              <label className="scene-field">
                <span>Frame width</span>
                <input type="number" min={1} value={set.frameW} onChange={(e) => regrid(Number(e.target.value), set.frameH)} />
              </label>
              <label className="scene-field">
                <span>Frame height</span>
                <input type="number" min={1} value={set.frameH} onChange={(e) => regrid(set.frameW, Number(e.target.value))} />
              </label>
              <button className="btn btn--small" disabled={!dims} onClick={() => dims && regrid(guessGrid(dims.w, dims.h).frameW, guessGrid(dims.w, dims.h).frameH)}>
                Guess
              </button>
              <label className="scene-check">
                <input type="checkbox" checked={set.pixelated} onChange={(e) => edit((s) => void (s.pixelated = e.target.checked))} /> Pixel art (keep it crisp)
              </label>
              <span className="scene-note">
                {set.columns} × {set.rows} frames{dims ? ` from a ${dims.w} × ${dims.h} sheet` : ""}
              </span>
            </div>
            <p className="scene-note">{current ? `Click frames to add them to “${current.name}”.` : "Make a state on the right, then click frames to add them."}</p>
            <div className="sprites-frames">
              {Array.from({ length: Math.min(frameCount(set), 600) }, (_, i) => (
                <Tile
                  key={i}
                  set={set}
                  url={sheetUrl}
                  frame={i}
                  active={current?.frames.includes(i)}
                  onClick={() => current && edit((s) => s.states.find((x) => x.id === current.id)?.frames.push(i))}
                />
              ))}
            </div>
            <button
              className="link-button sprites-delete"
              onClick={() => {
                if (!window.confirm(`Delete “${set.name}”? Pieces using it will show nothing. You can undo this.`)) return;
                commit((d) => void (d.sprites = d.sprites?.filter((s) => s.id !== set.id)));
                setSelected(sets.find((s) => s.id !== set.id)?.id);
              }}
            >
              Delete this sprite set
            </button>
          </section>
          <aside className="scene-card sprites-states">
            <div className="scene-card-head">
              <h3>States</h3>
              <button
                className="btn btn--small"
                onClick={() => {
                  const made = { id: createId("st"), name: ["idle", "walk", "talk", "sleep", "jump"][set.states.length] ?? `state ${set.states.length + 1}`, frames: [], fps: 8, loop: true };
                  edit((s) => void s.states.push(made));
                  setStateId(made.id);
                }}
              >
                + New state
              </button>
            </div>
            <div className="sprites-state-list">
              {set.states.map((s) => (
                <button key={s.id} className={cls("style-choice", current?.id === s.id && "is-active")} onClick={() => setStateId(s.id)}>
                  <span className={`fw-sprite ${stateClass(set, s)}`} style={spriteStyle(set, sheetUrl)} />
                  <span>
                    <strong>{s.name}</strong>
                    <small>
                      {s.frames.length} frames · {s.fps} a second
                    </small>
                  </span>
                </button>
              ))}
            </div>
            {current && (
              <div className="sprites-state">
                <span className={`fw-sprite sprites-preview ${stateClass(set, current)}`} style={spriteStyle(set, sheetUrl)} />
                <label className="scene-field">
                  <span>Name</span>
                  <input value={current.name} onChange={(e) => edit((s) => void s.states.forEach((x) => x.id === current.id && (x.name = e.target.value)), `${current.id}.name`)} />
                </label>
                <label className="scene-field">
                  <span>Speed: {current.fps} frames a second</span>
                  <input type="range" min={1} max={30} value={current.fps} onChange={(e) => edit((s) => void s.states.forEach((x) => x.id === current.id && (x.fps = Number(e.target.value))), `${current.id}.fps`)} />
                </label>
                <label className="scene-check">
                  <input type="checkbox" checked={current.loop} onChange={(e) => edit((s) => void s.states.forEach((x) => x.id === current.id && (x.loop = e.target.checked)))} /> Loop
                </label>
                <span className="scene-note">Frames in order (click one to take it out)</span>
                <div className="sprites-strip">
                  {current.frames.map((f, i) => (
                    <Tile key={`${f}-${i}`} set={set} url={sheetUrl} frame={f} label="Take this frame out" onClick={() => edit((s) => void s.states.forEach((x) => x.id === current.id && x.frames.splice(i, 1)))} />
                  ))}
                </div>
                <div className="dlg-row">
                  <button className="btn btn--small" onClick={() => edit((s) => void s.states.forEach((x) => x.id === current.id && (x.frames = [])))}>
                    Clear frames
                  </button>
                  <button className="btn btn--small btn--danger" onClick={() => (edit((s) => void (s.states = s.states.filter((x) => x.id !== current.id))), setStateId(undefined))}>
                    Delete state
                  </button>
                </div>
              </div>
            )}
          </aside>
        </>
      ) : (
        <section className="scene-card sprites-empty">
          <h3>No sprites yet</h3>
          <p className="scene-note">Drop a sprite sheet, a GIF or a pack on the left, or paste an address. Then build states like idle, walk and talk by clicking frames.</p>
        </section>
      )}
    </div>
  );
}
