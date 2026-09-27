import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { findSection } from "../model/ops";
import type { AnimProp, AnimTrigger, Block, BlockAnimation, Section } from "../model/types";
import { describeBlock } from "../editor/layoutCheck";
import { askText } from "../editor/askText";
import { useEditor } from "../state/store";
import { createId } from "../util/id";
import { cls } from "../util/cls";
import { ANIMATION_PRESETS, compileAnimation, maskVars, newAnimation, PROP_ORDER, PROPS, TRIGGERS, valueAt } from "./compile";
import { EaseEditor } from "./EaseEditor";

const MINE_KEY = "fayteworks:my-animations";
function loadMine(): BlockAnimation[] {
  try {
    const list = JSON.parse(localStorage.getItem(MINE_KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function saveMine(list: BlockAnimation[]) {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify(list));
  } catch {
  }
}

export function TimelinePanel() {
  const { state, page } = useEditor();
  const sel = state.selection;
  const section = sel.kind === "block" ? findSection(state.site, page.id, sel.sectionId) : undefined;
  const block = sel.kind === "block" ? section?.blocks.find((b) => b.id === sel.blockId) : undefined;
  if (!section || !block) {
    return (
      <div className="timeline timeline--empty">
        <p className="panel-hint">
          Select a block on the canvas to animate it: move, size, turn, fade, blur or cut it out, on scroll, hover, click or in a loop.
        </p>
      </div>
    );
  }
  return <BlockTimeline key={block.id} section={section} block={block} />;
}

type KeySel = { track: number; key: number } | null;

function BlockTimeline({ section, block }: { section: Section; block: Block }) {
  const { page, commit } = useEditor();
  const anims = block.animations ?? [];
  const [animId, setAnimId] = useState<string | null>(anims[0]?.id ?? null);
  const anim = anims.find((a) => a.id === animId) ?? anims[0];
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [keySel, setKeySel] = useState<KeySel>(null);
  const [mine, setMine] = useState<BlockAnimation[]>(loadMine);
  const liveRef = useRef<{ el: HTMLElement; anims: Animation[]; duration: number } | null>(null);

  function mutateBlock(recipe: (b: Block) => void, key?: string) {
    commit((draft) => {
      const b = findSection(draft, page.id, section.id)?.blocks.find((x) => x.id === block.id);
      if (b) recipe(b);
    }, key && `${block.id}.${key}`);
  }
  function mutate(recipe: (a: BlockAnimation) => void, key?: string) {
    if (!anim) return;
    mutateBlock((b) => {
      const a = b.animations?.find((x) => x.id === anim.id);
      if (a) recipe(a);
    }, key && `anim.${anim.id}.${key}`);
  }

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(`.editor-block[data-block-id="${block.id}"] > .editor-block-content`);
    const compiled = anim ? compileAnimation(anim) : null;
    if (!el || !anim || !compiled) return;
    const used = [...new Set(anim.tracks.filter((tr) => tr.keys.length > 1).map((tr) => tr.prop))];
    el.setAttribute("data-anim-live", "");
    el.setAttribute("data-anim-use", used.join(" "));
    if (used.includes("mask")) el.setAttribute("data-anim-mask", anim.mask?.shape ?? "circle");
    const vars = anim.mask ? maskVars(anim.mask) : {};
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    if (anim.origin) el.style.transformOrigin = `${anim.origin.x}% ${anim.origin.y}%`;
    const running = compiled.k.map((frames) => el.animate(frames as Keyframe[], { duration: compiled.d, fill: "both" }));
    running.forEach((a) => a.pause());
    liveRef.current = { el, anims: running, duration: compiled.d };
    return () => {
      running.forEach((a) => a.cancel());
      liveRef.current = null;
      el.removeAttribute("data-anim-live");
      el.removeAttribute("data-anim-use");
      el.removeAttribute("data-anim-mask");
      for (const k of Object.keys(vars)) el.style.removeProperty(k);
      el.style.transformOrigin = "";
    };
  }, [anim, block.id]);
  useEffect(() => {
    const live = liveRef.current;
    live?.anims.forEach((a) => (a.currentTime = t * live.duration));
  }, [t, anim]);

  useEffect(() => {
    if (!playing || !anim) return;
    let raf = 0;
    const duration = Math.max(50, anim.duration);
    const start = performance.now() - t * duration;
    const tick = (now: number) => {
      let p = (now - start) / duration;
      if (p >= 1 && anim.trigger !== "loop") {
        setT(1);
        setPlaying(false);
        return;
      }
      if (anim.trigger === "loop") {
        const cycle = Math.floor(p);
        p -= cycle;
        if (anim.alternate && cycle % 2) p = 1 - p;
      }
      setT(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, anim?.id]);

  function addAnimation(value: string) {
    let a: BlockAnimation;
    if (value.startsWith("mine:")) {
      const saved = mine.find((m) => m.id === value.slice(5));
      if (!saved) return;
      a = { ...structuredClone(saved), id: createId("anim") };
    } else a = newAnimation(value);
    mutateBlock((b) => void (b.animations = [...(b.animations ?? []), a]));
    setAnimId(a.id);
    setKeySel(null);
    setT(0);
  }

  async function saveAsMine() {
    if (!anim) return;
    const name = await askText("Name this animation (it'll be offered on every block)", anim.name);
    if (!name?.trim()) return;
    const next = [...mine.filter((m) => m.name !== name.trim()), { ...structuredClone(anim), id: createId("mine"), name: name.trim(), source: undefined }];
    saveMine(next);
    setMine(next);
  }

  function setAtPlayhead(ti: number, v: number) {
    if (!anim) return;
    const existing = anim.tracks[ti].keys.findIndex((k) => Math.abs(k.t - t) < 0.006);
    mutate((a) => {
      const track = a.tracks[ti];
      const p = PROPS[track.prop];
      const value = Math.min(p.max, Math.max(p.min, v));
      if (existing >= 0) track.keys[existing].v = value;
      else track.keys.push({ t: Math.round(t * 1000) / 1000, v: value, ease: "ease" });
    }, `track.${ti}.value`);
    setKeySel({ track: ti, key: existing >= 0 ? existing : anim.tracks[ti].keys.length });
  }

  function laneTime(e: { clientX: number }, lane: HTMLElement): number {
    const r = lane.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  }

  function onLaneDown(e: ReactPointerEvent<HTMLDivElement>, ti: number) {
    if (e.target !== e.currentTarget || !anim) return;
    const tt = Math.round(laneTime(e, e.currentTarget) * 100) / 100;
    const track = anim.tracks[ti];
    const v = Math.round(valueAt(track, tt) * 10) / 10;
    mutate((a) => void a.tracks[ti].keys.push({ t: tt, v, ease: "ease" }));
    setKeySel({ track: ti, key: track.keys.length });
    setT(tt);
  }

  function onKeyDown(e: ReactPointerEvent<HTMLButtonElement>, ti: number, ki: number) {
    e.stopPropagation();
    e.preventDefault();
    setKeySel({ track: ti, key: ki });
    const lane = e.currentTarget.parentElement!;
    const startX = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 3) return;
      moved = true;
      let tt = laneTime(ev, lane);
      if (Math.abs(tt - t) < 0.015) tt = t;
      else if (!ev.shiftKey) tt = Math.round(tt * 100) / 100;
      mutate((a) => void (a.tracks[ti].keys[ki].t = tt), `key.${ti}.${ki}.t`);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) setT(anim!.tracks[ti].keys[ki].t);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onRulerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const ruler = e.currentTarget;
    setPlaying(false);
    setT(laneTime(e, ruler));
    const move = (ev: PointerEvent) => setT(laneTime(ev, ruler));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function deleteKey() {
    if (!keySel || !anim) return;
    mutate((a) => void a.tracks[keySel.track]?.keys.splice(keySel.key, 1));
    setKeySel(null);
  }

  const isScroll = anim?.trigger === "scroll";
  const timeLabel = (tt: number) => (isScroll ? `${Math.round(tt * 100)}%` : `${Math.round(tt * (anim?.duration ?? 0))} ms`);
  const others = section.blocks.filter((b) => b.id !== block.id);
  const selectedKey = keySel && anim ? anim.tracks[keySel.track]?.keys[keySel.key] : undefined;
  const firstKey = (ti: number, ki: number) => {
    const keys = anim!.tracks[ti].keys;
    return keys.every((k, i) => i === ki || k.t >= keys[ki].t) && keys.filter((k) => k.t === keys[ki].t).length === 1;
  };

  return (
    <div
      className="timeline"
      tabIndex={-1}
      onKeyDown={(e) => {
        if ((e.key === "Delete" || e.key === "Backspace") && keySel && !(e.target instanceof HTMLInputElement)) {
          e.preventDefault();
          deleteKey();
        } else if (e.key === " " && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) {
          e.preventDefault();
          if (t >= 1 && !playing) setT(0);
          setPlaying(!playing);
        }
      }}
    >
      <div className="tl-bar">
        <strong className="tl-block" title={describeBlock(block)}>
          {describeBlock(block)}
        </strong>
        {anims.map((a) => (
          <button key={a.id} className={cls("tl-chip", a.id === anim?.id && "is-active")} onClick={() => (setAnimId(a.id), setKeySel(null), setT(0))}>
            {a.name}
          </button>
        ))}
        <select className="tl-add" aria-label="Add an animation" value="" onChange={(e) => e.target.value && addAnimation(e.target.value)}>
          <option value="">+ Animation…</option>
          <optgroup label="Ready-made">
            {ANIMATION_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </optgroup>
          {mine.length > 0 && (
            <optgroup label="Mine">
              {mine.map((m) => (
                <option key={m.id} value={`mine:${m.id}`}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {anim && (
          <>
            <span className="tl-sep" />
            <label className="tl-field">
              Plays
              <select value={anim.trigger} onChange={(e) => mutate((a) => void (a.trigger = e.target.value as AnimTrigger))}>
                {TRIGGERS.map((tr) => (
                  <option key={tr.value} value={tr.value}>
                    {tr.label}
                  </option>
                ))}
              </select>
            </label>
            {(anim.trigger === "hover" || anim.trigger === "click") && (
              <label className="tl-field">
                on
                <select value={anim.source ?? ""} onChange={(e) => mutate((a) => void (e.target.value ? (a.source = e.target.value) : delete a.source))}>
                  <option value="">this block</option>
                  {others.map((b) => (
                    <option key={b.id} value={b.id}>
                      {describeBlock(b)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {anim.trigger === "view" && (
              <label className="tl-field tl-check">
                <input type="checkbox" checked={Boolean(anim.repeat)} onChange={(e) => mutate((a) => void (a.repeat = e.target.checked || undefined))} />
                every time
              </label>
            )}
            {anim.trigger === "scroll" && (
              <label className="tl-field">
                through
                <select value={anim.scroll ?? "view"} onChange={(e) => mutate((a) => void (a.scroll = e.target.value === "page" ? "page" : undefined))}>
                  <option value="view">its way across the screen</option>
                  <option value="page">the whole page</option>
                </select>
              </label>
            )}
            {anim.trigger === "loop" && (
              <label className="tl-field tl-check">
                <input type="checkbox" checked={Boolean(anim.alternate)} onChange={(e) => mutate((a) => void (a.alternate = e.target.checked || undefined))} />
                back and forth
              </label>
            )}
            {!isScroll && (
              <>
                <label className="tl-field">
                  Length
                  <input type="number" min={50} max={120000} step={50} value={anim.duration} onChange={(e) => mutate((a) => void (a.duration = Math.max(50, Number(e.target.value) || 50)), "duration")} />
                  ms
                </label>
                <label className="tl-field">
                  Wait
                  <input type="number" min={0} max={60000} step={50} value={anim.delay ?? 0} onChange={(e) => mutate((a) => void (a.delay = Math.max(0, Number(e.target.value) || 0) || undefined), "delay")} />
                  ms
                </label>
              </>
            )}
            <button
              className="btn btn--small tl-play"
              onClick={() => {
                if (!playing && t >= 1) setT(0);
                setPlaying(!playing);
              }}
            >
              {playing ? "■ Stop" : "▶ Play"}
            </button>
          </>
        )}
      </div>

      {anim ? (
        <div className="tl-main">
          <div className="tl-tracks">
            <div className="tl-row tl-row--ruler">
              <div className="tl-name tl-time">{timeLabel(t)}</div>
              <div className="tl-ruler" onPointerDown={onRulerDown} title="Drag to scrub">
                {Array.from({ length: 11 }, (_, i) => (
                  <span key={i} className={cls("tl-tick", i === 10 && "tl-tick--end")} style={{ left: `${i * 10}%` }}>
                    {i % 2 === 0 ? timeLabel(i / 10) : ""}
                  </span>
                ))}
                <span className="tl-playhead tl-playhead--head" style={{ left: `${t * 100}%` }} />
              </div>
            </div>
            {anim.tracks.map((track, ti) => {
              const p = PROPS[track.prop];
              return (
                <div className="tl-row" key={`${track.prop}-${ti}`}>
                  <div className="tl-name">
                    <span>{p.label}</span>
                    <input
                      type="number"
                      step={p.step}
                      aria-label={`${p.label} at the playhead`}
                      title="Type a value to set a keyframe here"
                      value={Math.round(valueAt(track, t) * 10) / 10}
                      onChange={(e) => e.target.value !== "" && setAtPlayhead(ti, Number(e.target.value))}
                    />
                    <em>{p.unit}</em>
                    <button className="pages-delete" title="Remove this track" onClick={() => (mutate((a) => void a.tracks.splice(ti, 1)), setKeySel(null))}>
                      ✕
                    </button>
                  </div>
                  <div className="tl-lane" onPointerDown={(e) => onLaneDown(e, ti)} title="Click to add a keyframe">
                    {track.keys.length > 1 && (
                      <span
                        className="tl-span"
                        style={{ left: `${Math.min(...track.keys.map((k) => k.t)) * 100}%`, width: `${(Math.max(...track.keys.map((k) => k.t)) - Math.min(...track.keys.map((k) => k.t))) * 100}%` }}
                      />
                    )}
                    {track.keys.map((k, ki) => (
                      <button
                        key={ki}
                        className={cls("tl-key", keySel?.track === ti && keySel.key === ki && "is-selected")}
                        style={{ left: `${k.t * 100}%` }}
                        title={`${timeLabel(k.t)} · ${k.v}${p.unit}`}
                        aria-label={`Keyframe at ${timeLabel(k.t)}`}
                        onPointerDown={(e) => onKeyDown(e, ti, ki)}
                      />
                    ))}
                    <span className="tl-playhead" style={{ left: `${t * 100}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="tl-row">
              <div className="tl-name">
                <select
                  aria-label="Add a track"
                  value=""
                  onChange={(e) => {
                    const prop = e.target.value as AnimProp;
                    if (!prop) return;
                    const rest = PROPS[prop].rest;
                    mutate((a) => {
                      a.tracks.push({ prop, keys: [{ t: 0, v: rest }, { t: 1, v: rest }] });
                      if (prop === "mask" && !a.mask) a.mask = { shape: "circle", x: 50, y: 50 };
                    });
                  }}
                >
                  <option value="">+ Track…</option>
                  {PROP_ORDER.filter((prop) => !anim.tracks.some((tr) => tr.prop === prop)).map((prop) => (
                    <option key={prop} value={prop}>
                      {PROPS[prop].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="tl-lane tl-lane--hint">
                {anim.tracks.length === 0 ? "Add a track, then click along it to place keyframes." : "Click a track to add a keyframe; drag keyframes to move them (Shift: no snapping). Space plays."}
              </div>
            </div>
          </div>

          <aside className="tl-side">
            {selectedKey && keySel ? (
              <>
                <h4>Keyframe · {PROPS[anim.tracks[keySel.track].prop].label}</h4>
                <label className="tl-field">
                  Value
                  <input
                    type="number"
                    step={PROPS[anim.tracks[keySel.track].prop].step}
                    value={selectedKey.v}
                    onChange={(e) => mutate((a) => void (a.tracks[keySel.track].keys[keySel.key].v = Number(e.target.value) || 0), `key.${keySel.track}.${keySel.key}.v`)}
                  />
                  {PROPS[anim.tracks[keySel.track].prop].unit}
                </label>
                <label className="tl-field">
                  At
                  <input
                    type="number"
                    min={0}
                    max={isScroll ? 100 : anim.duration}
                    value={Math.round(selectedKey.t * (isScroll ? 100 : anim.duration))}
                    onChange={(e) =>
                      mutate(
                        (a) => void (a.tracks[keySel.track].keys[keySel.key].t = Math.min(1, Math.max(0, (Number(e.target.value) || 0) / (isScroll ? 100 : a.duration)))),
                        `key.${keySel.track}.${keySel.key}.t`
                      )
                    }
                  />
                  {isScroll ? "%" : "ms"}
                </label>
                {firstKey(keySel.track, keySel.key) ? (
                  <p className="field-hint">The first keyframe is where it starts, so there's no easing into it.</p>
                ) : (
                  <>
                    <span className="field-label">Easing into it</span>
                    <EaseEditor
                      value={selectedKey.ease ?? "ease"}
                      onChange={(ease, live) => mutate((a) => void (a.tracks[keySel.track].keys[keySel.key].ease = ease), live ? `key.${keySel.track}.${keySel.key}.ease` : undefined)}
                    />
                  </>
                )}
                <button className="btn btn--small" onClick={deleteKey}>
                  Delete keyframe
                </button>
              </>
            ) : (
              <>
                <h4>{TRIGGERS.find((tr) => tr.value === anim.trigger)?.label}</h4>
                <p className="field-hint">{TRIGGERS.find((tr) => tr.value === anim.trigger)?.hint}</p>
                <div className="tl-pair">
                  <span className="field-label">Pivot (turn and size from)</span>
                  <label className="tl-field">
                    x <input type="number" min={0} max={100} value={anim.origin?.x ?? 50} onChange={(e) => mutate((a) => void (a.origin = { x: Number(e.target.value) || 0, y: a.origin?.y ?? 50 }), "origin")} />%
                  </label>
                  <label className="tl-field">
                    y <input type="number" min={0} max={100} value={anim.origin?.y ?? 50} onChange={(e) => mutate((a) => void (a.origin = { x: a.origin?.x ?? 50, y: Number(e.target.value) || 0 }), "origin")} />%
                  </label>
                </div>
                {anim.tracks.some((tr) => tr.prop === "mask") && (
                  <div className="tl-pair">
                    <span className="field-label">Cutout</span>
                    <select value={anim.mask?.shape ?? "circle"} onChange={(e) => mutate((a) => void (a.mask = { x: 50, y: 50, ...a.mask, shape: e.target.value as "circle" | "rect" | "diamond" }))}>
                      <option value="circle">Circle</option>
                      <option value="rect">Rectangle</option>
                      <option value="diamond">Diamond</option>
                    </select>
                    <label className="tl-field">
                      x <input type="number" min={0} max={100} value={anim.mask?.x ?? 50} onChange={(e) => mutate((a) => void (a.mask = { shape: "circle", y: 50, ...a.mask, x: Number(e.target.value) || 0 }), "mask")} />%
                    </label>
                    <label className="tl-field">
                      y <input type="number" min={0} max={100} value={anim.mask?.y ?? 50} onChange={(e) => mutate((a) => void (a.mask = { shape: "circle", x: 50, ...a.mask, y: Number(e.target.value) || 0 }), "mask")} />%
                    </label>
                  </div>
                )}
                <div className="field-row tl-actions">
                  <button className="btn btn--small" onClick={() => void askText("Name", anim.name).then((n) => n?.trim() && mutate((a) => void (a.name = n.trim())))}>
                    Rename
                  </button>
                  <button className="btn btn--small" onClick={() => void saveAsMine()}>
                    ★ Save to my animations
                  </button>
                  <button
                    className="btn btn--small"
                    onClick={() => {
                      mutateBlock((b) => void (b.animations = b.animations?.filter((a) => a.id !== anim.id)));
                      setAnimId(null);
                      setKeySel(null);
                    }}
                  >
                    Delete animation
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      ) : (
        <div className="tl-start">
          <p className="panel-hint">No animations on this block yet. Start from one of these, then shape it on the timeline:</p>
          <div className="tl-presets">
            {ANIMATION_PRESETS.map((p) => (
              <button key={p.id} className="btn btn--small" onClick={() => addAnimation(p.id)}>
                {p.label}
              </button>
            ))}
            {mine.map((m) => (
              <button key={m.id} className="btn btn--small" onClick={() => addAnimation(`mine:${m.id}`)}>
                ★ {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
