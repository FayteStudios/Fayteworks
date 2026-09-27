import type { BlockDefinition } from "./types";
import { str } from "./util";

export const languageDefinitions: BlockDefinition[] = [
  {
    type: "languages",
    label: "Language switcher",
    category: "Navigation",
    icon: "🌐",
    description: "Links to this page in each of the site's languages. Add languages in File → Translate.",
    defaultSize: { w: 3, h: 2 },
    defaultProps: { style: "codes", align: "right" },
    fields: [
      {
        key: "style",
        label: "Show",
        kind: "select",
        options: [
          { value: "codes", label: "Short codes (EN · ES)" },
          { value: "names", label: "Names (English · Español)" }
        ]
      },
      {
        key: "align",
        label: "Align",
        kind: "select",
        options: [
          { value: "left", label: "Left" },
          { value: "center", label: "Centre" },
          { value: "right", label: "Right" }
        ]
      }
    ],
    mobileHeight: "content",
    render: (p, ctx) => {
      const langs = ctx.alternates ?? [];
      if (langs.length < 2) return ctx.isEditor ? <span className="b-service-hint">Add a second language in File → Translate.</span> : null;
      return (
        <nav className="b-languages" aria-label="Language" style={{ justifyContent: str(p.align) === "left" ? "flex-start" : str(p.align) === "center" ? "center" : "flex-end" }}>
          {langs.map((l) => (
            <a key={l.code} href={l.href} hrefLang={l.code} lang={l.code} aria-current={l.current ? "true" : undefined} className={l.current ? "is-current" : undefined}>
              {str(p.style) === "names" ? l.label : l.code.toUpperCase()}
            </a>
          ))}
        </nav>
      );
    }
  }
];
