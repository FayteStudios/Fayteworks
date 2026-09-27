import { useEffect, useMemo, useRef, useState } from "react";
import { FONT_SOURCES, familyFromFile, LICENCES } from "../editor/FontPicker";
import { downloadCatalogueFont, fontFromFile, LICENCE_NAMES, loadCatalogue, loadPreview, previewFamily, type CatalogueCategory, type CatalogueFont } from "../fonts/catalogue";
import { CUSTOM_FONT_PREFIX, fontCss, FONT_FORMATS, fontLabel, GOOGLE_FONTS, SYSTEM_FONTS } from "../model/fonts";
import { allThemes } from "../model/styles";
import type { CustomFont, Theme } from "../model/types";
import { useEditor } from "../state/store";
import { cls } from "../util/cls";
import type { LookTarget } from "./LookScene";

type Slot = "headingFont" | "bodyFont";

const KINDS: { id: CatalogueCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "serif", label: "Serif" },
  { id: "sans-serif", label: "Sans serif" },
  { id: "display", label: "Display" },
  { id: "handwriting", label: "Handwritten" },
  { id: "monospace", label: "Monospace" }
];

const POPULAR = new Map(GOOGLE_FONTS.map((f, i) => [f.family.toLowerCase(), i]));
const PAGE = 36;

function FontCard({ font, sample, slot, busy, onPick }: { font: CatalogueFont; sample: string; slot: Slot; busy: boolean; onPick: (font: CatalogueFont) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        loadPreview(font);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [font]);
  return (
    <div ref={ref} className="font-card">
      <div className="font-card-head">
        <strong>{font.family}</strong>
        <small>{KINDS.find((k) => k.id === font.category)?.label ?? "Other"}</small>
      </div>
      <span className="font-card-sample" style={{ fontFamily: `"${previewFamily(font)}", system-ui` }}>
        {sample || font.family}
      </span>
      <button className="btn btn--small" disabled={busy} onClick={() => onPick(font)}>
        {busy ? "Adding…" : slot === "headingFont" ? "Use for headings" : "Use for text"}
      </button>
    </div>
  );
}

function Catalogue({ slot, onPick, busy }: { slot: Slot; onPick: (font: CatalogueFont) => void; busy: string | null }) {
  const { state } = useEditor();
  const [fonts, setFonts] = useState<CatalogueFont[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<CatalogueCategory | "all">("all");
  const [sample, setSample] = useState(state.site.name || "My site");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let live = true;
    loadCatalogue().then(
      (list) => live && setFonts(list),
      (e) => live && setError(e instanceof Error ? e.message : String(e))
    );
    return () => void (live = false);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (fonts ?? [])
      .filter((f) => (kind === "all" || f.category === kind) && (!q || f.family.toLowerCase().includes(q)))
      .sort((a, b) => (POPULAR.get(a.family.toLowerCase()) ?? 999) - (POPULAR.get(b.family.toLowerCase()) ?? 999) || a.family.localeCompare(b.family));
  }, [fonts, query, kind]);

  useEffect(() => setShown(PAGE), [query, kind]);

  return (
    <div className="font-catalogue">
      <div className="font-search">
        <input type="search" aria-label="Search fonts" placeholder="Search 2,000 free fonts" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label>
          <span>Sample</span>
          <input type="text" value={sample} onChange={(e) => setSample(e.target.value)} />
        </label>
      </div>
      <div className="font-kinds" role="group" aria-label="Kind of font">
        {KINDS.map((k) => (
          <button key={k.id} aria-pressed={kind === k.id} className={cls(kind === k.id && "is-active")} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="scene-note">Couldn't load the font list ({error}). Check the internet connection, or bring a font file in from “From other sites”.</p>
      ) : !fonts ? (
        <p className="scene-note">Loading the font list…</p>
      ) : (
        <>
          <div className="font-grid">
            {filtered.slice(0, shown).map((f) => (
              <FontCard key={f.id} font={f} sample={sample} slot={slot} busy={busy === f.id} onPick={onPick} />
            ))}
          </div>
          {filtered.length === 0 && <p className="scene-note">No fonts match “{query}”.</p>}
          {filtered.length > shown && (
            <button className="btn font-more" onClick={() => setShown(shown + PAGE)}>
              Show more ({filtered.length - shown} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Elsewhere({ onAdd }: { onAdd: (font: CustomFont) => void }) {
  const [pending, setPending] = useState<{ file: File; family: string; licence: CustomFont["licence"] } | null>(null);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const take = (file: File | undefined) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!FONT_FORMATS[ext]) return setError("Use a .ttf, .otf, .woff or .woff2 file.");
    setError("");
    setPending({ file, family: familyFromFile(file.name), licence: "unknown" });
  };
  return (
    <div className="font-elsewhere">
      <div className="font-sources">
        {FONT_SOURCES.map((s) => (
          <a key={s.name} className="font-source" href={s.url} target="_blank" rel="noreferrer">
            <strong>{s.name}</strong>
            <small>{s.note}</small>
          </a>
        ))}
      </div>
      {!pending ? (
        <button
          className={cls("font-drop", over && "is-over")}
          onClick={() => input.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files[0]);
          }}
        >
          <strong>Drop the font file here</strong>
          <small>or click to choose one: .ttf, .otf, .woff or .woff2</small>
        </button>
      ) : (
        <div className="scene-card font-pending">
          <label className="scene-field">
            <span>Its name</span>
            <input type="text" value={pending.family} onChange={(e) => setPending({ ...pending, family: e.target.value })} />
          </label>
          <span className="scene-field">
            <span>What does its licence allow?</span>
          </span>
          {LICENCES.map((l) => (
            <label key={l.value} className={cls("scene-choice", pending.licence === l.value && "is-active")}>
              <input type="radio" name="font-licence" checked={pending.licence === l.value} onChange={() => setPending({ ...pending, licence: l.value })} />
              <span>
                <strong>{l.label}</strong>
                <small>{l.what}</small>
              </span>
            </label>
          ))}
          <div className="colour-actions">
            <button className="btn" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button
              className="btn btn--primary"
              onClick={async () => {
                const ext = pending.file.name.split(".").pop()?.toLowerCase() ?? "";
                onAdd(await fontFromFile(pending.file, pending.family.trim() || familyFromFile(pending.file.name), FONT_FORMATS[ext], pending.licence));
                setPending(null);
              }}
            >
              Add the font
            </button>
          </div>
        </div>
      )}
      {error && <p className="dialog-status dialog-status--error">{error}</p>}
      <input ref={input} type="file" hidden accept=".ttf,.otf,.woff,.woff2" onChange={(e) => (take(e.target.files?.[0]), (e.target.value = ""))} />
    </div>
  );
}

function Mine({ slot, onUse }: { slot: Slot; onUse: (value: string) => void }) {
  const { state, commit } = useEditor();
  const used = new Set(allThemes(state.site).flatMap((t) => [t.headingFont, t.bodyFont]));
  const families = [...new Map((state.site.fonts ?? []).map((f) => [f.family, f])).values()];
  return (
    <div className="font-mine">
      <h4>Always available</h4>
      <div className="font-builtins">
        {SYSTEM_FONTS.map((f) => (
          <button key={f.value} className="font-builtin" style={{ fontFamily: f.value }} onClick={() => onUse(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      <h4>Added to this site</h4>
      {families.length === 0 ? (
        <p className="scene-note">None yet. Fonts you pick from the catalogue or bring in from other sites show up here.</p>
      ) : (
        <ul className="font-own-list">
          {families.map((f) => {
            const value = CUSTOM_FONT_PREFIX + f.family;
            return (
              <li key={f.family}>
                <span style={{ fontFamily: fontCss(value) }}>{f.family}</span>
                <small className={cls("font-licence", f.licence !== "commercial" && "is-warn")}>{f.licence === "commercial" ? (f.from ?? "Free for any use") : f.licence === "personal" ? "Personal use only" : "Licence not checked"}</small>
                <button className="btn btn--small" onClick={() => onUse(value)}>
                  {slot === "headingFont" ? "Use for headings" : "Use for text"}
                </button>
                <button
                  className="btn btn--small btn--ghost"
                  disabled={used.has(value)}
                  title={used.has(value) ? "It's in use in a look" : "Remove it from the site"}
                  onClick={() => commit((d) => void (d.fonts = d.fonts?.filter((x) => x.family !== f.family)))}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function FontsTab({ target }: { target: LookTarget }) {
  const { state, commit } = useEditor();
  const [slot, setSlot] = useState<Slot>("headingFont");
  const [source, setSource] = useState<"catalogue" | "elsewhere" | "mine">("catalogue");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const theme: Theme = target.theme;
  const personal = (state.site.fonts ?? []).find((f) => f.licence === "personal" && [theme.headingFont, theme.bodyFont].includes(CUSTOM_FONT_PREFIX + f.family));

  const use = (value: string) => target.set({ [slot]: value } as Partial<Theme>, slot);

  const addFonts = (fonts: CustomFont[]) => {
    const family = fonts[0].family;
    commit((d) => void (d.fonts = [...(d.fonts ?? []).filter((x) => x.family !== family), ...fonts]));
    use(CUSTOM_FONT_PREFIX + family);
  };

  async function pick(font: CatalogueFont) {
    if (state.site.fonts?.some((f) => f.family === font.family)) return use(CUSTOM_FONT_PREFIX + font.family);
    setBusy(font.id);
    setError("");
    try {
      addFonts(await downloadCatalogueFont(font));
    } catch (e) {
      setError(`Couldn't download ${font.family} (${e instanceof Error ? e.message : String(e)}).`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fonts-layout">
      <nav className="scene-nav" aria-label="Where fonts come from">
        {(
          [
            ["catalogue", "Free font catalogue", "2,000 fonts, one click to add"],
            ["elsewhere", "From other sites", "dafont, Fontshare and more"],
            ["mine", "Your fonts", "Added fonts and built-in ones"]
          ] as const
        ).map(([id, label, what]) => (
          <button key={id} className={cls("scene-nav-card", source === id && "is-active")} onClick={() => setSource(id)}>
            <strong>{label}</strong>
            <small>{what}</small>
          </button>
        ))}
        <p className="scene-note">Catalogue fonts use open licences like the Open Font License: free on any site, business sites too.</p>
      </nav>

      <div className="fonts-main">
        {error && <p className="dialog-status dialog-status--error">{error}</p>}
        {source === "catalogue" && <Catalogue slot={slot} onPick={pick} busy={busy} />}
        {source === "elsewhere" && <Elsewhere onAdd={(f) => addFonts([f])} />}
        {source === "mine" && <Mine slot={slot} onUse={use} />}
      </div>

      <aside className="fonts-pair" aria-label="Your fonts">
        <section className="scene-card">
          <h3>Your pair</h3>
          <div className="pair-preview" style={{ background: theme.background, color: theme.text }}>
            <span style={{ fontFamily: fontCss(theme.headingFont) }}>Build something you own.</span>
            <small style={{ fontFamily: fontCss(theme.bodyFont), color: theme.muted }}>Body text stays calm and easy to read, so the headings can do the talking.</small>
          </div>
          <span className="scene-note">Choosing a font for:</span>
          <div className="pair-slots" role="radiogroup" aria-label="Choosing a font for">
            {(["headingFont", "bodyFont"] as const).map((s) => (
              <button key={s} role="radio" aria-checked={slot === s} className={cls(slot === s && "is-active")} onClick={() => setSlot(s)}>
                <small>{s === "headingFont" ? "Headings" : "Text"}</small>
                <strong style={{ fontFamily: fontCss(theme[s]) }}>{fontLabel(theme[s])}</strong>
              </button>
            ))}
          </div>
        </section>
        {personal && (
          <p className="font-warning">
            {personal.family} is marked personal use only. It's fine for trying things; before publishing a business site, swap it or buy a licence.
          </p>
        )}
        <p className="scene-note">Licences: {Object.values(LICENCE_NAMES).slice(0, 3).join(", ")} and similar, all free for websites.</p>
      </aside>
    </div>
  );
}
