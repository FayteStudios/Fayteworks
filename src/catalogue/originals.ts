import type { CatalogueItem, CatalogueSource } from "./types";

const AVATAR = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2096%2096%22%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20fill%3D%22%23e7e2da%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%2238%22%20r%3D%2217%22%20fill%3D%22%23b9b1a5%22%2F%3E%3Cpath%20d%3D%22M14%2092c4-20%2018-30%2034-30s30%2010%2034%2030z%22%20fill%3D%22%23b9b1a5%22%2F%3E%3C%2Fsvg%3E";

const OWN: CatalogueSource = { library: "FayteWorks", author: "FayteWorks", url: "", licence: "CC0" };

const t = (key: string, label: string, value: string, kind: CatalogueItem["slots"][number]["kind"] = "text") => ({ key, label, kind, value });

export const originalItems: CatalogueItem[] = [
  {
    id: "fw-stats-row",
    name: "Stats row",
    category: "Sections",
    tags: ["numbers", "stats", "metrics", "facts"],
    size: { w: 12, h: 6 },
    fit: "stretch",
    html: `<dl class="stats">
  <div><dt>{{l1}}</dt><dd>{{n1}}</dd></div>
  <div><dt>{{l2}}</dt><dd>{{n2}}</dd></div>
  <div><dt>{{l3}}</dt><dd>{{n3}}</dd></div>
  <div><dt>{{l4}}</dt><dd>{{n4}}</dd></div>
</dl>`,
    css: `.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1.5rem; margin: 0; align-items: center; }
.stats div { display: flex; flex-direction: column-reverse; gap: 0.35rem; padding-left: 1rem; border-left: 3px solid var(--accent); }
.stats dd { margin: 0; font-family: var(--font-heading); font-size: clamp(2rem, 4cqi, 3rem); line-height: 1; color: var(--text); }
.stats dt { color: var(--muted); font-size: 0.9rem; }`,
    slots: [t("n1", "Number 1", "12+"), t("l1", "Label 1", "Years of practice"), t("n2", "Number 2", "140"), t("l2", "Label 2", "Projects shipped"), t("n3", "Number 3", "9"), t("l3", "Label 3", "Awards"), t("n4", "Number 4", "100%"), t("l4", "Label 4", "Coffee powered")],
    source: OWN
  },
  {
    id: "fw-feature-trio",
    name: "Three features",
    category: "Sections",
    tags: ["features", "services", "icons", "columns"],
    size: { w: 12, h: 10 },
    fit: "stretch",
    html: `<div class="features">
  <article><span class="icon">{{i1}}</span><h3>{{t1}}</h3><p>{{d1}}</p></article>
  <article><span class="icon">{{i2}}</span><h3>{{t2}}</h3><p>{{d2}}</p></article>
  <article><span class="icon">{{i3}}</span><h3>{{t3}}</h3><p>{{d3}}</p></article>
</div>`,
    css: `.features { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; }
.features article { padding: 1.5rem; border-radius: var(--radius); background: var(--surface); box-shadow: 0 1px 2px rgb(0 0 0 / 0.05), 0 10px 30px -18px rgb(0 0 0 / 0.3); }
.icon { display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border-radius: 50%; background: color-mix(in srgb, var(--accent) 15%, transparent); font-size: 1.3rem; }
h3 { margin: 1rem 0 0.4rem; font-family: var(--font-heading); font-size: 1.25rem; color: var(--text); }
p { margin: 0; color: var(--muted); line-height: 1.55; }`,
    slots: [
      t("i1", "Icon 1", "✦"), t("t1", "Title 1", "Design"), t("d1", "Text 1", "Identities, interfaces and everything in between.", "textarea"),
      t("i2", "Icon 2", "⚙"), t("t2", "Title 2", "Build"), t("d2", "Text 2", "Fast, accessible sites that are easy to keep up to date.", "textarea"),
      t("i3", "Icon 3", "↗"), t("t3", "Title 3", "Launch"), t("d3", "Text 3", "Hosting, analytics and a hand-over you can actually use.", "textarea")
    ],
    source: OWN
  },
  {
    id: "fw-steps",
    name: "Numbered steps",
    category: "Sections",
    tags: ["process", "steps", "how it works", "timeline"],
    size: { w: 12, h: 9 },
    fit: "stretch",
    html: `<ol class="steps">
  <li><h3>{{t1}}</h3><p>{{d1}}</p></li>
  <li><h3>{{t2}}</h3><p>{{d2}}</p></li>
  <li><h3>{{t3}}</h3><p>{{d3}}</p></li>
</ol>`,
    css: `.steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 2rem; counter-reset: step; }
.steps li { counter-increment: step; position: relative; padding-top: 3.25rem; }
.steps li::before { content: counter(step, decimal-leading-zero); position: absolute; top: 0; left: 0; font-family: var(--font-heading); font-size: 2.25rem; line-height: 1; color: var(--accent); }
.steps li::after { content: ""; position: absolute; top: 1.1rem; left: 3.5rem; right: 0; height: 1px; background: color-mix(in srgb, var(--text) 15%, transparent); }
h3 { margin: 0 0 0.4rem; font-family: var(--font-heading); font-size: 1.2rem; color: var(--text); }
p { margin: 0; color: var(--muted); line-height: 1.55; }`,
    slots: [
      t("t1", "Step 1", "Say hello"), t("d1", "Step 1 text", "Tell me about the project and what success looks like.", "textarea"),
      t("t2", "Step 2", "Shape it"), t("d2", "Step 2 text", "We sketch, test and refine until it feels right.", "textarea"),
      t("t3", "Step 3", "Ship it"), t("d3", "Step 3 text", "Launch, measure, and keep improving.", "textarea")
    ],
    source: OWN
  },
  {
    id: "fw-timeline",
    name: "Timeline",
    category: "Sections",
    tags: ["timeline", "history", "experience", "cv", "resume"],
    size: { w: 8, h: 14 },
    fit: "stretch",
    html: `<ul class="timeline">
  <li><time>{{y1}}</time><div><h3>{{t1}}</h3><p>{{d1}}</p></div></li>
  <li><time>{{y2}}</time><div><h3>{{t2}}</h3><p>{{d2}}</p></div></li>
  <li><time>{{y3}}</time><div><h3>{{t3}}</h3><p>{{d3}}</p></div></li>
</ul>`,
    css: `.timeline { list-style: none; margin: 0; padding: 0; }
.timeline li { display: grid; grid-template-columns: 5.5rem 1fr; gap: 1.25rem; position: relative; padding-bottom: 1.75rem; }
.timeline li::before { content: ""; position: absolute; left: 5.5rem; top: 0.45rem; width: 11px; height: 11px; margin-left: 0.07rem; border-radius: 50%; background: var(--accent); }
.timeline li:not(:last-child)::after { content: ""; position: absolute; left: calc(5.5rem + 0.39rem); top: 1.2rem; bottom: 0; width: 2px; background: color-mix(in srgb, var(--text) 12%, transparent); }
.timeline li > div { padding-left: 1.4rem; }
time { font-weight: 700; color: var(--muted); font-variant-numeric: tabular-nums; }
h3 { margin: 0 0 0.3rem; font-family: var(--font-heading); font-size: 1.15rem; color: var(--text); }
p { margin: 0; color: var(--muted); line-height: 1.55; }`,
    slots: [
      t("y1", "Year 1", "2025"), t("t1", "Title 1", "Lead designer, Studio North"), t("d1", "Text 1", "Led a small team across brand and product work.", "textarea"),
      t("y2", "Year 2", "2022"), t("t2", "Title 2", "Freelance"), t("d2", "Text 2", "Websites and identities for independent businesses.", "textarea"),
      t("y3", "Year 3", "2019"), t("t3", "Title 3", "Graduated"), t("d3", "Text 3", "BA in Graphic Communication.", "textarea")
    ],
    source: OWN
  },
  {
    id: "fw-cta-banner",
    name: "Call-to-action banner",
    category: "Sections",
    tags: ["cta", "banner", "gradient", "contact"],
    size: { w: 12, h: 9 },
    fit: "stretch",
    html: `<div class="cta">
  <div><h2>{{title}}</h2><p>{{text}}</p></div>
  <a href="{{link}}">{{button}} <span aria-hidden="true">→</span></a>
</div>`,
    css: `.cta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.5rem; height: 100%; box-sizing: border-box; padding: clamp(1.5rem, 4cqi, 3rem); border-radius: var(--radius); color: var(--accent-text); background: linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #6a3cff)); }
h2 { margin: 0 0 0.4rem; font-family: var(--font-heading); font-size: clamp(1.6rem, 3.5cqi, 2.4rem); line-height: 1.1; }
p { margin: 0; opacity: 0.85; max-width: 46ch; }
a { display: inline-flex; gap: 0.5rem; padding: 0.9rem 1.5rem; border-radius: 999px; background: var(--accent-text); color: var(--accent); font-weight: 700; text-decoration: none; transition: transform 0.2s; }
a:hover { transform: translateY(-2px); }
a span { transition: transform 0.2s; }
a:hover span { transform: translateX(3px); }`,
    slots: [t("title", "Title", "Have a project in mind?"), t("text", "Text", "I'm booking work for next season. Let's talk about what you need.", "textarea"), t("button", "Button label", "Get in touch"), t("link", "Button link", "", "link")],
    source: OWN
  },
  {
    id: "fw-contact-strip",
    name: "Big email link",
    category: "Sections",
    tags: ["contact", "email", "footer", "typography"],
    size: { w: 12, h: 8 },
    fit: "start",
    html: `<div class="contact">
  <p>{{eyebrow}}</p>
  <a href="{{link}}">{{email}}</a>
</div>`,
    css: `.contact p { margin: 0 0 0.75rem; text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.8rem; font-weight: 700; color: var(--muted); }
.contact a { font-family: var(--font-heading); font-size: clamp(1.8rem, 6cqi, 4.5rem); line-height: 1.05; color: var(--text); text-decoration: none; background: linear-gradient(var(--accent), var(--accent)) left bottom / 0% 0.08em no-repeat; transition: background-size 0.4s ease; overflow-wrap: anywhere; }
.contact a:hover { background-size: 100% 0.08em; }`,
    slots: [t("eyebrow", "Small heading", "Let's work together"), t("email", "Link text", "hello@example.com"), t("link", "Link", "mailto:hello@example.com", "link")],
    source: OWN
  },
  {
    id: "fw-announcement",
    name: "Announcement pill",
    category: "Text",
    tags: ["announcement", "news", "badge", "hero"],
    size: { w: 6, h: 3 },
    html: `<a class="announce" href="{{link}}"><span class="new">{{badge}}</span>{{text}}<span class="arrow" aria-hidden="true">→</span></a>`,
    css: `.announce { display: inline-flex; align-items: center; gap: 0.65rem; padding: 0.35rem 0.9rem 0.35rem 0.35rem; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--text) 14%, transparent); background: var(--surface); color: var(--text); font-size: 0.9rem; text-decoration: none; transition: border-color 0.2s; }
.announce:hover { border-color: var(--accent); }
.new { padding: 0.2rem 0.6rem; border-radius: 999px; background: var(--accent); color: var(--accent-text); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.arrow { color: var(--muted); transition: transform 0.2s; }
.announce:hover .arrow { transform: translateX(3px); }`,
    slots: [t("badge", "Badge", "New"), t("text", "Text", "The spring collection is live"), t("link", "Link", "", "link")],
    source: OWN
  },
  {
    id: "fw-big-quote",
    name: "Big quote",
    category: "Text",
    tags: ["quote", "testimonial", "typography"],
    size: { w: 8, h: 9 },
    fit: "start",
    html: `<figure class="quote">
  <blockquote>{{quote}}</blockquote>
  <figcaption><strong>{{name}}</strong> {{role}}</figcaption>
</figure>`,
    css: `.quote { margin: 0; position: relative; padding-left: 2.2rem; }
.quote::before { content: "“"; position: absolute; left: -0.2rem; top: -1.1rem; font-family: Georgia, serif; font-size: 5rem; line-height: 1; color: var(--accent); }
blockquote { margin: 0; font-family: var(--font-heading); font-size: clamp(1.35rem, 2.6cqi, 2rem); line-height: 1.3; color: var(--text); }
figcaption { margin-top: 1rem; color: var(--muted); }
figcaption strong { color: var(--text); margin-right: 0.35rem; }`,
    slots: [t("quote", "Quote", "They listened, then built exactly what we needed, and a bit more.", "textarea"), t("name", "Name", "Sam Rivera"), t("role", "Role", "Founder, Fieldnotes")],
    source: OWN
  },
  {
    id: "fw-profile-card",
    name: "Profile card",
    category: "Cards",
    tags: ["team", "profile", "person", "about", "avatar"],
    size: { w: 4, h: 14 },
    html: `<article class="profile">
  <img src="{{photo}}" alt="">
  <h3>{{name}}</h3>
  <p class="role">{{role}}</p>
  <p>{{bio}}</p>
</article>`,
    css: `.profile { width: min(100%, 300px); text-align: center; padding: 2rem 1.5rem; border-radius: var(--radius); background: var(--surface); box-shadow: 0 1px 2px rgb(0 0 0 / 0.05), 0 16px 40px -24px rgb(0 0 0 / 0.35); }
img { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; background: color-mix(in srgb, var(--accent) 20%, var(--surface)); outline: 3px solid var(--surface); box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 45%, transparent); }
img:not([src]), img[src=""] { visibility: hidden; }
h3 { margin: 1.1rem 0 0.2rem; font-family: var(--font-heading); font-size: 1.3rem; color: var(--text); }
.role { margin: 0 0 0.8rem; color: var(--accent); font-weight: 700; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; }
p { margin: 0; color: var(--muted); line-height: 1.5; }`,
    slots: [t("photo", "Photo", AVATAR, "image"), t("name", "Name", "Alex Moreno"), t("role", "Role", "Illustrator"), t("bio", "Bio", "Draws for books, bands and the occasional wall.", "textarea")],
    source: OWN
  },
  {
    id: "fw-glass-card",
    name: "Glass card",
    category: "Cards",
    tags: ["glass", "blur", "overlay", "frosted"],
    size: { w: 5, h: 10 },
    dark: true,
    html: `<div class="glass">
  <p class="label">{{label}}</p>
  <h3>{{title}}</h3>
  <p>{{text}}</p>
</div>`,
    css: `.glass { max-width: 380px; padding: 1.75rem; border-radius: calc(var(--radius) + 6px); color: #fff; background: rgb(255 255 255 / 0.12); border: 1px solid rgb(255 255 255 / 0.28); backdrop-filter: blur(14px) saturate(140%); -webkit-backdrop-filter: blur(14px) saturate(140%); box-shadow: 0 20px 50px -20px rgb(0 0 0 / 0.5); }
.label { margin: 0 0 0.6rem; font-size: 0.75rem; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.75; }
h3 { margin: 0 0 0.5rem; font-family: var(--font-heading); font-size: 1.6rem; line-height: 1.15; }
p { margin: 0; line-height: 1.55; opacity: 0.9; }`,
    slots: [t("label", "Label", "Featured"), t("title", "Title", "Put me on top of a photo"), t("text", "Text", "Place this on a layer above an image block to get the frosted-glass effect.", "textarea")],
    source: OWN
  },
  {
    id: "fw-available-badge",
    name: "Availability badge",
    category: "Badges",
    tags: ["status", "available", "pulse", "badge"],
    size: { w: 3, h: 2 },
    html: `<span class="status"><span class="dot"></span>{{text}}</span>`,
    css: `.status { display: inline-flex; align-items: center; gap: 0.55rem; padding: 0.4rem 0.85rem; border-radius: 999px; background: var(--surface); color: var(--text); font-size: 0.85rem; font-weight: 600; box-shadow: 0 0 0 1px color-mix(in srgb, var(--text) 10%, transparent); }
.dot { position: relative; width: 8px; height: 8px; border-radius: 50%; background: {{color}}; }
.dot::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: {{color}}; animation: pulse 1.8s ease-out infinite; }
@keyframes pulse { from { transform: scale(1); opacity: 0.7; } to { transform: scale(3); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .dot::after { animation: none; } }`,
    slots: [t("text", "Text", "Available for work"), t("color", "Dot colour", "#22c55e", "color")],
    source: OWN
  },
  {
    id: "fw-tag-row",
    name: "Tag row",
    category: "Badges",
    tags: ["tags", "chips", "skills", "pills"],
    size: { w: 6, h: 3 },
    fit: "start",
    html: `<ul class="tags"><li>{{t1}}</li><li>{{t2}}</li><li>{{t3}}</li><li>{{t4}}</li></ul>`,
    css: `.tags { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
.tags li { padding: 0.35rem 0.85rem; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--text) 18%, transparent); color: var(--text); font-size: 0.85rem; }
.tags li:empty { display: none; }`,
    slots: [t("t1", "Tag 1", "Branding"), t("t2", "Tag 2", "Web design"), t("t3", "Tag 3", "Illustration"), t("t4", "Tag 4", "Motion")],
    source: OWN
  },
  {
    id: "fw-underline-link",
    name: "Underline sweep link",
    category: "Buttons",
    tags: ["link", "underline", "hover", "minimal"],
    size: { w: 3, h: 2 },
    html: `<a class="sweep" href="{{link}}">{{label}}</a>`,
    css: `.sweep { position: relative; color: var(--text); font-weight: 600; text-decoration: none; padding-bottom: 2px; }
.sweep::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--accent); transform: scaleX(0.25); transform-origin: left; transition: transform 0.35s ease; }
.sweep:hover::after { transform: scaleX(1); }`,
    slots: [t("label", "Label", "See all projects"), t("link", "Link", "", "link")],
    source: OWN
  },
  {
    id: "fw-arrow-circle",
    name: "Arrow circle button",
    category: "Buttons",
    tags: ["button", "arrow", "circle", "hover"],
    size: { w: 3, h: 3 },
    html: `<a class="go" href="{{link}}"><span class="circle" aria-hidden="true">→</span>{{label}}</a>`,
    css: `.go { display: inline-flex; align-items: center; gap: 0.8rem; color: var(--text); font-weight: 700; text-decoration: none; }
.circle { display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border-radius: 50%; border: 1.5px solid var(--text); transition: background 0.25s, color 0.25s, transform 0.25s; }
.go:hover .circle { background: var(--accent); border-color: var(--accent); color: var(--accent-text); transform: rotate(-45deg); }`,
    slots: [t("label", "Label", "Start a project"), t("link", "Link", "", "link")],
    source: OWN
  },
  {
    id: "fw-labelled-divider",
    name: "Divider with label",
    category: "Decoration",
    tags: ["divider", "separator", "line"],
    size: { w: 12, h: 2 },
    fit: "stretch",
    html: `<div class="divider"><span>{{text}}</span></div>`,
    css: `.divider { display: flex; align-items: center; gap: 1rem; color: var(--muted); font-size: 0.8rem; letter-spacing: 0.14em; text-transform: uppercase; }
.divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: color-mix(in srgb, var(--text) 18%, transparent); }`,
    slots: [t("text", "Label", "Selected work")],
    source: OWN
  },
  {
    id: "fw-gradient-orb",
    name: "Glowing orb",
    category: "Decoration",
    tags: ["background", "gradient", "blur", "animated", "blob"],
    size: { w: 5, h: 12 },
    fit: "stretch",
    html: `<div class="orb" aria-hidden="true"></div>`,
    css: `.orb { width: 100%; height: 100%; min-height: 120px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, {{c1}}, transparent 60%), radial-gradient(circle at 70% 65%, {{c2}}, transparent 55%); filter: blur(30px); opacity: 0.8; animation: drift 12s ease-in-out infinite alternate; }
@keyframes drift { to { transform: translate(4%, -3%) scale(1.08) rotate(20deg); } }
@media (prefers-reduced-motion: reduce) { .orb { animation: none; } }`,
    slots: [t("c1", "Colour 1", "var(--accent)", "color"), t("c2", "Colour 2", "#6a3cff", "color")],
    source: OWN
  }
];
