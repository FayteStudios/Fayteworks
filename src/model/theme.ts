import type { CSSProperties } from "react";
import type { FieldDef } from "./fields";
import { fontCss, SYSTEM_FONTS } from "./fonts";
import type { Theme } from "./types";

export const THEME_TOKENS: { label: string; value: string; key: keyof Theme }[] = [
  { label: "Background", value: "var(--bg)", key: "background" },
  { label: "Surface", value: "var(--surface)", key: "surface" },
  { label: "Text", value: "var(--text)", key: "text" },
  { label: "Muted", value: "var(--muted)", key: "muted" },
  { label: "Accent", value: "var(--accent)", key: "accent" },
  { label: "On accent", value: "var(--accent-text)", key: "accentText" }
];

export const THEME_FIELDS: FieldDef[] = [
  { key: "background", label: "Background", kind: "color" },
  { key: "surface", label: "Surface", kind: "color" },
  { key: "text", label: "Text", kind: "color" },
  { key: "muted", label: "Muted text", kind: "color" },
  { key: "accent", label: "Accent", kind: "color" },
  { key: "accentText", label: "Text on accent", kind: "color" },
  { key: "headingFont", label: "Heading font", kind: "font" },
  { key: "bodyFont", label: "Body font", kind: "font" },
  { key: "radius", label: "Corner radius", kind: "range", min: 0, max: 40 },
  { key: "maxWidth", label: "Content width", kind: "range", min: 720, max: 1600, step: 20 }
];

export const defaultTheme: Theme = {
  background: "#e8e5df",
  surface: "#f3f1ec",
  text: "#23211e",
  muted: "#5c574f",
  accent: "#a4442a",
  accentText: "#ffffff",
  headingFont: SYSTEM_FONTS[3].value,
  bodyFont: SYSTEM_FONTS[0].value,
  radius: 14,
  maxWidth: 1200
};

export function themeVars(theme: Theme): CSSProperties {
  return {
    "--bg": theme.background,
    "--surface": theme.surface,
    "--text": theme.text,
    "--muted": theme.muted,
    "--accent": theme.accent,
    "--accent-text": theme.accentText,
    "--font-heading": fontCss(theme.headingFont),
    "--font-body": fontCss(theme.bodyFont),
    "--radius": `${theme.radius}px`,
    "--max-width": `${theme.maxWidth}px`
  } as CSSProperties;
}

export function resolveColor(value: string, theme: Theme): string {
  const token = THEME_TOKENS.find((t) => t.value === value);
  return token ? String(theme[token.key]) : value;
}
