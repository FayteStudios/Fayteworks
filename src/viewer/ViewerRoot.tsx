import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { mainLanguage, siteLanguages } from "../i18n/i18n";
import { sheetContext, sheetSize } from "../model/design";
import { fontFaceCss, googleFontsCssUrl, themeGoogleFonts } from "../model/fonts";
import { allThemes, pageTheme } from "../model/styles";
import { themeVars } from "../model/theme";
import { PAGE_LINK_PREFIX, type Site } from "../model/types";
import { useStyleText, useStylesheet } from "../editor/useStylesheet";
import { isExternalHref, RenderCtx, type RenderContext } from "../site/renderContext";
import { PageRenderer } from "../site/SiteRenderer";
import { assetUrl, useAssetVersion, useProjectAssets, usingProjectAssets } from "../state/assets";
import type { LiveMessage } from "./live";

const WIDTHS = [
  { value: 1440, label: "Desktop" },
  { value: 820, label: "Tablet" },
  { value: 390, label: "Phone" }
];

export function ViewerRoot() {
  const [site, setSite] = useState<Site | null>(null);
  const [editorPage, setEditorPage] = useState("");
  const [chosen, setChosen] = useState("follow");
  const [width, setWidth] = useState(1440);
  const [box, setBox] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const assetVersion = useAssetVersion();

  useEffect(() => {
    document.title = "FayteWorks · second window";
    const onMessage = (e: MessageEvent<LiveMessage>) => {
      if (e.data?.kind !== "fayteworks-live") return;
      if (e.data.projectAssets !== usingProjectAssets()) useProjectAssets(e.data.projectAssets);
      setSite(e.data.site);
      setEditorPage(e.data.pageId);
    };
    window.addEventListener("message", onMessage);
    window.opener?.postMessage({ kind: "fayteworks-hello" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [site === null]);

  useStylesheet("theme-fonts", site ? googleFontsCssUrl(allThemes(site).flatMap(themeGoogleFonts)) : null);
  useStyleText("site-font-files", useMemo(() => (site ? fontFaceCss(site.fonts, assetUrl) : ""), [site?.fonts, assetVersion]));

  const page = site ? (site.pages.find((p) => p.id === (chosen === "follow" ? editorPage : chosen)) ?? site.pages[0]) : null;
  const ctx = useMemo<RenderContext | null>(() => {
    if (!site || !page) return null;
    return {
      asset: assetUrl,
      link: (href) => (href.startsWith(PAGE_LINK_PREFIX) ? { href: "#", pageId: href.slice(PAGE_LINK_PREFIX.length), external: false } : { href: href || "#", external: isExternalHref(href) }),
      navPages: site.pages.filter((p, i) => !p.design && (i === 0 || !p.hideInNav)).map((p) => ({ id: p.id, title: p.title })),
      homePageId: site.pages[0].id,
      alternates: siteLanguages(site).map((l) => ({ code: l.code, label: l.label, href: "#", current: l.code === mainLanguage(site) })),
      currentPageId: page.id,
      isPreview: true,
      sheet: page.design ? sheetContext(page.design) : undefined,
      collections: site.collections,
      components: site.components,
      extras: site.extras,
      sprites: site.sprites
    };
  }, [site, page, assetVersion]);

  if (!site || !page || !ctx) {
    return (
      <div className="viewer-wait">
        <p>Waiting for the editor… Keep the main FayteWorks window open.</p>
      </div>
    );
  }

  const design = Boolean(page.design);
  const frameWidth = design ? sheetSize(page.design!).width : width;
  const scale = box ? Math.min(1, (box - 48) / frameWidth) : 1;
  const webPages = site.pages.filter((p) => !p.design);
  const designs = site.pages.filter((p) => p.design);

  return (
    <div className="viewer">
      <header className="viewer-bar">
        <strong>Second window</strong>
        <select aria-label="Show" value={chosen} onChange={(e) => setChosen(e.target.value)}>
          <option value="follow">Follow the editor ({site.pages.find((p) => p.id === editorPage)?.title ?? "…"})</option>
          <optgroup label="Pages">
            {webPages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </optgroup>
          {designs.length > 0 && (
            <optgroup label="Designs">
              {designs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {!design && (
          <div className="viewer-widths">
            {WIDTHS.map((w) => (
              <button key={w.value} className={width === w.value ? "is-active" : undefined} onClick={() => setWidth(w.value)}>
                {w.label}
              </button>
            ))}
          </div>
        )}
        <span className="viewer-note">Updates as you edit in the main window.</span>
      </header>
      <div className="viewer-stage" ref={stage}>
        <div className="viewer-scale">
          <div className="viewer-frame" style={{ width: frameWidth, zoom: scale }}>
            <RenderCtx.Provider value={ctx}>
              <div className={design ? "site-root site-root--design" : "site-root"} style={themeVars(pageTheme(site, page)) as CSSProperties}>
                <PageRenderer site={site} page={page} />
              </div>
            </RenderCtx.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}
