import { useState } from "react";
import { DESIGN_PRESETS } from "../model/design";
import type { DesignFormat } from "../model/types";

type Unit = DesignFormat["unit"];

const UNITS: { value: Unit; label: string }[] = [
  { value: "px", label: "pixels (screens, social)" },
  { value: "mm", label: "mm (print)" },
  { value: "in", label: "inches (print)" }
];

export function SizeFields({ start, action, onApply, presets = false }: { start: { width: number; height: number; unit: Unit; preset?: string }; action: string; onApply: (width: number, height: number, unit: Unit, preset: string) => void; presets?: boolean }) {
  const [size, setSize] = useState({ width: String(start.width), height: String(start.height), unit: start.unit, preset: start.preset ?? "custom" });
  const w = Number(size.width);
  const h = Number(size.height);
  const max = size.unit === "px" ? 20000 : size.unit === "mm" ? 5000 : 200;
  const valid = w > 0 && h > 0 && w <= max && h <= max;
  const changed = w !== start.width || h !== start.height || size.unit !== start.unit;
  const set = (patch: Partial<typeof size>) => setSize({ ...size, preset: "custom", ...patch });
  return (
    <div className="size-fields">
      {presets && (
        <select
          aria-label="Ready-made size"
          value={size.preset}
          onChange={(e) => {
            const p = DESIGN_PRESETS.find((x) => x.id === e.target.value);
            setSize(p ? { width: String(p.width), height: String(p.height), unit: p.unit, preset: p.id } : { ...size, preset: "custom" });
          }}
        >
          <option value="custom">Your own size</option>
          {DESIGN_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      )}
      <div className="size-fields-row">
        <label>
          <span>Width</span>
          <input type="number" min={0} step="any" value={size.width} onChange={(e) => set({ width: e.target.value })} />
        </label>
        <button className="size-fields-swap" title="Swap width and height" onClick={() => set({ width: size.height, height: size.width })}>
          ⇄
        </button>
        <label>
          <span>Height</span>
          <input type="number" min={0} step="any" value={size.height} onChange={(e) => set({ height: e.target.value })} />
        </label>
      </div>
      <select aria-label="Unit" value={size.unit} onChange={(e) => set({ unit: e.target.value as Unit })}>
        {UNITS.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </select>
      <button className="btn btn--primary" disabled={!valid || (presets && !changed && size.preset === (start.preset ?? "custom"))} onClick={() => onApply(w, h, size.unit, size.preset)}>
        {action}
      </button>
      {!valid && size.width !== "" && size.height !== "" && <span className="field-hint">Use a size above 0 and up to {max} {size.unit}.</span>}
    </div>
  );
}
