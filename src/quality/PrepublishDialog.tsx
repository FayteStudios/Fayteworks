import { useEffect, useMemo, useRef, useState } from "react";
import { openAltText } from "./AltTextDialog";
import { openGuide } from "../guides/GuideHost";
import { findPage, findSection } from "../model/ops";
import { desktop } from "../platform/desktop";
import { collectMediaRefs, getAsset, isAssetRef } from "../state/assets";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import { checkSite, externalLinks, type IssueCategory, type PublishIssue } from "./prepublish";

const ORDER: IssueCategory[] = ["Setup", "Links", "Accessibility", "Search engines", "Speed"];
export const OPEN_PREPUBLISH = "fayteworks:open-prepublish";
export const openPrepublish = () => window.dispatchEvent(new Event(OPEN_PREPUBLISH));

export function PrepublishDialog({ onClose }: { onClose: () => void }) {
  const { state, commit, setPage, select } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const [sizes, setSizes] = useState<Map<string, number>>(new Map());
  const [links, setLinks] = useState<{ url: string; where: string; status: number; error?: string }[] | null>(null);
  const [checkingLinks, setCheckingLinks] = useState(false);
  useEffect(() => ref.current?.showModal(), []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = new Map<string, number>();
      for (const r of collectMediaRefs(state.site)) {
        if (!isAssetRef(r)) continue;
        const asset = await getAsset(r).catch(() => undefined);
        if (asset) found.set(r, asset.blob.size);
      }
      if (!cancelled) setSizes(found);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const issues = useMemo(() => checkSite(state.site, sizes), [state.site, sizes]);
  const toFix = issues.filter((i) => i.severity === "fix").length;

  function show(issue: PublishIssue) {
    if (!issue.where) return;
    setPage(issue.where.pageId);
    if (issue.where.blockId) select({ kind: "block", sectionId: issue.where.sectionId, blockId: issue.where.blockId });
    else select({ kind: "section", sectionId: issue.where.sectionId });
    onClose();
    setTimeout(() => document.querySelector(`[data-block-id="${issue.where!.blockId}"], [data-section-id="${issue.where!.sectionId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 150);
  }

  async function checkLinks() {
    const list = externalLinks(state.site);
    setCheckingLinks(true);
    try {
      const results = await desktop!.checkLinks(list.map((l) => l.url));
      setLinks(results.filter((r) => !r.ok).map((r) => ({ ...r, where: list.find((l) => l.url === r.url)?.where ?? "" })));
    } finally {
      setCheckingLinks(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog prepublish-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Check before publishing</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <p className={cls("prepublish-summary", !issues.length && "is-clear")}>
        {issues.length ? `${toFix} to fix · ${issues.length - toFix} to consider` : "✓ All clear. Nothing to fix."}
      </p>
      {desktop && (
        <div className="prepublish-links">
          <button className="btn btn--small" disabled={checkingLinks} onClick={() => void checkLinks()}>
            {checkingLinks ? "Checking links…" : `Check the ${externalLinks(state.site).length} links to other sites`}
          </button>
          {links && (links.length ? <span className="dialog-status dialog-status--error">{links.length} broken or unreachable</span> : <span className="prepublish-ok">✓ Every link answers.</span>)}
        </div>
      )}
      {links && links.length > 0 && (
        <ul className="prepublish-list">
          {links.map((l) => (
            <li key={l.url} className="prepublish-item is-fix">
              <strong>{l.status ? `${l.url} answers “${l.status}”` : `${l.url}: ${l.error}`}</strong>
              <span>{l.where}. The page may have moved: open it, and update or remove the link.</span>
            </li>
          ))}
        </ul>
      )}
      {ORDER.filter((cat) => issues.some((i) => i.category === cat)).map((cat) => (
        <section key={cat}>
          <h3 className="panel-heading">
            {cat}
            {cat === "Accessibility" && issues.some((i) => /alt|galt|calt/.test(i.key.split(":")[0])) && (
              <button className="link-button prepublish-alt-all" onClick={() => (onClose(), openAltText())}>
                Describe all pictures →
              </button>
            )}
          </h3>
          <ul className="prepublish-list">
            {issues
              .filter((i) => i.category === cat)
              .sort((a, b) => Number(a.severity !== "fix") - Number(b.severity !== "fix"))
              .map((issue) => (
                <li key={issue.key} className={cls("prepublish-item", issue.severity === "fix" ? "is-fix" : "is-consider")}>
                  <strong>{issue.message}</strong>
                  <span>
                    {issue.where ? `${issue.where.label}. ` : ""}
                    {issue.how}
                  </span>
                  <div className="field-row">
                    <QuickFix
                      issue={issue}
                      onAlt={(f, alt, decorative) =>
                        commit((d) => {
                          const b = findSection(d, f.pageId, f.sectionId)?.blocks.find((x) => x.id === f.blockId);
                          if (!b) return;
                          b.props.alt = alt;
                          if (decorative) b.props.decorative = true;
                        })
                      }
                      onDescription={(pageId, text) =>
                        commit((d) => {
                          const p = findPage(d, pageId);
                          if (p) p.seo.description = text;
                        })
                      }
                      onGuide={(guide) => (onClose(), openGuide(guide))}
                    />
                    {issue.where && (
                      <button className="btn btn--small" onClick={() => show(issue)}>
                        Show me
                      </button>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </dialog>
  );
}

type AltTarget = { pageId: string; sectionId: string; blockId: string };

function QuickFix({
  issue,
  onAlt,
  onDescription,
  onGuide
}: {
  issue: PublishIssue;
  onAlt: (target: AltTarget, alt: string, decorative: boolean) => void;
  onDescription: (pageId: string, text: string) => void;
  onGuide: (guide: string) => void;
}) {
  const fix = issue.fix;
  if (!fix) return null;
  if (fix.kind === "alt") return <AltFix onSave={(alt, decorative) => onAlt(fix, alt, decorative)} />;
  if (fix.kind === "description") return <DescriptionFix onSave={(text) => onDescription(fix.pageId, text)} />;
  return (
    <button className="btn btn--small" onClick={() => onGuide(fix.guide)}>
      📘 Guide
    </button>
  );
}

function AltFix({ onSave }: { onSave: (alt: string, decorative: boolean) => void }) {
  const [alt, setAlt] = useState("");
  return (
    <>
      <input type="text" placeholder="e.g. Two cups of coffee on a wooden table" aria-label="Picture description" value={alt} onChange={(e) => setAlt(e.target.value)} />
      <button className="btn btn--small btn--primary" disabled={!alt.trim()} onClick={() => onSave(alt.trim(), false)}>
        Save
      </button>
      <button className="btn btn--small" title="Screen readers will skip it" onClick={() => onSave("", true)}>
        It's decoration
      </button>
    </>
  );
}

function DescriptionFix({ onSave }: { onSave: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <>
      <input type="text" placeholder="One or two sentences about this page" aria-label="Search description" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
      <button className="btn btn--small btn--primary" disabled={text.trim().length < 20} onClick={() => onSave(text.trim())}>
        Save
      </button>
    </>
  );
}
