import { useRef } from "react";
import { bezierOf, EASE_PRESETS, easeFn } from "./easing";

const W = 150;
const H = 110;
const PAD = 22;
const px = (x: number) => PAD + x * (W - 2 * PAD);
const py = (y: number) => H - PAD - y * (H - 2 * PAD);

export function EaseEditor({ value, onChange }: { value: string; onChange: (ease: string, live?: boolean) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const bez = bezierOf(value);
  const spring = value.match(/^spring\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/);
  const steps = value.match(/^steps\(\s*(\d+)\s*\)$/);
  const isPreset = EASE_PRESETS.some((p) => p.value === value);
  const fn = easeFn(value);
  const points = Array.from({ length: 61 }, (_, i) => `${px(i / 60).toFixed(1)},${py(fn(i / 60)).toFixed(1)}`).join(" ");

  function dragHandle(which: 0 | 1, e: React.PointerEvent) {
    if (!bez) return;
    e.preventDefault();
    const svg = svgRef.current!;
    const move = (ev: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, ((ev.clientX - r.left) * (W / r.width) - PAD) / (W - 2 * PAD)));
      const y = Math.min(2, Math.max(-1, (H - PAD - (ev.clientY - r.top) * (H / r.height)) / (H - 2 * PAD)));
      const next = [...bez];
      next[which * 2] = Math.round(x * 100) / 100;
      next[which * 2 + 1] = Math.round(y * 100) / 100;
      onChange(`cubic-bezier(${next.join(",")})`, true);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="ease-editor">
      <select
        aria-label="Easing"
        value={isPreset ? value : bez ? "__curve" : spring ? "__spring" : steps ? "__steps" : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__curve") onChange(`cubic-bezier(${(bez ?? [0.25, 0.1, 0.25, 1]).join(",")})`);
          else if (v === "__spring") onChange("spring(170,12)");
          else onChange(v);
        }}
      >
        {EASE_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
        {!isPreset && spring && <option value="__spring">Custom spring</option>}
        {!isPreset && steps && <option value="__steps">{steps[1]} steps</option>}
        <option value="__curve">Custom curve…</option>
      </select>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="ease-graph" aria-hidden>
        <rect x={px(0)} y={py(1)} width={px(1) - px(0)} height={py(0) - py(1)} className="ease-box" />
        <polyline points={points} className="ease-curve" />
        {bez && (
          <>
            <line x1={px(0)} y1={py(0)} x2={px(bez[0])} y2={py(bez[1])} className="ease-arm" />
            <line x1={px(1)} y1={py(1)} x2={px(bez[2])} y2={py(bez[3])} className="ease-arm" />
            <circle cx={px(bez[0])} cy={py(bez[1])} r={6} className="ease-handle" onPointerDown={(e) => dragHandle(0, e)} />
            <circle cx={px(bez[2])} cy={py(bez[3])} r={6} className="ease-handle" onPointerDown={(e) => dragHandle(1, e)} />
          </>
        )}
      </svg>
      {spring && (
        <div className="ease-spring">
          <label>
            Stiffness
            <input type="range" min={20} max={600} value={Number(spring[1])} onChange={(e) => onChange(`spring(${e.target.value},${spring[2]})`, true)} />
          </label>
          <label>
            Damping
            <input type="range" min={1} max={60} value={Number(spring[2])} onChange={(e) => onChange(`spring(${spring[1]},${e.target.value})`, true)} />
          </label>
        </div>
      )}
      {steps && (
        <label className="ease-spring">
          Steps
          <input type="number" min={1} max={60} value={Number(steps[1])} onChange={(e) => onChange(`steps(${Math.max(1, Math.min(60, Number(e.target.value) || 1))})`, true)} />
        </label>
      )}
      {bez && <p className="field-hint">Drag the two handles to shape the curve.</p>}
    </div>
  );
}
