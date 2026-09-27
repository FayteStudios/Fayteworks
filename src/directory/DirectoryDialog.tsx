import { useEffect, useMemo, useRef, useState } from "react";
import { createDesignPage, DESIGN_PRESETS } from "../model/design";
import { desktop } from "../platform/desktop";
import { useEditor } from "../state/store";
import { CATEGORIES, disclosure, LISTINGS, listingsIn, listingUrl, PRICE_LABEL, REGION_LABEL, type CategoryGroup, type Listing, type Region } from "./directory";

export const OPEN_DIRECTORY = "fayteworks:open-directory";

export const openDirectory = (category?: string) => window.dispatchEvent(new CustomEvent(OPEN_DIRECTORY, { detail: category }));

const open = (url: string) => (desktop ? void desktop.openExternal(url) : void window.open(url, "_blank", "noopener"));
const GROUPS: CategoryGroup[] = ["Get it made", "Sell and grow", "For your site"];

export function DirectoryDialog({ category, onClose }: { category?: string; onClose: () => void }) {
  const { state, commit, setPage } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState(CATEGORIES.some((c) => c.id === category) ? category! : CATEGORIES[0].id);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<Region | "">("");
  useEffect(() => ref.current?.showModal(), []);

  const cat = CATEGORIES.find((c) => c.id === current)!;
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const base = q ? [...LISTINGS].sort((a, b) => a.name.localeCompare(b.name)).filter((l) => `${l.name} ${l.what} ${l.categories.map((id) => CATEGORIES.find((c) => c.id === id)?.label).join(" ")}`.toLowerCase().includes(q)) : listingsIn(current);
    return region ? base.filter((l) => l.regions.includes(region) || l.regions.includes("World")) : base;
  }, [q, current, region]);

  function startDesign(presetId: string) {
    const preset = DESIGN_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const design = createDesignPage(state.site, preset, preset.label.split(" · ")[0]);
    commit((d) => void d.pages.push(design));
    setPage(design.id);
    onClose();
  }

  return (
    <dialog ref={ref} className="dialog directory-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Directory</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="directory-layout">
        <nav className="directory-nav" aria-label="Categories">
          {GROUPS.map((g) => (
            <section key={g}>
              <h3 className="panel-heading">{g}</h3>
              {CATEGORIES.filter((c) => c.group === g).map((c) => (
                <button
                  key={c.id}
                  className={!q && c.id === current ? "directory-cat is-active" : "directory-cat"}
                  onClick={() => {
                    setCurrent(c.id);
                    setQuery("");
                  }}
                >
                  <span aria-hidden>{c.icon}</span> {c.label}
                </button>
              ))}
            </section>
          ))}
        </nav>
        <div className="directory-main">
          <div className="directory-tools">
            <input type="search" aria-label="Search the directory" placeholder="Search: stickers, hoodies, zines, newsletters…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select aria-label="Where you are" value={region} onChange={(e) => setRegion(e.target.value as Region | "")}>
              <option value="">Anywhere</option>
              {(["US", "CA", "UK", "EU", "AU"] as Region[]).map((r) => (
                <option key={r} value={r}>
                  Delivers to {REGION_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          {q ? (
            <p className="dialog-lead">
              {shown.length} result{shown.length === 1 ? "" : "s"} for “{query.trim()}”.
            </p>
          ) : (
            <div className="directory-intro">
              <h3>
                <span aria-hidden>{cat.icon}</span> {cat.label}
              </h3>
              <p>{cat.blurb}</p>
              {cat.send && (
                <div className="directory-send">
                  <strong>What to send them</strong>
                  <p>{cat.send}</p>
                  {cat.presets && (
                    <select aria-label="Start a design" value="" onChange={(e) => startDesign(e.target.value)}>
                      <option value="">Start a design at the right size…</option>
                      {cat.presets.map((id) => {
                        const p = DESIGN_PRESETS.find((x) => x.id === id);
                        return p ? (
                          <option key={id} value={id}>
                            {p.label}
                          </option>
                        ) : null;
                      })}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="directory-grid">
            {shown.map((l) => (
              <ListingCard key={l.name} listing={l} showCategory={Boolean(q)} />
            ))}
            {!q && cat.group === "Get it made" && (
              <article className="directory-card directory-card--local">
                <h4>A print shop near you</h4>
                <p>Local shops check your file with you, show you real paper samples, and you can pick up the same day. Search “print shop near me”, and ask for a proof.</p>
                <div className="directory-chips">
                  <span className="directory-chip">Support small businesses</span>
                </div>
              </article>
            )}
          </div>
          {shown.length === 0 && <p className="field-hint">Nothing matches. Try another word, or “Anywhere”.</p>}
          <p className="field-hint share-footnote">{disclosure()}</p>
        </div>
      </div>
    </dialog>
  );
}

function ListingCard({ listing: l, showCategory }: { listing: Listing; showCategory: boolean }) {
  return (
    <article className="directory-card">
      <h4>{l.name}</h4>
      {showCategory && <span className="directory-card-cat">{l.categories.map((id) => CATEGORIES.find((c) => c.id === id)?.label).filter(Boolean).join(" · ")}</span>}
      <p>{l.what}</p>
      <div className="directory-chips">
        {l.price && <span className="directory-chip">{PRICE_LABEL[l.price]}</span>}
        {l.regions.map((r) => (
          <span key={r} className="directory-chip">
            {REGION_LABEL[r]}
          </span>
        ))}
      </div>
      <p className="directory-pricing">{l.pricing}</p>
      {l.use && (
        <p className="directory-use">
          <span aria-hidden>↳</span> {l.use}
        </p>
      )}
      <button className="btn btn--small" onClick={() => open(listingUrl(l))}>
        Visit {l.name.split(" / ")[0]} ↗{l.referral ? " (referral link)" : ""}
      </button>
    </article>
  );
}
