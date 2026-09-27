import { compile } from "tailwindcss";
import preflight from "tailwindcss/preflight.css?raw";
import theme from "tailwindcss/theme.css?raw";
import utilities from "tailwindcss/utilities.css?raw";
import flowbiteTokens from "./flowbite-tokens.css?raw";

export type TailwindPreset = "on" | "flowbite";

const FILES: Record<string, string> = {
  "tailwindcss/theme.css": theme,
  "tailwindcss/preflight.css": preflight,
  "tailwindcss/utilities.css": utilities,
  "fayteworks/flowbite-tokens.css": flowbiteTokens
};

const BASE = `
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "tailwindcss/utilities.css" layer(utilities);
@custom-variant dark (&:where(.dark, .dark *));
@custom-variant sm (@container site (width >= 40rem));
@custom-variant md (@container site (width >= 48rem));
@custom-variant lg (@container site (width >= 64rem));
@custom-variant xl (@container site (width >= 80rem));
@custom-variant 2xl (@container site (width >= 96rem));
@custom-variant max-sm (@container site (width < 40rem));
@custom-variant max-md (@container site (width < 48rem));
@custom-variant max-lg (@container site (width < 64rem));
@custom-variant max-xl (@container site (width < 80rem));
@custom-variant max-2xl (@container site (width < 96rem));
@theme inline {
  --default-font-family: var(--font-body);
  --font-body: var(--font-body);
  --font-heading: var(--font-heading);
  --radius-site: var(--radius);
  --color-site-bg: var(--bg);
  --color-site-surface: var(--surface);
  --color-site-text: var(--text);
  --color-site-muted: var(--muted);
  --color-site-accent: var(--accent);
  --color-site-accent-text: var(--accent-text);
}
@layer base {
  *, ::after, ::before, ::backdrop, ::file-selector-button { border-color: var(--color-gray-200, currentColor); }
  button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }
}
`;

function candidates(html: string): string[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const found = new Set<string>();
  for (const el of Array.from(doc.body.querySelectorAll("[class]"))) {
    for (const name of (el.getAttribute("class") ?? "").split(/\s+/)) if (name) found.add(name);
  }
  return [...found];
}

export async function compileTailwind(html: string, preset: TailwindPreset = "on"): Promise<string> {
  const input = preset === "flowbite" ? `${BASE}\n@import "fayteworks/flowbite-tokens.css";` : BASE;
  const compiler = await compile(input, {
    base: "/",
    loadStylesheet: async (id: string, base: string) => {
      const content = FILES[id];
      if (content === undefined) throw new Error(`Tailwind: can't load ${id}`);
      return { path: id, base, content };
    },
    loadModule: async () => {
      throw new Error("Tailwind plugins aren't supported here.");
    }
  });
  return compiler.build(candidates(html));
}
