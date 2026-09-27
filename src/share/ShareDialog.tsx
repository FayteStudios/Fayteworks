import { useEffect, useRef, useState } from "react";
import { TokenField } from "../editor/ExportDialog";
import type { Site } from "../model/types";
import { desktop, type ProjectConfig } from "../platform/desktop";
import { buildPiece, codePenForm, toShopifySection, toSnippet, toWebComponent, toWordPress, type Piece, type PieceBundle } from "./piece";

function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const kb = (text: string) => `${Math.max(1, Math.round(new Blob([text]).size / 1024))} KB`;

export function ShareDialog({ site, piece, onClose }: { site: Site; piece: Piece; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [bundle, setBundle] = useState<PieceBundle | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<ProjectConfig>({});
  const [connected, setConnected] = useState({ shopify: false, wordpress: false });
  const [themes, setThemes] = useState<{ id: number; name: string; role: string }[]>([]);

  useEffect(() => {
    ref.current?.showModal();
    buildPiece(site, piece).then(setBundle, (e) => setError(e instanceof Error ? e.message : String(e)));
    if (desktop) {
      void desktop.projectConfig().then((c) => setConfig(c ?? {}));
      void refresh();
    }
  }, []);

  async function refresh() {
    const [shopify, wordpress] = await Promise.all([desktop!.hasToken("shopify"), desktop!.hasToken("wordpress")]);
    setConnected({ shopify, wordpress });
  }
  const say = (key: string, text: string) => setStatus((s) => ({ ...s, [key]: text }));
  const saveConfig = (next: ProjectConfig) => {
    setConfig(next);
    void desktop?.saveProjectConfig(next);
  };
  async function attempt(key: string, fn: () => Promise<string>) {
    say(key, "Working…");
    try {
      say(key, await fn());
    } catch (e) {
      say(key, e instanceof Error ? e.message : String(e));
    }
  }

  const snippet = bundle ? toSnippet(bundle) : "";
  const shopifyDomain = config.shopify?.domain ?? "";
  const wp = config.wordpress ?? {};

  return (
    <dialog ref={ref} className="dialog share-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Export or share “{bundle?.name ?? "…"}”</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      {error && <p className="dialog-note">{error}</p>}
      {!bundle && !error && <p className="panel-hint">Getting it ready…</p>}
      {bundle && (
        <div className="share-grid">
          <section className="share-card">
            <h3>Embed anywhere</h3>
            <p className="field-hint">
              For the custom HTML / embed / code block of Squarespace, Wix, Webflow, WordPress, Shopify (Custom Liquid), Carrd, Ghost… Its styles stay inside it.
              {` ${kb(snippet)}.`}
            </p>
            <div className="field-row">
              <button className="btn btn--small" onClick={() => void navigator.clipboard.writeText(snippet).then(() => say("embed", "Copied."))}>
                Copy
              </button>
              <button className="btn btn--small" onClick={() => download(`${bundle.slug}.html`, snippet, "text/html")}>
                Download .html
              </button>
            </div>
            {status.embed && <p className="field-hint">{status.embed}</p>}
          </section>

          <section className="share-card">
            <h3>Web Component</h3>
            <p className="field-hint">One .js file: add it to any site or app (React, Vue, plain HTML) and use its tag. Fully sealed from the host page's styles.</p>
            <div className="field-row">
              <button className="btn btn--small" onClick={() => download(`${toWebComponent(bundle).tag}.js`, toWebComponent(bundle).file, "text/javascript")}>
                Download .js
              </button>
              <button className="btn btn--small" onClick={() => void navigator.clipboard.writeText(toWebComponent(bundle).usage).then(() => say("wc", "Copied how to use it."))}>
                Copy usage
              </button>
            </div>
            <code className="share-code">{toWebComponent(bundle).usage}</code>
            {status.wc && <p className="field-hint">{status.wc}</p>}
          </section>

          <section className="share-card">
            <h3>Shopify section</h3>
            <p className="field-hint">A theme section whose text, pictures and links are settings in Shopify's theme editor. Add it there with “Add section”.</p>
            <button
              className="btn btn--small"
              onClick={() =>
                void attempt("shopify", async () => {
                  const { file, filename } = await toShopifySection(site, piece);
                  download(filename, file);
                  return `Downloaded ${filename}: put it in your theme's sections folder.`;
                })
              }
            >
              Download .liquid
            </button>
            {desktop && (
              <div className="share-connect">
                <input type="text" aria-label="Shopify store" placeholder="my-store.myshopify.com" value={shopifyDomain} onChange={(e) => saveConfig({ ...config, shopify: { ...config.shopify, domain: e.target.value.trim() } })} />
                <TokenField service="shopify" connected={connected.shopify} onChange={() => void refresh()} />
                {connected.shopify && shopifyDomain && (
                  <div className="field-row">
                    <button className="btn btn--small" onClick={() => void attempt("shopify", async () => (setThemes(await desktop!.platformCall("shopifyThemes", shopifyDomain)), "Pick the theme to send it to."))}>
                      Load themes
                    </button>
                    {themes.length > 0 && (
                      <select aria-label="Theme" value={config.shopify?.themeId ?? ""} onChange={(e) => saveConfig({ ...config, shopify: { ...config.shopify, domain: shopifyDomain, themeId: Number(e.target.value) } })}>
                        <option value="">Choose a theme…</option>
                        {themes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                            {t.role === "main" ? " (live)" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    {config.shopify?.themeId && (
                      <button
                        className="btn btn--small btn--primary"
                        onClick={() =>
                          void attempt("shopify", async () => {
                            const { file, filename } = await toShopifySection(site, piece);
                            const key = await desktop!.platformCall("shopifyPut", shopifyDomain, config.shopify!.themeId!, `sections/${filename}`, file);
                            return `Sent as ${key}. In Shopify: Online Store → Customize → Add section → “${bundle.name}”.`;
                          })
                        }
                      >
                        Send to theme
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {status.shopify && <p className="field-hint">{status.shopify}</p>}
          </section>

          <section className="share-card">
            <h3>WordPress</h3>
            <p className="field-hint">A block pattern (for a theme's patterns folder), or paste into the block editor's code view.</p>
            <div className="field-row">
              <button className="btn btn--small" onClick={() => download(`${bundle.slug}.php`, toWordPress(bundle).pattern)}>
                Download pattern
              </button>
              <button className="btn btn--small" onClick={() => void navigator.clipboard.writeText(toWordPress(bundle).blockMarkup).then(() => say("wp", "Copied: paste it in the block editor's code editor."))}>
                Copy for the block editor
              </button>
            </div>
            {desktop && (
              <div className="share-connect">
                <input type="url" aria-label="WordPress site" placeholder="https://example.com" value={wp.url ?? ""} onChange={(e) => saveConfig({ ...config, wordpress: { ...wp, url: e.target.value.trim() } })} />
                <input type="text" aria-label="WordPress username" placeholder="Username" value={wp.user ?? ""} onChange={(e) => saveConfig({ ...config, wordpress: { ...wp, user: e.target.value.trim() } })} />
                <TokenField service="wordpress" connected={connected.wordpress} onChange={() => void refresh()} />
                {connected.wordpress && wp.url && wp.user && (
                  <button
                    className="btn btn--small btn--primary"
                    onClick={() =>
                      void attempt("wp", async () => {
                        const made = await desktop!.platformCall("wordpressPattern", wp.url!, wp.user!, bundle.name, toWordPress(bundle).blockMarkup);
                        return `Saved as a pattern (#${made.id}): find it under Patterns in the block editor.`;
                      })
                    }
                  >
                    Save to WordPress
                  </button>
                )}
              </div>
            )}
            {status.wp && <p className="field-hint">{status.wp}</p>}
          </section>

          <section className="share-card">
            <h3>Share with others</h3>
            <p className="field-hint">Post it on component sites. CodePen opens with it filled in; for Uiverse, copy it and paste into their editor.</p>
            <div className="field-row">
              <button
                className="btn btn--small"
                onClick={() => {
                  const form = codePenForm(bundle);
                  if (desktop) void desktop.openHtml(form);
                  else {
                    const w = window.open("", "_blank");
                    if (w) {
                      w.document.write(form);
                      w.document.close();
                    }
                  }
                  say("share", "Opening CodePen in your browser…");
                }}
              >
                Open in CodePen
              </button>
              <button
                className="btn btn--small"
                onClick={() =>
                  void navigator.clipboard.writeText(`<!-- HTML -->\n${bundle.markup}\n\n/* CSS */\n${bundle.css}`).then(() => {
                    say("share", "HTML and CSS copied. Uiverse asks for a free account; posts there are MIT licensed.");
                    if (desktop) void desktop.openExternal("https://uiverse.io/");
                  })
                }
              >
                Copy for Uiverse
              </button>
            </div>
            {status.share && <p className="field-hint">{status.share}</p>}
          </section>
        </div>
      )}
      <p className="panel-hint share-footnote">
        What you make is yours: nothing here adds a FayteWorks credit or watermark. Pieces from component libraries carry their licence notes along, as
        their licences ask. Pieces captured for reference can't be exported.
      </p>
    </dialog>
  );
}
