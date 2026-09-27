import { useEffect, useMemo, useRef, useState } from "react";
import { createStarterSite } from "../model/factory";
import { DEMO_SITES } from "../model/demoSites";
import { fontCss } from "../model/fonts";
import type { Block, Site } from "../model/types";
import { cls } from "../util/cls";
import { Icon } from "./icons";

export interface SiteTemplate {
  id: string;
  label: string;
  description: string;
  kind: string;
  build: () => Site;
}

export const SITE_TEMPLATES: SiteTemplate[] = [
  { id: "starter", label: "Starter", description: "A home page and an About page, ready to fill in.", kind: "Simple", build: createStarterSite },
  ...DEMO_SITES.map((d) => ({ id: d.id, label: d.label, description: d.description, kind: /café|barber|studio/i.test(d.label) ? "Local business" : "Creative", build: d.build }))
];

function firstText(site: Site, type: string): string {
  const blocks: Block[] = site.pages[0]?.sections.flatMap((s) => s.blocks) ?? [];
  const b = blocks.find((x) => x.type === type && typeof x.props.text === "string" && !String(x.props.text).includes("{{"));
  return b ? String(b.props.text).replace(/\*\*|_/g, "").split("\n").slice(0, 2).join(" ") : "";
}

export function TemplatePreview({ site }: { site: Site }) {
  const t = site.theme;
  const heading = firstText(site, "heading") || site.name;
  return (
    <span className="tpl-preview" style={{ background: t.background, color: t.text, fontFamily: fontCss(t.bodyFont) }}>
      <span className="tpl-preview-nav">
        <b style={{ fontFamily: fontCss(t.headingFont) }}>{site.name}</b>
        <i style={{ background: t.muted }} />
      </span>
      <span className="tpl-preview-heading" style={{ fontFamily: fontCss(t.headingFont) }}>
        {heading}
      </span>
      <span className="tpl-preview-row">
        <span className="tpl-preview-button" style={{ background: t.accent, color: t.accentText, borderRadius: Math.min(t.radius, 12) }} />
        <span className="tpl-preview-card" style={{ background: t.surface, borderRadius: Math.min(t.radius, 12) }} />
      </span>
    </span>
  );
}

export function TemplateCatalogue({ onClose, onPick, onOpenFile }: { onClose: () => void; onPick: (build: () => Site, template: SiteTemplate) => void; onOpenFile?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"built" | "more">("built");
  const [kind, setKind] = useState("All");
  const [picked, setPicked] = useState(SITE_TEMPLATES[0].id);
  useEffect(() => ref.current?.showModal(), []);
  const built = useMemo(() => SITE_TEMPLATES.map((t) => ({ template: t, site: t.build() })), []);
  const kinds = ["All", ...new Set(SITE_TEMPLATES.map((t) => t.kind))];
  const shown = built.filter((b) => kind === "All" || b.template.kind === kind);
  const chosen = built.find((b) => b.template.id === picked);

  return (
    <dialog ref={ref} className="dialog template-catalogue" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Choose a template</h2>
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={tab === "built"} className={cls(tab === "built" && "is-active")} onClick={() => setTab("built")}>
            Built in
          </button>
          <button role="tab" aria-selected={tab === "more"} className={cls(tab === "more" && "is-active")} onClick={() => setTab("more")}>
            Get more
          </button>
        </div>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </header>
      {tab === "built" ? (
        <>
          <div className="chips">
            {kinds.map((k) => (
              <button key={k} className={cls("chip", kind === k && "is-active")} onClick={() => setKind(k)}>
                {k}
              </button>
            ))}
          </div>
          <div className="template-grid template-grid--sites">
            {shown.map(({ template, site }) => (
              <button key={template.id} className={cls("template-card", picked === template.id && "is-active")} onClick={() => setPicked(template.id)} onDoubleClick={() => onPick(template.build, template)}>
                <TemplatePreview site={site} />
                <span className="template-card-title">
                  <strong>{template.label}</strong>
                  <small>
                    {site.pages.filter((p) => !p.design && !p.collectionId).length} pages
                  </small>
                </span>
                <small>{template.description}</small>
              </button>
            ))}
          </div>
          <footer className="wizard-actions">
            <span className="field-hint">{chosen?.template.label}</span>
            <button className="btn btn--primary" onClick={() => chosen && onPick(chosen.template.build, chosen.template)}>
              Use this template
            </button>
          </footer>
        </>
      ) : (
        <div className="template-more">
          <button className="template-card template-card--blank" onClick={onOpenFile} disabled={!onOpenFile}>
            <span className="template-blank">
              <Icon name="file" size={28} />
            </span>
            <strong>From a site file</strong>
            <small>A .site.json someone shared with you, or one of your own.</small>
          </button>
          <p className="field-hint">Templates from other makers will be listed here.</p>
        </div>
      )}
    </dialog>
  );
}
