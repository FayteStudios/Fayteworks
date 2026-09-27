import type { AnnounceService } from "../platform/desktop";

export interface Channel {
  id: string;
  label: string;
  icon: string;
  how: "direct" | "share" | "copy";
  limit?: number;
  linkWeight?: number;
  share?: (text: string, url: string) => string;
  connect?: { key: string; label: string; placeholder: string; secret?: boolean }[];
  help?: string;
}

const enc = encodeURIComponent;
const joined = (text: string, url: string) => [text, url].filter(Boolean).join("\n\n");

export const CHANNELS: Channel[] = [
  {
    id: "discord",
    label: "Discord",
    icon: "discord",
    how: "direct",
    limit: 2000,
    connect: [{ key: "webhook", label: "Webhook address", placeholder: "https://discord.com/api/webhooks/…", secret: true }],
    help: "In your server: Server Settings → Integrations → Webhooks → New Webhook, pick the channel (e.g. #announcements), then Copy Webhook URL."
  },
  {
    id: "bluesky",
    label: "Bluesky",
    icon: "bluesky",
    how: "direct",
    limit: 300,
    connect: [
      { key: "handle", label: "Your handle", placeholder: "you.bsky.social" },
      { key: "password", label: "App password", placeholder: "xxxx-xxxx-xxxx-xxxx", secret: true }
    ],
    help: "Use an app password, never your real one: Bluesky → Settings → Privacy and security → App passwords → Add."
  },
  {
    id: "mastodon",
    label: "Mastodon",
    icon: "mastodon",
    how: "direct",
    limit: 500,
    linkWeight: 23,
    connect: [
      { key: "server", label: "Your server", placeholder: "mastodon.social" },
      { key: "token", label: "Access token", placeholder: "From Preferences → Development", secret: true }
    ],
    help: "On your server: Preferences → Development → New application, name it FayteWorks, tick only write:statuses, save, then copy “Your access token”."
  },
  {
    id: "telegram",
    label: "Telegram channel",
    icon: "telegram",
    how: "direct",
    limit: 4096,
    connect: [
      { key: "token", label: "Bot token", placeholder: "123456:ABC…", secret: true },
      { key: "chat", label: "Channel", placeholder: "@yourchannel" }
    ],
    help: "Message @BotFather in Telegram, send /newbot and copy the token. Then add the bot to your channel as an admin that can post."
  },
  { id: "x", label: "X", icon: "x", how: "share", limit: 280, linkWeight: 23, share: (t, u) => `https://x.com/intent/post?text=${enc(t)}${u ? `&url=${enc(u)}` : ""}` },
  { id: "threads", label: "Threads", icon: "threads", how: "share", limit: 500, share: (t, u) => `https://www.threads.net/intent/post?text=${enc(joined(t, u))}` },
  { id: "facebook", label: "Facebook", icon: "facebook", how: "share", share: (_t, u) => `https://www.facebook.com/sharer/sharer.php?u=${enc(u)}`, help: "Facebook only takes the link; paste your text into the post it opens (it's copied for you)." },
  { id: "linkedin", label: "LinkedIn", icon: "linkedin", how: "share", share: (_t, u) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(u)}`, help: "LinkedIn only takes the link; paste your text into the post (it's copied for you)." },
  { id: "reddit", label: "Reddit", icon: "reddit", how: "share", share: (t, u) => `https://www.reddit.com/submit?url=${enc(u)}&title=${enc(t.split("\n")[0].slice(0, 300))}` },
  { id: "bluesky-share", label: "Bluesky (without connecting)", icon: "bluesky", how: "share", limit: 300, share: (t, u) => `https://bsky.app/intent/compose?text=${enc(joined(t, u))}` },
  { id: "whatsapp", label: "WhatsApp", icon: "whatsapp", how: "share", share: (t, u) => `https://wa.me/?text=${enc(joined(t, u))}` },
  { id: "email", label: "Email", icon: "email", how: "share", share: (t, u) => `mailto:?subject=${enc(t.split("\n")[0].slice(0, 120))}&body=${enc(joined(t, u))}` },
  { id: "instagram", label: "Instagram", icon: "instagram", how: "copy", limit: 2200, help: "Instagram doesn't let other apps post. The text is copied and the picture saved: open Instagram, make a post or story with the picture, paste the text, and put the link in your bio (a Link in bio page works well)." },
  { id: "tiktok", label: "TikTok", icon: "tiktok", how: "copy", limit: 2200, help: "TikTok doesn't let other apps post here. The text is copied and the picture saved for a photo post." }
];

export const DIRECT: AnnounceService[] = ["discord", "bluesky", "mastodon", "telegram"];

export function postLength(channel: Channel, text: string, url: string): number {
  const count = (s: string) => {
    const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<unknown> } }).Segmenter;
    return Seg ? [...new Seg(undefined, { granularity: "grapheme" }).segment(s)].length : [...s].length;
  };
  if (!url) return count(text);
  return count(text) + 2 + (channel.linkWeight ?? count(url));
}

export function trackedLink(url: string, source: string, campaign: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", source.replace(/-share$/, ""));
    u.searchParams.set("utm_medium", "social");
    if (campaign) u.searchParams.set("utm_campaign", campaign);
    return u.toString();
  } catch {
    return url;
  }
}
