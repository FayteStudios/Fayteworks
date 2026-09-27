# FayteWorks.

**Your site. Period.**

A self-hosted visual website editor: drag blocks onto a 12-column grid, style them in the inspector,
and keep your site as a plain JSON file. See [ROADMAP.md](ROADMAP.md) for where this is going.

## Run

```sh
npm install
npm run dev        # open the printed localhost URL
npm run build      # type-check + production build
```

## Desktop app

```sh
npm run desktop:dev    # desktop app on the live dev server
npm run desktop        # desktop app on a fresh production build
npm run desktop:dist   # Windows installer in release/
```

If `desktop:dist` fails with EPERM renaming `win-unpacked` (network/mapped drives, antivirus), build to a local
drive: `npx electron-builder --win nsis --config.directories.output=C:/temp/fayteworks-release`.

In the desktop app each site is a **project folder**: `site.json` (the site), `assets/` (your images, named by
content hash), `project.json` (publishing settings) and `published/` (the exported website). Keep the folder in
git or a synced drive to back it up. **Export & publish** can push the site to Netlify, GitHub Pages or Cloudflare
Pages in one click; access tokens are encrypted by the operating system and never stored in the project.

### Releases and automatic updates

Installed copies check for a newer release when they start, download it in the background, and offer
**Restart to update** (otherwise it installs on the next quit). Releases are GitHub Releases of the repository named
under `build.publish` in `package.json` (`FayteStudios/Fayteworks`).

To publish a release, raise `version` in `package.json` (e.g. 0.1.0 → 0.1.1), commit, then tag and push:

```sh
git tag v0.1.1
git push origin main v0.1.1
```

GitHub Actions (`.github/workflows/release.yml`) builds the installer on Windows and publishes it, with
`latest.yml`, as the release for that tag; no token is needed on your machine. The tag must match the version.
(Without Actions: set `$env:GH_TOKEN` to a token with the `repo` scope, run `npm run desktop:release`, then publish
the draft release it uploads to on GitHub.)

Nothing is checked or downloaded while developing (`npm run desktop`), only in installed copies.

### Code signing

Unsigned installers work, but Windows SmartScreen warns “Windows protected your PC” until the app builds a
reputation. Signing removes the warning and needs a certificate, which only you can obtain:

- **Azure Trusted Signing** (cheapest, about $10 a month): add `"azureSignOptions"` under `build.win` (endpoint,
  certificate profile and account name) and sign in with the Azure CLI before building.
- **An OV or EV code-signing certificate** (.pfx from a certificate authority): set `CSC_LINK` (path to the .pfx)
  and `CSC_KEY_PASSWORD` before `npm run desktop:dist` / `desktop:release`; electron-builder signs automatically.

Once signed, also set `build.win.publisherName` to the certificate's name, so updates are only accepted when they
are signed by you.

## Using the editor

- **Add blocks**: click one in the library (it lands in the selected section) or drag it onto a section.
- **Move and resize**: drag a block, or pull its handles. Drag the pill under a selected section to change its height.
- **Edit**: double-click text on the canvas to type in place (Ctrl+B / Ctrl+I / Ctrl+K for bold, italic, link; Esc
  cancels). Everything else is in the inspector. Click empty canvas for page settings and the site theme (including
  Google Fonts).
- **Select several**: Shift-click blocks, drag a box on empty space, or Ctrl+A. Drag any selected block to move the
  group; the inspector aligns them. Ctrl+C / Ctrl+X / Ctrl+V copy blocks or a whole section, even between pages.
- **Freeform + Check**: turn on **Freeform** (top bar) to arrange roughly: rows stay fixed, so text can spill out
  and blocks can overlap. The **Check** tab lists what doesn't fit or overlaps, with one-click fixes (“make room”
  only moves what would be covered). Published sites always grow rows to fit, whichever mode you edit in.
- **Screen sizes**: Desktop / Tablet / Phone tabs pick a real device (rotate with the button next to it). The label
  shows which layout tier you are editing. On tablet/phone, **Customize for …** on a section toolbar gives that
  section its own arrangement at that size; the inspector can hide a block per size.
- **Layers**: the Layers tab shows a section's layers (top first). Add a layer, then *Focus* it to arrange just its
  blocks while the rest dim and let clicks through. Higher layers draw on top; hide/lock/rename/reorder as needed.
- **Components**: ★ on a section toolbar saves it to *Add → Your components*, reusable on any page or site.
  Selected blocks can be saved as a group component too, which drops into an existing section.
  Export/Import share them as `.component.json` files (images included).
- **Component catalogue**: Add → *Browse component catalogue* searches about 4,200 components: featured ones, Uiverse
  (plain CSS), and HyperUI, Meraki UI and Flowbite (Tailwind). Previews need internet. Filter by library, kind or
  style, switch the preview background (dark shows dark versions where there are any), ☆ to keep favourites. *Add*
  drops one into the selected section with its text and links editable and its credits kept for the exported notices.
- **Drawings (vector graphics)**: Add → Media → *Drawing*, then *Edit drawing* opens the vector editor: select and
  transform (handles, rotate, Alt-drag copies), edit points (A), pen (P) and pencil (N), rectangle, ellipse, polygon,
  star, line and text, fills (colour, linear/radial gradients) and outlines, combine shapes (unite, subtract,
  intersect, exclude), align/distribute, groups, layers, snapping, zoom/pan (Ctrl+wheel, Space-drag), full undo.
  Colours picked from the theme swatches stay linked to the site theme. **Name a layer** and it shows up on the page:
  text layers become editable fields, and any named layer can be hidden (per placed component copy too).
  In the desktop app, *Open* edits the drawing in Inkscape, Illustrator or Affinity (found automatically, or pick any
  program): it lives in the project as `drawings/<id>.svg`, and every save there updates the page, as an undoable
  edit. *Import SVG* / *Download SVG* work everywhere. Imported SVGs are cleaned (no scripts, handlers or outside
  resources), and their styles and ids are kept to the drawing.
- **Tracing references and Image Trace**: in the drawing editor, *Reference image* lays a photo, sketch or screenshot
  under (or over) the drawing: set its opacity, adjust its position, and trace it by hand. *Image Trace* turns it into
  vector shapes (logo, line art, smooth, photo presets; colours, specks, smoothing, corners, leave out white), grouped
  by colour and placed exactly over it. The reference is saved with the drawing but never published.
- **More drawing tools**: clipping masks (*Clip* / *Release clip*), text on a path (select a text and a path → *Text
  on path*; saved as a real SVG textPath, so it stays text on the page), and layer animations in the inspector (draw
  on, fade, pop, spin, float, pulse, sway; when scrolled into view, on hover, or looping; off for reduced motion).
  Drawings from Inkscape keep their layers, labels and document settings when saved in the built-in editor.
- **Paint over a section**: section inspector → *Paint over this section* opens the whole section as a drawing (in
  the built-in editor, your drawing program on desktop, or as a downloaded SVG). Move or resize the dashed block
  frames, edit text, draw on "Your artwork"; coming back, blocks move (snapped to the grid), text updates and the
  artwork becomes a drawing in the section (painting again adds to it).
- **My catalogue**: *Save to my catalogue* on a custom code block or a drawing keeps it for any site: the catalogue's
  *Mine* view.
- **Designs (print and social)**: Pages → *New design…* makes a flyer, poster, tri-fold or folded leaflet, business
  card, postcard, Instagram post, story, cover, link preview or video thumbnail, optionally starting from sections of
  the page you're on. Each section is a sheet; guides show the trim line, safe area and folds. The design inspector
  exports PDF (real size, vector text; one page per sheet, with or without bleed) or PNG/JPG (print dpi or the post's
  size). Designs are never part of the website. For CMYK print files, open a sheet in Scribus from the section
  inspector (*Open in your drawing program*).
- **Video and audio**: the Audio block plays an uploaded file. For uploaded video and audio, *Trim & tidy* cuts,
  crops (16:9, 1:1, 9:16…), resizes, sets quality, removes sound, fades and converts (MP4/WebM, M4A/OGG/WAV), and
  takes a poster from any frame; *Captions* adds subtitles (typed at the playhead or imported from .vtt/.srt). On
  desktop, *Open* edits the clip in DaVinci Resolve, Premiere, Shotcut, Kdenlive, Audacity and others: export the
  finished file into the "export here" folder that opens, and it replaces the clip (undoable).
- **Capture from a website** (desktop): Browse component catalogue → *Capture from a website*, pick a component (or
  the whole page) in the window that opens, and get its layout and styling as custom code. Its text and pictures
  only come along when the page is clearly marked for reuse (CC0, public domain, MIT, ISC, CC BY, or a GitHub Pages
  site whose repository has one of those), or you tick "my own site / I have permission"; sites that reserve text
  and data mining are always reference only. Reference-only pieces are marked on the canvas and block publishing
  until you rebuild them and set their licence to Own work.
- **View the original**: catalogue and captured pieces keep their source; the inspector's *View the original* opens it
  (handy for animations).
- **Export or share a piece**: any section or block → *Export or share* gives a self-contained embed snippet, a Web
  Component, a Shopify section (with theme editor settings; *Send to theme* on desktop), a WordPress pattern (*Save
  to WordPress* on desktop, with an application password), or posts it to CodePen / Uiverse. On desktop the capture
  tab can also bring in Shopify theme sections (Liquid → custom code with slots) and pages of your own WordPress or
  Shopify site. Store tokens are encrypted on this computer, never in the project.
- **Data (collections)**: the *Data* tab holds lists of things (products, posts, team, events). Type them in, upload
  a CSV, or fetch from Google Sheets, a JSON address, a GitHub repository (a file, or a folder of Markdown posts),
  and on desktop Airtable, Notion, Supabase or any REST API. Show them with a *Collection list* block (*Make a card
  design* builds a component from the fields); *Make an item page* publishes one page per item at
  `/<page>/<item>/`. In any text, picture or link inside a card or item page, `{{item.field}}` fills from the item
  and `{{item.url}}` links to its page. Data is copied into the site at export (optionally fetched fresh first), so
  no key is ever published; keys live encrypted on this computer and are only sent over HTTPS to their service.
- **Services** (File → *Services…*): payments, sign-ups, accounts and visitor statistics come from providers you
  sign up to, so you can switch or move without rebuilding. *Buy button* (Stripe Payment Links, Lemon Squeezy,
  Gumroad, PayPal, Shopify, Ko-fi, or a Snipcart cart with *Cart button*; look-alike checkout addresses are refused),
  *Newsletter sign-up* (Buttondown, Kit, Mailchimp, Formspree), *Sign in / account* (Memberstack, or any hosted
  sign-in page such as Clerk or Outseta), and analytics (Plausible, Umami, Cloudflare, Fathom, Google). Only public
  ids are stored; each is checked against its provider's format, and scripts load only on pages that use them.
  Members-only content hidden in the browser is still in the page source: keep anything truly private with the
  provider.
- **Tailwind**: in any custom code block, set *Tailwind classes* to *On* and write utility classes in the HTML. The
  site theme is available as `bg-site-accent`, `text-site-text`, `text-site-muted`, `bg-site-surface`,
  `font-heading`, `font-body` and `rounded-site`; `dark:` applies inside an element with the `dark` class; `md:`
  and friends follow the page width (so they work in the phone/tablet views). *On, with Flowbite tokens* adds
  Flowbite's `bg-brand`, `text-heading`, `rounded-base`… mapped to the site theme.
- **Guides** (📘 in the top bar, File menu, and next to blocks that connect to something): step-by-step help for going
  online, domains, blogs, newsletters, comments, forms and payments. Each says what the thing is and what it costs,
  links to the exact pages, fills settings in for you, stores keys safely, and checks that it worked. Includes a
  glossary (hosting, DNS, RSS, API keys…).
- **Blog**: Data → *+ New blog* makes a Posts collection, a blog page (newest first, tag filter buttons) and the page
  each post is published on. *✎ Write* opens a writing editor (toolbar, pictures, live preview, word count). Posts
  are published with an RSS feed (needs the site address), and can be imported from WordPress (.xml), Ghost (.json)
  or Markdown files. On desktop, *✉ Newsletter draft* sends a post to Buttondown as a draft email. The *Article*
  block (Markdown) and *Collection list* grow to fit their content on the site.
- **Contact**: on desktop, *✉ Inbox* reads the messages sent through your forms (Netlify Forms), with reply by
  email, delete, search and CSV download. Forms have a hidden spam trap, plus Netlify's "not a robot" check if
  needed. *Booking* shows a Cal.com or Calendly page (embedded or as a button); *Community* invites people to Discord
  (optionally with its who's-online widget), a forum, GitHub Discussions, Reddit or Circle; live chat (Crisp or
  Tawk.to) is set in File → Services. Each has a guide.
- **Check before publishing** (File menu, the Check tab, and a banner in Export): pictures without descriptions,
  hard-to-read text (WCAG contrast), heading structure, buttons that go nowhere, links to deleted pages, insecure
  links, missing search descriptions, duplicate titles, favicon/share picture/site address, very large files, and
  blocks that aren't set up yet. Each has *Show me*, and quick fixes (describe a picture, write a description, open
  the guide). On desktop, *Check links* tests every external link.
- **Site search**: the *Site search* block finds pages and posts; the exporter writes a small index and the site
  searches it in the visitor's browser (no server, no service).
- **Faster pictures**: export converts photos to WebP and scales huge ones to 2400px (only when it's smaller; can be
  turned off), and says how much was saved.
- **Client mode** (File → Hand over to a client): the site opens locked for your client. They change words,
  pictures, links, page titles/descriptions and posts; design, layout and structure are locked (no dragging,
  deleting, adding sections or pages). Your PIN (stored hashed) unlocks it for the session. An accident guard, not
  security. The *Hand a site over to a client* guide walks through the whole handover.
- **Version history** (File → Version history): a copy is kept every hour while you edit, before each export and
  before going back; save named versions any time. Grouped by day; *Go back to this* restores (the current state is
  saved first). Desktop keeps them in the project's versions/ folder, the browser in its own storage.
- **Password-protected pages** (page settings → Password): the page's content is encrypted into the published file
  (AES-GCM, PBKDF2) and opened in the visitor's browser: no server. Kept out of search engines, the sitemap, site
  search and feeds; the title/description stay visible and pictures stay reachable by address.
- **Picture descriptions**: pictures without alt text get an "Add a description" tag on the canvas; the inspector
  asks first (suggesting one from a wordy file name or a free photo's title); File → *Picture descriptions* lists
  every picture on the site to describe (or mark as decoration) in one go.
- **Free photos** (next to every Upload): Openverse search limited to CC0 and public domain; credits are recorded and
  listed in the exported notices.
- **Visitor stats** (desktop, 📈 Stats): Plausible or Umami numbers in the app (visitors, page views, top pages,
  sources) with a read-only key; other services open their dashboard.
- **Proposals and invoices** (Pages → Designs, or File): from your details, the client and your packages; they
  become A4/Letter designs that export to PDF. The *Line items* block adds up totals and tax.
- **Languages** (File → Translate, 🌐 picker in the top bar): add languages, translate every word side by side (or
  via CSV for a translator), or switch the canvas to a language and edit in place. Each language is published under
  /<code>/ with hreflang links, translated titles and navigation; the *Language switcher* block links between them.
- **Comments block**: Giscus (GitHub Discussions), Cusdis, or replies to a Bluesky/Mastodon post shown as comments.
- **Social blocks** (Add → Social): *Social links* (icons, pills, or big link-in-bio buttons; icons picked from each
  link), *Social post* (X, Instagram, TikTok, Bluesky, Mastodon, Facebook, Spotify, SoundCloud, YouTube, Twitch clips),
  *Live stream* (Twitch with chat, YouTube, Kick), *Schedule* (weekly times shown in each visitor's own time, with
  Add to calendar), *Support me* (Ko-fi, Buy Me a Coffee, Patreon, GitHub Sponsors, Liberapay, Open Collective),
  *Countdown*, *QR code* (counts scans in your statistics) and *Add to calendar*. Posts and players never load in the
  editor, and on the site only in view or on a click.
- **Ready-made pages** (Pages → *Ready-made page*): link in bio, coming soon, press kit, events (a page per event
  with tickets and Add to calendar) and podcast (episodes, players, show notes and a podcast feed for Apple
  Podcasts and Spotify). Pages can drop the site's header and footer (page settings).
- **Tell people** (File menu, and after publishing): one message about a page or post. The desktop app posts it
  straight to Discord (webhook), Bluesky (app password), Mastodon and Telegram; X, Threads, Facebook, LinkedIn,
  Reddit, WhatsApp and email open their share pages filled in; for Instagram and TikTok the text is copied and the
  picture saved. Links carry tracking so visitor stats show where people came from.
- **Share pictures**: a *Link preview* design → *Use as the share picture* sets it for every page without one.
- **Email signature** (File menu): name, contact and social links in the site's colours, ready for Gmail, Outlook
  and Apple Mail.
- **Directory** (File menu, the design panel's *Where to get this printed*, and Services): print shops, stickers,
  posters, print-on-demand merch, books, signs, packaging, laser cutting, and the services behind a site, with what
  each is good for, a rough price level, where they deliver and what file to send. Links go to each company's site.
- **Demo sites**: File → *Start from a demo site* (or a template when creating a desktop project): a café, a barber,
  a band, a web design studio, and FayteWorks's own website. Each is built from ordinary blocks with original
  vector art, animations, flipbooks and sounds, so every part is editable and yours to reuse, or to show clients
  what's possible.
- **Components & templates**: Add → *Section templates* inserts ready-made sections (heroes, features, pricing, FAQ,
  gallery, contact…). File → *New showcase site* builds a four-page site using every block, handy for trying things.
- **Page layouts (shells)**: click empty canvas → *Page layout* to present a page as full-screen slides, a
  horizontal gallery. Sections are edited exactly as before. Try it in Preview.
- **Motion**: any block can animate in on scroll or react on hover (inspector → Motion). Shown in Preview and on the
  published site; visitors who prefer reduced motion see none.
- **Timeline animations**: select a block → inspector → *Motion* → *Make your own in the timeline* (or the
  *Timeline* tab along the bottom; click its tab again to fold it away). Start from a ready-made animation or an
  empty one, add tracks (move, size, turn, opacity, blur, cutout), click along a track to place keyframes, drag them
  to retime, and type a value at the playhead to key it. Each keyframe has an easing: presets, a custom curve with
  draggable handles, springs, bounce, elastic or steps. It can play when the page opens, when the block scrolls into
  view, follow the scroll position, play on hover or click of this block *or another one*, or loop. The canvas
  previews the playhead; *★ Save to my animations* keeps one for any block. Published pages use the browser's own
  animation engine; visitors who prefer reduced motion, or have no JavaScript, see the block as designed.
- **Flipbook** (frame by frame): draw each frame in the vector editor with onion skin (the frames either side show
  faintly), duplicate, reorder, and play it on a loop, once in view, while hovered, per click, or scrubbed by
  scrolling. *Frames as layers* downloads one layered SVG to animate in Inkscape/Illustrator; *Frames from layers*
  (or a Drawing's *Turn its layers into flipbook frames*) brings layers back as frames.
- **Sound**: any block can play a sound on click, hover or when it comes into view (inspector → *Sound*). Pick a
  built-in sound, upload one, or *Make your own* with the little synthesizer (made here, so yours to use). Sounds
  only play after the visitor has interacted with the page; the *Sound on/off* block lets visitors mute them.
- **Shortcuts**: `Ctrl Z` / `Ctrl Y` undo/redo, `Del` delete, `Ctrl D` duplicate, arrow keys nudge, `Esc` leaves
  layer focus, then deselects.
- **Save**: changes autosave in the browser (images in IndexedDB). **File → Save site file** downloads a portable
  `.site.json` with images bundled; **File → Open site file** restores one.
- **Publish**: **Export** builds plain HTML/CSS (zip or folder). Upload the result to Netlify Drop, Cloudflare Pages
  or GitHub Pages. To check it locally, serve the folder (`npx serve out`) rather than opening `index.html` directly.

## Name

The product is **FayteWorks** (written "FayteWorks." with the dot in branding).

## Licence

FayteWorks itself is proprietary: all rights reserved (see LICENSE). Everything you make with it is yours, with no
credit or watermark added.

## Libraries the app uses

paper.js (MIT, vector editor), imagetracerjs (public domain, Image Trace), Tailwind CSS (MIT, compiled in the
editor), Mediabunny (MPL-2.0, video/audio conversion; used unmodified, source at github.com/Vanilagy/mediabunny),
modern-screenshot (MIT, design images), Simple Icons (CC0, platform icons), qrcode-generator (MIT, QR codes),
Electron and electron-updater (MIT). Published sites include none of their code (icons and QR codes are drawn into
the page as plain SVG).

## Code map

| Path | What lives there |
| --- | --- |
| `src/model/` | Site data types, factories, tree operations, theme; `layers.ts` and `responsive.ts` (per-size layouts) |
| `src/state/viewport.ts` | Device presets for the canvas |
| `src/state/components.ts` | Saved components library (this browser) and component files |
| `src/blocks/` | Block types: `registry.tsx` (core), `interactive.tsx`, `content.tsx`, `code.tsx` (custom code); each is defaults + inspector fields + render |
| `src/model/components.ts`, `src/blocks/component.tsx`, `src/editor/ComponentMaker.tsx` | Component maker: component definitions (pieces, frame, fields), placed copies, the Make tab, maker canvas and inspector |
| `src/catalogue/` | Component catalogue: `originals.ts` (CC0), `uiverse.ts` (MIT, featured), `remote.ts` + `uiverse-index.json` / `tailwind-index.json` (Uiverse, HyperUI, Meraki UI, Flowbite; downloaded on demand; rebuilt by `tools/catalogue/*.mjs`), third-party notices for exports |
| `src/site/customHtml.ts` | Custom code safety: HTML sanitising, CSS scoping (layers flattened, nesting kept), `{{placeholder}}` filling |
| `src/vector/` | Drawings: `svg.ts` (cleaning, layers, theme colours, rendering), `VectorTools.tsx` (inspector, outside-program round trip), `engine.ts` + `VectorEditor.tsx` (the vector editor, on paper.js), `src/blocks/vector.tsx` (the block); `desktop/drawings.mjs` finds programs and watches saves |
| `src/vector/trace.ts`, `sectionSvg.ts`, `SectionSvgTools.tsx` | Image Trace (worker), section → SVG → section |
| `src/catalogue/mine.ts` | My catalogue (saved code blocks and drawings) |
| `src/model/design.ts`, `src/design/` | Designs: presets and sheets, the New design dialog, the design inspector and its exports |
| `src/media/`, `src/blocks/media.tsx`, `desktop/media.mjs` | Audio block, Trim & tidy, captions, round trips to video and audio editors |
| `desktop/capture.mjs`, `desktop/capture-preload.cjs`, `src/catalogue/rights.ts` | Capture from a website (picker, extraction, rights check) and the publish guard for reference-only pieces |
| `src/share/` | Export or share a piece: `piece.ts` (snippet, Web Component, Shopify section, WordPress pattern, CodePen), `liquid.ts` (Shopify section → custom code), the dialog and platform import; `desktop/platforms.mjs` talks to Shopify and WordPress |
| `src/data/`, `src/blocks/collection.tsx`, `desktop/data.mjs` | Data: collection model and token filling, sources (browser and desktop fetchers), the Data panel, card and item page generators, the Collection list block |
| `src/motion/`, `src/blocks/motion.tsx` | Motion: `compile.ts` (timeline animations → keyframes the runtime plays; presets), `easing.ts` (curves, springs → CSS), `TimelinePanel.tsx` + `EaseEditor.tsx`, `flipbook.ts` + `FlipbookTools.tsx`, `sounds.ts` (markup, synthesizer, WAV) + `SoundTools.tsx`; playback lives in `src/site/runtime.ts` |
| `src/services/`, `src/blocks/services.tsx` | Services: provider scripts for exports (`siteServices.ts`), the Services dialog, Buy / Cart / Newsletter / Sign in blocks |
| `src/tailwind/` | Tailwind in the editor: `compile.ts` (Tailwind v4 in the browser, site theme and container breakpoints), `TailwindSync.tsx` (recompiles a block's classes when its HTML changes), Flowbite tokens |
| `src/model/shells.ts`, `src/site/ShellRenderer.tsx` | Page shells: options, card defaults, and how sections are wrapped |
| `src/site/runtime.ts` | The one script published sites run (reveal, carousel, lightbox, tabs, video); self-contained |
| `src/contact/`, `src/blocks/contact.tsx` | Inbox (Netlify Forms, via `desktop/platforms.mjs`), Booking and Community blocks |
| `src/quality/`, `src/blocks/search.tsx` | Check before publishing (`prepublish.ts`, the dialog), site search; picture optimisation and the search index are in `export/staticSite.tsx`, the link checker in `desktop/main.mjs` |
| `src/client/`, `src/history/`, `src/export/protect.ts` | Client mode (lock, PIN, client inspector, handover), version history, password-protected pages |
| `src/i18n/`, `src/business/`, `src/stats/`, `src/media/PhotoPicker.tsx`, `src/quality/altText.ts` | Languages (translations, Translate window, export per language), invoices/proposals, stats, free photos, picture descriptions |
| `src/social/`, `src/blocks/social.tsx` | Social: platforms and icons, embeds and streams, calendar files, Tell people (`announce.ts`, the dialog; posting in `desktop/platforms.mjs`), email signature |
| `src/directory/` | The directory of print shops, makers and services (`directory.ts` is the data; referral links are disclosed) |
| `src/model/pageTemplates.ts` | Ready-made pages: link in bio, coming soon, press kit, events, podcast |
| `src/guides/` | Guides: content (`guides.tsx`: steps, links, inputs, checks, glossary) and the guide window (`GuideHost.tsx`) |
| `src/data/blog.ts`, `PostEditor.tsx`, `postImport.ts`, `src/site/markdown.tsx`, `src/blocks/blog.tsx` | Blog: one-step setup, writing editor, WordPress/Ghost/Markdown import, safe Markdown rendering, Article and Comments blocks; RSS in `export/staticSite.tsx` |
| `src/model/demoSites.ts`, `src/model/demoArt.ts` | The demo sites (built from blocks) and their original SVG artwork |
| `src/model/templates.ts` | Section templates and the showcase site |
| `src/site/` | Pure site rendering + `site.css`, shared by editor, preview and export. `renderContext.ts` is where they differ (asset URLs, links) |
| `src/state/store.tsx` | Editor state, undo/redo history, autosave |
| `src/state/assets.ts` | Uploaded files in IndexedDB, referenced as `asset:<hash>` |
| `src/export/` | Static site builder, zip writer, folder output, portable site files |
| `src/editor/` | Editor UI: canvas, section drag/resize, library, inspector, pages |
| `desktop/` | Electron main process (project folders, siteasset:// images, publishing), preload bridge, launchers |
| `src/platform/` | Desktop bridge types and the projects screen |
| `src/editor/layoutCheck.ts` | Layout check: measures overflow on the canvas, detects overlaps, applies fixes |

To add a block type, add a definition to one of the files in `src/blocks/`. If it needs behaviour, add it to `initSite` in `src/site/runtime.ts` (keep that function self-contained) and make sure the markup still works without it.
