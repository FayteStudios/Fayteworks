import { useEffect, type ReactNode } from "react";
import { Icon } from "../editor/icons";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import { PageScene } from "./PageScene";
import { SiteScene } from "./SiteScene";
import { LookScene } from "./LookScene";
import type { LookTab, Scene } from "./scenes";

const LOOK_TABS: { id: LookTab; label: string }[] = [
  { id: "colours", label: "Colours" },
  { id: "fonts", label: "Fonts" },
  { id: "shape", label: "Corners and width" },
  { id: "styles", label: "Style sets" }
];

export function SceneHost({ scene, setScene, children }: { scene: Scene; setScene: (scene: Scene | null) => void; children?: ReactNode }) {
  const { state, undo, redo } = useEditor();
  const close = () => setScene(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable='true'], dialog")) return;
      setScene(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setScene]);

  const page = scene.kind === "page" ? state.site.pages.find((p) => p.id === scene.pageId) : undefined;
  const title =
    scene.kind === "page" ? `Page settings · ${page?.title ?? ""}` : scene.kind === "look" ? "Look" : scene.kind === "site" ? "Site settings" : "Describing pictures";

  return (
    <div className="scene" role="dialog" aria-modal="true" aria-label={title}>
      <header className="scene-bar">
        <span className="topbar-logo" aria-hidden>
          <Icon name="grid" size={16} />
        </span>
        <strong className="scene-site">{state.site.name}</strong>
        <span className="scene-chip">{title}</span>
        {scene.kind === "look" && (
          <nav className="scene-tabs" aria-label="Look">
            {LOOK_TABS.map((t) => (
              <button key={t.id} className={cls(scene.tab === t.id && "is-active")} aria-current={scene.tab === t.id ? "page" : undefined} onClick={() => setScene({ kind: "look", tab: t.id })}>
                {t.label}
              </button>
            ))}
          </nav>
        )}
        <span className="scene-spacer" />
        <button className="btn btn--ghost topbar-icon" aria-label="Undo" disabled={!state.past.length} onClick={undo}>
          <Icon name="undo" size={18} />
        </button>
        <button className="btn btn--ghost topbar-icon" aria-label="Redo" disabled={!state.future.length} onClick={redo}>
          <Icon name="redo" size={18} />
        </button>
        <button className="btn btn--primary topbar-tool" onClick={close}>
          Done
        </button>
      </header>
      <div className="scene-body">
        {scene.kind === "page" ? (
          <PageScene pageId={scene.pageId} />
        ) : scene.kind === "site" ? (
          <SiteScene tab={scene.tab} setTab={(tab) => setScene({ kind: "site", tab })} />
        ) : scene.kind === "look" ? (
          <LookScene tab={scene.tab} setTab={(tab) => setScene({ kind: "look", tab })} />
        ) : (
          children
        )}
      </div>
    </div>
  );
}
