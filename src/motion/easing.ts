export const EASE_PRESETS: { value: string; label: string }[] = [
  { value: "linear", label: "Linear" },
  { value: "ease", label: "Ease" },
  { value: "ease-in", label: "Ease in" },
  { value: "ease-out", label: "Ease out" },
  { value: "ease-in-out", label: "Ease in and out" },
  { value: "back-in", label: "Pull back" },
  { value: "back-out", label: "Overshoot" },
  { value: "spring(170,12)", label: "Spring" },
  { value: "spring(300,8)", label: "Wobbly spring" },
  { value: "bounce", label: "Bounce" },
  { value: "elastic", label: "Elastic" },
  { value: "steps(4)", label: "Steps" }
];

const NAMED: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
  "back-in": [0.36, 0, 0.66, -0.56],
  "back-out": [0.34, 1.56, 0.64, 1]
};

export function bezierOf(ease: string): [number, number, number, number] | null {
  if (NAMED[ease]) return NAMED[ease];
  const m = ease.match(/^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/);
  if (!m) return null;
  const v = m.slice(1).map(Number) as [number, number, number, number];
  v[0] = Math.min(1, Math.max(0, v[0]));
  v[2] = Math.min(1, Math.max(0, v[2]));
  return v.every(Number.isFinite) ? v : null;
}

function bezierAt([x1, y1, x2, y2]: [number, number, number, number], x: number): number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const err = sx(t) - x;
    const d = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(err) < 1e-6 || Math.abs(d) < 1e-6) break;
    t -= err / d;
  }
  if (t < 0 || t > 1) {
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      if (sx(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
  }
  return sy(t);
}

function springFn(stiffness: number, damping: number): (t: number) => number {
  const mass = 1;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const raw = (s: number) => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * s) * (Math.cos(wd * s) + ((zeta * w0) / wd) * Math.sin(wd * s));
    }
    return 1 - Math.exp(-w0 * s) * (1 + w0 * s);
  };
  let settle = 0.1;
  for (let s = 0; s < 20; s += 0.01) if (Math.abs(raw(s) - 1) > 0.001) settle = s + 0.01;
  return (t) => (t >= 1 ? 1 : raw(t * settle));
}

function bounceFn(t: number): number {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

function elasticFn(t: number): number {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

export function easeFn(ease: string | undefined): (t: number) => number {
  const e = ease || "ease";
  const bez = bezierOf(e);
  if (bez) return (t) => bezierAt(bez, t);
  const spring = e.match(/^spring\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/);
  if (spring) return springFn(Math.max(1, Number(spring[1])), Math.max(0.1, Number(spring[2])));
  if (e === "bounce") return bounceFn;
  if (e === "elastic") return elasticFn;
  const steps = e.match(/^steps\(\s*(\d+)\s*\)$/);
  if (steps) {
    const n = Math.max(1, Number(steps[1]));
    return (t) => (t >= 1 ? 1 : Math.floor(t * n) / n);
  }
  return (t) => bezierAt(NAMED.ease, t);
}

export function easeCss(ease: string | undefined): string {
  const e = ease || "ease";
  if (e === "back-in" || e === "back-out") return `cubic-bezier(${NAMED[e].join(",")})`;
  if (NAMED[e]) return e;
  if (bezierOf(e)) return e.replace(/\s+/g, "");
  const steps = e.match(/^steps\(\s*(\d+)\s*\)$/);
  if (steps) return `steps(${Math.max(1, Number(steps[1]))}, end)`;
  const fn = easeFn(e);
  const n = 40;
  const points: string[] = [];
  for (let i = 0; i <= n; i++) points.push(String(Math.round(fn(i / n) * 1000) / 1000));
  return `linear(${points.join(",")})`;
}

export function isEase(ease: string): boolean {
  return Boolean(NAMED[ease] || bezierOf(ease) || /^spring\(\s*[\d.]+\s*,\s*[\d.]+\s*\)$/.test(ease) || ease === "bounce" || ease === "elastic" || /^steps\(\s*\d+\s*\)$/.test(ease));
}
