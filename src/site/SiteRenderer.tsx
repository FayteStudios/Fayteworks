import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import { localizedProps } from "../i18n/i18n";
import { animationMarkup, animationSources } from "../motion/compile";
import { soundMarkup } from "../motion/sounds";
import { bindProps } from "../data/model";
import { cardLayouts, extensions, pieceAttrs } from "../model/extras";
import { isCardShell, shellOf } from "../model/shells";
import { gridVars } from "../model/grid";
import { getBlockDefinition } from "../blocks/registry";
import { isBlockVisible, layerIdOf } from "../model/layers";
import { pageSectionsWithShared, type SectionRole } from "../model/ops";
import { hasCustomLayout, isHiddenAt, rectFor, tierRows, type Tier } from "../model/responsive";
import type { Block, Page, Section, Site } from "../model/types";
import { cls } from "../util/cls";
import { useRenderContext } from "./renderContext";
import { ShellRenderer } from "./ShellRenderer";

export function BlockContent({ block }: { block: Block }) {
  const ctx = useRenderContext();
  const def = getBlockDefinition(block.type);
  if (!def) {
    return <div className="b-missing">Unknown block “{block.type}”</div>;
  }
  const base = ctx.lang ? localizedProps(block, ctx.lang) : block.props;
  const props = ctx.item ? bindProps(base, ctx.item) : base;
  return <>{def.render(props, ctx, { id: block.id })}</>;
}

export function blockStyle(section: Section, block: Block, z: number): CSSProperties {
  const vars: Record<string, number> = { "--x": block.x + 1, "--y": block.y + 1, "--w": block.w, "--h": block.h };
  for (const [tier, prefix] of [["tablet", "t"], ["phone", "p"]] as const) {
    if (!hasCustomLayout(section, tier)) continue;
    const r = rectFor(section, block, tier);
    Object.assign(vars, { [`--${prefix}x`]: r.x + 1, [`--${prefix}y`]: r.y + 1, [`--${prefix}w`]: r.w, [`--${prefix}h`]: r.h });
  }
  if (block.overhang?.top) vars["--oh-top"] = block.overhang.top;
  if (block.overhang?.bottom) vars["--oh-bottom"] = block.overhang.bottom;
  if (block.hang?.x) vars["--hang-x"] = block.hang.x;
  if (block.hang?.y) vars["--hang-y"] = block.hang.y;
  return { ...vars, zIndex: z + 1 } as CSSProperties;
}

export function sectionRowsByTier(
  section: Section,
  blocks: Block[] = section.blocks,
  preview?: { tier: Tier; minRows: number }
): Record<Tier, number> {
  const rows = (tier: Tier) => tierRows(section, blocks, tier, preview?.tier === tier ? preview.minRows : undefined);
  return { desktop: rows("desktop"), tablet: rows("tablet"), phone: rows("phone") };
}

const afterParts = extensions.flatMap((e) => (e.pieceAfter ? [e.pieceAfter] : []));

export function PieceAfter({ block }: { block: Block }) {
  return (
    <>
      {afterParts.map((Part, i) => (
        <Part key={i} block={block} />
      ))}
    </>
  );
}

export function motionAttrs(block: Block): Record<string, string | undefined> {
  const m = block.motion;
  return {
    "data-reveal": m?.reveal || undefined,
    "data-hover": m?.hover || undefined,
    "data-parallax": m?.parallax ? String(m.parallax / 100) : undefined
  };
}

export function turnMarkup(block: Block): { attrs: Record<string, string>; style: Record<string, string> } | null {
  const t = block.turn;
  if (!t || (!t.z && !t.x && !t.y)) return null;
  const parts = [t.x || t.y ? `perspective(${Math.max(100, t.depth || 800)}px)` : "", t.x ? `rotateX(${t.x}deg)` : "", t.y ? `rotateY(${t.y}deg)` : "", t.z ? `rotate(${t.z}deg)` : ""].filter(Boolean);
  return { attrs: { "data-turn": "" }, style: { "--fw-turn": parts.join(" ") } };
}

export function blockMotion(block: Block, sources?: Set<string>, asset?: (src: string) => string): { attrs: Record<string, string | undefined>; style: Record<string, string> } {
  const timeline = animationMarkup(block);
  const sounds = soundMarkup(block, asset);
  const turn = turnMarkup(block);
  const attrs: Record<string, string | undefined> = { ...motionAttrs(block), ...timeline?.attrs, ...sounds, ...turn?.attrs, ...pieceAttrs(block) };
  if (sources?.has(block.id)) attrs["data-b"] = block.id;
  const style: Record<string, string> = { ...timeline?.style, ...turn?.style };
  if (block.motion?.reveal && block.motion.delay) style["--reveal-delay"] = `${block.motion.delay}ms`;
  return { attrs, style };
}

export function hideAttrs(block: Block): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (isHiddenAt(block, "tablet")) attrs["data-hide-tablet"] = "";
  if (isHiddenAt(block, "phone")) attrs["data-hide-phone"] = "";
  if (block.orientation) attrs["data-only"] = block.orientation;
  if (block.valign) attrs["data-valign"] = block.valign;
  return attrs;
}

export function mobileHeightOf(block: Block): string {
  return getBlockDefinition(block.type)?.mobileHeight ?? "content";
}

const LAYER_Z_STEP = 1000;

export function inFlowOrder(section: Section, blocks: Block[] = section.blocks): { block: Block; z: number }[] {
  const layerIndex = new Map(section.layers.map((layer, i) => [layer.id, i]));
  return blocks
    .map((block, i) => ({ block, z: (layerIndex.get(layerIdOf(section, block)) ?? 0) * LAYER_Z_STEP + i }))
    .filter(({ block }) => isBlockVisible(section, block))
    .sort((a, b) => a.block.y - b.block.y || a.block.x - b.block.x || a.z - b.z);
}

interface SectionShellProps {
  section: Section;
  role: SectionRole;
  rows: Record<Tier, number>;
  children: ReactNode;
  gridRef?: Ref<HTMLDivElement>;
  gridProps?: HTMLAttributes<HTMLDivElement>;
}

export function SectionShell({ section, role, rows, children, gridRef, gridProps }: SectionShellProps) {
  const { asset, sheet: sheetCtx, isEditor } = useRenderContext();
  const sheet = role === "page" ? sheetCtx : undefined;
  const s = section.settings;
  const backgroundImage = s.backgroundImage ? asset(s.backgroundImage) : "";
  const parallax = backgroundImage && (s.backgroundMotion === "slow" || s.backgroundMotion === "strong");
  const Tag = role === "header" ? "header" : role === "footer" ? "footer" : "section";
  return (
    <Tag
      className={cls(
        "site-section",
        `site-section--${role}`,
        s.fullBleed && "site-section--bleed",
        s.sticky && "site-section--sticky",
        parallax && "site-section--parallax",
        section.blocks.some((b) => b.overhang?.top || b.overhang?.bottom) && "site-section--overhang",
        section.blocks.some((b) => b.hang?.x || b.hang?.y) && "site-section--hang",
        hasCustomLayout(section, "tablet") && "site-section--tablet-layout",
        hasCustomLayout(section, "phone") && "site-section--phone-layout",
        sheet && "site-section--sheet"
      )}
      style={
        {
          "--pad-y": `${s.paddingY}px`,
          ...(sheet ? { "--sheet-h": `${sheet.height}px`, "--sheet-bleed": `${sheet.bleed}px`, "--sheet-safe": `${sheet.safe}px` } : {}),
          background:
            [
              backgroundImage && !parallax && `url("${backgroundImage}") center / cover no-repeat${s.backgroundMotion === "fixed" ? " fixed" : ""}`,
              s.background
            ]
              .filter(Boolean)
              .join(", ") || undefined
        } as CSSProperties
      }
    >
      {parallax && (
        <div className="site-section-bg-clip" aria-hidden>
          <div className="site-section-bg" data-parallax={s.backgroundMotion === "strong" ? "-0.45" : "-0.25"} style={{ backgroundImage: `url("${backgroundImage}")` }} />
        </div>
      )}
      {sheet && isEditor && (
        <div className="sheet-guides" aria-hidden>
          <div className="sheet-guide-trim" />
          <div className="sheet-guide-safe" />
          {Array.from({ length: sheet.folds }, (_, i) => (
            <div key={i} className="sheet-guide-fold" style={{ left: `calc(var(--sheet-bleed) + (100% - 2 * var(--sheet-bleed)) * ${(i + 1) / (sheet.folds + 1)})` }} />
          ))}
        </div>
      )}
      <div className="site-section-inner">
        <div
          ref={gridRef}
          className="site-grid"
          style={{ ...gridVars(section, role === "component"), "--rows": rows.desktop, "--trows": rows.tablet, "--prows": rows.phone } as CSSProperties}
          {...gridProps}
        >
          {children}
        </div>
      </div>
    </Tag>
  );
}

export function StaticSection({ section, role }: { section: Section; role: SectionRole }) {
  const sources = animationSources(section.blocks);
  const { asset } = useRenderContext();
  return (
    <SectionShell section={section} role={role} rows={sectionRowsByTier(section)}>
      {inFlowOrder(section).map(({ block, z }) => {
        const motion = blockMotion(block, sources, asset);
        return (
          <div
            key={block.id}
            className="site-block"
            style={{ ...blockStyle(section, block, z), ...motion.style } as CSSProperties}
            data-mobile-height={mobileHeightOf(block)}
            data-grow={getBlockDefinition(block.type)?.grows ? "" : undefined}
            data-spot={block.spot || undefined}
            {...hideAttrs(block)}
            {...motion.attrs}
          >
            <BlockContent block={block} />
            <PieceAfter block={block} />
          </div>
        );
      })}
    </SectionShell>
  );
}

export function PageRenderer({ site, page }: { site: Site; page: Page }) {
  const sections = pageSectionsWithShared(site, page);
  const header = sections.filter((s) => s.role === "header");
  const body = sections.filter((s) => s.role === "page");
  const footer = sections.filter((s) => s.role === "footer");
  return (
    <>
      {header.map(({ section, role }) => (
        <StaticSection key={section.id} section={section} role={role} />
      ))}
      {cardLayouts && isCardShell(shellOf(page).type) ? (
        <cardLayouts.Shell page={page} sections={body.map(({ section }) => section)} pages={site.pages} />
      ) : (
        <ShellRenderer page={page} sections={body.map(({ section }) => section)} />
      )}
      {footer.map(({ section, role }) => (
        <StaticSection key={section.id} section={section} role={role} />
      ))}
      {!page.design &&
        (site.companions ?? [])
          .filter((c) => !c.pages || c.pages.includes(page.id))
          .map((c) => (
            <div key={c.id} className="site-companion" data-companion={c.type}>
              <BlockContent block={{ id: c.id, type: c.type, x: 0, y: 0, w: 1, h: 1, props: c.props }} />
            </div>
          ))}
    </>
  );
}
