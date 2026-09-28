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
import { themeGoogleFonts } from "../model/fonts";
import { desktop, type ProjectConfig, type PublishService } from "../platform/desktop";
import { useEditor } from "../state/store";
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

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { state, derive } = useEditor();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const site = state.site;
  const checkCounts = useMemo(() => {
    const found = checkSite(site);
    return { total: found.length, fix: found.filter((i) => i.severity === "fix").length };
  }, [site]);
  const googleFonts = [...new Map(allThemes(site).flatMap(themeGoogleFonts).map((f) => [f.family, f])).values()];
  const [fontHosting, setFontHosting] = useState<FontHosting>("embed");
  const [optimise, setOptimise] = useState(true);
  const [config, setConfig] = useState<ProjectConfig>({});
  const [connected, setConnected] = useState({ netlify: false, github: false, cloudflare: false });
  const [cfAccount, setCfAccount] = useState("");
  const [cfProject, setCfProject] = useState(slugify(site.name));
  const [netlifyName, setNetlifyName] = useState("");
  const [repo, setRepo] = useState(slugify(site.name));

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
        if (!folder) return setStatus({ kind: "idle" });
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
        return;
      }
      console.error(error);
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  const working = status.kind === "working";
  const missingDescriptions = site.pages.filter((p) => !p.seo.description.trim()).map((p) => p.title);

  function openResult(url: string) {
    if (url.startsWith("folder:")) void desktop?.showFolder(url.slice("folder:".length));
    else void desktop?.openExternal(url);
  }

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>{desktop ? "Export & publish" : "Export website"}</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>

      <p className="dialog-lead">
        Creates plain HTML and CSS: one folder per page, with images in <code>assets/</code>. No build step, no
        runtime, nothing to pay for.{" "}
        <button className="link-button" onClick={() => (onClose(), openGuide("go-online"))}>
          New to this? Step-by-step guide →
        </button>
      </p>

      {checkCounts.total > 0 && (
        <p className={`dialog-note prepublish-banner${checkCounts.fix ? " has-fixes" : ""}`}>
          {checkCounts.fix ? `${checkCounts.fix} thing${checkCounts.fix === 1 ? "" : "s"} to fix` : "Nothing to fix"}
          {checkCounts.total - checkCounts.fix ? `, ${checkCounts.total - checkCounts.fix} to consider` : ""} before publishing.{" "}
          <button className="link-button" onClick={openPrepublish}>
            Review →
          </button>
        </p>
      )}
      {missingDescriptions.length > 0 && (
        <p className="dialog-note">
          Tip: {missingDescriptions.join(", ")} {missingDescriptions.length === 1 ? "has" : "have"} no search description.
          Add one in the page's settings (⋯ next to it under Pages).
        </p>
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

      <div className="dialog-actions">
        {desktop ? (
          <>
            <button className="btn btn--primary" disabled={working} onClick={() => run("project")}>
              Export to project folder
            </button>
            <button className="btn" disabled={working} onClick={() => run("choose")}>
              Export to…
            </button>
            <button className="btn" disabled={working} onClick={() => run("zip")}>
              Download .zip
            </button>
          </>
        ) : (
          <>
            <button className="btn btn--primary" disabled={working} onClick={() => run("zip")}>
              Download .zip
            </button>
            {canWriteToFolder() && (
              <button className="btn" disabled={working} onClick={() => run("browser-folder")}>
                Save to folder…
              </button>
            )}
          </>
        )}
      </div>

      {desktop && (
        <div className="publish">
          <h3 className="panel-heading">Publish online</h3>
          <section className="publish-target">
            <header>
              <strong>Netlify</strong>
              {config.netlify?.url && (
                <button className="link-button" onClick={() => openResult(config.netlify!.url!)}>
                  {config.netlify.url}
                </button>
              )}
            </header>
            <TokenField service="netlify" connected={connected.netlify} onChange={refreshConnections} />
            {connected.netlify && (
              <div className="publish-row">
                {!config.netlify?.siteId && (
                  <input type="text" placeholder="Site name (optional, e.g. my-portfolio)" value={netlifyName} onChange={(e) => setNetlifyName(e.target.value)} />
                )}
                <button className="btn btn--primary" disabled={working} onClick={() => run("netlify")}>
                  {config.netlify?.siteId ? "Publish update" : "Publish to Netlify"}
                </button>
              </div>
            )}
          </section>
          <section className="publish-target">
            <header>
              <strong>GitHub Pages</strong>
              {config.github?.url && (
                <button className="link-button" onClick={() => openResult(config.github!.url!)}>
                  {config.github.url}
                </button>
              )}
            </header>
            <TokenField service="github" connected={connected.github} onChange={refreshConnections} />
            {connected.github && (
              <div className="publish-row">
                <input type="text" aria-label="Repository name" value={repo} onChange={(e) => setRepo(e.target.value)} />
                <button className="btn btn--primary" disabled={working || !slugify(repo)} onClick={() => run("github")}>
                  Publish to GitHub Pages
                </button>
              </div>
            )}
          </section>
          <section className="publish-target">
            <header>
              <strong>Cloudflare Pages</strong>
              {config.cloudflare?.url && (
                <button className="link-button" onClick={() => openResult(config.cloudflare!.url!)}>
                  {config.cloudflare.url}
                </button>
              )}
            </header>
            <TokenField service="cloudflare" connected={connected.cloudflare} onChange={refreshConnections} />
            {connected.cloudflare && (
              <div className="publish-row">
                <input type="text" aria-label="Cloudflare account ID" placeholder="Account ID (dashboard → any domain → right column)" value={cfAccount} onChange={(e) => setCfAccount(e.target.value)} />
                <input type="text" aria-label="Pages project name" placeholder="project-name" value={cfProject} onChange={(e) => setCfProject(e.target.value)} />
                <button className="btn btn--primary" disabled={working || !cfAccount.trim() || !slugify(cfProject)} onClick={() => run("cloudflare")}>
                  Publish to Cloudflare
                </button>
              </div>
            )}
          </section>
          <p className="panel-hint">Publishing replaces what is online with this version. Tokens are stored encrypted on this computer, never in the project.</p>
        </div>
      )}

      {status.kind === "working" && <p className="dialog-status">{status.message}</p>}
      {status.kind === "done" && (
        <p className="dialog-status dialog-status--ok">
          {status.message}{" "}
          {status.url && desktop && (
            <button className="link-button" onClick={() => openResult(status.url!)}>
              {status.url.startsWith("folder:") ? "Show folder" : "Open site"}
            </button>
          )}
          {status.url && !status.url.startsWith("folder:") && (
            <button className="link-button" onClick={() => (onClose(), openTellPeople())}>
              Tell people →
            </button>
          )}
        </p>
      )}
      {status.kind === "error" && <p className="dialog-status dialog-status--error">Failed: {status.message}</p>}

      <details className="dialog-help">
        <summary>Where can I host this for free?</summary>
        <ul>
          <li>
            <strong>Netlify Drop</strong>: drag the unzipped folder onto app.netlify.com/drop.
          </li>
          <li>
            <strong>Cloudflare Pages</strong>: create a project and choose “Upload assets” (the desktop app can do it for you).
          </li>
          <li>
            <strong>GitHub Pages</strong>: commit the files to a repository and enable Pages in its settings.
          </li>
        </ul>
        <p>
          {desktop
            ? "Or use one-click publishing above. "
            : "The desktop app can publish to Netlify, GitHub Pages or Cloudflare Pages in one click. "}
          To check the site locally, serve the folder (for example <code>npx serve</code>) rather than double-clicking
          <code>index.html</code>, because page links use clean folder URLs.
        </p>
      </details>
    </dialog>
  );
}
