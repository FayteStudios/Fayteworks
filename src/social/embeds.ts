import { platformFor, platformById, type Platform } from "./platforms";

export interface Embed {
  platform: Platform;
  kind: "iframe" | "x";
  src: string;
  twitch?: boolean;
  open: string;
  height: number;
  noun: string;
}

const enc = encodeURIComponent;

export function parseEmbed(input: string): Embed | null {
  const raw = input.trim();
  const at = raw.match(/at:\/\/(did:[a-z]+:[\w.:%-]+)\/app\.bsky\.feed\.post\/([\w]+)/);
  if (at) return { platform: platformById("bluesky")!, kind: "iframe", src: `https://embed.bsky.app/embed/${at[1]}/app.bsky.feed.post/${at[2]}`, open: `https://bsky.app/profile/${at[1]}/post/${at[2]}`, height: 420, noun: "post" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^(www|m|mobile)\./, "");
  const path = url.pathname;
  const platform = platformFor(raw);
  let m: RegExpMatchArray | null;

  if (/^(x|twitter)\.com$/.test(host) && (m = path.match(/^\/\w{1,15}\/status\/(\d{5,25})/))) return { platform, kind: "x", src: m[1], open: `https://x.com/i/status/${m[1]}`, height: 0, noun: "post" };
  if (host === "instagram.com" && (m = path.match(/^\/(p|reel|tv)\/([\w-]{5,40})/))) return { platform, kind: "iframe", src: `https://www.instagram.com/${m[1]}/${m[2]}/embed/`, open: `https://www.instagram.com/${m[1]}/${m[2]}/`, height: 640, noun: m[1] === "reel" ? "reel" : "post" };
  if (host === "tiktok.com" && (m = path.match(/^\/@[\w.-]+\/video\/(\d{5,25})/))) return { platform, kind: "iframe", src: `https://www.tiktok.com/embed/v2/${m[1]}`, open: raw, height: 740, noun: "video" };
  if (host === "bsky.app" && (m = path.match(/^\/profile\/(did:[a-z]+:[\w.:%-]+)\/post\/(\w+)/))) return { platform, kind: "iframe", src: `https://embed.bsky.app/embed/${m[1]}/app.bsky.feed.post/${m[2]}`, open: raw, height: 420, noun: "post" };
  if (host === "open.spotify.com" && (m = path.match(/^\/(?:intl-[\w-]+\/)?(track|album|playlist|episode|show|artist)\/(\w{10,40})/)))
    return { platform, kind: "iframe", src: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, open: raw, height: m[1] === "track" || m[1] === "episode" ? 152 : 380, noun: m[1] };
  if (host === "soundcloud.com" && /^\/[\w-]+\/[\w-]+/.test(path)) return { platform, kind: "iframe", src: `https://w.soundcloud.com/player/?url=${enc(`https://soundcloud.com${path}`)}&visual=false`, open: raw, height: /\/sets\//.test(path) ? 450 : 166, noun: /\/sets\//.test(path) ? "playlist" : "track" };
  if (host === "facebook.com" && /\/(posts|videos|photos|permalink\.php)/.test(path)) return { platform, kind: "iframe", src: `https://www.facebook.com/plugins/post.php?href=${enc(raw)}&show_text=true&width=500`, open: raw, height: 620, noun: "post" };
  if ((m = raw.match(/^https:\/\/((?:www\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/))) return { platform, kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${m[2]}`, open: raw, height: 0, noun: "video" };
  if (host === "clips.twitch.tv" && (m = path.match(/^\/([\w-]{3,100})/))) return { platform, kind: "iframe", src: `https://clips.twitch.tv/embed?clip=${m[1]}`, twitch: true, open: raw, height: 0, noun: "clip" };
  if (host === "twitch.tv" && (m = path.match(/^\/[\w]+\/clip\/([\w-]{3,100})/))) return { platform, kind: "iframe", src: `https://clips.twitch.tv/embed?clip=${m[1]}`, twitch: true, open: raw, height: 0, noun: "clip" };
  if (host === "twitch.tv" && (m = path.match(/^\/videos\/(\d+)/))) return { platform, kind: "iframe", src: `https://player.twitch.tv/?video=${m[1]}&autoplay=false`, twitch: true, open: raw, height: 0, noun: "video" };
  if ((m = raw.match(/^https:\/\/([\w.-]+\.[a-z]{2,})\/@[\w.@-]+\/(\d{5,25})\/?$/))) return { platform: platformById("mastodon")!, kind: "iframe", src: `${raw.replace(/\/$/, "")}/embed`, open: raw, height: 420, noun: "post" };
  return null;
}

export interface StreamEmbed {
  platform: Platform;
  player: string;
  chat?: string;
  twitch?: boolean;
  open: string;
}

export function parseStream(provider: string, channel: string, withChat: boolean): StreamEmbed | null {
  const c = channel.trim();
  if (provider === "youtube") {
    const id = c.match(/(UC[\w-]{22})/)?.[1];
    return id ? { platform: platformById("youtube")!, player: `https://www.youtube.com/embed/live_stream?channel=${id}`, open: `https://www.youtube.com/channel/${id}/live` } : null;
  }
  const name = (c.match(/^https:\/\/(?:www\.)?(?:twitch\.tv|kick\.com)\/([\w-]{2,40})\/?$/)?.[1] ?? c).replace(/^@/, "");
  if (!/^[\w-]{2,40}$/.test(name)) return null;
  if (provider === "kick") return { platform: platformById("kick")!, player: `https://player.kick.com/${name}`, open: `https://kick.com/${name}` };
  return {
    platform: platformById("twitch")!,
    player: `https://player.twitch.tv/?channel=${name}&autoplay=false`,
    chat: withChat ? `https://www.twitch.tv/embed/${name}/chat?darkpopout` : undefined,
    twitch: true,
    open: `https://www.twitch.tv/${name}`
  };
}

export const SUPPORT: Record<string, { label: string; url: (name: string) => string; re: RegExp; cta: string }> = {
  kofi: { label: "Ko-fi", url: (n) => `https://ko-fi.com/${n}`, re: /^https:\/\/(www\.)?ko-fi\.com\/[\w-]+\/?$/, cta: "Support me on Ko-fi" },
  buymeacoffee: { label: "Buy Me a Coffee", url: (n) => `https://buymeacoffee.com/${n}`, re: /^https:\/\/(www\.)?buymeacoffee\.com\/[\w-]+\/?$/, cta: "Buy me a coffee" },
  patreon: { label: "Patreon", url: (n) => `https://www.patreon.com/${n}`, re: /^https:\/\/(www\.)?patreon\.com\/(c\/)?[\w-]+\/?$/, cta: "Become a member on Patreon" },
  githubsponsors: { label: "GitHub Sponsors", url: (n) => `https://github.com/sponsors/${n}`, re: /^https:\/\/github\.com\/sponsors\/[\w-]+\/?$/, cta: "Sponsor on GitHub" },
  liberapay: { label: "Liberapay", url: (n) => `https://liberapay.com/${n}`, re: /^https:\/\/(www\.)?liberapay\.com\/[\w-]+\/?$/, cta: "Donate on Liberapay" },
  opencollective: { label: "Open Collective", url: (n) => `https://opencollective.com/${n}`, re: /^https:\/\/(www\.)?opencollective\.com\/[\w-]+\/?$/, cta: "Back us on Open Collective" }
};

export function supportUrl(provider: string, input: string): string | null {
  const s = SUPPORT[provider];
  if (!s) return null;
  const v = input.trim();
  if (s.re.test(v)) return v;
  const name = v.replace(/^@/, "");
  return /^[\w-]{2,60}$/.test(name) ? s.url(name) : null;
}
