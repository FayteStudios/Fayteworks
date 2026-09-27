import type { Block, BlockSound, SoundEvent } from "../model/types";

export const SOUND_EVENTS: { value: SoundEvent; label: string }[] = [
  { value: "click", label: "Click" },
  { value: "hover", label: "Hover" },
  { value: "view", label: "Comes into view" }
];

export function soundMarkup(block: Block, asset: (src: string) => string = (s) => s): Record<string, string> | null {
  const list = (block.sounds ?? [])
    .filter((s) => s.src && SOUND_EVENTS.some((e) => e.value === s.on))
    .map((s) => ({ on: s.on, src: asset(s.src), v: Math.min(1, Math.max(0, (Number(s.volume) || 0) / 100)) }))
    .filter((s) => s.src && !/^\s*javascript:/i.test(s.src));
  return list.length ? { "data-sound": JSON.stringify(list) } : null;
}

export type Wave = "sine" | "triangle" | "square" | "sawtooth" | "noise";

export interface SynthParams {
  wave: Wave;
  from: number;
  to: number;
  length: number;
  attack: number;
  decay: number;
  filter: number;
  second: number;
  vibrato: number;
  vibratoRate: number;
  volume: number;
}

export const SYNTH_PRESETS: { id: string; label: string; params: SynthParams }[] = [
  { id: "click", label: "Click", params: { wave: "square", from: 1800, to: 900, length: 0.035, attack: 0, decay: 1, filter: 4000, second: 0, vibrato: 0, vibratoRate: 0, volume: 0.35 } },
  { id: "tap", label: "Soft tap", params: { wave: "sine", from: 520, to: 380, length: 0.08, attack: 0.002, decay: 1, filter: 0, second: 0, vibrato: 0, vibratoRate: 0, volume: 0.6 } },
  { id: "pop", label: "Pop", params: { wave: "sine", from: 300, to: 900, length: 0.09, attack: 0.002, decay: 0.8, filter: 0, second: 0, vibrato: 0, vibratoRate: 0, volume: 0.6 } },
  { id: "blip", label: "Blip", params: { wave: "triangle", from: 880, to: 880, length: 0.07, attack: 0.002, decay: 0.7, filter: 0, second: 0, vibrato: 0, vibratoRate: 0, volume: 0.45 } },
  { id: "tick", label: "Tick", params: { wave: "noise", from: 0, to: 0, length: 0.02, attack: 0, decay: 1, filter: 6000, second: 0, vibrato: 0, vibratoRate: 0, volume: 0.5 } },
  { id: "whoosh", label: "Whoosh", params: { wave: "noise", from: 0, to: 0, length: 0.45, attack: 0.18, decay: 0.6, filter: 1400, second: 0, vibrato: 0, vibratoRate: 0, volume: 0.5 } },
  { id: "rise", label: "Rise", params: { wave: "sine", from: 300, to: 1200, length: 0.35, attack: 0.02, decay: 0.5, filter: 0, second: 0, vibrato: 0, vibratoRate: 0, volume: 0.45 } },
  { id: "fall", label: "Fall", params: { wave: "sine", from: 1000, to: 250, length: 0.35, attack: 0.01, decay: 0.6, filter: 0, second: 0, vibrato: 0, vibratoRate: 0, volume: 0.45 } },
  { id: "chime", label: "Chime", params: { wave: "sine", from: 1047, to: 1047, length: 0.7, attack: 0.005, decay: 0.95, filter: 0, second: 7, vibrato: 0, vibratoRate: 0, volume: 0.4 } },
  { id: "success", label: "Success", params: { wave: "triangle", from: 660, to: 660, length: 0.45, attack: 0.005, decay: 0.8, filter: 0, second: 5, vibrato: 0, vibratoRate: 0, volume: 0.4 } },
  { id: "error", label: "Nope", params: { wave: "square", from: 220, to: 180, length: 0.3, attack: 0.005, decay: 0.5, filter: 1200, second: 0, vibrato: 0.6, vibratoRate: 18, volume: 0.3 } },
  { id: "coin", label: "Coin", params: { wave: "square", from: 988, to: 988, length: 0.35, attack: 0, decay: 0.9, filter: 5000, second: 5, vibrato: 0, vibratoRate: 0, volume: 0.25 } },
  { id: "bubble", label: "Bubble", params: { wave: "sine", from: 400, to: 1400, length: 0.12, attack: 0.005, decay: 0.7, filter: 0, second: 0, vibrato: 2, vibratoRate: 30, volume: 0.5 } },
  { id: "thud", label: "Thud", params: { wave: "sine", from: 140, to: 50, length: 0.25, attack: 0.002, decay: 1, filter: 600, second: 0, vibrato: 0, vibratoRate: 0, volume: 0.8 } }
];

const SAMPLE_RATE = 44100;

export function synthesize(p: SynthParams): Float32Array {
  const length = Math.min(5, Math.max(0.01, p.length));
  const n = Math.round(length * SAMPLE_RATE);
  const out = new Float32Array(n);
  let phase = 0;
  let noiseSeed = 12345;
  let lp = 0;
  const alpha = p.filter > 0 ? 1 - Math.exp((-2 * Math.PI * p.filter) / SAMPLE_RATE) : 1;
  const attack = Math.max(0, p.attack);
  const decayStart = length * (1 - Math.min(1, Math.max(0, p.decay)));
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const f = t / length;
    let freq = p.from * Math.pow(Math.max(1, p.to) / Math.max(1, p.from), f);
    if (p.second && t >= length / 2) freq *= Math.pow(2, p.second / 12);
    if (p.vibrato) freq *= Math.pow(2, (p.vibrato * Math.sin(2 * Math.PI * p.vibratoRate * t)) / 12);
    phase += freq / SAMPLE_RATE;
    phase -= Math.floor(phase);
    let s: number;
    switch (p.wave) {
      case "sine":
        s = Math.sin(2 * Math.PI * phase);
        break;
      case "triangle":
        s = 1 - 4 * Math.abs(phase - 0.5);
        break;
      case "square":
        s = phase < 0.5 ? 1 : -1;
        break;
      case "sawtooth":
        s = 2 * phase - 1;
        break;
      default:
        noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7fffffff;
        s = (noiseSeed / 0x3fffffff) - 1;
    }
    lp += alpha * (s - lp);
    let env = attack > 0 && t < attack ? t / attack : 1;
    if (t > decayStart) env *= Math.max(0, 1 - (t - decayStart) / Math.max(1e-6, length - decayStart));
    const tail = Math.min(1, (n - i) / 64);
    out[i] = lp * env * tail * Math.min(1, Math.max(0, p.volume));
  }
  return out;
}

export function toWav(samples: Float32Array, rate = SAMPLE_RATE): Blob {
  return new Blob([wavBytes(samples, rate)], { type: "audio/wav" });
}

export function presetDataUrl(id: string): string {
  const preset = SYNTH_PRESETS.find((p) => p.id === id) ?? SYNTH_PRESETS[0];
  const bytes = wavBytes(synthesize(preset.params));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export function wavBytes(samples: Float32Array, rate = SAMPLE_RATE): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return new Uint8Array(buffer);
}

export function playSamples(samples: Float32Array): void {
  const ctx = new AudioContext();
  const buffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(samples);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.onended = () => void ctx.close();
  src.start();
}

export function newSound(on: SoundEvent, src: string): BlockSound {
  return { id: `snd_${Math.random().toString(36).slice(2, 10)}`, on, src, volume: 70 };
}
