export interface Cue {
  start: number;
  end: number;
  text: string;
}

function parseTime(value: string): number {
  const m = value.trim().replace(",", ".").match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (!m) return NaN;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = (s % 60).toFixed(3).padStart(6, "0");
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${rest}`;
}

export function parseCaptions(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const timing = lines.findIndex((l) => l.includes("-->"));
    if (timing < 0) continue;
    const [a, b] = lines[timing].split("-->");
    const start = parseTime(a);
    const end = parseTime(b.trim().split(/\s+/)[0]);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    cues.push({ start, end, text: lines.slice(timing + 1).join("\n") });
  }
  return cues.sort((x, y) => x.start - y.start);
}

export function buildVtt(cues: Cue[]): string {
  const body = [...cues]
    .filter((c) => c.text.trim() && c.end > c.start)
    .sort((x, y) => x.start - y.start)
    .map((c) => `${formatTime(c.start)} --> ${formatTime(c.end)}\n${c.text.trim()}`)
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}
