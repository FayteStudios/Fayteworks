import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { UpdateNotice } from "./UpdateNotice";
import { EditorShell } from "../editor/EditorShell";
import { Hint } from "../editor/Hint";
import { Icon } from "../editor/icons";
import { TemplateCatalogue, TemplatePreview, type SiteTemplate } from "../editor/TemplateCatalogue";
import { cls } from "../util/cls";
import { readSiteFile } from "../export/siteFile";
import { createBlankSite, createStarterSite } from "../model/factory";
import { migrateSite } from "../model/migrate";
import type { Site } from "../model/types";
import { useProjectAssets } from "../state/assets";
import { EditorProvider } from "../state/store";
import { desktop, type OpenedProject, type RecentProject } from "./desktop";

type SaveStatus = "saved" | "saving" | "error";

interface DesktopContextValue {
  project: OpenedProject;
  saveStatus: SaveStatus;
  saveError: string;
  switchProject: () => void;
}

const DesktopContext = createContext<DesktopContextValue | null>(null);

export function useDesktopProject(): DesktopContextValue | null {
  return useContext(DesktopContext);
}

function ProjectsScreen({ onOpen }: { onOpen: (project: OpenedProject) => void }) {
  const api = desktop!;
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("My site");
  const [start, setStart] = useState<"starter" | "blank" | "template">("starter");
  const [template, setTemplate] = useState<SiteTemplate | null>(null);
  const [catalogue, setCatalogue] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const starterPreview = useMemo(() => createStarterSite(), []);
  const templatePreview = useMemo(() => template?.build(), [template]);

  const refresh = useCallback(() => void api.recentProjects().then(setRecent), [api]);
  useEffect(refresh, [refresh]);

  async function attempt(label: string, task: () => Promise<void>) {
    setError("");
    setBusy(label);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  const open = (path: string) => attempt("Opening…", async () => onOpen(await api.openProject(path)));

  const create = (build: () => Site) =>
    attempt("Creating…", async () => {
      const parent = await api.chooseFolder("Where should the project folder go?");
      if (!parent) return;
      const site = { ...build(), name: name.trim() || "My site" };
      onOpen(await api.createProject(parent, site.name, JSON.stringify(site, null, 2)));
    });
  const build = start === "blank" ? createBlankSite : start === "template" && template ? template.build : createStarterSite;
  const createLabel = start === "blank" ? "Create a blank site" : start === "template" && template ? `Create from ${template.label}` : "Create from Starter";

  const importFile = (file: File) =>
    attempt("Importing…", async () => {
      const text = await file.text();
      const parent = await api.chooseFolder("Where should the imported project go?");
      if (!parent) return;
      const peek = migrateSite((JSON.parse(text) as { site?: unknown }).site ?? JSON.parse(text));
      if (!peek) throw new Error("That file isn't a site exported from FayteWorks.");
      const created = await api.createProject(parent, peek.name, JSON.stringify(peek, null, 2));
      useProjectAssets(true);
      const site = await readSiteFile(text);
      await api.saveSite(JSON.stringify(site, null, 2));
      onOpen({ ...created, site });
    });

  return (
    <div className="projects-screen">
      <header className="projects-header">
        <span className="topbar-logo" aria-hidden>
          <Icon name="grid" size={20} />
        </span>
        <div className="brand-block">
          <h1 className="brand">
            FayteWorks<span className="brand-dot">.</span>
          </h1>
          <p className="brand-tagline">Your site. Period.</p>
        </div>
      </header>
      <div className="projects-body">
        <section className="projects-new">
          <h2>What are we making?</h2>
          <label className="field">
            <span className="field-label">Site name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="start-choices" role="radiogroup" aria-label="Start from">
            <button role="radio" aria-checked={start === "starter"} className={cls("start-choice", start === "starter" && "is-active")} onClick={() => setStart("starter")}>
              <TemplatePreview site={starterPreview} />
              <strong>Starter</strong>
              <small>A home page and an About page, ready to fill in.</small>
            </button>
            <button role="radio" aria-checked={start === "blank"} className={cls("start-choice", start === "blank" && "is-active")} onClick={() => setStart("blank")}>
              <span className="start-blank">
                <Icon name="plus" size={30} />
              </span>
              <strong>Blank</strong>
              <small>One empty page. Build it your way.</small>
            </button>
            <button role="radio" aria-checked={start === "template"} className={cls("start-choice", start === "template" && "is-active")} onClick={() => setCatalogue(true)}>
              {templatePreview ? (
                <TemplatePreview site={templatePreview} />
              ) : (
                <span className="start-stack" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
              )}
              <strong className="start-choice-more">
                {template ? template.label : "Choose a template…"}
                <Icon name="chevronRight" size={16} />
              </strong>
              <small>{template ? "Click to pick a different one." : "Café, barber, band, studio and more."}</small>
            </button>
          </div>
          <div className="projects-create">
            <button className="btn btn--primary projects-create-button" disabled={Boolean(busy)} onClick={() => create(build)}>
              {createLabel}
            </button>
            <Hint label="Where does it go?">Each site is a folder on your computer: easy to back up, copy, or keep in a synced drive.</Hint>
          </div>
        </section>

        <section className="projects-card">
          <h2>Pick up where you left off</h2>
          {recent.length === 0 ? (
            <p className="panel-hint">Sites you open show up here.</p>
          ) : (
            <ul className="projects-recent">
              {recent.map((p) => (
                <li key={p.path} className={p.exists ? undefined : "is-missing"}>
                  <button className="projects-recent-open" disabled={!p.exists || Boolean(busy)} onClick={() => open(p.path)} title={p.path}>
                    <strong>{p.name}</strong>
                    <span>{p.exists ? p.path : `Missing: ${p.path}`}</span>
                  </button>
                  <button className="projects-recent-forget" aria-label={`Remove ${p.name} from this list`} title="Remove from this list (the folder is not touched)" onClick={() => void api.forgetProject(p.path).then(refresh)}>
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="projects-open">
            <button
              className="btn"
              disabled={Boolean(busy)}
              onClick={() =>
                attempt("Opening…", async () => {
                  const folder = await api.chooseFolder("Open a project folder");
                  if (folder) onOpen(await api.openProject(folder));
                })
              }
            >
              <Icon name="folder" size={16} />
              Open a folder…
            </button>
            <button className="btn" disabled={Boolean(busy)} onClick={() => importInput.current?.click()}>
              <Icon name="file" size={16} />
              Import a site file…
            </button>
            <input
              ref={importInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importFile(file);
              }}
            />
          </div>
        </section>
      </div>
      {busy && <p className="projects-status">{busy}</p>}
      {error && <p className="projects-status projects-status--error">{error}</p>}
      {catalogue && (
        <TemplateCatalogue
          onClose={() => setCatalogue(false)}
          onOpenFile={() => {
            setCatalogue(false);
            importInput.current?.click();
          }}
          onPick={(_build, picked) => {
            setTemplate(picked);
            setStart("template");
            setCatalogue(false);
          }}
        />
      )}
    </div>
  );
}

function ProjectEditor({ project, onClose }: { project: OpenedProject; onClose: () => void }) {
  const api = desktop!;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState("");
  const initialSite = migrateSite(project.site) ?? createBlankSite();

  const persist = useCallback(
    (site: Site) => {
      setSaveStatus("saving");
      api
        .saveSite(JSON.stringify(site, null, 2))
        .then(() => setSaveStatus("saved"))
        .catch((e: unknown) => {
          setSaveStatus("error");
          setSaveError(e instanceof Error ? e.message : String(e));
        });
    },
    [api]
  );

  const value: DesktopContextValue = { project, saveStatus, saveError, switchProject: onClose };
  return (
    <DesktopContext.Provider value={value}>
      <EditorProvider initialSite={initialSite} persist={persist}>
        <EditorShell />
      </EditorProvider>
    </DesktopContext.Provider>
  );
}

export function DesktopRoot(): ReactNode {
  const [project, setProject] = useState<OpenedProject | null>(null);

  function open(next: OpenedProject) {
    useProjectAssets(true);
    setProject(next);
  }

  function close() {
    void desktop!.closeProject();
    useProjectAssets(false);
    setProject(null);
  }

  return (
    <>
      {project ? <ProjectEditor key={project.path} project={project} onClose={close} /> : <ProjectsScreen onOpen={open} />}
      <UpdateNotice />
    </>
  );
}
