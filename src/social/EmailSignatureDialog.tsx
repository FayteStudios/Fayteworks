import { useEffect, useMemo, useRef, useState } from "react";
import type { Site } from "../model/types";
import { useEditor } from "../state/store";
import { isExampleLink, platformFor } from "./platforms";

interface SignatureInfo {
  name: string;
  role: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  picture: string;
  round: boolean;
  links: boolean;
}

const KEY = "fayteworks:signature";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "#39" }[c]};`);

function siteProfiles(site: Site): { label: string; url: string }[] {
  const seen = new Set<string>();
  const own = site.settings.baseUrl.trim().replace(/\/+$/, "");
  const out: { label: string; url: string }[] = [];
  const sections = [...site.pages.filter((p) => !p.design).flatMap((p) => p.sections), ...(site.header ? [site.header] : []), ...(site.footer ? [site.footer] : [])];
  for (const b of sections.flatMap((s) => s.blocks))
    if (b.type === "social-links" && Array.isArray(b.props.links))
      for (const l of b.props.links) {
        const url = String(l.url ?? "").trim();
        if (!/^https:\/\//.test(url) || isExampleLink(url) || seen.has(url) || (own && url.replace(/\/+$/, "") === own)) continue;
        seen.add(url);
        out.push({ label: String(l.label ?? "").trim() || platformFor(url).label, url });
      }
  return out.slice(0, 6);
}

export function signatureHtml(info: SignatureInfo, site: Site): string {
  const accent = /^#[0-9a-f]{3,8}$/i.test(site.theme.accent) ? site.theme.accent : "#2f6bff";
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const website = info.website.trim();
  const profiles = info.links ? siteProfiles(site) : [];
  const line = (html: string) => (html ? `<div style="${font}font-size:13px;line-height:1.5;color:#555555;">${html}</div>` : "");
  const picture = /^https:\/\/\S+$/.test(info.picture.trim())
    ? `<td style="padding:0 14px 0 0;vertical-align:top;"><img src="${esc(info.picture.trim())}" width="72" height="72" alt="${esc(info.name)}" style="display:block;width:72px;height:72px;${info.round ? "border-radius:50%;" : "border-radius:8px;"}object-fit:cover;"></td>`
    : "";
  const contact = [info.phone.trim() && `<a href="tel:${esc(info.phone.replace(/[^\d+]/g, ""))}" style="color:#555555;text-decoration:none;">${esc(info.phone.trim())}</a>`, info.email.trim() && `<a href="mailto:${esc(info.email.trim())}" style="color:#555555;text-decoration:none;">${esc(info.email.trim())}</a>`].filter(Boolean).join(" &nbsp;·&nbsp; ");
  const site_ = website ? `<a href="${esc(website)}" style="color:${accent};text-decoration:none;font-weight:bold;">${esc(website.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>` : "";
  const social = profiles.map((p) => `<a href="${esc(p.url)}" style="color:${accent};text-decoration:none;">${esc(p.label)}</a>`).join(" &nbsp;·&nbsp; ");
  return [
    `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>`,
    picture,
    `<td style="vertical-align:top;border-left:3px solid ${accent};padding:0 0 0 12px;">`,
    `<div style="${font}font-size:15px;font-weight:bold;color:#222222;">${esc(info.name.trim())}</div>`,
    line([info.role.trim(), info.company.trim()].filter(Boolean).map(esc).join(", ")),
    line(contact),
    line(site_),
    line(social),
    `</td></tr></table>`
  ].join("");
}

export function EmailSignatureDialog({ onClose }: { onClose: () => void }) {
  const { state } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const site = state.site;
  const [info, setInfo] = useState<SignatureInfo>(() => {
    const blank: SignatureInfo = { name: "", role: "", company: site.name, phone: "", email: "", website: site.settings.baseUrl.trim(), picture: "", round: true, links: true };
    try {
      return { ...blank, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
    } catch {
      return blank;
    }
  });
  const [status, setStatus] = useState("");
  useEffect(() => ref.current?.showModal(), []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(info));
    } catch {
    }
  }, [info]);
  const html = useMemo(() => signatureHtml(info, site), [info, site]);
  const set = (key: keyof SignatureInfo) => (e: React.ChangeEvent<HTMLInputElement>) => setInfo((v) => ({ ...v, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function copy(kind: "rich" | "html") {
    try {
      if (kind === "rich" && "ClipboardItem" in window) {
        const text = [info.name, [info.role, info.company].filter(Boolean).join(", "), info.phone, info.email, info.website].filter((s) => s.trim()).join("\n");
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
        setStatus("✓ Copied. Paste it into your email program's signature settings.");
      } else {
        await navigator.clipboard.writeText(html);
        setStatus("✓ HTML copied.");
      }
    } catch {
      setStatus("Couldn't copy here: select the signature in the preview and copy it (Ctrl C).");
    }
  }

  const text = (key: keyof SignatureInfo, label: string, placeholder = "") => (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type="text" value={String(info[key])} placeholder={placeholder} onChange={set(key)} />
    </label>
  );

  return (
    <dialog ref={ref} className="dialog signature-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Email signature</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="signature-layout">
        <div>
          {text("name", "Name", "Sam Rivera")}
          {text("role", "Role", "Designer")}
          {text("company", "Business")}
          {text("phone", "Phone")}
          {text("email", "Email")}
          {text("website", "Website", "https://yoursite.com")}
          {text("picture", "Photo or logo address (optional)", "https://yoursite.com/assets/logo.png")}
          <span className="field-hint">Email needs a picture from the web: open your published site, right-click the picture → Copy image address.</span>
          <label className="catalogue-check">
            <input type="checkbox" checked={info.round} onChange={set("round")} /> Round photo
          </label>
          <label className="catalogue-check">
            <input type="checkbox" checked={info.links} onChange={set("links")} /> Add my social links (from the site's Social links blocks)
          </label>
        </div>
        <div>
          <span className="field-label">Preview</span>
          <div className="signature-preview" dangerouslySetInnerHTML={{ __html: html }} />
          <div className="field-row">
            <button className="btn btn--primary" onClick={() => void copy("rich")}>
              Copy signature
            </button>
            <button className="btn" onClick={() => void copy("html")}>
              Copy HTML
            </button>
          </div>
          {status && <p className="field-hint">{status}</p>}
          <details className="dialog-help">
            <summary>Where to paste it</summary>
            <p>
              <strong>Gmail</strong>: Settings (⚙) → See all settings → General → Signature → Create new, paste, then Save changes at the bottom.
            </p>
            <p>
              <strong>Outlook</strong>: Settings → Mail → Compose and reply (or Signatures) → New signature, paste, Save.
            </p>
            <p>
              <strong>Apple Mail</strong>: Mail → Settings → Signatures → +, untick “Always match my default message font”, paste.
            </p>
          </details>
        </div>
      </div>
    </dialog>
  );
}
