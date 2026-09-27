import type { ShellOption } from "./extras";
import type { FieldDef } from "./fields";
import { slugify } from "../util/slug";
import type { Page, PageShell, Section, ShellType } from "./types";

export const SHELL_OPTIONS: ShellOption[] = [
  { value: "scroll", label: "Scrolling page", description: "Sections one after another. The classic website." },
  { value: "slides", label: "Full-screen slides", description: "Each section fills the screen and snaps into place as you scroll." },
  { value: "horizontal", label: "Horizontal gallery", description: "Sections sit side by side and scroll sideways." }
];

export function shellOf(page: Page): PageShell {
  return page.shell ?? { type: "scroll" };
}

export function isCardShell(type: ShellType): boolean {
  return type === "cardRiver" || type === "cardGrid";
}

export function sectionTitle(section: Section): string {
  return section.card?.title?.trim() || section.name;
}

export function sectionAnchors(sections: Section[]): string[] {
  const used = new Set<string>();
  return sections.map((section, i) => {
    const base = slugify(section.card?.title || section.name) || `section-${i + 1}`;
    let anchor = base;
    for (let n = 2; used.has(anchor); n++) anchor = `${base}-${n}`;
    used.add(anchor);
    return anchor;
  });
}

export function shellFields(type: ShellType): FieldDef[] {
  return type === "slides" || type === "horizontal" ? [{ key: "dots", label: "Show dots to jump between sections", kind: "toggle" }] : [];
}
