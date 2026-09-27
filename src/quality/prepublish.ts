import { allThemes } from "../model/styles";
import { BLUESKY_POST, GISCUS_ID, GISCUS_REPO, MASTODON_POST } from "../blocks/blog";
import { strongPassword } from "../export/protect";
import { isExampleLink } from "../social/platforms";
import { BOOKING, COMMUNITY } from "../blocks/contact";
import { checkoutProblem } from "../blocks/services";
import { pageSectionsWithShared, type SectionRole } from "../model/ops";
import { resolveColor } from "../model/theme";
import { PAGE_LINK_PREFIX, type Block, type Page, type Section, type Site } from "../model/types";
import { SNIPCART_KEY, MEMBERSTACK_APP } from "../services/siteServices";

export type IssueCategory = "Accessibility" | "Links" | "Search engines" | "Speed" | "Setup";

export interface PublishIssue {
  key: string;
  category: IssueCategory;
  severity: "fix" | "consider";
  message: string;
  how: string;
  where?: { pageId: string; sectionId: string; blockId?: string; label: string };
  fix?: { kind: "alt"; blockId: string; sectionId: string; pageId: string } | { kind: "guide"; guide: string } | { kind: "description"; pageId: string };
}

function parseColour(value: string): [number, number, number] | null {
  const v = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number];
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16)) as [number, number, number];
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  if (v === "white") return [255, 255, 255];
  if (v === "black") return [0, 0, 0];
  return null;
}

function luminance([r, g, b]: [number, number, number]): number {
  const c = [r, g, b].map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string): number | null {
  const ca = parseColour(a);
  const cb = parseColour(b);
  if (!ca || !cb) return null;
  const [l1, l2] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

interface Spot {
  page: Page;
  section: Section;
  block: Block;
  role: SectionRole;
}

const label = (b: Block) => {
  const text = String(b.props.text ?? b.props.label ?? b.props.title ?? b.props.heading ?? b.name ?? "").replace(/\s+/g, " ").trim();
  const kind = b.type.charAt(0).toUpperCase() + b.type.slice(1);
  return text ? `${kind} “${text.length > 32 ? `${text.slice(0, 32)}…` : text}”` : kind;
};

function spots(site: Site): Spot[] {
  const seenShared = new Set<string>();
  const out: Spot[] = [];
  for (const page of site.pages.filter((p) => !p.design)) {
    for (const { section, role } of pageSectionsWithShared(site, page)) {
      if (role !== "page") {
        if (seenShared.has(section.id)) continue;
        seenShared.add(section.id);
      }
      for (const block of section.blocks) if (!block.hidden) out.push({ page, section, block, role });
    }
  }
  return out;
}

const where = (s: Spot) => ({ pageId: s.page.id, sectionId: s.section.id, blockId: s.block.id, label: `${s.role === "page" ? s.page.title : s.role === "header" ? "Header" : "Footer"} › ${label(s.block)}` });

export function checkSite(site: Site, sizes: Map<string, number> = new Map()): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const add = (issue: PublishIssue) => issues.push(issue);
  const theme = site.theme;
  const colour = (v: string) => resolveColor(v, theme);
  const pageIds = new Set(site.pages.map((p) => p.id));
  const all = spots(site);
  const animationSources = new Set(all.flatMap((s) => (s.block.animations ?? []).map((a) => a.source).filter(Boolean)));

  for (const s of all) {
    const p = s.block.props;
    if (s.block.type === "image" && p.src && !String(p.alt ?? "").trim() && !p.decorative && !String(p.src).includes("{{")) {
      add({ key: `alt:${s.block.id}`, category: "Accessibility", severity: "fix", message: "A picture has no description.", how: "Describe it in a few words (screen readers read it aloud, and search engines use it), or mark it as decoration.", where: where(s), fix: { kind: "alt", blockId: s.block.id, sectionId: s.section.id, pageId: s.page.id } });
    }
    if (s.block.type === "gallery" && Array.isArray(p.images)) {
      const missing = p.images.filter((i) => i.image && !String(i.alt ?? "").trim()).length;
      if (missing) add({ key: `galt:${s.block.id}`, category: "Accessibility", severity: "fix", message: `${missing} picture${missing === 1 ? "" : "s"} in a gallery ${missing === 1 ? "has" : "have"} no description.`, how: "Select the gallery and fill in each picture's alt text.", where: where(s) });
    }
    if (s.block.type === "card" && p.image && !String(p.alt ?? "").trim()) {
      add({ key: `calt:${s.block.id}`, category: "Accessibility", severity: "consider", message: "A card's picture has no description.", how: "Fill in the card's alt text, unless the picture is only decoration.", where: where(s) });
    }
    const textColour = ["heading", "text", "list"].includes(s.block.type) ? String(p.color || "var(--text)") : "";
    if (textColour) {
      const bg = s.section.settings.backgroundImage ? "" : s.section.settings.background || "var(--bg)";
      const ratio = bg ? contrast(colour(textColour), colour(bg)) : null;
      const large = s.block.type === "heading" && ["l", "xl", "display"].includes(String(p.size ?? "l"));
      if (ratio !== null && ratio < (large ? 3 : 4.5)) {
        add({ key: `contrast:${s.block.id}`, category: "Accessibility", severity: ratio < 3 ? "fix" : "consider", message: `Text is hard to read against its background (contrast ${ratio.toFixed(1)}:1; aim for ${large ? "3" : "4.5"}:1).`, how: "Pick a darker or lighter text colour, or change the section's background.", where: where(s) });
      }
    }
  }
  const themePairs: [string, string, string, number][] = [
    ["Body text on the background", theme.text, theme.background, 4.5],
    ["Muted text on the background", theme.muted, theme.background, 4.5],
    ["Button text on the accent colour", theme.accentText, theme.accent, 4.5],
    ["Text on cards (surface)", theme.text, theme.surface, 4.5]
  ];
  for (const [name, fg, bg, min] of themePairs) {
    const ratio = contrast(fg, bg);
    if (ratio !== null && ratio < min) add({ key: `theme:${name}`, category: "Accessibility", severity: ratio < 3 ? "fix" : "consider", message: `${name} is hard to read (contrast ${ratio.toFixed(1)}:1; aim for ${min}:1).`, how: "Adjust the theme colours (click empty canvas → Theme)." });
  }
  for (const page of site.pages.filter((p) => !p.design)) {
    const h1s = page.sections.flatMap((s) => s.blocks).filter((b) => b.type === "heading" && String(b.props.level) === "1" && !b.hidden).length;
    const first = page.sections[0];
    const at = first ? { pageId: page.id, sectionId: first.id, label: page.title } : undefined;
    if (h1s === 0) add({ key: `h1:${page.id}`, category: "Accessibility", severity: "consider", message: `“${page.title}” has no main heading (level 1).`, how: "Set the page's main heading to level 1: it tells screen readers and search engines what the page is about.", where: at });
    if (h1s > 1) add({ key: `h1s:${page.id}`, category: "Accessibility", severity: "consider", message: `“${page.title}” has ${h1s} main headings (level 1).`, how: "Keep one level 1 heading per page and make the others level 2.", where: at });
  }

  const linkProps: [string, string][] = [
    ["button", "href"],
    ["card", "href"],
    ["pricing", "buttonHref"],
    ["nav", "ctaHref"]
  ];
  for (const s of all) {
    for (const [type, key] of linkProps) {
      if (s.block.type !== type) continue;
      const href = String(s.block.props[key] ?? "").trim();
      const interactive = animationSources.has(s.block.id) || (s.block.sounds?.length ?? 0) > 0;
      const needsLink = (type === "button" && !interactive) || (type === "nav" && s.block.props.ctaLabel) || (type === "pricing" && s.block.props.buttonLabel);
      if (needsLink && (!href || href === "#")) add({ key: `nolink:${s.block.id}`, category: "Links", severity: "fix", message: "A button doesn't go anywhere.", how: "Select it and choose a page or paste a web address.", where: where(s) });
      else if (href.startsWith(PAGE_LINK_PREFIX) && !pageIds.has(href.slice(PAGE_LINK_PREFIX.length))) add({ key: `dead:${s.block.id}`, category: "Links", severity: "fix", message: "A link points to a page that was deleted.", how: "Select it and choose another page.", where: where(s) });
      else if (/^http:\/\//i.test(href)) add({ key: `http:${s.block.id}`, category: "Links", severity: "consider", message: `A link uses http:// (not secure): ${href}`, how: "Use the https:// address if the site has one; browsers warn visitors about insecure pages.", where: where(s) });
    }
    const examples = [
      ...(s.block.type === "social-links" && Array.isArray(s.block.props.links) ? s.block.props.links.map((l) => String(l.url ?? "")) : []),
      ...(["support", "stream", "social-post", "qr"].includes(s.block.type) ? [String(s.block.props.account ?? s.block.props.channel ?? s.block.props.url ?? "")] : [])
    ].filter((u) => u && isExampleLink(u));
    if (examples.length) add({ key: `example:${s.block.id}`, category: "Links", severity: "fix", message: `Example links are still in place: ${examples.join(", ")}`, how: "Select the block and put in your own profiles, or remove the ones you don't use.", where: where(s) });
    for (const value of Object.values(s.block.props)) {
      if (typeof value !== "string" || !value.includes(`](${PAGE_LINK_PREFIX}`)) continue;
      for (const m of value.matchAll(/\]\(page:([\w-]+)\)/g)) {
        if (!pageIds.has(m[1])) add({ key: `deadtext:${s.block.id}:${m[1]}`, category: "Links", severity: "fix", message: "Text links to a page that was deleted.", how: "Edit the text and link to another page.", where: where(s) });
      }
    }
  }

  if (!site.settings.baseUrl.trim()) add({ key: "baseurl", category: "Search engines", severity: "consider", message: "The site's address isn't set.", how: "Without it there's no sitemap, share previews use relative links, and RSS feeds can't be made.", fix: { kind: "guide", guide: "site-address" } });
  if (!site.settings.favicon) add({ key: "favicon", category: "Search engines", severity: "consider", message: "No favicon (the little icon in browser tabs and search results).", how: "Click empty canvas → Site settings → Favicon." });
  const webPages = site.pages.filter((p) => !p.design);
  for (const page of webPages) {
    const at = page.sections[0] ? { pageId: page.id, sectionId: page.sections[0].id, label: page.title } : undefined;
    if (!page.seo.description.trim()) add({ key: `desc:${page.id}`, category: "Search engines", severity: "consider", message: `“${page.title}” has no search description.`, how: "One or two sentences shown under the page's title in search results.", where: at, fix: { kind: "description", pageId: page.id } });
  }
  const titles = new Map<string, number>();
  for (const page of webPages) if (!page.collectionId) titles.set(page.title.trim().toLowerCase(), (titles.get(page.title.trim().toLowerCase()) ?? 0) + 1);
  for (const [title, n] of titles) if (n > 1) add({ key: `dupe:${title}`, category: "Search engines", severity: "consider", message: `${n} pages are called “${title}”.`, how: "Give each page its own title so people (and search engines) can tell them apart." });
  if (webPages[0] && !webPages[0].seo.image) add({ key: "ogimage", category: "Search engines", severity: "consider", message: "The home page has no share picture.", how: "Page settings → Social image: shown when the site is shared in chats and social apps." });

  const usedFonts = new Set(allThemes(site).flatMap((t) => [t.headingFont, t.bodyFont]));
  for (const f of site.fonts ?? []) {
    if (!usedFonts.has(`uf:${f.family}`) || f.licence === "commercial") continue;
    add({
      key: `fontlicence:${f.id}`,
      category: "Setup",
      severity: f.licence === "personal" ? "fix" : "consider",
      message: f.licence === "personal" ? `The font “${f.family}” is for personal use only.` : `Check the licence of the font “${f.family}”.`,
      how: f.licence === "personal" ? "Fine for your own hobby site; for a business or a client, buy a commercial licence or pick a free font (Look → Fonts)." : "Look for a licence file that came with it, or its page on the site you got it from. OFL, Apache and public domain fonts are free to use anywhere."
    });
  }

  for (const page of webPages) {
    if (!page.protect) continue;
    const at = page.sections[0] ? { pageId: page.id, sectionId: page.sections[0].id, label: page.title } : undefined;
    if (!page.protect.password) add({ key: `pw:${page.id}`, category: "Setup", severity: "fix", message: `“${page.title}” is set to need a password, but has none.`, how: "Page settings → Password. It can't be published until it has one.", where: at });
    else if (!strongPassword(page.protect.password)) add({ key: `pwweak:${page.id}`, category: "Setup", severity: "fix", message: `“${page.title}” needs a stronger password.`, how: "At least 10 characters with a number and a symbol (or a phrase of 16+ characters). Page settings → Password has a Suggest button.", where: at });
  }

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  for (const s of all) {
    for (const value of Object.values(s.block.props)) {
      const size = typeof value === "string" ? sizes.get(value) : undefined;
      if (!size) continue;
      if (s.block.type === "video" && size > 25 * 1024 * 1024) add({ key: `video:${s.block.id}`, category: "Speed", severity: "consider", message: `A video is ${mb(size)}.`, how: "Big videos load slowly and can cost bandwidth: trim it (Video → Trim & tidy) or host it on YouTube or Vimeo.", where: where(s) });
      else if (s.block.type !== "video" && s.block.type !== "audio" && size > 2 * 1024 * 1024) add({ key: `big:${s.block.id}:${value}`, category: "Speed", severity: "consider", message: `A picture is ${mb(size)}.`, how: "Export optimises pictures automatically (WebP, at most 2400px wide). If it's still slow, use a smaller photo.", where: where(s) });
    }
  }

  const blocksOfType = (type: string) => all.filter((s) => s.block.type === type);
  for (const s of blocksOfType("form")) {
    const p = s.block.props;
    const ok = p.service === "netlify" || (p.service === "email" ? /@/.test(String(p.email ?? "")) : /^https:\/\//.test(String(p.endpoint ?? "")));
    if (!ok) add({ key: `form:${s.block.id}`, category: "Setup", severity: "fix", message: "A contact form doesn't know where to send messages.", how: "Choose Formspree (paste the form's address) or Netlify Forms.", where: where(s), fix: { kind: "guide", guide: "contact-form" } });
  }
  for (const s of blocksOfType("newsletter")) if (!String(s.block.props.account ?? "").trim()) add({ key: `news:${s.block.id}`, category: "Setup", severity: "fix", message: "A newsletter sign-up isn't connected to a list (it won't show on the site).", how: "Add your newsletter account.", where: where(s), fix: { kind: "guide", guide: "newsletter-signup" } });
  for (const s of blocksOfType("buy")) {
    const problem = s.block.props.provider === "snipcart" ? (SNIPCART_KEY.test(site.services?.snipcart?.publicKey ?? "") ? "" : "Snipcart needs its public key (File → Services).") : checkoutProblem(String(s.block.props.provider), String(s.block.props.href ?? ""));
    if (problem) add({ key: `buy:${s.block.id}`, category: "Setup", severity: "fix", message: `A Buy button won't work: ${problem}`, how: "Select it and fix the checkout link.", where: where(s), fix: { kind: "guide", guide: "sell-stripe" } });
  }
  for (const s of blocksOfType("account")) if (s.block.props.provider !== "hosted" && !MEMBERSTACK_APP.test(site.services?.memberstack?.appId ?? "")) add({ key: `acct:${s.block.id}`, category: "Setup", severity: "fix", message: "Sign-in buttons need your Memberstack app id.", how: "File → Services → Memberstack.", where: where(s) });
  for (const s of blocksOfType("comments")) {
    const p = s.block.props;
    const ok =
      p.provider === "giscus"
        ? GISCUS_REPO.test(String(p.repo)) && GISCUS_ID.test(String(p.repoId)) && GISCUS_ID.test(String(p.categoryId))
        : p.provider === "cusdis"
          ? /^[\w-]{8,64}$/.test(String(p.cusdisId))
          : String(p.post).includes("{{") || (p.provider === "bluesky" ? BLUESKY_POST : MASTODON_POST).test(String(p.post));
    if (!ok) add({ key: `comments:${s.block.id}`, category: "Setup", severity: "fix", message: "Comments aren't set up yet (they won't show).", how: "Follow the comments guide.", where: where(s), fix: { kind: "guide", guide: p.provider === "giscus" ? "comments-giscus" : "comments-social" } });
  }
  for (const s of blocksOfType("booking")) {
    const url = String(s.block.props.url ?? "");
    if (!BOOKING.cal.re.test(url) && !BOOKING.calendly.re.test(url)) add({ key: `booking:${s.block.id}`, category: "Setup", severity: "fix", message: "A Booking block has no booking page (it won't show).", how: "Paste your Cal.com or Calendly page.", where: where(s), fix: { kind: "guide", guide: "booking" } });
  }
  for (const s of blocksOfType("community")) {
    const c = COMMUNITY[String(s.block.props.provider)] ?? COMMUNITY.discord;
    if (!c.re.test(String(s.block.props.url ?? ""))) add({ key: `community:${s.block.id}`, category: "Setup", severity: "fix", message: `A Community block has no ${c.label} link (it won't show).`, how: "Paste the invite or page link.", where: where(s), fix: { kind: "guide", guide: "community" } });
  }

  return issues;
}

export function externalLinks(site: Site): { url: string; where: string }[] {
  const out = new Map<string, string>();
  for (const s of spots(site)) {
    for (const value of Object.values(s.block.props)) {
      if (typeof value !== "string") continue;
      if (/^https?:\/\/[^\s{}]+$/.test(value.trim()) && !/\.(png|jpe?g|gif|webp|svg|mp4|webm|mp3)$/i.test(value)) {
        if (!out.has(value.trim())) out.set(value.trim(), where(s).label);
      }
      for (const m of value.matchAll(/\]\((https?:\/\/[^\s)]+)\)/g)) if (!out.has(m[1])) out.set(m[1], where(s).label);
    }
  }
  return [...out].map(([url, w]) => ({ url, where: w })).slice(0, 200);
}
