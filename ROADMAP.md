# FayteWorks — Roadmap

A self-owned alternative to WordPress / Squarespace: a visual grid editor that outputs plain,
host-anywhere websites. No subscriptions, no lock-in — a site is a JSON file, and the output is
static HTML/CSS you can drop on GitHub Pages, Netlify or Cloudflare Pages for free.

## Core design rules

1. **Content is data.** A site is `Site → Pages → Sections → Blocks`, stored as JSON. The editor
   and the exported site both render from that data.
2. **Page shells are separate from content.** Navigation and structure (the scrolling page, a
   slide deck) wrap the sections without owning them. Swapping a shell must never destroy content.
3. **Every block is a registry entry.** A block definition = default props + inspector fields +
   render function. The component catalogue adds entries to the registry. The editor core never
   changes for it.
4. **Licences are tracked.** Anything pulled into the catalogue records its source URL and
   licence (MIT / ISC / CC0 only), so everything we ship is legally reusable.

## Phases

### Phase 0: Foundation ✅
- Editor shell: block library, canvas, inspector, top bar
- Sections laid out on a 12-column grid; drag to place, handles to resize, drag library → grid
- Core blocks: Heading, Text, Button, Image, Card, Box, Divider
- Site theme (colours, fonts, radius, width) as CSS variables; theme-token colour swatches
- Pages, undo/redo, keyboard shortcuts, autosave, JSON import/export
- Desktop / tablet / mobile preview (mobile auto-stacks via container queries)

### Phase 1: Publish ✅
- Static export to .zip or straight into a folder: `index.html`, `about/index.html`, … + `site.css` +
  `assets/`, all links relative so it works on any host or sub-path
- Per-page search description + social image; site favicon, language, public address → sitemap.xml,
  canonical URLs, robots.txt
- Shared header/footer sections on every page; Navigation block (collapses to a menu on phones) and
  Footer block; internal page links that survive renames
- Uploaded images stored in IndexedDB by content hash; site files bundle them for portability
- Grid rows grow to fit content, so text never overlaps the rows below on any screen width
- Freeform editing + Check panel: arrange roughly with fixed rows, then review overflow/overlap
  suggestions and apply fixes (minimal "make room" pushes), per screen size

### Phase 1.5: Layers, components, screen sizes ✅
- Device presets as Desktop / Tablet / Phone tabs (Full HD, laptops, iPads, iPhones, Pixel, Galaxy) with
  portrait/landscape; large screens are scaled to fit, true device height with its own scrolling
- Per-size layouts: Desktop / Tablet (≤1100px) / Phone (≤700px) tiers; any section can get its own
  tablet or phone arrangement, blocks can be hidden per size (gaps close up), each tier has its own min height
- Layers per section: show/hide, lock, rename, reorder, focus mode (others dim and click-through);
  overlaps only count within a layer; Marquee block for banner-between-layers effects
- Saved components: save sections, reuse on any page/site, live thumbnails, export/import files
  (first step toward a shared/community catalogue)

### Phase 2: Editing comfort ✅
- Inline text editing on the canvas (double-click); rich text with bold / italic / links stored as a small
  escaped Markdown-like syntax; paste is plain text
- Multi-select (Shift-click, selection box, Ctrl+A), group move / nudge / duplicate / delete, align tools
- Copy / cut / paste of blocks and whole sections across sections, pages and editor tabs
- Alignment guides while dragging
- Google Fonts picker; exports self-host the font files by default
- Custom screen size (any width × height)
- Block-group components (save a selection, drop it into any section, layers preserved)

### Later (parked, revisit when a real site needs it)

### Phase 3: Rich components + templates ✅
- Interactive blocks: carousel (swipe, arrows, dots, autoplay), gallery + lightbox, FAQ / accordion,
  tabs, video (YouTube/Vimeo load only on play; uploaded files supported)
- Content blocks: testimonial, pricing card, contact form (Formspree, Netlify Forms, email; spam trap)
- Motion on any block: appear-on-scroll animations with stagger delays, hover effects
- One tiny self-contained script (site.js) only on pages that need it; every block still works without JS
- List fields in the inspector (slides, images, questions, tabs, form fields)
- 12 section templates in Add → Section templates; File → New showcase site uses every component
- Parallax: section backgrounds (gentle / strong / fixed) and any block (Motion → Parallax, faster or slower than
  the page); off for reduced motion
- Map block: Google Maps by address or OpenStreetMap by coordinates; loads only when clicked (optional), link
  fallback without JavaScript

### Phase 4: Component catalogue ✅
- "Custom code" block: any HTML + CSS. The CSS is scoped to the block (selectors are prefixed and keyframes
  renamed), and scripts, event handlers, iframes and javascript: links are stripped. `{{name}}` placeholders
  become ordinary inspector fields (text, multi-line, link, image, colour)
- Catalogue browser (Add → Browse component catalogue): live previews in the site's theme, search, categories
- 28 components: 16 made for FayteWorks (CC0, follow the theme) and 12 from Uiverse (MIT, copied as published
  with text/links made editable, and buttons turned into links)
- Import code: paste HTML + CSS (a `<style>` block is split out), pick the licence (required), and its text,
  links and images become fields. Tailwind snippets are flagged, since they need Tailwind's stylesheet
- Every component keeps its name, author, source, licence and copyright line; exports include
  `third-party-notices.txt` for MIT/ISC code
- Component search: the whole Uiverse collection (about 3,400 plain-CSS components, MIT) is searchable by name,
  kind, tag or author. The index ships with the app (`tools/catalogue/build-uiverse-index.mjs` rebuilds it from a
  clone and checks the licence is still MIT); each component downloads from the indexed commit when its preview
  scrolls into view. Filters for kind and style (animated, neon, glass…), light/dark previews, favourites, recently
  used, endless scrolling, and a link to each original
- Tailwind: the editor compiles Tailwind CSS (v4) itself, so any custom code block can be styled with utility
  classes (inspector → Tailwind classes), including the site theme as Tailwind names (`bg-site-accent`,
  `text-site-muted`, `font-heading`, `rounded-site`). The classes become plain scoped CSS stored with the block;
  published sites never load Tailwind. Breakpoints (`sm:` `md:` `lg:`…) follow the site's width, so the editor's
  phone and tablet views show them. Pasted Tailwind code is detected and compiled
- Tailwind libraries: HyperUI (289), Meraki UI (196) and Flowbite (310) join the catalogue, about 800 static
  components (ones needing JavaScript are skipped). HyperUI and Meraki have dark versions (shown with the dark
  preview background). Flowbite's design tokens (`bg-brand`, `text-heading`…) follow the site theme, so its
  components match any site. `tools/catalogue/build-tailwind-index.mjs` rebuilds the index. Preline is left out: it
  is dual-licensed (MIT plus its own Fair Use License)
- Later: a shared/community catalogue

### Phase 4b: Drawings (vector graphics) ✅
- Drawing block: SVG kept as drawn (so Inkscape/Illustrator round trips keep their layers), rendered with ids and
  styles scoped per block, clipped to its box. Named layers become fields (text) and hide toggles; colours can be
  linked to theme tokens. Imports are cleaned of scripts, handlers and outside resources
- Built-in vector editor (paper.js, MIT): selection with scale/rotate handles, direct point and handle editing, pen,
  pencil, shapes, text, gradients, strokes, booleans, outline stroke, align/distribute, groups, layers (name, hide,
  lock, order), snapping, zoom/pan, undo/redo, placed images
- Desktop: edit in Inkscape, Illustrator, Affinity or any program; saves flow back live (the project's `drawings/`
  folder is watched)
- Reference images (under or over the artwork, opacity, adjustable, saved but never published) and Image Trace
  (imagetracerjs, public domain, in a worker): the image's own palette for flat colours, refitted curves, shapes
  grouped by colour
- Inkscape files keep their layers, labels, namespaces and document settings through the built-in editor
- Clipping masks; text on a path (a real SVG textPath, editable as a field); layer animations (draw on, fade, pop,
  spin, float, pulse, sway; on view, hover or loop; reduced motion respected; played in Preview and published)
- Paint over a section: the section as a layered SVG (background, blocks with frames, artwork), back again: frames
  move blocks, text edits apply paragraph by paragraph, artwork becomes (and keeps growing) a drawing; live from
  Inkscape/Illustrator on desktop
- My catalogue: code blocks and drawings saved for any site
- Later: gradient mesh and brushes stay with the outside programs; a shared/community catalogue

### Phase 4c: Designs, media, capture ✅
- Designs: print pieces and social images as fixed-size sheets in the site's theme (17 presets), started from site
  sections if wanted; PDF (vector, real size, bleed) and PNG/JPG exports; Scribus hand-off for CMYK
- Media: Audio block; Trim & tidy (trim, crop, resize, quality, mute, fades, formats, poster frame) in the editor;
  captions (.vtt); round trips with DaVinci Resolve, Premiere, Shotcut, Kdenlive, Audacity… via "export here"
- Capture from a website (desktop): pick any component, get its layout and styles; its content only when the page
  is marked for reuse (or it's yours); TDM reservations respected; reference-only pieces can't be published
- Later: a starter template gallery from permissively licensed sets, a shared/community catalogue

### Phase 4d: Share, data, services ✅
- View the original for catalogue and captured pieces
- Export or share a piece: embed snippet, Web Component, Shopify section, WordPress pattern, CodePen/Uiverse;
  Shopify and WordPress round trips on desktop (send sections/patterns; import sections and own pages)
- Data: collections from typed items, CSV, Google Sheets, JSON, GitHub, Airtable, Notion, Supabase, REST;
  Collection list block with generated card designs; item pages; `{{item.field}}` anywhere; refresh before export;
  keys encrypted, HTTPS only, baked at export
- Services: Buy button (Stripe, Lemon Squeezy, Gumroad, PayPal, Shopify, Ko-fi, Snipcart), Cart, Newsletter
  (Buttondown, Kit, Mailchimp, Formspree), Sign in (Memberstack, hosted pages), analytics; a directory of providers
- Outputs belong to their makers: no credit or watermark is added; third-party notices are kept
- Later: live (client-side) data for public sources, filters/search on collection lists, pagination, Stripe
  Buy Button / pricing tables, comments (Giscus), per-collection RSS

### Phase 4e: Motion and sound ✅
- Timeline: tracks (move, size, turn, opacity, blur, cutout) with keyframes and per-keyframe easing (curve editor,
  springs, bounce, elastic, steps); triggers: page opens, into view, scroll-linked, hover/click on this or another
  block, loop; live scrub preview; ready-made and saved animations; Web Animations API on the site
- Flipbook: frame-by-frame drawings with onion skin; layers ⇄ frames round trip with Inkscape/Illustrator
- Sounds on click/hover/view: built-in synthesized sounds, uploads, a sound maker; visitors can mute; nothing plays
  before the visitor interacts
- Later: animating colours and text, motion paths, sequencing several blocks on one timeline, per-screen-size
  animations, exporting a flipbook as GIF/video for designs

### Phase 4f: Guides and blogs ✅
- Guides: what it is, cost, steps with links, settings filled in, keys stored, checks; glossary; progress per site
- Blog: posts written in the app, blog page with tag filters, post pages, RSS with full content, import from
  WordPress/Ghost/Markdown, newsletter drafts to Buttondown, comments (Giscus, Cusdis, Bluesky, Mastodon)
- Blocks that grow to fit their content on the site (articles, item lists)
- Contact ✅: inbox (Netlify Forms), spam protection, booking (Cal.com, Calendly), live chat (Crisp, Tawk.to),
  community (Discord, Discourse, GitHub Discussions, Reddit, Circle), with guides
- Quality ✅: check before publishing (accessibility, links incl. desktop link checker, search engines, speed,
  setup), site search (static index), WebP picture optimisation
- Client work ✅: client mode with PIN, version history (hourly/before export/named, restore), password-protected
  pages (encrypted in the page), handover guide
- Extras ✅: multi-language sites, visitor stats in the app, free CC0 photos, proposals and invoices; picture
  descriptions made easy
- Later: translated blog posts and data, machine-translation hand-off, recurring invoices and payment status
  (multi-language, stats, free photos, proposals and invoices)

### Phase 4g: Share, promote, get it made ✅
- Social blocks: social links (link in bio), posts, live streams, weekly schedule in the visitor's time, support
  buttons, countdown, QR codes with scan tracking, Add to calendar
- Ready-made pages: link in bio, coming soon, press kit, events, podcast (with a podcast feed)
- Tell people: direct posting to Discord, Bluesky, Mastodon and Telegram (desktop, keys encrypted); share pages for
  X, Threads, Facebook, LinkedIn, Reddit, WhatsApp, email; copy and save for Instagram and TikTok; tracked links
- Share pictures from designs; email signature maker
- Directory: print, stickers, posters, merch, books, signs, packaging, fabrication, payments, tips, scheduling,
  email, accounts, data; sticker and T-shirt design sizes; "Where to get this printed" from any print design
- Next (once the app is signed and has a public home):
  - Direct posting to Instagram, Facebook and Threads (Meta app review), YouTube community/uploads (Google OAuth
    verification), LinkedIn (app review) and X (paid API), each behind its own "Connect" with the same encrypted keys
  - A true "live now" badge (Twitch/YouTube APIs need an app key; could go through a tiny FayteWorks service)
  - Directory: update the listings without an app release (a signed JSON file from the releases repo), a
    "suggest a company" form, and referral agreements with print and merch companies. Referral links must stay
    disclosed and must never change what's listed or the order
  - Direct hand-off to print shops that have ordering APIs (e.g. print-on-demand product creation from a design)

### Phase 5: Page shells ✅
- Each page picks a layout: scrolling page, full-screen slides, horizontal gallery
- Sections are untouched by shells; switching is always safe, editing happens as usual
- Without JavaScript, slides and galleries simply stack

### Phase 6: Desktop app ✅
- Electron app (the editor runs unchanged; the browser version keeps working)
- Projects are folders: site.json + assets/ (+ project.json, published/); projects screen with new / open /
  recent / import a .site.json
- Autosave to disk with save status; export into the project or any folder
- One-click publishing to Netlify and GitHub Pages; tokens encrypted by the OS, never in the project
- Windows installer (electron-builder, NSIS)
- App icon; auto-update from GitHub Releases (npm run desktop:release), tested against a local feed; Cloudflare
  Pages publishing (direct upload); code signing documented (needs your certificate)

### Phase 7: Component maker ✅
- Make tab: start from a blueprint (blank, project card, profile, feature, stat, quote, call to action), or select
  blocks on a page and choose “◆ Make component” (a linked copy takes their place)
- The maker is the normal editing surface: any block (and catalogue code, and other components) is a piece on the
  component's own 12-column grid, with layers, inline editing and drag/resize
- A frame styles the whole component: fill, background image, text colour, padding, corners, border, shadow,
  alignment, whole-component link
- “◇ Field” next to any setting (of a piece or the frame) makes it a field; fields can be renamed and reordered, and
  are all a placed copy shows in the inspector
- Placed copies stay linked: editing the component updates every copy, each keeping its own field values; “Detach”
  turns a copy into ordinary blocks; deleting a component detaches its copies so nothing disappears
- Components live in the site file (exported sites render them as plain HTML) and travel as .component.json files
  (with images and any components they contain)
- Screen sizes: copies follow the page's tiers like sections (tablet = desktop arrangement unless customized, phones
  stack unless the component has a phone arrangement); the maker sits in the device frame to edit each size
- Variants: alternative designs (own arrangement and frame) made as a copy of an existing one; pieces keep their
  ids so fields work in every variant; each placed copy picks its variant
- My library: save components outside any site (with their images) and add them to other sites; linked copies can
  push (Update library) or pull (Update from library) changes
- Variant-only fields: fields can show for one design only (automatic for pieces only some designs have)
- Later: a shared/community catalogue of components

### Layers panel ✅
- Design-tool style tree of the whole page: sections › groups › blocks, every block its own layer, front at the top
- Per-block eye (hide everywhere), lock (can't be picked on the canvas) and rename; hover highlights on the canvas
- Drag to restack, move blocks into another group or section, reorder groups and sections; ⧉ puts a block in its
  own group (free to overlap), ungroup keeps the blocks; new blocks land just in front of the selected one
- The old per-section "layers" are now groups (default names follow; custom names kept)

### Overhanging blocks ✅
- Position → Extend up / Extend down (rows): a block grows past its grid area without moving anything else; past
  its section's edge it draws over the neighbouring section. Off on phones (stacked)

### Editor workspace ✅
- Vertical align (top / middle / bottom) for every block
- Canvas zoom: − / Fit / % / + in the top bar, Ctrl/Cmd + wheel or pinch toward the pointer, Ctrl + = / − / 0 / 1;
  pan with Space + drag or the middle mouse button; editing and snapping work at any zoom
- Dockable panels: every tool is a tab; drag tabs to join groups, split a group (top/bottom), or move to the other
  side; resize docks and splits; the layout is remembered (File → Reset panel layout)
- Bottom dock under the canvas (panels side by side) and floating windows: drop a tab on the canvas to float it,
  near its bottom edge to dock it there; windows move by their grip, resize from the corner, dock back with ⇥

### Grid precision ✅
- Each section and component picks Standard (12 × 24px), Fine (24 × 12px) or Extra fine (36 × 8px)
- Switching converts positions so nothing moves; library sizes, pastes, moves between sections, and placing or
  detaching components convert between grids, so blocks keep their visual size

### Phase 7: Prototypes → Portfolio
- Build 2–3 throwaway prototype sites to stress-test the tool
- Migrate the old Portfolio content (`src/data/cards/*`) into the new format
