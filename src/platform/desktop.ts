export interface ProjectRef {
  path: string;
  name: string;
}

export interface OpenedProject extends ProjectRef {
  site: unknown;
}

export interface RecentProject extends ProjectRef {
  openedAt: string;
  exists: boolean;
}

export type PublishService = "netlify" | "github" | "cloudflare" | "shopify" | "wordpress" | "buttondown" | "plausible" | "umami" | AnnounceService | "updates" | `data:${string}`;

export type AnnounceService = "discord" | "bluesky" | "mastodon" | "telegram";

export interface SiteStats {
  visitors: number;
  pageviews: number;
  bounceRate: number;
  avgDuration: number;
  series: { date: string; value: number }[];
  pages: { name: string; value: number }[];
  sources: { name: string; value: number }[];
}

export interface ProjectConfig {
  netlify?: { siteId?: string; siteName?: string; url?: string };
  github?: { repo?: string; url?: string };
  cloudflare?: { accountId?: string; project?: string; url?: string };
  shopify?: { domain?: string; themeId?: number };
  wordpress?: { url?: string; user?: string };
}

export interface VectorApp {
  id: string;
  name: string;
  path: string;
}

export interface MediaApp {
  id: string;
  name: string;
  kind: "video" | "audio";
  path: string;
  opensFiles: boolean;
}

export interface CaptureVerdict {
  status: "open" | "own" | "reference";
  licence: string;
  licenceUrl?: string;
  reason: string;
  author: string;
  source: string;
  copyright: string;
}

export interface CaptureResult {
  verdict: CaptureVerdict;
  url: string;
  title: string;
  html: string;
  css: string;
  width: number;
  height: number;
  elements: number;
  truncated: boolean;
}

export interface DesktopApi {
  platform: "desktop";
  recentProjects(): Promise<RecentProject[]>;
  forgetProject(path: string): Promise<void>;
  openProject(path: string): Promise<OpenedProject>;
  createProject(parentDir: string, name: string, siteJson: string): Promise<OpenedProject>;
  closeProject(): Promise<void>;
  chooseFolder(title: string): Promise<string | null>;
  saveSite(siteJson: string): Promise<void>;
  putAsset(hash: string, ext: string, bytes: Uint8Array): Promise<void>;
  hasAsset(hash: string): Promise<boolean>;
  projectConfig(): Promise<ProjectConfig>;
  saveProjectConfig(config: ProjectConfig): Promise<void>;
  exportSite(files: { path: string; data: Uint8Array }[], chooseFolder: boolean): Promise<string | null>;
  showFolder(path?: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  hasToken(service: PublishService): Promise<boolean>;
  setToken(service: PublishService, token: string | null): Promise<void>;
  deployNetlify(options: { zip: Uint8Array; siteId?: string; siteName?: string }): Promise<{ siteId: string; url: string; adminUrl: string }>;
  deployGithub(options: { repo: string; files: { path: string; data: Uint8Array }[] }): Promise<{ url: string; repo: string }>;
  deployCloudflare(options: { accountId: string; project: string; files: { path: string; data: Uint8Array }[] }): Promise<{ project: string; url: string; deploymentUrl: string }>;
  captureFromWebsite(url: string, options?: { own?: boolean }): Promise<CaptureResult | null>;
  platformCall(name: "shopifyThemes", domain: string): Promise<{ id: number; name: string; role: string }[]>;
  platformCall(name: "shopifySections", domain: string, themeId: number): Promise<string[]>;
  platformCall(name: "shopifyGet", domain: string, themeId: number, key: string): Promise<string>;
  platformCall(name: "shopifyPut", domain: string, themeId: number, key: string, value: string): Promise<string>;
  platformCall(name: "wordpressPages", site: string, user: string): Promise<{ id: number; title: string; link: string; status: string }[]>;
  platformCall(name: "wordpressPattern", site: string, user: string, title: string, content: string): Promise<{ id: number; link: string }>;
  platformCall(name: "buttondownDraft", subject: string, body: string): Promise<{ id: string }>;
  platformCall(name: "netlifySubmissions", siteId: string): Promise<{ id: string; form: string; created: string; data: Record<string, string> }[]>;
  platformCall(name: "netlifyDeleteSubmission", id: string): Promise<boolean>;
  platformCall(name: "stats", provider: "plausible" | "umami", siteId: string, days: number): Promise<SiteStats>;
  platformCall(name: "announce", channel: AnnounceService, text: string, link: string): Promise<{ url: string }>;
  fetchData(collectionId: string, source: import("../model/types").DataSource): Promise<import("../data/sources").RawData>;
  /** A spreadsheet file chosen by the person, kept as a collection's main copy. */
  openDataFile(): Promise<{ path: string; text: string; modified: number } | null>;
  readDataFile(path: string): Promise<{ path: string; text: string; modified: number }>;
  dataFileModified(path: string): Promise<number | null>;
  writeDataFile(path: string, text: string): Promise<number>;
  saveDataFileAs(name: string, text: string): Promise<{ path: string; modified: number } | null>;
  listVersions(): Promise<VersionMeta[]>;
  saveVersion(meta: { label: string; kind: VersionMeta["kind"]; pages: number }, siteJson: string): Promise<VersionMeta>;
  readVersion(id: string): Promise<string>;
  deleteVersion(id: string): Promise<void>;
  checkLinks(urls: string[]): Promise<{ url: string; status: number; ok: boolean; error?: string }[]>;
  openHtml(html: string): Promise<void>;
  mediaApps(): Promise<MediaApp[]>;
  editMedia(blockId: string, name: string, bytes: Uint8Array, appPath: string | null): Promise<{ folder: string; exportDir: string; original: string }>;
  stopEditingMedia(blockId: string): Promise<void>;
  onMediaChanged(callback: (change: { blockId: string; name: string; type: string; data: Uint8Array }) => void): () => void;
  printDesignPdf(html: string, fileName: string): Promise<string | null>;
  vectorApps(): Promise<VectorApp[]>;
  chooseVectorApp(): Promise<string | null>;
  editDrawing(blockId: string, svg: string, appPath: string | null): Promise<string>;
  stopEditingDrawing(blockId: string): Promise<void>;
  onDrawingChanged(callback: (change: { blockId: string; svg: string }) => void): () => void;
  appVersion(): Promise<string>;
  installUpdate(): Promise<void>;
  checkUpdates(): Promise<void>;
  fetchFile(url: string): Promise<{ url: string; type: string; name: string; bytes?: Uint8Array; html?: string }>;
  onUpdateNeedsKey(callback: (info: { repo: string }) => void): () => void;
  onUpdateReady(callback: (info: { version: string }) => void): () => void;
}

export const desktop: DesktopApi | undefined = (window as unknown as { desktop?: DesktopApi }).desktop;
export const isDesktop = Boolean(desktop);

export interface VersionMeta {
  id: string;
  at: string;
  label: string;
  kind: "auto" | "manual" | "publish" | "restore";
  pages: number;
  bytes?: number;
}
