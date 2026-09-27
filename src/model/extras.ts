import type { ComponentType, ReactNode } from "react";
import type { Page, PageShell, Section, ShellType } from "./types";

export interface ShellOption {
  value: ShellType;
  label: string;
  description: string;
}

export interface CardLayouts {
  options: ShellOption[];
  Shell: ComponentType<{ page: Page; sections: Section[]; pages: Page[] }>;
  split<T>(shell: PageShell, sections: T[]): { intro: T | null; cards: T[] };
  cardTitle(section: Section, index: number, numbers: boolean): string;
  CardAside: ComponentType<{ page: Page; section: Section; index: number; children: ReactNode }>;
  PageSettings: ComponentType<{ page: Page; mutatePage: (recipe: (p: Page) => void, key: string) => void }>;
  SectionSettings: ComponentType<{ page: Page; section: Section; mutateSection: (recipe: (s: Section) => void, key: string) => void }>;
  css: string;
  runtime: (root: Document | HTMLElement) => () => void;
}

const found = import.meta.glob<{ default: CardLayouts }>("/private/cards/index.tsx", { eager: true });

export const cardLayouts: CardLayouts | null = Object.values(found)[0]?.default ?? null;
