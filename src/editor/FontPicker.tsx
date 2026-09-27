import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_LABEL,
  CUSTOM_FONT_PREFIX,
  FONT_FORMATS,
  FONT_MIME,
  fontCss,
  fontLabel,
  GOOGLE_FONT_PREFIX,
  GOOGLE_FONTS,
  googleFontsCssUrl,
  SYSTEM_FONTS,
  type FontCategory
} from "../model/fonts";
import type { CustomFont } from "../model/types";
import { desktop } from "../platform/desktop";
import { putAsset } from "../state/assets";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import { createId } from "../util/id";
import { useStylesheet } from "./useStylesheet";
import { fontFromFile } from "../fonts/catalogue";

const PREVIEW_TEXT = [...new Set(GOOGLE_FONTS.map((f) => f.family).join("") + "Aa")].join("");

const CATEGORIES: FontCategory[] = ["sans", "serif", "display", "mono"];

export const FONT_SOURCES = [
  { name: "Google Fonts", url: "https://fonts.google.com", note: "Over 1,500 families, all free for any use. Many are already in this list." },
  { name: "Fontshare", url: "https://www.fontshare.com", note: "Quality fonts, free for personal and commercial use." },
  { name: "Font Squirrel", url: "https://www.fontsquirrel.com", note: "Hand-picked fonts that are free for commercial use." },
  { name: "Velvetyne", url: "https://velvetyne.fr", note: "Experimental, open-source display fonts (OFL)." },
  { name: "The League of Moveable Type", url: "https://www.theleagueofmoveabletype.com", note: "Classic open-source fonts." },
  { name: "dafont", url: "https://www.dafont.com", note: "Huge and fun, but many are for personal use only. Tick “100% Free” or “Public domain / GPL / OFL” in its filters." }
];

export const LICENCES: { value: CustomFont["licence"]; label: string; what: string }[] = [
  { value: "commercial", label: "Free for any use", what: "OFL, Apache, public domain, or a licence you bought." },
  { value: "personal", label: "Personal use only", what: "Fine for your own hobby site, not for a business or client." },
  { value: "unknown", label: "Not sure", what: "You'll get a reminder to check before publishing." }
];

export function familyFromFile(name: string): string {
  return name
    .replace(/\.(woff2?|ttf|otf)$/i, "")
    .replace(/[-_](regular|variable|vf|webfont)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

export function FontPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const [openUp, setOpenUp] = useState(false);
  const [tab, setTab] = useState<"fonts" | "find">("fonts");
  const [pending, setPending] = useState<{ file: File; family: string; licence: CustomFont["licence"] } | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { state, commit } = useEditor();
  const own = state.site.fonts ?? [];

  async function importFont() {
    if (!pending) return;
    const ext = pending.file.name.split(".").pop()?.toLowerCase() ?? "";
    const format = FONT_FORMATS[ext];
    if (!format) return setError("Use a .ttf, .otf, .woff or .woff2 file.");
    const family = pending.family.trim() || familyFromFile(pending.file.name);
    const font = await fontFromFile(pending.file, family, format, pending.licence);
    commit((draft) => {
      draft.fonts = [...(draft.fonts ?? []).filter((x) => x.family !== family), font];
    });
    setPending(null);
    choose(CUSTOM_FONT_PREFIX + family);
  }
  const rootRef = useRef<HTMLDivElement>(null);

  useStylesheet("font-picker-previews", open ? googleFontsCssUrl(GOOGLE_FONTS, PREVIEW_TEXT) : null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const q = query.trim().toLowerCase();
  const system = useMemo(() => SYSTEM_FONTS.filter((f) => f.label.toLowerCase().includes(q)), [q]);
  const google = useMemo(() => GOOGLE_FONTS.filter((f) => f.family.toLowerCase().includes(q)), [q]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  const option = (optionValue: string, label: string) => (
    <button
      key={optionValue}
      className={cls("font-option", optionValue === value && "is-active")}
      style={{ fontFamily: fontCss(optionValue) }}
      onClick={() => choose(optionValue)}
    >
      {label}
    </button>
  );

  return (
    <div ref={rootRef} className="font-picker">
      <button className="font-picker-button" style={{ fontFamily: fontCss(value) }} onClick={(e) => {
          setOpenUp(window.innerHeight - e.currentTarget.getBoundingClientRect().bottom < 420);
          setOpen((o) => !o);
        }}>
        {fontLabel(value)}
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className={cls("font-picker-popover", openUp && "is-up")}>
          <div className="segmented font-picker-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "fonts"} className={cls(tab === "fonts" && "is-active")} onClick={() => setTab("fonts")}>
              Fonts
            </button>
            <button role="tab" aria-selected={tab === "find"} className={cls(tab === "find" && "is-active")} onClick={() => setTab("find")}>
              Find free fonts
            </button>
          </div>
          {pending ? (
            <div className="font-import">
              <strong>Import {pending.file.name}</strong>
              <label className="field">
                <span className="field-label">Name it</span>
                <input type="text" value={pending.family} onChange={(e) => setPending({ ...pending, family: e.target.value })} />
              </label>
              <span className="field-label">What does its licence allow?</span>
              {LICENCES.map((l) => (
                <label key={l.value} className={cls("font-licence", pending.licence === l.value && "is-active")}>
                  <input type="radio" name="font-licence" checked={pending.licence === l.value} onChange={() => setPending({ ...pending, licence: l.value })} />
                  <span>
                    <strong>{l.label}</strong>
                    <small>{l.what}</small>
                  </span>
                </label>
              ))}
              {error && <p className="dialog-status dialog-status--error">{error}</p>}
              <div className="field-row">
                <button className="btn btn--small" onClick={() => setPending(null)}>
                  Cancel
                </button>
                <button className="btn btn--small btn--primary" onClick={() => void importFont()}>
                  Import and use it
                </button>
              </div>
            </div>
          ) : tab === "find" ? (
            <div className="font-sources">
              <p className="field-hint">Download a font from one of these, then come back and use Import a font file.</p>
              {FONT_SOURCES.map((src) => (
                <button key={src.name} className="choice-row" onClick={() => (desktop ? void desktop.openExternal(src.url) : void window.open(src.url, "_blank", "noopener"))}>
                  <strong>{src.name} ↗</strong>
                  <small>{src.note}</small>
                </button>
              ))}
            </div>
          ) : (
          <>
          <input autoFocus type="text" placeholder="Search fonts" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="font-picker-list">
            <h4>Your fonts</h4>
            {own
              .filter((f) => f.family.toLowerCase().includes(q))
              .map((f) => option(CUSTOM_FONT_PREFIX + f.family, `${f.family}${f.licence === "commercial" ? "" : f.licence === "personal" ? "  · personal use" : "  · check licence"}`))}
            <button className="btn btn--small btn--block font-import-button" onClick={() => fileRef.current?.click()}>
              + Import a font file (.ttf, .otf, .woff)…
            </button>
            {system.length > 0 && (
              <>
                <h4>On every device (no download)</h4>
                {system.map((f) => option(f.value, f.label))}
              </>
            )}
            {CATEGORIES.map((category) => {
              const fonts = google.filter((f) => f.category === category);
              return fonts.length === 0 ? null : (
                <div key={category}>
                  <h4>Google · {CATEGORY_LABEL[category]}</h4>
                  {fonts.map((f) => option(GOOGLE_FONT_PREFIX + f.family, f.family))}
                </div>
              );
            })}
          </div>
          <form
            className="font-picker-custom"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) choose(GOOGLE_FONT_PREFIX + custom.trim());
            }}
          >
            <input type="text" placeholder="Any Google font, e.g. Quicksand" value={custom} onChange={(e) => setCustom(e.target.value)} />
            <button className="btn btn--small" type="submit">
              Use
            </button>
          </form>
          </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2,font/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              setError("");
              if (file) setPending({ file, family: familyFromFile(file.name), licence: "unknown" });
            }}
          />
        </div>
      )}
    </div>
  );
}
