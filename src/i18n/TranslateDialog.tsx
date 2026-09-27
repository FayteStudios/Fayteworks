import { useEffect, useMemo, useRef, useState } from "react";
import { parseCsv } from "../data/model";
import { useEditor } from "../state/store";
import { COMMON_LANGUAGES, isLangCode, languageLabel, mainLanguage, setEditingLang, setSiteString, siteLanguages, siteStrings, toCsv } from "./i18n";

export const OPEN_TRANSLATE = "fayteworks:open-translate";

export function TranslateDialog({ onClose }: { onClose: () => void }) {
  const { state, commit } = useEditor();
  const ref = useRef<HTMLDialogElement>(null);
  const site = state.site;
  const main = mainLanguage(site);
  const others = site.languages ?? [];
  const [lang, setLang] = useState(others[0]?.code ?? "");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [adding, setAdding] = useState("");
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  const strings = useMemo(() => (lang ? siteStrings(site, lang) : []), [site, lang]);
  const done = strings.filter((s) => s.translated.trim()).length;
  const shown = onlyMissing ? strings.filter((s) => !s.translated.trim()) : strings;

  function addLanguage(code: string) {
    if (!isLangCode(code) || code === main || others.some((l) => l.code === code)) return;
    commit((d) => void (d.languages = [...(d.languages ?? []), { code, label: languageLabel(code) }]));
    setLang(code);
    setAdding("");
  }

  function removeLanguage(code: string) {
    if (!window.confirm(`Remove ${languageLabel(code)} and its translations? You can undo this.`)) return;
    commit((d) => {
      d.languages = (d.languages ?? []).filter((l) => l.code !== code);
      for (const p of d.pages) {
        if (p.translations) delete p.translations[code];
        for (const s of p.sections) for (const b of s.blocks) if (b.translations) delete b.translations[code];
      }
      for (const s of [d.header, d.footer]) for (const b of s?.blocks ?? []) if (b.translations) delete b.translations[code];
    });
    setLang((d) => (d === code ? others.find((l) => l.code !== code)?.code ?? "" : d));
  }

  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + toCsv(strings)], { type: "text/csv" }));
    a.download = `${site.name.replace(/[^\w-]+/g, "-").toLowerCase()}-${lang}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function upload(file: File) {
    const rows = parseCsv((await file.text()).replace(/^﻿/, ""));
    const known = new Set(strings.map((s) => s.id));
    const usable = rows.filter((r) => known.has(r.id) && typeof r.translation === "string");
    commit((d) => usable.forEach((r) => setSiteString(d, lang, r.id, r.translation)));
    setMessage(`✓ ${usable.filter((r) => r.translation.trim()).length} translations brought in.`);
  }

  return (
    <dialog ref={ref} className="dialog translate-dialog" onClose={onClose} onCancel={onClose}>
      <header className="dialog-header">
        <h2>Translate</h2>
        <button className="btn btn--ghost" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="translate-langs">
        <span className="translate-main">
          Main language: <strong>{languageLabel(main)}</strong>
        </span>
        {others.map((l) => (
          <span key={l.code} className={`translate-lang${l.code === lang ? " is-current" : ""}`}>
            <button onClick={() => setLang(l.code)}>{l.label}</button>
            <button className="pages-delete" title={`Remove ${l.label}`} onClick={() => removeLanguage(l.code)}>
              ✕
            </button>
          </span>
        ))}
        <select aria-label="Add a language" value={adding} onChange={(e) => addLanguage(e.target.value)}>
          <option value="">+ Add a language…</option>
          {COMMON_LANGUAGES.filter((l) => l.code !== main && !others.some((o) => o.code === l.code)).map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      {!lang ? (
        <p className="dialog-lead">
          Add a language to publish the site in it too: the same pages under /es/, /fr/… with the words translated, and a Language switcher block so
          visitors can change. Layout, pictures and colours stay shared.
        </p>
      ) : (
        <>
          <div className="translate-tools">
            <strong>
              {done} of {strings.length} translated into {languageLabel(lang)}
            </strong>
            <label>
              <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Only what's left
            </label>
            <button className="btn btn--small" onClick={download} title="For a translator, or a translation tool like DeepL (keep the id column)">
              Download CSV
            </button>
            <button className="btn btn--small" onClick={() => fileRef.current?.click()}>
              Bring back CSV…
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => (e.target.files?.[0] && void upload(e.target.files[0]), (e.target.value = ""))} />
            <button
              className="btn btn--small btn--primary"
              onClick={() => {
                setEditingLang(lang);
                onClose();
              }}
              title="Edit the canvas in this language"
            >
              Edit on the page →
            </button>
          </div>
          {message && <p className="field-hint">{message}</p>}
          <div className="translate-table">
            {shown.map((s) => (
              <div key={s.id} className="translate-row">
                <div className="translate-original">
                  <span className="translate-where">
                    {s.where} · {s.field}
                  </span>
                  <p lang={main}>{s.original}</p>
                </div>
                {s.long ? (
                  <textarea lang={lang} rows={3} value={s.translated} placeholder={s.original} onChange={(e) => commit((d) => setSiteString(d, lang, s.id, e.target.value), `tr:${lang}:${s.id}`)} />
                ) : (
                  <input lang={lang} type="text" value={s.translated} placeholder={s.original} onChange={(e) => commit((d) => setSiteString(d, lang, s.id, e.target.value), `tr:${lang}:${s.id}`)} />
                )}
              </div>
            ))}
          </div>
          <p className="field-hint">Anything left blank shows in {languageLabel(main)}. Blog posts and lists from Data aren't translated yet.</p>
        </>
      )}
    </dialog>
  );
}

export function LanguagePicker({ value }: { value: string }) {
  const { state } = useEditor();
  const langs = siteLanguages(state.site);
  if (langs.length < 2) return null;
  return (
    <select className="topbar-lang" aria-label="Editing language" title="The language you're editing" value={value || langs[0].code} onChange={(e) => setEditingLang(e.target.value === langs[0].code ? "" : e.target.value)}>
      {langs.map((l, i) => (
        <option key={l.code} value={l.code}>
          🌐 {l.label}
          {i === 0 ? " (main)" : ""}
        </option>
      ))}
    </select>
  );
}
