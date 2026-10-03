import type { TierOverride } from "./responsive";

export const GRID_COLUMNS = 12;
export const ROW_HEIGHT = 24;
export const COLUMN_GAP = 16;

export type ListItem = Record<string, string | number | boolean>;
export type PropValue = string | number | boolean | ListItem[];
export type BlockProps = Record<string, PropValue>;

export interface Block {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layerId?: string;
  responsive?: { tablet?: TierOverride; phone?: TierOverride };
  motion?: BlockMotion;
  translations?: Record<string, BlockProps>;
  animations?: BlockAnimation[];
  sounds?: BlockSound[];
  orientation?: Orientation;
  name?: string;
  hidden?: boolean;
  locked?: boolean;
  valign?: "middle" | "bottom";
  overhang?: { top?: number; bottom?: number };
  hang?: { x?: number; y?: number };
  /** Reaches into the column gaps on both sides, so it touches the pieces beside it. */
  flush?: boolean;
  /** The part of the piece that touches things (see model/hitbox). */
  hitbox?: import("./hitbox").Hitbox;
  spot?: string;
  turn?: BlockTurn;
  ext?: Record<string, unknown>;
  props: BlockProps;
}

export interface BlockTurn {
  z?: number;
  x?: number;
  y?: number;
  depth?: number;
}

export type Orientation = "portrait" | "landscape";

export type AnimProp = "x" | "y" | "scale" | "rotate" | "tiltX" | "tiltY" | "opacity" | "blur" | "mask";

export interface AnimKey {
  t: number;
  v: number;
  ease?: string;
}

export interface AnimTrack {
  prop: AnimProp;
  keys: AnimKey[];
}

export type AnimTrigger = "load" | "view" | "scroll" | "hover" | "click" | "loop";

export interface BlockAnimation {
  id: string;
  name: string;
  trigger: AnimTrigger;
  source?: string;
  repeat?: boolean;
  scroll?: "view" | "page";
  duration: number;
  delay?: number;
  alternate?: boolean;
  origin?: { x: number; y: number };
  mask?: { shape: "circle" | "rect" | "diamond"; x: number; y: number };
  tracks: AnimTrack[];
}

export type SoundEvent = "click" | "hover" | "view";

export interface BlockSound {
  id: string;
  on: SoundEvent;
  src: string;
  volume: number;
  name?: string;
}

export interface BlockMotion {
  reveal?: "" | "fade" | "fade-up" | "zoom" | "slide-left" | "slide-right";
  delay?: number;
  hover?: "" | "lift" | "grow" | "glow" | "tilt";
  parallax?: number;
}

export interface Layer {
  id: string;
  name: string;
  hidden: boolean;
  locked: boolean;
}

export interface SectionSettings {
  background: string;
  backgroundImage: string;
  paddingY: number;
  fullBleed: boolean;
  minRows: number;
  sticky: boolean;
  backgroundMotion?: "" | "slow" | "strong" | "fixed";
}

export interface Section {
  id: string;
  name: string;
  settings: SectionSettings;
  layers: Layer[];
  layouts?: { tablet?: boolean; phone?: boolean; tabletMinRows?: number; phoneMinRows?: number };
  grid?: 2 | 3;
  /** How many screens wide the section is on a Sideways page. */
  screens?: number;
  card?: SectionCard;
  blocks: Block[];
}

export interface SectionCard {
  title?: string;
  subtitle?: string;
  label?: string;
  tag?: string;
  image?: string;
  link?: string;
}

export interface PageSeo {
  description: string;
  image: string;
}

export type ShellType = "scroll" | "slides" | "horizontal" | "sideways" | `card${string}`;

export interface PageShell {
  type: ShellType;
  dots?: boolean;
  intro?: boolean;
  [setting: string]: unknown;
}

export interface DesignFormat {
  kind: "print" | "social";
  preset: string;
  width: number;
  height: number;
  unit: "mm" | "in" | "px";
  bleed: number;
  folds: number;
}

export interface Page {
  id: string;
  title: string;
  slug: string;
  hideInNav: boolean;
  standalone?: boolean;
  shell?: PageShell;
  collectionId?: string;
  design?: DesignFormat;
  seo: PageSeo;
  sections: Section[];
  translations?: Record<string, { title?: string; description?: string }>;
  protect?: { password: string; hint?: string };
  styleId?: string;
}

export interface CustomFont {
  id: string;
  family: string;
  src: string;
  format: "woff2" | "woff" | "truetype" | "opentype";
  licence: "commercial" | "personal" | "unknown";
  from?: string;
  weight?: number;
}

export interface Theme {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  headingFont: string;
  bodyFont: string;
  radius: number;
  maxWidth: number;
}

export interface SiteSettings {
  lang: string;
  favicon: string;
  baseUrl: string;
}

export interface SiteServices {
  analytics?: { provider: "plausible" | "umami" | "cloudflare" | "fathom" | "google"; id: string; src?: string };
  snipcart?: { publicKey: string; currency?: string };
  memberstack?: { appId: string };
  chat?: { provider: "crisp" | "tawk"; id: string; widget?: string };
}

export const SCHEMA_VERSION = 3;

export interface Site {
  schemaVersion: typeof SCHEMA_VERSION;
  name: string;
  theme: Theme;
  settings: SiteSettings;
  header: Section | null;
  footer: Section | null;
  pages: Page[];
  components?: ComponentDef[];
  services?: SiteServices;
  clientMode?: { enabled: boolean; pinHash: string; salt: string; client?: string };
  languages?: { code: string; label: string }[];
  business?: Partial<import("../business/documents").BusinessInfo>;
  mediaCredits?: Record<string, { title: string; creator: string; license: string; source: string }>;
  guides?: Record<string, number[]>;
  collections?: Collection[];
  fonts?: CustomFont[];
  styles?: StyleSet[];
  extras?: Record<string, unknown>;
  companions?: Companion[];
  sprites?: SpriteSet[];
}

export interface SpriteState {
  id: string;
  name: string;
  frames: number[];
  fps: number;
  loop: boolean;
}

export interface SpriteSet {
  id: string;
  name: string;
  sheet: string;
  frameW: number;
  frameH: number;
  columns: number;
  rows: number;
  pixelated: boolean;
  states: SpriteState[];
  licence: "own" | "cc0" | "ccby" | "permission" | "reference";
  credit?: string;
  source?: string;
}

export interface Companion {
  id: string;
  type: string;
  props: BlockProps;
  pages?: string[];
}

export interface StyleSet {
  id: string;
  name: string;
  theme: Partial<Theme>;
}

export type CollectionFieldType = "text" | "longtext" | "markdown" | "number" | "image" | "link" | "date" | "boolean";

export interface CollectionField {
  key: string;
  label: string;
  type: CollectionFieldType;
}

export interface CollectionItem {
  id: string;
  slug: string;
  values: Record<string, string | number | boolean>;
}

export type DataSource =
  | { kind: "manual" }
  | { kind: "csv"; url?: string; file?: string; modified?: number; headers?: string[]; main?: "app" | "file"; savedHash?: string }
  | { kind: "json"; url: string; path?: string }
  | { kind: "sheets"; url: string; writeUrl?: string; writeKey?: string }
  | { kind: "github"; repo: string; path: string; branch?: string }
  | { kind: "airtable"; base: string; table: string; view?: string }
  | { kind: "notion"; database: string }
  | { kind: "supabase"; url: string; table: string }
  | { kind: "rest"; url: string; path?: string; header?: string };

export interface PodcastInfo {
  author: string;
  email: string;
  image: string;
  category: string;
  explicit: boolean;
  description?: string;
}

export interface Collection {
  id: string;
  name: string;
  fields: CollectionField[];
  items: CollectionItem[];
  source: DataSource;
  synced?: string;
  refreshOnPublish?: boolean;
  kind?: "posts";
  feed?: boolean;
  podcast?: PodcastInfo;
}

export interface ComponentDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  columns: number;
  section: Section;
  frame: BlockProps;
  fields: ComponentField[];
  variants?: ComponentVariant[];
  source?: string;
  libraryId?: string;
  /** A fixed shape (in design pixels): the design keeps it and scales as a whole wherever it's placed. */
  shape?: ComponentShape;
}

export interface ComponentShape {
  preset: string;
  w: number;
  h: number;
}

export interface ComponentVariant {
  id: string;
  name: string;
  section: Section;
  frame: BlockProps;
  /** Set when this design belongs to one item ("Customise this one"); that item uses it instead of the template. */
  item?: string;
}

export interface ComponentField {
  id: string;
  label: string;
  blockId: string;
  prop: string;
  variants?: string[];
}

export const PAGE_LINK_PREFIX = "page:";

export const BACK_TO_CARDS = "#cards";
