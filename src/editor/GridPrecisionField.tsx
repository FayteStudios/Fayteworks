import { GRID_DENSITIES, type GridDensity } from "../model/grid";

export function GridPrecisionField({ value, onChange }: { value: GridDensity; onChange: (d: GridDensity) => void }) {
  return (
    <label className="field">
      <span className="field-label">Grid precision</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value) as GridDensity)}>
        {GRID_DENSITIES.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label} ({d.detail})
          </option>
        ))}
      </select>
      <span className="field-hint">Finer grids let blocks sit and size more exactly. Switching keeps everything where it is.</span>
    </label>
  );
}
