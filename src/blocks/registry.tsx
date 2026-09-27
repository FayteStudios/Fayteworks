import type { CSSProperties } from "react";
import type { RenderContext } from "../site/renderContext";
import { linkAttrs, RichText } from "../site/richText";
import type { BlockCategory, BlockDefinition } from "./types";
import { alignField, color, FLEX_ALIGN, num, Paragraphs, str } from "./util";
import { contentDefinitions } from "./content";
import { interactiveDefinitions } from "./interactive";
import { codeDefinitions } from "./code";
import { componentDefinitions } from "./component";
import { vectorDefinitions } from "./vector";
import { mediaDefinitions } from "./media";
import { collectionDefinitions } from "./collection";
import { servicesDefinitions } from "./services";
import { motionDefinitions } from "./motion";
import { blogDefinitions } from "./blog";
import { contactDefinitions } from "./contact";
import { searchDefinitions } from "./search";
import { businessDefinitions } from "./business";
import { languageDefinitions } from "./languages";
import { socialDefinitions } from "./social";

export type { BlockCategory, BlockDefinition, BlockMeta, InlineEditTarget } from "./types";

const HEADING_SIZES: Record<string, string> = {
  s: "1.25rem",
  m: "1.75rem",
  l: "clamp(1.9rem, 4.5cqi, 2.75rem)",
  xl: "clamp(2.4rem, 6.5cqi, 4rem)",
  display: "clamp(3rem, 8.5cqi, 6.25rem)"
};

const TEXT_SIZES: Record<string, string> = {
  s: "0.9rem",
  m: "1.05rem",
  l: "1.25rem"
};

function PageLinks({ ctx, className }: { ctx: RenderContext; className: string }) {
  return (
    <ul className={className}>
      {ctx.navPages.map((page) => (
        <li key={page.id}>
          <a
            {...linkAttrs(ctx.link(`page:${page.id}`))}
            aria-current={page.id === ctx.currentPageId ? "page" : undefined}
          >
            {page.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

const definitions: BlockDefinition[] = [
  {
    type: "nav",
    label: "Navigation",
    category: "Navigation",
    icon: "☰",
    description: "Site name, page links and an optional call-to-action. Collapses to a menu on phones.",
    defaultSize: { w: 12, h: 3 },
    defaultProps: { brand: "My site", showLinks: true, linksAlign: "right", ctaLabel: "", ctaHref: "" },
    fields: [
      { key: "brand", label: "Site name", kind: "text", hint: "Links to the home page. Leave empty to hide." },
      { key: "showLinks", label: "Show page links", kind: "toggle", hint: "Hide a page from here in its page settings." },
      {
        key: "linksAlign",
        label: "Links position",
        kind: "select",
        options: [
          { value: "left", label: "Next to name" },
          { value: "center", label: "Centered" },
          { value: "right", label: "Right" }
        ]
      },
      { key: "ctaLabel", label: "Button label", kind: "text", placeholder: "Leave empty for no button" },
      { key: "ctaHref", label: "Button link", kind: "link" }
    ],
    mobileHeight: "content",
    inlineEdit: [{ key: "brand", selector: ".b-nav-brand", mode: "plain", lines: "single" }],
    render: (p, ctx) => {
      const cta = str(p.ctaLabel);
      return (
        <nav className={`b-nav b-nav--${str(p.linksAlign, "right")}`}>
          {str(p.brand) && (
            <a className="b-nav-brand" {...linkAttrs(ctx.link(`page:${ctx.homePageId}`))}>
              {str(p.brand)}
            </a>
          )}
          {p.showLinks !== false && <PageLinks ctx={ctx} className="b-nav-links" />}
          {cta && (
            <a className="b-button b-button--solid b-button--s b-nav-cta" {...linkAttrs(ctx.link(str(p.ctaHref)))}>
              {cta}
            </a>
          )}
          {p.showLinks !== false && (
            <details className="b-nav-menu">
              <summary aria-label="Menu">
                <span />
              </summary>
              <PageLinks ctx={ctx} className="b-nav-menu-links" />
            </details>
          )}
        </nav>
      );
    }
  },
  {
    type: "footer",
    label: "Footer",
    category: "Navigation",
    icon: "▁",
    description: "Small print with optional page links",
    defaultSize: { w: 12, h: 2 },
    defaultProps: { text: `© ${new Date().getFullYear()} My site`, showLinks: true },
    fields: [
      { key: "text", label: "Text", kind: "text" },
      { key: "showLinks", label: "Show page links", kind: "toggle" }
    ],
    mobileHeight: "content",
    inlineEdit: [{ key: "text", selector: ".b-footer-text", mode: "plain", lines: "single" }],
    render: (p, ctx) => (
      <div className="b-footer">
        <span className="b-footer-text">{str(p.text)}</span>
        {Boolean(p.showLinks) && <PageLinks ctx={ctx} className="b-footer-links" />}
      </div>
    )
  },
  {
    type: "heading",
    label: "Heading",
    category: "Text",
    icon: "H",
    description: "Titles and section headers",
    defaultSize: { w: 8, h: 3 },
    defaultProps: { text: "A bold headline", level: "2", size: "l", align: "left", color: "" },
    fields: [
      { key: "text", label: "Text", kind: "textarea" },
      {
        key: "size",
        label: "Size",
        kind: "select",
        options: [
          { value: "s", label: "Small" },
          { value: "m", label: "Medium" },
          { value: "l", label: "Large" },
          { value: "xl", label: "Extra large" },
          { value: "display", label: "Display" }
        ]
      },
      {
        key: "level",
        label: "Tag",
        kind: "select",
        hint: "Use one H1 per page. Search engines and screen readers rely on it.",
        options: ["1", "2", "3", "4"].map((l) => ({ value: l, label: `H${l}` }))
      },
      alignField,
      {
        key: "font",
        label: "Font",
        kind: "select",
        options: [
          { value: "heading", label: "Heading font" },
          { value: "body", label: "Body font" }
        ]
      },
      { key: "color", label: "Colour", kind: "color" }
    ],
    mobileHeight: "content",
    inlineEdit: [{ key: "text", selector: ".b-heading", mode: "rich", lines: "lines" }],
    render: (p, ctx) => {
      const level = str(p.level, "2");
      const Tag = (["1", "2", "3", "4"].includes(level) ? `h${level}` : "h2") as "h2";
      return (
        <Tag
          className="b-heading"
          style={{
            fontSize: HEADING_SIZES[str(p.size, "l")] ?? HEADING_SIZES.l,
            fontFamily: str(p.font) === "body" ? "var(--font-body)" : undefined,
            textAlign: str(p.align, "left") as CSSProperties["textAlign"],
            color: color(p.color)
          }}
        >
          <RichText text={str(p.text)} ctx={ctx} />
        </Tag>
      );
    }
  },
  {
    type: "text",
    label: "Text",
    category: "Text",
    icon: "¶",
    description: "Paragraphs of body copy",
    defaultSize: { w: 6, h: 4 },
    defaultProps: {
      text: "Write something worth reading. Leave a blank line between paragraphs.",
      size: "m",
      align: "left",
      color: ""
    },
    fields: [
      { key: "text", label: "Text", kind: "textarea", hint: "Blank line = new paragraph. **bold**, _italic_, [link](https://…). Or double-click the text on the canvas." },
      {
        key: "size",
        label: "Size",
        kind: "select",
        options: [
          { value: "s", label: "Small" },
          { value: "m", label: "Regular" },
          { value: "l", label: "Lead" }
        ]
      },
      alignField,
      { key: "color", label: "Colour", kind: "color" }
    ],
    mobileHeight: "content",
    inlineEdit: [{ key: "text", selector: ".b-text", mode: "rich", lines: "paragraphs" }],
    render: (p, ctx) => (
      <div
        className="b-text"
        style={{
          fontSize: TEXT_SIZES[str(p.size, "m")] ?? TEXT_SIZES.m,
          textAlign: str(p.align, "left") as CSSProperties["textAlign"],
          color: color(p.color)
        }}
      >
        <Paragraphs text={str(p.text)} ctx={ctx} />
      </div>
    )
  },
  {
    type: "marquee",
    label: "Marquee",
    category: "Text",
    icon: "⇶",
    description: "A banner of text that slides endlessly. Put it between layers for overlay effects.",
    defaultSize: { w: 12, h: 3 },
    defaultProps: {
      text: "Now booking · Limited spots",
      separator: "✦",
      size: "l",
      speed: 20,
      direction: "left",
      tilt: 0,
      fill: "var(--accent)",
      color: "var(--accent-text)"
    },
    fields: [
      { key: "text", label: "Text", kind: "text" },
      { key: "separator", label: "Separator", kind: "text", placeholder: "•" },
      {
        key: "size",
        label: "Size",
        kind: "select",
        options: [
          { value: "s", label: "Small" },
          { value: "m", label: "Medium" },
          { value: "l", label: "Large" },
          { value: "xl", label: "Extra large" }
        ]
      },
      { key: "speed", label: "Seconds per loop", kind: "range", min: 4, max: 60, hint: "Lower is faster." },
      {
        key: "direction",
        label: "Direction",
        kind: "select",
        options: [
          { value: "left", label: "Right to left" },
          { value: "right", label: "Left to right" }
        ]
      },
      { key: "tilt", label: "Tilt (degrees)", kind: "range", min: -8, max: 8 },
      { key: "fill", label: "Background", kind: "color", hint: "Any CSS colour or gradient. Empty = transparent." },
      { key: "color", label: "Text colour", kind: "color" }
    ],
    mobileHeight: "content",
    render: (p) => {
      const separator = str(p.separator);
      const run = Array.from({ length: 6 }, () => `${str(p.text)}${separator ? `  ${separator}  ` : "   "}`).join("");
      const tilt = num(p.tilt, 0);
      return (
        <div
          className={`b-marquee b-marquee--${str(p.size, "l")}${tilt ? " b-marquee--tilted" : ""}`}
          style={{ background: color(p.fill), color: color(p.color), rotate: tilt ? `${tilt}deg` : undefined }}
        >
          <div
            className="b-marquee-track"
            style={{
              animationDuration: `${num(p.speed, 20)}s`,
              animationDirection: str(p.direction) === "right" ? "reverse" : "normal"
            }}
          >
            <span>{run}</span>
            <span aria-hidden="true">{run}</span>
          </div>
        </div>
      );
    }
  },
  {
    type: "button",
    label: "Button",
    category: "Actions",
    icon: "▭",
    description: "A link styled as a button",
    defaultSize: { w: 3, h: 2 },
    defaultProps: { label: "Get started", href: "#", variant: "solid", size: "m", align: "left", newTab: false },
    fields: [
      { key: "label", label: "Label", kind: "text" },
      { key: "href", label: "Link", kind: "link" },
      {
        key: "variant",
        label: "Style",
        kind: "select",
        options: [
          { value: "solid", label: "Solid" },
          { value: "outline", label: "Outline" },
          { value: "light", label: "Light (for coloured backgrounds)" },
          { value: "ghost", label: "Text link" }
        ]
      },
      {
        key: "size",
        label: "Size",
        kind: "select",
        options: [
          { value: "s", label: "Small" },
          { value: "m", label: "Medium" },
          { value: "l", label: "Large" }
        ]
      },
      alignField,
      { key: "newTab", label: "Open in new tab", kind: "toggle" }
    ],
    mobileHeight: "content",
    inlineEdit: [{ key: "label", selector: ".b-button", mode: "plain", lines: "single" }],
    render: (p, ctx) => (
      <div className="b-button-wrap" style={{ justifyContent: FLEX_ALIGN[str(p.align, "left")] }}>
        <a
          className={`b-button b-button--${str(p.variant, "solid")} b-button--${str(p.size, "m")}`}
          {...linkAttrs(ctx.link(str(p.href)), Boolean(p.newTab))}
        >
          {str(p.label)}
        </a>
      </div>
    )
  },
  {
    type: "image",
    label: "Image",
    category: "Media",
    icon: "▧",
    description: "Photo or illustration",
    defaultSize: { w: 5, h: 10 },
    defaultProps: { src: "", alt: "", fit: "cover", radius: -1 },
    fields: [
      { key: "src", label: "Image", kind: "image" },
      { key: "alt", label: "Alt text", kind: "text", hint: "Describe the image for screen readers." },
      { key: "decorative", label: "Decoration only (no description needed)", kind: "toggle" },
      {
        key: "fit",
        label: "Fit",
        kind: "select",
        options: [
          { value: "cover", label: "Fill (crop)" },
          { value: "contain", label: "Fit (no crop)" }
        ]
      },
      { key: "radius", label: "Corner radius", kind: "range", min: -1, max: 60, hint: "-1 uses the theme radius." }
    ],
    mobileHeight: "keep",
    render: (p, ctx) => {
      const radius = num(p.radius, -1);
      const borderRadius = radius < 0 ? "var(--radius)" : `${radius}px`;
      const src = ctx.asset(str(p.src));
      if (!src) {
        return str(p.src) ? (
          <div className="b-image" style={{ borderRadius }} />
        ) : (
          <div className="b-image b-image--empty" style={{ borderRadius }}>
            Add an image
          </div>
        );
      }
      return (
        <img
          className="b-image"
          src={src}
          alt={str(p.alt)}
          style={{ objectFit: str(p.fit, "cover") as CSSProperties["objectFit"], borderRadius }}
        />
      );
    }
  },
  {
    type: "card",
    label: "Card",
    category: "Layout",
    icon: "▤",
    description: "Eyebrow, title and text on a panel, with an optional image and link",
    defaultSize: { w: 4, h: 9 },
    defaultProps: {
      eyebrow: "01",
      title: "Card title",
      text: "A short description that explains the idea.",
      fill: "var(--surface)",
      textColor: "",
      align: "left",
      shadow: true,
      image: "",
      imageStyle: "top",
      alt: "",
      href: ""
    },
    fields: [
      { key: "image", label: "Image", kind: "image" },
      {
        key: "imageStyle",
        label: "Image placement",
        kind: "select",
        options: [
          { value: "top", label: "Above the text" },
          { value: "background", label: "Behind the text" }
        ]
      },
      { key: "alt", label: "Image description", kind: "text", hint: "For screen readers. Leave empty if the image is decoration." },
      { key: "eyebrow", label: "Eyebrow", kind: "text" },
      { key: "title", label: "Title", kind: "text" },
      { key: "text", label: "Text", kind: "textarea" },
      { key: "fill", label: "Fill", kind: "color", hint: "Any CSS colour or gradient." },
      { key: "textColor", label: "Text colour", kind: "color" },
      alignField,
      { key: "shadow", label: "Shadow", kind: "toggle" },
      { key: "href", label: "Link (whole card)", kind: "link", hint: "Makes the card clickable. Leave empty for a plain card." }
    ],
    mobileHeight: "content",
    inlineEdit: [
      { key: "eyebrow", selector: ".b-card-eyebrow", mode: "plain", lines: "single" },
      { key: "title", selector: ".b-card-title", mode: "plain", lines: "single" },
      { key: "text", selector: ".b-card-text", mode: "rich", lines: "paragraphs" }
    ],
    render: (p, ctx) => {
      const image = str(p.image);
      const behind = Boolean(image) && str(p.imageStyle, "top") === "background";
      const href = str(p.href);
      const Tag = href ? "a" : "div";
      return (
        <Tag
          className={`b-card${p.shadow ? " b-card--shadow" : ""}${behind ? " b-card--image-behind" : ""}${href ? " b-card--link" : ""}`}
          {...(href ? linkAttrs(ctx.link(href)) : {})}
          style={{
            background: behind
              ? `linear-gradient(rgb(0 0 0 / 0.1), rgb(0 0 0 / 0.7)), url("${ctx.asset(image)}") center / cover no-repeat`
              : color(p.fill),
            color: color(p.textColor),
            textAlign: str(p.align, "left") as CSSProperties["textAlign"]
          }}
        >
          {image && !behind && <img className="b-card-image" src={ctx.asset(image)} alt={str(p.alt)} loading="lazy" />}
          {str(p.eyebrow) && <span className="b-card-eyebrow">{str(p.eyebrow)}</span>}
          {str(p.title) && <h3 className="b-card-title">{str(p.title)}</h3>}
          {str(p.text) && (
            <div className="b-card-text">
              <Paragraphs text={str(p.text)} ctx={ctx} />
            </div>
          )}
        </Tag>
      );
    }
  },
  {
    type: "box",
    label: "Box",
    category: "Layout",
    icon: "□",
    description: "Colour panel for layering behind other blocks",
    defaultSize: { w: 6, h: 8 },
    defaultProps: { fill: "var(--surface)", radius: -1, borderColor: "", borderWidth: 0, shadow: false },
    fields: [
      { key: "fill", label: "Fill", kind: "color", hint: "Any CSS colour or gradient." },
      { key: "radius", label: "Corner radius", kind: "range", min: -1, max: 60, hint: "-1 uses the theme radius." },
      { key: "borderColor", label: "Border colour", kind: "color" },
      { key: "borderWidth", label: "Border width", kind: "range", min: 0, max: 12 },
      { key: "shadow", label: "Shadow", kind: "toggle" }
    ],
    mobileHeight: "keep",
    render: (p) => {
      const radius = num(p.radius, -1);
      const borderWidth = num(p.borderWidth, 0);
      return (
        <div
          className={`b-box${p.shadow ? " b-box--shadow" : ""}`}
          style={{
            background: color(p.fill),
            borderRadius: radius < 0 ? "var(--radius)" : `${radius}px`,
            border: borderWidth > 0 ? `${borderWidth}px solid ${str(p.borderColor) || "currentColor"}` : undefined
          }}
        />
      );
    }
  },
  {
    type: "divider",
    label: "Divider",
    category: "Layout",
    icon: "―",
    description: "Horizontal rule",
    defaultSize: { w: 12, h: 1 },
    defaultProps: { color: "", thickness: 1, lineStyle: "solid" },
    fields: [
      { key: "color", label: "Colour", kind: "color" },
      { key: "thickness", label: "Thickness", kind: "range", min: 1, max: 12 },
      {
        key: "lineStyle",
        label: "Style",
        kind: "select",
        options: [
          { value: "solid", label: "Solid" },
          { value: "dashed", label: "Dashed" },
          { value: "dotted", label: "Dotted" }
        ]
      }
    ],
    mobileHeight: "content",
    render: (p) => (
      <div className="b-divider">
        <hr
          style={{
            borderTopWidth: `${num(p.thickness, 1)}px`,
            borderTopStyle: str(p.lineStyle, "solid") as CSSProperties["borderTopStyle"],
            borderTopColor: color(p.color)
          }}
        />
      </div>
    )
  }
];

definitions.push(...interactiveDefinitions, ...contentDefinitions, ...codeDefinitions, ...vectorDefinitions, ...mediaDefinitions, ...motionDefinitions, ...blogDefinitions, ...contactDefinitions, ...searchDefinitions, ...businessDefinitions, ...languageDefinitions, ...socialDefinitions, ...collectionDefinitions, ...servicesDefinitions, ...componentDefinitions);

const byType = new Map(definitions.map((d) => [d.type, d]));

export const BLOCK_CATEGORIES: BlockCategory[] = ["Text", "Media", "Interactive", "Content", "Layout", "Actions", "Social", "Services", "Navigation"];

export function getBlockDefinition(type: string): BlockDefinition | undefined {
  return byType.get(type);
}

export function listBlockDefinitions(): BlockDefinition[] {
  return definitions;
}
