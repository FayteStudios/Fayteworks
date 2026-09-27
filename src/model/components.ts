import type { CSSProperties } from "react";
import { getBlockDefinition } from "../blocks/registry";
import { createId } from "../util/id";
import { createBlock, createSection } from "./factory";
import { gridOf } from "./grid";
import type { FieldDef } from "./fields";
import { GRID_COLUMNS, ROW_HEIGHT, type ComponentVariant, type Site, type Block, type BlockProps, type ComponentDef, type ComponentField, type PropValue, type Section, type Theme } from "./types";

export const COMPONENT_COLUMN_GAP = 8;

export const FRAME = "frame";

export const FRAME_FIELDS: FieldDef[] = [
  { key: "fill", label: "Fill", kind: "color", hint: "Any CSS colour or gradient. Empty for none." },
  { key: "image", label: "Background image", kind: "image" },
  { key: "textColor", label: "Text colour", kind: "color" },
  { key: "padding", label: "Padding", kind: "range", min: 0, max: 64 },
  { key: "radius", label: "Corner radius", kind: "range", min: 0, max: 48 },
  { key: "borderWidth", label: "Border width", kind: "range", min: 0, max: 8 },
  { key: "borderColor", label: "Border colour", kind: "color" },
  {
    key: "shadow",
    label: "Shadow",
    kind: "select",
    options: [
      { value: "", label: "None" },
      { value: "soft", label: "Soft" },
      { value: "strong", label: "Strong" },
      { value: "glow", label: "Accent glow" }
    ]
  },
  {
    key: "align",
    label: "Pieces sit at the",
    kind: "select",
    options: [
      { value: "start", label: "Top" },
      { value: "center", label: "Middle" },
      { value: "end", label: "Bottom" }
    ],
    hint: "When a placed copy is taller than the pieces need."
  },
  { key: "href", label: "Link (whole component)", kind: "link", hint: "Makes the component clickable. Links inside it still work." }
];

export const DEFAULT_FRAME: BlockProps = {
  fill: "var(--surface)",
  image: "",
  textColor: "",
  padding: 20,
  radius: 16,
  borderWidth: 0,
  borderColor: "",
  shadow: "soft",
  align: "start",
  href: ""
};

export function findComponent(components: ComponentDef[] | undefined, id: unknown): ComponentDef | undefined {
  return components?.find((c) => c.id === id);
}

export function componentRows(def: ComponentDef, section: Section = def.section): number {
  return Math.max(1, section.settings.minRows, ...section.blocks.map((b) => b.y + b.h));
}

export function variantOf(def: ComponentDef, variantId: unknown): { section: Section; frame: BlockProps; variant?: ComponentVariant } {
  const variant = variantId ? def.variants?.find((v) => v.id === variantId) : undefined;
  return variant ? { section: variant.section, frame: variant.frame, variant } : { section: def.section, frame: def.frame };
}

export function designsOf(def: ComponentDef): { id: string; name: string; section: Section; frame: BlockProps }[] {
  return [{ id: "", name: "Default", section: def.section, frame: def.frame }, ...(def.variants ?? [])];
}

export function createVariant(def: ComponentDef, name: string, from: { section: Section; frame: BlockProps }): ComponentVariant {
  const section = structuredClone(from.section);
  section.id = createId("sec");
  return { id: createId("var"), name, section, frame: structuredClone(from.frame) };
}

export function designWidth(def: ComponentDef, theme: Theme, screenWidth = theme.maxWidth, phone = false): number {
  const content = Math.max(240, Math.min(screenWidth, theme.maxWidth) - 48);
  if (phone) return Math.round(content);
  const column = (content - 16 * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  return Math.round(def.columns * column + (def.columns - 1) * 16);
}

export function placedSize(def: ComponentDef): { w: number; h: number } {
  const padding = Number(def.frame.padding ?? 0);
  const height = componentRows(def) * gridOf(def.section).rowHeight + padding * 2;
  return { w: def.columns, h: Math.max(2, Math.ceil(height / ROW_HEIGHT)) };
}

export function fieldDefFor(def: ComponentDef, field: ComponentField, site?: Site): FieldDef | null {
  let base: FieldDef | undefined;
  if (field.blockId === FRAME) {
    base = FRAME_FIELDS.find((f) => f.key === field.prop);
  } else {
    const block = designsOf(def)
      .map((d) => d.section.blocks.find((b) => b.id === field.blockId))
      .find(Boolean);
    const blockDef = block && getBlockDefinition(block.type);
    base = blockDef && [...(blockDef.extraFields?.(block.props, site) ?? []), ...blockDef.fields].find((f) => f.key === field.prop);
  }
  return base ? { ...base, key: field.id, label: field.label, hint: undefined } : null;
}

export function fieldDefault(def: ComponentDef, field: ComponentField): PropValue | undefined {
  if (field.blockId === FRAME) return def.frame[field.prop] ?? DEFAULT_FRAME[field.prop];
  return def.section.blocks.find((b) => b.id === field.blockId)?.props[field.prop];
}

export function fieldsFor(def: ComponentDef, variantId: unknown): ComponentField[] {
  const design = typeof variantId === "string" && def.variants?.some((v) => v.id === variantId) ? variantId : "";
  return def.fields.filter((f) => !f.variants || f.variants.includes(design));
}

export function designsWithPiece(def: ComponentDef, blockId: string): string[] | undefined {
  if (blockId === FRAME) return undefined;
  const all = designsOf(def);
  const having = all.filter((d) => d.section.blocks.some((b) => b.id === blockId)).map((d) => d.id);
  return having.length === all.length ? undefined : having;
}

export function resolveComponent(def: ComponentDef, values: BlockProps): { blocks: Block[]; frame: BlockProps; section: Section } {
  const design = variantOf(def, values.variant);
  const frame = { ...DEFAULT_FRAME, ...design.frame };
  const overrides = new Map<string, BlockProps>();
  for (const field of fieldsFor(def, values.variant)) {
    if (!(field.id in values)) continue;
    if (field.blockId === FRAME) frame[field.prop] = values[field.id];
    else overrides.set(field.blockId, { ...overrides.get(field.blockId), [field.prop]: values[field.id] });
  }
  const blocks = design.section.blocks.map((b) => (overrides.has(b.id) ? { ...b, props: { ...b.props, ...overrides.get(b.id) } } : b));
  return { blocks, frame, section: design.section };
}

const SHADOWS: Record<string, string> = {
  soft: "0 1px 2px rgb(0 0 0 / 0.06), 0 14px 36px -14px rgb(0 0 0 / 0.28)",
  strong: "0 2px 4px rgb(0 0 0 / 0.1), 0 28px 60px -18px rgb(0 0 0 / 0.5)",
  glow: "0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent), 0 12px 40px -10px color-mix(in srgb, var(--accent) 55%, transparent)"
};

export function frameStyle(frame: BlockProps, asset: (src: string) => string): CSSProperties {
  const image = String(frame.image ?? "");
  const fill = String(frame.fill ?? "");
  const borderWidth = Number(frame.borderWidth ?? 0);
  return {
    background: [image && `url("${asset(image)}") center / cover no-repeat`, fill].filter(Boolean).join(", ") || undefined,
    color: String(frame.textColor ?? "") || undefined,
    padding: `${Number(frame.padding ?? 0)}px`,
    borderRadius: `${Number(frame.radius ?? 0)}px`,
    border: borderWidth > 0 ? `${borderWidth}px solid ${String(frame.borderColor ?? "") || "currentColor"}` : undefined,
    boxShadow: SHADOWS[String(frame.shadow ?? "")],
    justifyContent: ({ center: "center", end: "flex-end" } as Record<string, string>)[String(frame.align ?? "")] ?? "flex-start"
  };
}

export function detachComponent(def: ComponentDef, copy: Block, page: Pick<Section, "grid"> = {}): Block[] {
  const { blocks, frame, section: design } = resolveComponent(def, copy.props);
  const inner = gridOf(design);
  const outer = gridOf(page);
  const scale = copy.w / inner.cols;
  const rowScale = inner.rowHeight / outer.rowHeight;
  const padRows = Math.round(Number(frame.padding ?? 0) / outer.rowHeight);
  const out: Block[] = [];
  if (frame.fill || Number(frame.borderWidth ?? 0) > 0 || frame.shadow) {
    out.push({
      id: createId("blk"),
      type: "box",
      x: copy.x,
      y: copy.y,
      w: copy.w,
      h: copy.h,
      layerId: copy.layerId,
      props: {
        fill: String(frame.fill ?? ""),
        radius: Number(frame.radius ?? -1),
        borderColor: String(frame.borderColor ?? ""),
        borderWidth: Number(frame.borderWidth ?? 0),
        shadow: Boolean(frame.shadow)
      }
    });
  }
  for (const b of [...blocks].sort((a, c) => a.y - c.y || a.x - c.x)) {
    const x = copy.x + Math.min(copy.w - 1, Math.round(b.x * scale));
    const { responsive: _ownLayouts, ...piece } = structuredClone(b);
    out.push({
      ...piece,
      id: createId("blk"),
      x,
      w: Math.max(1, Math.min(copy.x + copy.w - x, Math.round(b.w * scale))),
      y: copy.y + padRows + Math.round(b.y * rowScale),
      h: Math.max(1, Math.round(b.h * rowScale)),
      layerId: copy.layerId
    });
  }
  return out;
}

export function createComponent(name: string, blocks: Block[] = [], columns = 4, frame: BlockProps = {}): ComponentDef {
  return {
    id: createId("cmp"),
    name,
    description: "",
    icon: "◆",
    columns,
    section: { ...createSection(name, blocks, { minRows: 0, paddingY: 0 }) },
    frame: { ...DEFAULT_FRAME, ...frame },
    fields: []
  };
}

export function newField(def: ComponentDef, blockId: string, prop: string, label: string): ComponentField {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "field";
  let id = base;
  for (let n = 2; def.fields.some((f) => f.id === id); n++) id = `${base}-${n}`;
  return { id, label, blockId, prop };
}

export function componentFromBlocks(name: string, section: Section, ids: string[]): { def: ComponentDef; rect: { x: number; y: number; w: number; h: number } } | null {
  const picked = section.blocks.filter((b) => ids.includes(b.id));
  if (picked.length === 0) return null;
  const x = Math.min(...picked.map((b) => b.x));
  const y = Math.min(...picked.map((b) => b.y));
  const right = Math.max(...picked.map((b) => b.x + b.w));
  const bottom = Math.max(...picked.map((b) => b.y + b.h));
  const span = right - x;
  const grid = gridOf(section);
  const scale = grid.cols / span;
  const layerIds = new Set(section.layers.map((l) => l.id));
  const blocks = picked.map(({ responsive: _drop, ...b }) => {
    const bx = Math.round((b.x - x) * scale);
    return {
      ...structuredClone(b),
      id: createId("blk"),
      x: bx,
      w: Math.max(1, Math.min(grid.cols - bx, Math.round(b.w * scale))),
      y: b.y - y,
      layerId: b.layerId && layerIds.has(b.layerId) ? b.layerId : undefined
    };
  });
  const def = createComponent(name, blocks, Math.max(1, Math.min(GRID_COLUMNS, Math.round(span / grid.density))), { fill: "", padding: 0, shadow: "", radius: 0 });
  if (section.grid) def.section.grid = section.grid;
  def.section.layers = section.layers.filter((l) => picked.some((b) => b.layerId === l.id)).map((l) => ({ ...l, hidden: false, locked: false }));
  if (def.section.layers.length === 0) def.section.layers = createSection(name).layers;
  for (const b of def.section.blocks) if (!def.section.layers.some((l) => l.id === b.layerId)) delete b.layerId;
  return { def, rect: { x, y, w: span, h: bottom - y } };
}

interface Blueprint {
  id: string;
  name: string;
  description: string;
  build: () => ComponentDef;
}

const piece = (type: string, x: number, y: number, w: number, h: number, props: BlockProps = {}) => createBlock(type, { x, y, w, h }, props);

function withFields(def: ComponentDef, fields: [Block | typeof FRAME, string, string][]): ComponentDef {
  for (const [target, prop, label] of fields) {
    def.fields.push(newField(def, target === FRAME ? FRAME : target.id, prop, label));
  }
  return def;
}

export const BLUEPRINTS: Blueprint[] = [
  {
    id: "blank",
    name: "Blank",
    description: "An empty frame. Add any pieces from the Add tab.",
    build: () => createComponent("New component")
  },
  {
    id: "project-card",
    name: "Project card",
    description: "Image, title, short text and a link button.",
    build: () => {
      const image = piece("image", 0, 0, 12, 8, { src: "", fit: "cover" });
      const title = piece("heading", 0, 9, 12, 2, { text: "Project title", size: "m", level: "3" });
      const text = piece("text", 0, 11, 12, 3, { text: "What it is and why it matters, in a sentence or two.", size: "s" });
      const button = piece("button", 0, 15, 6, 2, { label: "View project", size: "s", variant: "outline" });
      const def = createComponent("Project card", [image, title, text, button], 4);
      return withFields(def, [
        [image, "src", "Image"],
        [title, "text", "Title"],
        [text, "text", "Description"],
        [button, "label", "Button label"],
        [button, "href", "Button link"]
      ]);
    }
  },
  {
    id: "profile",
    name: "Profile",
    description: "Photo, name, role and a short bio.",
    build: () => {
      const photo = piece("image", 3, 0, 6, 6, { src: "", fit: "cover", radius: 999 });
      const name = piece("heading", 0, 7, 12, 2, { text: "Alex Moreno", size: "m", level: "3", align: "center" });
      const role = piece("text", 0, 9, 12, 1, { text: "**Illustrator**", size: "s", align: "center", color: "var(--accent)" });
      const bio = piece("text", 0, 11, 12, 3, { text: "Draws for books, bands and the occasional wall.", size: "s", align: "center", color: "var(--muted)" });
      const def = createComponent("Profile", [photo, name, role, bio], 3);
      return withFields(def, [
        [photo, "src", "Photo"],
        [name, "text", "Name"],
        [role, "text", "Role"],
        [bio, "text", "Bio"]
      ]);
    }
  },
  {
    id: "feature",
    name: "Feature",
    description: "An icon badge, a title and a description.",
    build: () => {
      const badge = piece("box", 0, 0, 2, 2, { fill: "color-mix(in srgb, var(--accent) 18%, transparent)", radius: 999 });
      const icon = piece("heading", 0, 0, 2, 2, { text: "✦", size: "s", align: "center", color: "var(--accent)" });
      const title = piece("heading", 0, 3, 12, 2, { text: "Feature name", size: "s", level: "3" });
      const text = piece("text", 0, 5, 12, 3, { text: "One or two lines about what this does for people.", size: "s", color: "var(--muted)" });
      const def = createComponent("Feature", [badge, icon, title, text], 4);
      return withFields(def, [
        [icon, "text", "Icon"],
        [title, "text", "Title"],
        [text, "text", "Description"],
        [FRAME, "fill", "Background"]
      ]);
    }
  },
  {
    id: "stat",
    name: "Stat",
    description: "A big number with a label.",
    build: () => {
      const number = piece("heading", 0, 0, 12, 3, { text: "140", size: "xl", level: "3", color: "var(--accent)" });
      const label = piece("text", 0, 3, 12, 1, { text: "Projects shipped", size: "s", color: "var(--muted)" });
      const def = createComponent("Stat", [number, label], 3, { shadow: "", fill: "", padding: 8 });
      return withFields(def, [
        [number, "text", "Number"],
        [label, "text", "Label"]
      ]);
    }
  },
  {
    id: "quote",
    name: "Quote",
    description: "A quote with the person's name, on a tinted panel.",
    build: () => {
      const mark = piece("heading", 0, 0, 2, 3, { text: "“", size: "xl", color: "var(--accent)" });
      const quote = piece("text", 0, 3, 12, 4, { text: "_They listened, then built exactly what we needed._", size: "l" });
      const who = piece("text", 0, 8, 12, 1, { text: "**Sam Rivera** · Founder, Fieldnotes", size: "s", color: "var(--muted)" });
      const def = createComponent("Quote", [mark, quote, who], 6, { fill: "color-mix(in srgb, var(--accent) 8%, var(--surface))", shadow: "" });
      return withFields(def, [
        [quote, "text", "Quote"],
        [who, "text", "Person"]
      ]);
    }
  },
  {
    id: "cta",
    name: "Call to action",
    description: "Title, text and a button on an accent panel.",
    build: () => {
      const title = piece("heading", 0, 0, 8, 2, { text: "Have a project in mind?", size: "l", color: "var(--accent-text)" });
      const text = piece("text", 0, 3, 8, 2, { text: "Let's talk about what you need.", color: "var(--accent-text)" });
      const button = piece("button", 9, 1, 3, 2, { label: "Get in touch", variant: "light" });
      const def = createComponent("Call to action", [title, text, button], 12, { fill: "var(--accent)", padding: 36, shadow: "" });
      return withFields(def, [
        [title, "text", "Title"],
        [text, "text", "Text"],
        [button, "label", "Button label"],
        [button, "href", "Button link"],
        [FRAME, "fill", "Background"]
      ]);
    }
  }
];

export function copyComponent(source: ComponentDef, name: string): ComponentDef {
  const def = structuredClone(source);
  def.id = createId("cmp");
  def.name = name;
  def.section.id = createId("sec");
  for (const v of def.variants ?? []) v.section.id = createId("sec");
  delete def.libraryId;
  return def;
}

export function componentUses(site: Site, id: string): number {
  const sections = [site.header, site.footer, ...site.pages.flatMap((p) => p.sections), ...(site.components ?? []).flatMap((c) => [c.section, ...(c.variants ?? []).map((v) => v.section)])];
  let n = 0;
  for (const s of sections) for (const b of s?.blocks ?? []) if ((b.type === "component" || b.type === "collection") && b.props.componentId === id) n++;
  return n;
}
