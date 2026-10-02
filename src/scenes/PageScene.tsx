import { PasswordFields } from "../client/ProtectSetting";
import { ItemPageSetting } from "../data/CollectionTools";
import { FieldList } from "../editor/Fields";
import { Icon } from "../editor/icons";
import { useEditingLang } from "../i18n/i18n";
import { cardLayouts } from "../model/extras";
import type { FieldDef } from "../model/fields";
import { findPage } from "../model/ops";
import { isCardShell, SHELL_OPTIONS, shellFields, shellOf } from "../model/shells";
import type { Page, PageShell, PropValue, ShellType } from "../model/types";
import { assetUrl, useAssetVersion } from "../state/assets";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import { StylePicker } from "./StylePicker";
import { SitePreview } from "./SitePreview";

const SHARE_PICTURE: FieldDef[] = [{ key: "image", label: "Share picture", kind: "image", hint: "1200 × 630 works best. Designs in the left bar → Link preview makes one." }];

function LayoutDiagram({ type }: { type: ShellType }) {
  if (type === "slides") {
    return (
      <span className="layout-diagram layout-diagram--slides">
        <span>
          <i />
          <i />
          <i />
        </span>
      </span>
    );
  }
  if (type === "sideways") {
    return (
      <span className="layout-diagram layout-diagram--horizontal layout-diagram--sideways">
        <span />
        <span />
        <span />
      </span>
    );
  }
  if (type === "horizontal") {
    return (
      <span className="layout-diagram layout-diagram--horizontal">
        <span />
        <span />
      </span>
    );
  }
  if (isCardShell(type)) {
    return (
      <span className="layout-diagram layout-diagram--cards">
        <span />
        <span />
        <span />
      </span>
    );
  }
  return (
    <span className="layout-diagram layout-diagram--scroll">
      <span />
      <span />
      <span />
    </span>
  );
}

export function PageScene({ pageId }: { pageId: string }) {
  const { state, commit } = useEditor();
  useAssetVersion();
  const lang = useEditingLang(state.site);
  const page = state.site.pages.find((p) => p.id === pageId);
  if (!page) return <p className="scene-empty">This page was deleted.</p>;
  const isHome = state.site.pages[0].id === page.id;
  const shell = shellOf(page);
  const title = lang ? (page.translations?.[lang]?.title ?? "") : page.title;
  const description = lang ? (page.translations?.[lang]?.description ?? "") : page.seo.description;
  const host = (state.site.settings.baseUrl || "yoursite.com").replace(/^https?:\/\//, "").replace(/\/+$/, "");

  function mutatePage(recipe: (p: Page) => void, key: string) {
    commit((draft) => {
      const p = findPage(draft, pageId);
      if (p) recipe(p);
    }, `${pageId}.${key}`);
  }

  return (
    <div className="scene-split">
      <section className="scene-preview-column" aria-label="Live preview">
        <div className="scene-caption">
          <span>Live preview</span>
          <span>Changes show as you make them</span>
        </div>
        <SitePreview site={state.site} page={page} label={`Preview of ${page.title}`} />
      </section>

      <div className="scene-cards">
        <section className="scene-card">
          <h3>The basics</h3>
          <label className="scene-field">
            <span>Name in the menu</span>
            <input
              type="text"
              value={title}
              placeholder={lang ? page.title : undefined}
              onChange={(e) =>
                mutatePage((p) => {
                  if (lang) ((p.translations ??= {})[lang] ??= {}).title = e.target.value;
                  else p.title = e.target.value;
                }, "title")
              }
            />
          </label>
          <label className="scene-field">
            <span>Web address</span>
            <input
              type="text"
              value={isHome ? "" : page.slug}
              disabled={isHome}
              placeholder={isHome ? "The home page is the site's own address" : undefined}
              onChange={(e) => mutatePage((p) => void (p.slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-")), "slug")}
            />
            <small>
              {host}/<strong>{isHome ? "" : page.slug}</strong>
            </small>
          </label>
          {!isHome && (
            <label className="scene-check">
              <input type="checkbox" checked={!page.hideInNav} onChange={(e) => mutatePage((p) => void (p.hideInNav = !e.target.checked), "hideInNav")} />
              Show it in the site's menu
            </label>
          )}
        </section>

        <section className="scene-card">
          <h3>Who can see it</h3>
          <label className={cls("scene-choice", !page.protect && "is-active")}>
            <input type="radio" name="who" checked={!page.protect} onChange={() => mutatePage((p) => void delete p.protect, "protect")} />
            <span>
              <strong>Everyone</strong>
              <small>Anyone with the link, and search engines.</small>
            </span>
          </label>
          <label className={cls("scene-choice", page.protect && "is-active")}>
            <input type="radio" name="who" checked={Boolean(page.protect)} onChange={() => mutatePage((p) => void (p.protect ??= { password: "", hint: "" }), "protect")} />
            <span>
              <strong>
                <Icon name="lock" size={14} /> Only people with a password
              </strong>
              <small>For clients, family or drafts.</small>
            </span>
          </label>
          {page.protect && <PasswordFields page={page} mutatePage={mutatePage} />}
          <label className="scene-check">
            <input type="checkbox" checked={!page.standalone} onChange={(e) => mutatePage((p) => void (p.standalone = !e.target.checked || undefined), "standalone")} />
            Show the site's header and footer
          </label>
        </section>

        <section className="scene-card scene-card--wide">
          <h3>How the page is laid out</h3>
          <div className="layout-choices" role="radiogroup" aria-label="Page layout">
            {[...SHELL_OPTIONS, ...(cardLayouts?.options ?? [])].map((option) => (
              <button
                key={option.value}
                role="radio"
                aria-checked={shell.type === option.value}
                className={cls("layout-choice", shell.type === option.value && "is-active")}
                onClick={() => mutatePage((p) => void (p.shell = { dots: true, ...p.shell, type: option.value }), "shell.type")}
              >
                <LayoutDiagram type={option.value} />
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
          {shellFields(shell.type).length > 0 && (
            <FieldList
              fields={shellFields(shell.type)}
              values={{ dots: true, ...shell } as unknown as Record<string, PropValue>}
              onChange={(key, value) => mutatePage((p) => void (p.shell = { ...shellOf(p), [key]: value } as PageShell), `shell.${key}`)}
            />
          )}
          {cardLayouts && isCardShell(shell.type) && <cardLayouts.PageSettings page={page} mutatePage={mutatePage} />}
        </section>

        <StylePicker page={page} />

        <section className="scene-card scene-card--wide scene-share">
          <div className="scene-share-fields">
            <h3>When someone shares it</h3>
            <label className="scene-field">
              <span>A sentence about the page</span>
              <textarea
                rows={3}
                value={description}
                placeholder={lang ? page.seo.description : "What's on this page, in a sentence or two."}
                onChange={(e) =>
                  mutatePage((p) => {
                    if (lang) ((p.translations ??= {})[lang] ??= {}).description = e.target.value;
                    else p.seo.description = e.target.value;
                  }, "seo.description")
                }
              />
            </label>
            <FieldList fields={SHARE_PICTURE} values={{ image: page.seo.image }} onChange={(_key, value) => mutatePage((p) => void (p.seo.image = String(value)), "seo.image")} />
          </div>
          <figure className="share-card" aria-label="How a shared link looks">
            <span className="share-card-image" style={page.seo.image ? { backgroundImage: `url("${assetUrl(page.seo.image)}")` } : undefined} />
            <figcaption>
              <small>{host}</small>
              <strong>
                {title || page.title} · {state.site.name}
              </strong>
              <span>{description || "Add a sentence so shared links say what the page is about."}</span>
            </figcaption>
          </figure>
        </section>

        {!isHome && (state.site.collections?.length ?? 0) > 0 && (
          <section className="scene-card scene-card--wide">
            <ItemPageSetting page={page} mutatePage={mutatePage} />
          </section>
        )}
      </div>
    </div>
  );
}
