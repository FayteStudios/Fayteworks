import {
  siApplemusic,
  siApplepodcasts,
  siArtstation,
  siBandcamp,
  siBehance,
  siBluesky,
  siBuymeacoffee,
  siDiscord,
  siDribbble,
  siEtsy,
  siFacebook,
  siGithub,
  siGithubsponsors,
  siInstagram,
  siItchdotio,
  siKick,
  siKofi,
  siLiberapay,
  siMastodon,
  siMedium,
  siOpencollective,
  siPatreon,
  siPinterest,
  siReddit,
  siSnapchat,
  siSoundcloud,
  siSpotify,
  siSteam,
  siSubstack,
  siTelegram,
  siThreads,
  siTiktok,
  siTumblr,
  siTwitch,
  siVimeo,
  siWhatsapp,
  siX,
  siYoutube
} from "simple-icons";

export interface Platform {
  id: string;
  label: string;
  path: string | null;
  color: string;
  host: RegExp;
}

const p = (id: string, label: string, icon: { path: string; hex: string } | null, host: RegExp, color?: string): Platform => ({ id, label, path: icon?.path ?? null, color: color ?? icon?.hex ?? "666666", host });

export const PLATFORMS: Platform[] = [
  p("youtube", "YouTube", siYoutube, /(^|\.)(youtube\.com|youtu\.be)$/),
  p("twitch", "Twitch", siTwitch, /(^|\.)twitch\.tv$/),
  p("kick", "Kick", siKick, /(^|\.)kick\.com$/),
  p("x", "X", siX, /(^|\.)(x\.com|twitter\.com)$/),
  p("instagram", "Instagram", siInstagram, /(^|\.)instagram\.com$/),
  p("tiktok", "TikTok", siTiktok, /(^|\.)tiktok\.com$/),
  p("bluesky", "Bluesky", siBluesky, /(^|\.)bsky\.app$/),
  p("threads", "Threads", siThreads, /(^|\.)threads\.(net|com)$/),
  p("facebook", "Facebook", siFacebook, /(^|\.)(facebook\.com|fb\.com)$/),
  p("linkedin", "LinkedIn", null, /(^|\.)linkedin\.com$/, "0A66C2"),
  p("discord", "Discord", siDiscord, /(^|\.)(discord\.gg|discord\.com)$/),
  p("reddit", "Reddit", siReddit, /(^|\.)reddit\.com$/),
  p("pinterest", "Pinterest", siPinterest, /(^|\.)pinterest\.[a-z.]+$/),
  p("snapchat", "Snapchat", siSnapchat, /(^|\.)snapchat\.com$/),
  p("telegram", "Telegram", siTelegram, /(^|\.)(t\.me|telegram\.me)$/),
  p("whatsapp", "WhatsApp", siWhatsapp, /(^|\.)(wa\.me|whatsapp\.com)$/),
  p("tumblr", "Tumblr", siTumblr, /(^|\.)tumblr\.com$/),
  p("github", "GitHub", siGithub, /(^|\.)github\.com$/),
  p("behance", "Behance", siBehance, /(^|\.)behance\.net$/),
  p("dribbble", "Dribbble", siDribbble, /(^|\.)dribbble\.com$/),
  p("artstation", "ArtStation", siArtstation, /(^|\.)artstation\.com$/),
  p("vimeo", "Vimeo", siVimeo, /(^|\.)vimeo\.com$/),
  p("spotify", "Spotify", siSpotify, /(^|\.)spotify\.com$/),
  p("applemusic", "Apple Music", siApplemusic, /(^|\.)music\.apple\.com$/),
  p("applepodcasts", "Apple Podcasts", siApplepodcasts, /(^|\.)podcasts\.apple\.com$/),
  p("soundcloud", "SoundCloud", siSoundcloud, /(^|\.)soundcloud\.com$/),
  p("bandcamp", "Bandcamp", siBandcamp, /(^|\.)bandcamp\.com$/),
  p("substack", "Substack", siSubstack, /(^|\.)substack\.com$/),
  p("medium", "Medium", siMedium, /(^|\.)medium\.com$/),
  p("patreon", "Patreon", siPatreon, /(^|\.)patreon\.com$/),
  p("kofi", "Ko-fi", siKofi, /(^|\.)ko-fi\.com$/),
  p("buymeacoffee", "Buy Me a Coffee", siBuymeacoffee, /(^|\.)(buymeacoffee\.com|buymeacoff\.ee)$/),
  p("githubsponsors", "GitHub Sponsors", siGithubsponsors, /^$/),
  p("liberapay", "Liberapay", siLiberapay, /(^|\.)liberapay\.com$/),
  p("opencollective", "Open Collective", siOpencollective, /(^|\.)opencollective\.com$/),
  p("etsy", "Etsy", siEtsy, /(^|\.)etsy\.com$/),
  p("itch", "itch.io", siItchdotio, /(^|\.)itch\.io$/),
  p("steam", "Steam", siSteam, /(^|\.)(steampowered\.com|steamcommunity\.com)$/),
  p("mastodon", "Mastodon", siMastodon, /^$/)
];

export const EMAIL: Platform = { id: "email", label: "Email", path: null, color: "666666", host: /^$/ };
export const WEBSITE: Platform = { id: "website", label: "Website", path: null, color: "666666", host: /^$/ };

export function platformFor(url: string): Platform {
  const u = url.trim();
  if (/^mailto:/i.test(u)) return EMAIL;
  let host = "";
  let path = "";
  try {
    const parsed = new URL(u);
    host = parsed.hostname.toLowerCase();
    path = parsed.pathname;
  } catch {
    return WEBSITE;
  }
  if (host === "github.com" && /^\/sponsors\//.test(path)) return PLATFORMS.find((x) => x.id === "githubsponsors")!;
  const known = PLATFORMS.find((x) => x.host.test(host));
  if (known) return known;
  if (/^\/@[\w.]+\/?$/.test(path) && !/(youtube|tiktok|medium)\./.test(host)) return PLATFORMS.find((x) => x.id === "mastodon")!;
  return WEBSITE;
}

export const platformById = (id: string): Platform | undefined => PLATFORMS.find((x) => x.id === id);

export const LINK_ICON = "M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a1 1 0 1 1 1.4 1.4L12 13.4a1 1 0 0 1-1.4 0Zm-2.8 5.3a4 4 0 0 1-2.8-6.9l2.1-2.1a1 1 0 0 1 1.4 1.4l-2.1 2.1a2 2 0 1 0 2.8 2.8l2.1-2.1a1 1 0 0 1 1.4 1.4l-2.1 2.1a4 4 0 0 1-2.8 1.3Zm8.5-6.4a1 1 0 0 1-.7-1.7l2.1-2.1a2 2 0 0 0-2.8-2.8l-2.1 2.1a1 1 0 0 1-1.4-1.4l2.1-2.1a4 4 0 0 1 5.6 5.6l-2.1 2.1a1 1 0 0 1-.7.3Z";
export const MAIL_ICON = "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2.4V17h16V7.4l-7.4 5.2a1 1 0 0 1-1.2 0L4 7.4ZM5.9 7l6.1 4.3L18.1 7H5.9Z";

export const iconPath = (pl: Platform) => pl.path ?? (pl.id === "email" ? MAIL_ICON : LINK_ICON);

export function isExampleLink(url: string): boolean {
  const u = url.trim();
  if (/yourname|yourinvite|yourshop|yoursite|yourchannel|example\.(com|org|net)/i.test(u)) return true;
  try {
    const parsed = new URL(u);
    return platformFor(u) !== WEBSITE && platformFor(u) !== EMAIL && /^\/?$/.test(parsed.pathname) && !parsed.search;
  } catch {
    return false;
  }
}
