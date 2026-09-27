export type Region = "World" | "US" | "CA" | "UK" | "EU" | "AU";

export const REGION_LABEL: Record<Region, string> = { World: "Ships worldwide", US: "US", CA: "Canada", UK: "UK", EU: "Europe", AU: "Australia" };

export type CategoryGroup = "Get it made" | "Sell and grow" | "For your site";

export interface DirectoryCategory {
  id: string;
  label: string;
  icon: string;
  group: CategoryGroup;
  blurb: string;
  send?: string;
  presets?: string[];
}

export interface Listing {
  name: string;
  url: string;
  referral?: string;
  categories: string[];
  what: string;
  price?: 1 | 2 | 3;
  pricing: string;
  regions: Region[];
  use?: string;
}

export const PRICE_LABEL = { 1: "$ · Budget", 2: "$$ · Mid-range", 3: "$$$ · Premium" } as const;

export const CATEGORIES: DirectoryCategory[] = [
  {
    id: "stickers",
    label: "Stickers and labels",
    icon: "🏷",
    group: "Get it made",
    blurb: "Die-cut stickers, sheets, labels for jars and boxes. Great for merch tables, packaging and giveaways.",
    send: "A PNG at 300 dpi with a transparent background (most shops cut around the outline for you), or a PDF with bleed. Make it as a design: Sticker size, then Export → PNG at 300 dpi.",
    presets: ["sticker-3in", "sticker-75mm"]
  },
  {
    id: "print",
    label: "Business cards, flyers and print",
    icon: "🪪",
    group: "Get it made",
    blurb: "Business cards, flyers, postcards, leaflets and folded pamphlets.",
    send: "A PDF with the bleed included (Export → PDF → Include the bleed). If a shop asks for CMYK, open the sheet in Scribus (free) and export PDF/X there.",
    presets: ["business-card", "business-card-us", "a5-flyer", "letter-flyer", "postcard", "trifold-letter", "trifold-a4"]
  },
  {
    id: "posters",
    label: "Posters and art prints",
    icon: "🖼",
    group: "Get it made",
    blurb: "Posters, fine-art and photo prints, canvas and framed prints: for your walls, shows, or selling your art.",
    send: "A PDF, or a JPG/PNG at 300 dpi at the full print size. Photo labs prefer JPG in sRGB colour.",
    presets: ["a3-poster", "poster-18x24"]
  },
  {
    id: "merch",
    label: "Merch, made to order",
    icon: "👕",
    group: "Get it made",
    blurb: "T-shirts, hoodies, mugs, tote bags, phone cases… made only when someone orders, so there's no stock to buy or store. Many connect to a shop and ship straight to your buyer.",
    send: "A PNG with a transparent background at the size of the print area, 150–300 dpi. Make it as a design: T-shirt print, turn the sheet's background off, Export → PNG.",
    presets: ["tshirt-print"]
  },
  {
    id: "bulk-merch",
    label: "Merch in bulk",
    icon: "📦",
    group: "Get it made",
    blurb: "Shirts for a team or event, pins, acrylic charms, plushies: ordered in batches, so each piece costs less.",
    send: "PNG at 300 dpi or vector art (SVG/PDF). Bulk shops usually send a proof to approve before they make anything.",
    presets: ["tshirt-print"]
  },
  {
    id: "books",
    label: "Books, zines and comics",
    icon: "📚",
    group: "Get it made",
    blurb: "Print a few copies or thousands, or print on demand and sell through bookshops.",
    send: "Two PDFs: the inside pages at the trim size plus bleed, and the cover (the shop's cover calculator gives its size, which depends on the page count). A design with one sheet per page works for zines.",
    presets: ["a5-flyer"]
  },
  {
    id: "signs",
    label: "Signs and banners",
    icon: "🪧",
    group: "Get it made",
    blurb: "Banners, yard signs, window graphics, stand-ups for markets and events.",
    send: "A PDF at the real size (text and drawings stay sharp at any size). Pictures inside it need about 150 dpi at full size."
  },
  {
    id: "packaging",
    label: "Packaging",
    icon: "🎁",
    group: "Get it made",
    blurb: "Custom mailer boxes, tissue paper, tape and inserts, for when opening the parcel is part of the experience.",
    send: "The shop's dieline template (download it from their site), with your design placed on top. Export a PDF at the template's size."
  },
  {
    id: "fabrication",
    label: "Laser cutting and 3D printing",
    icon: "⚙",
    group: "Get it made",
    blurb: "Signs cut from wood, acrylic or metal; keychains, stands and parts printed in 3D.",
    send: "Laser cutting: vector outlines (SVG or DXF). Draw them in the vector tools or open them in Inkscape, then export SVG. 3D printing: an STL or OBJ from a 3D program (Blender is free)."
  },
  {
    id: "payments",
    label: "Take payments",
    icon: "💳",
    group: "Sell and grow",
    blurb: "Sell a product, a download or a booking; take donations. They host the checkout, so your site never touches card details."
  },
  { id: "shop", label: "Run a shop", icon: "🛒", group: "Sell and grow", blurb: "A cart and checkout for many products." },
  {
    id: "support",
    label: "Tips and memberships",
    icon: "☕",
    group: "Sell and grow",
    blurb: "Let fans support you: one-off tips, monthly memberships, members-only posts. Add them with the Support me block."
  },
  {
    id: "share",
    label: "Post and schedule",
    icon: "📣",
    group: "Sell and grow",
    blurb: "Plan posts for many social accounts at once, or have new blog posts shared automatically from your RSS feed. For the platforms FayteWorks can't post to directly yet."
  },
  { id: "email", label: "Email, forms and booking", icon: "✉", group: "For your site", blurb: "Newsletters, contact forms, booking calendars and chat." },
  { id: "accounts", label: "Accounts and members", icon: "👤", group: "For your site", blurb: "Sign-up, sign-in and members-only pages." },
  { id: "data", label: "Data and back ends", icon: "🗄", group: "For your site", blurb: "Databases, spreadsheets and server code for anything custom." }
];

export const LISTINGS: Listing[] = [
  { name: "Sticker Mule", url: "https://www.stickermule.com", categories: ["stickers", "print", "bulk-merch", "packaging"], what: "Die-cut stickers, labels, magnets, and a lot more (buttons, tape, packaging). Quick turnaround and online proofs.", price: 2, pricing: "Per order, cheaper per piece in bulk; frequent sales.", regions: ["US", "World"], use: "Design: Sticker → PNG" },
  { name: "StickerApp", url: "https://stickerapp.com", categories: ["stickers"], what: "Die-cut stickers and sheets in many finishes (holographic, glitter, clear…).", price: 2, pricing: "Per order; small runs welcome.", regions: ["EU", "World"], use: "Design: Sticker → PNG" },
  { name: "StickerGiant", url: "https://www.stickergiant.com", categories: ["stickers"], what: "Stickers and roll labels for products and packaging.", price: 2, pricing: "Per order; roll labels priced for larger runs.", regions: ["US"], use: "Design: Sticker → PNG or PDF" },
  { name: "Jukebox Print", url: "https://www.jukeboxprint.com", categories: ["stickers", "print"], what: "Premium business cards, stickers and packaging on unusual papers and materials.", price: 3, pricing: "Per order; premium materials.", regions: ["CA", "US"], use: "Design: Business card → PDF with bleed" },
  { name: "MOO", url: "https://www.moo.com", categories: ["print", "stickers"], what: "Well-made business cards (including luxe, thick papers), flyers, postcards and stickers.", price: 3, pricing: "Per order; small runs welcome.", regions: ["UK", "US", "World"], use: "Design: Business card → PDF with bleed" },
  { name: "Vistaprint", url: "https://www.vistaprint.com", categories: ["print", "signs", "bulk-merch", "stickers"], what: "Nearly everything: cards, flyers, signs, banners, shirts and promo items.", price: 1, pricing: "Per order; low prices on standard papers.", regions: ["World"], use: "Design → PDF with bleed" },
  { name: "GotPrint", url: "https://www.gotprint.com", categories: ["print"], what: "Low-cost printing for cards, flyers, brochures and more.", price: 1, pricing: "Per order; budget-friendly bulk runs.", regions: ["US"], use: "Design → PDF with bleed" },
  { name: "UPrinting", url: "https://www.uprinting.com", categories: ["print", "signs"], what: "Cards, flyers, brochures, posters and large-format signs.", price: 1, pricing: "Per order.", regions: ["US"], use: "Design → PDF with bleed" },
  { name: "Overnight Prints", url: "https://www.overnightprints.com", categories: ["print"], what: "Business cards, flyers and invitations, with fast turnaround.", price: 2, pricing: "Per order.", regions: ["US"], use: "Design → PDF with bleed" },
  { name: "Catprint", url: "https://www.catprint.com", categories: ["print", "books"], what: "Small-run printing for artists and small businesses: booklets, zines, postcards, flyers.", price: 2, pricing: "Per order; short runs.", regions: ["US"], use: "Design → PDF with bleed" },
  { name: "Mixam", url: "https://mixam.com", categories: ["books", "print", "posters"], what: "Zines, comics, books, booklets and posters: from a few copies to thousands.", price: 2, pricing: "Per order; instant quotes on their site.", regions: ["UK", "US"], use: "Design → PDF with bleed" },
  { name: "Printed.com", url: "https://www.printed.com", categories: ["print"], what: "Cards, flyers, leaflets and stationery.", price: 2, pricing: "Per order.", regions: ["UK"], use: "Design → PDF with bleed" },
  { name: "Solopress", url: "https://www.solopress.com", categories: ["print", "signs"], what: "Cards, flyers, leaflets, posters and banners.", price: 1, pricing: "Per order.", regions: ["UK"], use: "Design → PDF with bleed" },
  { name: "Helloprint", url: "https://www.helloprint.com", categories: ["print", "packaging", "signs"], what: "Print, packaging and promo products.", price: 1, pricing: "Per order.", regions: ["EU", "UK"], use: "Design → PDF with bleed" },
  { name: "SAXOPRINT", url: "https://www.saxoprint.com", categories: ["print"], what: "Online printing for cards, flyers, brochures and stationery.", price: 1, pricing: "Per order; cheaper with longer delivery times.", regions: ["EU", "UK"], use: "Design → PDF with bleed" },
  { name: "Printique", url: "https://www.printique.com", categories: ["posters"], what: "Professional photo lab: fine-art prints, canvas, metal and albums.", price: 3, pricing: "Per print.", regions: ["US"], use: "Design: Poster → JPG at 300 dpi" },
  { name: "Bay Photo Lab", url: "https://www.bayphoto.com", categories: ["posters"], what: "Pro photo lab: prints on paper, metal, acrylic and wood.", price: 3, pricing: "Per print.", regions: ["US"], use: "Design: Poster → JPG at 300 dpi" },
  { name: "Nations Photo Lab", url: "https://www.nationsphotolab.com", categories: ["posters"], what: "Photo prints, canvas and framed prints.", price: 2, pricing: "Per print.", regions: ["US"], use: "Design: Poster → JPG at 300 dpi" },
  { name: "Mpix", url: "https://www.mpix.com", categories: ["posters"], what: "Photo prints, cards and wall art.", price: 2, pricing: "Per print.", regions: ["US"], use: "Design: Poster → JPG at 300 dpi" },
  { name: "WhiteWall", url: "https://www.whitewall.com", categories: ["posters"], what: "Gallery-quality prints behind acrylic, on aluminium and in frames.", price: 3, pricing: "Per print.", regions: ["EU", "US", "UK"], use: "Design: Poster → JPG at 300 dpi" },
  { name: "Printful", url: "https://www.printful.com", categories: ["merch"], what: "Print-on-demand clothing, accessories and home goods, with embroidery. Connects to Shopify and other shops, and ships to your buyer.", price: 2, pricing: "You pay their base price per item when someone orders; you set your own selling price.", regions: ["World"], use: "Design: T-shirt print → PNG; sell with Shopify or a Buy button" },
  { name: "Printify", url: "https://printify.com", categories: ["merch"], what: "Print on demand through a network of print partners; pick one by price or location.", price: 1, pricing: "Base price per item when someone orders; optional monthly plan for lower prices.", regions: ["World"], use: "Design: T-shirt print → PNG" },
  { name: "Gelato", url: "https://www.gelato.com", categories: ["merch", "posters"], what: "Print on demand produced close to your buyer (in many countries), for faster, greener delivery.", price: 2, pricing: "Base price per item; optional monthly plan.", regions: ["World"], use: "Design → PNG" },
  { name: "Fourthwall", url: "https://fourthwall.com", categories: ["merch", "support"], what: "A shop for creators: made-to-order merch, memberships and tips, with links to YouTube and Twitch.", price: 2, pricing: "Base cost per item; memberships take a share.", regions: ["World"], use: "Link your Fourthwall shop from a Buy button or Social links" },
  { name: "Teemill", url: "https://teemill.com", categories: ["merch"], what: "Organic cotton clothing, printed on demand and made to be sent back and remade.", price: 2, pricing: "Base price per item when someone orders.", regions: ["UK", "World"], use: "Design: T-shirt print → PNG" },
  { name: "Contrado", url: "https://www.contrado.com", categories: ["merch"], what: "Your prints on fabric, clothing, bags and homeware, all-over printed.", price: 3, pricing: "Per item.", regions: ["UK", "World"], use: "Design → PNG" },
  { name: "Redbubble", url: "https://www.redbubble.com", categories: ["merch"], what: "A marketplace: upload your art once and it's sold on many products. Customers find you there.", pricing: "Free to upload; you earn a margin you set on top of their price.", regions: ["World"], use: "Link your shop from Social links" },
  { name: "Society6", url: "https://society6.com", categories: ["merch", "posters"], what: "A marketplace for artists: prints, home decor and more.", pricing: "Free to upload; you earn a share of each sale.", regions: ["US", "World"], use: "Link your shop from Social links" },
  { name: "Threadless", url: "https://www.threadless.com", categories: ["merch"], what: "Artist shops for clothing and more, printed on demand.", pricing: "Free shop; you set your margin.", regions: ["US", "World"], use: "Link your shop from Social links" },
  { name: "Custom Ink", url: "https://www.customink.com", categories: ["bulk-merch"], what: "Shirts and gear for teams, events and businesses, with design help.", price: 2, pricing: "Per order; cheaper per shirt in bigger batches.", regions: ["US"], use: "Design: T-shirt print → PNG" },
  { name: "Bonfire", url: "https://www.bonfire.com", categories: ["bulk-merch", "merch"], what: "Sell shirts in campaigns or a store, for causes, creators and fundraisers.", pricing: "Base cost per item; you set the price.", regions: ["US"], use: "Design: T-shirt print → PNG" },
  { name: "Makeship", url: "https://www.makeship.com", categories: ["bulk-merch"], what: "Limited-run plushies, pins and more for creators, made only if the campaign reaches its goal.", pricing: "No upfront cost; you earn a share of each sale.", regions: ["World"] },
  { name: "Vograce", url: "https://www.vograce.com", categories: ["bulk-merch", "stickers"], what: "Acrylic charms and stands, pins, keychains and stickers: a favourite of artists selling at conventions.", price: 1, pricing: "Per order; low minimums.", regions: ["World"], use: "Design → PNG at 300 dpi" },
  { name: "Lulu", url: "https://www.lulu.com", categories: ["books"], what: "Print-on-demand books: order one copy, sell on your own site, or through online bookshops.", price: 2, pricing: "Per copy; no upfront cost.", regions: ["World"], use: "Design → PDF (inside pages and cover)" },
  { name: "Blurb", url: "https://www.blurb.com", categories: ["books"], what: "Photo books, magazines and trade books in print on demand.", price: 3, pricing: "Per copy; volume discounts.", regions: ["World"], use: "Design → PDF" },
  { name: "IngramSpark", url: "https://www.ingramspark.com", categories: ["books"], what: "Print on demand with distribution to bookshops and libraries.", price: 2, pricing: "Per copy; publishing and distribution fees.", regions: ["World"], use: "Design → PDF" },
  { name: "Kindle Direct Publishing", url: "https://kdp.amazon.com", categories: ["books"], what: "Publish paperbacks and ebooks on Amazon.", price: 1, pricing: "Free to publish; Amazon takes a share of each sale.", regions: ["World"], use: "Design → PDF" },
  { name: "Signs.com", url: "https://www.signs.com", categories: ["signs"], what: "Banners, yard signs, window decals and trade-show displays.", price: 2, pricing: "Per sign.", regions: ["US"], use: "Design → PDF at full size" },
  { name: "BannerBuzz", url: "https://www.bannerbuzz.com", categories: ["signs"], what: "Vinyl banners, flags, roll-up stands and signs.", price: 1, pricing: "Per item; frequent sales.", regions: ["US", "UK", "CA", "AU"], use: "Design → PDF at full size" },
  { name: "Packlane", url: "https://packlane.com", categories: ["packaging"], what: "Custom printed mailer and shipping boxes, with an online designer.", price: 2, pricing: "Per order; cheaper per box in bulk.", regions: ["US"], use: "Their dieline → Design → PDF" },
  { name: "Packhelp", url: "https://packhelp.com", categories: ["packaging"], what: "Custom boxes, mailers and bags, including eco options.", price: 2, pricing: "Per order.", regions: ["EU", "UK", "US"], use: "Their dieline → Design → PDF" },
  { name: "noissue", url: "https://noissue.co", categories: ["packaging"], what: "Custom tissue paper, stickers, tape and compostable mailers.", price: 2, pricing: "Per order.", regions: ["World"], use: "Design → PNG" },
  { name: "SendCutSend", url: "https://sendcutsend.com", categories: ["fabrication"], what: "Laser and CNC cut parts in metal, wood and plastic, from your vector file.", price: 2, pricing: "Instant quote per part.", regions: ["US"], use: "Vector tools → SVG" },
  { name: "Ponoko", url: "https://www.ponoko.com", categories: ["fabrication"], what: "Laser cutting and engraving in acrylic, wood and more.", price: 2, pricing: "Instant quote per part.", regions: ["US"], use: "Vector tools → SVG" },
  { name: "Craftcloud", url: "https://craftcloud3d.com", categories: ["fabrication"], what: "Compare 3D printing prices from many print services in one place.", price: 2, pricing: "Quotes from each service.", regions: ["World"] },

  { name: "Stripe", url: "https://stripe.com/payments/payment-links", categories: ["payments"], what: "Payment Links: one link per product or donation.", pricing: "No monthly fee; a small fee per sale.", regions: ["World"], use: "Buy button → Stripe" },
  { name: "Lemon Squeezy", url: "https://www.lemonsqueezy.com", categories: ["payments"], what: "Digital products and subscriptions. Handles sales tax / VAT for you.", pricing: "A fee per sale.", regions: ["World"], use: "Buy button → Lemon Squeezy" },
  { name: "Gumroad", url: "https://gumroad.com", categories: ["payments"], what: "Sell downloads, courses and memberships. Handles sales tax.", pricing: "A fee per sale.", regions: ["World"], use: "Buy button → Gumroad" },
  { name: "PayPal", url: "https://www.paypal.com/business", categories: ["payments"], what: "PayPal.Me and hosted pay links.", pricing: "A fee per payment.", regions: ["World"], use: "Buy button → PayPal" },
  { name: "Snipcart", url: "https://snipcart.com", categories: ["shop"], what: "A full cart and checkout on your own pages. Pair with a Products collection.", pricing: "A fee per sale, with a monthly minimum.", regions: ["World"], use: "Buy button → Snipcart, Cart button (File → Services)" },
  { name: "Shopify", url: "https://www.shopify.com", categories: ["shop"], what: "Your store stays on Shopify; link products or send sections to its theme. Print-on-demand apps plug into it.", pricing: "Monthly plan plus payment fees.", regions: ["World"], use: "Buy button → Shopify; Export or share → Shopify" },
  { name: "Ko-fi", url: "https://ko-fi.com", categories: ["support", "payments"], what: "Tips, memberships, commissions and a small shop.", pricing: "Free plan with no fee on tips; optional paid plan.", regions: ["World"], use: "Support me block → Ko-fi" },
  { name: "Buy Me a Coffee", url: "https://www.buymeacoffee.com", categories: ["support"], what: "One-off support and memberships from fans.", pricing: "A small fee per payment.", regions: ["World"], use: "Support me block → Buy Me a Coffee" },
  { name: "Patreon", url: "https://www.patreon.com", categories: ["support"], what: "Monthly memberships with posts, tiers and perks for members.", pricing: "A share of membership income.", regions: ["World"], use: "Support me block → Patreon" },
  { name: "GitHub Sponsors", url: "https://github.com/sponsors", categories: ["support"], what: "Monthly or one-time support for people who make open source.", pricing: "No fee for personal accounts.", regions: ["World"], use: "Support me block → GitHub Sponsors" },
  { name: "Liberapay", url: "https://liberapay.com", categories: ["support"], what: "Recurring donations, run as a non-profit.", pricing: "No platform fee; payment processor fees apply.", regions: ["World"], use: "Support me block → Liberapay" },
  { name: "Open Collective", url: "https://opencollective.com", categories: ["support"], what: "Collect and spend money in the open, for groups and projects.", pricing: "A share of contributions (depends on the host).", regions: ["World"], use: "Support me block → Open Collective" },
  { name: "Buffer", url: "https://buffer.com", categories: ["share"], what: "Plan and schedule posts for Instagram, X, LinkedIn, Facebook, Threads, TikTok and more from one place.", pricing: "Free plan; paid plans for more accounts.", regions: ["World"], use: "Tell people → copy the post into Buffer" },
  { name: "Zapier", url: "https://zapier.com", categories: ["share", "data"], what: "Automations: “when my RSS feed has a new post, share it to…” for almost any app.", pricing: "Free plan; paid plans for more automations.", regions: ["World"], use: "Your blog's RSS feed → Zapier" },
  { name: "Make", url: "https://www.make.com", categories: ["share", "data"], what: "Visual automations between apps, like Zapier.", pricing: "Free plan; paid plans.", regions: ["World"], use: "Your blog's RSS feed → Make" },
  { name: "IFTTT", url: "https://ifttt.com", categories: ["share"], what: "Simple “if this then that” automations, e.g. RSS feed to social posts.", pricing: "Free plan; paid plans.", regions: ["World"], use: "Your blog's RSS feed → IFTTT" },
  { name: "Cal.com", url: "https://cal.com", categories: ["email"], what: "Booking pages: people pick a time that suits you both. Open source.", pricing: "Free plan.", regions: ["World"], use: "Booking block" },
  { name: "Crisp / Tawk.to", url: "https://crisp.chat", categories: ["email"], what: "Live chat on your site, answered from their apps.", pricing: "Free plans.", regions: ["World"], use: "File → Services → Live chat" },
  { name: "Discord", url: "https://discord.com", categories: ["email"], what: "A home for your community: chat, voice and forums.", pricing: "Free.", regions: ["World"], use: "Community block; Tell people" },
  { name: "Buttondown", url: "https://buttondown.com", categories: ["email"], what: "Simple newsletters.", pricing: "Free plan for small lists.", regions: ["World"], use: "Newsletter sign-up" },
  { name: "Kit", url: "https://kit.com", categories: ["email"], what: "Newsletters for creators (formerly ConvertKit).", pricing: "Free plan for small lists.", regions: ["World"], use: "Newsletter sign-up" },
  { name: "Mailchimp", url: "https://mailchimp.com", categories: ["email"], what: "Email marketing.", pricing: "Free plan; paid plans.", regions: ["World"], use: "Newsletter sign-up" },
  { name: "Formspree", url: "https://formspree.io", categories: ["email"], what: "Form messages to your inbox.", pricing: "Free plan.", regions: ["World"], use: "Contact form, Newsletter sign-up" },
  { name: "Netlify Forms", url: "https://docs.netlify.com/forms/setup/", categories: ["email"], what: "Forms for sites hosted on Netlify.", pricing: "Free allowance.", regions: ["World"], use: "Contact form → Netlify" },
  { name: "Memberstack", url: "https://www.memberstack.com", categories: ["accounts"], what: "Sign-up, sign-in, paid plans and members-only content, on your own pages.", pricing: "Free to build; paid when live.", regions: ["World"], use: "Sign in / account (File → Services)" },
  { name: "Clerk", url: "https://clerk.com", categories: ["accounts"], what: "Hosted sign-in pages (Account Portal).", pricing: "Free plan.", regions: ["World"], use: "Sign in / account → hosted page" },
  { name: "Outseta", url: "https://www.outseta.com", categories: ["accounts"], what: "Memberships, billing, email and help desk in one.", pricing: "Monthly plan.", regions: ["World"], use: "Sign in / account → hosted page" },
  { name: "Kinde / Auth0", url: "https://kinde.com", categories: ["accounts"], what: "Hosted sign-in for apps.", pricing: "Free plans.", regions: ["World"], use: "Sign in / account → hosted page" },
  { name: "Supabase", url: "https://supabase.com", categories: ["data"], what: "Database, sign-in, file storage and server functions.", pricing: "Free plan.", regions: ["World"], use: "Data → Supabase table" },
  { name: "Airtable / Notion / Google Sheets", url: "https://airtable.com", categories: ["data"], what: "Spreadsheet-style content anyone on your team can edit.", pricing: "Free plans.", regions: ["World"], use: "Data → collection source" },
  { name: "GitHub", url: "https://github.com", categories: ["data"], what: "Markdown posts, JSON and CSV kept in a repository.", pricing: "Free.", regions: ["World"], use: "Data → GitHub; Publish → GitHub Pages" },
  { name: "Netlify Functions / Cloudflare Workers", url: "https://developers.cloudflare.com/workers/", categories: ["data"], what: "Small bits of server code next to your published site.", pricing: "Free allowance.", regions: ["World"], use: "Publish to Netlify or Cloudflare, then add functions there" }
];

export const listingsIn = (category: string) => LISTINGS.filter((l) => l.categories.includes(category)).sort((a, b) => a.name.localeCompare(b.name));
export const listingUrl = (l: Listing) => l.referral || l.url;
export const hasReferrals = () => LISTINGS.some((l) => l.referral);

export function disclosure(): string {
  return hasReferrals()
    ? "Some links are referral links: FayteWorks may earn a small commission when you buy, at no extra cost to you. That never changes what's listed or the order (alphabetical). Prices change: check each site."
    : "Independent companies with their own terms and prices; nobody pays to be listed, and the order is alphabetical. Prices change: check each site.";
}

export function categoryForPreset(preset: string | undefined): string {
  return CATEGORIES.find((c) => c.group === "Get it made" && c.presets?.includes(preset ?? ""))?.id ?? "print";
}
