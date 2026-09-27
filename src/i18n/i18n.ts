import { useSyncExternalStore } from "react";
import { getBlockDefinition } from "../blocks/registry";
import type { FieldDef } from "../model/fields";
import type { Block, BlockProps, ListItem, Page, PropValue, Section, Site } from "../model/types";

export const COMMON_LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "nl", label: "Nederlands" },
  { code: "sv", label: "Svenska" },
  { code: "da", label: "Dansk" },
  { code: "nb", label: "Norsk" },
  { code: "fi", label: "Suomi" },
  { code: "pl", label: "Polski" },
  { code: "cs", label: "Čeština" },
  { code: "tr", label: "Türkçe" },
  { code: "el", label: "Ελληνικά" },
  { code: "ru", label: "Русский" },
  { code: "uk", label: "Українська" },
  { code: "ar", label: "العربية" },
  { code: "he", label: "עברית" },
  { code: "hi", label: "हिन्दी" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "th", label: "ไทย" }
];

export const isLangCode = (code: string) => /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(code);
export const mainLanguage = (site: Site) => (site.settings.lang || "en").trim() || "en";
export const languageLabel = (code: string) => COMMON_LANGUAGES.find((l) => l.code === code)?.label ?? code;

export function siteLanguages(site: Site): { code: string; label: string }[] {
  const main = mainLanguage(site);
  return [{ code: main, label: languageLabel(main) }, ...(site.languages ?? []).filter((l) => l.code !== main)];
}

let editing = "";
const listeners = new Set<() => void>();
export function setEditingLang(code: string) {
  editing = code;
  listeners.forEach((fn) => fn());
}
export function useEditingLang(site: Site): string {
  const code = useSyncExternalStore(
    (fn) => (listeners.add(fn), () => void listeners.delete(fn)),
    () => editing
  );
  return code && code !== mainLanguage(site) && (site.languages ?? []).some((l) => l.code === code) ? code : "";
}

const TEXT_KINDS = new Set(["text", "textarea"]);

export interface TranslatableField {
  key: string;
  label: string;
  kind: "text" | "textarea" | "list";
  itemKeys?: { key: string; label: string }[];
}

export function translatableFields(block: Block, site?: Site): TranslatableField[] {
  const def = getBlockDefinition(block.type);
  if (!def) return [];
  const fields: FieldDef[] = [...(def.extraFields?.(block.props, site) ?? []), ...def.fields];
  const out: TranslatableField[] = [];
  for (const f of fields) {
    if (TEXT_KINDS.has(f.kind)) out.push({ key: f.key, label: f.label, kind: f.kind as "text" | "textarea" });
    else if (f.kind === "list" && f.itemFields) {
      const itemKeys = f.itemFields.filter((i) => TEXT_KINDS.has(i.kind)).map((i) => ({ key: i.key, label: i.label }));
      if (itemKeys.length) out.push({ key: f.key, label: f.label, kind: "list", itemKeys });
    }
  }
  for (const t of def.inlineEdit ?? []) if (!out.some((o) => o.key === t.key)) out.push({ key: t.key, label: t.key, kind: "text" });
  return out;
}

const isWords = (v: PropValue | undefined) => typeof v === "string" && v.trim() !== "" && !/^(https?:|mailto:|asset:|data:|page:|#|var\()/.test(v.trim());

export function localizedProps(block: Block, lang: string | undefined): BlockProps {
  const t = lang ? block.translations?.[lang] : undefined;
  if (!t) return block.props;
  const out: BlockProps = { ...block.props };
  for (const [key, value] of Object.entries(t)) {
    if (Array.isArray(value) && Array.isArray(block.props[key])) {
      out[key] = (block.props[key] as ListItem[]).map((item, i) => ({ ...item, ...Object.fromEntries(Object.entries((value as ListItem[])[i] ?? {}).filter(([, v]) => v !== "")) }));
    } else if (typeof value === "string" && value !== "") out[key] = value;
  }
  return out;
}

export function writeProp(block: Block, key: string, value: PropValue, lang: string, site?: Site) {
  const field = lang ? translatableFields(block, site).find((f) => f.key === key) : undefined;
  if (!field) {
    block.props[key] = value;
    return;
  }
  const t = ((block.translations ??= {})[lang] ??= {});
  if (field.kind === "list" && Array.isArray(value)) {
    t[key] = (value as ListItem[]).map((item) => Object.fromEntries((field.itemKeys ?? []).map((k) => [k.key, item[k.key] ?? ""]))) as ListItem[];
  } else t[key] = value;
}

export const pageTitle = (page: Page, lang?: string) => (lang && page.translations?.[lang]?.title) || page.title;
export const pageDescription = (page: Page, lang?: string) => (lang && page.translations?.[lang]?.description) || page.seo.description;

export interface SiteString {
  id: string;
  where: string;
  field: string;
  original: string;
  translated: string;
  long: boolean;
}

function allSections(site: Site): { section: Section; place: string; pageId: string }[] {
  const out: { section: Section; place: string; pageId: string }[] = [];
  if (site.header) out.push({ section: site.header, place: "Header", pageId: "" });
  for (const page of site.pages.filter((p) => !p.design)) for (const s of page.sections) out.push({ section: s, place: page.title, pageId: page.id });
  if (site.footer) out.push({ section: site.footer, place: "Footer", pageId: "" });
  return out;
}

export function siteStrings(site: Site, lang: string): SiteString[] {
  const out: SiteString[] = [];
  for (const page of site.pages.filter((p) => !p.design)) {
    out.push({ id: `page:${page.id}:title`, where: page.title, field: "Page title", original: page.title, translated: page.translations?.[lang]?.title ?? "", long: false });
    if (page.seo.description) out.push({ id: `page:${page.id}:description`, where: page.title, field: "Search description", original: page.seo.description, translated: page.translations?.[lang]?.description ?? "", long: true });
  }
  for (const { section, place } of allSections(site)) {
    for (const block of section.blocks) {
      const t = block.translations?.[lang] ?? {};
      for (const f of translatableFields(block, site)) {
        if (f.kind === "list") {
          ((block.props[f.key] as ListItem[]) ?? []).forEach((item, i) => {
            for (const k of f.itemKeys ?? []) {
              if (!isWords(item[k.key] as PropValue)) continue;
              const tr = ((t[f.key] as ListItem[] | undefined)?.[i]?.[k.key] as string) ?? "";
              out.push({ id: `block:${block.id}:${f.key}:${i}:${k.key}`, where: `${place} › ${getBlockDefinition(block.type)?.label ?? block.type}`, field: `${f.label} ${i + 1}: ${k.label}`, original: String(item[k.key]), translated: tr, long: String(item[k.key]).length > 80 });
            }
          });
        } else if (isWords(block.props[f.key])) {
          out.push({ id: `block:${block.id}:${f.key}`, where: `${place} › ${getBlockDefinition(block.type)?.label ?? block.type}`, field: f.label, original: String(block.props[f.key]), translated: typeof t[f.key] === "string" ? String(t[f.key]) : "", long: f.kind === "textarea" || String(block.props[f.key]).length > 80 });
        }
      }
    }
  }
  return out;
}

export function setSiteString(site: Site, lang: string, id: string, value: string) {
  const parts = id.split(":");
  if (parts[0] === "page") {
    const page = site.pages.find((p) => p.id === parts[1]);
    if (!page) return;
    const entry = ((page.translations ??= {})[lang] ??= {});
    if (parts[2] === "title") entry.title = value;
    else entry.description = value;
    return;
  }
  const block = allSections(site)
    .flatMap((s) => s.section.blocks)
    .find((b) => b.id === parts[1]);
  if (!block) return;
  const t = ((block.translations ??= {})[lang] ??= {});
  if (parts.length === 3) t[parts[2]] = value;
  else {
    const list = ((t[parts[2]] as ListItem[] | undefined) ?? []).slice();
    const i = Number(parts[3]);
    while (list.length <= i) list.push({});
    list[i] = { ...list[i], [parts[4]]: value };
    t[parts[2]] = list;
  }
}

export function toCsv(strings: SiteString[]): string {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return ["id,where,original,translation", ...strings.map((s) => [s.id, `${s.where} · ${s.field}`, s.original, s.translated].map(cell).join(","))].join("\n");
}
