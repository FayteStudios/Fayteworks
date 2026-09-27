import { useMemo, type ReactNode } from "react";
import { mainLanguage, pageTitle, siteLanguages, useEditingLang } from "../i18n/i18n";
import { itemValues } from "../data/model";
import { sheetContext } from "../model/design";
import { PAGE_LINK_PREFIX } from "../model/types";
import { isExternalHref, RenderCtx, type RenderContext } from "../site/renderContext";
import { assetUrl, useAssetVersion } from "../state/assets";
import { useEditor } from "../state/store";
import { fontFaceCss, googleFontsCssUrl, themeGoogleFonts } from "../model/fonts";
import { useStyleText, useStylesheet } from "./useStylesheet";
import { allThemes } from "../model/styles";

export function EditorRenderProvider({ children }: { children: ReactNode }) {
  const { state, page } = useEditor();
  const assetVersion = useAssetVersion();
  const { pages, theme } = state.site;
  useStylesheet("theme-fonts", googleFontsCssUrl(allThemes(state.site).flatMap(themeGoogleFonts)));
  useStyleText("site-font-files", useMemo(() => fontFaceCss(state.site.fonts, assetUrl), [state.site.fonts, assetVersion]));

  const lang = useEditingLang(state.site);
  const ctx = useMemo<RenderContext>(
    () => ({
      asset: assetUrl,
      link: (href) =>
        href.startsWith(PAGE_LINK_PREFIX)
          ? { href: "#", pageId: href.slice(PAGE_LINK_PREFIX.length), external: false }
          : { href: href || "#", external: isExternalHref(href) },
      navPages: pages.filter((p, i) => i === 0 || !p.hideInNav).map((p) => ({ id: p.id, title: pageTitle(p, lang) })),
      homePageId: pages[0].id,
      lang: lang || undefined,
      alternates: siteLanguages(state.site).map((l) => ({ code: l.code, label: l.label, href: "#", current: l.code === (lang || mainLanguage(state.site)) })),
      currentPageId: page.id,
      isEditor: true,
      isPreview: state.mode === "preview",
      sheet: page.design ? sheetContext(page.design) : undefined,
      collections: state.site.collections,
      templatePages: Object.fromEntries(pages.filter((p) => p.collectionId).map((p) => [p.collectionId!, p.id])),
      item: (() => {
        const first = page.collectionId ? state.site.collections?.find((c) => c.id === page.collectionId)?.items[0] : undefined;
        return first ? { values: itemValues(state.site.collections?.find((c) => c.id === page.collectionId), first), url: "#" } : undefined;
      })(),
      components: state.site.components,
      extras: state.site.extras,
      sprites: state.site.sprites
    }),
    [pages, page.id, page.design, page.collectionId, assetVersion, state.site.components, state.site.collections, state.site.extras, state.site.sprites, state.mode, lang, state.site.languages, state.site.settings.lang]
  );

  return <RenderCtx.Provider value={ctx}>{children}</RenderCtx.Provider>;
}
