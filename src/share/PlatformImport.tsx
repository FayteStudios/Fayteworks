import { useEffect, useState } from "react";
import { TokenField } from "../editor/ExportDialog";
import type { BlockProps } from "../model/types";
import { desktop, type CaptureResult, type ProjectConfig } from "../platform/desktop";
import { liquidToCode } from "./liquid";

export function PlatformImport({ onAdd, onCaptured }: { onAdd: (props: BlockProps, size: { w: number; h: number }) => void; onCaptured: (result: CaptureResult) => void }) {
  const [config, setConfig] = useState<ProjectConfig>({});
  const [connected, setConnected] = useState({ shopify: false, wordpress: false });
  const [themes, setThemes] = useState<{ id: number; name: string; role: string }[]>([]);
  const [themeId, setThemeId] = useState<number | "">("");
  const [sections, setSections] = useState<string[]>([]);
  const [pages, setPages] = useState<{ id: number; title: string; link: string; status: string }[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!desktop) return;
    void desktop.projectConfig().then((c) => setConfig(c ?? {}));
    void refresh();
  }, []);
  if (!desktop) return null;

  async function refresh() {
    const [shopify, wordpress] = await Promise.all([desktop!.hasToken("shopify"), desktop!.hasToken("wordpress")]);
    setConnected({ shopify, wordpress });
  }
  const save = (next: ProjectConfig) => {
    setConfig(next);
    void desktop!.saveProjectConfig(next);
  };
  async function attempt(fn: () => Promise<string | void>) {
    setStatus("Working…");
    try {
      setStatus((await fn()) ?? "");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }
  const domain = config.shopify?.domain ?? "";
  const wp = config.wordpress ?? {};

  return (
    <div className="platform-import">
      <h3 className="panel-heading">From your own store or site</h3>
      <div className="share-grid">
        <section className="share-card">
          <h3>Shopify</h3>
          <input type="text" aria-label="Shopify store" placeholder="my-store.myshopify.com" value={domain} onChange={(e) => save({ ...config, shopify: { ...config.shopify, domain: e.target.value.trim() } })} />
          <TokenField service="shopify" connected={connected.shopify} onChange={() => void refresh()} />
          {connected.shopify && domain && (
            <>
              <div className="field-row">
                <button className="btn btn--small" onClick={() => void attempt(async () => setThemes(await desktop!.platformCall("shopifyThemes", domain)))}>
                  Load themes
                </button>
                {themes.length > 0 && (
                  <select
                    aria-label="Theme"
                    value={themeId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setThemeId(id || "");
                      if (id) void attempt(async () => setSections(await desktop!.platformCall("shopifySections", domain, id)));
                    }}
                  >
                    <option value="">Choose a theme…</option>
                    {themes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.role === "main" ? " (live)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {sections.length > 0 && (
                <ul className="platform-list">
                  {sections.map((key) => (
                    <li key={key}>
                      <span>{key.replace(/^sections\//, "")}</span>
                      <button
                        className="btn btn--small"
                        onClick={() =>
                          void attempt(async () => {
                            const liquid = await desktop!.platformCall("shopifyGet", domain, Number(themeId), key);
                            const name = key.replace(/^sections\//, "").replace(/\.liquid$/, "");
                            const { props, removed } = liquidToCode(liquid, name);
                            props.source = `Shopify: ${themes.find((t) => t.id === themeId)?.name ?? "theme"} › ${key}`;
                            onAdd(props, { w: 12, h: 16 });
                            return removed ? `Imported. ${removed} bits of Shopify-only Liquid (loops, translations) were left out.` : "Imported.";
                          })
                        }
                      >
                        Import
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                className="btn btn--small"
                onClick={() =>
                  void attempt(async () => {
                    const got = await desktop!.captureFromWebsite(`https://${domain.replace(/^https?:\/\//, "")}`, { own: true });
                    if (got) onCaptured(got);
                  })
                }
              >
                Capture from the storefront…
              </button>
            </>
          )}
        </section>
        <section className="share-card">
          <h3>WordPress</h3>
          <input type="url" aria-label="WordPress site" placeholder="https://example.com" value={wp.url ?? ""} onChange={(e) => save({ ...config, wordpress: { ...wp, url: e.target.value.trim() } })} />
          <input type="text" aria-label="WordPress username" placeholder="Username" value={wp.user ?? ""} onChange={(e) => save({ ...config, wordpress: { ...wp, user: e.target.value.trim() } })} />
          <TokenField service="wordpress" connected={connected.wordpress} onChange={() => void refresh()} />
          {connected.wordpress && wp.url && wp.user && (
            <>
              <button className="btn btn--small" onClick={() => void attempt(async () => setPages(await desktop!.platformCall("wordpressPages", wp.url!, wp.user!)))}>
                Load pages
              </button>
              {pages.length > 0 && (
                <ul className="platform-list">
                  {pages.map((p) => (
                    <li key={p.id}>
                      <span>{new DOMParser().parseFromString(p.title, "text/html").body.textContent}</span>
                      <button
                        className="btn btn--small"
                        onClick={() =>
                          void attempt(async () => {
                            const got = await desktop!.captureFromWebsite(p.link, { own: true });
                            if (got) onCaptured(got);
                          })
                        }
                      >
                        Capture…
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
      {status && <p className="field-hint">{status}</p>}
    </div>
  );
}
