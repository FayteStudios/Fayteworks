import { getBlockDefinition } from "../blocks/registry";
import { createId } from "../util/id";
import { createLayer } from "./layers";
import { defaultTheme } from "./theme";
import { GRID_COLUMNS, SCHEMA_VERSION, type Block, type BlockProps, type Page, type Section, type Site } from "./types";

interface Placement {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  cols?: number;
}

export function createBlock(type: string, placement: Placement = {}, props: BlockProps = {}): Block {
  const def = getBlockDefinition(type);
  if (!def) {
    throw new Error(`Unknown block type: ${type}`);
  }
  const cols = placement.cols ?? GRID_COLUMNS;
  const w = Math.min(placement.w ?? def.defaultSize.w, cols);
  return {
    id: createId("blk"),
    type,
    x: Math.max(0, Math.min(placement.x ?? 0, cols - w)),
    y: Math.max(0, placement.y ?? 0),
    w,
    h: placement.h ?? def.defaultSize.h,
    props: { ...def.defaultProps, ...props },
    ...(def.defaultHitbox ? { hitbox: structuredClone(def.defaultHitbox) } : {})
  };
}

export function createSection(name = "Section", blocks: Block[] = [], settings: Partial<Section["settings"]> = {}): Section {
  const layer = createLayer("Group 1");
  return {
    id: createId("sec"),
    name,
    settings: {
      background: "",
      backgroundImage: "",
      paddingY: 64,
      fullBleed: false,
      minRows: 12,
      sticky: false,
      ...settings
    },
    layers: [layer],
    blocks: blocks.map((b) => (b.layerId ? b : { ...b, layerId: layer.id }))
  };
}

export function createPage(title: string, slug: string, sections: Section[] = [createSection("Section")]): Page {
  return { id: createId("pg"), title, slug, hideInNav: false, seo: { description: "", image: "" }, sections };
}

export function createHeaderSection(siteName: string): Section {
  return createSection("Header", [createBlock("nav", { x: 0, y: 0, w: 12, h: 3 }, { brand: siteName })], {
    paddingY: 16,
    minRows: 3,
    sticky: true,
    background: "var(--bg)"
  });
}

export function createFooterSection(siteName: string): Section {
  return createSection(
    "Footer",
    [
      createBlock("divider", { x: 0, y: 0, w: 12, h: 1 }),
      createBlock("footer", { x: 0, y: 2, w: 12, h: 2 }, { text: `© ${new Date().getFullYear()} ${siteName}` })
    ],
    { paddingY: 32, minRows: 4 }
  );
}

export { slugify } from "../util/slug";

function createSiteShell(name: string, pages: Page[]): Site {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    theme: { ...defaultTheme },
    settings: { lang: "en", favicon: "", baseUrl: "" },
    header: createHeaderSection(name),
    footer: createFooterSection(name),
    pages
  };
}

export function createBlankSite(): Site {
  return createSiteShell("Untitled site", [createPage("Home", "")]);
}

export function createStarterSite(): Site {
  const hero = createSection(
    "Hero",
    [
      createBlock("box", { x: 7, y: 0, w: 5, h: 20 }, { fill: "linear-gradient(145deg, var(--accent), #f2c38f)" }),
      createBlock(
        "heading",
        { x: 0, y: 1, w: 7, h: 10 },
        { text: "Build websites\nyou actually own.", level: "1", size: "display" }
      ),
      createBlock(
        "text",
        { x: 0, y: 12, w: 6, h: 3 },
        {
          text: "Drag blocks onto the grid, tune them in the inspector, and keep the result — no subscription, no lock-in.",
          size: "l",
          color: "var(--muted)"
        }
      ),
      createBlock("button", { x: 0, y: 16, w: 3, h: 3 }, { label: "Start building", size: "l" }),
      createBlock("button", { x: 3, y: 16, w: 3, h: 3 }, { label: "About this site", variant: "ghost", size: "l" })
    ],
    { paddingY: 72, minRows: 20 }
  );

  const features = createSection(
    "Features",
    [
      createBlock("heading", { x: 0, y: 0, w: 8, h: 3 }, { text: "Everything is a block", size: "xl" }),
      createBlock(
        "card",
        { x: 0, y: 4, w: 4, h: 9 },
        { eyebrow: "01", title: "Place", text: "Drag from the library or click to add. Blocks snap to a 12-column grid." }
      ),
      createBlock(
        "card",
        { x: 4, y: 4, w: 4, h: 9 },
        { eyebrow: "02", title: "Tune", text: "Every block exposes its settings in the inspector on the right." }
      ),
      createBlock(
        "card",
        { x: 8, y: 4, w: 4, h: 9 },
        { eyebrow: "03", title: "Own", text: "Export plain HTML and CSS. Host it anywhere, keep it forever." }
      )
    ],
    { background: "var(--surface)", minRows: 13 }
  );

  const about = createPage("About", "about", [
    createSection("Intro", [
      createBlock("heading", { x: 0, y: 0, w: 8, h: 4 }, { text: "About", level: "1", size: "xl" }),
      createBlock(
        "text",
        { x: 0, y: 5, w: 7, h: 6 },
        {
          text: "This page exists to show shared headers, footers and page links working.\n\nEdit it, rename it, or delete it from the Pages tab."
        }
      )
    ])
  ]);

  const site = createSiteShell("My first site", [createPage("Home", "", [hero, features]), about]);
  hero.blocks[4].props.href = `page:${about.id}`;
  return site;
}
