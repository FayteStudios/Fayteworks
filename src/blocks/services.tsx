import type { ReactNode } from "react";
import type { FieldDef } from "../model/fields";
import type { BlockDefinition } from "./types";
import { alignField, FLEX_ALIGN, num, str } from "./util";

export const CHECKOUT_PROVIDERS: { value: string; label: string; hosts: RegExp | null; hint: string; example: string }[] = [
  { value: "stripe", label: "Stripe Payment Link", hosts: /^(buy|donate|checkout)\.stripe\.com$/, hint: "Stripe dashboard → Payment Links → Create, then copy the link.", example: "https://buy.stripe.com/…" },
  { value: "lemonsqueezy", label: "Lemon Squeezy", hosts: /(^|\.)lemonsqueezy\.com$/, hint: "Products → Share → copy the checkout link.", example: "https://yourstore.lemonsqueezy.com/checkout/buy/…" },
  { value: "gumroad", label: "Gumroad", hosts: /(^|\.)gumroad\.com$|^gum\.co$/, hint: "Your product's page link.", example: "https://you.gumroad.com/l/…" },
  { value: "paypal", label: "PayPal", hosts: /(^|\.)paypal\.(com|me)$/, hint: "A PayPal.Me link, or a hosted button's link (PayPal → Pay Links and Buttons).", example: "https://www.paypal.com/ncp/payment/…" },
  { value: "shopify", label: "Shopify", hosts: null, hint: "A product link or cart permalink from your store (…/cart/<variant id>:1).", example: "https://yourstore.myshopify.com/cart/123:1" },
  { value: "kofi", label: "Ko-fi / Buy Me a Coffee", hosts: /(^|\.)(ko-fi\.com|buymeacoffee\.com)$/, hint: "Your page or shop item link.", example: "https://ko-fi.com/…" },
  { value: "snipcart", label: "Snipcart cart (add to cart)", hosts: null, hint: "Adds to a cart on your own site. Set your Snipcart public key in File → Services…", example: "" },
  { value: "other", label: "Another checkout link", hosts: null, hint: "Any https checkout or product page.", example: "https://…" }
];

export function checkoutProblem(provider: string, href: string): string {
  if (provider === "snipcart" || href.includes("{{")) return "";
  if (!href) return "Paste the checkout link.";
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return "That isn't a web address.";
  }
  if (url.protocol !== "https:") return "Checkout links must start with https://";
  const p = CHECKOUT_PROVIDERS.find((x) => x.value === provider);
  if (p?.hosts && !p.hosts.test(url.hostname)) return `That isn't a ${p.label} address (expected ${p.example}).`;
  return "";
}

const variantField: FieldDef = {
  key: "variant",
  label: "Style",
  kind: "select",
  options: [
    { value: "solid", label: "Solid" },
    { value: "outline", label: "Outline" },
    { value: "light", label: "Light (for coloured backgrounds)" },
    { value: "ghost", label: "Text link" }
  ]
};
const sizeField: FieldDef = {
  key: "size",
  label: "Size",
  kind: "select",
  options: [
    { value: "s", label: "Small" },
    { value: "m", label: "Medium" },
    { value: "l", label: "Large" }
  ]
};

const buttonClass = (p: Record<string, unknown>) => `b-button b-button--${str(p.variant as string, "solid")} b-button--${str(p.size as string, "m")}`;

const NEWSLETTER: Record<string, { action: (id: string) => string; field: string; idLabel: string; valid: RegExp }> = {
  buttondown: { action: (id) => `https://buttondown.com/api/emails/embed-subscribe/${encodeURIComponent(id)}`, field: "email", idLabel: "Buttondown username", valid: /^[\w-]{1,64}$/ },
  kit: { action: (id) => `https://app.kit.com/forms/${encodeURIComponent(id)}/subscriptions`, field: "email_address", idLabel: "Kit form id (the number in its embed code)", valid: /^\d{3,12}$/ },
  mailchimp: { action: (id) => id, field: "EMAIL", idLabel: "Mailchimp form action (from its embedded form code)", valid: /^https:\/\/[\w-]+\.(us\d+\.)?list-manage\.com\/subscribe\/post\?/ },
  formspree: { action: (id) => `https://formspree.io/f/${encodeURIComponent(id)}`, field: "email", idLabel: "Formspree form id (after /f/)", valid: /^[\w]{4,20}$/ }
};

export const servicesDefinitions: BlockDefinition[] = [
  {
    type: "buy",
    badges: ["account"],
    label: "Buy button",
    category: "Services",
    icon: "🛒",
    description: "Sell with Stripe, Lemon Squeezy, Gumroad, PayPal, Shopify or a Snipcart cart. They handle payment; no server needed.",
    defaultSize: { w: 4, h: 3 },
    defaultProps: { provider: "stripe", href: "", label: "Buy now", price: "", name: "", itemId: "", image: "", variant: "solid", size: "m", align: "left" },
    fields: [
      { key: "provider", label: "Checkout with", kind: "select", options: CHECKOUT_PROVIDERS.map((p) => ({ value: p.value, label: p.label })) },
      { key: "href", label: "Checkout link", kind: "text", placeholder: "https://buy.stripe.com/…", hint: "In a collection card, use a field: {{item.buy_link}}." },
      { key: "label", label: "Label", kind: "text" },
      { key: "price", label: "Price shown (and charged, for Snipcart)", kind: "text", placeholder: "19.00" },
      { key: "name", label: "Product name (Snipcart)", kind: "text" },
      { key: "itemId", label: "Product id (Snipcart; stays the same)", kind: "text" },
      { key: "image", label: "Product image (Snipcart)", kind: "image" },
      variantField,
      sizeField,
      alignField
    ],
    mobileHeight: "content",
    inlineEdit: [{ key: "label", selector: ".b-buy .b-button", mode: "plain", lines: "single" }],
    render: (p, ctx) => {
      const provider = str(p.provider, "stripe");
      const price = str(p.price);
      const label = str(p.label, "Buy now");
      const wrap = (child: ReactNode, hint?: string) => (
        <div className="b-button-wrap b-buy" style={{ justifyContent: FLEX_ALIGN[str(p.align, "left")] }}>
          {child}
          {hint && ctx.isEditor && <span className="b-service-hint">{hint}</span>}
        </div>
      );
      if (provider === "snipcart") {
        const name = str(p.name) || label;
        const id = str(p.itemId) || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const amount = Number(price.replace(/[^\d.]/g, ""));
        return wrap(
          <button
            type="button"
            className={`${buttonClass(p)} snipcart-add-item`}
            data-item-id={id}
            data-item-name={name}
            data-item-price={Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}
            data-item-url={ctx.pageUrl || undefined}
            data-item-image={str(p.image) ? ctx.asset(str(p.image)) : undefined}
          >
            {label}
            {price && <span className="b-buy-price">{price}</span>}
          </button>,
          !price ? "Set the price: Snipcart checks it against this page." : undefined
        );
      }
      const href = str(p.href);
      const problem = checkoutProblem(provider, href);
      if (problem) {
        return ctx.isEditor ? wrap(<span className={`${buttonClass(p)} is-unset`}>{label}</span>, problem) : null;
      }
      return wrap(
        <a className={buttonClass(p)} href={href} target="_blank" rel="noopener noreferrer">
          {label}
          {price && <span className="b-buy-price">{price}</span>}
        </a>
      );
    }
  },
  {
    type: "cart",
    badges: ["account"],
    label: "Cart button",
    category: "Services",
    icon: "🧺",
    description: "Opens the Snipcart cart, with the number of items in it.",
    defaultSize: { w: 2, h: 2 },
    defaultProps: { label: "Cart", variant: "outline", size: "s", align: "right" },
    fields: [{ key: "label", label: "Label", kind: "text" }, variantField, sizeField, alignField],
    mobileHeight: "content",
    render: (p) => (
      <div className="b-button-wrap" style={{ justifyContent: FLEX_ALIGN[str(p.align, "right")] }}>
        <button type="button" className={`${buttonClass(p)} snipcart-checkout`}>
          {str(p.label, "Cart")} <span className="snipcart-items-count b-cart-count">0</span>
        </button>
      </div>
    )
  },
  {
    type: "newsletter",
    badges: ["account"],
    label: "Newsletter sign-up",
    category: "Services",
    icon: "✉",
    description: "Collect email addresses with Buttondown, Kit, Mailchimp or Formspree.",
    defaultSize: { w: 6, h: 5 },
    defaultProps: { service: "buttondown", account: "", heading: "Get the newsletter", placeholder: "you@example.com", buttonLabel: "Subscribe", note: "No spam. Unsubscribe any time." },
    fields: [
      {
        key: "service",
        label: "Service",
        kind: "select",
        options: [
          { value: "buttondown", label: "Buttondown" },
          { value: "kit", label: "Kit (ConvertKit)" },
          { value: "mailchimp", label: "Mailchimp" },
          { value: "formspree", label: "Formspree (a list you export)" }
        ]
      },
      { key: "account", label: "Account", kind: "text", hint: "Buttondown: your username. Kit: the form's number. Mailchimp: the form action URL from its embed code. Formspree: the form id." },
      { key: "heading", label: "Heading", kind: "text" },
      { key: "placeholder", label: "Placeholder", kind: "text" },
      { key: "buttonLabel", label: "Button", kind: "text" },
      { key: "note", label: "Small print", kind: "text" }
    ],
    mobileHeight: "content",
    inlineEdit: [
      { key: "heading", selector: ".b-newsletter-heading", mode: "plain", lines: "single" },
      { key: "buttonLabel", selector: ".b-newsletter .b-button", mode: "plain", lines: "single" },
      { key: "note", selector: ".b-newsletter-note", mode: "plain", lines: "single" }
    ],
    render: (p, ctx) => {
      const service = NEWSLETTER[str(p.service, "buttondown")] ?? NEWSLETTER.buttondown;
      const account = str(p.account).trim();
      const ready = service.valid.test(account);
      if (!ready && !ctx.isEditor) return null;
      return (
        <form className="b-newsletter" action={ready ? service.action(account) : undefined} method="post" target="_blank">
          {str(p.heading) && <p className="b-newsletter-heading">{str(p.heading)}</p>}
          <div className="b-newsletter-row">
            <input type="email" name={service.field} required placeholder={str(p.placeholder)} aria-label="Email address" autoComplete="email" />
            <button type="submit" className="b-button b-button--solid b-button--m">
              {str(p.buttonLabel, "Subscribe")}
            </button>
          </div>
          {str(p.note) && <p className="b-newsletter-note">{str(p.note)}</p>}
          {!ready && <span className="b-service-hint">{account ? `That doesn't look like a ${service.idLabel}.` : `Add your ${service.idLabel}.`}</span>}
        </form>
      );
    }
  },
  {
    type: "account",
    badges: ["account"],
    label: "Sign in / account",
    category: "Services",
    icon: "👤",
    description: "Sign-up, sign-in and account buttons, from Memberstack or any hosted sign-in page (Clerk, Outseta, Kinde, Auth0…).",
    defaultSize: { w: 4, h: 2 },
    defaultProps: { provider: "memberstack", signIn: "", signUp: "", account: "", show: "both", signInLabel: "Sign in", signUpLabel: "Join", accountLabel: "My account", logoutLabel: "Sign out", align: "right", size: "s" },
    fields: [
      {
        key: "provider",
        label: "Accounts by",
        kind: "select",
        options: [
          { value: "memberstack", label: "Memberstack (on this site)" },
          { value: "hosted", label: "A hosted sign-in page (Clerk, Outseta, Kinde, Auth0…)" }
        ],
        hint: "Memberstack: set your app id in File → Services…"
      },
      { key: "show", label: "Show", kind: "select", options: [{ value: "both", label: "Sign in and join" }, { value: "signin", label: "Sign in only" }, { value: "account", label: "Account and sign out (Memberstack)" }] },
      { key: "signIn", label: "Sign-in page (hosted)", kind: "text", placeholder: "https://accounts.example.com/sign-in" },
      { key: "signUp", label: "Sign-up page (hosted)", kind: "text", placeholder: "https://accounts.example.com/sign-up" },
      { key: "signInLabel", label: "Sign-in label", kind: "text" },
      { key: "signUpLabel", label: "Join label", kind: "text" },
      { key: "accountLabel", label: "Account label", kind: "text" },
      { key: "logoutLabel", label: "Sign-out label", kind: "text" },
      sizeField,
      alignField
    ],
    mobileHeight: "content",
    render: (p, ctx) => {
      const size = str(p.size, "s");
      const show = str(p.show, "both");
      const cls = (variant: string) => `b-button b-button--${variant} b-button--${size}`;
      const items: ReactNode[] = [];
      if (str(p.provider, "memberstack") === "memberstack") {
        if (show === "account") {
          items.push(
            <a key="a" href="#" className={cls("outline")} data-ms-modal="profile" data-ms-content="members">
              {str(p.accountLabel, "My account")}
            </a>,
            <a key="o" href="#" className={cls("ghost")} data-ms-action="logout" data-ms-content="members">
              {str(p.logoutLabel, "Sign out")}
            </a>
          );
        } else {
          items.push(
            <a key="i" href="#" className={cls(show === "signin" ? "solid" : "ghost")} data-ms-modal="login" data-ms-content="!members">
              {str(p.signInLabel, "Sign in")}
            </a>
          );
          if (show === "both")
            items.push(
              <a key="u" href="#" className={cls("solid")} data-ms-modal="signup" data-ms-content="!members">
                {str(p.signUpLabel, "Join")}
              </a>
            );
        }
      } else {
        const safe = (u: string) => (/^https:\/\//.test(u) ? u : "");
        const signIn = safe(str(p.signIn));
        const signUp = safe(str(p.signUp));
        if (signIn) items.push(<a key="i" href={signIn} className={cls(signUp ? "ghost" : "solid")}>{str(p.signInLabel, "Sign in")}</a>);
        if (signUp && show === "both") items.push(<a key="u" href={signUp} className={cls("solid")}>{str(p.signUpLabel, "Join")}</a>);
        if (!items.length) return ctx.isEditor ? <span className="b-service-hint">Paste your provider's hosted sign-in page (https://…).</span> : null;
      }
      return (
        <div className="b-button-wrap b-account" style={{ justifyContent: FLEX_ALIGN[str(p.align, "right")], gap: `${num(p.gap, 8)}px` }}>
          {items}
        </div>
      );
    }
  }
];
