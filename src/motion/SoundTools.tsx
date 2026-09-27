import { useEffect, useRef, useState } from "react";
import type { Block, BlockSound, SoundEvent } from "../model/types";
import { getAsset, putAsset } from "../state/assets";
import { newSound, playSamples, SOUND_EVENTS, synthesize, SYNTH_PRESETS, toWav, type SynthParams, type Wave } from "./sounds";

async function presetAsset(id: string): Promise<{ src: string; name: string }> {
  const preset = SYNTH_PRESETS.find((p) => p.id === id) ?? SYNTH_PRESETS[0];
  return { src: await putAsset(toWav(synthesize(preset.params))), name: preset.label };
}

async function playSrc(src: string, volume: number) {
  const asset = src.startsWith("asset:") ? await getAsset(src) : null;
  const url = asset ? URL.createObjectURL(asset.blob) : src;
  const audio = new Audio(url);
  audio.volume = Math.min(1, Math.max(0, volume / 100));
  await audio.play().catch(() => undefined);
  if (asset) audio.onended = () => URL.revokeObjectURL(url);
}

export function SoundTools({ block, mutate }: { block: Block; mutate: (recipe: (b: Block) => void, key?: string) => void }) {
  const sounds = block.sounds ?? [];
  const [making, setMaking] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadFor = useRef<string | null>(null);

  function update(id: string, patch: Partial<BlockSound>, key?: string) {
    mutate((b) => {
      const s = b.sounds?.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
    }, key && `${block.id}.sound.${id}.${key}`);
  }

  async function add() {
    const { src, name } = await presetAsset(block.type === "button" || block.type === "buy" ? "click" : "pop");
    const sound = { ...newSound(block.type === "button" || block.type === "buy" ? "click" : "hover", src), name };
    mutate((b) => void (b.sounds = [...(b.sounds ?? []), sound]));
  }

  async function choose(sound: BlockSound, value: string) {
    if (value === "__upload") {
      uploadFor.current = sound.id;
      fileRef.current?.click();
    } else if (value === "__make") setMaking(sound.id);
    else if (value.startsWith("synth:")) {
      const { src, name } = await presetAsset(value.slice(6));
      update(sound.id, { src, name });
      void playSrc(src, sound.volume);
    }
  }

  const presetValue = (s: BlockSound) => {
    const preset = SYNTH_PRESETS.find((p) => p.label === s.name);
    return preset ? `synth:${preset.id}` : "__current";
  };

  return (
    <section className="inspector-group sound-tools">
      <h3 className="panel-heading">Sound</h3>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const id = uploadFor.current;
          if (!file || !id) return;
          if (file.size > 3 * 1024 * 1024) {
            window.alert("Keep interaction sounds short: that file is over 3 MB. Trim it (Audio block → Trim & tidy) first.");
            return;
          }
          update(id, { src: await putAsset(file), name: file.name });
        }}
      />
      {sounds.map((s) => (
        <div key={s.id} className="sound-row">
          <select aria-label="When" value={s.on} onChange={(e) => update(s.id, { on: e.target.value as SoundEvent })}>
            {SOUND_EVENTS.map((ev) => (
              <option key={ev.value} value={ev.value}>
                {ev.label}
              </option>
            ))}
          </select>
          <select aria-label="Sound" value={presetValue(s)} onChange={(e) => void choose(s, e.target.value)}>
            {presetValue(s) === "__current" && <option value="__current">{s.name || "Your sound"}</option>}
            <optgroup label="Built in">
              {SYNTH_PRESETS.map((p) => (
                <option key={p.id} value={`synth:${p.id}`}>
                  {p.label}
                </option>
              ))}
            </optgroup>
            <option value="__make">Make your own…</option>
            <option value="__upload">Upload a sound…</option>
          </select>
          <button className="btn btn--small" title="Listen" aria-label="Listen" onClick={() => void playSrc(s.src, s.volume)}>
            ▶
          </button>
          <button className="pages-delete" title="Remove sound" onClick={() => mutate((b) => void (b.sounds = b.sounds?.filter((x) => x.id !== s.id)))}>
            ✕
          </button>
          <label className="sound-volume">
            <span>Volume</span>
            <input type="range" min={0} max={100} value={s.volume} onChange={(e) => update(s.id, { volume: Number(e.target.value) }, "volume")} />
          </label>
        </div>
      ))}
      <button className="btn btn--small" onClick={() => void add()}>
        + Sound
      </button>
      <p className="field-hint">
        Plays in Preview and on the site, only after a visitor has clicked or typed somewhere on the page. Add a <em>Sound on/off</em> block so visitors can
        mute it.
      </p>
      {making && (
        <SoundMaker
          onClose={() => setMaking(null)}
          onUse={async (params, name) => {
            const src = await putAsset(toWav(synthesize(params)));
            update(making, { src, name });
            setMaking(null);
          }}
        />
      )}
    </section>
  );
}

const WAVES: { value: Wave; label: string }[] = [
  { value: "sine", label: "Smooth (sine)" },
  { value: "triangle", label: "Soft (triangle)" },
  { value: "square", label: "Retro (square)" },
  { value: "sawtooth", label: "Buzzy (saw)" },
  { value: "noise", label: "Noise" }
];

function SoundMaker({ onUse, onClose }: { onUse: (params: SynthParams, name: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [params, setParams] = useState<SynthParams>(SYNTH_PRESETS[2].params);
  const [name, setName] = useState("My sound");
  useEffect(() => ref.current?.showModal(), []);
  const set = (patch: Partial<SynthParams>) => setParams((p) => ({ ...p, ...patch }));
  const slider = (key: keyof SynthParams, label: string, min: number, max: number, step: number, format: (v: number) => string) => (
    <label className="field sound-slider">
      <span className="field-label">
        {label} <em>{format(params[key] as number)}</em>
      </span>
      <input type="range" min={min} max={max} step={step} value={params[key] as number} onChange={(e) => set({ [key]: Number(e.target.value) })} onPointerUp={() => playSamples(synthesize(params))} />
    </label>
  );
  return (
    <dialog ref={ref} className="dialog sound-maker" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Make a sound</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <p className="dialog-lead">Start from one of these, then shape it. It's made here, so it's all yours.</p>
      <div className="sound-presets">
        {SYNTH_PRESETS.map((p) => (
          <button
            key={p.id}
            className="btn btn--small"
            onClick={() => {
              setParams(p.params);
              setName(p.label);
              playSamples(synthesize(p.params));
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="sound-grid">
        <label className="field">
          <span className="field-label">Tone</span>
          <select value={params.wave} onChange={(e) => set({ wave: e.target.value as Wave })}>
            {WAVES.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        {params.wave !== "noise" && slider("from", "Starting pitch", 40, 3000, 1, (v) => `${Math.round(v)} Hz`)}
        {params.wave !== "noise" && slider("to", "Ending pitch", 40, 3000, 1, (v) => `${Math.round(v)} Hz`)}
        {slider("length", "Length", 0.01, 2, 0.01, (v) => `${Math.round(v * 1000)} ms`)}
        {slider("attack", "Fade in", 0, 0.5, 0.005, (v) => `${Math.round(v * 1000)} ms`)}
        {slider("decay", "Fade out", 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`)}
        {slider("filter", "Muffle (0 = off)", 0, 8000, 50, (v) => (v ? `${Math.round(v)} Hz` : "off"))}
        {params.wave !== "noise" && slider("second", "Second note (semitones)", 0, 12, 1, (v) => (v ? `+${v}` : "none"))}
        {params.wave !== "noise" && slider("vibrato", "Wobble", 0, 3, 0.1, (v) => (v ? `${v}` : "none"))}
        {params.wave !== "noise" && params.vibrato > 0 && slider("vibratoRate", "Wobble speed", 1, 40, 1, (v) => `${v} Hz`)}
        {slider("volume", "Loudness", 0.05, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
      </div>
      <div className="dialog-actions">
        <input type="text" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" onClick={() => playSamples(synthesize(params))}>
          ▶ Listen
        </button>
        <button className="btn btn--primary" onClick={() => onUse(params, name.trim() || "My sound")}>
          Use this sound
        </button>
      </div>
    </dialog>
  );
}
