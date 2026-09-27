import { useState } from "react";
import { DESIGN_PRESETS, describeSize, sheetSize, unitPx } from "../model/design";
import { findPage } from "../model/ops";
import type { DesignFormat, Page } from "../model/types";
import { useEditor } from "../state/store";
import { designShareImage, exportDesign, type DesignExportOptions } from "./exportDesign";
import { putAsset } from "../state/assets";
import { openDirectory } from "../directory/DirectoryDialog";
import { categoryForPreset } from "../directory/directory";

export function DesignPanel({ page }: { page: Page & { design: DesignFormat } }) {
  const { state, commit } = useEditor();
  const d = page.design;
  const print = d.kind === "print";
  const [options, setOptions] = useState<DesignExportOptions>({ format: print ? "pdf" : "png", bleed: print, dpi: 300 });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const preset = DESIGN_PRESETS.find((p) => p.id === d.preset);
  const webPages = state.site.pages.filter((p) => !p.design);
  const [shareTarget, setShareTarget] = useState("missing");
  const [shareStatus, setShareStatus] = useState("");

  async function useAsShareImage() {
    setBusy(true);
    setShareStatus("");
    try {
      const ref = await putAsset(await designShareImage(state.site, page));
      let count = 0;
      commit((draft) => {
        for (const p of draft.pages) {
          if (p.design) continue;
          if (shareTarget === "all" || (shareTarget === "missing" && !p.seo.image) || p.id === shareTarget) {
            p.seo.image = ref;
            count++;
          }
        }
      });
      setShareStatus(count ? `✓ Shown when ${count === 1 ? "that page is" : `${count} pages are`} shared. Publish to update the live site.` : "Every page already has its own share picture.");
    } catch (e) {
      setShareStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const pixels = () => {
    const full = options.bleed || !print ? 2 * d.bleed : 0;
    const k = print ? (unitPx(d.unit) * options.dpi) / 96 : 1;
    return `${Math.round((d.width + full) * k)} × ${Math.round((d.height + full) * k)} px`;
  };

  async function run() {
    setBusy(true);
    setStatus("");
    try {
      setStatus(await exportDesign(state.site, page, options));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="inspector-group design-panel">
      <h3 className="panel-heading">Design</h3>
      <p className="field-hint">
        {preset?.label ?? "Custom size"}: {describeSize(d)}
        {d.folds ? `, ${d.folds === 2 ? "folds in three" : "folds in half"}` : ""}. Each sheet is a section; guides show the trim line (red), the safe area (blue){d.folds ? " and the folds (green)" : ""}.
      </p>
      {print && (
        <label className="field">
          <span className="field-label">Bleed ({d.unit})</span>
          <input
            type="number"
            min={0}
            step={d.unit === "in" ? 0.0625 : 0.5}
            value={d.bleed}
            onChange={(e) =>
              commit((draft) => {
                const p = findPage(draft, page.id);
                if (p?.design) p.design.bleed = Math.max(0, Number(e.target.value) || 0);
              }, `${page.id}.bleed`)
            }
          />
          <span className="field-hint">Background colour and images that should reach the edge of the paper go all the way into the bleed.</span>
        </label>
      )}
      <div className="field">
        <span className="field-label">Export as</span>
        <div className="segmented" role="radiogroup" aria-label="Export format">
          {(["pdf", "png", "jpg"] as const).map((f) => (
            <button key={f} role="radio" aria-checked={options.format === f} className={options.format === f ? "is-active" : undefined} onClick={() => setOptions({ ...options, format: f })}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {print && (
        <label className="catalogue-check">
          <input type="checkbox" checked={options.bleed} onChange={(e) => setOptions({ ...options, bleed: e.target.checked })} />
          Include the bleed (for a print shop)
        </label>
      )}
      {print && options.format !== "pdf" && (
        <label className="field">
          <span className="field-label">Resolution</span>
          <select value={options.dpi} onChange={(e) => setOptions({ ...options, dpi: Number(e.target.value) })}>
            <option value={150}>150 dpi (home printing, screens)</option>
            <option value={300}>300 dpi (print shops)</option>
          </select>
        </label>
      )}
      {options.format !== "pdf" && <p className="field-hint">Each sheet becomes an image of {pixels()}.</p>}
      {options.format === "pdf" && <p className="field-hint">One page per sheet, at {describeSize(d)}{options.bleed && print ? " plus bleed" : ""}, with text and drawings kept sharp (vector).</p>}
      <button className="btn btn--primary btn--block" disabled={busy} onClick={() => void run()}>
        {busy ? "Exporting…" : `Export ${page.sections.length > 1 ? `${page.sections.length} sheets` : "design"}`}
      </button>
      {status && <p className="field-hint">{status}</p>}
      {!print && (
        <div className="field design-share">
          <span className="field-label">Use as the share picture</span>
          <span className="field-hint">What people see when a page is shared in chats and social apps (Open Graph image). Best at 1200 × 630 (Link preview).</span>
          <select aria-label="Pages to use it on" value={shareTarget} onChange={(e) => setShareTarget(e.target.value)}>
            <option value="missing">Every page without its own</option>
            <option value="all">Every page</option>
            {webPages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <button className="btn btn--block" disabled={busy} onClick={() => void useAsShareImage()}>
            Use as the share picture
          </button>
          {shareStatus && <p className="field-hint">{shareStatus}</p>}
        </div>
      )}
      {print && (
        <button className="link-button" onClick={() => openDirectory(categoryForPreset(d.preset))}>
          Where to get this printed →
        </button>
      )}
      <p className="field-hint">
        For print shops that need CMYK: select a sheet and use “Open in your drawing program” with Scribus (free), which exports CMYK PDF/X files. Sheets are {sheetSize(d).width} layout pixels wide.
      </p>
    </section>
  );
}
