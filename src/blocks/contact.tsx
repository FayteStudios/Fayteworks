import type { BlockDefinition } from "./types";
import { num, str } from "./util";

export const BOOKING = {
  cal: { label: "Cal.com", re: /^https:\/\/cal\.com\/[\w.-]+(\/[\w.-]+)?\/?$/, embed: (u: string) => `${u.replace(/\/$/, "")}?embed=true&layout=month_view` },
  calendly: { label: "Calendly", re: /^https:\/\/calendly\.com\/[\w.-]+(\/[\w.-]+)?\/?$/, embed: (u: string) => `${u.replace(/\/$/, "")}?embed_type=Inline&hide_gdpr_banner=1` }
} as const;

export const COMMUNITY: Record<string, { label: string; re: RegExp; join: string; icon: string }> = {
  discord: { label: "Discord", re: /^https:\/\/(discord\.gg\/[\w-]+|discord\.com\/invite\/[\w-]+)\/?$/, join: "Join the Discord", icon: "💬" },
  discourse: { label: "Discourse forum", re: /^https:\/\/[\w.-]+\.[a-z]{2,}(\/.*)?$/, join: "Visit the forum", icon: "🗂" },
  github: { label: "GitHub Discussions", re: /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/discussions\/?$/, join: "Join the discussion", icon: "🐙" },
  reddit: { label: "Reddit", re: /^https:\/\/(www\.)?reddit\.com\/r\/\w+\/?$/, join: "Join the subreddit", icon: "👽" },
  circle: { label: "Circle", re: /^https:\/\/[\w.-]+\.[a-z]{2,}(\/.*)?$/, join: "Join the community", icon: "⭕" }
};

export const contactDefinitions: BlockDefinition[] = [
  {
    type: "booking",
    badges: ["account"],
    label: "Booking",
    category: "Services",
    icon: "📅",
    description: "Let people book a time with you: a Cal.com or Calendly page, on your site or as a button.",
    defaultSize: { w: 8, h: 26 },
    defaultProps: { provider: "cal", url: "", mode: "inline", label: "Book a time", height: 640 },
    fields: [
      {
        key: "provider",
        label: "Bookings with",
        kind: "select",
        options: [
          { value: "cal", label: "Cal.com (free, open source)" },
          { value: "calendly", label: "Calendly" }
        ]
      },
      { key: "url", label: "Your booking page", kind: "text", placeholder: "https://cal.com/you/30min", hint: "The page's address from Cal.com or Calendly (one event type, or your page with all of them)." },
      {
        key: "mode",
        label: "Show",
        kind: "select",
        options: [
          { value: "inline", label: "The calendar, on the page" },
          { value: "button", label: "A button that opens it" }
        ]
      },
      { key: "label", label: "Button label", kind: "text" },
      { key: "height", label: "Calendar height (px)", kind: "range", min: 420, max: 1100, step: 20 }
    ],
    mobileHeight: "content",
    render: (p, ctx) => {
      const provider = str(p.provider, "cal") === "calendly" ? BOOKING.calendly : BOOKING.cal;
      const url = str(p.url).trim();
      if (!provider.re.test(url)) return ctx.isEditor ? <div className="b-booking b-booking--empty">Paste your {provider.label} page (the guide shows where to find it).</div> : null;
      const button = (
        <a className="b-button b-button--solid b-button--m" href={url} target="_blank" rel="noopener noreferrer">
          {str(p.label, "Book a time")}
        </a>
      );
      if (str(p.mode) === "button") return <div className="b-button-wrap b-booking">{button}</div>;
      return (
        <div className="b-booking">
          {ctx.isEditor && !ctx.isPreview ? (
            <div className="b-booking-placeholder" style={{ height: num(p.height, 640) }}>
              📅 Your {provider.label} calendar shows here on the site.
            </div>
          ) : (
            <iframe className="b-booking-frame" src={provider.embed(url)} title={`Book a time (${provider.label})`} loading="lazy" style={{ height: num(p.height, 640) }} />
          )}
          <p className="b-booking-fallback">
            Calendar not showing?{" "}
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open the booking page ↗
            </a>
          </p>
        </div>
      );
    }
  },
  {
    type: "community",
    badges: ["free"],
    label: "Community",
    category: "Services",
    icon: "💬",
    description: "Invite people to your Discord, forum, GitHub Discussions, subreddit or Circle; Discord can show who's online.",
    defaultSize: { w: 6, h: 9 },
    defaultProps: { provider: "discord", url: "", heading: "Join the community", text: "Questions, ideas and show-and-tell. Everyone's welcome.", label: "", widgetId: "" },
    fields: [
      { key: "provider", label: "Where", kind: "select", options: Object.entries(COMMUNITY).map(([value, c]) => ({ value, label: c.label })) },
      { key: "url", label: "Invite or page link", kind: "text", placeholder: "https://discord.gg/abc123", hint: "Discord: an invite link that never expires (Invite People → Edit invite link → Never)." },
      { key: "heading", label: "Heading", kind: "text" },
      { key: "text", label: "Text", kind: "textarea" },
      { key: "label", label: "Button label (optional)", kind: "text" },
      { key: "widgetId", label: "Discord server id, to show who's online (optional)", kind: "text", showWhen: { key: "provider", is: ["discord"] }, hint: "Server Settings → Widget → turn on “Enable Server Widget”, then copy the Server ID." }
    ],
    mobileHeight: "content",
    inlineEdit: [
      { key: "heading", selector: ".b-community-heading", mode: "plain", lines: "single" },
      { key: "text", selector: ".b-community-text", mode: "plain", lines: "paragraphs" }
    ],
    render: (p, ctx) => {
      const c = COMMUNITY[str(p.provider, "discord")] ?? COMMUNITY.discord;
      const url = str(p.url).trim();
      const ok = c.re.test(url);
      const widget = str(p.provider) === "discord" && /^\d{17,20}$/.test(str(p.widgetId)) ? str(p.widgetId) : "";
      if (!ok && !ctx.isEditor) return null;
      return (
        <div className="b-community">
          <span className="b-community-icon" aria-hidden>
            {c.icon}
          </span>
          {str(p.heading) && <p className="b-community-heading">{str(p.heading)}</p>}
          {str(p.text) && <p className="b-community-text">{str(p.text)}</p>}
          {ok ? (
            <a className="b-button b-button--solid b-button--m" href={url} target="_blank" rel="noopener noreferrer">
              {str(p.label) || c.join}
            </a>
          ) : (
            <span className="b-service-hint">Paste your {c.label} link (the guide shows how).</span>
          )}
          {widget &&
            (ctx.isEditor && !ctx.isPreview ? (
              <div className="b-community-widget b-booking-placeholder">Discord's live widget (who's online) shows here on the site.</div>
            ) : (
              <iframe
                className="b-community-widget"
                src={`https://discord.com/widget?id=${widget}&theme=dark`}
                title="Discord server"
                loading="lazy"
                sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
              />
            ))}
        </div>
      );
    }
  }
];
