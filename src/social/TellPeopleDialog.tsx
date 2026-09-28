import { useEffect, useMemo, useRef, useState } from "react";
import { pageDirectories } from "../export/staticSite";
import { openGuide } from "../guides/GuideHost";
import { desktop, type AnnounceService } from "../platform/desktop";
import { getAsset, isAssetRef } from "../state/assets";
import { useEditor } from "../state/store";
import { slugify } from "../util/slug";
import { CHANNELS, DIRECT, postLength, trackedLink, type Channel } from "./announce";
import { EMAIL, iconPath, platformById } from "./platforms";

export const OPEN_TELL = "fayteworks:open-tell";
export const openTellPeople = (target?: string) => window.dispatchEvent(new CustomEvent(OPEN_TELL, { detail: target }));

const openUrl = (url: string) => (desktop ? void desktop.openExternal(url) : void window.open(url, "_blank", "noopener"));

function ChannelIcon({ channel }: { channel: Channel }) {
  const platform = platformById(channel.icon) ?? EMAIL;
  return (
    <svg className="tell-icon" viewBox="0 0 24 24" aria-hidden="true" style={{ color: `#${platform.color}` }}>
      <path d={iconPath(platform)} fill="currentColor" />
    </svg>
  );
}

interface Target {
  value: string;
  label: string;
  url: string;
  title: string;
  description: string;
  image: string;
}

export function TellPeopleDialog({ initial, onClose }: { initial?: string; onClose: () => void }) {
  const { state, page: currentPage } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const site = state.site;
  const base = site.settings.baseUrl.trim().replace(/\/+$/, "");

  const targets = useMemo<Target[]>(() => {
    const dirs = pageDirectories(site.pages, (site.languages ?? []).map((l) => l.code));
    const link = (dir: string) => (base ? `${base}/${dir ? `${dir}/` : ""}` : "");
    const out: Target[] = [];
    for (const p of site.pages) {
      if (p.design || p.protect?.password) continue;
      const dir = dirs.get(p.id) ?? "";
      if (p.collectionId) {
        const c = site.collections?.find((x) => x.id === p.collectionId);
        const titleKey = c?.fields.find((f) => f.type === "text")?.key ?? "title";
        const textKey = c?.fields.find((f) => /excerpt|summary|description/.test(f.key))?.key;
        const imageKey = c?.fields.find((f) => f.type === "image")?.key;
        const dateKey = c?.fields.find((f) => f.type === "date")?.key;
        const items = [...(c?.items ?? [])].sort((a, b) => String(b.values[dateKey ?? ""] ?? "").localeCompare(String(a.values[dateKey ?? ""] ?? "")));
        for (const it of items)
          out.push({
            value: `item:${c!.id}:${it.id}`,
            label: `${c!.name}: ${String(it.values[titleKey] ?? it.slug)}`,
            url: link(`${dir}/${it.slug}`),
            title: String(it.values[titleKey] ?? ""),
            description: String((textKey && it.values[textKey]) ?? ""),
            image: String((imageKey && it.values[imageKey]) ?? "")
          });
        continue;
      }
      out.push({ value: `page:${p.id}`, label: p.title, url: link(dir), title: p.id === site.pages[0].id ? site.name : p.title, description: p.seo.description, image: p.seo.image });
    }
    return out;
  }, [site, base]);

  const [targetValue, setTargetValue] = useState(() => (initial && targets.some((t) => t.value === initial) ? initial : targets.find((t) => t.value === `page:${currentPage.id}`)?.value ?? targets[0]?.value ?? ""));
  const target = targets.find((t) => t.value === targetValue);
  const [message, setMessage] = useState("");
  const [track, setTrack] = useState(true);
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { ok: boolean; text: string; url?: string }>>({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => ref.current?.showModal(), []);
  useEffect(() => {
    if (!target) return;
    setMessage([target.title, target.description].filter((s) => s.trim()).join("\n\n"));
    setResults({});
  }, [targetValue]);

  async function refreshConnected() {
    if (!desktop) return;
    const entries = await Promise.all(DIRECT.map(async (s) => [s, await desktop!.hasToken(s)] as const));
    const next = Object.fromEntries(entries);
    setConnected(next);
    setPicked((p) => (p.size ? p : new Set(DIRECT.filter((s) => next[s]))));
  }
  useEffect(() => void refreshConnected(), []);

  const campaign = target ? slugify(target.title || target.label).slice(0, 40) : "";
  const linkFor = (id: string) => (track ? trackedLink(target?.url ?? "", id, campaign) : target?.url ?? "");

  async function saveAccount(channel: Channel) {
    const values = Object.fromEntries((channel.connect ?? []).map((f) => [f.key, (form[`${channel.id}.${f.key}`] ?? "").trim()]));
    if (Object.values(values).some((v) => !v)) return;
    await desktop!.setToken(channel.id as AnnounceService, JSON.stringify(values));
    setForm({});
    setConnecting(null);
    await refreshConnected();
    setPicked((p) => new Set([...p, channel.id]));
  }

  async function postDirect() {
    if (!desktop) return;
    setBusy(true);
    for (const id of DIRECT.filter((s) => picked.has(s) && connected[s])) {
      setResults((r) => ({ ...r, [id]: { ok: true, text: "Posting…" } }));
      try {
        const { url } = await desktop.platformCall("announce", id, message, linkFor(id));
        setResults((r) => ({ ...r, [id]: { ok: true, text: "✓ Posted", url: url || undefined } }));
      } catch (e) {
        setResults((r) => ({ ...r, [id]: { ok: false, text: e instanceof Error ? e.message : String(e) } }));
      }
    }
    setBusy(false);
  }

  async function copyText(id: string) {
    const text = [message, linkFor(id)].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? "" : c)), 2500);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  async function savePicture() {
    const src = target?.image ?? "";
    if (!src) return;
    if (isAssetRef(src)) {
      const asset = await getAsset(src);
      if (!asset) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(asset.blob);
      a.download = `${campaign || "share"}.${asset.blob.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png"}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (/^https?:/.test(src)) openUrl(src);
  }

  const direct = CHANNELS.filter((c) => c.how === "direct");
  const others = CHANNELS.filter((c) => c.how !== "direct");
  const count = (c: Channel) => (c.limit ? postLength(c, message, linkFor(c.id)) : 0);
  const over = (c: Channel) => Boolean(c.limit && count(c) > c.limit);

  return (
    <dialog ref={ref} className="dialog tell-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Tell people</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      {!base && (
        <p className="dialog-status dialog-status--error">
          Set your site's public address first (click the site name at the top left → Public address), so posts can link to it.{" "}
          <button className="link-button" onClick={() => (onClose(), openGuide("site-address"))}>
            Guide →
          </button>
        </p>
      )}
      <div className="tell-compose">
        <label className="field">
          <span className="field-label">What to share</span>
          <select value={targetValue} onChange={(e) => setTargetValue(e.target.value)}>
            {targets.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Your message</span>
          <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          <span className="field-hint">The link goes after it{target?.url ? `: ${target.url}` : ""}. Most apps show the page's title, description and share picture under it.</span>
        </label>
        <label className="catalogue-check">
          <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} /> Add tracking to the link, so your visitor statistics show which app people came from
        </label>
      </div>

      <h3 className="panel-heading">Post straight to your accounts</h3>
      {!desktop ? (
        <p className="field-hint">Posting straight to Discord, Bluesky, Mastodon and Telegram works in the desktop app, where your account keys are kept encrypted. Here, use the share buttons below.</p>
      ) : (
        <>
          <ul className="tell-list">
            {direct.map((c) => (
              <li key={c.id} className="tell-row">
                <label className="tell-pick">
                  <input type="checkbox" disabled={!connected[c.id]} checked={picked.has(c.id) && Boolean(connected[c.id])} onChange={(e) => setPicked((p) => (e.target.checked ? new Set([...p, c.id]) : new Set([...p].filter((x) => x !== c.id))))} />
                  <ChannelIcon channel={c} /> {c.label}
                </label>
                {c.limit && <span className={`tell-count${over(c) ? " is-over" : ""}`}>{count(c)} / {c.limit}</span>}
                {connected[c.id] ? (
                  <button className="link-button" onClick={() => void desktop!.setToken(c.id as AnnounceService, null).then(refreshConnected)}>
                    Disconnect
                  </button>
                ) : (
                  <button className="btn btn--small" onClick={() => setConnecting(connecting === c.id ? null : c.id)}>
                    Connect…
                  </button>
                )}
                {results[c.id] && (
                  <span className={`tell-result${results[c.id].ok ? "" : " is-error"}`}>
                    {results[c.id].text}{" "}
                    {results[c.id].url && (
                      <button className="link-button" onClick={() => openUrl(results[c.id].url!)}>
                        See it ↗
                      </button>
                    )}
                  </span>
                )}
                {connecting === c.id && (
                  <div className="tell-connect">
                    <p className="field-hint">{c.help}</p>
                    {c.connect!.map((f) => (
                      <input key={f.key} type={f.secret ? "password" : "text"} aria-label={`${c.label} ${f.label}`} placeholder={`${f.label}: ${f.placeholder}`} value={form[`${c.id}.${f.key}`] ?? ""} onChange={(e) => setForm((v) => ({ ...v, [`${c.id}.${f.key}`]: e.target.value }))} />
                    ))}
                    <button className="btn btn--small btn--primary" onClick={() => void saveAccount(c)}>
                      Save (encrypted on this computer)
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <button className="btn btn--primary" disabled={busy || !message.trim() || !DIRECT.some((s) => picked.has(s) && connected[s]) || direct.some((c) => picked.has(c.id) && connected[c.id] && over(c))} onClick={() => void postDirect()}>
            {busy ? "Posting…" : `Post to ${DIRECT.filter((s) => picked.has(s) && connected[s]).length || "the ticked"} account${DIRECT.filter((s) => picked.has(s) && connected[s]).length === 1 ? "" : "s"}`}
          </button>
        </>
      )}

      <h3 className="panel-heading">Share everywhere else</h3>
      <ul className="tell-list tell-list--grid">
        {others.map((c) => (
          <li key={c.id} className="tell-row">
            <span className="tell-pick">
              <ChannelIcon channel={c} /> {c.label}
            </span>
            {c.limit && <span className={`tell-count${over(c) ? " is-over" : ""}`}>{count(c)} / {c.limit}</span>}
            {c.how === "share" ? (
              <button
                className="btn btn--small"
                disabled={!target?.url && c.id !== "email"}
                onClick={() => {
                  if (c.id === "facebook" || c.id === "linkedin") void copyText(c.id);
                  openUrl(c.share!(message, linkFor(c.id)));
                }}
              >
                Open ↗
              </button>
            ) : (
              <span className="tell-copy">
                <button className="btn btn--small" onClick={() => void copyText(c.id)}>
                  {copied === c.id ? "Copied ✓" : "Copy text"}
                </button>
                {target?.image && (
                  <button className="btn btn--small" onClick={() => void savePicture()}>
                    Save picture
                  </button>
                )}
              </span>
            )}
            {c.help && c.how !== "direct" && <span className="field-hint tell-help">{c.help}</span>}
          </li>
        ))}
      </ul>
      <p className="field-hint share-footnote">
        Want new posts shared automatically, or to schedule them for later?{" "}
        <button className="link-button" onClick={() => (onClose(), openGuide("post-everywhere"))}>
          Guide: posting everywhere →
        </button>
      </p>
    </dialog>
  );
}
