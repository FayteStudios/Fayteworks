import { cardLayouts } from "./extras";
import { newAnimation } from "../motion/compile";
import { newSound, presetDataUrl } from "../motion/sounds";
import { createId } from "../util/id";
import { createComponent } from "./components";
import {
  BEAN_BADGE,
  BREAD_BADGE,
  BROWSER,
  bounceFrames,
  barberPoleFrames,
  EDITOR,
  equalizerFrames,
  LEAF_BADGE,
  portrait,
  POSTER,
  SCISSORS,
  SPARKLE,
  steamingCupFrames,
  TEE,
  TOTE,
  VINYL
} from "./demoArt";
import { createBlock, createFooterSection, createHeaderSection, createPage, createSection } from "./factory";
import { PAGE_LINK_PREFIX, SCHEMA_VERSION, type Block, type BlockAnimation, type BlockProps, type Collection, type ComponentDef, type Page, type Section, type SectionSettings, type Site, type Theme } from "./types";

function b(type: string, x: number, y: number, w: number, h: number, props: BlockProps = {}, extra: Partial<Block> = {}): Block {
  return { ...createBlock(type, { x, y, w, h }, props), ...extra };
}
const anim = (preset: string, patch: Partial<BlockAnimation> = {}): BlockAnimation => ({ ...newAnimation(preset), ...patch });
const rise = (delay = 0): Partial<Block> => ({ animations: [anim("fade-rise", { delay: delay || undefined })] });
const sec = (name: string, blocks: Block[], settings: Partial<SectionSettings> = {}): Section => createSection(name, blocks, settings);
const link = (page: Page) => `${PAGE_LINK_PREFIX}${page.id}`;
const colours = (links: Record<string, string>) => Object.entries(links).map(([color, token]) => ({ color, token }));
const art = (svg: string, links: Record<string, string>, alt = "", fit = "contain"): BlockProps => ({ svg, colors: colours(links), fit, alt });
const flip = (frames: string[], links: Record<string, string>, fps: number, play: string, alt = ""): BlockProps => ({
  frames: frames.map((svg) => ({ svg })),
  fps,
  play,
  pingpong: false,
  fit: "contain",
  alt,
  colors: colours(links),
  editFrame: 0
});
const svgImage = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const sound = (on: "click" | "hover" | "view", preset: string, volume = 60) => ({ sounds: [{ ...newSound(on, presetDataUrl(preset)), volume, name: preset }] });

function site(name: string, theme: Theme, pages: Page[], extra: Partial<Site> = {}): Site {
  const header = createHeaderSection(name);
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    theme,
    settings: { lang: "en", favicon: "", baseUrl: "" },
    header,
    footer: createFooterSection(name),
    pages,
    ...extra
  };
}

function collection(name: string, fields: Collection["fields"], rows: Record<string, string | number | boolean>[], slugKey: string): Collection {
  return {
    id: createId("col"),
    name,
    fields,
    source: { kind: "manual" },
    items: rows.map((values) => ({ id: createId("itm"), slug: String(values[slugKey]).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), values }))
  };
}

function phoneOrder(section: Section, order: Block[]) {
  let y = 0;
  for (const wanted of order) {
    const block = section.blocks.find((x) => x.id === wanted.id);
    if (!block) continue;
    block.responsive = { ...block.responsive, phone: { x: 0, y, w: 12, h: block.h } };
    y += block.h + 1;
  }
  section.layouts = { ...section.layouts, phone: true };
}

function setNavCta(s: Site, label: string, href: string) {
  const nav = s.header?.blocks.find((x) => x.type === "nav");
  if (nav) Object.assign(nav.props, { ctaLabel: label, ctaHref: href });
}

export function createCafeSite(): Site {
  const theme: Theme = {
    background: "#f7f1e8",
    surface: "#fffaf3",
    text: "#2b1d14",
    muted: "#7a6553",
    accent: "#b5552b",
    accentText: "#ffffff",
    headingFont: "gf:Fraunces",
    bodyFont: "gf:DM Sans",
    radius: 18,
    maxWidth: 1180
  };
  const links = { "#b5552b": "var(--accent)", "#2b1d14": "var(--text)", "#fffaf3": "var(--surface)" };
  const menu = collection(
    "Menu",
    [
      { key: "name", label: "Name", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "price", label: "Price", type: "text" },
      { key: "description", label: "Description", type: "longtext" },
      { key: "favourite", label: "Favourite", type: "boolean" }
    ],
    [
      { name: "Espresso", category: "Coffee", price: "$3.20", description: "Our house blend, chocolatey and bright.", favourite: false },
      { name: "Flat white", category: "Coffee", price: "$4.50", description: "Double shot, velvety milk. The regulars' order.", favourite: true },
      { name: "Filter of the week", category: "Coffee", price: "$4.00", description: "A single origin, brewed by hand. Ask what's on.", favourite: false },
      { name: "Iced oat latte", category: "Coffee", price: "$5.00", description: "Oat milk at no extra cost, always.", favourite: false },
      { name: "Sourdough loaf", category: "Bakery", price: "$8.00", description: "Two-day ferment, baked at dawn. Sells out by noon.", favourite: true },
      { name: "Cardamom bun", category: "Bakery", price: "$4.20", description: "Buttery, knotted, not too sweet.", favourite: true },
      { name: "Almond croissant", category: "Bakery", price: "$4.80", description: "Twice-baked with frangipane.", favourite: false },
      { name: "Olive oil cake", category: "Bakery", price: "$4.50", description: "Lemon zest and a crackly top.", favourite: false },
      { name: "Eggs on toast", category: "Brunch", price: "$12.00", description: "Soft scrambled eggs, chives, our sourdough.", favourite: false },
      { name: "Seasonal bowl", category: "Brunch", price: "$14.00", description: "Grains, greens, roasted veg and a jammy egg.", favourite: false },
      { name: "Banana bread", category: "Brunch", price: "$6.00", description: "Toasted, with whipped honey butter.", favourite: false }
    ],
    "name"
  );
  const card: ComponentDef = createComponent(
    "Menu card",
    [
      b("heading", 0, 0, 8, 2, { text: "{{item.name}}", level: "3", size: "s" }),
      b("heading", 8, 0, 4, 2, { text: "{{item.price}}", level: "4", size: "s", align: "right", color: "var(--accent)" }),
      b("text", 0, 2, 12, 3, { text: "{{item.description}}", size: "s", color: "var(--muted)" })
    ],
    4,
    { padding: 22, radius: 18 }
  );
  const list = (x: number, y: number, h: number, filterField: string, filterValue: string, limit = 0): Block =>
    b("collection", x, y, 12, h, { collectionId: menu.id, componentId: card.id, columns: 3, gap: 18, filterField, filterValue, limit, empty: "Nothing here today." }, rise());

  const home = createPage("Home", "");
  const menuPage = createPage("Menu", "menu");
  const visit = createPage("Visit", "visit");
  home.seo.description = "A neighbourhood café on Alder Street: small-batch coffee, sourdough baked at dawn, and brunch every day.";

  home.sections = [
    sec(
      "Hero",
      [
        b("heading", 0, 1, 7, 9, { text: "Slow coffee,\nwarm bread.", level: "1", size: "display" }, rise()),
        b("text", 0, 12, 6, 4, { text: "A neighbourhood café on Alder Street. We roast small batches every Tuesday and bake from six every morning.", size: "l", color: "var(--muted)" }, rise(120)),
        b("button", 0, 17, 3, 3, { label: "See the menu", href: link(menuPage), size: "l" }, { ...rise(240), ...sound("click", "tap") }),
        b("button", 3, 17, 3, 3, { label: "Find us", href: link(visit), variant: "ghost", size: "l" }, rise(240)),
        b("flipbook", 7, 1, 5, 19, flip(steamingCupFrames(), links, 8, "loop", "A cup of coffee, steaming"), { animations: [anim("pop")] })
      ],
      { paddingY: 80, minRows: 20, background: "radial-gradient(ellipse at 80% 20%, color-mix(in srgb, var(--accent) 16%, var(--bg)), var(--bg) 62%)" }
    ),
    sec("Today", [b("marquee", 0, 0, 12, 3, { text: "Fresh sourdough daily ✦ Oat milk at no extra cost ✦ Beans roasted on Tuesdays ✦ Dogs welcome on the patio", separator: "✦", size: "l", speed: 32, fill: "var(--accent)", color: "var(--accent-text)" })], { paddingY: 0, minRows: 3, fullBleed: true }),
    sec(
      "What we care about",
      [
        b("heading", 0, 0, 8, 6, { text: "Three things we won't rush", size: "xl" }, rise()),
        ...[BEAN_BADGE, BREAD_BADGE, LEAF_BADGE].map((svg, i) => b("vector", i * 4, 8, 2, 4, art(svg, links), rise(i * 120))),
        ...[
          ["Roasted here", "Every Tuesday, in the back room. Small batches so nothing sits on a shelf."],
          ["Baked at dawn", "Our sourdough takes two days. The buns take one very early morning."],
          ["Grown well", "Beans from growers we know by name, milk from a farm twenty miles away."]
        ].map(([title, text], i) => b("card", i * 4, 13, 4, 8, { eyebrow: "", title, text, shadow: false, fill: "var(--surface)" }, { animations: [anim("fade-rise", { delay: i * 120 || undefined }), anim("hover-grow")] }))
      ],
      { minRows: 21 }
    ),
    sec(
      "Favourites",
      [
        b("heading", 0, 0, 7, 3, { text: "Regulars' favourites", size: "xl" }, rise()),
        b("button", 9, 1, 3, 2, { label: "Full menu →", href: link(menuPage), variant: "ghost", align: "right" }),
        list(0, 4, 8, "favourite", "true", 3)
      ],
      { minRows: 12, background: "var(--surface)" }
    ),
    sec(
      "Kind words",
      [
        b("testimonial", 0, 0, 6, 10, { quote: "The cardamom buns are the reason I get up on Saturdays. The flat white is the reason I stay.", name: "Maya O.", role: "Lives two doors down", rating: 5, style: "card" }, rise()),
        b("testimonial", 6, 0, 6, 10, { quote: "Quiet enough to work, friendly enough that you don't want to. Best sourdough on the east side.", name: "Dev P.", role: "Freelance designer", rating: 5, style: "card" }, rise(150))
      ],
      { minRows: 10 }
    ),
    sec(
      "Visit us",
      [
        b("heading", 0, 0, 7, 6, { text: "Open every day\nfrom 7am.", size: "xl", color: "var(--accent-text)" }, rise()),
        b("text", 0, 7, 6, 3, { text: "214 Alder Street. Take-away cups are compostable; bring your own for 30¢ off.", size: "l", color: "var(--accent-text)" }, rise(120)),
        b("button", 0, 11, 3, 3, { label: "Hours & directions", href: link(visit), variant: "light", size: "l" }, rise(240))
      ],
      { minRows: 14, paddingY: 72, background: "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, var(--text)))" }
    )
  ];

  menuPage.seo.description = "Coffee, bakery and brunch at Ember & Oak.";
  menuPage.sections = [
    sec("Menu", [b("heading", 0, 0, 8, 4, { text: "The menu", level: "1", size: "xl" }, rise()), b("text", 0, 4, 7, 3, { text: "Everything is made here or roasted here. Prices include tax; oat, soy and almond milk are always free.", size: "l", color: "var(--muted)" }, rise(120))], { minRows: 7, paddingY: 72 }),
    ...["Coffee", "Bakery", "Brunch"].map((category, i) =>
      sec(category, [b("heading", 0, 0, 6, 3, { text: category, size: "l" }, rise()), list(0, 4, category === "Brunch" ? 8 : 15, "category", category)], { minRows: 12, background: i % 2 ? "var(--surface)" : "" })
    )
  ];

  visit.seo.description = "Hours, address and how to reach Ember & Oak.";
  visit.sections = [
    sec(
      "Come say hi",
      [
        b("heading", 0, 0, 6, 4, { text: "Come say hi", level: "1", size: "xl" }, rise()),
        b("text", 0, 5, 5, 3, { text: "214 Alder Street, on the corner by the park. Bike racks out front, patio out back.", size: "l" }, rise(100)),
        b("heading", 0, 9, 5, 2, { text: "Hours", size: "s" }),
        b("list", 0, 11, 5, 5, { items: "Monday–Friday · 7am–4pm\nSaturday · 8am–5pm\nSunday · 8am–3pm", style: "ticks" }),
        b("map", 6, 0, 6, 16, { provider: "osm", query: "Alder Street, Portland, Oregon", zoom: 15, label: "Ember & Oak" })
      ],
      { minRows: 16, paddingY: 72 }
    ),
    sec(
      "Write to us",
      [
        b("heading", 0, 0, 5, 4, { text: "Catering, events, or just hello", size: "l" }),
        b("text", 0, 5, 5, 4, { text: "We do office breakfasts and small private events after hours. Tell us what you have in mind.", color: "var(--muted)" }),
        b("form", 6, 0, 6, 18, { service: "email", email: "hello@example.com", buttonLabel: "Send" })
      ],
      { minRows: 18, background: "var(--surface)" }
    )
  ];

  const s = site("Ember & Oak", theme, [home, menuPage, visit], { collections: [menu], components: [card] });
  setNavCta(s, "Order ahead", link(menuPage));
  return s;
}

export function createBarberSite(): Site {
  const theme: Theme = {
    background: "#111111",
    surface: "#1c1c1c",
    text: "#f3efe6",
    muted: "#a39d92",
    accent: "#e8b04b",
    accentText: "#111111",
    headingFont: "gf:Bebas Neue",
    bodyFont: "gf:Inter",
    radius: 6,
    maxWidth: 1200
  };
  const links = { "#e8b04b": "var(--accent)", "#f3efe6": "var(--text)", "#111111": "var(--bg)", "#1c1c1c": "var(--surface)" };
  const home = createPage("Home", "");
  const services = createPage("Services", "services");
  const book = createPage("Book", "book");
  home.seo.description = "Fade & Co.: classic cuts, skin fades and hot towel shaves. Walk-ins welcome.";

  home.sections = [
    sec(
      "Hero",
      [
        b("heading", 0, 1, 8, 10, { text: "Sharp cuts.\nNo rush.", level: "1", size: "display" }, rise()),
        b("text", 0, 12, 6, 4, { text: "Classic cuts, skin fades and hot towel shaves on Market Street since 2014. Book a chair or walk right in.", size: "l", color: "var(--muted)" }, rise(120)),
        b("button", 0, 17, 3, 3, { label: "Book a chair", href: link(book), size: "l" }, { ...rise(240), ...sound("click", "click", 50) }),
        b("button", 3, 17, 3, 3, { label: "Prices", href: link(services), variant: "outline", size: "l" }, rise(240)),
        b("flipbook", 9, 1, 3, 19, flip(barberPoleFrames(), links, 10, "loop", "A barber pole"))
      ],
      { paddingY: 72, minRows: 20 }
    ),
    sec("Walk-ins", [b("marquee", 0, 0, 12, 4, { text: "Walk-ins welcome ✦ Hot towel shaves ✦ Kids' cuts on Saturdays ✦ Beard trims", separator: "✦", size: "xl", speed: 26, tilt: -2, fill: "var(--accent)", color: "var(--accent-text)" })], { paddingY: 24, minRows: 4, fullBleed: true }),
    sec(
      "Services",
      [
        b("heading", 0, 0, 6, 4, { text: "What we do", size: "xl" }, rise()),
        b("vector", 9, 0, 3, 8, art(SCISSORS, links, "Scissors"), { animations: [anim("spin-scroll")] }),
        ...[
          ["$35", "The cut", "Scissors or clippers, finished with a hot towel and a straight-razor neckline."],
          ["$50", "Cut & beard", "The cut, plus a shaped beard and a hot oil finish."],
          ["$40", "Hot towel shave", "Three towels, a straight razor and twenty quiet minutes."]
        ].map(([eyebrow, title, text], i) =>
          b("card", i * 4, 9, 4, 9, { eyebrow, title, text, fill: "var(--surface)", shadow: false, href: link(services) }, { animations: [anim("fade-rise", { delay: i * 120 || undefined }), anim("hover-grow")], ...sound("hover", "tick", 35) })
        )
      ],
      { minRows: 18 }
    ),
    sec(
      "The chairs",
      [
        b("heading", 0, 0, 6, 4, { text: "The chairs", size: "xl" }, rise()),
        ...[
          ["MARCUS", "#8d5a3b", "#1b1b1b", "Fades and tapers. Owner since day one."],
          ["ANA", "#e0b38f", "#5a2d1a", "Scissor work, longer styles, beards."],
          ["JOON", "#f0c9a0", "#111111", "Classic cuts and the smoothest shave in town."]
        ].flatMap(([name, skin, hair, text], i) => [
          b("vector", i * 4 + 1, 5, 2, 5, art(portrait(name, skin, hair), links, name), rise(i * 120)),
          b("heading", i * 4, 11, 4, 2, { text: name, size: "m", align: "center" }),
          b("text", i * 4, 13, 4, 3, { text, align: "center", color: "var(--muted)" })
        ])
      ],
      { minRows: 16, background: "var(--surface)" }
    ),
    sec(
      "Book",
      [
        b("heading", 0, 0, 12, 4, { text: "Your chair is waiting.", size: "xl", align: "center" }, rise()),
        b("button", 4, 5, 4, 3, { label: "Book online", href: link(book), size: "l", align: "center" }, { ...rise(150), ...sound("click", "click", 50) })
      ],
      { minRows: 8, paddingY: 80 }
    )
  ];

  services.seo.description = "Prices for cuts, beards and shaves at Fade & Co.";
  services.sections = [
    sec("Prices", [b("heading", 0, 0, 8, 4, { text: "Prices", level: "1", size: "xl" }, rise()), b("text", 0, 4, 7, 3, { text: "Card or cash. Tips appreciated, never expected.", size: "l", color: "var(--muted)" })], { minRows: 7, paddingY: 72 }),
    sec(
      "Menu",
      [
        b("pricing", 0, 0, 4, 18, { plan: "The cut", price: "$35", period: "", description: "Scissors or clippers.", features: "Consultation\nHot towel finish\nStraight-razor neckline", buttonLabel: "Book", buttonHref: link(book), featured: false }, rise()),
        b("pricing", 4, 0, 4, 18, { plan: "Cut & beard", price: "$50", period: "", description: "Our most booked.", features: "Everything in the cut\nBeard shape-up\nHot oil finish", buttonLabel: "Book", buttonHref: link(book), featured: true, badge: "Most booked" }, rise(120)),
        b("pricing", 8, 0, 4, 18, { plan: "Hot towel shave", price: "$40", period: "", description: "Twenty quiet minutes.", features: "Three hot towels\nStraight razor\nCold towel & balm", buttonLabel: "Book", buttonHref: link(book), featured: false }, rise(240))
      ],
      { minRows: 18 }
    ),
    sec(
      "Questions",
      [
        b("heading", 0, 0, 4, 3, { text: "Good to know", size: "l" }),
        b("accordion", 4, 0, 8, 14, {
          items: [
            { question: "Do you take walk-ins?", answer: "Yes, whenever a chair is free. Booking guarantees your time." },
            { question: "How long does a cut take?", answer: "About 40 minutes, a little longer for a cut and beard." },
            { question: "Do you cut kids' hair?", answer: "Every Saturday morning, $25 for under-12s." },
            { question: "What if I'm running late?", answer: "Call us. More than 15 minutes late and we may need to rebook." }
          ],
          style: "lines"
        })
      ],
      { minRows: 14, background: "var(--surface)" }
    )
  ];

  book.seo.description = "Book a chair at Fade & Co., 88 Market Street.";
  book.sections = [
    sec(
      "Book",
      [
        b("heading", 0, 0, 6, 4, { text: "Book a chair", level: "1", size: "xl" }, rise()),
        b("text", 0, 5, 5, 4, { text: "Pick a barber and a time online; it takes under a minute. Or just walk in.", size: "l" }),
        b("button", 0, 10, 4, 3, { label: "Book online", href: "https://example.com/book", size: "l", newTab: true }, sound("click", "click", 50)),
        b("heading", 0, 14, 5, 2, { text: "Hours", size: "s" }),
        b("list", 0, 16, 5, 5, { items: "Tuesday–Friday · 10am–7pm\nSaturday · 9am–5pm\nSunday & Monday · Closed", style: "ticks" }),
        b("map", 6, 0, 6, 21, { provider: "osm", query: "Market Street, San Francisco", zoom: 15, label: "Fade & Co.", grayscale: true })
      ],
      { minRows: 21, paddingY: 72 }
    )
  ];

  const s = site("Fade & Co.", theme, [home, services, book]);
  setNavCta(s, "Book", link(book));
  return s;
}

export function createBandSite(): Site {
  const theme: Theme = {
    background: "#0d0b1a",
    surface: "#17142b",
    text: "#f1ecff",
    muted: "#a79fc9",
    accent: "#ff4fa3",
    accentText: "#0d0b1a",
    headingFont: "gf:Unbounded",
    bodyFont: "gf:Space Grotesk",
    radius: 14,
    maxWidth: 1200
  };
  const links = { "#ff4fa3": "var(--accent)", "#17142b": "var(--surface)", "#0d0b1a": "var(--bg)", "#f1ecff": "var(--text)" };
  const tour = collection(
    "Tour",
    [
      { key: "date", label: "Date", type: "date" },
      { key: "when", label: "Shown as", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "venue", label: "Venue", type: "text" },
      { key: "tickets", label: "Tickets", type: "link" }
    ],
    [
      { date: "2026-11-06", when: "Fri · Nov 6", city: "Seattle, WA", venue: "The Crocodile", tickets: "https://example.com/tickets/seattle" },
      { date: "2026-11-08", when: "Sun · Nov 8", city: "Portland, OR", venue: "Doug Fir Lounge", tickets: "https://example.com/tickets/portland" },
      { date: "2026-11-12", when: "Thu · Nov 12", city: "Oakland, CA", venue: "The New Parish", tickets: "https://example.com/tickets/oakland" },
      { date: "2026-11-14", when: "Sat · Nov 14", city: "Los Angeles, CA", venue: "The Echo", tickets: "https://example.com/tickets/la" },
      { date: "2026-11-19", when: "Thu · Nov 19", city: "Denver, CO", venue: "Larimer Lounge", tickets: "https://example.com/tickets/denver" },
      { date: "2026-11-22", when: "Sun · Nov 22", city: "Chicago, IL", venue: "Schubas", tickets: "https://example.com/tickets/chicago" }
    ],
    "city"
  );
  const card = createComponent(
    "Tour date",
    [
      b("heading", 0, 0, 12, 2, { text: "{{item.when}}", level: "4", size: "s", color: "var(--accent)" }),
      b("heading", 0, 2, 12, 2, { text: "{{item.city}}", level: "3", size: "m" }),
      b("text", 0, 4, 12, 2, { text: "{{item.venue}}", color: "var(--muted)" }),
      b("buy", 0, 6, 12, 2, { provider: "other", href: "{{item.tickets}}", label: "Tickets", variant: "outline", size: "s" })
    ],
    4,
    { padding: 22, radius: 14, fill: "var(--surface)", shadow: "none", borderWidth: 1, borderColor: "color-mix(in srgb, var(--accent) 35%, transparent)" }
  );
  const home = createPage("Home", "");
  const tourPage = createPage("Tour", "tour");
  const merch = createPage("Merch", "merch");
  home.seo.description = "Night Tides: dream-pop from the Pacific Northwest. New album Low Light out now; on tour this November.";

  const listen = b("button", 6, 23, 3, 3, { label: "▶ Listen", href: "https://example.com/listen", variant: "outline", size: "l", align: "center", newTab: true }, { ...rise(300), ...sound("hover", "blip", 40) });
  home.sections = [
    sec(
      "Hero",
      [
        b("sound-toggle", 10, 0, 2, 2, { on: "Sound on", off: "Sound off" }),
        b("heading", 0, 2, 12, 11, { text: "NIGHT\nTIDES", level: "1", size: "display", align: "center" }, { animations: [anim("blur-in")] }),
        b("flipbook", 2, 13, 8, 6, flip(equalizerFrames(), links, 8, "loop", ""), rise(150)),
        b("text", 2, 19, 8, 3, { text: "New album “Low Light” out now. On tour this November.", size: "l", align: "center", color: "var(--muted)" }, rise(200)),
        b("button", 3, 23, 3, 3, { label: "Tour dates", href: link(tourPage), size: "l", align: "center" }, { ...rise(300), ...sound("click", "pop", 50) }),
        listen
      ],
      { paddingY: 56, minRows: 26, background: "radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--accent) 28%, var(--bg)), var(--bg) 65%)" }
    ),
    sec(
      "Low Light",
      [
        b("vector", 0, 0, 5, 16, art(VINYL, links, "The Low Light record"), { animations: [anim("spin", { duration: 3600 })] }),
        b("heading", 6, 1, 6, 6, { text: "Low Light", size: "xl" }, rise()),
        b("text", 6, 7, 6, 5, { text: "Ten songs written after dark, recorded live to tape in a converted boathouse. Our slowest, loudest record yet.", size: "l", color: "var(--muted)" }, rise(120)),
        b("list", 6, 12, 6, 4, { items: "Vinyl, cassette and everywhere you stream\nRecorded live to tape", style: "ticks" }, rise(200))
      ],
      { minRows: 16 }
    ),
    sec(
      "On tour",
      [
        b("heading", 0, 0, 6, 3, { text: "On tour", size: "xl" }, rise()),
        b("button", 9, 1, 3, 2, { label: "All dates →", href: link(tourPage), variant: "ghost", align: "right" }),
        b("collection", 0, 4, 12, 11, { collectionId: tour.id, componentId: card.id, columns: 3, gap: 18, sort: "date", limit: 3 }, rise())
      ],
      { minRows: 15, background: "var(--surface)" }
    ),
    sec(
      "Join",
      [
        b("heading", 0, 0, 6, 6, { text: "Hear it first.", size: "xl" }, rise()),
        b("text", 0, 6, 5, 4, { text: "One email when there's new music or new shows. That's it.", size: "l", color: "var(--muted)" }),
        b("form", 6, 0, 6, 14, { service: "email", email: "band@example.com", fields: [{ label: "Email", type: "email", required: true, placeholder: "you@example.com" }], buttonLabel: "Join the list" })
      ],
      { minRows: 14 }
    )
  ];
  home.sections[1].blocks[0].animations!.push(anim("hover-grow", { source: listen.id, name: "Swell on Listen" }));

  tourPage.seo.description = "Night Tides tour dates and tickets.";
  tourPage.sections = [
    sec("Tour", [b("heading", 0, 0, 8, 4, { text: "Tour 2026", level: "1", size: "xl" }, rise()), b("text", 0, 4, 7, 3, { text: "All ages unless the venue says otherwise. Doors 7pm.", size: "l", color: "var(--muted)" })], { minRows: 7, paddingY: 72 }),
    sec("Dates", [b("collection", 0, 0, 12, 22, { collectionId: tour.id, componentId: card.id, columns: 3, gap: 18, sort: "date" }, rise())], { minRows: 22 })
  ];

  merch.seo.description = "Night Tides records, shirts and prints.";
  merch.sections = [
    sec("Merch", [b("heading", 0, 0, 8, 4, { text: "Merch", level: "1", size: "xl" }, rise()), b("text", 0, 4, 7, 3, { text: "Printed in small runs by friends. Ships in a week.", size: "l", color: "var(--muted)" }), b("cart", 10, 1, 2, 2, { label: "Cart" })], { minRows: 7, paddingY: 72 }),
    sec(
      "Products",
      [
        ...[
          [TEE, "Tide tee", "28.00", "tee"],
          [TOTE, "Wave tote", "18.00", "tote"],
          [POSTER, "Low Light print", "22.00", "poster"]
        ].flatMap(([svg, name, price, id], i) => [
          b("vector", i * 4, 0, 4, 10, art(svg, links, name), { animations: [anim("fade-rise", { delay: i * 120 || undefined }), anim("hover-wiggle")] }),
          b("heading", i * 4, 11, 4, 2, { text: name, size: "m", align: "center" }),
          b("buy", i * 4, 13, 4, 3, { provider: "snipcart", name, price, itemId: id, label: `Add to cart · $${price.replace(".00", "")}`, align: "center" }, sound("click", "coin", 40))
        ])
      ],
      { minRows: 16 }
    )
  ];

  const s = site("Night Tides", theme, [home, tourPage, merch], { collections: [tour], components: [card] });
  setNavCta(s, "Tickets", link(tourPage));
  return s;
}

export function createStudioSite(): Site {
  const theme: Theme = {
    background: "#fbfaf7",
    surface: "#ffffff",
    text: "#15171a",
    muted: "#5d646e",
    accent: "#2a64f5",
    accentText: "#ffffff",
    headingFont: "gf:Bricolage Grotesque",
    bodyFont: "gf:Inter",
    radius: 16,
    maxWidth: 1200
  };
  const links = { "#2f6bff": "var(--accent)", "#15171a": "var(--text)" };
  const home = createPage("Home", "");
  const work = createPage("Work", "work");
  const pricing = createPage("Pricing", "pricing");
  const contact = createPage("Contact", "contact");
  home.seo.description = "Northbeam Studio designs and builds websites for small businesses that you own outright: no monthly fees, no lock-in.";

  home.sections = [
    sec(
      "Hero",
      [
        b("heading", 0, 1, 7, 7, { text: "Websites you own.\nNo monthly fees.", level: "1", size: "xl" }, rise()),
        b("text", 0, 9, 6, 5, { text: "I design and build fast, good-looking sites for small businesses, then hand you the keys. Host it anywhere, change it any time, never pay rent on your own website.", size: "l", color: "var(--muted)" }, rise(120)),
        b("button", 0, 15, 3, 3, { label: "See packages", href: link(pricing), size: "l" }, rise(240)),
        b("button", 3, 15, 3, 3, { label: "Recent work", href: link(work), variant: "ghost", size: "l" }, rise(240)),
        b("vector", 7, 1, 5, 17, art(BROWSER, links, "A website in a browser window"), { animations: [anim("circle-reveal"), anim("float", { duration: 3200 })] })
      ],
      { paddingY: 72, minRows: 18 }
    ),
    sec("For", [b("marquee", 0, 0, 12, 3, { text: "Cafés ✦ Barbers ✦ Bands ✦ Studios ✦ Makers ✦ Clinics ✦ Nonprofits ✦ Shops", separator: "✦", size: "l", speed: 36, fill: "var(--text)", color: "var(--bg)" })], { paddingY: 0, minRows: 3, fullBleed: true }),
    sec(
      "How it works",
      [
        b("heading", 0, 0, 8, 3, { text: "How it works", size: "xl" }, rise()),
        ...[
          ["01", "Talk", "A free 30-minute call about your business, your customers and what the site needs to do."],
          ["02", "Design", "You see real pages, not mood boards. Two rounds of changes are included."],
          ["03", "Build", "Fast, accessible, readable on every phone, with the animations and details that make it yours."],
          ["04", "Hand over", "You get the files and a short video on editing it. Host it free or cheaply, anywhere."]
        ].map(([eyebrow, title, text], i) => b("card", i * 3, 4, 3, 10, { eyebrow, title, text, shadow: false }, rise(i * 120)))
      ],
      { minRows: 14 }
    ),
    sec(
      "Why own it",
      [
        b("heading", 0, 0, 6, 6, { text: "Why owning your site matters", size: "xl" }, rise()),
        b("list", 6, 0, 6, 9, { items: "No subscription: pay once, not every month forever\nNo lock-in: it's plain HTML you can take anywhere\nNo platform branding or watermarks\nFast pages, which Google and your customers both notice", style: "ticks", size: "l" }, rise(150))
      ],
      { minRows: 10, background: "var(--surface)" }
    ),
    sec(
      "Start",
      [
        b("heading", 0, 0, 12, 4, { text: "Let's build yours.", size: "xl", align: "center", color: "var(--accent-text)" }, rise()),
        b("text", 2, 5, 8, 3, { text: "Tell me about your business. I reply within a day.", size: "l", align: "center", color: "var(--accent-text)" }),
        b("button", 4, 9, 4, 3, { label: "Start a project", href: link(contact), variant: "light", size: "l", align: "center" }, sound("click", "success", 40))
      ],
      { minRows: 12, paddingY: 80, background: "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #7c5cff))" }
    )
  ];

  work.seo.description = "Recent websites by Northbeam Studio.";
  work.shell = cardLayouts ? { type: "cardGrid", dots: true, cardStyle: "clean" } : { type: "slides", dots: true };
  const project = (title: string, subtitle: string, svg: string, text: string, background: string, dark = false): Section => {
    const s = sec(
      title,
      [
        b("heading", 0, 0, 7, 4, { text: title, size: "xl", color: dark ? "#ffffff" : "" }),
        b("text", 0, 5, 6, 6, { text, size: "l", color: dark ? "#d9d4ea" : "var(--muted)" }),
        b("vector", 7, 0, 5, 14, art(svg, {}, title), rise())
      ],
      { minRows: 14, paddingY: 64, background }
    );
    s.card = { title, subtitle, image: svgImage(svg) };
    return s;
  };
  work.sections = [
    project("Ember & Oak", "Café · menu from a spreadsheet", steamingCupFrames()[0], "A warm, slow site for a neighbourhood café. The menu lives in a spreadsheet the owners already use, so prices change without calling me.", "#f7f1e8"),
    project("Fade & Co.", "Barber · online booking", barberPoleFrames()[0], "Dark, loud and quick to book from. The barber pole animates frame by frame; every card leads to the booking page.", "#1c1c1c", true),
    project("Night Tides", "Band · tour dates & merch", VINYL, "Tour dates that update themselves, a record that spins, and a merch store without a monthly platform fee.", "#17142b", true)
  ];

  pricing.seo.description = "Website packages from Northbeam Studio: one price, no monthly fees.";
  pricing.sections = [
    sec("Pricing", [b("heading", 0, 0, 8, 4, { text: "One price. Yours to keep.", level: "1", size: "xl" }, rise()), b("text", 0, 5, 7, 3, { text: "Every package includes design, build, launch and a handover call. Hosting is up to you and often free.", size: "l", color: "var(--muted)" })], { minRows: 8, paddingY: 72 }),
    sec(
      "Packages",
      [
        b("pricing", 0, 0, 4, 19, { plan: "Starter", price: "$900", period: " one-time", description: "A sharp one-to-three page site.", features: "Up to 3 pages\nContact form\nMobile-ready and fast\nLaunched on your domain", buttonLabel: "Start", buttonHref: link(contact), featured: false }, rise()),
        b("pricing", 4, 0, 4, 19, { plan: "Business", price: "$1,800", period: " one-time", description: "For businesses that want to stand out.", features: "Up to 8 pages\nCustom animation and illustration\nMenu, services or events from a spreadsheet\nBooking or newsletter sign-up", buttonLabel: "Start", buttonHref: link(contact), featured: true, badge: "Most chosen" }, rise(120)),
        b("pricing", 8, 0, 4, 19, { plan: "Shop", price: "From $2,800", period: "", description: "Sell online without a monthly platform fee.", features: "Everything in Business\nProducts and checkout (Stripe, Snipcart…)\nOrder emails and receipts\nTraining on adding products", buttonLabel: "Talk to me", buttonHref: link(contact), featured: false }, rise(240))
      ],
      { minRows: 19 }
    ),
    sec(
      "Care",
      [
        b("heading", 0, 0, 6, 3, { text: "Optional care plan", size: "l" }),
        b("text", 0, 4, 6, 6, { text: "$40 a month for small updates, checks and backups. Cancel any time; the site stays yours either way.", size: "l", color: "var(--muted)" }),
        b("accordion", 7, 0, 5, 14, {
          items: [
            { question: "Do I have to pay monthly?", answer: "No. The care plan is optional. Most clients edit small things themselves." },
            { question: "Who owns the site?", answer: "You do: the design, the files and the domain." },
            { question: "Where is it hosted?", answer: "Wherever you like. Netlify, Cloudflare Pages and GitHub Pages are free for most small sites." },
            { question: "Can I change it later?", answer: "Yes. You get the project file and a walkthrough of editing it." }
          ]
        })
      ],
      { minRows: 14, background: "var(--surface)" }
    )
  ];

  contact.seo.description = "Start a website project with Northbeam Studio.";
  contact.sections = [
    sec(
      "Contact",
      [
        b("heading", 0, 0, 6, 6, { text: "Tell me about\nyour business.", level: "1", size: "xl" }, rise()),
        b("text", 0, 7, 5, 5, { text: "What you do, who your customers are, and what's not working with your current site (if you have one). I reply within a day.", size: "l", color: "var(--muted)" }),
        b("form", 6, 0, 6, 23, { service: "email", email: "hello@example.com", fields: [{ label: "Name", type: "text", required: true, placeholder: "" }, { label: "Email", type: "email", required: true, placeholder: "you@example.com" }, { label: "Business", type: "text", required: false, placeholder: "" }, { label: "What do you need?", type: "textarea", required: true, placeholder: "" }], buttonLabel: "Send" })
      ],
      { minRows: 23, paddingY: 72 }
    )
  ];

  const s = site("Northbeam Studio", theme, [home, work, pricing, contact]);
  setNavCta(s, "Start a project", link(contact));
  return s;
}

export const DOWNLOAD_URL = "https://github.com/FayteStudios/Fayteworks/releases/latest";

export function createPromoSite(): Site {
  const theme: Theme = {
    background: "#0e1016",
    surface: "#171a23",
    text: "#eef1f7",
    muted: "#9aa3b5",
    accent: "#6d4df2",
    accentText: "#ffffff",
    headingFont: "gf:Space Grotesk",
    bodyFont: "gf:Inter",
    radius: 16,
    maxWidth: 1200
  };
  const links = { "#7c5cff": "var(--accent)" };
  const home = createPage("Home", "");
  const features = createPage("Features", "features");
  const pricing = createPage("Pricing", "pricing");
  home.seo.description = "FayteWorks: a visual website builder on your computer. Design, animate, sell and publish, then keep plain HTML you own. No subscription.";

  const hoverMe = b("button", 8, 20, 4, 3, { label: "Hover me", variant: "outline", align: "center" });
  const moves = {
    heading: b("heading", 0, 0, 7, 4, { text: "It moves.", size: "xl" }, rise()),
    intro: b("text", 0, 4, 7, 3, { text: "Everything below was made in the editor, no code. Scroll, hover, click.", size: "l", color: "var(--muted)" }),
    ball: b("flipbook", 0, 8, 4, 10, flip(bounceFrames(), links, 12, "loop", "A bouncing ball"), {}),
    ballLabel: b("text", 0, 18, 4, 2, { text: "A flipbook, drawn frame by frame", align: "center", color: "var(--muted)" }),
    star: b("vector", 4, 8, 4, 10, art(SPARKLE, links, "A sparkle"), { animations: [anim("spin-scroll")] }),
    starLabel: b("text", 4, 18, 4, 2, { text: "Turns as you scroll", align: "center", color: "var(--muted)" }),
    cutout: b("box", 8, 8, 4, 10, { fill: "linear-gradient(135deg, var(--accent), #2f9bff)" }, { animations: [anim("hover-cutout", { source: hoverMe.id, mask: { shape: "circle", x: 50, y: 50 } })] }),
    click: b("button", 4, 20, 4, 3, { label: "Click for a sound", variant: "outline", align: "center" }, sound("click", "chime", 50)),
    mute: b("sound-toggle", 0, 20, 4, 3, { align: "center" })
  };
  const movesSection = sec("It moves", [...Object.values(moves), hoverMe], { minRows: 23, background: "var(--surface)" });
  phoneOrder(movesSection, [moves.heading, moves.intro, moves.ball, moves.ballLabel, moves.star, moves.starLabel, moves.cutout, hoverMe, moves.click, moves.mute]);
  home.sections = [
    sec(
      "Hero",
      [
        b("heading", 0, 1, 6, 7, { text: "Your site.\nPeriod.", level: "1", size: "xl" }, rise()),
        b("text", 0, 9, 6, 5, { text: "A visual website builder that lives on your computer. Design, animate, add a shop or a newsletter, then export plain HTML that's yours forever. No subscription.", size: "l", color: "var(--muted)" }, rise(120)),
        b("button", 0, 15, 4, 3, { label: "Download for Windows", href: DOWNLOAD_URL, size: "l", newTab: true }, { ...rise(240), ...sound("click", "success", 40) }),
        b("button", 4, 15, 3, 3, { label: "What it does", href: link(features), variant: "ghost", size: "l" }, rise(240)),
        b("vector", 6, 1, 6, 17, art(EDITOR, links, "The FayteWorks editor"), { animations: [anim("pop"), anim("float", { duration: 3600 })] })
      ],
      { paddingY: 72, minRows: 18, background: "radial-gradient(ellipse at 75% 10%, color-mix(in srgb, var(--accent) 30%, var(--bg)), var(--bg) 60%)" }
    ),
    sec("Promises", [b("marquee", 0, 0, 12, 3, { text: "No subscription ✦ Export plain HTML ✦ Works offline ✦ Your hosting, your files ✦ No watermark", separator: "✦", size: "l", speed: 34, fill: "var(--accent)", color: "var(--accent-text)" })], { paddingY: 0, minRows: 3, fullBleed: true }),
    sec(
      "All in one place",
      [
        b("heading", 0, 0, 8, 6, { text: "One app instead of twenty tabs", size: "xl" }, rise()),
        b("text", 0, 6, 7, 3, { text: "Everything a small site needs, in one place, with nothing to rent.", size: "l", color: "var(--muted)" }, rise(100)),
        ...[
          ["Design", "Layout that snaps", "Drag blocks onto a grid; tune them for desktop, tablet and phone. Page layouts like slides and side-scrolling galleries."],
          ["Motion", "Animate anything", "A timeline with keyframes and springs, scroll and hover effects, frame-by-frame flipbooks and sounds."],
          ["Draw", "Vectors built in", "A real vector editor with image tracing, or round trips with Inkscape and Illustrator."],
          ["Data", "Content from anywhere", "Menus, events and posts from Google Sheets, Airtable, Notion, GitHub or a CSV."],
          ["Sell", "Take payments", "Stripe, Lemon Squeezy, Gumroad, PayPal or a Snipcart cart. Newsletters and sign-in too."],
          ["Publish", "Put it anywhere", "Netlify, GitHub Pages, Cloudflare or a zip. Send sections to Shopify and WordPress."]
        ].map(([eyebrow, title, text], i) => b("card", (i % 3) * 4, 10 + Math.floor(i / 3) * 10, 4, 9, { eyebrow, title, text, fill: "var(--surface)", shadow: false }, { animations: [anim("fade-rise", { delay: (i % 3) * 120 || undefined }), anim("hover-grow")] }))
      ],
      { minRows: 29 }
    ),
    movesSection,
    sec(
      "Yours",
      [
        b("heading", 0, 0, 6, 6, { text: "What you make is yours.", size: "xl" }, rise()),
        b("list", 6, 0, 6, 9, { items: "No credit or watermark on your sites\nPlain HTML and CSS you can host anywhere\nYour projects are folders on your computer\nKeys and passwords stay encrypted on your machine", style: "ticks", size: "l" }, rise(150))
      ],
      { minRows: 10 }
    ),
    sec(
      "Download",
      [
        b("heading", 0, 0, 12, 4, { text: "Start building today.", size: "xl", align: "center" }, rise()),
        b("text", 2, 5, 8, 3, { text: "Free while in early access. Windows now; more platforms later.", size: "l", align: "center", color: "var(--muted)" }),
        b("button", 4, 9, 4, 3, { label: "Download for Windows", href: DOWNLOAD_URL, size: "l", align: "center", newTab: true }, sound("click", "success", 40))
      ],
      { minRows: 12, paddingY: 88, background: "radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--accent) 30%, var(--bg)), var(--bg) 70%)" }
    )
  ];

  features.seo.description = "Everything FayteWorks does: design, animation, vectors, data, payments and publishing.";
  const feature = (title: string, text: string, items: string, background = ""): Section =>
    sec(title, [b("heading", 0, 0, 5, 6, { text: title, size: "xl" }, rise()), b("text", 0, 6, 5, 6, { text, size: "l", color: "var(--muted)" }), b("list", 6, 0, 6, 12, { items, style: "ticks" }, rise(150))], { minRows: 12, background });
  features.sections = [
    sec("Features", [b("heading", 0, 0, 8, 4, { text: "What it does", level: "1", size: "xl" }, rise()), b("text", 0, 5, 7, 3, { text: "Built for people who make websites for themselves or for clients, and want to own the result.", size: "l", color: "var(--muted)" })], { minRows: 8, paddingY: 72 }),
    feature("Design", "A grid that snaps, blocks that do real work, and page layouts you won't find in other builders.", "Headings, text, images, galleries, carousels, tabs, forms, maps, pricing\nDesktop, tablet and phone layouts, each adjustable\nFull-screen slides and horizontal galleries\nComponents you design once and reuse\nA catalogue of free, openly licensed components"),
    feature("Motion and sound", "Make custom animations without code, the way animation apps work.", "Timeline with keyframes and easing curves, springs and bounces\nPlay on load, into view, scroll, hover or click, even of another block\nCutouts that grow and shrink, blur, turn, move\nFrame-by-frame flipbooks with onion skin\nSounds on click and hover, with a visitor mute switch", "var(--surface)"),
    feature("Drawings and media", "Vectors, video and audio without a separate subscription.", "A vector editor with pen, shapes, text and image tracing\nRound trips with Inkscape, Illustrator, DaVinci Resolve, Audacity\nTrim, crop and convert video and audio in the app\nPrint and social designs, exported as PDF or images"),
    feature("Data and selling", "Connect the services people already use; no platform fees in between.", "Collections from Google Sheets, Airtable, Notion, Supabase, GitHub or CSV\nA page per item: products, posts, events\nStripe, Lemon Squeezy, Gumroad, PayPal and Snipcart\nNewsletters, sign-in and statistics", "var(--surface)"),
    feature("Publishing", "Export plain files or publish in a click. Keys stay encrypted on your computer.", "Netlify, GitHub Pages and Cloudflare Pages\nA zip or folder for any host\nSend sections to Shopify themes and WordPress\nEmbed pieces anywhere as HTML or a Web Component")
  ];

  pricing.seo.description = "FayteWorks pricing: free while in early access.";
  pricing.sections = [
    sec("Pricing", [b("heading", 0, 0, 8, 4, { text: "No subscription. Ever.", level: "1", size: "xl" }, rise()), b("text", 0, 5, 7, 3, { text: "Pay once for the app, if at all. What you make is yours either way.", size: "l", color: "var(--muted)" })], { minRows: 8, paddingY: 72 }),
    sec(
      "Plans",
      [
        b("pricing", 2, 0, 4, 18, { plan: "Early access", price: "Free", period: "", description: "Everything, while it's being finished.", features: "Every feature\nAutomatic updates\nExport and publish anywhere", buttonLabel: "Download", buttonHref: DOWNLOAD_URL, featured: true, badge: "Now" }, rise()),
        b("pricing", 6, 0, 4, 18, { plan: "Founder licence", price: "Coming soon", period: "", description: "A one-time licence for early supporters.", features: "Pay once, keep it\nA year of updates included\nHelp shape what comes next", buttonLabel: "Get notified", buttonHref: "mailto:hello@example.com?subject=Founder%20licence", featured: false }, rise(120))
      ],
      { minRows: 18 }
    ),
    sec(
      "Questions",
      [
        b("heading", 0, 0, 4, 3, { text: "Questions", size: "l" }),
        b("accordion", 4, 0, 8, 14, {
          items: [
            { question: "Do I need to know how to code?", answer: "No. Everything is visual. If you do code, you can add your own HTML, CSS and Tailwind anywhere." },
            { question: "Who owns what I make?", answer: "You do. There's no credit, badge or watermark on your sites." },
            { question: "Does it work on Mac?", answer: "Windows first. The web version runs in any modern browser in the meantime." },
            { question: "Where are my sites hosted?", answer: "Wherever you like. It publishes to Netlify, GitHub Pages and Cloudflare, or exports a folder for any host." }
          ]
        })
      ],
      { minRows: 14, background: "var(--surface)" }
    )
  ];

  const s = site("FayteWorks.", theme, [home, features, pricing]);
  setNavCta(s, "Download", DOWNLOAD_URL);
  return s;
}

export const DEMO_SITES: { id: string; label: string; description: string; build: () => Site }[] = [
  { id: "cafe", label: "Café · Ember & Oak", description: "Warm and slow: menu from a collection, hours, map, a steaming-cup flipbook.", build: createCafeSite },
  { id: "barber", label: "Barber · Fade & Co.", description: "Dark and bold: prices, booking, a barber-pole flipbook, scroll and hover motion.", build: createBarberSite },
  { id: "band", label: "Band · Night Tides", description: "Neon night: tour dates, merch cart, a spinning record, sounds.", build: createBandSite },
  { id: "studio", label: "Web studio · Northbeam", description: "Sell your own web design: packages, process, work, contact.", build: createStudioSite },
  { id: "promo", label: "FayteWorks website", description: "The app's own site, made with it: features, live motion demos, pricing.", build: createPromoSite }
];
