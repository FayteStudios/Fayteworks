import { FONT_MIME } from "../model/fonts";
import type { CustomFont } from "../model/types";
import { putAsset } from "../state/assets";
import { createId } from "../util/id";

export type CatalogueCategory = "serif" | "sans-serif" | "display" | "handwriting" | "monospace" | "other";

export interface CatalogueFont {
  id: string;
  family: string;
  category: CatalogueCategory;
  license: string;
  variable: boolean;
  weights: number[];
  subset: string;
}

const API = "https://api.fontsource.org/v1/fonts";
const CDN = "https://cdn.jsdelivr.net/fontsource/fonts";
const FREE = new Set(["ofl-1.1", "apache-2.0", "cc0-1.0", "mit", "unlicense", "ufl-1.0"]);

export const LICENCE_NAMES: Record<string, string> = {
  "ofl-1.1": "Open Font License",
  "apache-2.0": "Apache 2.0",
  "cc0-1.0": "Public domain (CC0)",
  mit: "MIT",
  unlicense: "Public domain (Unlicense)",
  "ufl-1.0": "Ubuntu Font Licence"
};

let list: Promise<CatalogueFont[]> | null = null;

interface ApiFont {
  id: string;
  family: string;
  category: string;
  license: string;
  variable: boolean;
  weights: number[];
  defSubset: string;
  styles: string[];
}

export function loadCatalogue(): Promise<CatalogueFont[]> {
  list ??= fetch(API)
    .then((r) => {
      if (!r.ok) throw new Error(`the font list answered ${r.status}`);
      return r.json() as Promise<ApiFont[]>;
    })
    .then((all) =>
      all
        .filter((f) => f.category !== "icons" && FREE.has(f.license.toLowerCase()) && f.styles.includes("normal") && f.weights.length > 0)
        .map((f) => ({ id: f.id, family: f.family, category: f.category as CatalogueCategory, license: f.license.toLowerCase(), variable: f.variable, weights: f.weights, subset: f.defSubset || "latin" }))
    )
    .catch((error) => {
      list = null;
      throw error;
    });
  return list;
}

const nearest = (weights: number[], target: number) => weights.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), weights[0]);

export const previewUrl = (f: CatalogueFont) => `${CDN}/${f.id}@latest/${f.subset}-${nearest(f.weights, 400)}-normal.woff2`;

export const previewFamily = (f: CatalogueFont) => `fw-preview-${f.id}`;

const loaded = new Set<string>();

export function loadPreview(f: CatalogueFont) {
  if (loaded.has(f.id)) return;
  loaded.add(f.id);
  const face = new FontFace(previewFamily(f), `url("${previewUrl(f)}") format("woff2")`, { display: "swap" });
  face.load().then(
    (ok) => document.fonts.add(ok),
    () => loaded.delete(f.id)
  );
}

async function fetchFile(url: string): Promise<Blob> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`the font file answered ${r.status}`);
  return r.blob();
}

export async function downloadCatalogueFont(f: CatalogueFont): Promise<CustomFont[]> {
  let files: { blob: Blob; weight?: number }[];
  try {
    if (!f.variable) throw new Error("static");
    files = [{ blob: await fetchFile(`${CDN}/${f.id}:vf@latest/${f.subset}-wght-normal.woff2`) }];
  } catch {
    const weights = [...new Set([nearest(f.weights, 400), nearest(f.weights, 700)])];
    files = await Promise.all(weights.map(async (weight) => ({ blob: await fetchFile(`${CDN}/${f.id}@latest/${f.subset}-${weight}-normal.woff2`), weight })));
  }
  return Promise.all(
    files.map(async ({ blob, weight }) => ({
      id: createId("font"),
      family: f.family,
      src: await putAsset(new Blob([blob], { type: FONT_MIME.woff2 })),
      format: "woff2" as const,
      licence: "commercial" as const,
      from: `Fontsource · ${LICENCE_NAMES[f.license] ?? f.license}`,
      ...(weight ? { weight } : {})
    }))
  );
}

export async function fontFromFile(file: File, family: string, format: CustomFont["format"], licence: CustomFont["licence"]): Promise<CustomFont> {
  return { id: createId("font"), family, src: await putAsset(new Blob([file], { type: FONT_MIME[format] })), format, licence };
}
