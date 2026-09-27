import { useState } from "react";
import { HandoverDialog } from "../client/ClientInspector";
import { FieldList } from "../editor/Fields";
import { COMMON_LANGUAGES, languageLabel, mainLanguage, siteStrings } from "../i18n/i18n";
import { TranslateDialog } from "../i18n/TranslateDialog";
import type { FieldDef } from "../model/fields";
import { ServicesDialog } from "../services/ServicesDialog";
import { assetUrl, useAssetVersion } from "../state/assets";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import type { SiteTab } from "./scenes";

const TABS: { id: SiteTab; label: string }[] = [
  { id: "site", label: "The site" },
  { id: "connections", label: "Connections" },
  { id: "languages", label: "Languages" },
  { id: "client", label: "Handing it to a client" }
];

const TAB_ICON: FieldDef[] = [{ key: "favicon", label: "Tab icon", kind: "image", hint: "A square PNG or SVG. It shows in browser tabs and bookmarks." }];

export function SiteScene({ tab, setTab }: { tab: SiteTab; setTab: (tab: SiteTab) => void }) {
  const { state, commit } = useEditor();
  useAssetVersion();
  const [dialog, setDialog] = useState<null | "services" | "translate" | "handover">(null);
  const { site } = state;
  const services = site.services ?? {};

  const connections = [
    { what: "Visitor stats", detail: services.analytics ? `${services.analytics.provider} is counting visits` : "See how many people visit, without cookie banners.", on: Boolean(services.analytics) },
    { what: "Shop", detail: services.snipcart ? "Snipcart runs the cart and checkout" : "A cart and checkout for Buy buttons.", on: Boolean(services.snipcart) },
    { what: "Member sign-in", detail: services.memberstack ? "Memberstack handles accounts" : "Let visitors sign up and log in.", on: Boolean(services.memberstack) },
    { what: "Live chat", detail: services.chat ? `${services.chat.provider} answers visitors` : "A chat bubble on every page.", on: Boolean(services.chat) }
  ];

  const languages = (site.languages ?? []).filter((l) => l.code !== mainLanguage(site));

  return (
    <div className="scene-nav-layout">
      <nav className="scene-nav" aria-label="Site settings">
        {TABS.map((t) => (
          <button key={t.id} className={cls(tab === t.id && "is-active")} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="scene-cards scene-cards--narrow">
        {tab === "site" && (
          <>
            <section className="scene-card">
              <h3>The site</h3>
              <label className="scene-field">
                <span>Site name</span>
                <input type="text" value={site.name} onChange={(e) => commit((d) => void (d.name = e.target.value), "site.name")} />
              </label>
              <label className="scene-field">
                <span>Its web address, once it's live</span>
                <input
                  type="text"
                  value={site.settings.baseUrl}
                  placeholder="https://example.com"
                  onChange={(e) => commit((d) => void (d.settings.baseUrl = e.target.value), "settings.baseUrl")}
                />
                <small>Share previews, the blog feed, the sitemap and search engines use it.</small>
              </label>
            </section>
            <section className="scene-card">
              <FieldList fields={TAB_ICON} values={{ favicon: site.settings.favicon }} onChange={(_k, v) => commit((d) => void (d.settings.favicon = String(v)), "settings.favicon")} />
              <div className="tab-preview" aria-label="How the browser tab looks">
                {site.settings.favicon ? <img src={assetUrl(site.settings.favicon)} alt="" /> : <span className="tab-preview-blank" />}
                <span>{site.name || "Untitled site"}</span>
              </div>
            </section>
          </>
        )}

        {tab === "connections" && (
          <section className="scene-card scene-card--wide">
            <div className="scene-card-head">
              <h3>Connections</h3>
              <button className="btn" onClick={() => setDialog("services")}>
                Set up or change
              </button>
            </div>
            <p className="scene-note">Services that do the server work for you. Each has a step-by-step guide, and FayteWorks only keeps their public ids. Newsletters, comments and booking are pieces you add from Add.</p>
            <div className="connection-grid">
              {connections.map((c) => (
                <div key={c.what} className="connection-card">
                  <div>
                    <strong>{c.what}</strong>
                    <span className={cls("status-chip", c.on && "is-on")}>{c.on ? "Connected" : "Not set up"}</span>
                  </div>
                  <small>{c.detail}</small>
                  <button className="btn btn--small" onClick={() => setDialog("services")}>
                    {c.on ? "Change" : "Set up"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "languages" && (
          <section className="scene-card scene-card--wide">
            <div className="scene-card-head">
              <h3>Languages</h3>
              <button className="btn" onClick={() => setDialog("translate")}>
                Translate or add a language
              </button>
            </div>
            <label className="scene-field">
              <span>The site's main language</span>
              <select value={mainLanguage(site)} onChange={(e) => commit((d) => void (d.settings.lang = e.target.value), "settings.lang")}>
                {!COMMON_LANGUAGES.some((l) => l.code === mainLanguage(site)) && <option value={mainLanguage(site)}>{mainLanguage(site)}</option>}
                {COMMON_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            {languages.length === 0 ? (
              <p className="scene-note">Only one language so far. Add one and each page gets its own address, like /es/, with a language switch for visitors.</p>
            ) : (
              <ul className="language-list">
                {languages.map((l) => {
                  const strings = siteStrings(site, l.code);
                  const done = strings.length ? Math.round((strings.filter((s) => s.translated.trim()).length / strings.length) * 100) : 100;
                  return (
                    <li key={l.code}>
                      <strong>{l.label || languageLabel(l.code)}</strong>
                      <span className="language-bar">
                        <span style={{ width: `${done}%` }} />
                      </span>
                      <small>{done}% done</small>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {tab === "client" && (
          <section className="scene-card scene-card--wide">
            <h3>Handing it to a client</h3>
            <p className="scene-note">
              Client mode lets the owner change words and pictures without being able to break the layout. It's locked with a PIN you choose.
            </p>
            <div className="scene-card-head">
              <span className={cls("status-chip", site.clientMode?.enabled && "is-on")}>{site.clientMode?.enabled ? `Handed over${site.clientMode.client ? ` to ${site.clientMode.client}` : ""}` : "Not handed over"}</span>
              <button className="btn btn--primary" onClick={() => setDialog("handover")}>
                Hand over to a client…
              </button>
            </div>
          </section>
        )}
      </div>

      {dialog === "services" && <ServicesDialog onClose={() => setDialog(null)} />}
      {dialog === "translate" && <TranslateDialog onClose={() => setDialog(null)} />}
      {dialog === "handover" && <HandoverDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
