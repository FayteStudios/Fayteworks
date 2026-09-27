import type { CustomFont } from "./types";

export type FontCategory = "sans" | "serif" | "display" | "mono";

export interface GoogleFont {
  family: string;
  category: FontCategory;
  weights: number[];
}

export const GOOGLE_FONT_PREFIX = "gf:";

export const SYSTEM_FONTS = [
  { value: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', label: "System Sans" },
  { value: '"Avenir Next", Avenir, "Segoe UI", "Helvetica Neue", sans-serif', label: "Geometric" },
  { value: 'ui-rounded, "SF Pro Rounded", Nunito, "Segoe UI", sans-serif', label: "Rounded" },
  { value: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif', label: "Book Serif" },
  { value: 'Georgia, "Times New Roman", serif', label: "Classic Serif" },
  { value: 'ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace', label: "Mono" }
];

const W3 = [400, 600, 700];
const W2 = [400, 700];
const W1 = [400];

export const GOOGLE_FONTS: GoogleFont[] = [
  { family: "Inter", category: "sans", weights: W3 },
  { family: "DM Sans", category: "sans", weights: W3 },
  { family: "Manrope", category: "sans", weights: W3 },
  { family: "Plus Jakarta Sans", category: "sans", weights: W3 },
  { family: "Figtree", category: "sans", weights: W3 },
  { family: "Outfit", category: "sans", weights: W3 },
  { family: "Space Grotesk", category: "sans", weights: W3 },
  { family: "Work Sans", category: "sans", weights: W3 },
  { family: "Poppins", category: "sans", weights: W3 },
  { family: "Montserrat", category: "sans", weights: W3 },
  { family: "Nunito", category: "sans", weights: W3 },
  { family: "Rubik", category: "sans", weights: W3 },
  { family: "Karla", category: "sans", weights: W3 },
  { family: "Raleway", category: "sans", weights: W3 },
  { family: "Open Sans", category: "sans", weights: W3 },
  { family: "Roboto", category: "sans", weights: [400, 500, 700] },
  { family: "Lato", category: "sans", weights: W2 },
  { family: "Source Sans 3", category: "sans", weights: W3 },
  { family: "IBM Plex Sans", category: "sans", weights: W3 },
  { family: "Josefin Sans", category: "sans", weights: W3 },
  { family: "Playfair Display", category: "serif", weights: W3 },
  { family: "Fraunces", category: "serif", weights: W3 },
  { family: "Lora", category: "serif", weights: W3 },
  { family: "EB Garamond", category: "serif", weights: W3 },
  { family: "Cormorant Garamond", category: "serif", weights: W3 },
  { family: "Crimson Pro", category: "serif", weights: W3 },
  { family: "Source Serif 4", category: "serif", weights: W3 },
  { family: "Spectral", category: "serif", weights: W3 },
  { family: "Merriweather", category: "serif", weights: W2 },
  { family: "Libre Baskerville", category: "serif", weights: W2 },
  { family: "Noto Serif", category: "serif", weights: W3 },
  { family: "DM Serif Display", category: "serif", weights: W1 },
  { family: "Bricolage Grotesque", category: "display", weights: W3 },
  { family: "Unbounded", category: "display", weights: W3 },
  { family: "Syne", category: "display", weights: W3 },
  { family: "Oswald", category: "display", weights: W3 },
  { family: "Bebas Neue", category: "display", weights: W1 },
  { family: "Anton", category: "display", weights: W1 },
  { family: "Archivo Black", category: "display", weights: W1 },
  { family: "Abril Fatface", category: "display", weights: W1 },
  { family: "Righteous", category: "display", weights: W1 },
  { family: "Lobster", category: "display", weights: W1 },
  { family: "Pacifico", category: "display", weights: W1 },
  { family: "Caveat", category: "display", weights: W2 },
  { family: "Permanent Marker", category: "display", weights: W1 },
  { family: "JetBrains Mono", category: "mono", weights: W3 },
  { family: "Fira Code", category: "mono", weights: W3 },
  { family: "IBM Plex Mono", category: "mono", weights: W3 },
  { family: "Space Mono", category: "mono", weights: W2 }
];

export const CATEGORY_LABEL: Record<FontCategory, string> = { sans: "Sans serif", serif: "Serif", display: "Display", mono: "Monospace" };

const FALLBACK: Record<FontCategory, string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  display: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: 'ui-monospace, Consolas, monospace'
};

export function isGoogleFont(value: string): boolean {
  return value.startsWith(GOOGLE_FONT_PREFIX);
}

export function googleFamily(value: string): string {
  return value.slice(GOOGLE_FONT_PREFIX.length).trim();
}

export function googleFontInfo(family: string): GoogleFont {
  return GOOGLE_FONTS.find((f) => f.family.toLowerCase() === family.toLowerCase()) ?? { family, category: "sans", weights: W1 };
}

export const CUSTOM_FONT_PREFIX = "uf:";
export const isCustomFont = (value: string) => value.startsWith(CUSTOM_FONT_PREFIX);

export const FONT_FORMATS: Record<string, CustomFont["format"]> = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };
export const FONT_MIME: Record<CustomFont["format"], string> = { woff2: "font/woff2", woff: "font/woff", truetype: "font/ttf", opentype: "font/otf" };

export function fontFaceCss(fonts: CustomFont[] | undefined, url: (src: string) => string): string {
  return (fonts ?? [])
    .map((f) => `@font-face { font-family: "${f.family.replace(/["\\]/g, "")}"; src: url("${url(f.src)}") format("${f.format}"); font-weight: 100 900; font-display: swap; }`)
    .join("\n");
}

export function fontCss(value: string): string {
  if (isCustomFont(value)) return `"${value.slice(CUSTOM_FONT_PREFIX.length).replace(/"/g, "")}", system-ui, sans-serif`;
  if (!isGoogleFont(value)) return value;
  const info = googleFontInfo(googleFamily(value));
  return `"${info.family.replace(/"/g, "")}", ${FALLBACK[info.category]}`;
}

export function fontLabel(value: string): string {
  if (isCustomFont(value)) return value.slice(CUSTOM_FONT_PREFIX.length);
  if (isGoogleFont(value)) return googleFamily(value);
  return SYSTEM_FONTS.find((f) => f.value === value)?.label ?? value.split(",")[0].replace(/"/g, "");
}

export function googleFontsCssUrl(families: GoogleFont[], text?: string): string | null {
  const unique = [...new Map(families.map((f) => [f.family, f])).values()];
  if (unique.length === 0) return null;
  const params = unique.map((f) => {
    const name = encodeURIComponent(f.family).replace(/%20/g, "+");
    return text || f.weights.length === 1 ? `family=${name}` : `family=${name}:wght@${f.weights.join(";")}`;
  });
  return `https://fonts.googleapis.com/css2?${params.join("&")}${text ? `&text=${encodeURIComponent(text)}` : ""}&display=swap`;
}

export function themeGoogleFonts(theme: { headingFont: string; bodyFont: string }): GoogleFont[] {
  return [theme.headingFont, theme.bodyFont].filter(isGoogleFont).map((v) => googleFontInfo(googleFamily(v)));
}
