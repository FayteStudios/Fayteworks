import type { CSSProperties } from "react";
import { bindProps } from "../data/model";
import { componentRows, designsOf, fieldDefFor, fieldsFor, findComponent, frameStyle, resolveComponent } from "../model/components";
import { layerIdOf } from "../model/layers";
import { RenderCtx } from "../site/renderContext";
import { linkAttrs } from "../site/richText";
import { BlockContent, PieceAfter, blockMotion, blockStyle, hideAttrs, inFlowOrder, mobileHeightOf, sectionRowsByTier } from "../site/SiteRenderer";
import { animationSources } from "../motion/compile";
import { hasCustomLayout } from "../model/responsive";
import { gridVars } from "../model/grid";
import type { BlockDefinition } from "./types";
import { str } from "./util";

const MAX_DEPTH = 4;

export const componentDefinitions: BlockDefinition[] = [
  {
    type: "component",
    label: "Component",
    category: "Layout",
    icon: "◆",
    description: "A component you made in the component maker.",
    hidden: true,
    defaultSize: { w: 4, h: 12 },
    defaultProps: { componentId: "" },
    fields: [],
    extraFields: (props, site) => {
      const def = findComponent(site?.components, props.componentId);
      if (!def) return [];
      const fields = fieldsFor(def, props.variant).map((f) => fieldDefFor(def, f, site)).filter((f) => f !== null);
      return def.variants?.length
        ? [{ key: "variant", label: "Variant", kind: "select", options: designsOf(def).map((d) => ({ value: d.id, label: d.name })) }, ...fields]
        : fields;
    },
    mobileHeight: "content",
    render: (p, ctx, meta) => {
      const def = findComponent(ctx.components, p.componentId);
      const depth = ctx.componentDepth ?? 0;
      if (!def || depth >= MAX_DEPTH) {
        return ctx.isEditor ? <div className="b-component-missing">{def ? "This component contains itself." : "This component was deleted."}</div> : null;
      }
      const resolved = resolveComponent(def, p);
      const { blocks, section: design } = resolved;
      const frame = ctx.item ? bindProps(resolved.frame, ctx.item) : resolved.frame;
      const href = str(frame.href);
      const section = { ...design, blocks };
      const hidden = new Set(design.layers.filter((l) => l.hidden).map((l) => l.id));
      const rows = sectionRowsByTier(section, blocks);
      const classes = [
        "b-component",
        href && "b-component--linked",
        hasCustomLayout(section, "tablet") && "cmp--tablet-layout",
        hasCustomLayout(section, "phone") && "cmp--phone-layout"
      ];
      return (
        <div className={classes.filter(Boolean).join(" ")} style={frameStyle(frame, ctx.asset)} data-component={def.id}>
          {href && <a className="b-component-link" {...linkAttrs(ctx.link(href))} aria-label={def.name} />}
          <RenderCtx.Provider value={{ ...ctx, componentDepth: depth + 1 }}>
            <div
              className="cmp-grid"
              style={{ ...gridVars(design, true), "--rows": Math.max(rows.desktop, componentRows(def, design)), "--trows": rows.tablet, "--prows": rows.phone } as CSSProperties}
            >
              {inFlowOrder(section, blocks)
                .filter(({ block }) => !hidden.has(layerIdOf(section, block)))
                .map(({ block, z }) => {
                  const motion = blockMotion(block, animationSources(blocks), ctx.asset);
                  return (
                    <div
                      key={`${meta.id}-${block.id}`}
                      className="cmp-block"
                      style={{ ...blockStyle(section, block, z), ...motion.style } as CSSProperties}
                      data-mobile-height={mobileHeightOf(block)}
                      {...hideAttrs(block)}
                      {...motion.attrs}
                    >
                      <BlockContent block={block} />
                      <PieceAfter block={block} />
                    </div>
                  );
                })}
            </div>
          </RenderCtx.Provider>
        </div>
      );
    }
  }
];
