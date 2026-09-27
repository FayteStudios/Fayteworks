import type { CSSProperties } from "react";
import qrcode from "qrcode-generator";
import { addMinutes, clockLabel, CLOCK, dateLabel, DAY_LABEL, DAYS, googleCalendarUrl, icsHref, LOCAL_TIME, localZone, nextDay, validZone, zoneLabel } from "../social/calendar";
import { parseEmbed, parseStream, SUPPORT, supportUrl } from "../social/embeds";
import { iconPath, platformById, platformFor, type Platform } from "../social/platforms";
import type { BlockDefinition } from "./types";
import { FLEX_ALIGN, alignField, list, num, str } from "./util";

function Icon({ platform, size }: { platform: Platform; size?: number }) {
  return (
    <svg className="b-social-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={iconPath(platform)} fill="currentColor" />
    </svg>
  );
}

function onColor(hex: string): string {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#000" : "#fff";
}

const brandStyle = (pl: Platform) => ({ "--brand": `#${pl.color}`, "--on-brand": onColor(pl.color) }) as CSSProperties;

const LOAD_FIELD = {
  key: "load",
  label: "Load it",
  kind: "select" as const,
  options: [
    { value: "view", label: "When it scrolls into view" },
    { value: "click", label: "When a visitor clicks (more private)" }
  ],
  hint: "Until then nothing is loaded from the platform (no cookies or tracking)."
};

const CLOCK_FIELD = {
  key: "clock",
  label: "Clock",
  kind: "select" as const,
  options: [
    { value: "12", label: "12-hour (7:00 PM)" },
    { value: "24", label: "24-hour (19:00)" }
  ]
};

function Poster({ platform, open, noun, click }: { platform: Platform; open: string; noun: string; click: boolean }) {
  return (
    <a className="embed-poster b-embed-poster" href={open} target="_blank" rel="noopener noreferrer" style={brandStyle(platform)}>
      <Icon platform={platform} size={30} />
      <span>
        {platform.label} {noun}
      </span>
      <span className="b-embed-show">{click ? `Show ${noun}` : `View on ${platform.label} ↗`}</span>
    </a>
  );
}

export const socialDefinitions: BlockDefinition[] = [
  {
    type: "social-links",
    badges: ["free"],
    label: "Social links",
    category: "Social",
    icon: "🔗",
    description: "Your profiles as icons, pills or big buttons (a link-in-bio page). Icons are picked from each link.",
    defaultSize: { w: 4, h: 3 },
    defaultProps: {
      links: [
        { url: "https://www.instagram.com/yourname", label: "" },
        { url: "https://www.youtube.com/@yourname", label: "" },
        { url: "https://discord.gg/yourinvite", label: "" }
      ],
      style: "icons",
      colors: "theme",
      size: "m",
      align: "left"
    },
    fields: [
      {
        key: "links",
        label: "Links",
        kind: "list",
        itemLabel: "link",
        itemTitleKey: "url",
        newItem: { url: "https://", label: "" },
        itemFields: [
          { key: "url", label: "Link", kind: "text", placeholder: "https://instagram.com/you", hint: "Any profile, shop or page; mailto:you@… for email." },
          { key: "label", label: "Label (optional)", kind: "text", placeholder: "Uses the platform's name" }
        ]
      },
      {
        key: "style",
        label: "Show as",
        kind: "select",
        options: [
          { value: "icons", label: "Icons" },
          { value: "pills", label: "Icons with names" },
          { value: "buttons", label: "Big buttons, one per line (link in bio)" }
        ]
      },
      {
        key: "colors",
        label: "Colours",
        kind: "select",
        options: [
          { value: "theme", label: "The site's colours" },
          { value: "brand", label: "Each platform's colour" },
          { value: "plain", label: "Plain (text colour)" }
        ]
      },
      {
        key: "size",
        label: "Size",
        kind: "select",
        options: [
          { value: "s", label: "Small" },
          { value: "m", label: "Medium" },
          { value: "l", label: "Large" }
        ]
      },
      alignField
    ],
    mobileHeight: "content",
    grows: true,
    render: (p) => {
      const links = list(p.links).filter((l) => /^(https:\/\/|mailto:)/i.test(str(l.url).trim()));
      if (!links.length) return <span className="b-service-hint">Add your profile links in the inspector.</span>;
      const style = str(p.style, "icons");
      return (
        <ul className={`b-social b-social--${style} b-social--${str(p.size, "m")} b-social--${str(p.colors, "theme")}`} style={{ justifyContent: FLEX_ALIGN[str(p.align, "left")] }}>
          {links.map((l, i) => {
            const url = str(l.url).trim();
            const pl = platformFor(url);
            const label = str(l.label).trim() || pl.label;
            return (
              <li key={i}>
                <a href={url} target={url.startsWith("mailto:") ? undefined : "_blank"} rel="me noopener noreferrer" aria-label={style === "icons" ? label : undefined} title={style === "icons" ? label : undefined} style={brandStyle(pl)}>
                  <Icon platform={pl} />
                  {style !== "icons" && <span>{label}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      );
    }
  },
  {
    type: "social-post",
    label: "Social post",
    category: "Social",
    icon: "📰",
    description: "Show a post, reel, video or track from X, Instagram, TikTok, Bluesky, Mastodon, Facebook, Spotify, SoundCloud or a Twitch clip.",
    defaultSize: { w: 5, h: 22 },
    defaultProps: { url: "", load: "view", height: 0, align: "center" },
    fields: [
      { key: "url", label: "Link to the post", kind: "text", placeholder: "https://www.instagram.com/p/…", hint: "Copy the post's link (Share → Copy link). Bluesky: ⋯ → Embed post → copy, and paste the code here." },
      LOAD_FIELD,
      { key: "height", label: "Height (px)", kind: "range", min: 0, max: 1000, step: 10, hint: "0 uses a size that suits the platform." },
      alignField
    ],
    mobileHeight: "content",
    grows: true,
    render: (p, ctx) => {
      const e = parseEmbed(str(p.url));
      if (!e) return ctx.isEditor ? <div className="b-booking b-booking--empty">Paste a link to a post (X, Instagram, TikTok, Bluesky, Mastodon, Facebook, Spotify, SoundCloud, YouTube or a Twitch clip).</div> : null;
      const height = num(p.height, 0) || e.height;
      const click = str(p.load) === "click";
      const style: CSSProperties = { height: height || undefined, aspectRatio: height ? undefined : "16 / 9", marginInline: str(p.align, "center") === "center" ? "auto" : str(p.align) === "right" ? "0 0 auto auto" : undefined };
      if (ctx.isEditor && !ctx.isPreview)
        return (
          <div className="b-social-post b-booking-placeholder" style={{ ...style, height: height || undefined }}>
            <Icon platform={e.platform} size={28} /> The {e.platform.label} {e.noun} shows here on the site.
          </div>
        );
      return (
        <div className={`b-social-post b-social-post--${e.kind}`} style={e.kind === "x" ? { marginInline: style.marginInline } : style} data-js="social-embed" data-kind={e.kind} data-src={e.src} data-twitch={e.twitch ? "1" : undefined} data-load={click ? "click" : "view"} data-title={`${e.platform.label} ${e.noun}`}>
          <Poster platform={e.platform} open={e.open} noun={e.noun} click={click} />
        </div>
      );
    }
  },
  {
    type: "stream",
    label: "Live stream",
    category: "Social",
    icon: "🔴",
    description: "Your Twitch, YouTube or Kick channel's player (it shows the stream when you're live), with Twitch chat if you like.",
    defaultSize: { w: 12, h: 22 },
    defaultProps: { provider: "twitch", channel: "", chat: false, load: "view" },
    fields: [
      {
        key: "provider",
        label: "Where you stream",
        kind: "select",
        options: [
          { value: "twitch", label: "Twitch" },
          { value: "youtube", label: "YouTube" },
          { value: "kick", label: "Kick" }
        ]
      },
      { key: "channel", label: "Channel", kind: "text", placeholder: "Twitch/Kick: your name · YouTube: channel ID (UC…)", hint: "YouTube: Studio → Settings → Channel → Advanced settings → Channel ID. When you're not live, Twitch and Kick show your channel; YouTube shows that nothing is live." },
      { key: "chat", label: "Show Twitch chat next to it", kind: "toggle", showWhen: { key: "provider", is: ["twitch"] } },
      LOAD_FIELD
    ],
    mobileHeight: "content",
    render: (p, ctx) => {
      const s = parseStream(str(p.provider, "twitch"), str(p.channel), Boolean(p.chat));
      if (!s) return ctx.isEditor ? <div className="b-booking b-booking--empty">Enter your channel name (or YouTube channel ID).</div> : null;
      const click = str(p.load) === "click";
      if (ctx.isEditor && !ctx.isPreview)
        return (
          <div className={`b-stream${s.chat ? " b-stream--chat" : ""}`}>
            <div className="b-booking-placeholder b-stream-player">
              <Icon platform={s.platform} size={28} /> Your {s.platform.label} player shows here on the site.
            </div>
            {s.chat && <div className="b-booking-placeholder b-stream-chat">Chat</div>}
          </div>
        );
      return (
        <div className={`b-stream${s.chat ? " b-stream--chat" : ""}`}>
          <div className="b-stream-player" data-js="social-embed" data-kind="iframe" data-src={s.player} data-twitch={s.twitch ? "1" : undefined} data-load={click ? "click" : "view"} data-title={`${s.platform.label} stream`}>
            <Poster platform={s.platform} open={s.open} noun="stream" click={click} />
          </div>
          {s.chat && <div className="b-stream-chat" data-js="social-embed" data-kind="iframe" data-src={s.chat} data-twitch="1" data-load={click ? "click" : "view"} data-title="Twitch chat" />}
        </div>
      );
    }
  },
  {
    type: "schedule",
    badges: ["free", "noServer"],
    label: "Schedule",
    category: "Social",
    icon: "🗓",
    description: "A weekly schedule (streams, classes, opening hours): shown in each visitor's own time too, with Add to calendar.",
    defaultSize: { w: 6, h: 10 },
    defaultProps: {
      heading: "Stream schedule",
      slots: [
        { day: "mon", time: "19:00", length: 120, title: "Just chatting" },
        { day: "wed", time: "19:00", length: 180, title: "Game night" },
        { day: "sat", time: "15:00", length: 180, title: "Art stream" }
      ],
      tz: localZone(),
      clock: "12",
      yourTime: true,
      calendar: true,
      link: ""
    },
    fields: [
      { key: "heading", label: "Heading", kind: "text" },
      {
        key: "slots",
        label: "Times",
        kind: "list",
        itemLabel: "time",
        itemTitleKey: "title",
        newItem: { day: "fri", time: "20:00", length: 120, title: "Stream" },
        itemFields: [
          { key: "day", label: "Day", kind: "select", options: DAYS.map((d) => ({ value: d, label: DAY_LABEL[d] })) },
          { key: "time", label: "Starts (24-hour, e.g. 19:30)", kind: "text", placeholder: "19:30" },
          { key: "length", label: "Length (minutes)", kind: "number", min: 5, max: 1440 },
          { key: "title", label: "What", kind: "text" }
        ]
      },
      { key: "tz", label: "Your time zone", kind: "text", placeholder: "America/New_York", hint: "Filled in from this computer. Use the names at en.wikipedia.org/wiki/List_of_tz_database_time_zones." },
      CLOCK_FIELD,
      { key: "yourTime", label: "Also show each visitor's own time", kind: "toggle" },
      { key: "calendar", label: "Add to calendar links", kind: "toggle" },
      { key: "link", label: "Where to watch (for calendar entries)", kind: "text", placeholder: "https://www.twitch.tv/you" }
    ],
    mobileHeight: "content",
    grows: true,
    inlineEdit: [{ key: "heading", selector: ".b-schedule-heading", mode: "plain", lines: "single" }],
    render: (p, ctx) => {
      const tz = validZone(str(p.tz)) ? str(p.tz) : "UTC";
      const clock = str(p.clock, "12") === "24" ? "24" : "12";
      const zone = zoneLabel(tz);
      const slots = list(p.slots).filter((s) => (DAYS as readonly string[]).includes(str(s.day)) && CLOCK.test(str(s.time)));
      const link = /^https:\/\//.test(str(p.link)) ? str(p.link) : undefined;
      return (
        <div className="b-schedule">
          {str(p.heading) && <p className="b-schedule-heading">{str(p.heading)}</p>}
          {slots.length === 0 && ctx.isEditor && <span className="b-service-hint">Add times in the inspector.</span>}
          <ul>
            {slots.map((s, i) => {
              const day = str(s.day) as (typeof DAYS)[number];
              const time = str(s.time).padStart(5, "0");
              const start = `${nextDay(day)}T${time}`;
              const event = { title: str(s.title) || str(p.heading) || "Stream", start, end: addMinutes(start, num(s.length, 60)), tz, url: link, weekly: day };
              return (
                <li key={i}>
                  <span className="b-schedule-day">{DAY_LABEL[day]}</span>
                  <span className="b-schedule-time">
                    {clockLabel(time, clock)} <small>{zone}</small>
                    {p.yourTime !== false && <span className="b-schedule-local" data-js="localtime" data-day={DAYS.indexOf(day)} data-time={time} data-tz={tz} data-clock={clock} />}
                  </span>
                  <span className="b-schedule-title">{str(s.title)}</span>
                  {p.calendar !== false && (
                    <span className="b-schedule-cal">
                      <a href={icsHref(event)} download={`${(event.title || "event").replace(/[^\w-]+/g, "-").toLowerCase()}.ics`} title="Add to your calendar (Apple, Outlook, phone)">
                        + Calendar
                      </a>
                      <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" title="Add to Google Calendar">
                        Google
                      </a>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      );
    }
  },
  {
    type: "support",
    badges: ["account"],
    label: "Support me",
    category: "Social",
    icon: "☕",
    description: "A button for tips and memberships: Ko-fi, Buy Me a Coffee, Patreon, GitHub Sponsors, Liberapay or Open Collective.",
    defaultSize: { w: 4, h: 3 },
    defaultProps: { provider: "kofi", account: "", label: "", colors: "brand", size: "m", align: "left" },
    fields: [
      { key: "provider", label: "With", kind: "select", options: Object.entries(SUPPORT).map(([value, s]) => ({ value, label: s.label })) },
      { key: "account", label: "Your page or username", kind: "text", placeholder: "yourname or https://ko-fi.com/yourname" },
      { key: "label", label: "Button label (optional)", kind: "text" },
      {
        key: "colors",
        label: "Colours",
        kind: "select",
        options: [
          { value: "brand", label: "The platform's colour" },
          { value: "theme", label: "The site's colours" }
        ]
      },
      {
        key: "size",
        label: "Size",
        kind: "select",
        options: [
          { value: "s", label: "Small" },
          { value: "m", label: "Medium" },
          { value: "l", label: "Large" }
        ]
      },
      alignField
    ],
    mobileHeight: "content",
    inlineEdit: [{ key: "label", selector: ".b-support-label", mode: "plain", lines: "single" }],
    render: (p, ctx) => {
      const provider = SUPPORT[str(p.provider, "kofi")] ? str(p.provider, "kofi") : "kofi";
      const url = supportUrl(provider, str(p.account));
      const pl = platformById(provider)!;
      if (!url && !ctx.isEditor) return null;
      return (
        <div className="b-button-wrap" style={{ justifyContent: FLEX_ALIGN[str(p.align, "left")] }}>
          <a className={`b-button b-button--solid b-button--${str(p.size, "m")} b-support${str(p.colors, "brand") === "brand" ? " b-support--brand" : ""}`} href={url ?? "#"} target="_blank" rel="noopener noreferrer" style={brandStyle(pl)}>
            <Icon platform={pl} />
            <span className="b-support-label">{str(p.label) || SUPPORT[provider].cta}</span>
          </a>
          {!url && <span className="b-service-hint">Add your {SUPPORT[provider].label} username.</span>}
        </div>
      );
    }
  },
  {
    type: "countdown",
    badges: ["free", "noServer"],
    label: "Countdown",
    category: "Social",
    icon: "⏳",
    description: "Days, hours, minutes and seconds to a launch, a drop or an event.",
    defaultSize: { w: 6, h: 5 },
    defaultProps: { at: `${new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)}T18:00`, tz: localZone(), done: "It's here!", seconds: true, align: "center" },
    fields: [
      { key: "at", label: "When (YYYY-MM-DD HH:MM, 24-hour)", kind: "text", placeholder: "2026-12-01 18:00" },
      { key: "tz", label: "Time zone", kind: "text", placeholder: "America/New_York" },
      { key: "done", label: "Text when it's time", kind: "text" },
      { key: "seconds", label: "Show seconds", kind: "toggle" },
      alignField
    ],
    mobileHeight: "content",
    render: (p, ctx) => {
      const at = str(p.at).trim().replace(" ", "T");
      if (!LOCAL_TIME.test(at)) return ctx.isEditor ? <span className="b-service-hint">Set the date as 2026-12-01 18:00.</span> : null;
      const tz = validZone(str(p.tz)) ? str(p.tz) : "UTC";
      const units = [
        ["d", "days"],
        ["h", "hours"],
        ["m", "minutes"],
        ...(p.seconds !== false ? [["s", "seconds"]] : [])
      ];
      return (
        <div className="b-countdown" data-js="countdown" data-at={at} data-tz={tz} data-done={str(p.done)} style={{ justifyContent: FLEX_ALIGN[str(p.align, "center")] }}>
          <div className="b-countdown-units" role="timer" aria-live="off">
            {units.map(([k, label]) => (
              <span key={k} className="b-countdown-unit">
                <strong data-unit={k}>–</strong>
                <small>{label}</small>
              </span>
            ))}
          </div>
          <p className="b-countdown-when">
            {dateLabel(at)} {zoneLabel(tz)}
          </p>
        </div>
      );
    }
  },
  {
    type: "qr",
    badges: ["free", "noServer"],
    label: "QR code",
    category: "Social",
    icon: "▦",
    description: "A QR code to any address: for flyers, posters, cards and stickers. Can count scans in your statistics.",
    defaultSize: { w: 3, h: 7 },
    defaultProps: { url: "", track: true, campaign: "", fg: "#000000", bg: "#ffffff", label: "" },
    fields: [
      { key: "url", label: "Address", kind: "text", placeholder: "https://yoursite.com", hint: "Use the full address. Scan it with your phone before printing." },
      { key: "track", label: "Count scans in your visitor statistics", kind: "toggle", hint: "Adds ?utm_source=qr to the address, so Plausible, Umami and others show visits from the QR code." },
      { key: "campaign", label: "Name for the statistics (optional)", kind: "text", placeholder: "spring-flyer" },
      { key: "fg", label: "Colour", kind: "color", hint: "Keep it dark on light: scanners need the contrast." },
      { key: "bg", label: "Background", kind: "color" },
      { key: "label", label: "Text under it (optional)", kind: "text", placeholder: "Scan for the menu" }
    ],
    mobileHeight: "keep",
    render: (p, ctx) => {
      let url = str(p.url).trim();
      if (!/^https?:\/\/\S+$/.test(url)) return ctx.isEditor ? <div className="b-booking b-booking--empty">Enter the address the code opens.</div> : null;
      if (p.track !== false && !/[?&]utm_source=/.test(url)) {
        const u = new URL(url);
        u.searchParams.set("utm_source", "qr");
        u.searchParams.set("utm_medium", "print");
        if (str(p.campaign).trim()) u.searchParams.set("utm_campaign", str(p.campaign).trim());
        url = u.toString();
      }
      const qr = qrcode(0, "M");
      qr.addData(url, "Byte");
      qr.make();
      const n = qr.getModuleCount();
      let d = "";
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
      return (
        <figure className="b-qr">
          <svg viewBox={`0 0 ${n + 4} ${n + 4}`} role="img" aria-label={`QR code: ${str(p.url).trim()}`} shapeRendering="crispEdges">
            <rect width={n + 4} height={n + 4} fill={str(p.bg) || "#ffffff"} />
            <path d={d} fill={str(p.fg) || "#000000"} />
          </svg>
          {str(p.label) && <figcaption>{str(p.label)}</figcaption>}
        </figure>
      );
    }
  },
  {
    type: "add-to-calendar",
    badges: ["free", "noServer"],
    label: "Add to calendar",
    category: "Social",
    icon: "📆",
    description: "Buttons that add an event to Apple, Google or Outlook calendars. On an Events list, fill it from each event.",
    defaultSize: { w: 4, h: 3 },
    defaultProps: { title: "Launch party", start: `${new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10)}T19:00`, length: 120, tz: localZone(), location: "", details: "", label: "Add to calendar", align: "left" },
    fields: [
      { key: "title", label: "Event", kind: "text", hint: "On an event page, use {{item.title}}." },
      { key: "start", label: "Starts (YYYY-MM-DD HH:MM)", kind: "text", placeholder: "2026-12-01 19:00", hint: "On an event page, e.g. {{item.date}} {{item.time}}." },
      { key: "length", label: "Length (minutes)", kind: "number", min: 5, max: 10080 },
      { key: "tz", label: "Time zone", kind: "text", placeholder: "America/New_York" },
      { key: "location", label: "Where", kind: "text", placeholder: "An address, or a link for online events" },
      { key: "details", label: "Details", kind: "textarea" },
      { key: "label", label: "Button label", kind: "text" },
      alignField
    ],
    mobileHeight: "content",
    render: (p, ctx) => {
      const start = str(p.start).trim().replace(" ", "T");
      if (!LOCAL_TIME.test(start)) return ctx.isEditor ? <span className="b-service-hint">Set when it starts: 2026-12-01 19:00.</span> : null;
      const event = { title: str(p.title) || "Event", start, end: addMinutes(start, num(p.length, 60)), tz: validZone(str(p.tz)) ? str(p.tz) : "", location: str(p.location), details: str(p.details), url: ctx.pageUrl };
      return (
        <div className="b-button-wrap b-addcal" style={{ justifyContent: FLEX_ALIGN[str(p.align, "left")] }}>
          <a className="b-button b-button--solid b-button--m" href={icsHref(event)} download={`${event.title.replace(/[^\w-]+/g, "-").toLowerCase()}.ics`}>
            {str(p.label, "Add to calendar")}
          </a>
          <a className="b-button b-button--ghost b-button--m" href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
            Google Calendar
          </a>
        </div>
      );
    }
  }
];
