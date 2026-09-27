import { useState, type CSSProperties } from "react";
import { askText } from "../editor/askText";
import { styleTheme } from "../model/styles";
import type { StyleSet, Theme } from "../model/types";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import { createId } from "../util/id";
import { ColoursTab } from "./ColoursTab";
import { FontsTab } from "./FontsTab";
import type { LookTab } from "./scenes";
import { StyleSwatch } from "./StylePicker";

export interface LookTarget {
  style: StyleSet | null;
  theme: Theme;
  set: (patch: Partial<Theme>, key: string) => void;
  follow: (keys: (keyof Theme)[]) => void;
  overrides: (keys: (keyof Theme)[]) => boolean;
}

function useLookTarget(styleId: string | null): LookTarget {
  const { state, commit } = useEditor();
  const style = styleId ? (state.site.styles?.find((s) => s.id === styleId) ?? null) : null;
  return {
    style,
    theme: styleTheme(state.site, style ?? undefined),
    set: (patch, key) =>
      commit((draft) => {
        const target = style ? draft.styles?.find((s) => s.id === style.id) : null;
        if (target) target.theme = { ...target.theme, ...patch };
        else Object.assign(draft.theme, patch);
      }, `look.${style?.id ?? "main"}.${key}`),
    follow: (keys) =>
      commit((draft) => {
        const target = style ? draft.styles?.find((s) => s.id === style.id) : null;
        if (target) for (const k of keys) delete target.theme[k];
      }),
    overrides: (keys) => Boolean(style && keys.some((k) => k in style.theme))
  };
}

function TargetBar({ styleId, setStyleId, keys }: { styleId: string | null; setStyleId: (id: string | null) => void; keys: (keyof Theme)[] }) {
  const { state } = useEditor();
  const target = useLookTarget(styleId);
  const sets = state.site.styles ?? [];
  if (!sets.length) return null;
  return (
    <div className="look-target">
      <span>You're changing</span>
      <div className="look-target-choices" role="radiogroup" aria-label="Which look">
        {[null, ...sets].map((s) => (
          <button key={s?.id ?? "main"} role="radio" aria-checked={styleId === (s?.id ?? null)} className={cls(styleId === (s?.id ?? null) && "is-active")} onClick={() => setStyleId(s?.id ?? null)}>
            {s?.name ?? "Main"}
          </button>
        ))}
      </div>
      {target.style && (
        <span className="look-target-note">
          {target.overrides(keys) ? (
            <>
              {target.style.name} has its own here.{" "}
              <button className="link-button" onClick={() => target.follow(keys)}>
                Follow Main instead
              </button>
            </>
          ) : (
            `${target.style.name} follows Main here until you change something.`
          )}
        </span>
      )}
    </div>
  );
}

const SHAPE_KEYS: (keyof Theme)[] = ["radius", "maxWidth"];

function ShapeTab({ target }: { target: LookTarget }) {
  const { radius, maxWidth } = target.theme;
  const vars = { "--r": `${radius}px`, background: target.theme.background, color: target.theme.text } as CSSProperties;
  return (
    <div className="scene-cards scene-cards--narrow">
      <section className="scene-card">
        <h3>Corners</h3>
        <label className="scene-field">
          <span>How round things are: {radius}px</span>
          <input type="range" min={0} max={40} value={radius} onChange={(e) => target.set({ radius: Number(e.target.value) }, "radius")} />
        </label>
        <div className="shape-preview" style={vars}>
          <span className="shape-card">
            <span className="shape-picture" />
            <strong>A card</strong>
          </span>
          <span className="shape-button" style={{ background: target.theme.accent, color: target.theme.accentText }}>
            A button
          </span>
        </div>
      </section>
      <section className="scene-card">
        <h3>Width</h3>
        <label className="scene-field">
          <span>How wide the content gets on big screens: {maxWidth}px</span>
          <input type="range" min={720} max={1600} step={20} value={maxWidth} onChange={(e) => target.set({ maxWidth: Number(e.target.value) }, "maxWidth")} />
        </label>
        <div className="width-preview" aria-hidden>
          <span style={{ width: `${Math.round((maxWidth / 1600) * 100)}%` }} />
        </div>
        <p className="scene-note">Narrow feels like a book; wide feels like a magazine. Phones always use the full screen.</p>
      </section>
    </div>
  );
}

function StylesTab({ openLook }: { openLook: (styleId: string) => void }) {
  const { state, commit } = useEditor();
  const sets = state.site.styles ?? [];
  const [selected, setSelected] = useState<string | null>(sets[0]?.id ?? null);
  const current = sets.find((s) => s.id === selected) ?? null;
  const webPages = state.site.pages.filter((p) => !p.design);
  const uses = (id: string | null) => webPages.filter((p) => (p.styleId ?? null) === id || (id === null && !sets.some((s) => s.id === p.styleId))).length;

  async function create() {
    const name = await askText("Name the style set (for example Night shows or Wedding):", "New style");
    if (!name) return;
    const set: StyleSet = { id: createId("sty"), name: name.trim() || "New style", theme: {} };
    commit((draft) => void (draft.styles = [...(draft.styles ?? []), set]));
    setSelected(set.id);
  }

  return (
    <div className="styles-layout">
      <section className="styles-list" aria-label="Style sets">
        <div>
          <h3>Style sets</h3>
          <p className="scene-note">A style set is a look for some pages. It only changes what you tell it to; everything else follows Main.</p>
        </div>
        <button className={cls("style-row", selected === null && "is-active")} onClick={() => setSelected(null)}>
          <StyleSwatch theme={state.site.theme} />
          <span>
            <strong>Main</strong>
            <small>The site's own look</small>
            <small className="style-row-count">{uses(null)} pages</small>
          </span>
        </button>
        {sets.map((s) => (
          <button key={s.id} className={cls("style-row", selected === s.id && "is-active")} onClick={() => setSelected(s.id)}>
            <StyleSwatch theme={styleTheme(state.site, s)} />
            <span>
              <strong>{s.name}</strong>
              <small>{Object.keys(s.theme).length ? `Changes ${Object.keys(s.theme).length} thing${Object.keys(s.theme).length === 1 ? "" : "s"}` : "Same as Main so far"}</small>
              <small className="style-row-count">
                {uses(s.id)} page{uses(s.id) === 1 ? "" : "s"}
              </small>
            </span>
          </button>
        ))}
        <button className="btn btn--dashed" onClick={create}>
          New style set
        </button>
      </section>

      <section className="scene-card styles-pages" aria-label="Pages">
        <div className="scene-card-head">
          <div>
            <h3>Which pages use {current?.name ?? "Main"}?</h3>
            <p className="scene-note">{current ? "Tick a page to give it this look. Untick it to send it back to Main." : "Main is the site's own look. Pages leave it by joining another set."}</p>
          </div>
          {current && (
            <div className="styles-actions">
              <button className="btn btn--primary" onClick={() => openLook(current.id)}>
                Change its look
              </button>
              <button
                className="btn"
                onClick={async () => {
                  const name = await askText("Rename the style set:", current.name);
                  if (name?.trim()) commit((d) => void d.styles?.forEach((s) => s.id === current.id && (s.name = name.trim())));
                }}
              >
                Rename
              </button>
              <button
                className="btn btn--danger"
                onClick={() => {
                  if (!window.confirm(`Delete “${current.name}”? Its pages go back to Main. You can undo this.`)) return;
                  commit((d) => {
                    d.styles = d.styles?.filter((s) => s.id !== current.id);
                    for (const p of d.pages) if (p.styleId === current.id) delete p.styleId;
                  });
                  setSelected(null);
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
        <div className="styles-pages-grid">
          {webPages.map((page) => {
            const pageSet = sets.find((s) => s.id === page.styleId) ?? null;
            const on = current ? page.styleId === current.id : !pageSet;
            const theme = styleTheme(state.site, pageSet ?? undefined);
            return (
              <label key={page.id} className={cls("styles-page", on && "is-on")}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!current}
                  onChange={(e) =>
                    commit((d) => {
                      const p = d.pages.find((x) => x.id === page.id);
                      if (!p || !current) return;
                      if (e.target.checked) p.styleId = current.id;
                      else delete p.styleId;
                    }, `${page.id}.styleId`)
                  }
                />
                <StyleSwatch theme={theme} />
                <span>
                  <strong>{page.title}</strong>
                  <small>Uses {pageSet?.name ?? "Main"}</small>
                </span>
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function LookScene({ tab, setTab }: { tab: LookTab; setTab: (tab: LookTab) => void }) {
  const [styleId, setStyleId] = useState<string | null>(null);
  const target = useLookTarget(styleId);
  const keysFor: Record<LookTab, (keyof Theme)[]> = {
    colours: ["background", "surface", "text", "muted", "accent", "accentText"],
    fonts: ["headingFont", "bodyFont"],
    shape: SHAPE_KEYS,
    styles: []
  };
  return (
    <div className="look-scene">
      {tab !== "styles" && <TargetBar styleId={target.style?.id ?? null} setStyleId={setStyleId} keys={keysFor[tab]} />}
      {tab === "colours" && <ColoursTab target={target} />}
      {tab === "fonts" && <FontsTab target={target} />}
      {tab === "shape" && <ShapeTab target={target} />}
      {tab === "styles" && (
        <StylesTab
          openLook={(id) => {
            setStyleId(id);
            setTab("colours");
          }}
        />
      )}
    </div>
  );
}
