import { themeVars } from "./theme";
import type { Page, Site, StyleSet, Theme } from "./types";

export function styleOf(site: Site, page: Page): StyleSet | undefined {
  return page.styleId ? site.styles?.find((s) => s.id === page.styleId) : undefined;
}

export function styleTheme(site: Site, style: StyleSet | undefined): Theme {
  return style ? { ...site.theme, ...style.theme } : site.theme;
}

export function pageTheme(site: Site, page: Page): Theme {
  return styleTheme(site, styleOf(site, page));
}

export function allThemes(site: Site): Theme[] {
  return [site.theme, ...(site.styles ?? []).map((s) => styleTheme(site, s))];
}

export const styleClass = (style: StyleSet) => `style-${style.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

export function styleSetsCss(site: Site): string {
  return (site.styles ?? [])
    .map((style) => {
      const vars = Object.entries(themeVars(styleTheme(site, style)))
        .map(([name, value]) => `  ${name}: ${value};`)
        .join("\n");
      return `.site-root.${styleClass(style)} {\n${vars}\n}\n`;
    })
    .join("\n");
}
