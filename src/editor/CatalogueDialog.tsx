import { useEffect, useMemo, useRef, useState } from "react";
import { desktop, type CaptureResult } from "../platform/desktop";
import { PlatformImport } from "../share/PlatformImport";
import { CATALOGUE, CATALOGUE_CATEGORIES, CATALOGUE_LIBRARIES, catalogueBlockProps, type CatalogueItem } from "../catalogue";
import { listMine, prepareMine, removeMine, type MineItem } from "../catalogue/mine";
import { rememberImport } from "../catalogue/imported";
import { fetchComponent, loadTailwindLibraries, loadUiverse, remoteBlockProps, remoteSize, sourceUrl, type RemoteEntry } from "../catalogue/remote";
import { LICENCES } from "../blocks/code";
import { themeVars } from "../model/theme";
import type { Block, BlockProps } from "../model/types";
import { extractSlots, sanitizeHtml, SLOT_PREFIX } from "../site/customHtml";
import { BlockContent } from "../site/SiteRenderer";
import { useEditor } from "../state/store";
import { useAddBlock } from "./addBlock";

const PREVIEW_WIDTH = 264;
const PREVIEW_HEIGHT = 168;

type PreviewBg = "auto" | "light" | "dark";

interface Entry {
  key: string;
  name: string;
  category: string;
  tags: string[];
  author: string;
  library: string;
  licence: string;
  dark: boolean;
  item?: CatalogueItem;
  remote?: RemoteEntry;
  mine?: MineItem;
}

const BATCH = 36;
const STYLE_CHIPS = ["animated", "hover", "gradient", "neon", "glass", "3d", "minimalist", "dark", "neumorphism"];
const FAVS_KEY = "fayteworks:catalogue-favs";
const RECENT_KEY = "fayteworks:catalogue-recent";

const VIEWS = [
  ["all", "All"],
  ["featured", "Featured"],
  ["uiverse", "Uiverse"],
  ["hyperui", "HyperUI"],
  ["meraki", "Meraki UI"],
  ["flowbite", "Flowbite"]
] as const;
type View = (typeof VIEWS)[number][0] | "favourites" | "recent" | "mine";

function mineEntry(mine: MineItem): Entry {
  return {
    key: `mine:${mine.id}`,
    name: mine.name,
    category: mine.type === "vector" ? "Drawings" : "Mine",
    tags: [String(mine.props.licence ?? ""), mine.type === "vector" ? "drawing" : "code"],
    author: String(mine.props.author ?? "") || "You",
    library: "Mine",
    licence: String(mine.props.licence ?? "") || "Own work",
    dark: false,
    mine
  };
}

function readList(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
  }
}

const featuredEntries: Entry[] = CATALOGUE.map((item) => ({
  key: `fw:${item.id}`,
  name: item.name,
  category: item.category,
  tags: item.tags,
  author: item.source.author,
  library: item.source.library,
  licence: item.source.licence,
  dark: !!item.dark,
  item
}));

function remoteEntry(remote: RemoteEntry): Entry {
  return {
    key: remote.key,
    name: remote.name,
    category: remote.category,
    tags: remote.tags,
    author: remote.author,
    library: remote.source.name,
    licence: remote.source.licence,
    dark: remote.dark,
    remote
  };
}

function PreviewFrame({ id, props, size, dark, type = "code" }: { id: string; props: BlockProps; size: { w: number; h: number }; dark: boolean; type?: string }) {
  const { state } = useEditor();
  const layoutWidth = Math.max(360, size.w * 75);
  const layoutHeight = Math.max(size.h * 24, 120);
  const scale = Math.min(1, PREVIEW_WIDTH / layoutWidth, PREVIEW_HEIGHT / layoutHeight);
  const block = useMemo<Block>(() => ({ id: `catalogue-${id}`, type, x: 0, y: 0, w: size.w, h: size.h, props }), [id, props, size, type]);
  return (
    <div className={`catalogue-preview${dark ? " catalogue-preview--dark" : ""}`} aria-hidden>
      <div
        className="site-root catalogue-preview-inner"
        style={{ ...themeVars(state.site.theme), width: layoutWidth, height: layoutHeight, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <BlockContent block={block} />
      </div>
    </div>
  );
}

function RemotePreview({ entry, dark }: { entry: RemoteEntry; dark: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [props, setProps] = useState<BlockProps | null>(null);
  const [failed, setFailed] = useState(false);
  const wantDark = dark && entry.hasDark;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "300px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    fetchComponent(entry, wantDark)
      .then((code) => remoteBlockProps(entry, code))
      .then(
        (next) => live && setProps(next),
        () => live && setFailed(true)
      );
    return () => {
      live = false;
    };
  }, [visible, entry, wantDark]);

  const size = useMemo(() => remoteSize(entry.category), [entry.category]);
  return (
    <div ref={ref}>
      {props ? (
        <PreviewFrame id={entry.key} props={props} size={size} dark={dark} />
      ) : (
        <div className={`catalogue-preview catalogue-preview--status${dark ? " catalogue-preview--dark" : ""}`}>
          <span>{failed ? "Preview unavailable (offline?)" : "Loading…"}</span>
        </div>
      )}
    </div>
  );
}

function Browse({ onAdd }: { onAdd: (props: BlockProps, size: { w: number; h: number }, type?: string, imported?: boolean) => void }) {
  const [mine, setMine] = useState(listMine);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("all");
  const [category, setCategory] = useState("All");
  const [styles, setStyles] = useState<string[]>([]);
  const [bg, setBg] = useState<PreviewBg>("auto");
  const [favs, setFavs] = useState(() => readList(FAVS_KEY));
  const [recent] = useState(() => readList(RECENT_KEY));
  const [shown, setShown] = useState(BATCH);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [libraries, setLibraries] = useState<Record<string, { entries: Entry[]; categories: string[] }>>({});
  const [pending, setPending] = useState(2);
  const [indexFailed, setIndexFailed] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    for (const [name, load] of [["uiverse", loadUiverse], ["tailwind", loadTailwindLibraries]] as const) {
      load()
        .then(
          ({ entries, categories }) => live && setLibraries((all) => ({ ...all, [name]: { entries: entries.map(remoteEntry), categories } })),
          () => setIndexFailed(true)
        )
        .finally(() => live && setPending((n) => n - 1));
    }
    return () => {
      live = false;
    };
  }, []);

  const remoteEntries = useMemo(() => Object.values(libraries).flatMap((l) => l.entries), [libraries]);

  const categories = useMemo(() => {
    const all = new Set<string>(CATALOGUE_CATEGORIES);
    for (const l of Object.values(libraries)) l.categories.forEach((c) => all.add(c));
    return ["All", ...all];
  }, [libraries]);

  const results = useMemo(() => {
    const byKey = new Map<string, Entry>();
    for (const e of featuredEntries) byKey.set(e.key, e);
    for (const e of remoteEntries) byKey.set(e.key, e);
    const mineEntries = mine.map(mineEntry);
    for (const e of mineEntries) byKey.set(e.key, e);
    const pick = (keys: string[]) => keys.map((k) => byKey.get(k)).filter((e): e is Entry => !!e);
    const pool =
      view === "favourites"
        ? pick(favs)
        : view === "recent"
          ? pick(recent)
          : view === "mine"
            ? mineEntries
          : view === "featured"
            ? featuredEntries
            : view === "all"
              ? [...mineEntries, ...featuredEntries, ...remoteEntries]
              : remoteEntries.filter((e) => e.remote?.source.id === view);
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = pool.filter((e) => {
      if (category !== "All" && e.category !== category) return false;
      const haystack = [e.name, e.category, e.library, e.author, ...e.tags].join(" ").toLowerCase();
      if (!styles.every((s) => (s === "dark" ? e.dark || e.remote?.hasDark || haystack.includes("dark") : haystack.includes(s)))) return false;
      return words.every((w) => haystack.includes(w));
    });
    if (!words.length) return matches;
    const score = (e: Entry) => words.filter((w) => e.name.toLowerCase().includes(w)).length;
    return matches
      .map((e, i) => ({ e, i, s: score(e) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((m) => m.e);
  }, [query, view, category, styles, favs, recent, remoteEntries, mine]);

  useEffect(() => {
    setShown(BATCH);
    gridRef.current?.scrollTo({ top: 0 });
  }, [query, view, category, styles]);

  useEffect(() => {
    const el = moreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => e.isIntersecting && setShown((n) => n + BATCH), { root: gridRef.current, rootMargin: "400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [results, shown]);

  function toggleFav(key: string) {
    setFavs((list) => {
      const next = list.includes(key) ? list.filter((k) => k !== key) : [key, ...list];
      writeList(FAVS_KEY, next);
      return next;
    });
  }

  function toggleStyle(style: string) {
    setStyles((list) => (list.includes(style) ? list.filter((s) => s !== style) : [...list, style]));
  }

  const isDark = (e: Entry) => (bg === "auto" ? e.dark : bg === "dark");

  async function add(entry: Entry) {
    setError("");
    const remember = () => writeList(RECENT_KEY, [entry.key, ...readList(RECENT_KEY).filter((k) => k !== entry.key)].slice(0, 24));
    if (entry.item) {
      remember();
      return onAdd(catalogueBlockProps(entry.item), entry.item.size);
    }
    if (entry.mine) {
      remember();
      return onAdd(await prepareMine(entry.mine), entry.mine.size, entry.mine.type, false);
    }
    if (!entry.remote) return;
    setAdding(entry.key);
    try {
      const code = await fetchComponent(entry.remote, isDark(entry));
      const props = await remoteBlockProps(entry.remote, code);
      const { w, h } = remoteSize(entry.remote.category);
      remember();
      onAdd(props, { w, h });
    } catch (e) {
      setError(`Couldn't download “${entry.name}”. Check the internet connection and try again. (${e instanceof Error ? e.message : String(e)})`);
      setAdding(null);
    }
  }

  const total = featuredEntries.length + remoteEntries.length;
  const views: (readonly [View, string])[] = [...VIEWS, ["mine", `Mine${mine.length ? ` (${mine.length})` : ""}`], ["favourites", `★ Favourites${favs.length ? ` (${favs.length})` : ""}`], ["recent", "Recent"]];

  return (
    <>
      <div className="catalogue-filters">
        <input
          type="search"
          placeholder={`Search ${total.toLocaleString()} components (e.g. neon button, pricing, glass card, an author)`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="catalogue-chips catalogue-bg" title="Preview background">
          {(["auto", "light", "dark"] as const).map((value) => (
            <button key={value} className={bg === value ? "is-active" : undefined} aria-label={`Preview background: ${value}`} onClick={() => setBg(value)}>
              {value === "auto" ? "Auto" : value === "light" ? "☀ Light" : "☾ Dark"}
            </button>
          ))}
        </div>
      </div>
      <div className="catalogue-chips catalogue-views">
        {views.map(([value, label]) => (
          <button key={value} className={view === value ? "is-active" : undefined} onClick={() => setView(value)}>
            {label}
          </button>
        ))}
      </div>
      <div className="catalogue-chips catalogue-categories">
        {categories.map((c) => (
          <button key={c} className={c === category ? "is-active" : undefined} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="catalogue-chips catalogue-styles">
        {STYLE_CHIPS.map((s) => (
          <button key={s} className={styles.includes(s) ? "is-active" : undefined} aria-pressed={styles.includes(s)} onClick={() => toggleStyle(s)}>
            {s}
          </button>
        ))}
        <span className="catalogue-count">
          {results.length.toLocaleString()} {results.length === 1 ? "component" : "components"}
          {pending > 0 && " (loading the libraries…)"}
        </span>
      </div>
      {error && <p className="dialog-note catalogue-error">{error}</p>}
      <div className="catalogue-grid" ref={gridRef}>
        {results.slice(0, shown).map((entry) => {
          const fav = favs.includes(entry.key);
          return (
            <article key={entry.key} className="catalogue-item" data-key={entry.key}>
              {entry.item ? (
                <PreviewFrame id={entry.item.id} props={catalogueBlockProps(entry.item)} size={entry.item.size} dark={isDark(entry)} />
              ) : entry.mine ? (
                <PreviewFrame id={entry.mine.id} props={entry.mine.props} size={entry.mine.size} dark={isDark(entry)} type={entry.mine.type} />
              ) : (
                entry.remote && <RemotePreview entry={entry.remote} dark={isDark(entry)} />
              )}
              <div className="catalogue-item-info">
                <div>
                  <strong title={entry.name}>{entry.name}</strong>
                  <span className="catalogue-credit" title={`${entry.author} · ${entry.library} · ${entry.licence}`}>
                    {entry.library === "FayteWorks" ? "FayteWorks" : `${entry.author} · ${entry.library}`} ·{" "}
                    <span className="catalogue-licence">{entry.licence}</span>
                    {entry.remote && (
                      <>
                        {" · "}
                        <a href={sourceUrl(entry.remote)} target="_blank" rel="noreferrer" title="View the original">
                          source ↗
                        </a>
                      </>
                    )}
                  </span>
                </div>
                {entry.mine && (
                  <button
                    className="catalogue-fav"
                    aria-label="Remove from my catalogue"
                    title="Remove from my catalogue"
                    onClick={() => {
                      removeMine(entry.mine!.id);
                      setMine(listMine());
                    }}
                  >
                    ✕
                  </button>
                )}
                <button
                  className={`catalogue-fav${fav ? " is-active" : ""}`}
                  aria-label={fav ? "Remove from favourites" : "Add to favourites"}
                  aria-pressed={fav}
                  onClick={() => toggleFav(entry.key)}
                >
                  {fav ? "★" : "☆"}
                </button>
                <button className="btn btn--small btn--primary" disabled={adding !== null} onClick={() => void add(entry)}>
                  {adding === entry.key ? "Adding…" : "Add"}
                </button>
              </div>
            </article>
          );
        })}
        {results.length > shown && <div ref={moreRef} className="catalogue-more" />}
        {results.length === 0 && pending === 0 && (
          <p className="panel-hint">
            {view === "favourites"
              ? "No favourites yet: click ☆ on a component to keep it here."
              : view === "recent"
                ? "Components you add show up here."
                : view === "mine"
                  ? "Nothing saved yet: select a custom code block or a drawing and choose “Save to my catalogue” in the inspector."
                  : "Nothing matches. Try another word, fewer style chips, or import your own code."}
          </p>
        )}
        {indexFailed && <p className="panel-hint">Some libraries couldn't be loaded; showing what could be.</p>}
      </div>
      <p className="panel-hint catalogue-footnote">
        Sources:{" "}
        {CATALOGUE_LIBRARIES.map((l, i) => (
          <span key={l.name}>
            {i > 0 && ", "}
            {l.name} ({l.licence})
          </span>
        ))}
        . Library components download from GitHub when shown; Tailwind ones are compiled to plain CSS. Only MIT, ISC
        and CC0 code is included; credits stay with each component and are exported in third-party-notices.txt.
      </p>
    </>
  );
}

function ImportCode({ onAdd }: { onAdd: (props: BlockProps, size: { w: number; h: number }) => void }) {
  const [html, setHtml] = useState("");
  const [css, setCss] = useState("");
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [source, setSource] = useState("");
  const [copyright, setCopyright] = useState("");
  const [licence, setLicence] = useState("");
  const [editable, setEditable] = useState(true);
  const [tailwindChoice, setTailwindChoice] = useState<"auto" | "off" | "on" | "flowbite">("auto");

  function takeHtml(value: string) {
    const styles = [...value.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1].trim());
    if (styles.length) {
      setCss((current) => [current.trim(), ...styles].filter(Boolean).join("\n\n"));
      value = value.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").trim();
    }
    setHtml(value);
  }

  const usesTailwind = /class="[^"]*\b(flex|grid|px-\d|py-\d|text-(sm|lg|xl)|bg-[a-z]+-\d{2,3}|rounded-(md|lg|xl|full))\b/.test(html);
  const usesFlowbiteTokens = /class="[^"]*\b(bg-brand|text-heading|text-body|rounded-base|bg-neutral-(primary|secondary))/.test(html);
  const tailwind = tailwindChoice !== "auto" ? tailwindChoice : usesFlowbiteTokens ? "flowbite" : usesTailwind ? "on" : "off";
  const ready = html.trim() && licence;

  function add() {
    const clean = sanitizeHtml(html);
    const { template, slots } = editable ? extractSlots(clean) : { template: clean, slots: [] };
    const props: BlockProps = {
      html: template,
      css,
      slots: slots.map(({ key, label, kind }) => ({ key, label, kind })),
      fit: "center",
      name: name.trim() || "Imported component",
      author: author.trim(),
      source: source.trim(),
      copyright: copyright.trim(),
      licence,
      tailwind
    };
    for (const slot of slots) props[`${SLOT_PREFIX}${slot.key}`] = slot.value;
    onAdd(props, { w: 6, h: 8 });
  }

  return (
    <div className="catalogue-import">
      <p className="dialog-lead">
        Paste HTML and CSS from a library whose licence allows reuse (MIT, ISC or CC0), or your own. Scripts are
        removed and the CSS only applies inside the component.
      </p>
      <label className="field">
        <span className="field-label">HTML</span>
        <textarea className="field-code" rows={8} spellCheck={false} value={html} onChange={(e) => takeHtml(e.target.value)} placeholder={'<div class="card">…</div>'} />
      </label>
      <label className="field">
        <span className="field-label">CSS</span>
        <textarea className="field-code" rows={6} spellCheck={false} value={css} onChange={(e) => setCss(e.target.value)} placeholder=".card { … }" />
      </label>
      <label className="field">
        <span className="field-label">Tailwind classes</span>
        <select value={tailwind} onChange={(e) => setTailwindChoice(e.target.value as "off" | "on" | "flowbite")}>
          <option value="off">Off (plain CSS)</option>
          <option value="on">On: compile the Tailwind classes</option>
          <option value="flowbite">On, with Flowbite tokens (bg-brand, text-heading…)</option>
        </select>
      </label>
      {tailwindChoice === "auto" && tailwind !== "off" && (
        <p className="dialog-note">This looks like Tailwind markup, so its classes will be compiled to plain CSS.</p>
      )}
      <label className="catalogue-check">
        <input type="checkbox" checked={editable} onChange={(e) => setEditable(e.target.checked)} />
        Make its text, links and images editable in the inspector
      </label>
      <div className="catalogue-import-grid">
        <label className="field">
          <span className="field-label">Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Neon button" />
        </label>
        <label className="field">
          <span className="field-label">Author</span>
          <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Source link</span>
          <input type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder="https://…" />
        </label>
        <label className="field">
          <span className="field-label">Licence</span>
          <select value={licence} onChange={(e) => setLicence(e.target.value)}>
            <option value="">Choose…</option>
            {LICENCES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(licence === "MIT" || licence === "ISC") && (
        <label className="field">
          <span className="field-label">Copyright line (from the source's LICENSE file)</span>
          <input type="text" value={copyright} onChange={(e) => setCopyright(e.target.value)} placeholder="Copyright (c) 2024 Someone" />
        </label>
      )}
      <p className="panel-hint">No licence, or a licence that forbids reuse? Don't import it. The licence is stored with the component.</p>
      <button className="btn btn--primary" disabled={!ready} onClick={add}>
        Add to page
      </button>
    </div>
  );
}

export function CatalogueDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const addBlock = useAddBlock();
  const [tab, setTab] = useState<"browse" | "import" | "capture">("browse");

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog ref={dialogRef} className="dialog catalogue-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Component catalogue</h2>
        <div className="catalogue-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "browse"} className={tab === "browse" ? "is-active" : undefined} onClick={() => setTab("browse")}>
            Browse
          </button>
          <button role="tab" aria-selected={tab === "import"} className={tab === "import" ? "is-active" : undefined} onClick={() => setTab("import")}>
            Import code
          </button>
          <button role="tab" aria-selected={tab === "capture"} className={tab === "capture" ? "is-active" : undefined} onClick={() => setTab("capture")}>
            Capture from a website
          </button>
        </div>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      {tab === "browse" ? (
        <Browse
          onAdd={(props, size, type = "code", imported = true) => {
            addBlock(type, { props, size });
            if (imported) void rememberImport(type, props, size);
            onClose();
          }}
        />
      ) : tab === "import" ? (
        <ImportCode
          onAdd={(props, size, type = "code", imported = true) => {
            addBlock(type, { props, size });
            if (imported) void rememberImport(type, props, size);
            onClose();
          }}
        />
      ) : (
        <CaptureFromWebsite
          onAdd={(props, size) => {
            addBlock("code", { props, size });
            void rememberImport("code", props, size);
            onClose();
          }}
        />
      )}
    </dialog>
  );
}

const VERDICT_LABEL = { open: "Free to reuse, with credit", own: "Your own site (or with permission)", reference: "Reference only" } as const;

function CaptureFromWebsite({ onAdd }: { onAdd: (props: BlockProps, size: { w: number; h: number }) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [name, setName] = useState("");

  async function capture() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const got = await desktop!.captureFromWebsite(url.trim());
      if (got) {
        setResult(got);
        setName(`${got.title.split(/[|·–-]/)[0].trim() || new URL(got.url).hostname} component`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const props = useMemo<BlockProps | null>(() => {
    if (!result) return null;
    const clean = sanitizeHtml(result.html);
    const v = result.verdict;
    const doc = new DOMParser().parseFromString(`<body>${clean}</body>`, "text/html");
    const texts = Array.from(doc.body.querySelectorAll("*")).reduce((n, el) => n + Array.from(el.childNodes).filter((c) => c.nodeType === 3 && c.textContent?.trim()).length, 0);
    const { template, slots } = v.status !== "reference" && texts <= 30 ? extractSlots(clean) : { template: clean, slots: [] };
    const p: BlockProps = {
      html: template,
      css: result.css,
      slots: slots.map(({ key, label, kind }) => ({ key, label, kind })),
      fit: "center",
      name: name || "Captured component",
      author: v.author,
      source: v.source,
      licence: v.licence,
      copyright: v.copyright
    };
    for (const slot of slots) p[`${SLOT_PREFIX}${slot.key}`] = slot.value;
    return p;
  }, [result, name]);

  if (!desktop) {
    return (
      <div className="catalogue-import">
        <p className="dialog-lead">
          Capturing from a website needs the desktop app: web pages aren't allowed to open other sites. In the browser you can still paste a component's
          HTML and CSS under Import code.
        </p>
      </div>
    );
  }

  const size = result ? { w: Math.max(2, Math.min(12, Math.round(result.width / 100))), h: Math.max(2, Math.ceil(result.height / 24)) } : { w: 6, h: 8 };

  return (
    <div className="catalogue-import capture-tab">
      <p className="dialog-lead">
        Open a website, pick a component (or the whole page), and get its layout and styling as custom code to rebuild your way. Its text and pictures only
        come along when the site clearly allows reuse, or it's your own.
      </p>
      <div className="field-row">
        <input type="url" aria-label="Website address" placeholder="https://example.com/page" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && url.trim() && void capture()} />
        <button className="btn btn--primary" disabled={!url.trim() || busy} onClick={() => void capture()}>
          {busy ? "Pick in the window that opened…" : "Open and pick"}
        </button>
      </div>
      {error && <p className="dialog-note">{error}</p>}
      {result && props && (
        <>
          <div className={`capture-verdict capture-verdict--${result.verdict.status}`}>
            <strong>{VERDICT_LABEL[result.verdict.status]}</strong>
            {result.verdict.status === "open" && <span> · {result.verdict.licence}</span>}
            <p>{result.verdict.reason}</p>
            <button className="link-button" onClick={() => void desktop!.openExternal(result.url)}>
              ↗ Open the page
            </button>
          </div>
          <PreviewFrame id="capture" props={props} size={size} dark={false} />
          <p className="field-hint">
            {result.width} × {result.height} px, {result.elements} elements{result.truncated ? " (very large: only the first part was captured)" : ""}. Hover
            effects, animations and scripts don't come along; screen-size changes are captured as seen.
          </p>
          <label className="field">
            <span className="field-label">Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn btn--primary" onClick={() => onAdd(props, size)}>
            Add to page
          </button>
        </>
      )}
      <PlatformImport
        onAdd={onAdd}
        onCaptured={(got) => {
          setResult(got);
          setName(`${got.title.split(/[|·–-]/)[0].trim() || new URL(got.url).hostname} component`);
        }}
      />
    </div>
  );
}
