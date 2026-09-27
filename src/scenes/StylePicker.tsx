import { fontCss } from "../model/fonts";
import { findPage } from "../model/ops";
import { styleTheme } from "../model/styles";
import type { Page, StyleSet, Theme } from "../model/types";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import { openScene } from "./scenes";

export function StyleSwatch({ theme }: { theme: Theme }) {
  return (
    <span className="style-swatch" style={{ background: theme.background, color: theme.text }} aria-hidden>
      <span style={{ fontFamily: fontCss(theme.headingFont) }}>Aa</span>
      <i style={{ background: theme.accent }} />
    </span>
  );
}

export function StylePicker({ page }: { page: Page }) {
  const { state, commit } = useEditor();
  const sets: (StyleSet | null)[] = [null, ...(state.site.styles ?? [])];
  return (
    <section className="scene-card scene-card--wide">
      <div className="scene-card-head">
        <h3>Its look</h3>
        <button className="link-button" onClick={() => openScene({ kind: "look", tab: "styles" })}>
          Make or change style sets
        </button>
      </div>
      <div className="style-choices" role="radiogroup" aria-label="Style set">
        {sets.map((set) => {
          const on = (page.styleId ?? null) === (set?.id ?? null) || (set === null && !state.site.styles?.some((s) => s.id === page.styleId));
          return (
            <button
              key={set?.id ?? "main"}
              role="radio"
              aria-checked={on}
              className={cls("style-choice", on && "is-active")}
              onClick={() =>
                commit((draft) => {
                  const p = findPage(draft, page.id);
                  if (!p) return;
                  if (set) p.styleId = set.id;
                  else delete p.styleId;
                }, `${page.id}.styleId`)
              }
            >
              <StyleSwatch theme={styleTheme(state.site, set ?? undefined)} />
              <span>
                <strong>{set?.name ?? "Main"}</strong>
                <small>{set ? "A style set" : "The site's own look"}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
