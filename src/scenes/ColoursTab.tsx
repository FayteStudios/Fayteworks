import { useMemo, useState } from "react";
import { FieldList } from "../editor/Fields";
import { buildPalettes, COLOUR_KEYS, HARMONIES, harmonyHues, hslHex, paletteFromCodes, type HarmonyId, type Palette } from "../model/harmony";
import { THEME_FIELDS } from "../model/theme";
import type { PropValue, Theme } from "../model/types";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import type { LookTarget } from "./LookScene";
import { SitePreview } from "./SitePreview";

const PRESETS = ["#a4442a", "#2f6f5e", "#3b5bdb", "#7048e8", "#d9480f", "#c2255c", "#d49a00", "#334155"];
const COLOUR_FIELDS = THEME_FIELDS.filter((f) => (COLOUR_KEYS as string[]).includes(f.key));
const HEX = /^#[0-9a-f]{6}$/i;

function Check({ value, good, bad }: { value: number; good: string; bad: string }) {
  const ok = value >= 4.5;
  return (
    <span className={cls("contrast-check", ok ? "is-ok" : "is-low")}>
      {ok ? good : bad} ({value.toFixed(1)}:1)
    </span>
  );
}

export function ColoursTab({ target }: { target: LookTarget }) {
  const { state, page } = useEditor();
  const [base, setBase] = useState(HEX.test(target.theme.accent) ? target.theme.accent.toLowerCase() : "#a4442a");
  const [mode, setMode] = useState<HarmonyId>("complementary");
  const [chosen, setChosen] = useState<number | null>(null);
  const [codes, setCodes] = useState("");
  const [pasting, setPasting] = useState(false);
  const pasted = useMemo(() => paletteFromCodes(codes), [codes]);
  const palettes: Palette[] = useMemo(() => [...buildPalettes(base, mode), ...(pasted ? [pasted] : [])], [base, mode, pasted]);
  const candidate: Theme = chosen === null || !palettes[chosen] ? target.theme : { ...target.theme, ...palettes[chosen].colours };
  const hues = harmonyHues(base, mode);
  const webPage = page.design ? (state.site.pages.find((p) => !p.design) ?? page) : page;
  const previewPage = (target.style && state.site.pages.find((p) => p.styleId === target.style!.id)) || webPage;

  const pickBase = (hex: string) => {
    setBase(hex);
    setChosen((c) => (c === null ? null : Math.min(c, 2)));
  };

  return (
    <div className="colours-layout">
      <section className="scene-card colour-tool" aria-label="Start from one colour">
        <div>
          <h3>Start from one colour</h3>
          <p className="scene-note">Pick the colour you love. FayteWorks finds colours that go with it.</p>
        </div>
        <div className="colour-start">
          <div className="colour-wheel" aria-hidden>
            <span className="colour-wheel-hole">
              <span style={{ background: base }} />
            </span>
            {hues.map((h, i) => {
              const a = ((((h % 360) + 360) % 360) * Math.PI) / 180;
              return <i key={i} style={{ left: 76 + 62 * Math.sin(a), top: 76 - 62 * Math.cos(a), background: hslHex(h, 70, 55) }} />;
            })}
          </div>
          <div className="colour-pick">
            <label className="colour-input">
              <input type="color" value={base} onChange={(e) => pickBase(e.target.value)} />
              <span>
                <strong>Your colour</strong>
                <small>{base}</small>
              </span>
            </label>
            <div className="colour-presets">
              {PRESETS.map((hex) => (
                <button key={hex} aria-label={`Start from ${hex}`} className={cls(hex === base && "is-active")} style={{ background: hex }} onClick={() => pickBase(hex)} />
              ))}
            </div>
            <button className="link-button" onClick={() => pickBase(target.theme.accent)} disabled={!HEX.test(target.theme.accent)}>
              Start from my accent colour
            </button>
          </div>
        </div>
        <div className="harmony-choices" role="radiogroup" aria-label="How the colours relate">
          {HARMONIES.map((m) => (
            <button key={m.id} role="radio" aria-checked={mode === m.id} className={cls(mode === m.id && "is-active")} onClick={() => setMode(m.id)}>
              <strong>{m.label}</strong>
              <small>{m.what}</small>
            </button>
          ))}
        </div>
        <div className="colour-elsewhere">
          <span>Have colours already?</span>
          <a href="https://color.adobe.com/create/color-wheel" target="_blank" rel="noreferrer">
            Open Adobe Color
          </a>
          <button className="link-button" onClick={() => setPasting(!pasting)}>
            Paste colour codes
          </button>
          {pasting && (
            <label className="scene-field colour-paste">
              <span>Paste two or more codes like #1d3557, from anywhere</span>
              <textarea rows={2} value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="#e63946 #f1faee #a8dadc #457b9d #1d3557" />
              {codes && !pasted && <small>Need at least two six-digit codes.</small>}
            </label>
          )}
        </div>
      </section>

      <section className="palette-column" aria-label="Palettes">
        <div className="scene-card-head">
          <h3>Ways to use it</h3>
          <span className="scene-note">Pick one to try it</span>
        </div>
        {palettes.map((p, i) => (
          <button key={`${p.name}-${i}`} className={cls("palette-card", chosen === i && "is-active")} onClick={() => setChosen(i)}>
            <span className="palette-mini" style={{ background: p.colours.background, color: p.colours.text }}>
              <strong>Hello there</strong>
              <small style={{ color: p.colours.muted }}>A short line of text</small>
              <i style={{ background: p.colours.accent, color: p.colours.accentText }}>Button</i>
            </span>
            <span className="palette-info">
              <strong>{p.name}</strong>
              <span className="palette-swatches">
                {[p.colours.background, p.colours.surface, p.colours.text, p.colours.accent, p.extra].map((c, j) => (
                  <i key={j} style={{ background: c }} />
                ))}
              </span>
              <Check value={p.textContrast} good="Text is easy to read" bad="Text is hard to read" />
              <Check value={p.buttonContrast} good="Buttons are easy to read" bad="Button text is hard to read" />
            </span>
          </button>
        ))}
      </section>

      <section className="colour-preview" aria-label="Live preview">
        <div className="scene-caption">
          <span>{chosen === null || !palettes[chosen] ? "Your site now" : `Your site with ${palettes[chosen].name.toLowerCase()}`}</span>
        </div>
        <SitePreview site={state.site} page={previewPage} theme={candidate} />
        <div className="colour-actions">
          <button className="btn" disabled={chosen === null} onClick={() => setChosen(null)}>
            Keep my current colours
          </button>
          <button
            className="btn btn--primary"
            disabled={chosen === null || !palettes[chosen]}
            onClick={() => {
              if (chosen === null || !palettes[chosen]) return;
              target.set(palettes[chosen].colours, "colours");
              setChosen(null);
            }}
          >
            Use these colours
          </button>
        </div>
        <details className="colour-finetune">
          <summary>Fine-tune each colour</summary>
          <FieldList
            fields={COLOUR_FIELDS}
            values={target.theme as unknown as Record<string, PropValue>}
            allowTokens={false}
            onChange={(key, value) => target.set({ [key]: value } as Partial<Theme>, key)}
          />
        </details>
      </section>
    </div>
  );
}
