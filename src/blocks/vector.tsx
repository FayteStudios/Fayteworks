import type { FieldDef } from "../model/fields";
import type { BlockProps } from "../model/types";
import { drawingLayers, layerHiddenKey, layerTextKey, renderSvg, STARTER_DRAWING, type LayerAnimation } from "../vector/svg";
import type { BlockDefinition } from "./types";
import { list, str } from "./util";

export function colorMapOf(props: BlockProps): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of list(props.colors)) if (item.color && item.token) map[String(item.color)] = String(item.token);
  return map;
}

export const vectorDefinitions: BlockDefinition[] = [
  {
    type: "vector",
    label: "Drawing",
    category: "Media",
    icon: "✎",
    description: "Vector graphics: draw them here or in Inkscape/Illustrator. Crisp at any size, colours can follow the theme.",
    defaultSize: { w: 4, h: 10 },
    defaultProps: {
      svg: STARTER_DRAWING,
      colors: [
        { color: "#e0633a", token: "var(--accent)" },
        { color: "#1d1b18", token: "var(--text)" }
      ],
      fit: "contain",
      alt: ""
    },
    fields: [
      {
        key: "fit",
        label: "Fit",
        kind: "select",
        options: [
          { value: "contain", label: "Fit (whole drawing)" },
          { value: "cover", label: "Fill (crop)" },
          { value: "stretch", label: "Stretch" }
        ]
      },
      { key: "alt", label: "Alt text", kind: "text", hint: "Describe the drawing for screen readers. Leave empty if it's decoration." }
    ],
    extraFields: (props) =>
      drawingLayers(str(props.svg)).filter((layer, i, all) => all.findIndex((l) => l.id === layer.id) === i).flatMap((layer): FieldDef[] => [
        ...(layer.kind === "text"
          ? [{ key: layerTextKey(layer.id), label: layer.label, kind: layer.text.includes("\n") ? "textarea" : "text", placeholder: layer.text } as FieldDef]
          : []),
        { key: layerHiddenKey(layer.id), label: `Hide “${layer.label}”`, kind: "toggle" }
      ]),
    mobileHeight: "keep",
    render: (p, ctx, meta) => {
      const alt = str(p.alt);
      const fit = str(p.fit, "contain") as "contain" | "cover" | "stretch";
      const animations = ctx.isEditor && !ctx.isPreview ? [] : (list(p.animations) as unknown as LayerAnimation[]).filter((a) => a.layer && a.effect);
      const svg = renderSvg(str(p.svg), { scope: meta.id, colorMap: colorMapOf(p), values: p, fit, animations });
      const onView = animations.some((a) => a.trigger === "view");
      return (
        <div
          className="b-vector"
          data-vector={meta.id}
          data-draw-anim={onView ? "" : undefined}
          role={alt ? "img" : undefined}
          aria-label={alt || undefined}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      );
    }
  }
];
