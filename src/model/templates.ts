import { cardLayouts } from "./extras";
import { createBlock, createFooterSection, createHeaderSection, createPage, createSection } from "./factory";
import { defaultTheme } from "./theme";
import { SCHEMA_VERSION, type Block, type BlockProps, type Section, type Site } from "./types";

export interface SectionTemplate {
  id: string;
  name: string;
  build: () => Section;
}

type Place = { x: number; y: number; w: number; h: number };

function block(type: string, place: Place, props: BlockProps = {}, reveal?: { delay?: number; reveal?: "fade-up" | "fade" | "zoom" }): Block {
  const b = createBlock(type, place, props);
  if (reveal) b.motion = { reveal: reveal.reveal ?? "fade-up", delay: reveal.delay ?? 0 };
  return b;
}

export const SECTION_TEMPLATES: SectionTemplate[] = [
  {
    id: "hero-split",
    name: "Hero · split",
    build: () =>
      createSection(
        "Hero",
        [
          block("box", { x: 7, y: 0, w: 5, h: 20 }, { fill: "linear-gradient(145deg, var(--accent), #f2c38f)" }, { reveal: "zoom" }),
          block("heading", { x: 0, y: 1, w: 7, h: 10 }, { text: "Say it plainly.\nMake it yours.", level: "1", size: "display" }, {}),
          block("text", { x: 0, y: 12, w: 6, h: 3 }, { text: "One or two sentences on what you do and who it's for.", size: "l", color: "var(--muted)" }, { delay: 150 }),
          block("button", { x: 0, y: 16, w: 3, h: 3 }, { label: "Get started", size: "l" }, { delay: 300 }),
          block("button", { x: 3, y: 16, w: 3, h: 3 }, { label: "Learn more", variant: "ghost", size: "l" }, { delay: 300 })
        ],
        { paddingY: 72, minRows: 20 }
      )
  },
  {
    id: "hero-centered",
    name: "Hero · centred",
    build: () =>
      createSection(
        "Hero",
        [
          block("heading", { x: 1, y: 0, w: 10, h: 9 }, { text: "Big idea,\nbeautifully centred.", level: "1", size: "display", align: "center" }, {}),
          block("text", { x: 2, y: 10, w: 8, h: 3 }, { text: "A calm, focused opening for launches, events and portfolios.", size: "l", align: "center", color: "var(--muted)" }, { delay: 150 }),
          block("button", { x: 4, y: 14, w: 4, h: 3 }, { label: "Start here", size: "l", align: "center" }, { delay: 300 })
        ],
        { paddingY: 110, minRows: 17, background: "radial-gradient(ellipse at top, color-mix(in srgb, var(--accent) 22%, var(--bg)), var(--bg) 70%)" }
      )
  },
  {
    id: "features",
    name: "Feature grid",
    build: () =>
      createSection(
        "Features",
        [
          block("heading", { x: 0, y: 0, w: 8, h: 3 }, { text: "Why people choose us", size: "xl" }, {}),
          ...["Fast", "Friendly", "Yours"].map((title, i) =>
            block(
              "card",
              { x: i * 4, y: 4, w: 4, h: 9 },
              { eyebrow: `0${i + 1}`, title, text: "A sentence or two that backs the claim up with something concrete." },
              { delay: i * 150 }
            )
          )
        ],
        { background: "var(--surface)", minRows: 13 }
      )
  },
  {
    id: "carousel",
    name: "Carousel showcase",
    build: () => {
      const carousel = block("carousel", { x: 0, y: 4, w: 12, h: 20 }, { autoplay: 6 });
      return createSection(
        "Showcase",
        [block("heading", { x: 0, y: 0, w: 8, h: 3 }, { text: "Selected work", size: "xl" }, {}), carousel],
        { minRows: 24 }
      );
    }
  },
  {
    id: "testimonials",
    name: "Testimonials",
    build: () =>
      createSection(
        "Testimonials",
        [
          block("heading", { x: 0, y: 0, w: 8, h: 3 }, { text: "Kind words", size: "xl" }, {}),
          ...[
            ["Sam Okafor", "Founder, Tidewater"],
            ["Priya Nair", "Head of Marketing, Lumen"],
            ["Jonas Berg", "Photographer"]
          ].map(([name, role], i) =>
            block(
              "testimonial",
              { x: i * 4, y: 4, w: 4, h: 11 },
              { name, role, quote: "Clear, quick and genuinely good to work with. We'd do it all again tomorrow." },
              { delay: i * 150 }
            )
          )
        ],
        { minRows: 15 }
      )
  },
  {
    id: "pricing",
    name: "Pricing · three plans",
    build: () =>
      createSection(
        "Pricing",
        [
          block("heading", { x: 2, y: 0, w: 8, h: 3 }, { text: "Simple pricing", size: "xl", align: "center" }, {}),
          block("text", { x: 2, y: 3, w: 8, h: 2 }, { text: "No surprises. Change or cancel any time.", align: "center", color: "var(--muted)" }, {}),
          block("pricing", { x: 0, y: 7, w: 4, h: 15 }, { plan: "Starter", price: "$0", period: "forever", description: "For trying things out.", features: "One site\nExport anywhere\nCommunity help", buttonLabel: "Start free" }, {}),
          block(
            "pricing",
            { x: 4, y: 7, w: 4, h: 15 },
            { plan: "Studio", price: "$12", period: "/ month", description: "For people who publish often.", features: "Unlimited sites\nPriority help\nTeam sharing", buttonLabel: "Choose Studio", featured: true },
            { delay: 150 }
          ),
          block(
            "pricing",
            { x: 8, y: 7, w: 4, h: 15 },
            { plan: "Agency", price: "$39", period: "/ month", description: "For teams building for clients.", features: "Everything in Studio\nClient hand-off\nWhite-label", buttonLabel: "Talk to us" },
            { delay: 300 }
          )
        ],
        { minRows: 22 }
      )
  },
  {
    id: "faq",
    name: "FAQ",
    build: () =>
      createSection(
        "FAQ",
        [
          block("heading", { x: 0, y: 0, w: 4, h: 6 }, { text: "Questions,\nanswered", size: "xl" }, {}),
          block("text", { x: 0, y: 7, w: 4, h: 3 }, { text: "Something else? [Get in touch](mailto:hello@example.com).", color: "var(--muted)" }, {}),
          block("accordion", { x: 5, y: 0, w: 7, h: 14 }, {}, { delay: 150 })
        ],
        { minRows: 14 }
      )
  },
  {
    id: "gallery",
    name: "Gallery",
    build: () =>
      createSection("Gallery", [block("heading", { x: 0, y: 0, w: 8, h: 3 }, { text: "In pictures", size: "xl" }, {}), block("gallery", { x: 0, y: 4, w: 12, h: 24 })], {
        minRows: 28
      })
  },
  {
    id: "video",
    name: "Video feature",
    build: () =>
      createSection(
        "Video",
        [
          block("heading", { x: 0, y: 0, w: 5, h: 6 }, { text: "See it\nin motion", size: "xl" }, {}),
          block("text", { x: 0, y: 7, w: 5, h: 5 }, { text: "A short film says more than a page of text. Paste a YouTube or Vimeo link, or upload a clip." }, {}),
          block("video", { x: 6, y: 0, w: 6, h: 14 }, {}, { reveal: "zoom" })
        ],
        { minRows: 14 }
      )
  },
  {
    id: "tabs",
    name: "Tabbed details",
    build: () =>
      createSection(
        "Details",
        [block("heading", { x: 0, y: 0, w: 8, h: 3 }, { text: "The details", size: "xl" }, {}), block("tabs", { x: 0, y: 4, w: 8, h: 10 })],
        { minRows: 14, background: "var(--surface)" }
      )
  },
  {
    id: "cta",
    name: "Call to action band",
    build: () =>
      createSection(
        "Call to action",
        [
          block("heading", { x: 0, y: 0, w: 8, h: 4 }, { text: "Ready when you are.", size: "xl", color: "var(--accent-text)" }, {}),
          block("button", { x: 9, y: 0, w: 3, h: 4 }, { label: "Let's talk", size: "l", align: "right", variant: "light" }, { delay: 150 })
        ],
        { background: "var(--accent)", paddingY: 56, minRows: 4 }
      )
  },
  {
    id: "contact",
    name: "Contact",
    build: () =>
      createSection(
        "Contact",
        [
          block("heading", { x: 0, y: 0, w: 5, h: 6 }, { text: "Say hello", size: "xl" }, {}),
          block("text", { x: 0, y: 7, w: 5, h: 5 }, { text: "Tell us a little about your project and we'll reply within two working days.", color: "var(--muted)" }, {}),
          block("form", { x: 6, y: 0, w: 6, h: 20 }, { service: "email", email: "hello@example.com" }, { delay: 150 })
        ],
        { minRows: 20 }
      )
  }
];

const template = (id: string) => SECTION_TEMPLATES.find((t) => t.id === id)!.build();

const PROJECTS: [string, string, string, string][] = [
  ["Tidewater", "Brand & website", "2026", "#2f6f7a"],
  ["Lumen", "Product launch", "2025", "#b0507a"],
  ["Northfield Bakery", "Menus & signage", "2025", "#c9822b"],
  ["Quiet Hours", "Album artwork", "2024", "#5b4fa8"],
  ["Atlas Walks", "Travel guide app", "2024", "#3f7d4e"]
];

function projectSection([title, subtitle, year, colour]: [string, string, string, string]): Section {
  const section = createSection(
    title,
    [
      block("box", { x: 0, y: 0, w: 12, h: 14 }, { fill: `linear-gradient(135deg, ${colour}, #111)` }, { reveal: "fade" }),
      block("heading", { x: 0, y: 15, w: 8, h: 4 }, { text: title, level: "1", size: "xl" }, {}),
      block("text", { x: 0, y: 20, w: 7, h: 6 }, { text: `${subtitle}, ${year}.\n\nWhat the brief was, what we made, and what changed because of it.` }, { delay: 100 }),
      block("button", { x: 0, y: 27, w: 3, h: 3 }, { label: "Visit the project", variant: "outline" }, { delay: 200 })
    ],
    { minRows: 30 }
  );
  section.card = { subtitle, tag: year };
  return section;
}

function storySection(heading: string, text: string, background: string): Section {
  return createSection(
    heading,
    [
      block("heading", { x: 1, y: 0, w: 10, h: 5 }, { text: heading, size: "display", align: "center" }, {}),
      block("text", { x: 2, y: 6, w: 8, h: 3 }, { text, size: "l", align: "center", color: "var(--muted)" }, { delay: 150 })
    ],
    { minRows: 9, background }
  );
}

export function createShowcaseSite(): Site {
  const home = createPage("Home", "", [template("hero-split"), template("features"), template("carousel"), template("testimonials"), template("cta")]);
  const work = createPage("Work", "work", [template("hero-centered"), template("gallery"), template("video"), template("tabs")]);
  const projects = createPage("Projects", "projects", PROJECTS.map(projectSection));
  projects.shell = cardLayouts ? { type: "cardRiver", dots: true } : { type: "slides", dots: true };
  const story = createPage("Story", "story", [
    storySection("It started small.", "One person, one idea, one kitchen table.", "var(--bg)"),
    storySection("Then it grew.", "Friends became clients; clients became friends.", "var(--surface)"),
    storySection("Now it's yours.", "Everything here is built from blocks you can move.", "color-mix(in srgb, var(--accent) 14%, var(--bg))")
  ]);
  story.shell = { type: "slides", dots: true };
  const pricing = createPage("Pricing", "pricing", [template("pricing"), template("faq")]);
  const contact = createPage("Contact", "contact", [template("contact")]);
  const name = "Showcase";
  const [primary, secondary] = home.sections[0].blocks.filter((b) => b.type === "button");
  primary.props.href = `page:${contact.id}`;
  secondary.props.href = `page:${work.id}`;
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    theme: { ...defaultTheme },
    settings: { lang: "en", favicon: "", baseUrl: "" },
    header: createHeaderSection(name),
    footer: createFooterSection(name),
    pages: [home, work, projects, story, pricing, contact]
  };
}
