import type { SiteServices } from "../model/types";

export const ANALYTICS: { value: NonNullable<SiteServices["analytics"]>["provider"]; label: string; idLabel: string; valid: RegExp; note: string; url: string }[] = [
  { value: "plausible", label: "Plausible", idLabel: "Your site's domain in Plausible", valid: /^[a-z0-9.-]+\.[a-z]{2,}$/i, note: "No cookies; no consent banner needed in most places.", url: "https://plausible.io" },
  { value: "umami", label: "Umami", idLabel: "Website id", valid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, note: "No cookies. Free cloud plan, or host it yourself.", url: "https://umami.is" },
  { value: "cloudflare", label: "Cloudflare Web Analytics", idLabel: "Beacon token", valid: /^[0-9a-f]{32}$/i, note: "Free, no cookies.", url: "https://www.cloudflare.com/web-analytics/" },
  { value: "fathom", label: "Fathom", idLabel: "Site id", valid: /^[A-Z0-9]{5,12}$/, note: "No cookies.", url: "https://usefathom.com" },
  { value: "google", label: "Google Analytics", idLabel: "Measurement id (G-…)", valid: /^G-[A-Z0-9]{4,16}$/, note: "Uses cookies: in the EU/UK you need visitors' consent first.", url: "https://analytics.google.com" }
];

export const SNIPCART_KEY = /^[A-Za-z0-9+/=_-]{20,200}$/;
export const CRISP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TAWK_PROPERTY = /^[0-9a-f]{24}$/i;
export const TAWK_WIDGET = /^[\w]{3,32}$/;
export const MEMBERSTACK_APP = /^app_[A-Za-z0-9]{6,64}$/;
const HTTPS_URL = /^https:\/\/[\w.-]+(:\d+)?(\/[\w./-]*)?$/;

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function serviceTags(services: SiteServices | undefined, body: string): { head: string[]; bodyEnd: string[] } {
  const head: string[] = [];
  const bodyEnd: string[] = [];
  const a = services?.analytics;
  const spec = a && ANALYTICS.find((x) => x.value === a.provider);
  if (a && spec && spec.valid.test(a.id)) {
    const id = attr(a.id);
    switch (a.provider) {
      case "plausible":
        head.push(`<script defer data-domain="${id}" src="https://plausible.io/js/script.js"></script>`);
        break;
      case "umami":
        head.push(`<script defer src="${attr(a.src && HTTPS_URL.test(a.src) ? a.src : "https://cloud.umami.is/script.js")}" data-website-id="${id}"></script>`);
        break;
      case "cloudflare":
        head.push(`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${id}"}'></script>`);
        break;
      case "fathom":
        head.push(`<script src="https://cdn.usefathom.com/script.js" data-site="${id}" defer></script>`);
        break;
      case "google":
        head.push(
          `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>`,
          `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","${id}");</script>`
        );
        break;
    }
  }
  const snipcart = services?.snipcart;
  if (snipcart && SNIPCART_KEY.test(snipcart.publicKey) && /snipcart-(add-item|checkout)/.test(body)) {
    head.push(
      `<link rel="preconnect" href="https://app.snipcart.com">`,
      `<link rel="preconnect" href="https://cdn.snipcart.com">`,
      `<link rel="stylesheet" href="https://cdn.snipcart.com/themes/v3.7.1/default/snipcart.css">`
    );
    const currency = /^[a-z]{3}$/i.test(snipcart.currency ?? "") ? ` data-currency="${snipcart.currency!.toLowerCase()}"` : "";
    bodyEnd.push(`<div hidden id="snipcart" data-api-key="${attr(snipcart.publicKey)}"${currency}></div>`, `<script async src="https://cdn.snipcart.com/themes/v3.7.1/default/snipcart.js"></script>`);
  }
  const chat = services?.chat;
  if (chat?.provider === "crisp" && CRISP_ID.test(chat.id)) {
    bodyEnd.push(`<script>window.$crisp=[];window.CRISP_WEBSITE_ID="${chat.id}";(function(){var s=document.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;document.head.appendChild(s);})();</script>`);
  } else if (chat?.provider === "tawk" && TAWK_PROPERTY.test(chat.id) && TAWK_WIDGET.test(chat.widget || "default")) {
    bodyEnd.push(`<script>var Tawk_API=Tawk_API||{},Tawk_LoadStart=new Date();(function(){var s=document.createElement("script");s.async=true;s.src="https://embed.tawk.to/${chat.id}/${chat.widget || "default"}";s.charset="UTF-8";s.setAttribute("crossorigin","*");document.head.appendChild(s);})();</script>`);
  }
  const memberstack = services?.memberstack;
  if (memberstack && MEMBERSTACK_APP.test(memberstack.appId) && /data-ms-/.test(body)) {
    head.push(`<script data-memberstack-app="${attr(memberstack.appId)}" src="https://static.memberstack.com/scripts/v1/memberstack.js" type="text/javascript"></script>`);
  }
  return { head, bodyEnd };
}
