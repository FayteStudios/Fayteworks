import { coverSvg } from "../data/blog";
import { localZone } from "../social/calendar";
import { createId } from "../util/id";
import { slugify } from "../util/slug";
import { createComponent } from "./components";
import { createBlock, createPage, createSection } from "./factory";
import { PAGE_LINK_PREFIX, type Block, type BlockProps, type Collection, type ComponentDef, type Page, type Section, type Site } from "./types";
import { createBlog } from "../data/blog";

export interface PageTemplateResult {
  pages: Page[];
  collections?: Collection[];
  components?: ComponentDef[];
  open: string;
}

export interface PageTemplate {
  id: string;
  label: string;
  description: string;
  build: (site: Site) => PageTemplateResult;
}

const b = (type: string, x: number, y: number, w: number, h: number, props: BlockProps = {}): Block => createBlock(type, { x, y, w, h }, props);

function uniqueSlug(site: Site, base: string): string {
  const taken = new Set(site.pages.map((p) => p.slug));
  let slug = slugify(base) || "page";
  while (taken.has(slug)) slug += "-1";
  return slug;
}

const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const ICON_LINKS = [
  { url: "https://www.instagram.com/yourname", label: "" },
  { url: "https://www.tiktok.com/@yourname", label: "" },
  { url: "https://www.youtube.com/@yourname", label: "" },
  { url: "https://discord.gg/yourinvite", label: "" }
];

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "link-in-bio",
    label: "Link in bio",
    description: "One page with all your links, for your Instagram or TikTok bio. Yours, instead of a Linktree.",
    build: (site) => {
      const page = createPage("Links", uniqueSlug(site, "links"), [
        createSection(
          "Links",
          [
            b("image", 5, 0, 2, 7, { src: "", alt: "", fit: "cover", radius: 999 }),
            b("heading", 3, 8, 6, 3, { text: site.name, level: "1", size: "m", align: "center" }),
            b("text", 3, 11, 6, 2, { text: "One line about what you do.", align: "center", color: "var(--muted)" }),
            b("social-links", 3, 14, 6, 16, {
              links: [
                { url: site.settings.baseUrl.trim() || "https://yoursite.com", label: "My website" },
                { url: "https://www.youtube.com/@yourname", label: "Latest video" },
                { url: "https://yourshop.example.com", label: "Shop" },
                { url: "https://ko-fi.com/yourname", label: "Support my work" }
              ],
              style: "buttons",
              colors: "theme",
              size: "m"
            }),
            b("social-links", 3, 31, 6, 3, { links: ICON_LINKS, style: "icons", colors: "plain", align: "center" })
          ],
          { minRows: 36, paddingY: 56 }
        )
      ]);
      page.standalone = true;
      page.hideInNav = true;
      page.seo.description = `${site.name}: links to everything.`;
      return { pages: [page], open: page.id };
    }
  },
  {
    id: "coming-soon",
    label: "Coming soon",
    description: "A countdown to your launch or drop, a sign-up for the news, and your social links.",
    build: (site) => {
      const page = createPage("Coming soon", uniqueSlug(site, "coming-soon"), [
        createSection(
          "Launch",
          [
            b("text", 2, 0, 8, 2, { text: "COMING SOON", align: "center", size: "s", color: "var(--accent)" }),
            b("heading", 1, 2, 10, 6, { text: "Something new\nis on its way.", level: "1", size: "display", align: "center" }),
            b("text", 2, 9, 8, 3, { text: "Be the first to know when it's here.", align: "center", size: "l", color: "var(--muted)" }),
            b("countdown", 2, 13, 8, 6, { at: `${inDays(30)}T18:00`, tz: localZone(), done: "It's here!", seconds: true, align: "center" }),
            b("newsletter", 3, 20, 6, 8, { heading: "", buttonLabel: "Tell me" }),
            b("social-links", 3, 29, 6, 3, { links: ICON_LINKS, style: "icons", colors: "theme", align: "center" })
          ],
          { minRows: 33, paddingY: 96 }
        )
      ]);
      page.standalone = true;
      page.hideInNav = true;
      page.seo.description = `Something new from ${site.name} is on its way.`;
      return { pages: [page], open: page.id };
    }
  },
  {
    id: "press-kit",
    label: "Press kit",
    description: "Everything a journalist, venue or partner needs: short bio, facts, logos, photos and who to contact.",
    build: (site) => {
      const page = createPage("Press kit", uniqueSlug(site, "press"), [
        createSection(
          "Intro",
          [
            b("heading", 0, 0, 8, 4, { text: "Press kit", level: "1", size: "xl" }),
            b("text", 0, 5, 7, 4, { text: `Logos, photos and facts about ${site.name}, free to use when writing about us. Need something else? Just ask.`, size: "l", color: "var(--muted)" }),
            b("button", 0, 10, 4, 2, { label: "Email for press", href: "mailto:press@example.com" })
          ],
          { minRows: 13, paddingY: 72 }
        ),
        createSection(
          "About",
          [
            b("heading", 0, 0, 5, 2, { text: "Short bio", level: "2", size: "m" }),
            b("text", 0, 3, 6, 8, { text: `${site.name} is… (two or three sentences, written the way you'd like to be introduced).\n\nA longer version for features and programmes can go here.` }),
            b("heading", 7, 0, 5, 2, { text: "Quick facts", level: "2", size: "m" }),
            b("list", 7, 3, 5, 8, { items: "Founded: 2026\nBased in: Your city\nWhat: One line\nWebsite: yoursite.com", style: "bullets" })
          ],
          { minRows: 12 }
        ),
        createSection(
          "Logos",
          [
            b("heading", 0, 0, 6, 2, { text: "Logos", level: "2", size: "m" }),
            b("text", 0, 2, 8, 2, { text: "Click a logo to open it full size, then save it. Please don't stretch or recolour them.", color: "var(--muted)", size: "s" }),
            b("card", 0, 5, 4, 8, { eyebrow: "", title: "Logo (colour)", text: "PNG, transparent background", image: "", href: "" }),
            b("card", 4, 5, 4, 8, { eyebrow: "", title: "Logo (white)", text: "For dark backgrounds", image: "", href: "", fill: "#111111", textColor: "#ffffff" }),
            b("card", 8, 5, 4, 8, { eyebrow: "", title: "Icon", text: "Square, for avatars", image: "", href: "" })
          ],
          { minRows: 14, background: "var(--surface)" }
        ),
        createSection("Photos", [b("heading", 0, 0, 6, 2, { text: "Photos", level: "2", size: "m" }), b("gallery", 0, 3, 12, 14, {})], { minRows: 18 })
      ]);
      page.seo.description = `Press kit for ${site.name}: bio, facts, logos and photos.`;
      return { pages: [page], open: page.id };
    }
  },
  {
    id: "events",
    label: "Events",
    description: "A list of your events (gigs, workshops, markets), a page for each with tickets and Add to calendar.",
    build: (site) => {
      const collection: Collection = {
        id: createId("col"),
        name: "Events",
        fields: [
          { key: "title", label: "Title", type: "text" },
          { key: "date", label: "Date", type: "date" },
          { key: "time", label: "Starts (24-hour, e.g. 19:30)", type: "text" },
          { key: "place", label: "Where", type: "text" },
          { key: "summary", label: "About it", type: "longtext" },
          { key: "image", label: "Picture", type: "image" },
          { key: "tickets", label: "Tickets or sign-up link", type: "link" }
        ],
        items: [
          { title: "Opening night", date: inDays(14), time: "19:00", place: "The Studio, 12 Main Street", summary: "Drinks, music and the new work, for the first time.", image: coverSvg("#7c5cff", "#f28fb1"), tickets: "" },
          { title: "Weekend workshop", date: inDays(28), time: "10:00", place: "Online", summary: "Two mornings, small group, everything you need to get started.", image: coverSvg("#1f9d8b", "#b5e3a1"), tickets: "" }
        ].map((v) => ({ id: createId("itm"), slug: slugify(v.title), values: v })),
        source: { kind: "manual" }
      };
      const card = createComponent(
        "Event card",
        [
          b("image", 0, 0, 12, 7, { src: "{{item.image}}", alt: "", fit: "cover" }),
          b("text", 0, 8, 12, 1, { text: "{{item.date_nice}} · {{item.time}}", size: "s", color: "var(--accent)" }),
          b("heading", 0, 10, 12, 2, { text: "{{item.title}}", level: "3", size: "s" }),
          b("text", 0, 12, 12, 2, { text: "{{item.place}}", size: "s", color: "var(--muted)" })
        ],
        4,
        { padding: 16, radius: 18, href: "{{item.url}}" }
      );
      card.description = "An event: picture, date, title and place; links to the event's page.";
      const index = createPage("Events", uniqueSlug(site, "events"), [
        createSection("Intro", [b("heading", 0, 0, 8, 4, { text: "Events", level: "1", size: "xl" }), b("text", 0, 5, 7, 3, { text: "Come and say hello.", size: "l", color: "var(--muted)" })], { minRows: 8, paddingY: 72 }),
        createSection("List", [b("collection", 0, 0, 12, 14, { collectionId: collection.id, componentId: card.id, columns: 3, gap: 24, sort: "date", order: "asc", empty: "No events planned right now. Check back soon!" })], { minRows: 14 })
      ]);
      const item = createPage("{{item.title}}", index.slug, [
        createSection(
          "Event",
          [
            b("text", 0, 0, 7, 1, { text: "{{item.date_nice}} · {{item.time}}", size: "s", color: "var(--accent)" }),
            b("heading", 0, 2, 7, 5, { text: "{{item.title}}", level: "1", size: "xl" }),
            b("text", 0, 7, 7, 2, { text: "📍 {{item.place}}", size: "m" }),
            b("text", 0, 10, 7, 5, { text: "{{item.summary}}", size: "l", color: "var(--muted)" }),
            b("add-to-calendar", 0, 16, 7, 3, { title: "{{item.title}}", start: "{{item.date}} {{item.time}}", length: 120, tz: localZone(), location: "{{item.place}}", details: "{{item.summary}}", label: "Add to calendar" }),
            b("button", 0, 20, 4, 2, { label: "Get tickets", href: "{{item.tickets}}", newTab: true }),
            b("image", 8, 0, 4, 16, { src: "{{item.image}}", alt: "", fit: "cover" })
          ],
          { minRows: 23, paddingY: 72 }
        ),
        createSection("More", [b("button", 0, 0, 4, 2, { label: "← All events", href: `${PAGE_LINK_PREFIX}${index.id}`, variant: "ghost" })], { minRows: 3, paddingY: 24 })
      ]);
      item.collectionId = collection.id;
      item.hideInNav = true;
      item.seo = { description: "{{item.summary}}", image: "{{item.image}}" };
      index.seo.description = `Upcoming events from ${site.name}.`;
      return { pages: [index, item], collections: [collection], components: [card], open: index.id };
    }
  },
  {
    id: "podcast",
    label: "Podcast",
    description: "Episodes with players and show notes, and a podcast feed for Apple Podcasts, Spotify and every podcast app.",
    build: (site) => {
      const collection: Collection = {
        id: createId("col"),
        name: "Episodes",
        kind: "posts",
        feed: true,
        podcast: { author: site.name, email: "", image: "", category: "Arts", explicit: false, description: "" },
        fields: [
          { key: "title", label: "Title", type: "text" },
          { key: "date", label: "Date", type: "date" },
          { key: "excerpt", label: "Summary", type: "longtext" },
          { key: "cover", label: "Episode art", type: "image" },
          { key: "audio", label: "Audio file (MP3 link or upload)", type: "link" },
          { key: "duration", label: "Duration (e.g. 42:10)", type: "text" },
          { key: "body", label: "Show notes", type: "markdown" }
        ],
        items: [
          {
            id: createId("itm"),
            slug: "episode-1",
            values: { title: "Episode 1: Hello", date: new Date().toISOString().slice(0, 10), excerpt: "What this show is about, and who it's for.", cover: coverSvg("#d9542c", "#f2c38f"), audio: "", duration: "", body: "Show notes go here: links to what we talked about, guests, and timestamps.\n\n- 00:00 Intro\n- 02:15 The main topic" }
          }
        ],
        source: { kind: "manual" }
      };
      const card = createComponent(
        "Episode card",
        [
          b("image", 0, 0, 3, 5, { src: "{{item.cover}}", alt: "", fit: "cover" }),
          b("text", 4, 0, 8, 1, { text: "{{item.date_nice}} · {{item.duration}}", size: "s", color: "var(--muted)" }),
          b("heading", 4, 1, 8, 2, { text: "{{item.title}}", level: "3", size: "s" }),
          b("text", 4, 3, 8, 2, { text: "{{item.excerpt}}", size: "s", color: "var(--muted)" })
        ],
        12,
        { padding: 16, radius: 18, href: "{{item.url}}" }
      );
      card.description = "An episode: art, date, title and summary; links to the episode.";
      const index = createPage("Podcast", uniqueSlug(site, "podcast"), [
        createSection(
          "Intro",
          [
            b("heading", 0, 0, 8, 4, { text: "The podcast", level: "1", size: "xl" }),
            b("text", 0, 5, 7, 3, { text: "New episodes every other week. Listen here or wherever you get your podcasts.", size: "l", color: "var(--muted)" }),
            b("social-links", 0, 9, 9, 3, {
              links: [
                { url: "https://podcasts.apple.com/", label: "Apple Podcasts" },
                { url: "https://open.spotify.com/", label: "Spotify" },
                { url: "https://www.youtube.com/@yourname", label: "YouTube" }
              ],
              style: "pills",
              colors: "brand"
            })
          ],
          { minRows: 13, paddingY: 72 }
        ),
        createSection("Episodes", [b("collection", 0, 0, 12, 12, { collectionId: collection.id, componentId: card.id, columns: 1, gap: 16, sort: "date", order: "desc" })], { minRows: 12 })
      ]);
      const episode = createPage("{{item.title}}", index.slug, [
        createSection(
          "Episode",
          [
            b("text", 2, 0, 8, 1, { text: "{{item.date_nice}} · {{item.duration}}", size: "s", color: "var(--muted)" }),
            b("heading", 2, 2, 8, 5, { text: "{{item.title}}", level: "1", size: "xl" }),
            b("text", 2, 7, 8, 3, { text: "{{item.excerpt}}", size: "l", color: "var(--muted)" }),
            b("audio", 2, 11, 8, 3, { src: "{{item.audio}}", title: "{{item.title}}" })
          ],
          { minRows: 15, paddingY: 64 }
        ),
        createSection("Show notes", [b("article", 2, 0, 8, 12, { markdown: "{{item.body}}" })], { minRows: 12, paddingY: 16 }),
        createSection("More", [b("button", 2, 0, 4, 2, { label: "← All episodes", href: `${PAGE_LINK_PREFIX}${index.id}`, variant: "ghost" })], { minRows: 3, paddingY: 24 })
      ]);
      episode.collectionId = collection.id;
      episode.hideInNav = true;
      episode.seo = { description: "{{item.excerpt}}", image: "{{item.cover}}" };
      index.seo.description = `${site.name}: the podcast. Every episode, with show notes.`;
      return { pages: [index, episode], collections: [collection], components: [card], open: index.id };
    }
  }
];

export interface ReadyMadeSection {
  id: string;
  label: string;
  description: string;
  build: (site: Site) => PageTemplateResult;
}

export const READY_MADE_SECTIONS: ReadyMadeSection[] = [
  { id: "link-in-bio", label: "Links", description: "Your photo, a line about you, and big buttons to everywhere you are.", build: PAGE_TEMPLATES[0].build },
  { id: "coming-soon", label: "Coming soon", description: "A countdown, a sign-up for the news, and your social links.", build: PAGE_TEMPLATES[1].build },
  { id: "press-kit", label: "Press kit", description: "Short bio, quick facts, logos and photos.", build: PAGE_TEMPLATES[2].build },
  { id: "events", label: "Events", description: "Your upcoming events, each with its own page.", build: PAGE_TEMPLATES[3].build },
  {
    id: "blog",
    label: "Latest posts",
    description: "Your newest blog posts, each with its own page.",
    build: (site) => {
      const blog = createBlog(site);
      return { pages: [blog.index, blog.post], collections: [blog.collection], components: [blog.card], open: blog.index.id };
    }
  },
  { id: "podcast", label: "Podcast episodes", description: "Your episodes with players and show notes.", build: PAGE_TEMPLATES[4].build }
];

/**
 * A ready-made page as sections for an existing page. A list the site already has (posts, podcast, a collection of
 * the same name) is reused instead of making a second one, and links back to the "all items" page point at the page
 * the sections go on.
 */
export function readyMadeForPage(site: Site, id: string, targetPageId: string): { sections: Section[]; collections: Collection[]; components: ComponentDef[]; pages: Page[] } {
  const made = READY_MADE_SECTIONS.find((r) => r.id === id)!.build(site);
  const main = made.pages.find((p) => p.id === made.open)!;
  const ids = new Map<string, string>([[main.id, targetPageId]]);
  const collections: Collection[] = [];
  const skipCollections = new Set<string>();
  for (const c of made.collections ?? []) {
    const existing = (site.collections ?? []).find((x) => (c.kind === "posts" && !c.podcast ? x.kind === "posts" && !x.podcast : c.podcast ? Boolean(x.podcast) : x.name === c.name));
    if (existing) {
      ids.set(c.id, existing.id);
      skipCollections.add(c.id);
    } else collections.push(c);
  }
  const components: ComponentDef[] = [];
  for (const comp of made.components ?? []) {
    const existing = (site.components ?? []).find((x) => x.name === comp.name);
    if (existing && skipCollections.size) ids.set(comp.id, existing.id);
    else components.push(comp);
  }
  const pages = made.pages.filter((p) => p !== main && !(p.collectionId && skipCollections.has(p.collectionId)));
  const remap = (text: string) => {
    let out = text;
    for (const [from, to] of ids) out = out.split(from).join(to);
    return out;
  };
  const fix = (sections: Section[]) => sections.map((s) => JSON.parse(remap(JSON.stringify(s))) as Section);
  for (const p of pages) p.sections = fix(p.sections);
  const sections = fix(main.sections);
  for (const s of sections) for (const blk of s.blocks) if (blk.type === "heading" && String(blk.props.level) === "1") blk.props.level = "2";
  return { sections, collections, components, pages };
}
