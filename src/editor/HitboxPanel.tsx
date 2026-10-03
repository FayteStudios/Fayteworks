import { hitboxOptions, hitboxRoles } from "../model/extras";
import { seatOf, traceAlpha, type HitboxShape } from "../model/hitbox";
import type { Block, Section } from "../model/types";
import { useEditor } from "../state/store";
import { useHitboxEdit } from "./HitboxOverlay";
import { arranges, isFlowBlock } from "../model/collisions";

const SHAPES: { value: HitboxShape; label: string }[] = [
  { value: "box", label: "Box" },
  { value: "oval", label: "Oval" },
  { value: "outline", label: "Outline" }
];

const EDGES = ["Top", "Right", "Bottom", "Left"];

async function traceImage(blockId: string): Promise<number[] | string> {
  const el = document.querySelector<HTMLImageElement>(`.editor [data-block-id="${blockId}"] img.b-image`);
  if (!el?.naturalWidth) return "Add a picture first (tracing follows a picture's see-through edges).";
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = el.currentSrc || el.src;
  await img.decode();
  const w = 160;
  const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d");
  if (!c) return "Couldn't read the picture.";
  c.drawImage(img, 0, 0, w, h);
  let data: Uint8ClampedArray;
  try {
    data = c.getImageData(0, 0, w, h).data;
  } catch {
    return "This picture can't be read (it comes from another site). Upload it instead.";
  }
  const traced = traceAlpha(data, w, h);
  if (traced.length < 6) return "The picture has no see-through parts to follow, so its hitbox is just its box.";
  const box = el.getBoundingClientRect();
  const fit = getComputedStyle(el).objectFit;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const sx = fit === "fill" ? box.width / nw : fit === "cover" ? Math.max(box.width / nw, box.height / nh) : Math.min(box.width / nw, box.height / nh);
  const sy = fit === "fill" ? box.height / nh : sx;
  const dw = nw * sx;
  const dh = nh * sy;
  const ox = (box.width - dw) / 2;
  const oy = (box.height - dh) / 2;
  const out: number[] = [];
  for (let i = 0; i + 1 < traced.length; i += 2) {
    out.push(Math.round(((ox + (traced[i] / 100) * dw) / box.width) * 1000) / 10);
    out.push(Math.round(((oy + (traced[i + 1] / 100) * dh) / box.height) * 1000) / 10);
  }
  return out;
}

export function HitboxPanel({ block, section, mutateBlock }: { block: Block; section: Section; mutateBlock: (recipe: (b: Block) => void, key?: string) => void }) {
  const { state, setHitboxView } = useEditor();
  const edit = useHitboxEdit(section.id, block.id);
  const hb = block.hitbox ?? {};
  const shape = hb.shape ?? "box";
  const inset = hb.inset ?? [0, 0, 0, 0];
  const drawing = state.hitboxDraw === block.id;
  const role = hitboxRoles.find((r) => r.value === hb.role);
  return (
    <div className="hitbox-panel">
      <label className="field">
        <span className="field-label">What it does</span>
        <select value={hb.role ?? ""} onChange={(e) => edit((h) => ({ ...h, role: e.target.value || undefined }), "role")}>
          <option value="">Nothing (decoration)</option>
          {hitboxRoles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {role?.hint && <span className="field-hint">{role.hint}</span>}
      </label>
      <label className="field field--toggle">
        <span className="field-label">Only the hitbox can be clicked</span>
        <input type="checkbox" checked={Boolean(hb.clickOnly)} onChange={(e) => edit((h) => ({ ...h, clickOnly: e.target.checked || undefined }), "click")} />
        <span className="field-hint">Clicks, grabs and touches outside the hitbox go to whatever is behind it (on the published page and in Preview).</span>
      </label>
      {hitboxOptions.map((Options, i) => (
        <Options key={i} block={block} mutate={mutateBlock} />
      ))}
      <div className="field">
        <span className="field-label">Shape</span>
        <div className="hitbox-shapes" role="radiogroup" aria-label="Hitbox shape">
          {SHAPES.map((s) => (
            <button key={s.value} role="radio" aria-checked={shape === s.value} className={shape === s.value ? "is-active" : undefined} onClick={() => edit((h) => ({ ...h, shape: s.value === "box" ? undefined : s.value }), "shape")}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {shape !== "outline" ? (
        <div className="hitbox-edges">
          {EDGES.map((label, i) => (
            <label key={label} className="field">
              <span className="field-label">{label} in (%)</span>
              <input
                type="number"
                min={-50}
                max={100}
                value={inset[i]}
                onChange={(e) =>
                  edit((h) => {
                    const next = [...(h.inset ?? [0, 0, 0, 0])] as [number, number, number, number];
                    next[i] = Math.max(-50, Math.min(100, Number(e.target.value) || 0));
                    return { ...h, inset: next.some(Boolean) ? next : undefined };
                  }, `inset${i}`)
                }
              />
            </label>
          ))}
        </div>
      ) : (
        <div className="hitbox-outline">
          <div className="field-row">
            <button
              className={drawing ? "btn btn--small btn--primary" : "btn btn--small"}
              onClick={() => {
                if (drawing) setHitboxView(true, null);
                else {
                  if (!hb.points?.length) edit((h) => ({ ...h, shape: "outline", points: [] }), "points");
                  setHitboxView(true, block.id);
                }
              }}
            >
              {drawing ? "Done drawing" : hb.points?.length ? "✏️ Add points" : "✏️ Draw it"}
            </button>
            {block.type === "image" && (
              <button
                className="btn btn--small"
                onClick={async () => {
                  const traced = await traceImage(block.id);
                  if (typeof traced === "string") window.alert(traced);
                  else {
                    edit((h) => ({ ...h, shape: "outline", points: traced }), "trace");
                    setHitboxView(true, null);
                  }
                }}
              >
                ✨ Trace the picture
              </button>
            )}
            {Boolean(hb.points?.length) && (
              <button className="btn btn--small" onClick={() => edit((h) => ({ ...h, points: [] }), "points")}>
                Clear
              </button>
            )}
          </div>
          <span className="field-hint">
            {drawing ? "Click around the piece to place points; double-click to finish. Drag points to move them, Alt-click to remove one." : `${(hb.points?.length ?? 0) / 2} points. Drag them on the page with Hitboxes on.`}
          </span>
        </div>
      )}
      <label className="field field--toggle">
        <span className="field-label">Rests on the bottom of its shape</span>
        <input type="checkbox" checked={typeof hb.seat !== "number"} onChange={(e) => edit((h) => ({ ...h, seat: e.target.checked ? undefined : seatOf(h) }), "seat")} />
      </label>
      {typeof hb.seat === "number" && (
        <label className="field">
          <span className="field-label">Seat: {Math.round(hb.seat)}% down</span>
          <input type="range" min={0} max={150} value={hb.seat} onChange={(e) => edit((h) => ({ ...h, seat: Number(e.target.value) }), "seat")} />
          <span className="field-hint">Where it touches the ground. Anything below hangs over: a treble clef can sit on its curl with its tail hanging below.</span>
        </label>
      )}
      <span className="field-label hitbox-sub">While arranging</span>
      <label className="field field--toggle">
        <span className="field-label">Keeps other pieces out of its way</span>
        <input
          type="checkbox"
          checked={arranges(block)}
          onChange={(e) => edit((h) => ({ ...h, arrange: e.target.checked === isFlowBlock(block) ? undefined : e.target.checked }), "arrange")}
        />
        <span className="field-hint">When you move pieces, these push each other aside by their hitboxes. Text and buttons do by default; pictures and shapes don't.</span>
      </label>
      <label className="field field--toggle">
        <span className="field-label">Touch its neighbours (no gap)</span>
        <input
          type="checkbox"
          checked={Boolean(block.flush)}
          onChange={(e) =>
            mutateBlock((b) => {
              if (e.target.checked) b.flush = true;
              else delete b.flush;
            }, `${block.id}.flush`)
          }
        />
        <span className="field-hint">Reaches into the column gap on both sides, so two pieces side by side meet exactly (turn it on for both).</span>
      </label>
      <div className="field-row">
        {(["top", "bottom"] as const).map((edge) => (
          <label key={edge} className="field">
            <span className="field-label">{edge === "top" ? "Picture reaches up (rows)" : "Picture reaches down (rows)"}</span>
            <input
              type="number"
              min={0}
              max={60}
              value={block.overhang?.[edge] ?? 0}
              onChange={(e) =>
                mutateBlock((b) => {
                  const n = Math.max(0, Math.min(60, Math.round(Number(e.target.value) || 0)));
                  const next = { ...b.overhang, [edge]: n || undefined };
                  if (!next.top && !next.bottom) delete b.overhang;
                  else b.overhang = next;
                }, `${block.id}.overhang.${edge}`)
              }
            />
          </label>
        ))}
      </div>
      <span className="field-hint">The picture can reach past its space without moving anything; past the section's edge it draws over the next one.</span>
      <div className="field-row">
        <button className={state.hitboxView ? "btn btn--small btn--primary" : "btn btn--small"} onClick={() => setHitboxView(!state.hitboxView)}>
          {state.hitboxView ? "Hide hitboxes" : "Show hitboxes on the page"}
        </button>
        {block.hitbox && (
          <button className="link-button" onClick={() => edit(() => ({}), "reset")}>
            Reset to the whole piece
          </button>
        )}
      </div>
    </div>
  );
}
