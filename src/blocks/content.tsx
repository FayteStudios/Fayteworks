import type { CSSProperties } from "react";
import { slugify } from "../util/slug";
import { linkAttrs, RichText } from "../site/richText";
import type { BlockDefinition } from "./types";
import { alignField, list, num, Paragraphs, str } from "./util";

function Stars({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="b-stars" role="img" aria-label={`${count} out of 5 stars`}>
      {"★★★★★".slice(0, count)}
      <span aria-hidden>{"★★★★★".slice(count)}</span>
    </div>
  );
}

export const contentDefinitions: BlockDefinition[] = [
  {
    type: "list",
    label: "List",
    category: "Text",
    icon: "•",
    description: "Bulleted, numbered or ticked list",
    defaultSize: { w: 6, h: 5 },
    defaultProps: { items: "First point\nSecond point\nThird point", style: "bullets", size: "m", color: "" },
    fields: [
      { key: "items", label: "Items", kind: "textarea", hint: "One per line. **bold**, _italic_, [link](…) work." },
      {
        key: "style",
        label: "Style",
        kind: "select",
        options: [
          { value: "bullets", label: "Bullets" },
          { value: "numbers", label: "Numbers" },
          { value: "ticks", label: "Ticks" }
        ]
      },
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
      { key: "color", label: "Colour", kind: "color" }
    ],
    mobileHeight: "content",
    inlineEdit: [{ key: "items", selector: ".b-list", mode: "rich", lines: "lines" }],
    render: (p, ctx) => {
      const items = str(p.items).split("\n").filter((line) => line.trim());
      const Tag = str(p.style) === "numbers" ? "ol" : "ul";
      return (
        <Tag
          className={`b-list b-list--${str(p.style, "bullets")}`}
          style={{ fontSize: ({ s: "0.9rem", m: "1.05rem", l: "1.25rem" } as Record<string, string>)[str(p.size, "m")], color: str(p.color) || undefined }}
        >
          {items.map((item, i) => (
            <li key={i}>
              <RichText text={item} ctx={ctx} />
            </li>
          ))}
        </Tag>
      );
    }
  },
  {
    type: "testimonial",
    label: "Testimonial",
    category: "Content",
    icon: "❝",
    description: "A quote from a happy client, with name, role and photo",
    defaultSize: { w: 6, h: 9 },
    defaultProps: {
      quote: "Working together was a joy. The site went live in a week and our bookings doubled.",
      name: "Alex Rivera",
      role: "Owner, Rivera Studio",
      avatar: "",
      rating: 5,
      style: "card",
      align: "left"
    },
    fields: [
      { key: "quote", label: "Quote", kind: "textarea", hint: "**bold**, _italic_, [link](https://…). Or double-click on the canvas." },
      { key: "name", label: "Name", kind: "text" },
      { key: "role", label: "Role / company", kind: "text" },
      { key: "avatar", label: "Photo", kind: "image" },
      { key: "rating", label: "Stars", kind: "range", min: 0, max: 5, hint: "0 hides the stars." },
      {
        key: "style",
        label: "Style",
        kind: "select",
        options: [
          { value: "card", label: "Card" },
          { value: "plain", label: "Plain" },
          { value: "large", label: "Large statement" }
        ]
      },
      alignField
    ],
    mobileHeight: "content",
    inlineEdit: [
      { key: "quote", selector: ".b-testimonial blockquote", mode: "rich", lines: "paragraphs" },
      { key: "name", selector: ".b-testimonial-name", mode: "plain", lines: "single" },
      { key: "role", selector: ".b-testimonial-role", mode: "plain", lines: "single" }
    ],
    render: (p, ctx) => {
      const avatar = ctx.asset(str(p.avatar));
      const align = str(p.align, "left");
      return (
        <figure className={`b-testimonial b-testimonial--${str(p.style, "card")}`} style={{ textAlign: align as CSSProperties["textAlign"] }}>
          <Stars count={Math.round(num(p.rating, 0))} />
          <blockquote>
            <Paragraphs text={str(p.quote)} ctx={ctx} />
          </blockquote>
          <figcaption style={{ justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : undefined }}>
            {avatar && <img className="b-testimonial-avatar" src={avatar} alt="" />}
            <span>
              <span className="b-testimonial-name">{str(p.name)}</span>
              {str(p.role) && <span className="b-testimonial-role">{str(p.role)}</span>}
            </span>
          </figcaption>
        </figure>
      );
    }
  },
  {
    type: "pricing",
    label: "Pricing card",
    category: "Content",
    icon: "$",
    description: "A plan with price, features and a button. Place a few side by side.",
    defaultSize: { w: 4, h: 18 },
    defaultProps: {
      plan: "Studio",
      price: "$29",
      period: "/ month",
      description: "Everything a small team needs.",
      features: "Unlimited pages\nCustom domain\nPriority support",
      buttonLabel: "Choose Studio",
      buttonHref: "",
      featured: false,
      badge: "Most popular"
    },
    fields: [
      { key: "plan", label: "Plan name", kind: "text" },
      { key: "price", label: "Price", kind: "text", placeholder: "$29" },
      { key: "period", label: "Period", kind: "text", placeholder: "/ month" },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "features", label: "Features", kind: "textarea", hint: "One per line. **bold** and [links](…) work." },
      { key: "buttonLabel", label: "Button label", kind: "text" },
      { key: "buttonHref", label: "Button link", kind: "link" },
      { key: "featured", label: "Highlight this plan", kind: "toggle" },
      { key: "badge", label: "Highlight badge", kind: "text", placeholder: "Most popular" }
    ],
    mobileHeight: "content",
    inlineEdit: [
      { key: "plan", selector: ".b-pricing-plan", mode: "plain", lines: "single" },
      { key: "price", selector: ".b-pricing-amount", mode: "plain", lines: "single" },
      { key: "period", selector: ".b-pricing-period", mode: "plain", lines: "single" },
      { key: "description", selector: ".b-pricing-description", mode: "plain", lines: "single" }
    ],
    render: (p, ctx) => {
      const featured = Boolean(p.featured);
      const features = str(p.features)
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean);
      return (
        <div className={`b-pricing${featured ? " b-pricing--featured" : ""}`}>
          {featured && str(p.badge) && <span className="b-pricing-badge">{str(p.badge)}</span>}
          <h3 className="b-pricing-plan">{str(p.plan)}</h3>
          <div className="b-pricing-price">
            <span className="b-pricing-amount">{str(p.price)}</span>
            {str(p.period) && <span className="b-pricing-period">{str(p.period)}</span>}
          </div>
          {str(p.description) && <p className="b-pricing-description">{str(p.description)}</p>}
          {features.length > 0 && (
            <ul className="b-pricing-features">
              {features.map((f, i) => (
                <li key={i}>
                  <RichText text={f} ctx={ctx} />
                </li>
              ))}
            </ul>
          )}
          {str(p.buttonLabel) && (
            <a
              className={`b-button b-button--${featured ? "solid" : "outline"} b-button--m b-pricing-button`}
              {...linkAttrs(ctx.link(str(p.buttonHref)))}
            >
              {str(p.buttonLabel)}
            </a>
          )}
        </div>
      );
    }
  },
  {
    type: "form",
    badges: ["account"],
    label: "Contact form",
    category: "Content",
    icon: "✉",
    description: "Visitors send you a message. Works with free services, no server needed.",
    defaultSize: { w: 6, h: 18 },
    defaultProps: {
      service: "formspree",
      endpoint: "",
      email: "",
      formName: "contact",
      fields: [
        { label: "Name", type: "text", required: true, placeholder: "" },
        { label: "Email", type: "email", required: true, placeholder: "you@example.com" },
        { label: "Message", type: "textarea", required: true, placeholder: "" }
      ],
      buttonLabel: "Send message"
    },
    fields: [
      {
        key: "service",
        label: "Send messages with",
        kind: "select",
        options: [
          { value: "formspree", label: "Formspree (free plan)" },
          { value: "netlify", label: "Netlify Forms (if hosted on Netlify)" },
          { value: "email", label: "Visitor's email app (mailto)" },
          { value: "custom", label: "Another service (form URL)" }
        ],
        hint: "Formspree: sign up at formspree.io, create a form, paste its URL below."
      },
      { key: "endpoint", label: "Form URL (Formspree / other)", kind: "text", placeholder: "https://formspree.io/f/abcdwxyz" },
      { key: "email", label: "Your email (mailto only)", kind: "text", placeholder: "hello@example.com" },
      { key: "formName", label: "Form name (Netlify only)", kind: "text", hint: "Shown in your Netlify dashboard." },
      {
        key: "spam",
        label: "Spam protection",
        kind: "select",
        options: [
          { value: "", label: "Hidden trap field (always on)" },
          { value: "recaptcha", label: "Plus a “I'm not a robot” check (Netlify only)" }
        ],
        hint: "Formspree filters spam for you. On Netlify, add the check if the trap isn't enough."
      },
      {
        key: "fields",
        label: "Fields",
        kind: "list",
        itemLabel: "field",
        itemTitleKey: "label",
        newItem: { label: "Phone", type: "tel", required: false, placeholder: "" },
        itemFields: [
          { key: "label", label: "Label", kind: "text" },
          {
            key: "type",
            label: "Type",
            kind: "select",
            options: [
              { value: "text", label: "Short text" },
              { value: "email", label: "Email" },
              { value: "tel", label: "Phone" },
              { value: "textarea", label: "Long text" }
            ]
          },
          { key: "placeholder", label: "Placeholder", kind: "text" },
          { key: "required", label: "Required", kind: "toggle" }
        ]
      },
      { key: "buttonLabel", label: "Button label", kind: "text" }
    ],
    mobileHeight: "content",
    inlineEdit: [{ key: "buttonLabel", selector: ".b-form .b-button", mode: "plain", lines: "single" }],
    render: (p, ctx) => {
      const service = str(p.service, "formspree");
      const formName = slugify(str(p.formName, "contact"));
      const action =
        service === "email" ? (str(p.email) ? `mailto:${str(p.email)}` : "") : service === "netlify" ? "" : str(p.endpoint);
      const configured = service === "netlify" || Boolean(action);
      const honeypot = service === "netlify" ? "bot-field" : "_gotcha";
      return (
        <form
          className="b-form"
          method="POST"
          action={action || undefined}
          encType={service === "email" ? "text/plain" : undefined}
          name={service === "netlify" ? formName : undefined}
          data-netlify={service === "netlify" ? "true" : undefined}
          data-netlify-honeypot={service === "netlify" ? "bot-field" : undefined}
          data-netlify-recaptcha={service === "netlify" && str(p.spam) === "recaptcha" ? "true" : undefined}
        >
          {service === "netlify" && <input type="hidden" name="form-name" value={formName} />}
          <p className="b-form-trap" aria-hidden="true">
            <label>
              Leave this empty <input name={honeypot} tabIndex={-1} autoComplete="off" />
            </label>
          </p>
          {list(p.fields).map((f, i) => {
            const label = str(f.label, `Field ${i + 1}`);
            const common = {
              name: slugify(label),
              required: Boolean(f.required),
              placeholder: str(f.placeholder) || undefined
            };
            return (
              <label key={i} className="b-form-field">
                <span>
                  {label}
                  {f.required ? <span aria-hidden> *</span> : null}
                </span>
                {str(f.type) === "textarea" ? <textarea rows={5} {...common} /> : <input type={str(f.type, "text")} {...common} />}
              </label>
            );
          })}
          {service === "netlify" && str(p.spam) === "recaptcha" && <div className="b-form-captcha" data-netlify-recaptcha="true" />}
          <button type="submit" className="b-button b-button--solid b-button--m">
            {str(p.buttonLabel, "Send")}
          </button>
          {ctx.isEditor && !configured && (
            <p className="b-form-setup">Choose where messages go in the inspector before publishing.</p>
          )}
        </form>
      );
    }
  },
  {
    type: "map",
    badges: ["free"],
    label: "Map",
    category: "Media",
    icon: "⌖",
    description: "A map of an address (Google Maps) or coordinates (OpenStreetMap). Loads only when a visitor asks.",
    defaultSize: { w: 6, h: 12 },
    defaultProps: { provider: "google", query: "Eiffel Tower, Paris", coords: "", zoom: 14, label: "", onClick: true, grayscale: false },
    fields: [
      {
        key: "provider",
        label: "Map",
        kind: "select",
        options: [
          { value: "google", label: "Google Maps (by address)" },
          { value: "osm", label: "OpenStreetMap (by coordinates)" }
        ]
      },
      { key: "query", label: "Address or place", kind: "text", placeholder: "Street, city", hint: "Google Maps: any address or place name." },
      {
        key: "coords",
        label: "Coordinates",
        kind: "text",
        placeholder: "48.8584, 2.2945",
        hint: "OpenStreetMap: latitude, longitude. Right-click a spot on openstreetmap.org and choose “Show address” to copy them."
      },
      { key: "zoom", label: "Zoom", kind: "range", min: 3, max: 19 },
      { key: "label", label: "Label on the map card", kind: "text", placeholder: "Defaults to the address" },
      {
        key: "onClick",
        label: "Load the map when clicked",
        kind: "toggle",
        hint: "Recommended: nothing is loaded from the map provider (and no cookies set) until a visitor asks."
      },
      { key: "grayscale", label: "Black and white", kind: "toggle" }
    ],
    mobileHeight: "keep",
    render: (p) => {
      const map = mapLinks(p);
      if (!map) return <div className="b-map b-map--empty">Enter an address (or coordinates for OpenStreetMap)</div>;
      const label = str(p.label) || map.name;
      return (
        <div className={`b-map${p.grayscale ? " b-map--gray" : ""}`} data-js={p.onClick !== false ? "embed" : undefined} data-embed={map.embed} data-title={`Map: ${label}`}>
          {p.onClick !== false ? (
            <a className="embed-poster b-map-poster" href={map.open} target="_blank" rel="noopener noreferrer" aria-label={`Show map: ${label}`}>
              <span className="b-map-pin" aria-hidden>⌖</span>
              <span className="b-map-label">{label}</span>
              <span className="b-map-show">Show map</span>
            </a>
          ) : (
            <iframe className="embed-frame" src={map.embed} title={`Map: ${label}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          )}
        </div>
      );
    }
  }
];


function mapLinks(p: Record<string, unknown>): { embed: string; open: string; name: string } | null {
  const zoom = Math.round(Math.min(19, Math.max(3, Number(p.zoom) || 14)));
  if (p.provider === "osm") {
    const match = String(p.coords ?? "").match(/(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    const half = 180 / 2 ** zoom;
    const bbox = [lon - half * 1.6, lat - half, lon + half * 1.6, lat + half].map((n) => n.toFixed(5)).join(",");
    return {
      embed: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`,
      open: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`,
      name: String(p.query ?? "").trim() || `${lat.toFixed(4)}, ${lon.toFixed(4)}`
    };
  }
  const query = String(p.query ?? "").trim();
  if (!query) return null;
  const q = encodeURIComponent(query);
  return {
    embed: `https://maps.google.com/maps?q=${q}&z=${zoom}&output=embed`,
    open: `https://www.google.com/maps/search/?api=1&query=${q}`,
    name: query
  };
}
