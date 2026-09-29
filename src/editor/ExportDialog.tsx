import { allThemes } from "../model/styles";
import { useEffect, useRef, useState, useMemo } from "react";
import { saveVersion } from "../history/versions";
import { checkSite } from "../quality/prepublish";
import { referenceSprites } from "../sprites/sprites";
import { openPrepublish } from "../quality/PrepublishDialog";
import { openGuide } from "../guides/GuideHost";
import { canWriteToFolder, downloadBlob, writeToFolder } from "../export/output";
import type { FontHosting, StaticSiteResult } from "../export/staticSite";
import { createZip } from "../export/zip";
import { slugify } from "../model/factory";
import { pieceGoogleFonts, themeGoogleFonts } from "../model/fonts";
import { desktop, type ProjectConfig, type PublishService } from "../platform/desktop";
import { useEditor } from "../state/store";
import { siCloudflare, siGithub, siNetlify } from "simple-icons";
import { openTellPeople } from "../social/TellPeopleDialog";

type Status = { kind: "idle" } | { kind: "working"; message: string } | { kind: "done"; message: string; url?: string } | { kind: "error"; message: string };
type Target = "zip" | "browser-folder" | "project" | "choose" | "netlify" | "github" | "cloudflare";

const TOKEN_HELP = {
  netlify: { label: "Netlify personal access token", url: "https://app.netlify.com/user/applications#personal-access-tokens" },
  github: { label: "GitHub token (classic, with the “repo” scope)", url: "https://github.com/settings/tokens/new?scopes=repo&description=Site%20Builder" },
  cloudflare: { label: "Cloudflare API token (Cloudflare Pages: Edit)", url: "https://dash.cloudflare.com/profile/api-tokens" },
  shopify: { label: "Shopify Admin API access token (custom app with read_themes and write_themes)", url: "https://help.shopify.com/en/manual/apps/app-types/custom-apps" },
  wordpress: { label: "WordPress Application Password (Users → Profile → Application Passwords)", url: "https://wordpress.org/documentation/article/application-passwords/" },
  buttondown: { label: "Buttondown API key (Settings → API)", url: "https://buttondown.com/settings" },
  plausible: { label: "Plausible API key (Settings → API Keys)", url: "https://plausible.io/settings/api-keys" },
  umami: { label: "Umami Cloud API key (Settings → API keys)", url: "https://cloud.umami.is/settings/api-keys" }
} as const;

export function TokenField({ service, connected, onChange, label, helpUrl }: { service: PublishService; connected: boolean; onChange: () => void; label?: string; helpUrl?: string }) {
  const help = (TOKEN_HELP as Record<string, { label: string; url: string } | undefined>)[service];
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  if (connected) {
    return (
      <p className="publish-connected">
        ✓ Connected{" "}
        <button className="link-button" onClick={() => void desktop!.setToken(service, null).then(onChange)}>
          Remove token
        </button>
      </p>
    );
  }
  return (
    <div className="publish-token">
      <input type="password" placeholder={label ?? help?.label ?? "Key"} value={token} onChange={(e) => setToken(e.target.value)} />
      <button
        className="btn btn--small"
        disabled={!token.trim()}
        onClick={() =>
          void desktop!
            .setToken(service, token.trim())
            .then(() => {
              setToken("");
              onChange();
            })
            .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        }
      >
        Save
      </button>
      {(helpUrl ?? help?.url) && (
        <button className="link-button" onClick={() => void desktop!.openExternal((helpUrl ?? help?.url)!)}>
          Get a token
        </button>
      )}
      {error && <p className="dialog-status dialog-status--error">{error}</p>}
    </div>
  );
}

const STEPS = ["Where", "Check", "Options", "Publish"] as const;
const LAST_TARGET = "fayteworks:publish-target";

interface TargetCard {
  id: Target;
  title: string;
  what: string;
  icon?: { path: string; hex: string };
  glyph?: string;
  online: boolean;
  available: boolean;
}

function readLastTarget(): Target | null {
  try {
    return (localStorage.getItem(LAST_TARGET) as Target | null) ?? null;
  } catch {
    return null;
  }
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { state, derive } = useEditor();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const site = state.site;
  const issues = useMemo(() => checkSite(site), [site]);
  const checkCounts = { total: issues.length, fix: issues.filter((i) => i.severity === "fix").length };
  const googleFonts = [...new Map([...allThemes(site).flatMap(themeGoogleFonts), ...pieceGoogleFonts(site)].map((f) => [f.family, f])).values()];
  const [fontHosting, setFontHosting] = useState<FontHosting>("embed");
  const [optimise, setOptimise] = useState(true);
  const [config, setConfig] = useState<ProjectConfig>({});
  const [connected, setConnected] = useState({ netlify: false, github: false, cloudflare: false });
  const [cfAccount, setCfAccount] = useState("");
  const [cfProject, setCfProject] = useState(slugify(site.name));
  const [netlifyName, setNetlifyName] = useState("");
  const [repo, setRepo] = useState(slugify(site.name));
  const [step, setStep] = useState(0);

  const cards: TargetCard[] = desktop
    ? [
        { id: "netlify", title: "Netlify", what: "Free hosting with its own web address. Updates in one click.", icon: siNetlify, online: true, available: true },
        { id: "github", title: "GitHub Pages", what: "Free hosting from a GitHub repository.", icon: siGithub, online: true, available: true },
        { id: "cloudflare", title: "Cloudflare Pages", what: "Free, fast hosting on Cloudflare's network.", icon: siCloudflare, online: true, available: true },
        { id: "project", title: "Project folder", what: "Save the finished site next to your project, to upload yourself.", glyph: "📁", online: false, available: true },
        { id: "choose", title: "Another folder…", what: "Pick any folder to save the finished site into.", glyph: "🗂", online: false, available: true },
        { id: "zip", title: "Download a .zip", what: "One file to upload anywhere (Netlify Drop, your host's file manager…).", glyph: "⤓", online: false, available: true }
      ]
    : [
        { id: "zip", title: "Download a .zip", what: "One file to upload anywhere (Netlify Drop, your host's file manager…).", glyph: "⤓", online: false, available: true },
        { id: "browser-folder", title: "Save to a folder", what: "Write the finished site straight into a folder on this computer.", glyph: "📁", online: false, available: canWriteToFolder() },
        { id: "netlify", title: "Netlify", what: "One-click publishing is in the desktop app.", icon: siNetlify, online: true, available: false },
        { id: "github", title: "GitHub Pages", what: "One-click publishing is in the desktop app.", icon: siGithub, online: true, available: false },
        { id: "cloudflare", title: "Cloudflare Pages", what: "One-click publishing is in the desktop app.", icon: siCloudflare, online: true, available: false }
      ];
  const [target, setTarget] = useState<Target>(() => {
    const last = readLastTarget();
    return last && cards.some((c) => c.id === last && c.available) ? last : cards[desktop ? 3 : 0].id;
  });
  const card = cards.find((c) => c.id === target) ?? cards[0];

  const refreshConnections = () => {
    if (!desktop) return;
    void Promise.all([desktop.hasToken("netlify"), desktop.hasToken("github"), desktop.hasToken("cloudflare")]).then(([netlify, github, cloudflare]) =>
      setConnected({ netlify, github, cloudflare })
    );
  };

  useEffect(() => {
    dialogRef.current?.showModal();
    if (!desktop) return;
    refreshConnections();
    void desktop.projectConfig().then((c) => {
      setConfig(c);
      if (c.netlify?.siteName) setNetlifyName(c.netlify.siteName);
      if (c.github?.repo) setRepo(c.github.repo);
      if (c.cloudflare?.accountId) setCfAccount(c.cloudflare.accountId);
      if (c.cloudflare?.project) setCfProject(c.cloudflare.project);
    });
  }, []);

  async function saveConfig(next: ProjectConfig) {
    setConfig(next);
    await desktop?.saveProjectConfig(next);
  }

  async function refreshedSite(): Promise<{ site: typeof state.site; refreshWarning: string }> {
    const due = desktop ? (site.collections ?? []).filter((c) => c.refreshOnPublish && c.source.kind !== "manual") : [];
    if (!due.length) return { site, refreshWarning: "" };
    setStatus({ kind: "working", message: "Fetching fresh data…" });
    const { fetchCollection } = await import("../data/sources");
    const fresh = new Map<string, Awaited<ReturnType<typeof fetchCollection>>>();
    const failed: string[] = [];
    for (const c of due) {
      try {
        fresh.set(c.id, await fetchCollection(c));
      } catch {
        failed.push(c.name);
      }
    }
    if (fresh.size) {
      derive((draft) => {
        for (const c of draft.collections ?? []) if (fresh.has(c.id)) Object.assign(c, fresh.get(c.id));
      });
    }
    setStatus({ kind: "working", message: "Building…" });
    return {
      site: { ...site, collections: site.collections?.map((c) => (fresh.has(c.id) ? { ...c, ...fresh.get(c.id)! } : c)) },
      refreshWarning: failed.length ? ` Couldn’t fetch fresh data for ${failed.join(", ")}, so the last fetched items were used.` : ""
    };
  }

  async function run(target: Target) {
    const borrowed = referenceSprites(site);
    if (borrowed.length && (target === "netlify" || target === "github" || target === "cloudflare"))
      return setStatus({ kind: "error", message: `This site uses sprites marked reference only (${borrowed.map((s) => s.name).join(", ")}), so it can't be published. Export to a folder to practise with it.` });
    setStatus({ kind: "working", message: "Building…" });
    try {
      void saveVersion(state.site, `Before ${target === "zip" ? "downloading" : target === "browser-folder" || target === "project" || target === "choose" ? "exporting" : `publishing to ${target}`}`, "publish").catch(() => undefined);
      const { buildStaticSite } = await import("../export/staticSite");
      const { site, refreshWarning } = await refreshedSite();
      const result: StaticSiteResult = await buildStaticSite(site, { fonts: fontHosting, images: optimise ? "optimise" : "original" });
      const fonts = result.fontFileCount ? `, ${result.fontFileCount} font file${result.fontFileCount === 1 ? "" : "s"}` : "";
      const summary = `${result.pageCount} page${result.pageCount === 1 ? "" : "s"}, ${result.assetCount} image${result.assetCount === 1 ? "" : "s"}${fonts}`;
      const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1)} MB`;
      const saved = result.imageSavings ? ` Pictures optimised: ${mb(result.imageSavings.before)} → ${mb(result.imageSavings.after)}.` : "";
      const warning = `${saved}${result.fontWarning ? ` ${result.fontWarning}` : ""}${result.feedWarning ? ` ${result.feedWarning}` : ""}${refreshWarning}`;

      if (target === "zip") {
        downloadBlob(createZip(result.files), `${slugify(site.name)}-website.zip`);
        setStatus({ kind: "done", message: `Downloaded ${summary}. Unzip it and upload the contents.${warning}` });
      } else if (target === "browser-folder") {
        const folder = await writeToFolder(result.files);
        setStatus({ kind: "done", message: `Wrote ${summary} into “${folder}”.${warning}` });
      } else if (target === "project" || target === "choose") {
        const folder = await desktop!.exportSite(result.files, target === "choose");
        if (!folder) {
          setStatus({ kind: "idle" });
          setStep(2);
          return;
        }
        setStatus({ kind: "done", message: `Wrote ${summary} into ${folder}.${warning}`, url: `folder:${folder}` });
      } else if (target === "netlify") {
        setStatus({ kind: "working", message: "Publishing to Netlify…" });
        const deployed = await desktop!.deployNetlify({
          zip: new Uint8Array(await createZip(result.files).arrayBuffer()),
          siteId: config.netlify?.siteId,
          siteName: netlifyName.trim() ? slugify(netlifyName) : undefined
        });
        await saveConfig({ ...config, netlify: { siteId: deployed.siteId, siteName: netlifyName.trim(), url: deployed.url } });
        setStatus({ kind: "done", message: `Published ${summary} to Netlify.${warning}`, url: deployed.url });
      } else if (target === "cloudflare") {
        setStatus({ kind: "working", message: `Publishing to Cloudflare Pages (${result.files.length} files)…` });
        const deployed = await desktop!.deployCloudflare({ accountId: cfAccount.trim(), project: slugify(cfProject), files: result.files });
        await saveConfig({ ...config, cloudflare: { accountId: cfAccount.trim(), project: deployed.project, url: deployed.url } });
        setStatus({ kind: "done", message: `Published ${summary} to Cloudflare Pages.${warning}`, url: deployed.url });
      } else if (target === "github") {
        const name = slugify(repo);
        setStatus({ kind: "working", message: `Publishing to GitHub Pages (${result.files.length} files)…` });
        const deployed = await desktop!.deployGithub({ repo: name, files: result.files });
        await saveConfig({ ...config, github: { repo: name, url: deployed.url } });
        setStatus({
          kind: "done",
          message: `Published to ${deployed.repo}. GitHub can take a minute to put a new site live.${warning}`,
          url: deployed.url
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus({ kind: "idle" });
        setStep(2);
        return;
      }
      console.error(error);
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  const working = status.kind === "working";
  const borrowed = referenceSprites(site);
  const blocked = card.online && borrowed.length > 0;
  const tokenReady = !card.online || connected[card.id as "netlify" | "github" | "cloudflare"];
  const targetReady = card.id === "github" ? Boolean(slugify(repo)) : card.id === "cloudflare" ? Boolean(cfAccount.trim() && slugify(cfProject)) : true;
  const lastUrl = (id: Target) => (id === "netlify" ? config.netlify?.url : id === "github" ? config.github?.url : id === "cloudflare" ? config.cloudflare?.url : undefined);
  const actionLabel: Record<Target, string> = {
    netlify: config.netlify?.siteId ? "Publish the update" : "Publish to Netlify",
    github: "Publish to GitHub Pages",
    cloudflare: "Publish to Cloudflare",
    project: "Save to the project folder",
    choose: "Choose a folder and save",
    zip: "Download the .zip",
    "browser-folder": "Choose a folder and save"
  };

  function openResult(url: string) {
    if (url.startsWith("folder:")) void desktop?.showFolder(url.slice("folder:".length));
    else void desktop?.openExternal(url);
  }

  function go() {
    try {
      localStorage.setItem(LAST_TARGET, target);
    } catch {
      /* private mode */
    }
    setStep(3);
    void run(target);
  }

  return (
    <dialog ref={dialogRef} className="dialog publish-flow" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Publish</h2>
        <ol className="publish-steps">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? "is-current" : i < step ? "is-done" : undefined}>
              <button disabled={working || i > step || (step === 3 && status.kind === "done")} onClick={() => setStep(i)}>
                <span>{i < step ? "✓" : i + 1}</span> {label}
              </button>
            </li>
          ))}
        </ol>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>

      {step === 0 && (
        <>
          <p className="dialog-lead">
            Where should the site go? It's built as plain HTML and CSS, with nothing to pay for.{" "}
            <button className="link-button" onClick={() => (onClose(), openGuide("go-online"))}>
              New to this? Step-by-step guide →
            </button>
          </p>
          <div className="publish-cards" role="radiogroup" aria-label="Where to publish">
            {cards.map((c) => (
              <button key={c.id} role="radio" aria-checked={target === c.id} disabled={!c.available} className={target === c.id ? "publish-card is-active" : "publish-card"} onClick={() => setTarget(c.id)}>
                <span className="publish-card-icon" aria-hidden>
                  {c.icon ? (
                    <svg viewBox="0 0 24 24" width="22" height="22">
                      <path d={c.icon.path} fill={`#${c.icon.hex}`} />
                    </svg>
                  ) : (
                    c.glyph
                  )}
                </span>
                <span className="publish-card-text">
                  <strong>{c.title}</strong>
                  <small>{c.what}</small>
                  {desktop && c.online && <small className={connected[c.id as "netlify"] ? "publish-card-ok" : "publish-card-need"}>{connected[c.id as "netlify"] ? "✓ Connected" : "Needs a token (next steps show how)"}</small>}
                  {lastUrl(c.id) && <small className="publish-card-url">Last published: {lastUrl(c.id)}</small>}
                </span>
              </button>
            ))}
          </div>
          <details className="dialog-help">
            <summary>Where can I host this for free?</summary>
            <ul>
              <li>
                <strong>Netlify Drop</strong>: drag the unzipped folder onto app.netlify.com/drop.
              </li>
              <li>
                <strong>Cloudflare Pages</strong>: create a project and choose “Upload assets”{desktop ? " (or publish from here)" : ""}.
              </li>
              <li>
                <strong>GitHub Pages</strong>: commit the files to a repository and enable Pages in its settings.
              </li>
            </ul>
            <p>
              To check the site locally, serve the folder (for example <code>npx serve</code>) rather than double-clicking <code>index.html</code>, because page links use clean folder URLs.
            </p>
          </details>
          <div className="publish-nav">
            <span />
            <button className="btn btn--primary" onClick={() => setStep(1)}>
              Next: a quick check →
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <div className={`publish-check${checkCounts.fix ? " has-fixes" : checkCounts.total ? " has-notes" : " is-clear"}`}>
            <strong>{checkCounts.total === 0 ? "✓ Everything looks good." : checkCounts.fix ? `${checkCounts.fix} thing${checkCounts.fix === 1 ? "" : "s"} to fix` : "Nothing to fix"}</strong>
            {checkCounts.total - checkCounts.fix > 0 && <span>{`${checkCounts.total - checkCounts.fix} thing${checkCounts.total - checkCounts.fix === 1 ? "" : "s"} worth a look`}</span>}
          </div>
          {issues.length > 0 && (
            <ul className="publish-issues">
              {issues.slice(0, 6).map((i) => (
                <li key={i.key} className={`is-${i.severity}`}>
                  {i.message}
                </li>
              ))}
              {issues.length > 6 && <li className="publish-issues-more">and {issues.length - 6} more</li>}
            </ul>
          )}
          {issues.length > 0 && (
            <button className="btn btn--small" onClick={openPrepublish}>
              Review and fix…
            </button>
          )}
          {blocked && (
            <p className="dialog-status dialog-status--error">
              This site uses sprites marked reference only ({borrowed.map((s) => s.name).join(", ")}), so it can't go online. Save it to a folder to practise with it.
            </p>
          )}
          <div className="publish-nav">
            <button className="btn" onClick={() => setStep(0)}>
              ← Back
            </button>
            <button className="btn btn--primary" disabled={blocked} onClick={() => setStep(2)}>
              {checkCounts.fix ? "Continue anyway →" : "Next: options →"}
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          {card.online && desktop && (
            <section className="publish-target">
              <header>
                <strong>{card.title}</strong>
                {lastUrl(card.id) && (
                  <button className="link-button" onClick={() => openResult(lastUrl(card.id)!)}>
                    {lastUrl(card.id)}
                  </button>
                )}
              </header>
              <TokenField service={card.id as PublishService} connected={connected[card.id as "netlify"]} onChange={refreshConnections} />
              {card.id === "netlify" && connected.netlify && !config.netlify?.siteId && (
                <input type="text" placeholder="Site name (optional, e.g. my-portfolio)" value={netlifyName} onChange={(e) => setNetlifyName(e.target.value)} />
              )}
              {card.id === "github" && connected.github && <input type="text" aria-label="Repository name" value={repo} onChange={(e) => setRepo(e.target.value)} />}
              {card.id === "cloudflare" && connected.cloudflare && (
                <div className="publish-row">
                  <input type="text" aria-label="Cloudflare account ID" placeholder="Account ID (dashboard → any domain → right column)" value={cfAccount} onChange={(e) => setCfAccount(e.target.value)} />
                  <input type="text" aria-label="Pages project name" placeholder="project-name" value={cfProject} onChange={(e) => setCfProject(e.target.value)} />
                </div>
              )}
              <p className="panel-hint">Publishing replaces what's online with this version. Tokens are stored encrypted on this computer, never in the project.</p>
            </section>
          )}
          {googleFonts.length > 0 && (
            <fieldset className="dialog-fonts">
              <legend>Fonts ({googleFonts.map((f) => f.family).join(", ")})</legend>
              <label>
                <input type="radio" checked={fontHosting === "embed"} onChange={() => setFontHosting("embed")} />
                Include the font files in the site <span>(recommended: private, works offline)</span>
              </label>
              <label>
                <input type="radio" checked={fontHosting === "link"} onChange={() => setFontHosting("link")} />
                Load them from Google Fonts <span>(smaller download)</span>
              </label>
            </fieldset>
          )}
          <label className="dialog-option">
            <input type="checkbox" checked={optimise} onChange={(e) => setOptimise(e.target.checked)} />
            Optimise pictures <span>(WebP, at most {2400}px wide: much faster pages)</span>
          </label>
          <div className="publish-nav">
            <button className="btn" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button className="btn btn--primary" disabled={!tokenReady || !targetReady || blocked} onClick={go}>
              {actionLabel[target]}
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          {(status.kind === "working" || status.kind === "idle") && (
            <div className="publish-working">
              <span className="publish-spinner" aria-hidden />
              <p>{status.kind === "working" ? status.message : "Starting…"}</p>
            </div>
          )}
          {status.kind === "done" && (
            <div className="publish-done">
              <strong>✓ Done</strong>
              <p>{status.message}</p>
              <div className="publish-nav">
                <div className="publish-row">
                  {status.url && desktop && (
                    <button className="btn" onClick={() => openResult(status.url!)}>
                      {status.url.startsWith("folder:") ? "Show the folder" : "Open the site"}
                    </button>
                  )}
                  <button
                    className="btn"
                    onClick={() => {
                      setStatus({ kind: "idle" });
                      setStep(0);
                    }}
                  >
                    Publish somewhere else
                  </button>
                </div>
                {status.url && !status.url.startsWith("folder:") ? (
                  <button className="btn btn--primary" onClick={() => (onClose(), openTellPeople())}>
                    Tell people →
                  </button>
                ) : (
                  <button className="btn btn--primary" onClick={onClose}>
                    Done
                  </button>
                )}
              </div>
            </div>
          )}
          {status.kind === "error" && (
            <>
              <p className="dialog-status dialog-status--error">That didn't work: {status.message}</p>
              <div className="publish-nav">
                <button
                  className="btn"
                  onClick={() => {
                    setStatus({ kind: "idle" });
                    setStep(2);
                  }}
                >
                  ← Back to options
                </button>
                <button className="btn btn--primary" onClick={go}>
                  Try again
                </button>
              </div>
            </>
          )}
        </>
      )}
    </dialog>
  );
}
