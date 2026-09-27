import { createComponent } from "../model/components";
import { createBlock, createPage, createSection } from "../model/factory";
import { PAGE_LINK_PREFIX, type Block, type BlockProps, type Collection, type ComponentDef, type Page, type Site } from "../model/types";
import { createId } from "../util/id";
import { slugify } from "../util/slug";

const b = (type: string, x: number, y: number, w: number, h: number, props: BlockProps = {}): Block => createBlock(type, { x, y, w, h }, props);

export function coverSvg(from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><circle cx="930" cy="170" r="190" fill="#ffffff" opacity="0.18"/><circle cx="260" cy="560" r="260" fill="#000000" opacity="0.08"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const SAMPLE_POSTS = [
  {
    title: "Hello, world",
    date: "2026-09-20",
    tags: "News",
    excerpt: "Why this blog exists, and what you'll find here.",
    cover: coverSvg("#d9542c", "#f2c38f"),
    body: "Welcome! This is the first post. Edit it in the **Data** tab (✎ Write), or delete it and start your own.\n\n## What to write about\n\nShare what you're working on, answer the questions customers ask most, or tell the story behind what you make.\n\n> Posts are written in the app and published as plain pages: fast, and yours to keep.\n\nEvery post gets its own page, shows up on the blog page, and goes out in the RSS feed so readers (and newsletter services) can follow along."
  },
  {
    title: "Five things I learned building this site",
    date: "2026-09-24",
    tags: "Notes, Making",
    excerpt: "Small decisions that made a big difference.",
    cover: coverSvg("#2f6bff", "#7c5cff"),
    body: "A short list, as promised.\n\n1. Start with the words, then the layout.\n2. One accent colour is plenty.\n3. Big type on phones reads better than small type everywhere.\n4. Every page needs one clear next step.\n5. Publish early; nobody minds a small site.\n\n---\n\n_Tip:_ add pictures with the image button in the writing editor."
  }
];

export function createBlog(site: Site, name = "Blog"): { collection: Collection; card: ComponentDef; index: Page; post: Page } {
  const collection: Collection = {
    id: createId("col"),
    name: name === "Blog" ? "Posts" : `${name} posts`,
    kind: "posts",
    feed: true,
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "excerpt", label: "Summary", type: "longtext" },
      { key: "cover", label: "Cover picture", type: "image" },
      { key: "tags", label: "Tags (comma-separated)", type: "text" },
      { key: "body", label: "Post", type: "markdown" },
      { key: "bluesky", label: "Bluesky post for replies (optional)", type: "link" }
    ],
    items: SAMPLE_POSTS.map((p) => ({ id: createId("itm"), slug: slugify(p.title), values: { ...p, bluesky: "" } })),
    source: { kind: "manual" }
  };

  const card = createComponent(
    "Post card",
    [
      b("image", 0, 0, 12, 7, { src: "{{item.cover}}", alt: "", fit: "cover" }),
      b("text", 0, 8, 12, 1, { text: "{{item.date_nice}} · {{item.body_minutes}}", size: "s", color: "var(--muted)" }),
      b("heading", 0, 10, 12, 3, { text: "{{item.title}}", level: "3", size: "s" }),
      b("text", 0, 13, 12, 3, { text: "{{item.excerpt}}", size: "s", color: "var(--muted)" })
    ],
    4,
    { padding: 16, radius: 18, href: "{{item.url}}" }
  );
  card.description = "A blog post: cover, date, title and summary; the whole card links to the post.";

  const taken = new Set(site.pages.map((p) => p.slug));
  let slug = slugify(name) || "blog";
  while (taken.has(slug)) slug += "-1";

  const index = createPage(name, slug, [
    createSection("Intro", [b("heading", 0, 0, 8, 4, { text: name, level: "1", size: "xl" }), b("text", 0, 5, 7, 3, { text: "Notes, news and stories. Follow along with the RSS feed.", size: "l", color: "var(--muted)" })], { minRows: 8, paddingY: 72 }),
    createSection("Posts", [b("collection", 0, 0, 12, 14, { collectionId: collection.id, componentId: card.id, columns: 3, gap: 24, sort: "date", order: "desc", tagField: "tags" })], { minRows: 14 })
  ]);
  index.seo.description = `${name}: the latest posts.`;

  const post = createPage("{{item.title}}", slug, [
    createSection(
      "Title",
      [
        b("text", 2, 0, 8, 1, { text: "{{item.date_nice}} · {{item.body_minutes}} · {{item.tags}}", size: "s", color: "var(--muted)" }),
        b("heading", 2, 2, 8, 6, { text: "{{item.title}}", level: "1", size: "xl" }),
        b("text", 2, 8, 8, 3, { text: "{{item.excerpt}}", size: "l", color: "var(--muted)" }),
        b("image", 2, 12, 8, 14, { src: "{{item.cover}}", alt: "", fit: "cover" })
      ],
      { minRows: 26, paddingY: 64 }
    ),
    createSection("Post", [b("article", 2, 0, 8, 16, { markdown: "{{item.body}}" })], { minRows: 16, paddingY: 16 }),
    createSection(
      "After the post",
      [
        b("comments", 2, 0, 8, 10, { provider: "bluesky", post: "{{item.bluesky}}", heading: "Replies" }),
        b("heading", 0, 12, 8, 3, { text: "More posts", size: "l" }),
        b("button", 9, 13, 3, 2, { label: `All posts →`, href: `${PAGE_LINK_PREFIX}${index.id}`, variant: "ghost", align: "right" }),
        b("collection", 0, 16, 12, 14, { collectionId: collection.id, componentId: card.id, columns: 3, gap: 24, sort: "date", order: "desc", limit: 3 })
      ],
      { minRows: 30, background: "var(--surface)" }
    )
  ]);
  post.collectionId = collection.id;
  post.hideInNav = true;
  post.seo = { description: "{{item.excerpt}}", image: "{{item.cover}}" };
  return { collection, card, index, post };
}
