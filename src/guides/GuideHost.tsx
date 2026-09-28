import { openShortcuts } from "./ShortcutsDialog";
import { openDesignHome } from "../design/home";
import { dotHidden, setDotHidden } from "../helper/DotHelper";
import { useEffect, useRef, useState } from "react";
import { openPanel } from "../editor/workspace";
import { TokenField } from "../editor/ExportDialog";
import type { Site } from "../model/types";
import { desktop } from "../platform/desktop";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import { GLOSSARY, GUIDES, guideById, type Guide, type GuideActions, type GuideStep } from "./guides";

const OPEN_GUIDE = "fayteworks:open-guide";
export const OPEN_EXPORT = "fayteworks:open-export";
export const OPEN_SERVICES = "fayteworks:open-services";
export const OPEN_INBOX = "fayteworks:open-inbox";

export function openGuide(id?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_GUIDE, { detail: id ?? "" }));
}

export function GuideHost() {
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => setOpen((e as CustomEvent<string>).detail);
    window.addEventListener(OPEN_GUIDE, on);
    return () => window.removeEventListener(OPEN_GUIDE, on);
  }, []);
  if (open === null) return null;
  return <GuideDialog key={open} guideId={open} onClose={() => setOpen(null)} onOpen={setOpen} />;
}

function GuideDialog({ guideId, onClose, onOpen }: { guideId: string; onClose: () => void; onOpen: (id: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  const guide = guideId ? guideById(guideId) : undefined;
  return (
    <dialog ref={ref} className="dialog guide-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>{guide ? guide.title : "Guides"}</h2>
        <div className="guide-header-actions">
          {dotHidden() && (
            <button className="btn btn--ghost" onClick={() => setDotHidden(false)}>
              Bring Dot back
            </button>
          )}
          <button
            className="btn btn--ghost"
            title="Keyboard shortcuts (?)"
            onClick={() => {
              onClose();
              openShortcuts();
            }}
          >
            Keyboard shortcuts
          </button>
          {guide && (
            <button className="btn btn--ghost" onClick={() => onOpen("")}>
              All guides
            </button>
          )}
          <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
      </header>
      {guide ? <GuideView guide={guide} onClose={onClose} /> : <GuideList onOpen={onOpen} />}
    </dialog>
  );
}

function GuideList({ onOpen }: { onOpen: (id: string) => void }) {
  const { state } = useEditor();
  const categories = [...new Set(GUIDES.map((g) => g.category))];
  return (
    <div className="guide-list">
      <p className="dialog-lead">Step-by-step help for connecting your site to the outside world: what things are, what they cost, and exactly where to click.</p>
      {categories.map((cat) => (
        <section key={cat}>
          <h3 className="panel-heading">{cat}</h3>
          <div className="guide-cards">
            {GUIDES.filter((g) => g.category === cat).map((g) => {
              const done = state.site.guides?.[g.id]?.length ?? 0;
              return (
                <button key={g.id} className="guide-card" onClick={() => onOpen(g.id)}>
                  <strong>{g.title}</strong>
                  <span>{g.what.split(". ")[0].replace(/\.$/, "")}.</span>
                  <em>
                    ~{g.minutes} min · {g.cost}
                    {done > 0 && ` · ${done === g.steps.length ? "✓ done" : `${done}/${g.steps.length} steps`}`}
                  </em>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <section className="guide-glossary">
        <h3 className="panel-heading">Words worth knowing</h3>
        <dl>
          {GLOSSARY.map((g) => (
            <div key={g.term}>
              <dt>{g.term}</dt>
              <dd>{g.meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function GuideView({ guide, onClose }: { guide: Guide; onClose: () => void }) {
  const { state, commit, setPage } = useEditor();
  const site = state.site;
  const done = new Set(site.guides?.[guide.id] ?? []);
  const firstOpen = guide.steps.findIndex((_, i) => !done.has(i));
  const [current, setCurrent] = useState(firstOpen < 0 ? 0 : firstOpen);
  const step = guide.steps[current];

  function markDone(i: number, on = true) {
    commit((d) => {
      const set = new Set(d.guides?.[guide.id] ?? []);
      if (on) set.add(i);
      else set.delete(i);
      d.guides = { ...d.guides, [guide.id]: [...set].sort((a, b) => a - b) };
    });
  }

  const actions: GuideActions = {
    commit: (recipe) => commit(recipe),
    setPage,
    openPanel: (panel) => {
      openPanel(panel);
      onClose();
    },
    openExport: () => {
      window.dispatchEvent(new Event(OPEN_EXPORT));
      onClose();
    },
    openServices: () => {
      window.dispatchEvent(new Event(OPEN_SERVICES));
      onClose();
    },
    openInbox: () => {
      window.dispatchEvent(new Event(OPEN_INBOX));
      onClose();
    },
    openDesigns: () => {
      openDesignHome();
      onClose();
    }
  };

  return (
    <div className="guide-view">
      <p className="guide-what">{guide.what}</p>
      <p className="guide-meta">
        About {guide.minutes} minutes · {guide.cost}
      </p>
      <div className="guide-body">
        <ol className="guide-steps">
          {guide.steps.map((s, i) => (
            <li key={i}>
              <button className={cls("guide-step-tab", i === current && "is-current", done.has(i) && "is-done")} onClick={() => setCurrent(i)}>
                <span className="guide-step-num">{done.has(i) ? "✓" : i + 1}</span>
                {s.title}
              </button>
            </li>
          ))}
        </ol>
        <section className="guide-step">
          <h3>
            {current + 1}. {step.title}
          </h3>
          <div className="guide-text">{step.body}</div>
          <StepTools step={step} site={site} actions={actions} onDone={() => markDone(current)} />
          <div className="guide-nav">
            <label className="guide-done">
              <input type="checkbox" checked={done.has(current)} onChange={(e) => markDone(current, e.target.checked)} />
              Done
            </label>
            <button className="btn" disabled={current === 0} onClick={() => setCurrent(current - 1)}>
              ← Back
            </button>
            {current < guide.steps.length - 1 ? (
              <button
                className="btn btn--primary"
                onClick={() => {
                  markDone(current);
                  setCurrent(current + 1);
                }}
              >
                Next →
              </button>
            ) : (
              <button
                className="btn btn--primary"
                onClick={() => {
                  markDone(current);
                  onClose();
                }}
              >
                Finish
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StepTools({ step, site, actions, onDone }: { step: GuideStep; site: Site; actions: GuideActions; onDone: () => void }) {
  const { commit } = useEditor();
  const [value, setValue] = useState(step.input?.get(site) ?? "");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const secret = step.secret;
  const refreshKey = () => void (secret && desktop?.hasToken(secret.service).then(setHasKey));
  useEffect(refreshKey, [secret]);
  const problem = step.input && value.trim() ? step.input.check?.(value) ?? null : null;
  const copy = step.copy?.(site);
  const open = (url: string) => (desktop ? void desktop.openExternal(url) : void window.open(url, "_blank", "noopener"));

  return (
    <div className="guide-tools">
      {step.desktopOnly && !desktop && <p className="field-hint">This step needs the desktop app, where keys can be stored safely.</p>}
      {step.link && (
        <button className="btn guide-link" onClick={() => open(step.link!.url)}>
          {step.link.label} ↗
        </button>
      )}
      {step.input && (
        <div className="field">
          <span className="field-label">{step.input.label}</span>
          <div className="field-row">
            <input type="text" value={value} placeholder={step.input.placeholder} onChange={(e) => setValue(e.target.value)} />
            <button
              className="btn btn--primary"
              disabled={!value.trim() || Boolean(problem)}
              onClick={() => {
                commit((d) => step.input!.set(d, value));
                onDone();
                setResult({ ok: true, text: "✓ Saved." });
              }}
            >
              Save
            </button>
          </div>
          {problem && <span className="dialog-status dialog-status--error">{problem}</span>}
        </div>
      )}
      {secret && desktop && (
        <div className="field">
          <span className="field-label">{secret.label}</span>
          <TokenField service={secret.service} connected={hasKey} onChange={() => (refreshKey(), onDone())} label={secret.label} />
        </div>
      )}
      {copy && (
        <div className="field guide-copy">
          <span className="field-label">{copy.label}</span>
          <div className="field-row">
            <code>{copy.value}</code>
            <button
              className="btn btn--small"
              onClick={() =>
                void navigator.clipboard.writeText(copy.value).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
      {step.action && (
        <button
          className="btn btn--primary guide-action"
          onClick={() => {
            step.action!.run(actions, site);
            onDone();
          }}
        >
          {step.action.label}
        </button>
      )}
      {step.verify && (
        <button
          className="btn guide-verify"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            try {
              setResult({ ok: true, text: await step.verify!.run(site) });
              onDone();
            } catch (e) {
              setResult({ ok: false, text: e instanceof Error ? e.message : String(e) });
            } finally {
              setChecking(false);
            }
          }}
        >
          {checking ? "Checking…" : step.verify.label}
        </button>
      )}
      {result && <p className={cls("guide-result", result.ok ? "is-ok" : "is-bad")}>{result.text}</p>}
    </div>
  );
}
