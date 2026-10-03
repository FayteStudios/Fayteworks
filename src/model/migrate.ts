import { createLayer, pinLayers } from "./layers";
import { SCHEMA_VERSION, type Block, type Page, type Section, type Site, type ComponentDef } from "./types";

type Loose<T> = Partial<T>;

/** Physics roles used to live in the physics settings; they are now the hitbox's behaviour. */
function liftPhysicsRole(block: Block): Block {
  if (block.type === "wave" && "floor" in block.props) {
    const { floor, ...props } = block.props;
    const lifted = { ...block, props };
    return floor === false || block.hitbox?.role ? lifted : { ...lifted, hitbox: { ...block.hitbox, role: "floor" } };
  }
  const physics = block.ext?.physics as { role?: string } | undefined;
  if (!physics?.role) return block;
  const { role, ...rest } = physics;
  return { ...block, hitbox: { ...block.hitbox, role: block.hitbox?.role || role }, ext: { ...block.ext, physics: rest } };
}

export function migrateSection(section: Loose<Section>): Section {
  const migrated: Section = {
    ...section,
    id: String(section.id),
    name: String(section.name ?? "Section"),
    blocks: (Array.isArray(section.blocks) ? section.blocks : []).map(liftPhysicsRole),
    layers:
      Array.isArray(section.layers) && section.layers.length > 0
        ? (section.layers as Section["layers"]).map((l) => (/^Layer \d+$/.test(l.name) ? { ...l, name: l.name.replace("Layer", "Group") } : l))
        : [createLayer("Group 1")],
    settings: {
      background: "",
      backgroundImage: "",
      paddingY: 64,
      fullBleed: false,
      minRows: 12,
      sticky: false,
      ...section.settings
    }
  };
  pinLayers(migrated);
  return migrated;
}

function migratePage(page: Loose<Page>): Page {
  return {
    ...page,
    id: String(page.id),
    title: String(page.title ?? "Page"),
    slug: String(page.slug ?? ""),
    hideInNav: Boolean(page.hideInNav),
    seo: { description: "", image: "", ...page.seo },
    sections: (Array.isArray(page.sections) ? page.sections : []).map(migrateSection)
  };
}

export function migrateSite(value: unknown): Site | null {
  const raw = value as (Loose<Omit<Site, "schemaVersion">> & { schemaVersion?: unknown }) | null;
  if (
    !raw ||
    typeof raw !== "object" ||
    typeof raw.schemaVersion !== "number" ||
    raw.schemaVersion > SCHEMA_VERSION ||
    typeof raw.theme !== "object" ||
    !Array.isArray(raw.pages) ||
    raw.pages.length === 0
  ) {
    return null;
  }
  return {
    ...raw,
    schemaVersion: SCHEMA_VERSION,
    name: String(raw.name ?? "Untitled site"),
    theme: raw.theme,
    settings: { lang: "en", favicon: "", baseUrl: "", ...raw.settings },
    header: raw.header ? migrateSection(raw.header) : null,
    footer: raw.footer ? migrateSection(raw.footer) : null,
    pages: raw.pages.map(migratePage),
    ...(Array.isArray(raw.components)
      ? {
          components: (raw.components as ComponentDef[]).map((c) => ({
            ...c,
            section: migrateSection(c.section),
            ...(Array.isArray(c.variants) ? { variants: c.variants.map((v) => ({ ...v, section: migrateSection(v.section) })) } : {})
          }))
        }
      : {})
  };
}
