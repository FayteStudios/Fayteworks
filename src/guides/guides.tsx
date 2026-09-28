import type { ReactNode } from "react";
import { BLUESKY_POST, GISCUS_ID, GISCUS_REPO } from "../blocks/blog";
import { createBlog } from "../data/blog";
import { BOOKING, COMMUNITY } from "../blocks/contact";
import { CRISP_ID, TAWK_PROPERTY } from "../services/siteServices";
import type { Block, Site } from "../model/types";
import type { PublishService } from "../platform/desktop";
import { openTellPeople } from "../social/TellPeopleDialog";
import { openDirectory } from "../directory/DirectoryDialog";

export interface GuideActions {
  commit: (recipe: (draft: Site) => void) => void;
  setPage: (pageId: string) => void;
  openPanel: (panel: "data" | "pages" | "add" | "inspector" | "timeline") => void;
  openExport: () => void;
  openServices: () => void;
  openInbox: () => void;
  openDesigns: () => void;
}

export interface GuideStep {
  title: string;
  body: ReactNode;
  link?: { label: string; url: string };
  copy?: (site: Site) => { label: string; value: string } | null;
  input?: { label: string; placeholder?: string; get: (site: Site) => string; set: (draft: Site, value: string) => void; check?: (value: string) => string | null };
  secret?: { service: PublishService; label: string };
  action?: { label: string; run: (actions: GuideActions, site: Site) => void };
  verify?: { label: string; run: (site: Site) => Promise<string> };
  desktopOnly?: boolean;
}

export interface Guide {
  id: string;
  title: string;
  category: "Getting online" | "Blog and email" | "Comments and community" | "Contact" | "Selling" | "Client work" | "Promote" | "Get it made";
  minutes: number;
  cost: string;
  what: string;
  steps: GuideStep[];
}

const siteAddress = (site: Site) => site.settings.baseUrl.trim().replace(/\/+$/, "");
const feedAddress = (site: Site): string | null => {
  const posts = site.collections?.find((c) => c.feed && site.pages.some((p) => p.collectionId === c.id));
  const page = posts && site.pages.find((p) => p.collectionId === posts.id);
  return page && siteAddress(site) ? `${siteAddress(site)}/${page.slug}/feed.xml` : null;
};
const blocksOf = (site: Site, type: string): Block[] => [...site.pages.flatMap((p) => p.sections), ...(site.header ? [site.header] : []), ...(site.footer ? [site.footer] : [])].flatMap((s) => s.blocks).filter((b) => b.type === type);
const httpsAddress = (v: string) => (/^https:\/\/[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v.trim()) ? null : "Use the full address, starting with https://");

async function reachable(url: string): Promise<string> {
  try {
    await fetch(url, { mode: "no-cors", cache: "no-store" });
    return `✓ ${url} answered.`;
  } catch {
    throw new Error(`${url} didn't answer. If you just published, give it a minute and try again.`);
  }
}

export const GUIDES: Guide[] = [
  {
    id: "go-online",
    title: "Put your site online (free)",
    category: "Getting online",
    minutes: 10,
    cost: "Free for most small sites",
    what: "A website is a folder of files. Hosting is a computer that's always on and hands those files to visitors. Netlify, Cloudflare Pages and GitHub Pages host small sites like yours for free, with HTTPS (the padlock) included.",
    steps: [
      {
        title: "Pick a host",
        body: (
          <>
            <p>
              <strong>Netlify</strong> is the easiest: sign up, create a token, publish. <strong>Cloudflare Pages</strong> is just as good and very fast worldwide.{" "}
              <strong>GitHub Pages</strong> suits you if you already use GitHub. All three are free; you can switch later without rebuilding anything.
            </p>
            <p>Not sure? Choose Netlify.</p>
          </>
        ),
        link: { label: "Create a Netlify account", url: "https://app.netlify.com/signup" }
      },
      {
        title: "Create an access token",
        body: <p>A token is a long password that lets this app publish for you (and nothing else sees it: it's stored encrypted on this computer). In Netlify: your avatar → User settings → Applications → Personal access tokens → New access token. Copy it.</p>,
        link: { label: "Open Netlify's token page", url: "https://app.netlify.com/user/applications#personal-access-tokens" },
        secret: { service: "netlify", label: "Paste the Netlify token" },
        desktopOnly: true
      },
      {
        title: "Publish",
        body: <p>Press Publish at the top right, choose Netlify and press Publish. The first time it creates the site and gives you its address (something like https://your-site.netlify.app).</p>,
        action: { label: "Open Publish", run: (a) => a.openExport() }
      },
      {
        title: "Tell the site its address",
        body: <p>Paste the address you got. The site uses it for search engines (sitemap), sharing previews and RSS feeds.</p>,
        input: { label: "Site address", placeholder: "https://your-site.netlify.app", get: (s) => s.settings.baseUrl, set: (d, v) => void (d.settings.baseUrl = v.trim().replace(/\/+$/, "")), check: httpsAddress },
        verify: { label: "Check it's online", run: (s) => reachable(siteAddress(s)) }
      }
    ]
  },
  {
    id: "site-address",
    title: "Set your site's address",
    category: "Getting online",
    minutes: 1,
    cost: "Free",
    what: "The address is where your published site lives (https://…). Search engines, link previews and RSS feeds need the full address; the app fills it into the right places when it exports.",
    steps: [
      {
        title: "Paste the address",
        body: <p>Use the address visitors type, including https://. If you don't have one yet, publish first (see “Put your site online”).</p>,
        input: { label: "Site address", placeholder: "https://example.com", get: (s) => s.settings.baseUrl, set: (d, v) => void (d.settings.baseUrl = v.trim().replace(/\/+$/, "")), check: httpsAddress },
        verify: { label: "Check it's online", run: (s) => reachable(siteAddress(s)) }
      }
    ]
  },
  {
    id: "own-domain",
    title: "Use your own domain name",
    category: "Getting online",
    minutes: 20,
    cost: "About $10–20 a year for the name; hosting stays free",
    what: "A domain is a name you rent yearly (yourname.com). DNS is the internet's address book: you add a record telling it “yourname.com lives at my host”. Your host then adds HTTPS by itself.",
    steps: [
      {
        title: "Buy the name",
        body: <p>Any registrar works. Cloudflare and Porkbun sell at cost with free privacy; Namecheap is popular too. Avoid add-ons you don't need (you don't need their hosting, email or “SSL”).</p>,
        link: { label: "Search on Cloudflare Registrar", url: "https://www.cloudflare.com/products/registrar/" }
      },
      {
        title: "Connect it to your host",
        body: <p>In your host's dashboard, add the domain to your site. It shows exactly which DNS records to add at your registrar (or offers to manage DNS for you, which is easiest).</p>,
        link: { label: "Netlify: custom domains", url: "https://docs.netlify.com/domains-https/custom-domains/" }
      },
      {
        title: "Wait, then update the address",
        body: <p>DNS changes take from minutes to a few hours. When your domain shows the site with a padlock, update the site address here.</p>,
        input: { label: "Site address", placeholder: "https://yourname.com", get: (s) => s.settings.baseUrl, set: (d, v) => void (d.settings.baseUrl = v.trim().replace(/\/+$/, "")), check: httpsAddress },
        verify: { label: "Check the domain", run: (s) => reachable(siteAddress(s)) }
      }
    ]
  },

  {
    id: "start-blog",
    title: "Start a blog",
    category: "Blog and email",
    minutes: 5,
    cost: "Free",
    what: "Posts are written right here and published as plain pages: a blog page listing them, a page for each post, and an RSS feed (a list of new posts that feed readers and newsletter services follow).",
    steps: [
      {
        title: "Make the blog",
        body: <p>Adds a Posts collection with two sample posts, a Blog page (newest first, with tag filters) and the page each post is published on. Everything is ordinary blocks you can restyle.</p>,
        action: {
          label: "Make the blog",
          run: (a, site) => {
            if (site.collections?.some((c) => c.kind === "posts") && !window.confirm("This site already has a blog. Make another one?")) return;
            const { collection, card, index, post } = createBlog(site);
            a.commit((d) => {
              (d.collections ??= []).push(collection);
              (d.components ??= []).push(card);
              d.pages.push(index, post);
            });
            a.setPage(index.id);
          }
        }
      },
      {
        title: "Write your first post",
        body: <p>Open Data in the left bar, choose Posts, open a post and press ✎ Write. The toolbar does the formatting; pictures go in with the 🖼 button.</p>,
        action: { label: "Open Data", run: (a) => a.openPanel("data") }
      },
      {
        title: "Set the site address (for the RSS feed)",
        body: <p>The feed needs full addresses to work in feed readers. If your site isn't online yet, do this after publishing.</p>,
        input: { label: "Site address", placeholder: "https://your-site.netlify.app", get: (s) => s.settings.baseUrl, set: (d, v) => void (d.settings.baseUrl = v.trim().replace(/\/+$/, "")), check: httpsAddress }
      },
      {
        title: "Publish",
        body: <p>Your posts, the blog page and the feed (feed.xml in the blog's folder) all go out together.</p>,
        action: { label: "Open Publish", run: (a) => a.openExport() },
        copy: (s) => (feedAddress(s) ? { label: "Your RSS feed", value: feedAddress(s)! } : null)
      }
    ]
  },
  {
    id: "rss-email",
    title: "Email new posts to subscribers automatically",
    category: "Blog and email",
    minutes: 10,
    cost: "Free plans available (Buttondown, Kit, Mailchimp)",
    what: "Newsletter services can watch your RSS feed and email each new post to your subscribers, so publishing here is all you ever do.",
    steps: [
      {
        title: "Have a blog with a feed",
        body: <p>You need a blog, the site address set, and the site published once. The feed address is below when that's done.</p>,
        copy: (s) => (feedAddress(s) ? { label: "Your RSS feed", value: feedAddress(s)! } : null),
        verify: {
          label: "Check the feed is online",
          run: async (s) => {
            const url = feedAddress(s);
            if (!url) throw new Error("No feed yet: make a blog and set the site address first.");
            return reachable(url);
          }
        }
      },
      {
        title: "Pick a newsletter service",
        body: (
          <p>
            <strong>Buttondown</strong> is simple and pleasant; <strong>Kit</strong> suits creators selling things; <strong>Mailchimp</strong> is the big one. All three can send new posts from an RSS feed.
          </p>
        ),
        link: { label: "Sign up for Buttondown", url: "https://buttondown.com" }
      },
      {
        title: "Turn on RSS-to-email",
        body: <p>In the service, look for “RSS” (Buttondown: RSS-to-email in its settings; Kit: RSS in Automations; Mailchimp: an RSS campaign). Paste your feed address and choose whether emails go out automatically or wait for you as drafts.</p>,
        link: { label: "Buttondown's help on RSS", url: "https://docs.buttondown.com" }
      },
      {
        title: "Let people sign up",
        body: <p>Add a Newsletter sign-up block (Add → Services) and put your Buttondown username in it. See “Collect email sign-ups”.</p>,
        action: { label: "Open Add", run: (a) => a.openPanel("add") }
      }
    ]
  },
  {
    id: "newsletter-send",
    title: "Send a post as a newsletter",
    category: "Blog and email",
    minutes: 5,
    cost: "Buttondown's free plan is enough to start",
    what: "Instead of (or as well as) RSS-to-email, send any post to Buttondown as a draft email with one click from the writing editor. You check it there and press send.",
    steps: [
      { title: "Make a Buttondown account", body: <p>Sign up and confirm your email address.</p>, link: { label: "Sign up for Buttondown", url: "https://buttondown.com" } },
      {
        title: "Connect it",
        body: <p>In Buttondown, open Settings and find API: copy your API key and paste it here. It's stored encrypted on this computer, never in the project.</p>,
        link: { label: "Open Buttondown settings", url: "https://buttondown.com/settings" },
        secret: { service: "buttondown", label: "Paste the Buttondown API key" },
        desktopOnly: true
      },
      { title: "Send a post", body: <p>Open a post (Data → Posts → ✎ Write) and press ✉ Newsletter draft. Pictures and a “Read this on the website” link are included when the site address is set.</p>, action: { label: "Open Data", run: (a) => a.openPanel("data") } }
    ]
  },
  {
    id: "newsletter-signup",
    title: "Collect email sign-ups",
    category: "Blog and email",
    minutes: 5,
    cost: "Free plans available",
    what: "A sign-up box on your site that adds people to your mailing list. The list lives with the newsletter service; the site just sends the form there.",
    steps: [
      { title: "Make an account", body: <p>Buttondown is the simplest. Kit, Mailchimp and Formspree work too (see the block's settings).</p>, link: { label: "Sign up for Buttondown", url: "https://buttondown.com" } },
      { title: "Add the sign-up block", body: <p>Add → Services → Newsletter sign-up, and place it where people finish reading (end of posts, footer).</p>, action: { label: "Open Add", run: (a) => a.openPanel("add") } },
      {
        title: "Connect it to your list",
        body: <p>Your Buttondown username (from your Buttondown address, buttondown.com/<em>username</em>). This fills every Buttondown sign-up block on the site.</p>,
        input: {
          label: "Buttondown username",
          placeholder: "yourname",
          get: (s) => String(blocksOf(s, "newsletter").find((b) => b.props.service === "buttondown")?.props.account ?? ""),
          set: (d, v) => blocksOf(d, "newsletter").filter((b) => b.props.service === "buttondown").forEach((b) => (b.props.account = v.trim())),
          check: (v) => (/^[\w-]{1,64}$/.test(v.trim()) ? null : "Just the username: letters, numbers, dashes.")
        }
      }
    ]
  },

  {
    id: "comments-giscus",
    title: "Comments with Giscus (GitHub)",
    category: "Comments and community",
    minutes: 15,
    cost: "Free",
    what: "Giscus stores comments in the Discussions of a GitHub repository you own. Visitors sign in with GitHub to comment; you moderate on GitHub. Great for sites whose readers are developers or makers.",
    steps: [
      { title: "Make a public repository", body: <p>On GitHub, create a public repository for the comments (it can be your site's own, or an empty one called “comments”).</p>, link: { label: "New GitHub repository", url: "https://github.com/new" } },
      { title: "Turn on Discussions", body: <p>In the repository: Settings → General → Features → tick Discussions.</p> },
      { title: "Install the Giscus app", body: <p>Install it for that repository only.</p>, link: { label: "Install Giscus on GitHub", url: "https://github.com/apps/giscus" } },
      {
        title: "Get the ids",
        body: <p>On giscus.app, type your repository (you/comments), pick the “Announcements” category, and scroll to “Enable giscus”: the code there contains data-repo-id and data-category-id. Copy them into the boxes below.</p>,
        link: { label: "Open giscus.app", url: "https://giscus.app" }
      },
      {
        title: "Fill in the settings",
        body: <p>These go into every Giscus comments block on the site. Add a Comments block (Add → Services) first if you haven't.</p>,
        input: {
          label: "Repository (you/repo)",
          placeholder: "you/comments",
          get: (s) => String(blocksOf(s, "comments")[0]?.props.repo ?? ""),
          set: (d, v) => blocksOf(d, "comments").forEach((b) => Object.assign(b.props, { provider: "giscus", repo: v.trim() })),
          check: (v) => (GISCUS_REPO.test(v.trim()) ? null : "Like: you/comments")
        }
      },
      {
        title: "Paste the two ids",
        body: <p>data-repo-id starts with R_, data-category-id with DIC_. The category name is usually Announcements.</p>,
        input: {
          label: "Repository id, category id, category (separated by spaces)",
          placeholder: "R_kgDO… DIC_kwDO… Announcements",
          get: (s) => {
            const p = blocksOf(s, "comments")[0]?.props;
            return p && p.repoId ? `${p.repoId} ${p.categoryId} ${p.category}` : "";
          },
          set: (d, v) => {
            const [repoId, categoryId, ...name] = v.trim().split(/\s+/);
            blocksOf(d, "comments").forEach((b) => Object.assign(b.props, { provider: "giscus", repoId, categoryId, category: name.join(" ") || "Announcements" }));
          },
          check: (v) => {
            const [a, b] = v.trim().split(/\s+/);
            return GISCUS_ID.test(a ?? "") && GISCUS_ID.test(b ?? "") ? null : "Two ids (R_… and DIC_…), then the category name.";
          }
        }
      },
      { title: "Publish and try it", body: <p>Comments appear on the published site (the editor shows where). Leave a test comment and you'll see it in the repository's Discussions.</p>, action: { label: "Open Publish", run: (a) => a.openExport() } }
    ]
  },
  {
    id: "comments-social",
    title: "Replies from Bluesky or Mastodon as comments",
    category: "Comments and community",
    minutes: 5,
    cost: "Free",
    what: "Post a link to your article on Bluesky or Mastodon; replies to that post show on the article as comments. No accounts, databases or moderation tools to run: conversations happen where people already are.",
    steps: [
      { title: "Share the post", body: <p>Publish the article, then post its link on Bluesky or Mastodon.</p> },
      { title: "Copy the link to your social post", body: <p>Bluesky: the … menu on your post → Copy link to post. Mastodon: open the post and copy the address from the browser.</p> },
      {
        title: "Attach it to the article",
        body: <p>On a blog made here, open the post under Data in the left bar and paste it into “Bluesky post for replies”. On other pages, paste it into the Comments block's post field.</p>,
        action: { label: "Open Data", run: (a) => a.openPanel("data") },
        verify: {
          label: "Check the links",
          run: async (s) => {
            const posts = s.collections?.flatMap((c) => c.items.map((i) => String(i.values.bluesky ?? ""))).filter(Boolean) ?? [];
            const bad = posts.filter((p) => !BLUESKY_POST.test(p));
            if (!posts.length) throw new Error("No post has a Bluesky link yet.");
            if (bad.length) throw new Error(`These don't look like Bluesky post links: ${bad.join(", ")}`);
            return `✓ ${posts.length} post${posts.length === 1 ? "" : "s"} linked to Bluesky.`;
          }
        }
      }
    ]
  },

  {
    id: "contact-form",
    title: "Get contact form messages by email",
    category: "Contact",
    minutes: 5,
    cost: "Free plans for a modest number of messages; Netlify Forms is included with Netlify hosting",
    what: "A static site can't send email by itself, so the form sends to a small service that emails you. Formspree works on any host; Netlify Forms works if you host on Netlify.",
    steps: [
      { title: "Make a Formspree form", body: <p>Sign up, create a form, and copy its address (https://formspree.io/f/…).</p>, link: { label: "Open Formspree", url: "https://formspree.io/register" } },
      {
        title: "Connect your forms",
        body: <p>Fills every Formspree contact form on the site. Add one first if needed (Add → Content → Contact form).</p>,
        input: {
          label: "Formspree form address",
          placeholder: "https://formspree.io/f/abcdwxyz",
          get: (s) => String(blocksOf(s, "form").find((b) => b.props.service === "formspree")?.props.endpoint ?? ""),
          set: (d, v) => blocksOf(d, "form").filter((b) => b.props.service === "formspree" || !b.props.endpoint).forEach((b) => Object.assign(b.props, { service: "formspree", endpoint: v.trim() })),
          check: (v) => (/^https:\/\/formspree\.io\/f\/\w{4,20}$/.test(v.trim()) ? null : "Like: https://formspree.io/f/abcdwxyz")
        }
      },
      { title: "Publish and send a test", body: <p>The first message asks you to confirm your email with Formspree; after that they arrive straight away.</p>, action: { label: "Open Publish", run: (a) => a.openExport() } }
    ]
  },

  {
    id: "forms-inbox",
    title: "Read form messages inside the app",
    category: "Contact",
    minutes: 5,
    cost: "Free with Netlify hosting",
    what: "Netlify Forms collects what people send through your site's contact forms. The desktop app's Inbox reads them for you, so there's no extra dashboard to check; you can also get each one by email from Netlify.",
    steps: [
      {
        title: "Publish on Netlify",
        body: <p>The inbox reads the forms of the Netlify site this project publishes to. If you haven't published there yet, follow “Put your site online”.</p>,
        action: { label: "Open Publish", run: (a) => a.openExport() }
      },
      {
        title: "Send forms to Netlify",
        body: <p>Select each contact form and set “Send messages with” to Netlify Forms (Netlify finds the forms in your pages when you publish). This switches every form on the site for you:</p>,
        action: {
          label: "Use Netlify Forms for all my forms",
          run: (a) => a.commit((d) => blocksOf(d, "form").forEach((b) => (b.props.service = "netlify")))
        }
      },
      {
        title: "Turn on form detection (first time only)",
        body: <p>In Netlify: your site → Forms → Enable form detection. Then publish again so Netlify sees the forms.</p>,
        link: { label: "Netlify Forms docs", url: "https://docs.netlify.com/forms/setup/" },
        desktopOnly: true
      },
      { title: "Open the Inbox", body: <p>The ✉ Inbox button in the top bar lists messages, newest first. Reply opens your email app; delete removes the message from Netlify too.</p>, action: { label: "Open the Inbox", run: (a) => a.openInbox() }, desktopOnly: true },
      { title: "Get an email for each message (optional)", body: <p>In Netlify: Forms → Form notifications → Add notification → Email notification.</p>, link: { label: "Netlify form notifications", url: "https://docs.netlify.com/forms/notifications/" } }
    ]
  },
  {
    id: "form-spam",
    title: "Keep spam out of your forms",
    category: "Contact",
    minutes: 3,
    cost: "Free",
    what: "Bots fill in forms. Every form here already has a hidden trap field that people never see and bots fill in, so their messages are dropped. If spam still gets through, add a “not a robot” check.",
    steps: [
      { title: "The trap is already on", body: <p>Nothing to do: both Formspree and Netlify drop messages that fill in the hidden field.</p> },
      {
        title: "On Netlify: add the robot check",
        body: <p>Select the form and set Spam protection to “Plus a ‘I'm not a robot’ check”. Netlify shows Google's checkbox above the Send button.</p>,
        action: { label: "Turn it on for all Netlify forms", run: (a) => a.commit((d) => blocksOf(d, "form").filter((b) => b.props.service === "netlify").forEach((b) => (b.props.spam = "recaptcha"))) }
      },
      { title: "On Formspree: check its spam settings", body: <p>Formspree filters spam automatically; its form settings have more options (like a captcha) if you need them.</p>, link: { label: "Open Formspree", url: "https://formspree.io/forms" } }
    ]
  },
  {
    id: "booking",
    title: "Let people book appointments",
    category: "Contact",
    minutes: 10,
    cost: "Cal.com is free for one person; Calendly has a free plan",
    what: "A booking page shows the times you're free and puts appointments in your calendar, with reminders and time zones handled. Your site shows it (or links to it); the service does the rest.",
    steps: [
      { title: "Make a booking page", body: <p><strong>Cal.com</strong> (free, open source) or <strong>Calendly</strong>. Connect your calendar and create an event type, like “30 minute call”.</p>, link: { label: "Sign up for Cal.com", url: "https://app.cal.com/signup" } },
      {
        title: "Add it to your site",
        body: <p>Add a Booking block (Add → Services), or fill in the address here for every Booking block on the site.</p>,
        input: {
          label: "Your booking page address",
          placeholder: "https://cal.com/you/30min",
          get: (s) => String(blocksOf(s, "booking")[0]?.props.url ?? ""),
          set: (d, v) => blocksOf(d, "booking").forEach((b) => Object.assign(b.props, { url: v.trim(), provider: /calendly\.com/.test(v) ? "calendly" : "cal" })),
          check: (v) => (BOOKING.cal.re.test(v.trim()) || BOOKING.calendly.re.test(v.trim()) ? null : "Like: https://cal.com/you/30min or https://calendly.com/you/30min")
        },
        action: { label: "Open Add", run: (a) => a.openPanel("add") }
      },
      { title: "Book a test appointment", body: <p>Publish, then book yourself a slot to see the emails your visitors will get.</p> }
    ]
  },
  {
    id: "live-chat",
    title: "Add live chat",
    category: "Contact",
    minutes: 10,
    cost: "Crisp and Tawk.to both have free plans",
    what: "A chat bubble in the corner of every page. Visitors type; you answer from the service's app on your phone or computer. If you're away, it collects their email so you can reply later.",
    steps: [
      { title: "Pick a service", body: <p><strong>Crisp</strong> is polished and simple; <strong>Tawk.to</strong> is entirely free. Make an account and add your website.</p>, link: { label: "Sign up for Crisp", url: "https://app.crisp.chat/initiate/signup/" } },
      {
        title: "Find its id",
        body: <p>Crisp: Settings → Website Settings → Setup instructions: the Website ID. Tawk.to: Administration → Chat Widget: the Property ID (and Widget ID, usually “default”).</p>
      },
      {
        title: "Connect it",
        body: <p>Paste the Crisp Website ID, or the Tawk.to Property ID.</p>,
        input: {
          label: "Crisp Website ID or Tawk.to Property ID",
          placeholder: "e.g. 1b2c3d4e-…",
          get: (s) => s.services?.chat?.id ?? "",
          set: (d, v) => {
            const id = v.trim();
            d.services = { ...d.services, chat: CRISP_ID.test(id) ? { provider: "crisp", id } : { provider: "tawk", id, widget: d.services?.chat?.widget } };
          },
          check: (v) => (CRISP_ID.test(v.trim()) || TAWK_PROPERTY.test(v.trim()) ? null : "A Crisp Website ID looks like 8-4-4-4-12 letters and numbers; a Tawk.to Property ID is 24 characters.")
        },
        action: { label: "Open Services", run: (a) => a.openServices() }
      },
      { title: "Publish and say hello", body: <p>Open your published site and send a message to yourself; it arrives in the service's app.</p>, action: { label: "Open Publish", run: (a) => a.openExport() } }
    ]
  },
  {
    id: "community",
    title: "Start a community or forum",
    category: "Comments and community",
    minutes: 15,
    cost: "Free (Discord, GitHub Discussions, Reddit); Discourse hosting is paid unless you run it yourself",
    what: "A forum needs accounts, moderation and a server running all the time, so it's best left to a service. Pick where your people already are, and invite them from your site with a Community block.",
    steps: [
      {
        title: "Choose a home",
        body: (
          <>
            <p><strong>Discord</strong>: chat, voice and forum channels; great for fans, games and creators.</p>
            <p><strong>GitHub Discussions</strong>: for software and open projects. <strong>Discourse</strong>: a classic, searchable forum. <strong>Reddit</strong> or <strong>Circle</strong> also work.</p>
          </>
        ),
        link: { label: "Create a Discord server", url: "https://discord.com/" }
      },
      { title: "Get an invite link that doesn't expire", body: <p>Discord: Invite People → Edit invite link → Expire after: Never → copy. Forums and Discussions: just copy the address.</p> },
      {
        title: "Add it to your site",
        body: <p>Add a Community block (Add → Services), or fill in the link here for every Community block on the site.</p>,
        input: {
          label: "Invite or forum link",
          placeholder: "https://discord.gg/abc123",
          get: (s) => String(blocksOf(s, "community")[0]?.props.url ?? ""),
          set: (d, v) => {
            const url = v.trim();
            const provider = Object.entries(COMMUNITY).find(([k, c]) => k !== "discourse" && k !== "circle" && c.re.test(url))?.[0] ?? "discourse";
            blocksOf(d, "community").forEach((b) => Object.assign(b.props, { url, provider }));
          },
          check: (v) => (/^https:\/\//.test(v.trim()) ? null : "Paste the full link, starting with https://")
        },
        action: { label: "Open Add", run: (a) => a.openPanel("add") }
      },
      { title: "Show who's online (Discord, optional)", body: <p>Server Settings → Widget → Enable Server Widget, copy the Server ID, and paste it into the Community block.</p> }
    ]
  },

  {
    id: "stats",
    title: "See how many people visit",
    category: "Getting online",
    minutes: 10,
    cost: "Cloudflare: free; Umami: free plan; Plausible: paid, with a free trial",
    what: "Visitor statistics count visits, the pages people read and where they came from. The services here don't use cookies, so there's no consent banner to add in most places, and your visitors aren't tracked across the web.",
    steps: [
      {
        title: "Pick a service",
        body: (
          <>
            <p><strong>Umami</strong> (free plan) and <strong>Plausible</strong> (paid, simple and polished) can also show their numbers here in the app. <strong>Cloudflare Web Analytics</strong> is free if you already use Cloudflare.</p>
          </>
        ),
        link: { label: "Sign up for Umami Cloud", url: "https://cloud.umami.is/signup" }
      },
      { title: "Add your site there", body: <p>Add your website's address. Umami gives you a Website ID; Plausible uses your domain.</p> },
      { title: "Connect it", body: <p>File → Services → Visitor statistics: choose the service and paste the ID or domain, then publish. Visits start counting straight away.</p>, action: { label: "Open Services", run: (a) => a.openServices() } },
      { title: "See the numbers here (Umami, Plausible)", body: <p>Create a read-only API key in the service (Settings → API keys), then open 📈 Stats in the top bar and paste it. It's stored encrypted on this computer.</p>, desktopOnly: true }
    ]
  },

  {
    id: "handover",
    title: "Hand a site over to a client",
    category: "Client work",
    minutes: 20,
    cost: "Free",
    what: "When a site is done, the client gets it: the project, a way to publish, and a locked editor where they can change words, pictures and posts without breaking the design. You keep a PIN to unlock it later.",
    steps: [
      { title: "Check it over", body: <p>File → Check before publishing. Fix anything marked “to fix”; it's the first thing a client will notice.</p> },
      { title: "Save a version", body: <p>File → Version history → name it “Handed over”. If anything goes wrong later, it's one click back.</p> },
      { title: "Publish on their accounts", body: <p>Ideally the site lives on the client's own Netlify (or other) account and domain, so they truly own it. Publish there with their token, or show them how.</p>, action: { label: "Open Publish", run: (a) => a.openExport() } },
      { title: "Turn on client mode", body: <p>File → Hand over to a client. Choose a PIN you'll remember; they won't need it.</p> },
      {
        title: "Give them the site",
        body: (
          <>
            <p>Desktop: zip the project folder (File → Show project folder) and send it with the app's download link. Browser: File → Save site file.</p>
            <p>Show them: click text or pictures to change them, Data → Posts to write, Export to publish. Five minutes on a call saves a lot of emails.</p>
          </>
        )
      }
    ]
  },

  {
    id: "sell-stripe",
    title: "Take payments with Stripe",
    category: "Selling",
    minutes: 15,
    cost: "No monthly fee; Stripe takes a small cut of each sale",
    what: "A Stripe Payment Link is a checkout page Stripe hosts for one product. Your site links to it from a Buy button; Stripe handles cards, receipts and payouts.",
    steps: [
      { title: "Make a Stripe account", body: <p>You'll add your bank details to get paid (you can test first without them).</p>, link: { label: "Sign up for Stripe", url: "https://dashboard.stripe.com/register" } },
      { title: "Create a Payment Link", body: <p>In Stripe: Payment Links → New. Add the product, price and picture, then copy the link (https://buy.stripe.com/…).</p>, link: { label: "Open Payment Links", url: "https://dashboard.stripe.com/payment-links" } },
      { title: "Add a Buy button", body: <p>Add → Services → Buy button, choose Stripe, paste the link. On a product list (Data), keep one link per product in a field and use {"{{item.buy_link}}"}.</p>, action: { label: "Open Add", run: (a) => a.openPanel("add") } }
    ]
  },

  {
    id: "post-everywhere",
    title: "Tell everyone at once",
    category: "Promote",
    minutes: 15,
    cost: "Free",
    what: "When you publish something, one message can go to your Discord, Bluesky, Mastodon and Telegram straight from here, and the share pages for X, Threads, Facebook, LinkedIn and Reddit open with it filled in. Instagram and TikTok don't let other apps post, so the text is copied and the picture saved for you.",
    steps: [
      { title: "Give your pages a share picture", body: <p>It's what shows under the link in every app. Make one under Designs in the left bar → Link preview, then “Use as the share picture”.</p>, action: { label: "Open Designs", run: (a) => a.openDesigns() } },
      {
        title: "Connect the accounts that allow it",
        body: (
          <>
            <p><strong>Discord</strong>: a webhook for your announcements channel. <strong>Bluesky</strong>: an app password. <strong>Mastodon</strong>: an access token that can only post. <strong>Telegram</strong>: a bot that's an admin of your channel.</p>
            <p>Open Tell people and press Connect next to each: it shows exactly where to click. Everything is stored encrypted on this computer.</p>
          </>
        ),
        action: { label: "Open Tell people", run: () => openTellPeople() },
        desktopOnly: true
      },
      { title: "Post", body: <p>File → Tell people: pick the page or post, write one message (the counters show each app's limit), tick the accounts and press Post. Then press Open next to X, Threads and the rest.</p>, action: { label: "Open Tell people", run: () => openTellPeople() } },
      {
        title: "Instagram and TikTok",
        body: <p>Press Copy text and Save picture, then post from your phone. Links in captions don't work there, so put a Link in bio page in your profile (New → Page → Link in bio).</p>
      },
      {
        title: "Share new posts automatically (optional)",
        body: (
          <>
            <p>Your blog has an RSS feed. Services like <strong>Zapier</strong>, <strong>Make</strong> or <strong>IFTTT</strong> can watch it and post each new post to X, LinkedIn, Facebook pages and more; <strong>Buffer</strong> schedules posts for later. They have free plans.</p>
          </>
        ),
        copy: (site) => {
          const url = feedAddress(site);
          return url ? { label: "Your feed", value: url } : null;
        },
        link: { label: "Zapier: RSS to social posts", url: "https://zapier.com/apps/rss/integrations" }
      },
      {
        title: "Why not Instagram, Facebook, YouTube or X directly?",
        body: <p>Those platforms only let apps post after the app is reviewed and approved by them (and X charges for it). That's planned for FayteWorks; until then, the share pages and schedulers above do the job.</p>
      }
    ]
  },
  {
    id: "share-picture",
    title: "Make a share picture for your pages",
    category: "Promote",
    minutes: 10,
    cost: "Free",
    what: "When someone shares your page in a chat or on social media, apps show a picture, the title and the description. Without a picture, the link is easy to miss.",
    steps: [
      { title: "Make the design", body: <p>Designs in the left bar → Link preview (1200 × 630). Big, short words and your logo read best at small sizes.</p>, action: { label: "Open Designs", run: (a) => a.openDesigns() } },
      { title: "Use it", body: <p>With the design open, the panel on the right has “Use as the share picture”: pick every page without one, or a single page.</p> },
      { title: "Describe each page", body: <p>Open the page's settings (⋯ next to it under Pages) and write a one-line description. It shows under the title.</p> },
      { title: "Publish and test", body: <p>Publish, then paste a page's address into a chat with yourself. Apps remember old previews for a while, so a changed picture can take a day to show.</p> }
    ]
  },
  {
    id: "podcast",
    title: "Start a podcast",
    category: "Promote",
    minutes: 30,
    cost: "Free to publish; audio hosting may cost something for big shows",
    what: "A podcast is audio files plus a feed that podcast apps read. FayteWorks makes the pages and the feed; Apple Podcasts, Spotify and the rest pick up new episodes from it on their own.",
    steps: [
      { title: "Add the podcast pages", body: <p>New → Page → Podcast. It adds an Episodes list (Data), a page per episode with a player and show notes, and turns on the feed.</p>, action: { label: "Open Pages", run: (a) => a.openPanel("pages") } },
      {
        title: "Put each episode's audio somewhere",
        body: (
          <>
            <p>Export as MP3. Small files can be uploaded in the episode's Audio field, but web hosts limit file sizes (Cloudflare Pages: 25 MB), so long episodes are better kept elsewhere and linked: the <strong>Internet Archive</strong> is free, or a storage service like Cloudflare R2.</p>
            <p>Already use a podcast host? It makes its own feed: skip the feed and link to your show from a Social links block.</p>
          </>
        ),
        link: { label: "Upload to the Internet Archive", url: "https://archive.org/create/" }
      },
      { title: "Fill in the show's details", body: <p>Data → Episodes → Podcast feed: host, an email that's yours, square cover art (1400–3000 px), category.</p>, action: { label: "Open Data", run: (a) => a.openPanel("data") } },
      {
        title: "Publish and copy the feed address",
        body: <p>The site address needs to be set. After publishing, the feed lives at your podcast page's address plus feed.xml.</p>,
        copy: (site) => {
          const c = site.collections?.find((x) => x.podcast);
          const page = c && site.pages.find((p) => p.collectionId === c.id);
          return page && siteAddress(site) ? { label: "Podcast feed", value: `${siteAddress(site)}/${page.slug}/feed.xml` } : null;
        }
      },
      { title: "Submit it to Apple Podcasts", body: <p>Sign in to Podcasts Connect, add a show by feed address, paste it. Apple checks it and emails the owner address.</p>, link: { label: "Open Podcasts Connect", url: "https://podcastsconnect.apple.com/" } },
      { title: "And to Spotify", body: <p>Spotify for Creators → add your podcast by its feed address. Most other apps find shows through Apple's directory.</p>, link: { label: "Open Spotify for Creators", url: "https://creators.spotify.com/" } }
    ]
  },
  {
    id: "go-live",
    title: "Streamers: live player, schedule and alerts",
    category: "Promote",
    minutes: 15,
    cost: "Free",
    what: "Show your stream on your own site, a schedule that shows in each viewer's own time, and tell your Discord when you go live.",
    steps: [
      { title: "Add the player", body: <p>Add → Social → Live stream: Twitch, YouTube or Kick, with Twitch chat if you like. When you're offline it shows your channel.</p>, action: { label: "Open Add", run: (a) => a.openPanel("add") } },
      { title: "Add your schedule", body: <p>Add → Social → Schedule. Put in your times in your time zone; viewers also see them in theirs, and can add them to their calendar.</p> },
      { title: "Tell your Discord you're live", body: <p>File → Tell people: pick the page with the player, write “Live now!”, post to Discord (and Bluesky, Mastodon, Telegram).</p>, action: { label: "Open Tell people", run: () => openTellPeople() } },
      { title: "Automatic live alerts (optional)", body: <p>For an alert every time you go live without opening the app, an automation service can watch your channel and post to Discord for you.</p>, link: { label: "Zapier: Twitch to Discord", url: "https://zapier.com/apps/discord/integrations/twitch" } }
    ]
  },

  {
    id: "get-printed",
    title: "Get a design printed",
    category: "Get it made",
    minutes: 20,
    cost: "What the print shop charges",
    what: "Business cards, flyers, posters and stickers made here export as print-ready files. The directory lists print shops, big and small, with what to send each kind.",
    steps: [
      { title: "Start at the right size", body: <p>Designs in the left bar, then pick the size you'll print (business card, flyer, poster, sticker…). The red line is where it's cut; keep words inside the blue line.</p>, action: { label: "Open Designs", run: (a) => a.openDesigns() } },
      { title: "Reach the edges", body: <p>Colours and pictures that should go to the edge of the paper go past the red line, to the outside of the sheet (the bleed). A little is cut off; that's what stops thin white edges.</p> },
      { title: "Export it", body: <p>In the design's panel: PDF, with “Include the bleed” ticked. Stickers and merch: PNG at 300 dpi.</p> },
      { title: "Pick a printer", body: <p>File → Directory → Get it made: shops by kind, price level and where they deliver, plus what file each wants.</p>, action: { label: "Open the directory", run: () => openDirectory("print") } },
      { title: "Order a proof first", body: <p>Most shops show a digital proof: check it carefully. For big orders, order one printed sample. Colours on paper are a little darker than on screens.</p> }
    ]
  },
  {
    id: "sell-merch",
    title: "Sell your own merch",
    category: "Get it made",
    minutes: 30,
    cost: "No upfront cost with print on demand; they take their base price per item",
    what: "Print-on-demand companies print a shirt, mug or poster only when someone buys it, and ship it to them. You never hold stock. You design here, upload there, and sell from your site.",
    steps: [
      { title: "Make the print", body: <p>Designs in the left bar → T-shirt print. Select the sheet and set its background to none, so only your art is printed. Export PNG at 300 dpi.</p>, action: { label: "Open Designs", run: (a) => a.openDesigns() } },
      { title: "Pick a print-on-demand service", body: <p>File → Directory → Merch, made to order. Printful and Printify connect to Shopify; Fourthwall is made for creators; Redbubble and others are marketplaces where people can find you.</p>, action: { label: "Open the directory", run: () => openDirectory("merch") } },
      { title: "Make the product there", body: <p>Upload the PNG, place it on the product, check the mockups, set your price (their base price plus your profit).</p> },
      { title: "Sell it from your site", body: <p>With Shopify: add Buy buttons for each product. With a creator shop or marketplace: link to it from a Buy button or Social links.</p>, action: { label: "Open Add", run: (a) => a.openPanel("add") } },
      { title: "Order a sample", body: <p>Buy one yourself before you tell anyone: check the print, the fit and the shipping time. Then File → Tell people.</p> }
    ]

  }
];

export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: "Hosting", meaning: "A computer that's always on and hands your site's files to visitors. For sites like these it's often free." },
  { term: "Domain", meaning: "The name people type (yourname.com). You rent it yearly from a registrar; it points at your host." },
  { term: "DNS", meaning: "The internet's address book. A DNS record says which computer a domain lives on." },
  { term: "HTTPS / SSL", meaning: "The padlock: the connection is encrypted. Netlify, Cloudflare and GitHub add it for free, automatically." },
  { term: "Static site", meaning: "A site made of ready-made files (what this app exports). Fast, cheap, hard to hack; anything needing a server is done by a service." },
  { term: "RSS feed", meaning: "A file listing your newest posts. Feed readers and newsletter services check it to find new posts." },
  { term: "API key / token", meaning: "A long password for one app to use a service on your behalf. Keep it secret; this app stores them encrypted." },
  { term: "Embed", meaning: "Showing something from another service inside your page (a map, a video, comments)." },
  { term: "Form endpoint", meaning: "The address a form sends its answers to. Static sites use services like Formspree for this." },
  { term: "Open Graph image", meaning: "The picture shown when your page is shared in chat or social apps (page settings → social image)." }
];

export const guideById = (id: string) => GUIDES.find((g) => g.id === id);

export const GUIDES_FOR_BLOCK: Record<string, string[]> = {
  comments: ["comments-giscus", "comments-social"],
  newsletter: ["newsletter-signup", "rss-email"],
  form: ["contact-form", "forms-inbox", "form-spam"],
  booking: ["booking"],
  community: ["community"],
  buy: ["sell-stripe"],
  collection: ["start-blog"],
  article: ["start-blog"],
  stream: ["go-live"],
  schedule: ["go-live"],
  "social-links": ["post-everywhere"],
  "social-post": ["post-everywhere"],
  qr: ["get-printed"],
  support: ["sell-merch"]
};
