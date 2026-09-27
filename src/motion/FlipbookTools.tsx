import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { colorMapOf } from "../blocks/vector";
import { list, num, str } from "../blocks/util";
import type { Block, ListItem } from "../model/types";
import { drawingColors, renderSvg, sanitizeSvg } from "../vector/svg";
import { blankFrameLike, frameAt, framesFromLayers, layersFromFrames } from "./flipbook";

const VectorEditor = lazy(() => import("../vector/VectorEditor"));

export function FlipbookTools({ block, mutate }: { block: Block; mutate: (recipe: (b: Block) => void, key?: string) => void }) {
  const frames = list(block.props.frames).map((f) => str(f.svg as string));
  const selected = Math.min(frames.length - 1, Math.max(0, num(block.props.editFrame, 0)));
  const [editing, setEditing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [previewFrame, setPreviewFrame] = useState(0);
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const colorMap = colorMapOf(block.props);
  const fps = Math.min(60, Math.max(1, num(block.props.fps, 12)));

  useEffect(() => {
    if (!playing) return;
    let step = 0;
    const timer = window.setInterval(() => setPreviewFrame(frameAt(++step, frames.length, Boolean(block.props.pingpong))), 1000 / fps);
    return () => window.clearInterval(timer);
  }, [playing, fps, frames.length, block.props.pingpong]);

  const thumb = (svg: string, key: string) => renderSvg(svg, { scope: `fbt-${block.id}-${key}`, colorMap, values: block.props, fit: "contain", animations: [] });

  function setFrames(next: string[], select?: number) {
    mutate((b) => {
      b.props.frames = next.map((svg) => ({ svg }) as ListItem);
      b.props.editFrame = Math.min(next.length - 1, Math.max(0, select ?? selected));
    });
  }

  function select(i: number) {
    mutate((b) => void (b.props.editFrame = i), `${block.id}.editFrame`);
  }

  async function importLayers(file: File) {
    const split = framesFromLayers(await file.text());
    if (!split.length) {
      setMessage("That file isn't a drawing (SVG) this can read.");
      return;
    }
    if (split.length === 1) {
      setFrames([...frames.slice(0, selected + 1), split[0].svg, ...frames.slice(selected + 1)], selected + 1);
      setMessage("It has no layers, so it was added as one frame.");
      return;
    }
    if (frames.length > 1 && !window.confirm(`Replace the ${frames.length} frames with the ${split.length} layers of “${file.name}”? You can undo this.`)) return;
    setFrames(split.map((f) => f.svg), 0);
    setMessage(`${split.length} frames, from layers ${split.map((f) => f.label).slice(0, 4).join(", ")}${split.length > 4 ? "…" : ""}.`);
  }

  function downloadLayers() {
    const blob = new Blob([layersFromFrames(frames)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(block.name || "flipbook").replace(/[^\w-]+/g, "-").toLowerCase()}-frames.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const onion = [
    selected > 0 && { svg: frames[selected - 1], opacity: 0.3, label: "the frame before" },
    selected < frames.length - 1 && { svg: frames[selected + 1], opacity: 0.15, label: "the frame after" }
  ].filter(Boolean) as { svg: string; opacity: number; label: string }[];

  return (
    <section className="inspector-group flipbook-tools">
      <h3 className="panel-heading">
        Frames ({frames.length}) · {(frames.length / fps).toFixed(frames.length / fps < 1 ? 2 : 1)}s
      </h3>
      <div className="fb-preview" aria-label="Preview">
        <div className="fb-preview-frame" dangerouslySetInnerHTML={{ __html: thumb(frames[playing ? previewFrame : selected] ?? "", "preview") }} />
        <button className="btn btn--small" onClick={() => (setPlaying(!playing), setPreviewFrame(selected))}>
          {playing ? "■ Stop" : "▶ Play"}
        </button>
      </div>
      <ol className="fb-strip">
        {frames.map((svg, i) => (
          <li key={i}>
            <button className={i === selected ? "is-selected" : undefined} title={`Frame ${i + 1}`} aria-pressed={i === selected} onClick={() => select(i)} onDoubleClick={() => (select(i), setEditing(true))}>
              <span dangerouslySetInnerHTML={{ __html: thumb(svg, String(i)) }} />
              <em>{i + 1}</em>
            </button>
          </li>
        ))}
      </ol>
      <div className="field-row fb-actions">
        <button className="btn btn--small btn--primary" onClick={() => setEditing(true)}>
          ✎ Draw frame {selected + 1}
        </button>
        <button className="btn btn--small" title="A copy of this frame, right after it" onClick={() => setFrames([...frames.slice(0, selected + 1), frames[selected], ...frames.slice(selected + 1)], selected + 1)}>
          Duplicate
        </button>
        <button className="btn btn--small" title="An empty frame after this one" onClick={() => setFrames([...frames.slice(0, selected + 1), blankFrameLike(frames[selected]), ...frames.slice(selected + 1)], selected + 1)}>
          + Empty
        </button>
        <button className="btn btn--small" title="Move earlier" disabled={selected === 0} onClick={() => setFrames(frames.map((f, i) => (i === selected - 1 ? frames[selected] : i === selected ? frames[selected - 1] : f)), selected - 1)}>
          ←
        </button>
        <button className="btn btn--small" title="Move later" disabled={selected === frames.length - 1} onClick={() => setFrames(frames.map((f, i) => (i === selected + 1 ? frames[selected] : i === selected ? frames[selected + 1] : f)), selected + 1)}>
          →
        </button>
        <button className="btn btn--small" title="Delete this frame" disabled={frames.length < 2} onClick={() => setFrames(frames.filter((_, i) => i !== selected), selected - 1)}>
          ✕
        </button>
      </div>
      <div className="field-row fb-actions">
        <input ref={fileRef} type="file" accept=".svg,image/svg+xml" hidden onChange={(e) => (e.target.files?.[0] && void importLayers(e.target.files[0]), (e.target.value = ""))} />
        <button className="btn btn--small" title="Each layer of an SVG from Inkscape, Illustrator or Affinity becomes a frame" onClick={() => fileRef.current?.click()}>
          Frames from layers (.svg)…
        </button>
        <button className="btn btn--small" title="All frames as layers in one SVG, to edit in another program and bring back" onClick={downloadLayers}>
          Frames as layers ↓
        </button>
      </div>
      {message && <p className="field-hint">{message}</p>}
      <p className="field-hint">Double-click a frame to draw it. The frames either side show faintly while you draw (onion skin).</p>
      {editing && frames[selected] !== undefined && (
        <Suspense fallback={<div className="vector-editor-loading">Loading the vector editor…</div>}>
          <VectorEditor
            key={selected}
            svg={frames[selected]}
            links={colorMap}
            onion={onion}
            onSave={(next, allLinks) =>
              mutate((b) => {
                const all = list(b.props.frames).map((f) => ({ ...f }));
                all[selected] = { svg: sanitizeSvg(next) };
                b.props.frames = all;
                const used = new Set(all.flatMap((f) => drawingColors(str(f.svg as string)).map((c) => c.color)));
                const kept = list(b.props.colors).filter((c) => !allLinks[String(c.color)] && used.has(String(c.color)));
                b.props.colors = [...kept, ...Object.entries(allLinks).filter(([color]) => used.has(color)).map(([color, token]) => ({ color, token }))];
              })
            }
            onClose={() => setEditing(false)}
          />
        </Suspense>
      )}
    </section>
  );
}
