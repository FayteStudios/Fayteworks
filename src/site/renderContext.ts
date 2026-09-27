import { createContext, useContext } from "react";
import { PAGE_LINK_PREFIX, type Collection, type ComponentDef } from "../model/types";

export interface ResolvedLink {
  href: string;
  pageId?: string;
  external: boolean;
}

export interface NavPage {
  id: string;
  title: string;
}

export interface RenderContext {
  asset(src: string): string;
  link(href: string): ResolvedLink;
  navPages: NavPage[];
  homePageId: string;
  currentPageId: string;
  isEditor?: boolean;
  isPreview?: boolean;
  sheet?: { width: number; height: number; bleed: number; safe: number; folds: number };
  components?: ComponentDef[];
  componentDepth?: number;
  collections?: Collection[];
  templatePages?: Record<string, string>;
  item?: { values: Record<string, string | number | boolean>; url: string };
  pageUrl?: string;
  lang?: string;
  alternates?: { code: string; label: string; href: string; current: boolean }[];
  extras?: Record<string, unknown>;
}

export function isExternalHref(href: string): boolean {
  return /^(https?:)?\/\//i.test(href) || /^(mailto|tel):/i.test(href);
}

export const defaultRenderContext: RenderContext = {
  asset: (src) => src,
  link: (href) => ({
    href: href.startsWith(PAGE_LINK_PREFIX) ? "#" : href || "#",
    external: isExternalHref(href)
  }),
  navPages: [],
  homePageId: "",
  currentPageId: ""
};

export const RenderCtx = createContext<RenderContext>(defaultRenderContext);

export function useRenderContext(): RenderContext {
  return useContext(RenderCtx);
}
