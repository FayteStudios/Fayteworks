import { PAGE_LINK_PREFIX } from "../model/types";
import type { BlockDefinition } from "./types";
import { str } from "./util";

export const searchDefinitions: BlockDefinition[] = [
  {
    type: "search",
    badges: ["free", "noServer"],
    label: "Site search",
    category: "Navigation",
    icon: "🔍",
    description: "A search box for your pages and posts. Works on any host; no service needed.",
    defaultSize: { w: 5, h: 3 },
    defaultProps: { placeholder: "Search this site", results: 8 },
    fields: [
      { key: "placeholder", label: "Placeholder", kind: "text" },
      { key: "results", label: "Results to show", kind: "range", min: 3, max: 20 }
    ],
    mobileHeight: "content",
    render: (p, ctx) => {
      const root = ctx.link(`${PAGE_LINK_PREFIX}${ctx.homePageId}`).href.replace(/index\.html$/, "");
      const base = root === "#" ? "" : root.endsWith("/") ? root : `${root}/`;
      return (
        <div className="b-search" data-js="search" data-index={`${base}search-index.json`} data-root={base} data-max={Math.min(20, Math.max(3, Number(p.results) || 8))}>
          <form className="b-search-form" role="search" action="https://duckduckgo.com/" method="get" target="_blank">
            <input className="b-search-input" type="search" name="q" placeholder={str(p.placeholder, "Search this site")} aria-label={str(p.placeholder, "Search this site")} autoComplete="off" />
            {ctx.pageUrl && <input type="hidden" name="sites" value={new URL(ctx.pageUrl).host} />}
          </form>
          <ol className="b-search-results" aria-live="polite" hidden />
        </div>
      );
    }
  }
];
